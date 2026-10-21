#!/usr/bin/env node
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpHandler, getOAuthProtectedResourceMetadataUrl, verifyBearerToken } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { loadConfig } from './config.js';
import { PgOAuthStore, OAuthStoreError } from './oauth-store.js';
import { FenixOAuthServer } from './oauth.js';
import { FenixClient } from './fenix-client.js';
import { buildMcpServer } from './server.js';
import { readRequestBody } from './http-body.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function html(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.end(body);
}

function oauthErrorBody(res, status, error, description) {
  const payload = { error };
  if (description) payload.error_description = description;
  return json(res, status, payload);
}

function tokenClientError(res, req, error) {
  const basicAuthentication = /^Basic\s+/i.test(req.headers.authorization || '');
  if (error.code === 'invalid_client' && basicAuthentication) {
    res.setHeader('WWW-Authenticate', 'Basic realm="fenix-mcp-token"');
    return oauthErrorBody(res, 401, error.code, error.message);
  }
  return oauthErrorBody(res, 400, error.code || 'invalid_request', error.message);
}

function unauthorizedChallenge(res, metadataUrl) {
  res.statusCode = 401;
  res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${metadataUrl}"`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: 'invalid_token', error_description: 'Missing or invalid access token.' }));
}

function setCors(req, res, allowedOrigins) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!allowedOrigins.includes(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Method, Mcp-Name, Mcp-Session-Id, Mcp-Protocol-Version');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate');
  return true;
}

function rateLimit(max, windowMs = 60_000) {
  const buckets = new Map();
  return (req, res, next) => {
    const address = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const previous = buckets.get(address) || [];
    const active = previous.filter((time) => now - time < windowMs);
    if (active.length >= max) return json(res, 429, { error: 'too_many_requests' });
    active.push(now);
    buckets.set(address, active);
    if (buckets.size > 5000) buckets.delete(buckets.keys().next().value);
    return next();
  };
}

function htmlFormOriginAllowed(req, publicOrigin) {
  const source = req.headers.origin;
  if (source) return source === publicOrigin;
  const referer = req.headers.referer;
  if (!referer) return false;
  try { return new URL(referer).origin === publicOrigin; } catch { return false; }
}

async function main() {
  const config = loadConfig();
  const catalog = JSON.parse(await readFile(resolve(root, 'src/frontend-endpoints.json'), 'utf8'));
  const fenixSkill = await readFile(resolve(root, 'skills/fenix/SKILL.md'), 'utf8');
  const operations = catalog.operations;
  const oauthStore = new PgOAuthStore({
    connectionString: config.oauth.databaseUrl,
    hmacKeyring: config.oauth.hmacKeyring,
    encryptionKeyring: config.oauth.encryptionKeyring,
    logger: console
  });
  await oauthStore.initialize();
  await oauthStore.pruneExpiredSessions();
  await oauthStore.pruneApiFailures();
  const sessionPruneTimer = setInterval(() => {
    Promise.all([
      oauthStore.pruneExpiredSessions().catch(() => console.error('[fenix-mcp] expired session cleanup failed')),
      oauthStore.pruneApiFailures().catch(() => console.error('[fenix-mcp] API failure cleanup failed'))
    ]);
  }, 60 * 60 * 1000);
  sessionPruneTimer.unref();

  const oauth = new FenixOAuthServer({
    publicUrl: config.oauth.publicUrl,
    store: oauthStore,
    logger: console,
    fenixVersion: config.fenix.frontendVersion,
    hcaptchaSiteKey: config.fenix.hcaptchaSiteKey
  });
  oauth.fenixLogin = async ({ email, password, hcaptchaToken, version }) => {
    return FenixClient.login({
      baseUrl: config.fenix.baseUrl,
      proxyToken: config.fenix.proxyToken,
      timeoutMs: config.fenix.timeoutMs,
      email,
      password,
      hcaptchaToken,
      version: version || config.fenix.frontendVersion
    });
  };

  const createGrantFenixClient = (grantId, session) => new FenixClient({
    ...config.fenix,
    session,
    grantId,
    onSessionUpdate: (gid, updatedSession) => oauthStore.updateSession(gid, updatedSession),
    onSessionExpired: (gid) => oauthStore.revokeGrantById(gid)
  });

  oauth.fenixKeepAlive = async ({ grantId, session }) => {
    const client = createGrantFenixClient(grantId, session);
    return client.keepAlive();
  };

  let keepAliveRunning = false;
  const runSessionKeepAlive = async () => {
    if (keepAliveRunning) return;
    keepAliveRunning = true;
    try {
      const grants = await oauthStore.listActiveGrants();
      for (const { grantId, fenix } of grants) {
        const client = createGrantFenixClient(grantId, fenix);
        await client.keepAlive().catch(() => {});
      }
    } catch {
      console.error('[fenix-mcp] Fenix session keep-alive sweep failed');
    } finally {
      keepAliveRunning = false;
    }
  };
  const keepAliveTimer = setInterval(runSessionKeepAlive, config.fenix.keepAliveIntervalMs);
  keepAliveTimer.unref();

  const verifier = {
    async verifyAccessToken(token) {
      const info = await oauth.verifyAccessToken(token);
      if (info.resource?.toString() !== oauth.resource() || !info.extra?.fenix?.cookieJar) {
        const error = new Error('Access token is not bound to this Fenix MCP resource.');
        error.name = 'OAuthError';
        error.code = 'invalid_token';
        throw error;
      }
      return info;
    }
  };
  const resourceUrl = new URL('/mcp', config.oauth.publicUrl);
  const metadataUrl = getOAuthProtectedResourceMetadataUrl(resourceUrl);
  const limiter = {
    register: rateLimit(20),
    authorizePage: rateLimit(60),
    authorize: rateLimit(10),
    token: rateLimit(60)
  };

  const httpHandler = createMcpHandler(async (context) => {
    const authInfo = context?.authInfo;
    if (!authInfo?.extra?.fenix?.cookieJar || !authInfo?.extra?.grantId) throw new Error('Validated Fenix OAuth session is missing.');
    const client = createGrantFenixClient(authInfo.extra.grantId, authInfo.extra.fenix);
    return buildMcpServer({
      client,
      operations,
      frontendVersion: catalog.source.frontendVersion,
      skillMarkdown: fenixSkill,
      failureStore: oauthStore,
      grantKey: createHash('sha256').update(authInfo.extra.grantId).digest('hex'),
      exposeSkillsExtension: context.era === 'modern'
    });
  });
  const mcpHandler = toNodeHandler(httpHandler);

  const server = createServer(async (req, res) => {
    try {
      const host = String(req.headers.host || '').toLowerCase();
      if (!config.mcp.allowedHosts.includes(host)) return json(res, 421, { error: 'misdirected_request' });
      const url = new URL(req.url || '/', `http://${host || 'localhost'}`);
      const pathname = url.pathname;
      if (pathname !== '/oauth/authorize' && !setCors(req, res, config.mcp.allowedOrigins)) return json(res, 403, { error: 'origin_not_allowed' });
      if (pathname === '/oauth/authorize' && req.method === 'OPTIONS') return json(res, 405, { error: 'method_not_allowed' });
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
      }

      if (pathname === '/healthz' && req.method === 'GET') return json(res, 200, { ok: true, service: 'fenix-mcp', frontendVersion: catalog.source.frontendVersion, operationCount: operations.length });

      if (pathname === '/.well-known/oauth-authorization-server' && req.method === 'GET') return json(res, 200, oauth.oauthMetadata());
      if (pathname === '/.well-known/oauth-protected-resource' || pathname.startsWith('/.well-known/oauth-protected-resource/')) {
        if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
        return json(res, 200, oauth.protectedResourceMetadata());
      }

      if (pathname === '/oauth/register' && req.method === 'POST') {
        return limiter.register(req, res, async () => {
          try {
            const client = await oauth.register(await readRequestBody(req, 64 * 1024));
            res.statusCode = 201;
            return json(res, 201, client);
          } catch (error) {
            if (error instanceof OAuthStoreError) return json(res, 503, { error: 'temporarily_unavailable' });
            if (error.code === 'temporarily_unavailable') return json(res, 503, { error: 'temporarily_unavailable' });
            if (error.statusCode === 413) {
              res.shouldKeepAlive = false;
              res.setHeader('Connection', 'close');
              return json(res, 413, { error: 'request_too_large' });
            }
            return oauthErrorBody(res, 400, error.code || 'invalid_client_metadata', error.message);
          }
        });
      }

      if (pathname === '/oauth/authorize') {
        if (req.method === 'GET') {
          return limiter.authorizePage(req, res, async () => {
            try {
              const result = await oauth.authorizeForm(Object.fromEntries(url.searchParams.entries()));
              return html(res, result.status || 200, result.body);
            } catch (error) {
              if (error instanceof OAuthStoreError) return html(res, 503, oauth.errorPage('temporarily_unavailable', 'O serviço de autorização está temporariamente indisponível. Tente novamente.').body);
              throw error;
            }
          });
        }
        if (req.method === 'POST') {
          if (!htmlFormOriginAllowed(req, config.oauth.publicUrl)) return json(res, 403, { error: 'origin_not_allowed' });
          return limiter.authorize(req, res, async () => {
            try {
              const result = await oauth.authorizeSubmit(await readRequestBody(req, 64 * 1024));
              if (result.type === 'redirect') {
                res.statusCode = 302;
                res.setHeader('Location', result.location);
                res.setHeader('Cache-Control', 'no-store');
                return res.end();
              }
              return html(res, result.status || 400, result.body);
            } catch (error) {
              if (error instanceof OAuthStoreError) return html(res, 503, oauth.errorPage('temporarily_unavailable', 'O serviço de autorização está temporariamente indisponível. Tente novamente.').body);
              if (error.statusCode === 413) {
                res.shouldKeepAlive = false;
                res.setHeader('Connection', 'close');
                return html(res, 413, oauth.errorPage('invalid_request', 'A solicitação excede o limite permitido.').body);
              }
              console.error(`[fenix-mcp] OAuth authorization error (${error.code || error.name || 'error'})`);
              return html(res, 500, oauth.errorPage('server_error', 'Não foi possível concluir a autorização. Tente novamente.').body);
            }
          });
        }
        return json(res, 405, { error: 'method_not_allowed' });
      }

      if (pathname === '/oauth/token' && req.method === 'POST') {
        return limiter.token(req, res, async () => {
          let tokenBody;
          try {
            tokenBody = await readRequestBody(req, 64 * 1024);
            const tokens = await oauth.token(tokenBody, req.headers);
            return json(res, 200, tokens);
          } catch (error) {
            if (error instanceof OAuthStoreError) return json(res, 503, { error: 'temporarily_unavailable' });
            if (error.statusCode === 413) {
              res.shouldKeepAlive = false;
              res.setHeader('Connection', 'close');
              return json(res, 413, { error: 'request_too_large' });
            }
            console.error(`[fenix-mcp] OAuth token error (${error.code || 'invalid_request'})`);
            return tokenClientError(res, req, error);
          }
        });
      }

      if (pathname === '/oauth/revoke' && req.method === 'POST') {
        return limiter.token(req, res, async () => {
          try {
            await oauth.revoke(await readRequestBody(req, 64 * 1024), req.headers);
            return json(res, 200, {});
          } catch (error) {
            if (error instanceof OAuthStoreError) return json(res, 503, { error: 'temporarily_unavailable' });
            if (error.statusCode === 413) {
              res.shouldKeepAlive = false;
              res.setHeader('Connection', 'close');
              return json(res, 413, { error: 'request_too_large' });
            }
            if (error.code === 'invalid_client' && /^Basic\s+/i.test(req.headers.authorization || '')) {
              res.setHeader('WWW-Authenticate', 'Basic realm="fenix-mcp-token"');
              return oauthErrorBody(res, 401, error.code, error.message);
            }
            return oauthErrorBody(res, error.code === 'invalid_client' ? 401 : 400, error.code || 'invalid_request', error.message);
          }
        });
      }

      if (pathname !== config.mcp.path) return json(res, 404, { error: 'not_found' });
      if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') return json(res, 405, { error: 'method_not_allowed' });

      try {
        req.auth = await verifyBearerToken(req.headers.authorization, { verifier, expectedResource: resourceUrl });
      } catch (error) {
        if (error instanceof OAuthStoreError) throw error;
        return unauthorizedChallenge(res, metadataUrl);
      }
      await mcpHandler(req, res);
    } catch (error) {
      if (error instanceof OAuthStoreError) console.error('[fenix-mcp] OAuth database unavailable');
      else console.error(`[fenix-mcp] HTTP handler error (${error?.name || 'Error'})`);
      if (!res.headersSent) json(res, 500, { error: 'internal_server_error' });
      else res.end();
    }
  });

  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;

  server.listen(config.mcp.port, config.mcp.host, () => {
    console.error(`[fenix-mcp] HTTP listening on ${config.mcp.host}:${config.mcp.port}/mcp`);
    console.error(`[fenix-mcp] OAuth issuer=${config.oauth.publicUrl}; endpoints=${operations.length}; Fenix base=${config.fenix.baseUrl}`);
  });

  const shutdown = () => server.close(async () => {
    clearInterval(sessionPruneTimer);
    clearInterval(keepAliveTimer);
    await httpHandler.close().catch(() => {});
    await oauthStore.close().catch(() => {});
    process.exit(0);
  });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  const storeUnavailable = error instanceof OAuthStoreError;
  console.error(storeUnavailable ? '[fenix-mcp] OAuth database/schema unavailable' : `[fenix-mcp] startup failed (${error?.name || 'Error'})`);
  process.exitCode = 1;
});

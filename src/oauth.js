import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { Agent, request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { OAuthStoreError, OAuthStoreOperationError } from './oauth-store.js';
import { sha256Hex } from './oauth-crypto.js';

// OAuth 2.1 authorization server for the Fenix MCP server.
//
// Supports both client registration mechanisms defined by the MCP authorization spec:
//   * Dynamic Client Registration (RFC 7591) via POST /oauth/register.
//   * Client ID Metadata Document — the client_id is a URL to a client metadata
//     document (used by clients such as ChatGPT and Claude). The server fetches
//     it to learn the client's redirect_uris, token_endpoint_auth_method and jwks_uri.
//
// Token endpoint client authentication supports client_secret_post/basic, none,
// and private_key_jwt (RFC 7523) — the latter verifies an RS256 client assertion
// against the client's JWKS.
//
// In every flow the result is an access token bound to a set of Fenix credentials.
// OAuth grants and client registration are persisted in PostgreSQL.
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h
const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 min
const DOC_TIMEOUT_MS = 10_000;
const MAX_METADATA_BYTES = 5 * 1024;
const MAX_JWKS_BYTES = 64 * 1024;
const MAX_OAUTH_METADATA_CACHE_ENTRIES = 500;

function cacheSetBounded(cache, key, value) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_OAUTH_METADATA_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

function rand(len) {
  return randomBytes(len).toString('base64url');
}

function sha256Base64url(value) {
  return createHash('sha256').update(value).digest('base64url');
}

function b64urlToBuffer(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function parseJwt(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw oauthError('invalid_client', 'Malformed client assertion.');
  const [h, p, s] = parts;
  return {
    header: JSON.parse(b64urlToBuffer(h).toString('utf8')),
    payload: JSON.parse(b64urlToBuffer(p).toString('utf8')),
    signingInput: `${h}.${p}`,
    signature: b64urlToBuffer(s)
  };
}

function basicClientCredentials(headers) {
  const match = /^Basic\s+([^\s]+)$/i.exec(headers.authorization || '');
  if (!match) return null;
  let decoded;
  try { decoded = Buffer.from(match[1], 'base64').toString('utf8'); } catch { return null; }
  const separator = decoded.indexOf(':');
  if (separator < 0) return null;
  const decodeFormValue = (value) => {
    try { return decodeURIComponent(value.replace(/\+/g, ' ')); }
    catch { return null; }
  };
  const clientId = decodeFormValue(decoded.slice(0, separator));
  const clientSecret = decodeFormValue(decoded.slice(separator + 1));
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function requestClientId(body, headers) {
  if (/^Basic\b/i.test(headers.authorization || '')) return basicClientCredentials(headers)?.clientId || null;
  return typeof body.client_id === 'string' ? body.client_id : null;
}

export function oauthError(error, errorDescription) {
  const err = new Error(errorDescription || error);
  err.name = 'OAuthError';
  err.code = error;
  return err;
}

export class FenixOAuthServer {
  constructor({ publicUrl, store, logger = console, fetchRemoteJson = fetchBoundedJson, fenixVersion = '2.19.1', hcaptchaSiteKey = 'e94868de-18ba-4314-b0ce-c7c84a1440b6' }) {
    this.base = new URL(publicUrl);
    this.store = store;
    this.logger = logger;
    this.fetchRemoteJson = fetchRemoteJson;
    this.fenixVersion = fenixVersion;
    this.hcaptchaSiteKey = hcaptchaSiteKey;
    this.clientDocs = new Map(); // URL -> { client, sha256 }
    this.jwksCache = new Map(); // URL + expected digest -> { jwks, sha256 }
  }

  get issuer() {
    return this.base.origin;
  }

  url(path) {
    return new URL(path, this.base).toString();
  }

  resource() {
    return this.url('/mcp');
  }

  // RFC 8414 authorization server metadata.
  oauthMetadata() {
    return {
      issuer: this.issuer,
      authorization_endpoint: this.url('/oauth/authorize'),
      token_endpoint: this.url('/oauth/token'),
      revocation_endpoint: this.url('/oauth/revoke'),
      registration_endpoint: this.url('/oauth/register'),
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'private_key_jwt', 'none'],
      revocation_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'private_key_jwt', 'none'],
      token_endpoint_auth_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['offline_access'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true
    };
  }

  // RFC 9728 protected resource metadata.
  protectedResourceMetadata() {
    return {
      resource: this.resource(),
      authorization_servers: [this.issuer],
      scopes_supported: [],
      bearer_methods_supported: ['header']
    };
  }

  // RFC 7591 Dynamic Client Registration.
  async register(body = {}) {
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    if (!redirectUris.length || redirectUris.length > 16) throw oauthError('invalid_redirect_uri', 'redirect_uris must contain between 1 and 16 entries');
    for (const value of redirectUris) validateRedirectUri(value);
    const authMethod = body.token_endpoint_auth_method || 'client_secret_basic';
    const allowedAuthMethods = ['none', 'client_secret_post', 'client_secret_basic', 'private_key_jwt'];
    if (!allowedAuthMethods.includes(authMethod)) throw oauthError('invalid_client_metadata', 'Unsupported token_endpoint_auth_method');
    if (authMethod === 'private_key_jwt') {
      try { validateRemoteHttpsUrl(body.jwks_uri, { requirePath: true }); }
      catch { throw oauthError('invalid_client_metadata', 'private_key_jwt requires a public HTTPS jwks_uri'); }
      if ((body.token_endpoint_auth_signing_alg || 'RS256') !== 'RS256') throw oauthError('invalid_client_metadata', 'Only RS256 client assertions are supported');
    }
    const grantTypes = body.grant_types || ['authorization_code', 'refresh_token'];
    const responseTypes = body.response_types || ['code'];
    if (!Array.isArray(grantTypes) || !grantTypes.includes('authorization_code') || grantTypes.some((value) => !['authorization_code', 'refresh_token'].includes(value))) {
      throw oauthError('invalid_client_metadata', 'Only authorization_code and refresh_token grants are supported');
    }
    if (!Array.isArray(responseTypes) || responseTypes.length !== 1 || responseTypes[0] !== 'code') {
      throw oauthError('invalid_client_metadata', 'Only the code response type is supported');
    }
    const now = Math.floor(Date.now() / 1000);
    const client = {
      client_id: `fenix_${rand(16)}`,
      ...(authMethod === 'none' ? {} : { client_secret: rand(32) }),
      client_id_issued_at: now,
      client_secret_expires_at: 0,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: authMethod,
      token_endpoint_auth_methods_supported: [authMethod],
      jwks_uri: body.jwks_uri || '',
      token_endpoint_auth_signing_alg: body.token_endpoint_auth_signing_alg || 'RS256',
      grant_types: grantTypes,
      response_types: responseTypes,
      client_name: body.client_name || '',
      client_uri: body.client_uri || '',
      logo_uri: body.logo_uri || '',
      scope: body.scope || '',
      contacts: body.contacts || []
    };
    const registeredClientKey = await this.store.registerClient({
      clientId: client.client_id,
      kind: 'dcr',
      data: Object.fromEntries(Object.entries(client).filter(([key]) => key !== 'client_secret')),
      clientSecret: client.client_secret
    });
    if (!registeredClientKey) throw oauthError('temporarily_unavailable', 'OAuth client capacity has been reached.');
    this.logger.info(`[fenix-mcp] OAuth client registered (${authMethod})`);
    return client;
  }

  // Resolve a client_id that may be a DCR-registered id OR a Client ID Metadata
  // Document URL.
  async resolveClient(clientId) {
    if (!clientId) return null;
    const stored = await this.store.findClient(clientId);
    if (stored && stored.client_kind !== 'metadata_document') return stored;
    if (/^https:\/\//i.test(clientId)) return this.fetchClientMetadataDocument(clientId);
    return null;
  }

  async fetchClientMetadataDocument(url) {
    let parsedUrl;
    try {
      parsedUrl = validateRemoteHttpsUrl(url, { requirePath: true });
    } catch (error) {
      this.logger.error(`[fenix-mcp] oauth: rejected metadata client ref=${sha256Hex(url).slice(0, 12)} reason=${error.message}`);
      return null;
    }

    const approval = await this.store.metadataApproval(url);
    const clientKey = approval?.clientKey || this.store.clientKey(url);
    if (approval?.blocked) return null;
    const cached = this.clientDocs.get(url);
    if (cached && approval && cached.sha256 === approval.documentSha256) {
      const jwks = await this.fetchJwksWithDigest(cached.client.jwks_uri, approval.jwksSha256);
      if (jwks !== null) return { ...cached.client, client_key: clientKey, client_kind: 'metadata_document' };
      return null;
    }

    let fetched;
    try {
      fetched = await this.fetchRemoteJson(parsedUrl, MAX_METADATA_BYTES);
    } catch (error) {
      this.logger.error(`[fenix-mcp] oauth: metadata fetch failed ref=${sha256Hex(url).slice(0, 12)} reason=${error.message}`);
      return null;
    }
    const doc = fetched.value;
    if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.client_id !== url || !Array.isArray(doc.redirect_uris)) {
      this.logger.error(`[fenix-mcp] oauth: invalid metadata document ref=${sha256Hex(url).slice(0, 12)}`);
      return null;
    }
    try { for (const redirectUri of doc.redirect_uris) validateRedirectUri(redirectUri); }
    catch {
      this.logger.error(`[fenix-mcp] oauth: invalid metadata redirect URI ref=${sha256Hex(url).slice(0, 12)}`);
      return null;
    }
    const metadataGrantTypes = doc.grant_types || ['authorization_code', 'refresh_token'];
    const metadataResponseTypes = doc.response_types || ['code'];
    if (!Array.isArray(metadataGrantTypes) || !metadataGrantTypes.includes('authorization_code') ||
        metadataGrantTypes.some((grant) => typeof grant !== 'string' || !grant) ||
        !Array.isArray(metadataResponseTypes) || !metadataResponseTypes.includes('code') ||
        metadataResponseTypes.some((responseType) => typeof responseType !== 'string' || !responseType)) {
      this.logger.error(`[fenix-mcp] oauth: unsupported metadata grants or response types ref=${sha256Hex(url).slice(0, 12)}`);
      return null;
    }
    const metadataAuthMethod = doc.token_endpoint_auth_method || 'none';
    if (!['none', 'private_key_jwt'].includes(metadataAuthMethod)) return null;
    if (metadataAuthMethod === 'private_key_jwt' && (doc.token_endpoint_auth_signing_alg || 'RS256') !== 'RS256') return null;
    if (metadataAuthMethod === 'private_key_jwt' && !doc.jwks_uri) return null;
    const client = {
      client_id: url,
      client_secret: undefined,
      redirect_uris: doc.redirect_uris,
      token_endpoint_auth_method: metadataAuthMethod,
      token_endpoint_auth_methods_supported: [metadataAuthMethod],
      token_endpoint_auth_signing_alg: doc.token_endpoint_auth_signing_alg || 'RS256',
      jwks_uri: doc.jwks_uri || '',
      // A client may declare extension grants/response types that this server
      // does not implement. Keep only the capabilities used by this MCP flow.
      grant_types: metadataGrantTypes.filter((grant) => ['authorization_code', 'refresh_token'].includes(grant)),
      response_types: ['code'],
      client_name: doc.client_name || ''
    };
    let jwks = null;
    if (client.jwks_uri) {
      try { jwks = await this.fetchJsonDocument(client.jwks_uri, MAX_JWKS_BYTES); }
      catch (error) {
        this.logger.error(`[fenix-mcp] oauth: rejected JWKS URL ref=${sha256Hex(url).slice(0, 12)} reason=${error.message}`);
        return null;
      }
      if (!jwks) return null;
    }
    const jwksDigest = jwks?.sha256 || '';
    if (approval && (approval.documentSha256 !== fetched.sha256 || approval.jwksUri !== client.jwks_uri || approval.jwksSha256 !== jwksDigest)) {
      this.logger.error(`[fenix-mcp] oauth: metadata fingerprint mismatch ref=${sha256Hex(url).slice(0, 12)}`);
      return null;
    }
    const registration = await this.store.registerMetadata({
      clientId: url,
      client,
      documentSha256: fetched.sha256,
      jwksSha256: jwksDigest
    });
    if (!registration.approved) return null;
    cacheSetBounded(this.clientDocs, url, { client, sha256: fetched.sha256 });
    if (jwks) cacheSetBounded(this.jwksCache, `${client.jwks_uri}\n${jwksDigest}`, jwks);
    return { ...client, client_key: registration.clientKey, client_kind: 'metadata_document' };
  }

  async fetchJwks(uri) {
    if (!uri) return null;
    const approval = null;
    return this.fetchJwksWithDigest(uri, approval);
  }

  async fetchJwksWithDigest(uri, expectedSha256) {
    if (!uri) return expectedSha256 ? null : { keys: [] };
    const cacheKey = `${uri}\n${expectedSha256 || ''}`;
    const cached = this.jwksCache.get(cacheKey);
    if (cached && (!expectedSha256 || cached.sha256 === expectedSha256)) return cached.value;
    try {
      const fetched = await this.fetchJsonDocument(uri, MAX_JWKS_BYTES);
      if (!fetched || (expectedSha256 && fetched.sha256 !== expectedSha256)) return null;
      cacheSetBounded(this.jwksCache, cacheKey, fetched);
      return fetched.value;
    } catch (error) {
      this.logger.error(`[fenix-mcp] oauth: failed to fetch JWKS ref=${sha256Hex(uri).slice(0, 12)} reason=${error.message}`);
      return null;
    }
  }

  async fetchJsonDocument(uri, maxBytes) {
    const remote = validateRemoteHttpsUrl(uri);
    try {
      return await this.fetchRemoteJson(remote, maxBytes);
    } catch (error) {
      this.logger.error(`[fenix-mcp] oauth: remote JSON fetch failed ref=${sha256Hex(uri).slice(0, 12)} reason=${error.message}`);
      return null;
    }
  }

  // RFC 7523 private_key_jwt client authentication.
  async verifyPrivateKeyJwt(client, assertion) {
    const { header, payload, signingInput, signature } = parseJwt(assertion);
    const alg = client.token_endpoint_auth_signing_alg || 'RS256';
    if (header.alg !== alg) throw oauthError('invalid_client', `Unexpected assertion alg ${header.alg}.`);

    const approval = client.client_kind === 'metadata_document'
      ? await this.store.metadataApproval(client.client_id)
      : null;
    if (client.client_kind === 'metadata_document' && (!approval || approval.blocked)) {
      throw oauthError('invalid_client', 'Client metadata is not approved.');
    }
    const jwks = client.client_kind === 'metadata_document'
      ? await this.fetchJwksWithDigest(client.jwks_uri, approval.jwksSha256)
      : await this.fetchJwks(client.jwks_uri);
    const keys = jwks?.keys || [];
    const key = keys.find((k) => k.kid === header.kid) || (keys.length === 1 ? keys[0] : null);
    if (!key) throw oauthError('invalid_client', 'No matching key in client JWKS.');

    let publicKey;
    try {
      publicKey = createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: 'jwk' });
    } catch {
      throw oauthError('invalid_client', 'Invalid client JWKS key.');
    }
    if (!cryptoVerify('RSA-SHA256', Buffer.from(signingInput), publicKey, signature)) {
      throw oauthError('invalid_client', 'Invalid client assertion signature.');
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== client.client_id || payload.sub !== client.client_id) {
      throw oauthError('invalid_client', 'Assertion iss/sub must match the client_id.');
    }
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(this.url('/oauth/token')) && !auds.includes(this.issuer)) {
      throw oauthError('invalid_client', 'Assertion aud does not match the token endpoint.');
    }
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= now) throw oauthError('invalid_client', 'Assertion expired or invalid.');
    if (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf > now)) throw oauthError('invalid_client', 'Assertion not yet valid.');
    if (payload.exp > now + 300 || typeof payload.jti !== 'string' || payload.jti.length < 8 || payload.jti.length > 256) {
      throw oauthError('invalid_client', 'Assertion requires a short expiry and a unique jti.');
    }
    if (!await this.store.claimClientAssertion(client.client_key, payload.jti, payload.exp)) {
      throw oauthError('invalid_client', 'Client assertion was already used.');
    }
    return payload;
  }

  async authenticateClient(body, headers, client) {
    const method = client.token_endpoint_auth_method || 'none';
    const basicHeader = /^Basic\b/i.test(headers.authorization || '');
    const basic = basicClientCredentials(headers);

    // RFC 7523 private_key_jwt (client_assertion present).
    if (body.client_assertion !== undefined) {
      if (method !== 'private_key_jwt' || basicHeader || body.client_secret !== undefined) {
        throw oauthError('invalid_client', 'Client authentication method does not match registration.');
      }
      const type = body.client_assertion_type;
      if (type !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer') throw oauthError('invalid_client', 'Unsupported client_assertion_type.');
      await this.verifyPrivateKeyJwt(client, body.client_assertion);
      return client;
    }

    // client_secret_post / client_secret_basic.
    if (basicHeader) {
      if (method !== 'client_secret_basic' || body.client_secret !== undefined || !basic || basic.clientId !== client.client_id ||
          (body.client_id !== undefined && body.client_id !== client.client_id) || !this.store.verifyClientSecret(client, basic.clientSecret)) {
        throw oauthError('invalid_client', 'Invalid client credentials.');
      }
      return client;
    }
    if (body.client_secret !== undefined) {
      if (method !== 'client_secret_post' || body.client_id !== client.client_id || !this.store.verifyClientSecret(client, body.client_secret)) {
        throw oauthError('invalid_client', 'Invalid client credentials.');
      }
      return client;
    }

    // Public client (PKCE only) — no client authentication material sent.
    if (method === 'none' && (!body.client_id || body.client_id === client.client_id)) return client;
    throw oauthError('invalid_client', 'Client authentication required.');
  }

  // GET /oauth/authorize -> HTML login form.
  async authorizeForm(query) {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, resource, response_type, scope } = query;
    const client = await this.resolveClient(client_id);
    if (!client) return { type: 'html', status: 400, body: this.errorPage('invalid_client', 'Unknown client_id.').body };
    if (!client.redirect_uris.includes(redirect_uri)) return { type: 'html', status: 400, body: this.errorPage('invalid_request', 'redirect_uri is not registered for this client.').body };
    if (resource !== this.resource()) return { type: 'html', status: 400, body: this.errorPage('invalid_resource', 'The exact Fenix MCP resource URI is required.').body };
    if (response_type !== 'code') return { type: 'html', status: 400, body: this.errorPage('unsupported_response_type', 'Only the authorization code response type is supported.').body };
    if (scope && scope.split(/\s+/).filter(Boolean).some((value) => value !== 'offline_access')) {
      return { type: 'html', status: 400, body: this.errorPage('invalid_scope', 'Only the offline_access scope is supported.').body };
    }
    if (scope?.split(/\s+/).includes('offline_access') && !client.grant_types?.includes('refresh_token')) {
      return { type: 'html', status: 400, body: this.errorPage('invalid_scope', 'This OAuth client is not registered for refresh tokens.').body };
    }
    if (typeof code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code_challenge) || code_challenge_method !== 'S256') return { type: 'html', status: 400, body: this.errorPage('invalid_request', 'A valid PKCE S256 challenge is required.').body };

    const html = `<!doctype html>
<html lang="pt-br">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fenix MCP — Login</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  form{background:#1e293b;padding:2rem;border-radius:12px;width:320px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
  h1{font-size:1.15rem;margin:0 0 .5rem}
  p{font-size:.8rem;color:#94a3b8;margin:0 0 1rem}
  label{font-size:.8rem;color:#94a3b8}
  input{width:100%;box-sizing:border-box;margin:.25rem 0 1rem;padding:.55rem;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0}
  button{width:100%;padding:.6rem;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer}
  .client{color:#e2e8f0;font-weight:600}.captcha{margin:0 0 1rem}
</style></head>
<body>
<form method="post" action="/oauth/authorize">
  <h1>Conectar ao Fênix</h1>
  <p>O aplicativo <span class="client">${escapeHtml(client.client_name || 'Cliente OAuth')}</span> solicita acesso à sua conta do Fênix.</p>
  <input type="hidden" name="client_id" value="${escapeHtml(client_id)}">
  <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}">
  <input type="hidden" name="state" value="${escapeHtml(state || '')}">
  <input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge)}">
  <input type="hidden" name="code_challenge_method" value="${escapeHtml(code_challenge_method)}">
  <input type="hidden" name="response_type" value="code">
  <input type="hidden" name="resource" value="${escapeHtml(resource)}">
  <input type="hidden" name="hcaptcha_token" id="hcaptcha-token" required>
  <label>Email</label>
  <input type="email" name="email" autocomplete="username" required>
  <label>Senha do Fênix</label>
  <input type="password" name="password" autocomplete="current-password" required>
  <div class="captcha"><div class="h-captcha" data-sitekey="${escapeHtml(this.hcaptchaSiteKey)}" data-callback="fenixCaptcha" data-expired-callback="fenixCaptchaExpired"></div></div>
  <button type="submit">Entrar e autorizar</button>
</form>
<script>function fenixCaptcha(token){document.getElementById('hcaptcha-token').value=token}function fenixCaptchaExpired(){document.getElementById('hcaptcha-token').value=''}<\/script>
<script src="https://js.hcaptcha.com/1/api.js" async defer></script>
</body></html>`;
    return { type: 'html', body: html };
  }

  errorPage(error, description) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Erro</title></head><body style="font-family:system-ui;padding:2rem"><h2>Erro de autorização</h2><p><strong>${escapeHtml(error)}</strong></p><p>${escapeHtml(description)}</p></body></html>`;
    return { type: 'html', body: html, status: 400 };
  }

  // POST /oauth/authorize -> validate Fenix credentials, issue code, redirect.
  async authorizeSubmit(body) {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, resource, response_type, email, password, hcaptcha_token } = body;
    const client = await this.resolveClient(client_id);
    if (!client) return { type: 'html', status: 400, body: this.errorPage('invalid_client', 'Unknown client_id.').body };
    if (!client.redirect_uris.includes(redirect_uri)) return { type: 'html', status: 400, body: this.errorPage('invalid_request', 'redirect_uri is not registered.').body };
    if (resource !== this.resource()) return { type: 'html', status: 400, body: this.errorPage('invalid_resource', 'The exact Fenix MCP resource URI is required.').body };
    if (response_type !== 'code') return { type: 'html', status: 400, body: this.errorPage('unsupported_response_type', 'Only the authorization code response type is supported.').body };
    const requestedScopes = typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : [];
    if (requestedScopes.some((value) => value !== 'offline_access') ||
        (requestedScopes.includes('offline_access') && !client.grant_types?.includes('refresh_token'))) {
      return { type: 'html', status: 400, body: this.errorPage('invalid_scope', 'Only offline_access is supported when the client is registered for refresh tokens.').body };
    }
    if (typeof code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code_challenge) || code_challenge_method !== 'S256') return { type: 'html', status: 400, body: this.errorPage('invalid_request', 'A valid PKCE S256 challenge is required.').body };
    if (typeof email !== 'string' || !email.trim() || email.length > 320 || typeof password !== 'string' || !password || password.length > 1024 || typeof hcaptcha_token !== 'string' || !hcaptcha_token || hcaptcha_token.length > 20_000) {
      return { type: 'html', status: 400, body: this.errorPage('invalid_request', 'Email, senha e confirmação hCaptcha são obrigatórios.').body };
    }

    let session;
    try {
      session = await this.fenixLogin?.({ email: email.trim(), password, hcaptchaToken: hcaptcha_token, version: this.fenixVersion });
    } catch {
      this.logger.warn('[fenix-mcp] Fenix upstream login unavailable');
      return { type: 'html', status: 503, body: this.errorPage('temporarily_unavailable', 'O serviço Fênix não respondeu. Tente novamente em alguns instantes.').body };
    }
    if (!session?.authenticated || !session?.cookieJar) {
      this.logger.warn('[fenix-mcp] OAuth upstream login failed');
      return { type: 'html', status: 401, body: this.errorPage('access_denied', 'Não foi possível entrar no Fênix. Verifique os dados e o hCaptcha e tente novamente.').body };
    }
    this.logger.info('[fenix-mcp] OAuth upstream session established');

    const code = rand(32);
    const now = Date.now();
    const nowIso = new Date().toISOString();
    try {
      await this.store.insertCode({
        code,
        clientKey: client.client_key,
        redirectUri: redirect_uri,
        codeChallenge: code_challenge,
        codeChallengeMethod: 'S256',
        resource,
        fenix: { cookieJar: session.cookieJar, authenticatedAt: nowIso, lastKeepAliveAt: nowIso },
        expiresAt: now + AUTH_CODE_TTL_MS
      });
    } catch (error) {
      if (error instanceof OAuthStoreOperationError) throw oauthError('invalid_client', 'Client authorization is revoked.');
      throw error;
    }

    const target = new URL(redirect_uri);
    target.searchParams.set('code', code);
    if (state) target.searchParams.set('state', state);
    target.searchParams.set('iss', this.issuer);
    return { type: 'redirect', location: target.toString() };
  }

  // POST /oauth/token.
  async token(body, headers) {
    const grantType = body.grant_type;
    if (grantType === 'authorization_code') return this.tokenFromCode(body, headers);
    if (grantType === 'refresh_token') return this.tokenFromRefresh(body, headers);
    throw oauthError('unsupported_grant_type', `Unsupported grant_type: ${grantType}`);
  }

  async revoke(body, headers) {
    const clientId = requestClientId(body, headers);
    const client = await this.resolveClient(clientId);
    if (!client) throw oauthError('invalid_client', 'Unknown client_id.');
    await this.authenticateClient(body, headers, client);
    if (typeof body.token !== 'string' || !body.token) throw oauthError('invalid_request', 'token is required.');
    await this.store.revokeGrantForToken(body.token, client.client_key);
    return {};
  }

  async tokenFromCode(body, headers) {
    const client = await this.resolveClient(requestClientId(body, headers));
    if (!client) throw oauthError('invalid_client', 'Unknown client_id.');
    await this.authenticateClient(body, headers, client);
    const code = body.code ? await this.store.peekCode(body.code) : null;
    if (!code || code.client_key !== client.client_key || code.revoked_at || code.consumed_at || new Date(code.expires_at).getTime() <= Date.now()) {
      throw oauthError('invalid_grant', 'Invalid or expired authorization code.');
    }
    if (body.resource !== this.resource() || code.resource !== this.resource()) throw oauthError('invalid_grant', 'resource does not match the authorization request.');
    if (body.redirect_uri !== undefined && body.redirect_uri !== code.redirect_uri) throw oauthError('invalid_grant', 'redirect_uri mismatch.');

    const method = code.code_challenge_method || 'S256';
    if (method === 'S256') {
      if (typeof body.code_verifier !== 'string' || body.code_verifier.length < 43 || body.code_verifier.length > 128 || !/^[A-Za-z0-9._~-]+$/.test(body.code_verifier) || sha256Base64url(body.code_verifier) !== code.code_challenge) {
        throw oauthError('invalid_grant', 'PKCE verification failed.');
      }
    } else if (body.code_verifier !== code.code_challenge) {
      throw oauthError('invalid_grant', 'PKCE verification failed.');
    }

    try {
      return await this.store.redeemCode({
        code: body.code,
        clientKey: client.client_key,
        codeChallengeMethod: code.code_challenge_method,
        codeChallenge: code.code_challenge,
        redirectUri: body.redirect_uri || code.redirect_uri,
        issueRefresh: Array.isArray(client.grant_types) && client.grant_types.includes('refresh_token')
      });
    } catch (error) {
      if (error instanceof OAuthStoreOperationError) throw oauthError('invalid_grant', 'Authorization code is invalid or has already been used.');
      throw error;
    }
  }

  async tokenFromRefresh(body, headers) {
    const stored = body.refresh_token ? await this.store.peekRefresh(body.refresh_token) : null;
    if (!stored || stored.revoked_at || new Date(stored.expires_at).getTime() <= Date.now()) {
      throw oauthError('invalid_grant', 'Invalid or expired refresh token.');
    }
    const client = await this.resolveClient(requestClientId(body, headers));
    if (!client || client.client_key !== stored.client_key) throw oauthError('invalid_client', 'Client does not match the refresh token.');
    if (body.resource !== this.resource() || stored.resource !== this.resource()) throw oauthError('invalid_grant', 'resource does not match the refresh token.');
    await this.authenticateClient(body, headers, client);
    if (!stored.consumed_at && typeof this.fenixKeepAlive === 'function' && stored.fenix?.cookieJar) {
      const lastPing = Date.parse(stored.fenix.lastKeepAliveAt || '');
      const needsCheck = !Number.isFinite(lastPing) || (Date.now() - lastPing) > 5 * 60 * 1000;
      if (needsCheck) {
        const check = await this.fenixKeepAlive({ grantId: stored.grant_id, session: stored.fenix });
        if (check?.expired) {
          throw oauthError('invalid_grant', 'Fenix session expired. Reconnect the MCP account.');
        }
        try {
          return await this.store.rotateRefresh({ refreshToken: body.refresh_token, clientKey: client.client_key, fenix: check?.session });
        } catch (error) {
          if (error instanceof OAuthStoreOperationError) throw oauthError('invalid_grant', 'Refresh token is invalid, expired, or already used.');
          throw error;
        }
      }
    }
    try {
      return await this.store.rotateRefresh({ refreshToken: body.refresh_token, clientKey: client.client_key });
    } catch (error) {
      if (error instanceof OAuthStoreOperationError) throw oauthError('invalid_grant', 'Refresh token is invalid, expired, or already used.');
      throw error;
    }
  }

  // OAuthTokenVerifier for the resource server.
  async verifyAccessToken(token) {
    try {
      return await this.store.verifyAccessToken(token);
    } catch (error) {
      if (error?.name === 'OAuthError') throw error;
      if (error instanceof OAuthStoreError) throw error;
      throw new OAuthStoreError('OAuth access-token verification failed', error);
    }
  }
}

export function validateRemoteHttpsUrl(value, { requirePath = false } = {}) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('URL must be HTTPS without userinfo or fragment');
  if (requirePath && (url.pathname === '/' || !url.pathname)) throw new Error('metadata URL must include a path');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || isPrivateIp(hostname)) {
    throw new Error('URL host must be publicly routable');
  }
  return url;
}

function isPrivateIp(host) {
  const version = isIP(host);
  if (version === 4) {
    const octets = host.split('.').map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0 && (octets[2] === 0 || octets[2] === 2)) ||
      (a === 192 && b === 88 && octets[2] === 99) || (a === 198 && b === 51 && octets[2] === 100) ||
      (a === 203 && b === 0 && octets[2] === 113) || a >= 224;
  }
  if (version === 6) {
    const ip = host.toLowerCase();
    const words = expandIpv6(ip);
    if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
      const v4 = ((words[6] << 16) | words[7]) >>> 0;
      return isPrivateIp(`${v4 >>> 24}.${(v4 >>> 16) & 255}.${(v4 >>> 8) & 255}.${v4 & 255}`);
    }
    const first = words[0];
    const second = words[1];
    const globalUnicast = (first & 0xe000) === 0x2000;
    return !globalUnicast || (first === 0x2001 && (second <= 0x01ff || second === 0x0db8)) ||
      first === 0x2002 || (first === 0x3fff && second <= 0x0fff);
  }
  return false;
}

function validateRedirectUri(value) {
  if (typeof value !== 'string' || value.length > 2048) throw oauthError('invalid_redirect_uri', 'Each redirect_uri must be a URL no longer than 2048 characters');
  let url;
  try { url = new URL(value); } catch { throw oauthError('invalid_redirect_uri', 'Each redirect_uri must be an absolute URL'); }
  if (url.username || url.password || url.hash || !['https:', 'http:'].includes(url.protocol)) {
    throw oauthError('invalid_redirect_uri', 'redirect_uri contains a prohibited URL component');
  }
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())) {
    throw oauthError('invalid_redirect_uri', 'HTTP redirect_uri is allowed only for loopback clients');
  }
}

function expandIpv6(address) {
  const parts = address.split('::');
  if (parts.length > 2) throw new Error('Invalid IPv6 address');
  const parseSide = (side) => {
    if (!side) return [];
    const tokens = side.split(':');
    const words = [];
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token.includes('.')) {
        if (index !== tokens.length - 1 || isIP(token) !== 4) throw new Error('Invalid IPv6 address');
        const octets = token.split('.').map(Number);
        words.push(((octets[0] << 8) | octets[1]), ((octets[2] << 8) | octets[3]));
      } else {
        const word = Number.parseInt(token, 16);
        if (!/^[0-9a-f]{1,4}$/i.test(token) || !Number.isInteger(word)) throw new Error('Invalid IPv6 address');
        words.push(word);
      }
    }
    return words;
  };
  const left = parseSide(parts[0]);
  const right = parseSide(parts[1] || '');
  const zeroCount = 8 - left.length - right.length;
  if ((parts.length === 1 && zeroCount !== 0) || (parts.length === 2 && zeroCount < 1)) {
    throw new Error('Invalid IPv6 address');
  }
  return [...left, ...Array(zeroCount).fill(0), ...right];
}

function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

async function resolvePublicAddresses(hostname) {
  const host = normalizeHost(hostname);
  const literalFamily = isIP(host);
  const addresses = literalFamily
    ? [{ address: host, family: literalFamily }]
    : await dnsLookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address, family }) => {
    return ![4, 6].includes(family) || isIP(address) !== family || isPrivateIp(address);
  })) {
    throw new Error('URL host must resolve only to publicly routable addresses');
  }
  return addresses;
}

async function resolveBeforeTimeout(promise, signal) {
  let abortHandler;
  const aborted = new Promise((_, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    abortHandler = () => reject(signal.reason);
    signal.addEventListener('abort', abortHandler, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    if (abortHandler) signal.removeEventListener('abort', abortHandler);
  }
}

function createPinnedLookup(expectedHostname, addresses) {
  return (requestedHostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (normalizeHost(requestedHostname) !== expectedHostname) {
      callback(new Error('HTTPS lookup hostname changed after validation'));
      return;
    }
    const family = options?.family || 0;
    const candidates = addresses.filter((entry) => !family || entry.family === family);
    if (!candidates.length) {
      callback(new Error('No pinned address matches the requested address family'));
      return;
    }
    if (options?.all) callback(null, candidates);
    else callback(null, candidates[0].address, candidates[0].family);
  };
}

function requestPinnedHttps(url, options) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, options, (response) => {
      resolve({
        status: response.statusCode,
        headers: {
          get(name) {
            const value = response.headers[name.toLowerCase()];
            return Array.isArray(value) ? value.join(', ') : value || null;
          }
        },
        body: response
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function discardBody(body) {
  if (typeof body?.destroy === 'function') body.destroy();
  else if (typeof body?.cancel === 'function') body.cancel().catch(() => {});
}

export async function fetchBoundedJson(url, maxBytes, dependencies = {}) {
  const hostname = normalizeHost(url.hostname);
  const resolveAddresses = dependencies.resolveAddresses || resolvePublicAddresses;
  const request = dependencies.request || requestPinnedHttps;
  const signal = AbortSignal.timeout(dependencies.timeoutMs ?? DOC_TIMEOUT_MS);
  const addresses = await resolveBeforeTimeout(
    Promise.resolve().then(() => resolveAddresses(hostname, signal)),
    signal
  );
  if (!Array.isArray(addresses) || !addresses.length || addresses.some(({ address, family }) => {
    return ![4, 6].includes(family) || isIP(address) !== family || isPrivateIp(address);
  })) {
    throw new Error('URL host must resolve only to publicly routable addresses');
  }

  const agent = new Agent({ keepAlive: false });
  let response;
  try {
    response = await request(url, {
      agent,
      lookup: createPinnedLookup(hostname, addresses),
      signal,
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (response.status !== 200) {
      discardBody(response.body);
      throw new Error(`Expected HTTP 200; received ${response.status}`);
    }
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json' && !contentType.endsWith('+json')) {
      discardBody(response.body);
      throw new Error('Response is not JSON');
    }
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes) {
      discardBody(response.body);
      throw new Error('JSON response exceeds size limit');
    }
    const chunks = [];
    let total = 0;
    if (!response.body) throw new Error('Response body is empty');
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > maxBytes) {
        discardBody(response.body);
        throw new Error('JSON response exceeds size limit');
      }
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks, total);
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new Error('Response contains invalid JSON'); }
    return { value, sha256: sha256Hex(bytes), bytes };
  } finally {
    agent.destroy();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

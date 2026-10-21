function intEnv(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function parseHttpsOrigin(name, raw) {
  let value;
  try { value = new URL(raw); } catch { throw new Error(`${name} must be a valid HTTPS URL`); }
  if (value.protocol !== 'https:' || value.username || value.password || value.search || value.hash || value.pathname !== '/') {
    throw new Error(`${name} must be an HTTPS origin without credentials, path, query, or fragment`);
  }
  return value;
}

function parseOrigins(raw, selfOrigin) {
  const origins = new Set([selfOrigin]);
  for (const candidate of raw.split(',').map((item) => item.trim()).filter(Boolean)) {
    let value;
    try { value = new URL(candidate); } catch { throw new Error(`Invalid origin in MCP_ALLOWED_ORIGINS: ${candidate}`); }
    if (value.origin !== candidate || !['https:', 'http:'].includes(value.protocol)) {
      throw new Error(`MCP_ALLOWED_ORIGINS must contain origins only: ${candidate}`);
    }
    origins.add(value.origin);
  }
  return [...origins];
}

export function loadConfig() {
  const publicUrl = parseHttpsOrigin('MCP_PUBLIC_URL', process.env.MCP_PUBLIC_URL || '');
  const mcpPath = process.env.MCP_HTTP_PATH || '/mcp';
  if (mcpPath !== '/mcp') throw new Error('MCP_HTTP_PATH must be /mcp so OAuth audience validation stays exact');

  const fenixBase = new URL(process.env.FENIX_BASE_URL || 'https://fenix.cbm.ba.gov.br');
  if (fenixBase.protocol !== 'https:' || fenixBase.username || fenixBase.password || fenixBase.search || fenixBase.hash) {
    throw new Error('FENIX_BASE_URL must be HTTPS without credentials, query, or fragment');
  }
  const fenixProxyToken = process.env.FENIX_PROXY_TOKEN || '';
  const usesCloudflareFenixProxy = fenixBase.origin === publicUrl.origin;
  if (usesCloudflareFenixProxy && !fenixProxyToken) {
    throw new Error('FENIX_PROXY_TOKEN is required when FENIX_BASE_URL uses MCP_PUBLIC_URL');
  }

  const bindHost = process.env.MCP_HTTP_HOST || '127.0.0.1';
  const port = intEnv('MCP_HTTP_PORT', 3000, { min: 1, max: 65535 });
  const allowedHosts = new Set([
    publicUrl.host.toLowerCase(),
    `${bindHost}:${port}`.toLowerCase(),
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    `[::1]:${port}`
  ]);
  for (const candidate of (process.env.MCP_ALLOWED_HOSTS || '').split(',').map((item) => item.trim()).filter(Boolean)) {
    allowedHosts.add(candidate.toLowerCase());
  }

  const oauthDatabaseUrl = process.env.OAUTH_DATABASE_URL || '';
  const hmacKeyring = process.env.OAUTH_HMAC_KEYRING_JSON || '';
  const encryptionKeyring = process.env.OAUTH_ENCRYPTION_KEYRING_JSON || '';
  if (!oauthDatabaseUrl || !hmacKeyring || !encryptionKeyring) {
    throw new Error('OAUTH_DATABASE_URL, OAUTH_HMAC_KEYRING_JSON and OAUTH_ENCRYPTION_KEYRING_JSON are required');
  }

  return {
    fenix: {
      baseUrl: fenixBase.origin,
      proxyToken: usesCloudflareFenixProxy ? fenixProxyToken : '',
      frontendVersion: process.env.FENIX_FRONTEND_VERSION || '2.19.1',
      hcaptchaSiteKey: process.env.FENIX_HCAPTCHA_SITEKEY || 'e94868de-18ba-4314-b0ce-c7c84a1440b6',
      timeoutMs: intEnv('FENIX_TIMEOUT_MS', 30_000, { min: 1000, max: 300_000 }),
      rateLimitPerMinute: intEnv('FENIX_RATE_LIMIT_PER_MINUTE', 60, { min: 1, max: 600 }),
      maxRetries: intEnv('FENIX_GET_RETRIES', 1, { min: 0, max: 3 }),
      keepAliveIntervalMs: intEnv('FENIX_KEEPALIVE_INTERVAL_MS', 20 * 60 * 1000, { min: 60_000, max: 24 * 60 * 60 * 1000 })
    },
    oauth: {
      publicUrl: publicUrl.origin,
      databaseUrl: oauthDatabaseUrl,
      hmacKeyring,
      encryptionKeyring
    },
    mcp: {
      host: bindHost,
      port,
      path: mcpPath,
      allowedHosts: [...allowedHosts],
      allowedOrigins: parseOrigins(process.env.MCP_ALLOWED_ORIGINS || '', publicUrl.origin)
    }
  };
}

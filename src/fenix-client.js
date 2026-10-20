import { createHash } from 'node:crypto';
import { CookieJar } from 'tough-cookie';

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_REQUEST_BYTES = 1_000_000;
const API_PREFIX = '/api/v1/';
const limiterBySession = new Map();

export class FenixApiError extends Error {
  constructor(message, { status, method, operationId, code, validationFields, responseContentType, responseBodyType, responseKeys } = {}) {
    super(message);
    this.name = 'FenixApiError';
    this.status = status;
    this.method = method;
    this.operationId = operationId;
    this.code = code;
    this.validationFields = validationFields;
    this.responseContentType = responseContentType;
    this.responseBodyType = responseBodyType;
    this.responseKeys = responseKeys;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      method: this.method,
      operationId: this.operationId,
      code: this.code,
      ...(this.validationFields ? { validationFields: this.validationFields } : {}),
      ...(this.responseContentType ? { responseContentType: this.responseContentType } : {}),
      ...(this.responseBodyType ? { responseBodyType: this.responseBodyType } : {}),
      ...(this.responseKeys ? { responseKeys: this.responseKeys } : {})
    };
  }
}

function makeJar(serialized) {
  if (!serialized || typeof serialized !== 'object' || !Array.isArray(serialized.cookies)) {
    throw new FenixApiError('The Fenix session is missing. Reconnect the MCP account.', { code: 'session_missing' });
  }
  try {
    return CookieJar.deserializeSync(serialized);
  } catch {
    throw new FenixApiError('The stored Fenix session is invalid. Reconnect the MCP account.', { code: 'session_invalid' });
  }
}

function setCookies(response, url, jar) {
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : splitSetCookie(response.headers.get('set-cookie') || '');
  return Promise.all(cookies.map((cookie) => jar.setCookie(cookie, url, { ignoreError: true })));
}

function splitSetCookie(value) {
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]*)/g).map((part) => part.trim()).filter(Boolean);
}

function csrfHeader(jar, url) {
  const cookie = jar.getCookiesSync(url).find((item) => item.key.toLowerCase() === 'xsrf-token');
  if (!cookie) return undefined;
  try { return decodeURIComponent(cookie.value); } catch { return cookie.value; }
}

async function boundedBody(response, limit = MAX_RESPONSE_BYTES) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > limit) {
    await response.body?.cancel().catch(() => {});
    throw new FenixApiError('Fenix response exceeds the 1 MB limit.', { status: response.status, code: 'response_too_large' });
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new FenixApiError('Fenix response exceeds the 1 MB limit.', { status: response.status, code: 'response_too_large' });
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

function parsePayload(text, contentType) {
  if (!text) return null;
  if (!/(?:json|text\/)/i.test(contentType || '')) return { bodyOmitted: true, contentType: contentType || 'unknown' };
  try { return JSON.parse(text); } catch { return text; }
}

function encodeQueryValue(value) {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function operationUrl(baseUrl, operation, pathParameters = {}, query = {}) {
  let path = operation.path;
  for (const name of operation.pathParameters || []) {
    const value = pathParameters[name];
    if (value === undefined || value === null || String(value) === '') {
      throw new FenixApiError(`Missing path parameter: ${name}`, { operationId: operation.id, code: 'missing_path_parameter' });
    }
    path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
  }
  if (/[{}]/.test(path) || !path.startsWith(API_PREFIX) || path.startsWith('//')) {
    throw new FenixApiError('Operation path is outside the Fenix API prefix.', { operationId: operation.id, code: 'invalid_operation' });
  }
  const url = new URL(path, baseUrl);
  if (url.origin !== new URL(baseUrl).origin || !url.pathname.startsWith(API_PREFIX)) {
    throw new FenixApiError('Operation URL failed origin validation.', { operationId: operation.id, code: 'invalid_operation' });
  }
  for (const [key, value] of Object.entries(query || {})) {
    const encoded = encodeQueryValue(value);
    if (encoded !== undefined) url.searchParams.set(key, encoded);
  }
  return url;
}

class SlidingWindowLimiter {
  constructor(limit) {
    this.limit = limit;
    this.timestamps = [];
  }

  async acquire() {
    while (true) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((time) => now - time < 60_000);
      if (this.timestamps.length < this.limit) {
        this.timestamps.push(now);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(50, 60_000 - (now - this.timestamps[0]))));
    }
  }
}

function getLimiter(key, limit) {
  let limiter = limiterBySession.get(key);
  if (!limiter) {
    limiter = new SlidingWindowLimiter(limit);
    limiterBySession.set(key, limiter);
    if (limiterBySession.size > 2000) limiterBySession.delete(limiterBySession.keys().next().value);
  }
  return limiter;
}

export class FenixClient {
  constructor({ baseUrl = 'https://fenix.cbm.ba.gov.br', proxyToken = '', timeoutMs = 30_000, rateLimitPerMinute = 60, maxRetries = 1, cookieJar, session, grantId, onSessionUpdate }) {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('FENIX_BASE_URL must be an HTTPS URL without credentials, query, or fragment');
    }
    this.origin = parsed.origin;
    this.apiBaseUrl = `${this.origin}/api/v1/`;
    this.proxyToken = proxyToken;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.session = session || { cookieJar };
    this.jar = makeJar(this.session.cookieJar || cookieJar);
    this.grantId = grantId;
    this.onSessionUpdate = onSessionUpdate;
    const sessionKey = createHash('sha256').update(JSON.stringify(this.session.cookieJar)).digest('hex');
    this.limiter = getLimiter(sessionKey, rateLimitPerMinute);
  }

  static async login({ baseUrl = 'https://fenix.cbm.ba.gov.br', proxyToken = '', timeoutMs = 30_000, email, password, hcaptchaToken, version = '2.19.1' }) {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('FENIX_BASE_URL must be an HTTPS URL without credentials, query, or fragment');
    }
    const origin = parsed.origin;
    const csrfUrl = new URL('/api/v1/csrf-cookie', origin);
    const loginUrl = new URL('/api/v1/authenticate', origin);
    const jar = new CookieJar();
    const csrfResponse = await fetchWithTimeout(csrfUrl, {
      method: 'GET',
      headers: proxyHeaders({ Accept: 'application/json', Origin: origin, Referer: `${origin}/` }, proxyToken),
      redirect: 'manual'
    }, timeoutMs);
    await setCookies(csrfResponse, csrfUrl.toString(), jar);
    await csrfResponse.body?.cancel().catch(() => {});
    if (!csrfResponse.ok && csrfResponse.status !== 204) {
      throw new FenixApiError('Could not initialize the Fenix login session.', { status: csrfResponse.status, code: 'csrf_failed' });
    }

    const loginHeaders = proxyHeaders({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: origin,
      Referer: `${origin}/`,
      Cookie: jar.getCookieStringSync(loginUrl.toString())
    }, proxyToken);
    const xsrf = csrfHeader(jar, loginUrl.toString());
    if (xsrf) loginHeaders['X-XSRF-TOKEN'] = xsrf;
    const loginResponse = await fetchWithTimeout(loginUrl, {
      method: 'POST',
      headers: loginHeaders,
      body: JSON.stringify({ email, password, version, hcaptcha_token: hcaptchaToken }),
      redirect: 'manual'
    }, timeoutMs);
    await setCookies(loginResponse, loginUrl.toString(), jar);
    const text = await boundedBody(loginResponse);
    const payload = parsePayload(text, loginResponse.headers.get('content-type'));
    const user = payload?.user ?? payload?.data?.user;
    if (!loginResponse.ok || !user) return { authenticated: false };
    return { authenticated: true, cookieJar: jar.serializeSync() };
  }

  async request({ operation, pathParameters = {}, query = {}, body, signal }) {
    const url = operationUrl(this.apiBaseUrl, operation, pathParameters, query);
    const method = String(operation.method).toUpperCase();
    const mutating = method !== 'GET';
    if (!mutating && body !== undefined) {
      throw new FenixApiError('GET operations do not accept a JSON body; use query parameters.', { method, operationId: operation.id, code: 'invalid_request' });
    }
    if (body !== undefined && mutating) {
      const encodedBody = JSON.stringify(body);
      if (Buffer.byteLength(encodedBody) > MAX_REQUEST_BYTES) {
        throw new FenixApiError('Request body exceeds the 1 MB limit.', { method, operationId: operation.id, code: 'request_too_large' });
      }
    }

    for (let attempt = 0; ; attempt += 1) {
      await this.limiter.acquire();
      const headers = {
        Accept: 'application/json',
        Origin: this.origin,
        Referer: `${this.origin}/`,
        Cookie: this.jar.getCookieStringSync(url.toString()),
        'X-Requested-With': 'XMLHttpRequest'
      };
      if (this.proxyToken) headers['X-Fenix-MCP-Proxy-Key'] = this.proxyToken;
      const xsrf = csrfHeader(this.jar, url.toString());
      if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
      if (body !== undefined && mutating) headers['Content-Type'] = 'application/json';

      let response;
      try {
        response = await fetchWithTimeout(url, {
          method,
          headers,
          body: body === undefined || !mutating ? undefined : JSON.stringify(body),
          redirect: 'manual',
          signal
        }, this.timeoutMs);
      } catch (error) {
        if (attempt < this.maxRetries && method === 'GET' && error?.name !== 'AbortError') continue;
        throw new FenixApiError('Fenix request failed. Check connectivity and reconnect if the session expired.', { method, operationId: operation.id, code: 'upstream_unavailable' });
      }

      const previousCookieJar = JSON.stringify(this.session.cookieJar);
      await setCookies(response, url.toString(), this.jar);
      const nextCookieJar = this.jar.serializeSync();
      if (JSON.stringify(nextCookieJar) !== previousCookieJar) {
        this.session.cookieJar = nextCookieJar;
        if (this.grantId && this.onSessionUpdate) {
          try { await this.onSessionUpdate(this.grantId, this.session); }
          catch { throw new FenixApiError('Could not persist the refreshed Fenix session. Retry the request.', { method, operationId: operation.id, code: 'session_persist_failed' }); }
        }
      }
      if ([401, 419].includes(response.status) || response.status === 302 || response.status === 303) {
        throw new FenixApiError('Fenix session expired. Reconnect the MCP account.', { status: response.status, method, operationId: operation.id, code: 'session_expired' });
      }
      if ([429, 502, 503, 504].includes(response.status) && method === 'GET' && attempt < this.maxRetries) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await response.body?.cancel().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 15_000) : 500 * (attempt + 1)));
        continue;
      }
      const text = await boundedBody(response);
      if (!response.ok) {
        const contentType = (response.headers.get('content-type') || '').split(';', 1)[0].slice(0, 100) || 'unknown';
        const payload = parsePayload(text, contentType);
        const responseBodyType = !text ? 'empty'
          : payload?.bodyOmitted === true ? 'omitted'
            : Array.isArray(payload) ? 'json-array'
              : payload && typeof payload === 'object' ? 'json-object' : 'text';
        const responseKeys = payload && typeof payload === 'object' && !Array.isArray(payload) && payload.bodyOmitted !== true
          ? Object.keys(payload).slice(0, 30).map((key) => key.slice(0, 120))
          : undefined;
        throw new FenixApiError(`Fenix returned HTTP ${response.status}.`, {
          status: response.status,
          method,
          operationId: operation.id,
          code: 'upstream_error',
          validationFields: response.status === 422 ? validationFieldNames(payload) : undefined,
          responseContentType: response.status === 422 ? contentType : undefined,
          responseBodyType: response.status === 422 ? responseBodyType : undefined,
          responseKeys: response.status === 422 ? responseKeys : undefined
        });
      }
      return {
        ok: true,
        status: response.status,
        operationId: operation.id,
        data: parsePayload(text, response.headers.get('content-type'))
      };
    }
  }
}

function validationFieldNames(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const errors = payload.errors ?? payload.validationErrors ?? payload.data?.errors ?? payload.data?.validationErrors;
  const metadataKeys = new Set(['message', 'error', 'errors', 'code', 'status', 'exception', 'trace']);
  const candidates = errors && typeof errors === 'object'
    ? Array.isArray(errors)
      ? errors.map((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
        ? entry.field ?? entry.parameter ?? entry.propertyPath ?? entry.path
        : undefined)
      : Object.keys(errors)
    : Object.keys(payload).filter((key) => !metadataKeys.has(key));
  const fields = [...new Set(candidates
    .filter((field) => typeof field === 'string' && field.trim())
    .slice(0, 50)
    .map((field) => field.slice(0, 120)))];
  return fields.length ? fields : undefined;
}

function proxyHeaders(headers, proxyToken) {
  if (proxyToken) headers['X-Fenix-MCP-Proxy-Key'] = proxyToken;
  return headers;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onAbort);
  }
}

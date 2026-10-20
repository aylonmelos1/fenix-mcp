const UPSTREAM_ORIGIN = 'https://fenix.cbm.ba.gov.br';
const PROXY_PREFIX = '/api/v1/';
const MAX_BODY_BYTES = 1_000_000;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const FORWARDED_HEADERS = [
  'accept',
  'content-type',
  'cookie',
  'x-requested-with',
  'x-xsrf-token'
];

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function stripCookieDomain(value) {
  return value.replace(/;\s*domain=[^;]*/gi, '');
}

export default {
  async fetch(request, env) {
    const incomingUrl = new URL(request.url);
    if (!incomingUrl.pathname.startsWith(PROXY_PREFIX)) return json(404, { error: 'not_found' });
    if (!ALLOWED_METHODS.has(request.method)) return json(405, { error: 'method_not_allowed' });

    const suppliedKey = request.headers.get('x-fenix-mcp-proxy-key') || '';
    if (!env.FENIX_PROXY_TOKEN || suppliedKey !== env.FENIX_PROXY_TOKEN) {
      return json(404, { error: 'not_found' });
    }

    const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
    if (body && body.byteLength > MAX_BODY_BYTES) return json(413, { error: 'request_too_large' });

    const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, UPSTREAM_ORIGIN);
    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    headers.set('Origin', UPSTREAM_ORIGIN);
    headers.set('Referer', `${UPSTREAM_ORIGIN}/`);

    let upstream;
    try {
      upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        body,
        redirect: 'manual'
      });
    } catch {
      return json(502, { error: 'upstream_unavailable' });
    }

    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
    for (const name of ['Content-Type', 'Retry-After']) {
      const value = upstream.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getAll('Set-Cookie')) {
      responseHeaders.append('Set-Cookie', stripCookieDomain(cookie));
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  }
};

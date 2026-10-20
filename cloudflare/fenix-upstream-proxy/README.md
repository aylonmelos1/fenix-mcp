# Cloudflare upstream Worker

This optional Worker forwards the MCP server's Fênix API requests through Cloudflare to the fixed upstream `https://fenix.cbm.ba.gov.br`. It accepts only `/api/v1/*`, limits request bodies to 1 MB, permits `GET`, `POST`, `PUT`, `PATCH` and `DELETE`, and requires the `FENIX_PROXY_TOKEN` secret. It forwards an explicit header allowlist and does not send the proxy key to the upstream.

When this route is enabled, Cloudflare processes login credentials, hCaptcha results, session cookies, API requests and responses while forwarding them. Wrangler observability and invocation logs are disabled in the example configuration; this does not prevent Cloudflare from processing the traffic and does not control account-level logging outside this Worker configuration.

## How the route fits the MCP service

The application attaches `FENIX_PROXY_TOKEN` only when `FENIX_BASE_URL` and `MCP_PUBLIC_URL` have the same origin. Configure a Worker route for that same origin and the `/api/v1/*` path. The other MCP and OAuth paths on the origin must continue to reach the MCP service through its TLS proxy or tunnel.

The checked-in `wrangler.jsonc` uses the reserved example domain `fenix.example.com` in the `example.com` zone. Replace both values with a hostname and zone you control. Set the service's `MCP_PUBLIC_URL` and `FENIX_BASE_URL` to the same origin, for example `https://fenix.example.com`; set `FENIX_PROXY_TOKEN` in the service environment and as a Worker secret. Do not commit the token.

## Deploy

1. Configure the route hostname and zone in `wrangler.jsonc`.
2. Create one high-entropy secret value and store it in both places without adding it to a file in the repository:

   ```sh
   npx wrangler secret put FENIX_PROXY_TOKEN
   ```

   Enter the same value into the dedicated MCP service's protected environment as `FENIX_PROXY_TOKEN`.

3. Deploy the Worker from this directory:

   ```sh
   npx wrangler deploy
   ```

4. Configure the MCP service with matching values for `MCP_PUBLIC_URL`, `FENIX_BASE_URL` and `FENIX_PROXY_TOKEN`. Keep the `/mcp`, OAuth and `/.well-known/*` routes directed to the MCP service; only `/api/v1/*` should match the Worker route.
5. Before using OAuth, send a credential-free `GET /api/v1/csrf-cookie` from the MCP host through the proxy and confirm the expected response. Check the live `cf-placement` response header to see the observed Cloudflare colo. The `placement.region` setting in Wrangler is a hint, not a fixed egress location or IP.

If the proxy is unavailable, return `FENIX_BASE_URL` to the official Fênix host and remove `FENIX_PROXY_TOKEN` from the service environment. The application then makes direct HTTPS requests to that configured origin.

## Request handling

- The Worker rejects requests outside `/api/v1/*` and methods outside the explicit allowlist.
- A missing or incorrect secret receives a generic `404` response before the request body is read or forwarded.
- The upstream origin is a constant in `src/worker.js`; the incoming hostname cannot choose another upstream.
- Request `Origin` and `Referer` are rewritten to the upstream origin. Only selected request and response headers are forwarded.
- The Worker preserves the upstream status and body and removes the upstream cookie `Domain` attribute so the MCP server can retain the cookie jar for its configured proxy origin.
- Redirects are not followed by the Worker. Review changes to this behavior carefully because login and session cookies cross this boundary.

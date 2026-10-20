# Fênix MCP

Private Node.js MCP server for the CBMBA Fênix web API. It exposes the frontend operation catalog through Streamable HTTP and authenticates MCP clients with OAuth 2.1 authorization code + PKCE. The user enters Fênix credentials and solves hCaptcha on the OAuth page; the server uses them for the upstream login and does not persist either credential. It retains only the resulting Fênix cookie session, encrypted at rest in PostgreSQL.

## Requirements

- Node.js 20 or newer.
- PostgreSQL 14 or newer, with a separate runtime login.
- An HTTPS public origin for OAuth discovery and the MCP endpoint.
- A TLS reverse proxy or secure tunnel to the local HTTP listener.

## Setup

1. Install dependencies and make a private environment file.

   ```sh
   npm install
   cp .env.example .env
   npm run keys
   ```

   Paste the two generated keyring assignments into `.env`. Keep `.env` private and back up both keyrings. When rotating keys, retain old key entries until all tokens, clients, and encrypted sessions that use them have expired or been removed.

2. Create a PostgreSQL database and set `OAUTH_ADMIN_DATABASE_URL` in the migration shell to an administrative connection for that database. If desired, set `FENIX_MCP_RUNTIME_PASSWORD` and `FENIX_MCP_MIGRATOR_PASSWORD` there too.

   ```sh
   npm run migrate:oauth
   ```

   Set `OAUTH_DATABASE_URL` in `.env` to connect as `fenix_mcp_runtime`. The migration creates restricted `fenix_mcp_*` roles and the `fenix_oauth` schema. The runtime login only needs the grants assigned by the SQL migration.

3. Set `MCP_PUBLIC_URL` to the HTTPS origin that will serve the OAuth endpoints and `/mcp`. Set `MCP_ALLOWED_HOSTS` to the public `Host` value and local proxy host. The listener binds to `127.0.0.1:3000` by default.

4. Start the service.

   ```sh
   npm start
   ```

   Check `GET /healthz`, then check OAuth discovery at `/.well-known/oauth-authorization-server` and protected-resource metadata at `/.well-known/oauth-protected-resource/mcp`.

## OAuth and Fênix login

The MCP access token authorizes a client to this MCP resource. It is not sent to Fênix. During OAuth authorization, the user enters their Fênix email and password and completes hCaptcha. The server first obtains the CSRF cookie, then posts the observed login payload to `/api/v1/authenticate`. Password and CAPTCHA response are used only for that login request and are not persisted. The resulting cookie jar is stored encrypted in the OAuth database and sent only to `FENIX_BASE_URL`.

The hCaptcha site key was read from the observed Fênix frontend bundle. hCaptcha may restrict a site key to approved domains. If the OAuth page runs on a different domain and the widget rejects the host, a Fênix administrator must authorize that domain or provide a site key accepted by the Fênix authentication backend; set `FENIX_HCAPTCHA_SITEKEY` for the widget.

OAuth clients use authorization code + PKCE S256, exact resource binding to `MCP_PUBLIC_URL/mcp`, issuer metadata, and either Dynamic Client Registration or a supported Client ID Metadata Document. Client credentials are not accepted as an OAuth grant. Refresh tokens rotate and are persisted alongside encrypted session material; the advertised OAuth revocation endpoint revokes the access and refresh tokens for the same authorization and scrubs its Fênix cookies. Expired encrypted sessions are scrubbed hourly while the service runs and once at startup.

## MCP tools

- `fenix_list_endpoints` filters the 312 frontend operation templates by method, heuristic access, browser observation, and path text.
- `fenix_api_call` accepts an operation ID, positional path parameters, query values, and a JSON body. It cannot call arbitrary hosts or paths. Every POST, PUT, PATCH, or DELETE requires `confirm_mutation=true`.
- Password reset, password edit, and first-access operations remain in the catalog but are blocked from the generic call tool.
- Responses and JSON bodies are capped at 1 MB. File uploads and binary attachments are not supported.

Full evidence notes and operation table: [docs/frontend-endpoints.md](docs/frontend-endpoints.md). Machine-readable catalog: [src/frontend-endpoints.json](src/frontend-endpoints.json).

## Connect from ChatGPT

Configure the HTTPS MCP server URL as `MCP_PUBLIC_URL/mcp` and use OAuth. OAuth discovery and authorization endpoints must also be reachable at the same issuer origin. A private MCP tunnel can carry MCP traffic, but it does not automatically make the OAuth authorization server public; publish those endpoints separately over HTTPS when using a tunnel. See the [OpenAI MCP auth guide](https://developers.openai.com/plugins/build/auth), [MCP server guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp), and [Secure MCP Tunnels guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

## Operational notes

- Do not commit `.env`, OAuth keyrings, or database URLs.
- Protect PostgreSQL backups because the encryption keys are needed to restore OAuth sessions and tokens.
- The endpoint catalog reflects frontend code and the captured browser session, not every backend route or every role's permissions.
- The service does not run schema migrations during startup. Run `npm run migrate:oauth` explicitly as a database administrator; normal startup connects to PostgreSQL and does not call Fênix until an OAuth login or tool call.

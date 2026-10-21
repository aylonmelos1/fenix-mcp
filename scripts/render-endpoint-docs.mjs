import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(root, 'src/frontend-endpoints.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const blocked = new Set(['/api/v1/password/email', '/api/v1/password/reset', '/api/v1/editPassword', '/api/v1/firstAcess']);
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function hasValue(val) {
  if (val === undefined || val === null) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'object') return Object.keys(val).length > 0;
  return true;
}

function escapeTableCell(text) {
  return String(text)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n+/g, '<br>');
}

function formatParameterEntry(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    return val.map((item) => (typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item))).join(', ');
  }
  if (typeof val === 'object') {
    return Object.entries(val)
      .map(([k, v]) => {
        if (v && typeof v === 'object') {
          const typeStr = v.type ? ` (${v.type})` : '';
          const descStr = v.description ? `: ${v.description}` : '';
          return `\`${k}\`${typeStr}${descStr}`;
        }
        return `\`${k}\`${v ? `: ${v}` : ''}`;
      })
      .join('; ');
  }
  return String(val);
}

function formatOperationDetails(operation) {
  const parts = [];
  if (hasValue(operation.description)) {
    parts.push(escapeTableCell(String(operation.description).trim()));
  }
  if (hasValue(operation.pathParameterHints)) {
    parts.push(`**Path params:** ${escapeTableCell(formatParameterEntry(operation.pathParameterHints))}`);
  }
  if (hasValue(operation.queryParameters)) {
    parts.push(`**Query:** ${escapeTableCell(formatParameterEntry(operation.queryParameters))}`);
  }
  if (hasValue(operation.bodyParameters)) {
    parts.push(`**Body:** ${escapeTableCell(formatParameterEntry(operation.bodyParameters))}`);
  }
  if (hasValue(operation.notes)) {
    const notesText = typeof operation.notes === 'string'
      ? operation.notes
      : Array.isArray(operation.notes)
        ? operation.notes.join('; ')
        : formatParameterEntry(operation.notes);
    if (notesText.trim()) {
      parts.push(`*Nota:* ${escapeTableCell(notesText.trim())}`);
    }
  }
  return parts.length ? parts.join('<br>') : '-';
}

const lines = [
  '# Fênix frontend API catalog',
  '',
  `Frontend bundle version: **${catalog.source.frontendVersion}**. Capture date: **${catalog.source.capturedAt}**.`,
  '',
  'This is a client-side route inventory from the loaded webpack bundle and observed Chrome Network requests. It is not a server controller specification. Dynamic path slots (`{param1}`, `{param2}`) preserve their order from the frontend callsite; the available schema and side effects may vary by account role and request body.',
  '',
  '## Evidence and transport',
  '',
  `- ${catalog.operations.length} distinct operation templates across ${catalog.serviceResources.length} Axios service resources.`,
  `- ${catalog.operations.filter((entry) => entry.sourceCallCount > 0).length} templates were found in bundle callsites; ${catalog.operations.filter((entry) => entry.observedInChrome).length} also appeared in browser network capture.`,
  '- Browser requests used the authenticated web session cookie plus `X-XSRF-TOKEN`; no `Authorization` header was observed.',
  '- Login initializes `/api/v1/csrf-cookie`, then posts `email`, `password`, `version`, and `hcaptcha_token` to `/api/v1/authenticate`. The frontend reads the `user` property from the Axios response body.',
  '- The MCP OAuth access token is separate. The MCP server keeps the Fênix cookie jar encrypted in PostgreSQL and sends cookies and XSRF only to the configured Fênix API origin.',
  '- `access` is a name/method heuristic. POST can be read-only in this app, and an unobserved endpoint may have different semantics. The MCP tool requires `confirm_mutation=true` for every non-GET operation.',
  '- Password and first-access operations are cataloged but unavailable through `fenix_api_call`.',
  '- JSON request bodies and responses are limited to 1 MB. Multipart uploads and binary attachments are not returned by the generic tool.',
  '',
  '### Authentication routes',
  '',
  '| Method | Path | Purpose |',
  '| --- | --- | --- |'
];

for (const endpoint of catalog.auth.endpoints) lines.push(`| ${endpoint.method} | \`${endpoint.path}\` | ${endpoint.purpose} |`);

lines.push('', '## Operation templates', '');
for (const method of methods) {
  const entries = catalog.operations.filter((entry) => entry.method === method).sort((a, b) => a.path.localeCompare(b.path));
  if (!entries.length) continue;
  lines.push(`### ${method}`, '', '| Path | Operation ID | Heuristic | Browser capture | MCP tool | Description & Parameters |', '| --- | --- | --- | --- | --- | --- |');
  for (const entry of entries) {
    const available = !blocked.has(entry.path);
    const details = formatOperationDetails(entry);
    lines.push(`| \`${entry.path}\` | \`${entry.id}\` | ${entry.access} | ${entry.observedInChrome ? 'observed' : 'bundle only'} | ${available ? 'available' : 'excluded'} | ${details} |`);
  }
  lines.push('');
}
lines.push('The machine-readable source is [`../src/frontend-endpoints.json`](../src/frontend-endpoints.json).');
await writeFile(resolve(root, 'docs/frontend-endpoints.md'), `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote docs/frontend-endpoints.md (${catalog.operations.length} operations).`);

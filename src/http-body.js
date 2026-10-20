const MAX_REQUEST_BODY_BYTES = 64 * 1024;

export async function readRequestBody(req, maxBytes = MAX_REQUEST_BODY_BYTES) {
  const chunks = [];
  let total = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > maxBytes) {
      tooLarge = true;
      chunks.length = 0;
      continue;
    }
    if (!tooLarge) chunks.push(bytes);
  }
  if (tooLarge) {
    const error = new Error('Request body exceeds size limit');
    error.statusCode = 413;
    throw error;
  }

  const raw = Buffer.concat(chunks, total).toString('utf8');
  if (!raw) return {};
  const contentType = (req.headers['content-type'] || '').split(';')[0].trim();
  if (contentType === 'application/json') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (contentType === 'application/x-www-form-urlencoded') {
    const params = new URLSearchParams(raw);
    const out = {};
    for (const [key, value] of params) out[key] = value;
    return out;
  }
  return {};
}

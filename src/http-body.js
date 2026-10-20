const MAX_REQUEST_BODY_BYTES = 64 * 1024;

export async function readRequestBody(req, maxBytes = MAX_REQUEST_BODY_BYTES) {
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    req.pause();
    const error = new Error('Request body exceeds size limit');
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let total = 0;
  const raw = await new Promise((resolve, reject) => {
    const cleanup = () => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onAborted);
    };
    const onData = (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (total + bytes.length > maxBytes) {
        chunks.length = 0;
        req.pause();
        cleanup();
        const error = new Error('Request body exceeds size limit');
        error.statusCode = 413;
        reject(error);
        return;
      }
      total += bytes.length;
      chunks.push(bytes);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks, total).toString('utf8'));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onAborted = () => {
      cleanup();
      reject(new Error('Request body was aborted'));
    };

    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onError);
    req.once('aborted', onAborted);
  });

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

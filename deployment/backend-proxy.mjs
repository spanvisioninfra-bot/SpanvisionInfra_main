import http from 'node:http';
import https from 'node:https';

/** Development/preview equivalent of Vercel's same-origin backend rewrites. */
export function proxyBackend(request, response, target) {
  const url = new URL(target);
  const transport = url.protocol === 'https:' ? https : http;
  const headers = {};
  for (const name of ['content-type', 'content-length', 'accept']) {
    if (request.headers[name]) headers[name] = request.headers[name];
  }
  const upstream = transport.request(url, { method: request.method, headers }, reply => {
    response.writeHead(reply.statusCode || 502, {
      'Content-Type': reply.headers['content-type'] || 'application/json',
      'Cache-Control': 'no-store',
      ...(reply.headers['retry-after'] ? { 'Retry-After': reply.headers['retry-after'] } : {}),
    });
    reply.pipe(response);
    reply.on('error', () => response.destroy());
  });
  upstream.setTimeout(45000, () => upstream.destroy(new Error('Backend request timed out')));
  upstream.on('error', () => {
    if (response.headersSent) { response.destroy(); return; }
    response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ detail: 'The backend is starting or unavailable. Please try again shortly.' }));
  });
  request.on('aborted', () => upstream.destroy());
  response.on('close', () => { if (!response.writableFinished) upstream.destroy(); });
  request.pipe(upstream);
}

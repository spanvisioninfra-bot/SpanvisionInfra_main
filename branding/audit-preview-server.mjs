import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';

// Read-only static previews. They never load local .env files or start database services.
export async function startAuditPreviews(root, modules, selected = []) {
  const servers = [], targets = [];
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.md': 'text/plain' };
  try {
    for (const module of [{ id: 'hub', directory: 'suite-hub', dist: 'dist', path: '/' }, ...modules]) {
      if (selected.length && !selected.includes(module.id)) continue;
      const directory = path.resolve(root, module.directory, module.dist);
      const server = http.createServer((request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
        let pathname;
        try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
        catch { response.writeHead(400).end(); return; }
        if (pathname === '/__suite/status') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ modules: targets.map(target => ({ ...target, available: true })) })); return; }
        if (pathname.startsWith('/api/')) { response.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: 'Live account and project services are disabled in this read-only audit.' })); return; }
        if (module.id === 'stl' && pathname.startsWith('/static/')) pathname = '/web/' + pathname.slice('/static/'.length);
        let file = path.resolve(directory, '.' + pathname);
        if (file !== directory && !file.startsWith(directory + path.sep)) { response.writeHead(403).end(); return; }
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
        if (!fs.existsSync(file) && !path.extname(file)) file = path.join(directory, 'index.html');
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
        response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
        if (request.method === 'HEAD') response.end();
        else fs.createReadStream(file).on('error', () => response.destroy()).pipe(response);
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening'); servers.push(server);
      const url = new URL(`http://127.0.0.1:${server.address().port}${module.path || '/'}`);
      url.searchParams.set('appearance', 'dark');
      if (module.id !== 'hub') url.searchParams.set('launch', 'workspace');
      targets.push({ id: module.id, url: url.href });
    }
    return { targets, close: () => Promise.all(servers.map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }))) };
  } catch (error) { for (const server of servers) server.close(); throw error; }
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = JSON.parse(await fs.readFile(path.join(root, 'branding/brand.json'), 'utf8'));
const id = process.argv[2];
const module = id === 'hub' ? { id, directory: 'suite-hub', dist: 'dist', path: '/' } : brand.modules.find(item => item.id === id);
if (!module || ['bim', 'stl'].includes(id)) throw new Error('Choose hub or a static frontend module; BIM and STL run on Render.');
const output = path.join(root, 'qa/deployment/output', id);
await fs.mkdir(output, { recursive: true });
const staticDir = path.join(output, '.vercel/output/static');
await fs.mkdir(staticDir, { recursive: true });
const source = path.join(root, module.directory, module.dist);
await fs.access(path.join(source, module.path === '/app/' ? 'app/index.html' : 'index.html'));
await fs.cp(source, staticDir, { recursive: true, filter: sourcePath => !sourcePath.endsWith('.map') && path.basename(sourcePath) !== 'suite-build.json' });
const routes = [
  { src: '/.*', headers: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' }, continue: true },
  { handle: 'filesystem' },
];
if (id === 'fem') {
  routes.splice(1, 0, { src: '/api/(toetsing|doorsnede)', dest: 'https://spanvision-fem-engine.onrender.com/api/$1' });
}
if (id === 'cad') routes.push({ src: '/app(?:/.*)?', dest: '/app/index.html' });
else routes.push({ src: '/(.*)', dest: '/index.html' });
if (id === 'hub') {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'deployment/production.json'), 'utf8'));
  for (const tool of brand.modules) {
    const deployed = manifest.modules.find(item => item.id === tool.id);
    if (!deployed?.available || !deployed.url?.startsWith('https://')) throw new Error(`Missing verified deployment for ${tool.id}`);
  }
  await fs.mkdir(path.join(staticDir, '__suite'), { recursive: true });
  await fs.writeFile(path.join(staticDir, '__suite/status.json'), JSON.stringify(manifest));
  routes.splice(1, 0, { src: '/__suite/status', dest: '/__suite/status.json', headers: { 'Cache-Control': 'no-store' } });
}
await fs.writeFile(path.join(output, '.vercel/output/config.json'), JSON.stringify({ version: 3, routes }, null, 2));
await fs.writeFile(path.join(output, 'vercel.json'), JSON.stringify({ framework: null }, null, 2));
console.log(output);

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installBrowserIdentity } from './browser-identity.mjs';
import { installWorkspaceUi } from './browser-ui.mjs';
import { packageCommerce } from './package-commerce.mjs';
import { backendRoutes } from './backend-services.mjs';
import { packageToolAccess } from './package-tool-access.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = JSON.parse(await fs.readFile(path.join(root, 'branding/brand.json'), 'utf8'));
const id = process.argv[2];
const module = id === 'hub' ? { id, directory: 'suite-hub', dist: 'dist', path: '/' } : brand.modules.find(item => item.id === id);
if (!module || ['bim', 'stl'].includes(id)) throw new Error('Choose hub or a static frontend module; BIM and STL run on Render.');
const output = path.join(root, 'qa/deployment/output', id);
await fs.mkdir(output, { recursive: true });
const vercelOutput = path.join(output, '.vercel/output');
const staticDir = path.join(vercelOutput, 'static');

await fs.rm(vercelOutput, { recursive: true, force: true });
await fs.mkdir(staticDir, { recursive: true });
// Windows builds may live on another drive behind a directory junction.
const source = await fs.realpath(path.join(root, module.directory, module.dist));
await fs.access(path.join(source, module.path === '/app/' ? 'app/index.html' : 'index.html'));
await fs.cp(source, staticDir, { recursive: true, filter: sourcePath => !sourcePath.endsWith('.map') && path.basename(sourcePath) !== 'suite-build.json' });
if(id !== 'hub') await installBrowserIdentity(staticDir,{entries:[id === 'cad' ? 'app/index.html' : 'index.html']});
else await installWorkspaceUi(staticDir,{optionalEntries:['launch.html']});
if(id==='cad')for(const name of ['workspace-launch.js','locale-labels.json'])await fs.copyFile(path.join(root,'SpanvisionCAD/web',name),path.join(staticDir,'app',name));
const routes = [
  { src: '/.*', headers: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' }, continue: true },
  { handle: 'filesystem' },
];
if(id!=='hub')routes.unshift(await packageToolAccess(vercelOutput,id));
routes.splice(1, 0, ...backendRoutes(id));
if (id === 'cad') routes.push({src:'/workspace/?',dest:'/app/index.html'},{ src: '/app(?:/.*)?', dest: '/app/index.html' });
else routes.push({ src: '/(.*)', dest: '/index.html' });
if (id === 'hub') {
  routes.splice(routes.findIndex(route=>route.handle==='filesystem'),0,{src:'/launch/[a-z0-9-]+/?',dest:'/launch.html'});
  await packageCommerce(path.join(output,'.vercel/output'));
  const locationFunction = path.join(vercelOutput, 'functions/api/location.func');
  await fs.mkdir(locationFunction, { recursive: true });
  await fs.copyFile(path.join(root, 'deployment/visitor-location.mjs'), path.join(locationFunction, 'server.mjs'));
  await fs.writeFile(path.join(locationFunction, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.writeFile(path.join(locationFunction, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'server.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 10 }));
  routes.splice(1,0,{src:'/__suite/location',dest:'/api/location',headers:{'Cache-Control':'private, no-store'}});
  routes.splice(1,0,{src:'/api/((?:account|billing|admin)(?:/.*)?)',dest:'/api/commerce?__route=$1'});
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

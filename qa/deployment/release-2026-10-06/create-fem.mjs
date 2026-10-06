import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/dell/AppData/Local/npm-cache/_npx/4b692b59300d311f/node_modules/vercel/package.json');
const yaml = require('js-yaml');
const config = yaml.load(await fs.readFile('C:/Users/dell/.render/cli.yaml', 'utf8'));
if (!config.api?.key) throw new Error('Render authentication is unavailable.');
const headers = { Authorization: `Bearer ${config.api.key}`, 'Content-Type': 'application/json' };
const listResponse = await fetch('https://api.render.com/v1/services?limit=100', { headers });
if (!listResponse.ok) throw new Error(`Render service lookup failed: ${listResponse.status}`);
const services = await listResponse.json();
let service = services.map(item => item.service).find(item => item.name === 'spanvision-fem-engine');
if (!service) {
  const body = {
    type: 'web_service', name: 'spanvision-fem-engine', ownerId: 'tea-davr4ru7bikc73f55ph0',
    repo: 'https://github.com/spanvisioninfra-bot/SpanvisionInfra_main', branch: 'version/V.1.0', autoDeployTrigger: 'commit',
    buildFilter: { paths: ['deployment/Dockerfile.fem', 'deployment/fem_api.py', 'fem-vision-studio/src-tauri/**'] },
    serviceDetails: { runtime: 'docker', plan: 'free', region: 'singapore', healthCheckPath: '/health',
      envSpecificDetails: { dockerfilePath: './deployment/Dockerfile.fem', dockerContext: '.' } }
  };
  const response = await fetch('https://api.render.com/v1/services', { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`FEM creation failed (${response.status}): ${await response.text()}`);
  service = await response.json();
}
await fs.writeFile(new URL('render-fem-create.json', import.meta.url), JSON.stringify(service, null, 2));
console.log(JSON.stringify({ id: service.id, name: service.name, branch: service.branch, plan: service.serviceDetails?.plan, url: service.serviceDetails?.url }));

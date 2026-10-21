import fs from 'node:fs/promises';
import path from 'node:path';
import { installBrowserIdentity } from './browser-identity.mjs';

// Presentation assets can be refreshed without recompiling the editor engines.
// This writes only generated builds, never application source or project files.
const root = path.resolve(import.meta.dirname, '..');
const brand = JSON.parse(await fs.readFile(path.join(root, 'branding/brand.json'), 'utf8'));
const selected = process.argv.slice(2);
for (const id of selected) if (!brand.modules.some(tool => tool.id === id)) throw new Error(`Unknown tool: ${id}`);
for (const tool of brand.modules.filter(tool => !selected.length || selected.includes(tool.id))) {
  const directory = path.join(root, tool.directory, tool.dist);
  const entries = tool.id === 'cad' ? ['app/index.html'] : tool.id === 'stl' ? ['index.html', 'web/index.html'] : ['index.html'];
  for (const entry of entries) await fs.access(path.join(directory, entry));
  await installBrowserIdentity(directory, { entries, prefix: tool.id === 'stl' ? '/static/__spanvision-brand/' : '/__spanvision-brand/' });
  if (tool.id === 'stl') for (const folder of ['__spanvision-brand', '__spanvision-ui']) await fs.cp(path.join(directory, folder), path.join(directory, 'web', folder), { recursive: true });
  console.log(`Updated ${tool.id}: landing-page logo and v1.0 presentation`);
}

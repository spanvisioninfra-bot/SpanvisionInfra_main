import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '../../..');
const brand = JSON.parse(await fs.readFile(path.join(root, 'branding/brand.json'), 'utf8'));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'deployment/production.json'), 'utf8'));
const selected = process.argv.slice(2);
const modules = [...brand.modules, { id: 'hub', directory: 'suite-hub', dist: 'dist', path: '/' }].filter(m => !selected.length || selected.includes(m.id));
const results = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const module of modules) {
  const url = module.id === 'hub' ? 'https://spanvision-infra.vercel.app/' : manifest.modules.find(m => m.id === module.id).url;
  const dist = path.join(root, module.directory, module.dist);
  const indexPath = module.id === 'cad' ? 'app/index.html' : 'index.html';
  try {
    const localIndex = await fs.readFile(path.join(dist, indexPath));
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Index returned ${response.status}`);
    if (sha(new Uint8Array(await response.arrayBuffer())) !== sha(localIndex)) throw new Error('Deployed index does not match the current build.');
    const entryAssets = [];
    for (const match of localIndex.toString().matchAll(/<(script|link)\b[^>]*>/g)) {
      const tag = match[0];
      if (match[1] === 'link' && !/rel=["'](?:stylesheet|modulepreload)["']/.test(tag)) continue;
      const asset = tag.match(/(?:src|href)=["']([^"']+)["']/)?.[1];
      if (!asset || /^(https?:|data:|\/\/)/.test(asset)) continue;
      const absoluteURL = new URL(asset, url);
      const pathname = decodeURIComponent(absoluteURL.pathname);
      const localAsset = module.id === 'stl' && pathname.startsWith('/static/')
        ? path.join(dist, 'web', pathname.slice('/static/'.length))
        : path.join(dist, pathname.replace(/^\//, ''));
      const file = await fs.readFile(localAsset);
      const remote = await fetch(absoluteURL, { signal: AbortSignal.timeout(60000) });
      if (!remote.ok || sha(new Uint8Array(await remote.arrayBuffer())) !== sha(file)) throw new Error(`Entry asset differs: ${asset}`);
      entryAssets.push(absoluteURL.pathname);
    }
    results.push({ id: module.id, url, passed: true, entryAssets });
    console.log('PASS current deployed build: ' + module.id);
  } catch (error) {
    results.push({ id: module.id, url, passed: false, error: error.message });
    console.log('FAIL current deployed build: ' + module.id + ': ' + error.message);
  }
}
const record = { checkedAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), passed: results.every(m => m.passed), modules: results };
await fs.writeFile(new URL('artifact-verification.json', import.meta.url), JSON.stringify(record, null, 2));
if (!record.passed) process.exitCode = 1;

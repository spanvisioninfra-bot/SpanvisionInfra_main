// This release changes only CAD's browser loader. Retain the deployed Rust engine.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { root, brand, fingerprint, digest } from '../../branding/common.mjs';

const base = '36aa5c04e5cd6470095365ae72b86c903dbd6e11';
const allowed = new Set(['SpanvisionCAD/web-app.html', 'SpanvisionCAD/web/workspace-launch.js']);
const changes = execFileSync('git', ['diff', '--name-only', base, '--', 'SpanvisionCAD'], {cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'SpanvisionCAD'], {cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert([...changes,...untracked].every(file => allowed.has(file.trim())), 'Engine inputs changed: a full CAD build is required.');

const module = brand.modules.find(module => module.id === 'cad');
const dist = path.join(root, module.directory, module.dist);
const app = path.join(dist, 'app');
const target = path.join(app, 'index.html');
let html = await fs.readFile(target,'utf8');
const engine = html.match(/module_or_path:\s*'([^']+\.wasm)'/)?.[1];
const glue = html.match(/from\s*'([^']+\.js)'/)?.[1];
assert(engine && glue, 'Existing compiled CAD engine is missing.');
const artifacts = [];
for (const urlPath of [glue, engine]) {
  const local = await fs.readFile(path.join(dist,urlPath));
  const localHash = createHash('sha256').update(local).digest('hex');
  const response = await fetch('https://spanvision-cad.vercel.app'+urlPath, {signal:AbortSignal.timeout(120000)});
  assert(response.ok, 'Cannot verify the deployed CAD engine.');
  const remoteHash = createHash('sha256');
  for await (const chunk of response.body) remoteHash.update(chunk);
  assert.equal(remoteHash.digest('hex'),localHash,'Retained engine differs from the verified deployed engine.');
  artifacts.push({file:urlPath,bytes:local.length,sha256:localHash});
}
const template = await fs.readFile(path.join(root,'SpanvisionCAD/web-app.html'),'utf8');
const body = template.match(/<body>[\s\S]*<\/body>/)?.[0];
assert(body,'Browser loader template is missing.');
html = html.replace(/<body>[\s\S]*<\/body>/,body);
if (!html.includes('src="workspace-launch.js"')) html = html.replace('</head>','<script src="workspace-launch.js"></script>\n</head>');
await fs.writeFile(target,html);
await fs.copyFile(path.join(root,'SpanvisionCAD/web/workspace-launch.js'),path.join(app,'workspace-launch.js'));
const record = {id:'cad',brandDigest:digest(module),sourceFingerprint:fingerprint(module),builtAt:new Date().toISOString(),buildMethod:'Browser loader assembly with unchanged, hash-verified deployed Rust engine',engineSourceCommit:base,retainedArtifacts:artifacts};
await fs.writeFile(path.join(dist,'suite-build.json'),JSON.stringify(record,null,2)+'\n');
await fs.writeFile(new URL('./cad-shell-build.json',import.meta.url),JSON.stringify(record,null,2)+'\n');
console.log('CAD browser loader assembled; retained WASM and JavaScript match production hashes.');

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { root, brand } from '../../branding/common.mjs';

const checkout = path.join(root, 'qa/publication/checkout');
const expected = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
const repository = 'spanvisioninfra-bot/SpanvisionInfra_main';
const get = async endpoint => {
  const response = await fetch(`https://api.github.com/repos/${repository}/${endpoint}`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`GitHub verification failed (${response.status}).`);
  return response.json();
};
const [reference, tree] = await Promise.all([get('git/ref/heads/main'), get(`git/trees/${expected}?recursive=1`)]);
assert.equal(reference.object.sha, expected, 'Remote main does not match the uploaded commit');
assert.equal(tree.truncated, false, 'GitHub returned an incomplete tree');
const entries = tree.tree;
const modules = [...brand.modules, { id: 'hub', directory: 'suite-hub' }].map(module => {
  const files = entries.filter(entry => entry.type === 'blob' && entry.path.startsWith(`${module.directory}/`));
  assert.ok(files.length > 0, `${module.id} source missing on GitHub`);
  assert.ok(entries.some(entry => entry.path === module.directory && entry.type === 'tree'), `${module.id} is not a source directory`);
  return { id: module.id, files: files.length, rust: files.filter(file => file.path.endsWith('.rs')).length, python: files.filter(file => file.path.endsWith('.py')).length };
});
assert.ok(!entries.some(entry => entry.mode === '160000' || entry.mode === '120000'), 'Remote contains external gitlinks or symlinks');
const localFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: checkout, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim().split('\n');
const remoteFiles = new Set(entries.filter(entry => entry.type === 'blob').map(entry => entry.path));
for (const file of localFiles) assert.ok(remoteFiles.has(file), `Remote file missing: ${file}`);
assert.equal(remoteFiles.size, localFiles.length);
const result = { repository, branch: 'main', commit: expected, files: remoteFiles.size, modules, verifiedAt: new Date().toISOString() };
fs.writeFileSync(path.join(root, 'qa/publication/remote-verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));

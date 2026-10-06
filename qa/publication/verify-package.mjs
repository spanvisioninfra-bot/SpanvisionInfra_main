import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { root, brand, fingerprint } from '../../branding/common.mjs';

const checkout = path.join(root, 'qa/publication/checkout');
const packaged = await import(path.join(checkout, 'branding/common.mjs').replaceAll('\\', '/').replace(/^([A-Z]):/, 'file:///$1:'));
const modules = [...brand.modules, { id: 'hub', directory: 'suite-hub' }];
const results = [];
for (const module of modules) {
  assert.equal(packaged.fingerprint(module), fingerprint(module), `${module.id} source fingerprint differs from the active preview`);
  const source = path.join(checkout, module.directory);
  assert.ok(fs.existsSync(source) && !fs.lstatSync(source).isSymbolicLink(), `${module.id} must be a real source directory`);
  results.push({ id: module.id, directory: module.directory, sourceMatches: true });
}
const staged = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: checkout, maxBuffer: 64 * 1024 * 1024 }).toString().split('\0').filter(Boolean);
assert.ok(staged.length > 15000, 'The complete tool source must be staged');
for (const row of staged) assert.ok(!row.startsWith('160000 ') && !row.startsWith('120000 '), `Repository contains an external gitlink or symbolic link: ${row}`);
const files = staged.map(row => row.slice(row.indexOf('\t') + 1));
for (const file of files) {
  assert.ok(!file.split('/').some(part => ['node_modules', 'target', '.venv', '.git'].includes(part)), `Cache or repository metadata staged: ${file}`);
  assert.ok(!/(^|\/)\.env(\.(?!example$|sample$|template$).*)?$/.test(file), `Private environment staged: ${file}`);
  assert.ok(fs.statSync(path.join(checkout, file)).size < 100 * 1024 * 1024, `Oversized upload: ${file}`);
}
fs.writeFileSync(path.join(root, 'qa/publication/package-verification.json'), JSON.stringify({ modules: results, stagedFiles: files.length, gitlinks: 0, symlinks: 0, generatedAt: new Date().toISOString() }, null, 2) + '\n');
console.log(`PASS: ${modules.length} source fingerprints match; ${files.length} staged files; all 16 tools are normal directories; no caches, gitlinks or external symlinks.`);

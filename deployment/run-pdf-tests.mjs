// Bound Node's test processes: the upstream command otherwise starts hundreds at once.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../spanvision-pdf-workspace/open-pdf-studio');
const { scripts } = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json')));
const files = scripts['test:unit'].replace(/^node --test\s+/, '').trim().split(/\s+/);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...files], { cwd, stdio: 'inherit', windowsHide: true });
process.exitCode = result.status ?? 1;

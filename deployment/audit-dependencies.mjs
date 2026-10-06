import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root, brand, appDirectory } from '../branding/common.mjs';

const output = path.join(root, 'qa/readiness/dependencies');
fs.mkdirSync(output, { recursive: true });
const applications = brand.modules.filter(module => !['cad', 'stl'].includes(module.id)).map(module => [module.id, appDirectory(module)]);
applications.push(['hub', path.join(root, 'suite-hub')], ['fem-v2', path.join(root, 'fem-vision-studio/design-mockup')]);
const selected = process.argv.slice(2);
const pending = applications.filter(([id]) => !selected.length || selected.includes(id));
const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const results = {};
await Promise.all(Array.from({ length: 2 }, async () => {
  while (pending.length) {
    const [id, cwd] = pending.shift();
    const result = await new Promise(resolve => {
      // IFC is a pnpm workspace; npm cannot audit its lockfile.
      const child = id === 'ifc'
        ? (process.platform === 'win32'
          ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'pnpm audit --json'], { cwd, windowsHide: true })
          : spawn('pnpm', ['audit', '--json'], { cwd }))
        : spawn(process.execPath, [npm, 'audit', '--json'], { cwd, windowsHide: true });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout += data; });
      child.stderr.on('data', data => { stderr += data; });
      child.on('error', error => resolve({ error: error.message }));
      child.on('close', code => {
        try { resolve({ ...JSON.parse(stdout), exitCode: code }); }
        catch { resolve({ error: stderr || stdout || `npm audit exited ${code}`, exitCode: code }); }
      });
    });
    fs.writeFileSync(path.join(output, id + '.json'), JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2));
    results[id] = result.metadata?.vulnerabilities || { error: result.error };
    console.log(id, JSON.stringify(results[id]));
  }
}));
for (const [id] of applications) {
  const file = path.join(output, id + '.json');
  if (fs.existsSync(file)) {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    results[id] = report.metadata?.vulnerabilities || { error: report.error };
  }
}
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(results, null, 2));

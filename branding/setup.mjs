import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root, brand, appDirectory } from './common.mjs';

const args = process.argv.slice(2);
const planOnly = args.includes('--plan');
const selected = args.find(arg => arg.startsWith('--modules='))?.slice(10).split(',');
for (const id of selected || []) if (!brand.modules.some(module => module.id === id) && id !== 'hub') throw new Error(`Unknown module: ${id}`);
const modules = brand.modules.filter(module => !selected || selected.includes(module.id));
const windows = process.platform === 'win32';
const npmCommand = windows ? 'npm.cmd' : 'npm';
const commands = [];
const install = directory => {
  if (!fs.existsSync(path.join(directory, 'package-lock.json'))) throw new Error(`Missing npm lockfile in ${path.relative(root, directory)}`);
  commands.push({ command: npmCommand, args: ['ci'], cwd: directory });
};
for (const module of modules) {
  if (module.id === 'cad' || module.id === 'stl') continue;
  if (module.id === 'ifc') {
    const directory = path.join(root, module.directory);
    const manager = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).packageManager;
    commands.push({ command: npmCommand, args: ['exec', '--yes', `--package=${manager}`, '--', 'pnpm', 'install', '--frozen-lockfile'], cwd: directory });
  } else install(module.id === 'calculation' ? path.join(root, module.directory) : appDirectory(module));
}
if (!selected || selected.includes('hub')) {
  install(path.join(root, 'commerce'));
  install(path.join(root, 'suite-hub'));
}
for (const module of modules.filter(module => module.id === 'bim' || module.id === 'stl')) {
  const directory = path.join(root, module.directory);
  const python = path.join(directory, windows ? '.venv/Scripts/python.exe' : '.venv/bin/python');
  if (!fs.existsSync(python)) commands.push({ command: process.env.SPANVISION_SETUP_PYTHON || 'python', args: ['-m', 'venv', '.venv'], cwd: directory });
  const requirements = module.id === 'bim' ? 'server/requirements.txt' : 'requirements.txt';
  commands.push({ command: python, args: ['-m', 'pip', 'install', '-r', requirements], cwd: directory });
  if (module.id === 'bim') commands.push({ command: python, args: ['-m', 'pip', 'install', '-e', '.'], cwd: directory });
}
for (const entry of commands) {
  const label = path.relative(root, entry.cwd).replaceAll('\\', '/');
  console.log(`${label}: ${entry.command} ${entry.args.join(' ')}`);
  if (planOnly) continue;
  await new Promise((resolve, reject) => {
    const child = spawn(entry.command, entry.args, { cwd: entry.cwd, stdio: 'inherit', windowsHide: true, shell: windows && entry.command === npmCommand });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Dependency installation failed in ${label} (${code}).`)));
  });
}
console.log(planOnly ? 'Setup plan validated. No dependencies were changed.' : 'Frontend and Python preview dependencies are installed. Run npm run build:suite, then npm run preview:suite.');

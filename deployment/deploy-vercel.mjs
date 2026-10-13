import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = JSON.parse(await fs.readFile(path.join(root, 'branding/brand.json'), 'utf8'));
const ids = process.argv.slice(2);
const cli = process.env.VERCEL_CLI_ENTRY;
if (!cli) throw new Error('Set VERCEL_CLI_ENTRY to the installed Vercel CLI JavaScript entry point.');
const scope = 'spanvisioninfra-bot';
const reportPath = path.join(root, 'qa/deployment/vercel-deployments.json');
let report;
try { report = JSON.parse(await fs.readFile(reportPath, 'utf8')); } catch { report = {}; }

function run(args, logName) {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(process.execPath, args, { cwd: root, env: process.env, windowsHide: true });
    child.stdout.on('data', data => output += data);
    child.stderr.on('data', data => output += data);
    child.on('error', reject);
    child.on('exit', async code => {
      if (logName) await fs.writeFile(path.join(root, 'qa/deployment', logName + '.log'), output);
      if (code) reject(new Error(output.slice(-3000)));
      else resolve(output);
    });
  });
}

for (const id of ids) {
  const module = id === 'hub' ? { id, path: '/' } : brand.modules.find(item => item.id === id);
  if (!module || ['bim', 'stl'].includes(id)) throw new Error(`Invalid static module ${id}`);
  await run([path.join(root, 'deployment/package-vercel.mjs'), id]);
  const cwd = path.join(root, 'qa/deployment/output', id);
  const name = id === 'hub' ? 'spanvision-infra' : `spanvision-${id}`;
  console.log(`Deploying ${id} as ${name}...`);
  const output = await run([cli, 'deploy', '--prebuilt', '--prod', '--yes', '--scope', scope, '--name', name, '--cwd', cwd], `vercel-${id}`);
  const jsonStart = output.indexOf('{\n  "status": "ok"');
  const metadata = jsonStart >= 0 ? JSON.parse(output.slice(jsonStart)) : null;
  const url = metadata?.deployment.productionUrl || output.match(/Aliased\s+(https:\/\/[^\s]+)/)?.[1];
  if (!url) throw new Error(`No production URL returned for ${id}.`);
  // These uploads are complete browser builds. A root monorepo Git build
  // cannot rebuild CAD's WASM or the other independent frontend frameworks.
  try {
    await run([cli, 'git', 'disconnect', '--yes', '--scope', scope, '--cwd', cwd], `vercel-git-${id}`);
  } catch (error) {
    if (!error.message.includes('No Git repository connected')) throw error;
  }
  const response = await fetch(new URL(module.path, url), { signal: AbortSignal.timeout(30000) });
  if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) throw new Error(`Public page check failed for ${id}: ${response.status}`);
  report[id] = { id, url: new URL(module.path, url).href, available: true, platform: 'vercel', deploymentId: metadata?.deployment.id, verifiedAt: new Date().toISOString() };
  // Preserve the previous valid record if a disk-full error interrupts writing.
  const temporaryReport = reportPath + '.tmp';
  await fs.writeFile(temporaryReport, JSON.stringify(report, null, 2));
  await fs.rename(temporaryReport, reportPath);
  console.log(`${id}: ${report[id].url}`);
}

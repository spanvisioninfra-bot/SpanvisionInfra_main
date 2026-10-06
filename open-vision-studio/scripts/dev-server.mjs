#!/usr/bin/env node
// Browser-dev-launcher: wijst deze worktree een vaste poort toe, bewaakt tegen
// dubbelstart, stempelt launch.json, en spawnt vite op die poort.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { projectRoot, worktreeSlug, allocatePort } from './dev-port.mjs';
import { acquireGuardLock } from './dev-lock.mjs';

const printOnly = process.argv.includes('--print-plan');

const root = projectRoot();
if (!root) {
  console.error('Niet in een git-worktree — kan geen dev-poort toewijzen.');
  process.exit(1);
}
const slug = worktreeSlug(root);

// Geneste start onder tauri-dev: die heeft al toegewezen + het slot geclaimd.
const guarded = Boolean(process.env.OPS_DEV_GUARDED);
const port = guarded ? Number(process.env.OPS_DEV_PORT) : await allocatePort(root);

let releaseGuard = () => {};
if (!guarded) {
  try {
    releaseGuard = acquireGuardLock(root, port);
  } catch (e) {
    console.error(`\n  ✋ ${e.message}\n`);
    process.exit(1);
  }
}

console.log(`\n  ▶ Open Vision Studio dev — worktree "${slug}" → http://localhost:${port}/\n`);

if (printOnly) {
  releaseGuard();
  process.exit(0);
}

const binName = process.platform === 'win32' ? 'vite.cmd' : 'vite';
const localBin = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', binName);
const viteBin = existsSync(localBin) ? localBin : binName;

// Windows kan een .cmd-bestand niet rechtstreeks via spawn starten. Gebruik de JS-entry.
const viteEntry = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.platform === 'win32' ? process.execPath : viteBin,
  process.platform === 'win32' ? [viteEntry] : [], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env, OPS_DEV_PORT: String(port) },
});

const cleanup = () => releaseGuard();
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
child.on('exit', (code) => { cleanup(); process.exit(code ?? 0); });
child.on('error', (err) => { cleanup(); console.error('Vite starten mislukte:', err.message); process.exit(1); });

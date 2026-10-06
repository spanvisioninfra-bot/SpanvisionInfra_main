import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { worktreeRoot, worktreeSlug, isPortFree } from '../../scripts/dev-port.mjs';

test('worktreeRoot geeft de absolute toplevel van een git-repo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-wt-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const root = worktreeRoot(dir);
  assert.equal(root, realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' }).trim()));
  rmSync(dir, { recursive: true, force: true });
});
test('worktreeRoot buiten een git-repo → null (gooit niet)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-nogit-'));
  assert.equal(worktreeRoot(dir), null);
  rmSync(dir, { recursive: true, force: true });
});

test('projectRoot kiest de geneste Planner-app in plaats van de monorepo-root', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-project-root-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const app = join(dir, 'planner');
    const scripts = join(app, 'scripts');
    mkdirSync(scripts, { recursive: true });
    for (const name of ['dev-port.mjs', 'dev-lock.mjs']) {
      copyFileSync(fileURLToPath(new URL(`../../scripts/${name}`, import.meta.url)), join(scripts, name));
    }
    const nested = await import(pathToFileURL(join(scripts, 'dev-port.mjs')).href);
    assert.equal(nested.projectRoot(), realpathSync(app));
    assert.equal(nested.worktreeRoot(app), realpathSync(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('worktreeSlug is de basename van de root', () => {
  assert.equal(worktreeSlug('/a/b/mijn-worktree'), 'mijn-worktree');
  assert.equal(worktreeSlug(null), 'unknown');
});
test('isPortFree geeft true voor een vrije poort en false als hij bezet is', async () => {
  const { createServer } = await import('node:net');
  assert.equal(await isPortFree(3106), true);
  const srv = createServer();
  await new Promise((r) => srv.listen(3106, '127.0.0.1', r));
  assert.equal(await isPortFree(3106), false);
  await new Promise((r) => srv.close(r));
});

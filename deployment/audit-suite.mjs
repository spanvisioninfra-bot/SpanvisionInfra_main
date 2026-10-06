/** Reproducible behavior/static audit. A passed command is not an all-features certification. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'qa/readiness');
fs.mkdirSync(out, { recursive: true });
const records = path.join(out, 'records');
fs.mkdirSync(records, { recursive: true });
const checks = [
  ['cad2d-tests', 'spanvision-2d-cad-workspace', 'npm test -- --maxWorkers=1'],
  ['cad2d-types', 'spanvision-2d-cad-workspace', 'npm run typecheck'],
  ['ifc-tests', 'ifc-view', 'node node_modules/vitest/vitest.mjs run --maxWorkers=2'],
  ['ifc-types', 'ifc-view', 'node node_modules/typescript/bin/tsc -p apps/desktop/tsconfig.json'],
  ['calc-tests', 'calc-workspace', 'node node_modules/vitest/vitest.mjs run --maxWorkers=1'],
  ['calc-types', 'calc-workspace', 'npm run typecheck'],
  ['pdf-tests', 'spanvision-pdf-workspace/open-pdf-studio', 'node ../../deployment/run-pdf-tests.mjs'],
  ['bim-viewer-tests', 'vision-bim-validator/viewer', 'npm run test:run -- --maxWorkers=1'],
  ['bim-backend-tests', 'vision-bim-validator', '.venv\\Scripts\\python.exe -m pytest test server/tests -q'],
  ['stl-backend-tests', 'spanvision-stl-3d-map-workspace', '.venv\\Scripts\\python.exe -m pytest tests -q'],
  ['calculation-tests', 'vision-calculation-studio', 'npm run check'],
  ['geo-tests', 'spanvision-geptechniek-workspace/apps/desktop', 'npm test -- --maxWorkers=2'],
  ['pile-tests', 'spanvision-pile-plane-workspace/apps/pile-plan-studio', 'npm test'],
  ['speech-types', 'spanvision-speech-workspace', 'npm run typecheck'],
  ['pointcloud-types', 'spanvision-pointcloud-workspace', 'npm run typecheck'],
  ['pointcloud-parser-tests', 'spanvision-pointcloud-workspace', 'node --experimental-strip-types --test src/engine/pointcloud/XYZParser.test.ts src/engine/pointcloud/TextScanParsers.test.ts src/engine/pointcloud/PLYParser.test.ts src/engine/pointcloud/LASParser.test.ts src/engine/pointcloud/PointcloudTransforms.test.ts'],
  ['pointcloud-native-tests', 'spanvision-pointcloud-workspace', 'cargo test --manifest-path core-tests/Cargo.toml --locked --jobs 1'],
  ['pointcloud-desktop-check', 'spanvision-pointcloud-workspace', 'cargo check --manifest-path src-tauri/Cargo.toml --locked --jobs 1'],
  ['pile-native-tests', 'spanvision-pile-plane-workspace', 'cargo test --workspace --locked --jobs 1'],
  ['field-types', 'spanvision-field-workspace', 'node node_modules/typescript/bin/tsc --noEmit'],
  ['fem-types', 'fem-vision-studio', 'node node_modules/typescript/bin/tsc --noEmit'],
  ['fem-v2-tests', 'fem-vision-studio/design-mockup', 'npm test'],
  ['fem-v2-types', 'fem-vision-studio/design-mockup', 'node node_modules/typescript/bin/tsc --noEmit'],
  ['fem-native-core-tests', 'fem-vision-studio/src-tauri', 'cargo test --locked --release --workspace --exclude open-fem2d-studio --jobs 1 -- --test-threads=1'],
  ['fem-api-tests', '', 'vision-bim-validator\\.venv\\Scripts\\python.exe -m unittest deployment.test_fem_api -v'],
  ['fem-sidecar-tests', 'fem-vision-studio/design-mockup', 'node scripts/run-tests.mjs --bundel'],
  ['frame-core-tests', 'frame-vision-studio', 'cargo test --locked -p ofs-core --jobs 1'],
  ['frame-desktop-check', 'frame-vision-studio', 'cargo check --manifest-path src-tauri/Cargo.toml --locked --jobs 1'],
  ['frame-browser-edits', 'frame-vision-studio/ui', 'node --test src/lib/webProjectCommands.test.mjs'],
  ['planner-verify', 'open-vision-studio', 'npm run verify'],
  ['deployment-tests', '.', 'node --test deployment/module-url.test.mjs'],
];
// Prefer Git Bash over the Windows Store WSL alias for the repository's shell suites.
const childEnv = { ...process.env };
if (process.platform === 'win32') {
  const inheritedPath = process.env.PATH || process.env.Path || '';
  const gitCmd = inheritedPath.split(path.delimiter).find(dir => fs.existsSync(path.join(dir, 'git.exe')));
  const gitBin = gitCmd && path.join(path.dirname(gitCmd), 'bin');
  for (const key of Object.keys(childEnv)) if (key.toLowerCase() === 'path') delete childEnv[key];
  childEnv.PATH = `${gitBin && fs.existsSync(path.join(gitBin, 'bash.exe')) ? gitBin + ';' : ''}${process.env.SystemRoot}\\System32;${inheritedPath}`;
}
const selected = process.argv.slice(2);
const jobs = checks.filter(([id]) => !selected.length || selected.includes(id));
if (selected.some(id => !checks.some(check => check[0] === id))) throw new Error('Unknown audit check');
let report = fs.existsSync(path.join(out, 'checks.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'checks.json'))) : {};
async function run([id, dir, command]) {
  const logPath = path.join(out, id + '.log');
  const log = fs.createWriteStream(logPath);
  const started = new Date().toISOString();
  console.log(`START ${id}`);
  const result = await new Promise(resolve => {
    const child = process.platform === 'win32'
      ? spawn(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', ['/d', '/s', '/c', command], { cwd: path.join(root, dir), windowsHide: true, env: childEnv })
      : spawn('sh', ['-c', command.replaceAll('.venv\\Scripts\\python.exe', '.venv/bin/python')], { cwd: path.join(root, dir) });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('error', error => { log.write(String(error)); resolve({ exitCode: null, error: String(error) }); });
    child.on('close', exitCode => resolve({ exitCode }));
  });
  await new Promise(resolve => log.end(resolve));
  // A separate filtered run may finish while this process is still testing.
  // Merge its completed checks before writing; synchronous I/O keeps this
  // read/merge/write uninterrupted within this process.
  report = fs.existsSync(path.join(out, 'checks.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'checks.json'), 'utf8')) : {};
  report[id] = { command, directory: dir, started, finished: new Date().toISOString(), passed: result.exitCode === 0, ...result, log: path.relative(root, logPath).replaceAll('\\', '/') };
  fs.writeFileSync(path.join(records, id + '.json'), JSON.stringify(report[id], null, 2) + '\n');
  for (const record of fs.readdirSync(records).filter(name => name.endsWith('.json'))) {
    const value = JSON.parse(fs.readFileSync(path.join(records, record), 'utf8'));
    const key = record.slice(0, -5);
    if (!report[key] || value.finished > report[key].finished) report[key] = value;
  }
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${result.exitCode === 0 ? 'PASS' : 'FAIL'} ${id} (${result.exitCode})`);
}
// Do not run two commands that mutate the same workspace caches concurrently.
const pending = [...jobs], activeDirs = new Set();
const concurrency = Number(process.env.SPANVISION_AUDIT_JOBS || 1);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('SPANVISION_AUDIT_JOBS must be 1–4');
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (pending.length) {
    const index = pending.findIndex(([, dir]) => !activeDirs.has(dir));
    if (index < 0) { await new Promise(resolve => setTimeout(resolve, 250)); continue; }
    const check = pending.splice(index, 1)[0];
    activeDirs.add(check[1]);
    try { await run(check); } finally { activeDirs.delete(check[1]); }
  }
}));
if (jobs.some(([id]) => !report[id]?.passed)) process.exitCode = 1;

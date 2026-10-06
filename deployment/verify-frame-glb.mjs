import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(import.meta.dirname, 'validation-tools/package.json'));

// Khronos' validator is a verification dependency, separate from shipped apps.
// Install it with: npm ci --ignore-scripts --prefix deployment/validation-tools
export async function verifyFrameGlb(filePath) {
  const validator = require('gltf-validator');
  const bytes = await fs.readFile(filePath);
  const result = await validator.validateBytes(new Uint8Array(bytes), { uri: path.basename(filePath) });
  const output = path.join(root, 'qa/readiness/frame-glb-validation.json');
  await fs.writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), file: path.relative(root, filePath), validator: validator.version(), result }, null, 2) + '\n');
  assert.equal(result.issues.numErrors, 0, JSON.stringify(result.issues));
  assert.equal(result.issues.numWarnings, 0, JSON.stringify(result.issues));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await verifyFrameGlb(path.resolve(process.argv[2] || path.join(root, 'qa/readiness/D100.glb')));
  console.log(`PASS Khronos GLB validation: ${result.issues.numErrors} errors, ${result.issues.numWarnings} warnings`);
}

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import ts from '../calc-workspace/node_modules/typescript/lib/typescript.js';
import { worksheetCode } from './worksheet-display.mjs';

// Compare executable Calcpad instructions while allowing display text to change.
const root = path.resolve(import.meta.dirname, '..');
const reference = process.argv[2] || 'HEAD';
const directory = 'vision-calculation-studio/packages/desktop/src/templates';
function templates(file, source) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const result = [];
  function walk(node) {
    if (ts.isNoSubstitutionTemplateLiteral(node)) result.push(worksheetCode(node.text));
    ts.forEachChild(node, walk);
  }
  walk(parsed); return result;
}
let count = 0;
for (const name of fs.readdirSync(path.join(root, directory)).filter(name => name.endsWith('.ts'))) {
  const file = directory + '/' + name;
  const before = execFileSync('git', ['show', reference + ':' + file], { cwd: root, encoding: 'utf8', windowsHide: true });
  const oldInstructions = templates(file, before);
  const newInstructions = templates(file, fs.readFileSync(path.join(root, file), 'utf8'));
  assert.deepEqual(newInstructions, oldInstructions, `Worksheet instructions changed in ${file}`);
  count += oldInstructions.length;
}
console.log(`${count} worksheet templates retain their executable equations and selection values against ${reference}.`);

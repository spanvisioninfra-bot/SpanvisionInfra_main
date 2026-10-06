import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { files, root } from '../../branding/common.mjs';
const module = process.argv[2] || 'spanvision-pointcloud-workspace';
const directories = ['src', 'public', 'src-tauri/src', 'src-tauri/icons', 'legal'];
for (const directory of directories) {
  const baseline = path.join(root, module);
  const checkout = path.join(root, 'qa/publication/checkout', module);
  const hash = base => new Map(files(path.join(base, directory)).map(file => [path.relative(base, file), createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  const original = hash(baseline), copied = hash(checkout);
  for (const [file, digest] of original) if (copied.get(file) !== digest) console.log('Missing or changed:', file);
  for (const file of copied.keys()) if (!original.has(file)) console.log('Extra:', file);
  console.log(directory, original.size, copied.size);
}

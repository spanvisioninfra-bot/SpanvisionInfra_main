import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { companyMark } from './company-logo.mjs';

const output = new URL('../deployment/browser-icons/', import.meta.url);
await fs.mkdir(output, {recursive:true});
for (const mode of ['dark','light']) {
  const mark = companyMark(mode).replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
  const background = mode === 'light' ? '#f5f6f8' : '#121212';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="13" fill="${background}"/><g transform="translate(7 7) scale(.188) translate(-72 -32)">${mark}</g></svg>\n`;
  await fs.writeFile(new URL(`company-${mode}.svg`, output),svg);
  for(const size of [32,180]) await sharp(Buffer.from(svg)).resize(size,size).png().toFile(path.join(fileURLToPath(output),`company-${mode}-${size}.png`));
}
console.log('Company browser icons generated for both themes.');

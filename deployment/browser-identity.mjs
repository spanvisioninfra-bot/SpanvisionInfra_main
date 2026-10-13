import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installWorkspaceUi } from './browser-ui.mjs';

const icons = fileURLToPath(new URL('./browser-icons/',import.meta.url));
export function brandBrowserHtml(html, prefix = '/__spanvision-brand/') {
  html = html.replace(/<!-- Spanvision browser identity -->[\s\S]*?<!-- \/Spanvision browser identity -->\r?\n?/g,'');
  // Remove legacy tab/touch icons so Chrome cannot retain the old GW favicon.
  html = html.replace(/<link\b[^>]*>/gi, tag => {
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1].toLowerCase().split(/\s+/) || [];
    return rel.includes('icon') || rel.includes('apple-touch-icon') ? '' : tag;
  }).replace(/<script\b[^>]*\bsrc=["'][^"']*company-favicon\.js["'][^>]*>\s*<\/script>/gi,'');
  const markup = `<!-- Spanvision browser identity -->
<link id="sv-tool-favicon-png" rel="icon" type="image/png" sizes="32x32" href="${prefix}company-dark-32.png">
<link id="sv-tool-favicon" rel="icon" type="image/svg+xml" href="${prefix}company-dark.svg">
<link id="sv-tool-touch-icon" rel="apple-touch-icon" sizes="180x180" href="${prefix}company-dark-180.png">
<script src="${prefix}company-favicon.js" defer></script>
<!-- /Spanvision browser identity -->
`;
  if(!/<\/head>/i.test(html))throw new Error('Browser entry has no head element.');
  return html.replace(/<\/head>/i,markup+'</head>');
}
export async function installBrowserIdentity(directory, {entries=['index.html'],prefix='/__spanvision-brand/'} = {}) {
  await fs.cp(icons,path.join(directory,'__spanvision-brand'),{recursive:true});
  for(const entry of entries) {
    const file = path.join(directory,entry);
    const html = await fs.readFile(file,'utf8');
    await fs.writeFile(file,brandBrowserHtml(html,prefix));
  }
  await installWorkspaceUi(directory,{entries,prefix:prefix.replace('__spanvision-brand','__spanvision-ui')});
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if(!process.argv[2])throw new Error('Provide the browser output directory.');
  await installBrowserIdentity(process.argv[2],{prefix:process.argv[3]||'/__spanvision-brand/'});
}

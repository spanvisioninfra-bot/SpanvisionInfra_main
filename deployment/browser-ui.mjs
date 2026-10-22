import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const assets=fileURLToPath(new URL('./browser-ui/',import.meta.url));
const brand=JSON.parse(await fs.readFile(new URL('../branding/brand.json',import.meta.url),'utf8'));
const release=JSON.parse(await fs.readFile(new URL('../branding/release.json',import.meta.url),'utf8'));
const toolIcons=JSON.parse(await fs.readFile(new URL('../branding/tool-icons.json',import.meta.url),'utf8'));
export async function installWorkspaceUi(directory,{entries=['index.html'],optionalEntries=[],prefix='/__spanvision-ui/'}={}) {
  await fs.cp(assets,path.join(directory,'__spanvision-ui'),{recursive:true});
  const version=createHash('sha256').update(await fs.readFile(path.join(assets,'workspace-ui.css'))).update(await fs.readFile(path.join(assets,'light-mode.css'))).update(await fs.readFile(path.join(assets,'tool-identity.js'))).update(JSON.stringify({release,toolIcons})).digest('hex').slice(0,12);
  for(const entry of [...entries,...optionalEntries]) {
    const file=path.join(directory,entry);
    let html;
    try{html=await fs.readFile(file,'utf8');}
    catch(error){if(error.code==='ENOENT'&&optionalEntries.includes(entry))continue;throw error;}
    html=html.replace(/<!-- Spanvision workspace UI -->[\s\S]*?<!-- \/Spanvision workspace UI -->\r?\n?/g,'');
    if(!/<\/head>/i.test(html))throw new Error('Browser entry has no head element.');
    const id=html.match(/\bdata-module=["']([^"']+)["']/)?.[1];
    const tool=brand.modules.find(module=>module.id===id);
    const identity=tool?JSON.stringify({id:tool.id,label:tool.label,version:release.version,icon:toolIcons[tool.id]}).replaceAll('<','\\u003c'):null;
    if(tool&&!toolIcons[tool.id])throw new Error(`Missing landing-page icon for ${tool.id}`);
    const sessionVersion=createHash('sha256').update(await fs.readFile(path.join(assets,'tool-session.js'))).digest('hex').slice(0,12);
    const markup=`<!-- Spanvision workspace UI -->
<link rel="preload" href="${prefix}Inter-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link id="sv-workspace-ui" rel="stylesheet" href="${prefix}workspace-ui.css?v=${version}">
<link id="sv-light-mode-ui" rel="stylesheet" href="${prefix}light-mode.css?v=${version}">
${identity?`<script id="sv-tool-identity-data" type="application/json">${identity}</script>\n<script src="${prefix}tool-identity.js?v=${version}" defer></script>\n<script src="${prefix}tool-session.js?v=${sessionVersion}" defer></script>\n`:''}<!-- /Spanvision workspace UI -->
`;
    await fs.writeFile(file,html.replace(/<\/head>/i,markup+'</head>'));
  }
}

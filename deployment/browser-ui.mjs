import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const assets=fileURLToPath(new URL('./browser-ui/',import.meta.url));
export async function installWorkspaceUi(directory,{entries=['index.html'],optionalEntries=[],prefix='/__spanvision-ui/'}={}) {
  await fs.cp(assets,path.join(directory,'__spanvision-ui'),{recursive:true});
  const version=createHash('sha256').update(await fs.readFile(path.join(assets,'workspace-ui.css'))).digest('hex').slice(0,12);
  for(const entry of [...entries,...optionalEntries]) {
    const file=path.join(directory,entry);
    let html;
    try{html=await fs.readFile(file,'utf8');}
    catch(error){if(error.code==='ENOENT'&&optionalEntries.includes(entry))continue;throw error;}
    html=html.replace(/<!-- Spanvision workspace UI -->[\s\S]*?<!-- \/Spanvision workspace UI -->\r?\n?/g,'');
    if(!/<\/head>/i.test(html))throw new Error('Browser entry has no head element.');
    const markup=`<!-- Spanvision workspace UI -->
<link rel="preload" href="${prefix}Inter-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link id="sv-workspace-ui" rel="stylesheet" href="${prefix}workspace-ui.css?v=${version}">
<!-- /Spanvision workspace UI -->
`;
    await fs.writeFile(file,html.replace(/<\/head>/i,markup+'</head>'));
  }
}

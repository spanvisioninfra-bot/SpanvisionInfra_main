import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const sources=fileURLToPath(new URL('../commerce/',import.meta.url));
export async function packageCommerce(output){
  const directory=path.join(output,'functions/api/commerce.func');
  await fs.mkdir(directory,{recursive:true});
  for(const file of ['server.mjs','catalog.mjs','access.mjs'])await fs.copyFile(path.join(sources,file),path.join(directory,file));
  await fs.writeFile(path.join(directory,'package.json'),JSON.stringify({type:'module'}));
  await fs.writeFile(path.join(directory,'.vc-config.json'),JSON.stringify({runtime:'nodejs22.x',handler:'server.mjs',launcherType:'Nodejs',shouldAddHelpers:false,maxDuration:60}));
}

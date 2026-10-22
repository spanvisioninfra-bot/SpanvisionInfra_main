import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const sources=fileURLToPath(new URL('../commerce/',import.meta.url));
export async function packageCommerce(output){
  const directory=path.join(output,'functions/api/commerce.func');
  await fs.mkdir(directory,{recursive:true});
  for(const file of ['server.mjs','catalog.mjs','access.mjs','tool-trial.mjs','password-policy.mjs','neon-auth.mjs','neon-store.mjs'])await fs.copyFile(path.join(sources,file),path.join(directory,file));
  const driver=path.join(sources,'node_modules/@neondatabase/serverless');
  const driverOutput=path.join(directory,'node_modules/@neondatabase/serverless');
  await fs.mkdir(driverOutput,{recursive:true});
  for(const file of ['package.json','index.js','index.mjs','LICENSE'])await fs.copyFile(path.join(driver,file),path.join(driverOutput,file));
  await fs.writeFile(path.join(directory,'package.json'),JSON.stringify({type:'module'}));
  await fs.writeFile(path.join(directory,'.vc-config.json'),JSON.stringify({runtime:'nodejs22.x',handler:'server.mjs',launcherType:'Nodejs',shouldAddHelpers:false,maxDuration:60}));
}

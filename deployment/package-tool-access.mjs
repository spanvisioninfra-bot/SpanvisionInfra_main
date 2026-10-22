import fs from 'node:fs/promises';
import path from 'node:path';
export async function packageToolAccess(output,tool){
  const directory=path.join(output,'functions/_spanvision_gate.func');
  await fs.mkdir(directory,{recursive:true});
  await fs.copyFile(new URL('tool-access-edge.js',import.meta.url),path.join(directory,'index.js'));
  await fs.writeFile(path.join(directory,'tool-id.js'),`export const toolId=${JSON.stringify(tool)};\n`);
  await fs.writeFile(path.join(directory,'.vc-config.json'),JSON.stringify({runtime:'edge',entrypoint:'index.js',envVarsInUse:['SPANVISION_ACCOUNT_ORIGIN']}));
  return {src:'/.*',middlewarePath:'_spanvision_gate',continue:true};
}

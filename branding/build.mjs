import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root,brand,write,fingerprint,digest,appDirectory } from './common.mjs';
import { stlInputs, pythonPath } from './stl.mjs';
const requested=process.argv.slice(2);
const modules=brand.modules.filter(m=>!requested.length||requested.includes(m.id));
const out=path.join(root,'qa/suite');fs.mkdirSync(out,{recursive:true});
async function run(command,args,cwd,logName) {
 return new Promise((resolve,reject)=>{
   const log=fs.createWriteStream(path.join(out,logName+'.log'));
   const child=spawn(command,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});
   child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
   child.on('error',error=>{log.end();reject(error);});
   child.on('close',code=>{log.end();code===0?resolve():reject(new Error(`${logName} failed (${code}). See qa/suite/${logName}.log.`));});
 });
}
async function build(module) {
 const cwd=path.join(root,module.directory);
 const dist=path.join(cwd,module.dist);
 fs.rmSync(path.join(dist,'suite-build.json'),{force:true});
 const source=fingerprint(module);
 console.log(`Building ${module.label}…`);
 if(module.kind==='studio') {
   const app=appDirectory(module);
   if(module.id==='calculation') {
     await run(process.execPath,[path.join(cwd,'node_modules/typescript/bin/tsc'),'-p','packages/core/tsconfig.json'],cwd,'calculation-core');
     const tsc=fs.existsSync(path.join(cwd,'packages/desktop/node_modules/typescript/bin/tsc'))?path.join(cwd,'packages/desktop/node_modules/typescript/bin/tsc'):path.join(cwd,'node_modules/typescript/bin/tsc');
     await run(process.execPath,[tsc,'--noEmit'],path.join(cwd,'packages/desktop'),'calculation-typecheck');
   } else if(module.id!=='frame') {
     await run(process.execPath,[path.join(app,'node_modules/typescript/bin/tsc'),'--noEmit'],app,module.id+'-typecheck');
   }
   const vite=fs.existsSync(path.join(app,'node_modules/vite/bin/vite.js'))?path.join(app,'node_modules/vite/bin/vite.js'):path.join(cwd,'node_modules/vite/bin/vite.js');
   await run(process.execPath,[vite,'build'],app,module.id+'-build');
 } else if(module.id==='bim') {
   const app=appDirectory(module);
   await run(process.execPath,[path.join(app,'node_modules/typescript/bin/tsc'),'-b','tsconfig.build.json'],app,'bim-typecheck');
   await run(process.execPath,[path.join(app,'node_modules/vite/bin/vite.js'),'build'],app,'bim-build');
 } else if(module.id==='pile') {
   await run(process.execPath,[path.join(cwd,'tools/build-browser.mjs')],appDirectory(module),'pile-build');
 } else if(module.id==='stl') {
   await run(pythonPath(),['-m','compileall','-q','app','run_app.py'],cwd,'stl-compile');
   fs.mkdirSync(dist,{recursive:true});
   fs.cpSync(path.join(cwd,'web'),path.join(dist,'web'),{recursive:true});
   fs.copyFileSync(path.join(cwd,'web/index.html'),path.join(dist,'index.html'));
 } else if(module.id==='cad') {
   // Local preview retains the release-compiled engine and skips only the expensive final wasm-opt pass.
   const previewHtml=fs.readFileSync(path.join(cwd,'web-app.html'),'utf8').replace('data-bin="SpanvisionCAD"','data-bin="SpanvisionCAD" data-wasm-opt="0"');
   fs.writeFileSync(path.join(cwd,'.suite-web-app.html'),previewHtml);
   if(process.platform!=='win32')await run('bash',['-lc','CARGO_TARGET_DIR=/tmp/spanvision-target trunk build --locked --release --no-sri=true .suite-web-app.html && sh scripts/assemble-site.sh dist'],cwd,'cad-build');
   else {
     const linuxPath='/mnt/'+cwd[0].toLowerCase()+cwd.slice(2).replaceAll('\\','/');
     await run('wsl',['-d','kali-linux','--','bash','-lc',`cd '${linuxPath.replaceAll("'","'\\''")}' && CARGO_TARGET_DIR=/tmp/spanvision-target trunk build --locked --release --no-sri=true .suite-web-app.html && sh scripts/assemble-site.sh dist`],cwd,'cad-build');
   }
 } else {
   const app=appDirectory(module);
   if(['geo','speech','field','pointcloud'].includes(module.id)) await run(process.execPath,[path.join(app,'node_modules/typescript/bin/tsc'),'--noEmit'],app,module.id+'-typecheck');
   // Build the browser entry directly, bypassing only native runtime preparation.
   await run(process.execPath,[path.join(app,'node_modules/vite/bin/vite.js'),'build'],app,module.id+'-build');
 }
 if(fingerprint(module)!==source)throw new Error(`${module.label} source changed during its build; rebuild before previewing.`);
 write(path.relative(root,path.join(dist,'suite-build.json')),JSON.stringify({id:module.id,brandDigest:digest(module),sourceFingerprint:source,builtAt:new Date().toISOString(),...(module.id==='stl'?{inputs:stlInputs(module)}:{})},null,2)+'\n');
 console.log(`${module.label} built and stamped.`);
}
const result={};
for(const module of modules) {
 try {await build(module);result[module.id]='passed';}
 catch(error){result[module.id]=error.message;console.error(error.message);}
}
if(!requested.length||requested.includes('hub')) {
 try {const hub={id:'hub',directory:'suite-hub'};const source=fingerprint(hub);await run(process.execPath,[path.join(root,'suite-hub/node_modules/vite/bin/vite.js'),'build'],path.join(root,'suite-hub'),'hub-build');if(source!==fingerprint(hub))throw new Error('Hub source changed during its build.');write('suite-hub/dist/suite-build.json',JSON.stringify({brandDigest:digest(),sourceFingerprint:source,builtAt:new Date().toISOString()},null,2)+'\n');result.hub='passed';}
 catch(error){result.hub=error.message;console.error(error.message);}
}
const previous=fs.existsSync(path.join(out,'build-results.json'))?JSON.parse(fs.readFileSync(path.join(out,'build-results.json'),'utf8')):{};
write('qa/suite/build-results.json',JSON.stringify({...previous,...result},null,2)+'\n');
if(Object.values(result).some(value=>value!=='passed'))process.exitCode=1;

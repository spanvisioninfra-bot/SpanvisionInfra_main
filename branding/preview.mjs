import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { root,brand,digest,fingerprint } from './common.mjs';
import { startStl, stopStl } from './stl.mjs';
import { startBim, stopBim } from './bim.mjs';
const children=[];
const servers=[];
const status=brand.modules.map(module=>({...module,available:false,message:'Preview has not started.'}));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.pdf':'application/pdf','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.ifc':'application/octet-stream'};
export function serve(directory,port,hub=false,cad=false) {
 const server=http.createServer((req,res)=>{
   res.setHeader('Cache-Control','no-store');
   if(cad){res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');}
   if(hub&&req.url==='/__suite/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({modules:status}));return;}
   if(port===brand.modules.find(item=>item.id==='fem')?.port && /^\/api\/(toetsing|doorsnede)$/.test(req.url)) {
     if(req.method!=='POST'){res.writeHead(405,{'Allow':'POST'}).end();return;}
     const upstream=http.request({hostname:'127.0.0.1',port:10000,path:req.url,method:'POST',headers:{'Content-Type':'application/json'}},reply=>{
       res.writeHead(reply.statusCode||502,{'Content-Type':reply.headers['content-type']||'application/json'});
       reply.pipe(res);
     });
     upstream.setTimeout(35000,()=>upstream.destroy(new Error('Calculation service timed out.')));
     upstream.on('error',()=>{
       if(res.headersSent){res.destroy();return;}
       res.writeHead(503,{'Content-Type':'application/json'});
       res.end(JSON.stringify({detail:'Start the FEM calculation API on port 10000 to run this check.'}));
     });
     req.on('aborted',()=>upstream.destroy());
     req.pipe(upstream);return;
   }
   if(req.url==='/__pointcloud/status'&&port===brand.modules.find(item=>item.id==='pointcloud')?.port){
     if([`http://127.0.0.1:${brand.hub.port}`,`http://localhost:${brand.hub.port}`].includes(req.headers.origin))res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
     res.setHeader('Content-Type','application/json');res.end(JSON.stringify(status.find(item=>item.id==='pointcloud')));return;
   }
   if(req.url==='/__speech/status'&&port===brand.modules.find(item=>item.id==='speech')?.port){
     const item=status.find(item=>item.id==='speech');
     if(req.headers.origin===`http://127.0.0.1:${brand.hub.port}`||req.headers.origin===`http://localhost:${brand.hub.port}`)res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
     res.setHeader('Content-Type','application/json');res.end(JSON.stringify(item));return;
   }
   let pathname;
   try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
   let file=path.resolve(directory,'.'+pathname);
   if(file!==directory&&!file.startsWith(directory+path.sep)){res.writeHead(403);res.end();return;}
   if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
   if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('File not found');return;}
   res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
   const size=fs.statSync(file).size;const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
   if(range){const start=Number(range[1]),end=range[2]?Number(range[2]):size-1;if(start>end||end>=size){res.writeHead(416);res.end();return;}res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1,'Accept-Ranges':'bytes'});if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).pipe(res);}
   else {res.setHeader('Content-Length',size);if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);}
 });
 return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{servers.push(server);resolve(server);});});
}
for(const item of status) {
 const module=brand.modules.find(module=>module.id===item.id);
 const directory=path.join(root,item.directory,item.dist);
 try {
   const stamp=JSON.parse(fs.readFileSync(path.join(directory,'suite-build.json'),'utf8'));
   if(stamp.brandDigest!==digest(module)||stamp.sourceFingerprint!==fingerprint(module))throw new Error('Rebuild this module to preview the latest edition.');
   if(!fs.existsSync(path.join(directory,item.id==='bim'?'':item.path,'index.html')))throw new Error('Browser entry is missing. Rebuild this module.');
   try {
     if(item.id==='bim'){const child=await startBim(module);if(child)children.push({child,stop:stopBim});}
     else if(item.id==='stl'){const child=await startStl(module);if(child)children.push({child,stop:stopStl});}
     else await serve(directory,item.port,false,item.id==='cad');
   }
   catch(error) {
     if(error.code!=='EADDRINUSE')throw error;
     // Reuse a server only when it actually serves this exact built module.
     const response=await fetch(`http://127.0.0.1:${item.port}/suite-build.json`,{signal:AbortSignal.timeout(1500)});
     const active=await response.json();
     if(active.id!==module.id||active.brandDigest!==stamp.brandDigest||active.sourceFingerprint!==stamp.sourceFingerprint)throw new Error('Preview port is occupied by a different or outdated server.');
   }
   item.available=true;item.message='Ready to open';
 } catch(error){item.message=error.code==='ENOENT'?'Build this module to make its preview available.':error.message;}
 console.log(`${item.label}: ${item.available?`http://127.0.0.1:${item.port}${item.path}`:item.message}`);
}
const hubDir=path.join(root,'suite-hub/dist');
try {
 const stamp=JSON.parse(fs.readFileSync(path.join(hubDir,'suite-build.json'),'utf8'));
 if(stamp.brandDigest!==digest()||stamp.sourceFingerprint!==fingerprint({id:'hub',directory:'suite-hub'}))throw new Error('Rebuild the hub to preview the latest edition.');
 await serve(hubDir,brand.hub.port,true);
 console.log(`${brand.hub.organization||brand.organization}: http://127.0.0.1:${brand.hub.port}`);
} catch(error){for(const {child,stop} of children)stop(child);for(const server of servers)server.close();console.error(error.message);process.exitCode=1;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const {child,stop} of children)stop(child);for(const server of servers)server.close();process.exit(0);});

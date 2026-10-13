import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHandler} from './server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const staticRoot=path.join(root,'suite-hub/dist');
const port=Number(process.env.PORT||4231);
const origin=`http://127.0.0.1:${port}`;
const handler=createHandler({env:{...process.env,SITE_URL:origin}});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.wasm':'application/wasm','.txt':'text/plain'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,origin);
    if(url.pathname.startsWith('/api/'))return handler(req,res);
    if(url.pathname==='/__suite/status'){
      res.setHeader('Content-Type','application/json');res.end(await fs.readFile(path.join(root,'deployment/production.json')));return;
    }
    const requested=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
    const file=path.resolve(staticRoot,requested);
    if(!file.startsWith(staticRoot+path.sep)){res.writeHead(403).end();return;}
    const data=await fs.readFile(file);
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500).end('Preview file unavailable');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Spanvision home preview: ${origin}`));

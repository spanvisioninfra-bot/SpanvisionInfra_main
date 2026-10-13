// Local review only. This server is outside the production deployment package.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {plans,regions} from '../../commerce/catalog.mjs';
import {planAccess} from '../../commerce/access.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const staticRoot=path.join(root,'suite-hub/dist');
const port=4232,origin=`http://127.0.0.1:${port}`;
const admin={id:'22345678-1234-4234-8234-123456789abc',name:'Spanvision Admin',email:'spanvisioninfra.admin@gmail.com',role:'super_admin',emailVerified:true,permissions:['users:read','plans:write','plans:all']};
const users=[admin,
  {id:'12345678-1234-4234-8234-123456789abc',name:'Aarav Mehta · Sample',email:'aarav@example.test',role:'member',emailVerified:true,permissions:[]},
  {id:'32345678-1234-4234-8234-123456789abc',name:'Olivia Carter · Sample',email:'olivia@example.test',role:'member',emailVerified:true,permissions:[]},
  {id:'42345678-1234-4234-8234-123456789abc',name:'James Wilson · Sample',email:'james@example.test',role:'member',emailVerified:true,permissions:[]},
];
const subscriptions=new Map([
  [users[2].id,[{user_id:users[2].id,provider:'stripe',plan_key:'STUDIO_MONTHLY_USD',status:'active',current_period_end:'2030-01-01T00:00:00Z'}]],
  [users[3].id,[{user_id:users[3].id,provider:'stripe',plan_key:'TEAM_MONTHLY_GBP',status:'active',current_period_end:'2030-01-01T00:00:00Z'}]],
]);
let signedIn=true;
const overrides=new Map(),audit=new Map();
const detail=user=>({user,subscriptions:subscriptions.get(user.id)||[],override:overrides.get(user.id)||null,access:planAccess(user,subscriptions.get(user.id)||[],overrides.get(user.id)||null),audit:audit.get(user.id)||[]});
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.wasm':'application/wasm','.txt':'text/plain'};
const banner=`<aside aria-label="Preview notice" style="position:relative;z-index:5;padding:12px 24px;border-bottom:1px solid currentColor;text-align:center;font:13px/1.6 Inter,Arial,sans-serif"><strong>Admin preview · Sample data</strong> — Plan changes stay in this preview. <a href="/_preview/reset" style="color:inherit;text-decoration:underline;margin-left:12px">Reset preview</a></aside>`;

http.createServer(async(req,res)=>{
  try{
    if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403).end('Local preview only');return;}
    const url=new URL(req.url,origin);
    if(url.pathname==='/_preview/reset'){
      signedIn=true;overrides.clear();audit.clear();res.writeHead(303,{Location:'/#admin','Cache-Control':'no-store'}).end();return;
    }
    if(url.pathname.startsWith('/api/')){
      if(req.method==='POST'&&req.headers.origin!==origin){json(res,{error:'Use the local preview page.'},403);return;}
      if(url.pathname==='/api/account/config'){json(res,{demo:true,authAvailable:true,pricingApproved:false,checkoutAvailable:false,plans,regions});return;}
      if(url.pathname==='/api/account/session'){json(res,{user:signedIn?admin:null});return;}
      if(url.pathname==='/api/account/sign-out'&&req.method==='POST'){signedIn=false;json(res,{signedOut:true});return;}
      if(!signedIn){json(res,{error:'The sample session is signed out. Choose Reset preview to continue.'},401);return;}
      if(url.pathname==='/api/billing/status'){json(res,{subscriptions:[],access:detail(admin).access});return;}
      if(url.pathname==='/api/admin/users'){
        json(res,{users:users.map(user=>{const value=detail(user);return {...user,subscriptions:value.subscriptions,override:value.override,access:value.access};}),page:1,perPage:50,total:users.length,hasNext:false});return;
      }
      if(url.pathname==='/api/admin/user'){
        const user=users.find(value=>value.id===url.searchParams.get('user'));
        json(res,user?detail(user):{error:'Sample user not found.'},user?200:404);return;
      }
      if(url.pathname==='/api/admin/plan'&&req.method==='POST'){
        let body='';for await(const chunk of req){body+=chunk;if(body.length>8192){json(res,{error:'Preview request is too large.'},413);return;}}
        let value;try{value=JSON.parse(body);}catch{json(res,{error:'Invalid preview request.'},400);return;}
        const user=users.find(item=>item.id===value.userId),reason=typeof value.reason==='string'?value.reason.trim():'';
        if(!user||user.role==='super_admin'||(value.plan!==null&&!plans.some(plan=>plan.id===value.plan))||reason.length<3||reason.length>500||(value.expiresAt&&!Number.isFinite(Date.parse(value.expiresAt)))){json(res,{error:'Select a sample member and valid plan, then provide a reason.'},400);return;}
        const before=overrides.get(user.id)||null;
        const after=value.plan?{user_id:user.id,plan_id:value.plan,expires_at:value.expiresAt||null,reason,updated_by:admin.id,updated_at:new Date().toISOString()}:null;
        if(after)overrides.set(user.id,after);else overrides.delete(user.id);
        audit.set(user.id,[{id:randomUUID(),actor_id:admin.id,action:after?'grant':'clear',before_state:before,after_state:after,reason,created_at:new Date().toISOString()},...(audit.get(user.id)||[])].slice(0,20));
        json(res,{saved:true,demo:true});return;
      }
      json(res,{error:'This preview uses sample users. Real sign-in and payments are not connected.'},409);return;
    }
    if(url.pathname==='/__suite/status'){res.setHeader('Content-Type','application/json');res.end(await fs.readFile(path.join(root,'deployment/production.json')));return;}
    const requested=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
    const file=path.resolve(staticRoot,requested);
    if(!file.startsWith(staticRoot+path.sep)){res.writeHead(403).end();return;}
    let data=await fs.readFile(file);
    if(file===path.join(staticRoot,'index.html'))data=data.toString().replace('<div id="root">',`${banner}<div id="root">`);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500).end('Preview file unavailable');}
}).listen(port,'127.0.0.1',()=>console.log(`Sample admin preview: ${origin}/#admin`));

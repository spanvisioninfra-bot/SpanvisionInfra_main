// Runs on Vercel's server, before static files and backend rewrites.
// No account secret or provider credential is distributed to tool projects.
import {toolId} from './tool-id.js';
const cookieName='__Host-sv-tool';
const checks=new Map();
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export function accountOrigin(env){
  const origin=new URL(env.SPANVISION_ACCOUNT_ORIGIN||'https://www.spanvisioninfra.com');
  if(origin.username||origin.password||(origin.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(origin.hostname)))throw new Error('Invalid account origin');
  return origin.origin;
}
export async function verify(ticket,tool,origin,fetcher=fetch,now=Date.now()){
  if(typeof ticket!=='string'||!ticket||ticket.length>1600)return {allowed:false,status:401};
  const key=origin+'\0'+tool+'\0'+ticket;
  if(checks.get(key)?.until>now)return checks.get(key).value;
  const response=await fetcher(origin+'/api/account/tool-verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket,tool}),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)return {allowed:false,status:[401,402].includes(response.status)?response.status:503};
  const data=await response.json(),expiry=Date.parse(data.expiresAt);
  if(data.allowed!==true||data.tool!==tool||!(expiry>now))return {allowed:false,status:401};
  if(checks.size>=128)checks.delete(checks.keys().next().value);
  const value={allowed:true,expiresAt:data.expiresAt,features:data.features||{}};
  checks.set(key,{until:Math.min(now+15000,expiry),value});
  return value;
}
export function safeNext(value){
  return typeof value==='string'&&value.length<2048&&value.startsWith('/')&&!value.startsWith('//')&&!/[\\\x00-\x20]/.test(value)&&!value.startsWith('/__spanvision/')?value:'/';
}
export async function guard(request,{tool=toolId,env=process.env,fetcher=fetch}={}){
  const url=new URL(request.url),origin=accountOrigin(env);
  const launch=new URL('/launch/'+encodeURIComponent(tool),origin);
  try{
    if(url.pathname==='/__spanvision/access'){
      if(request.method!=='POST'||request.headers.get('origin')!==origin||!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return Response.json({error:'Open this tool from your account.'},{status:403,headers});
      if(Number(request.headers.get('content-length')||0)>4096)return new Response(null,{status:413,headers});
      const raw=await request.text();if(raw.length>4096)return new Response(null,{status:413,headers});
      const body=new URLSearchParams(raw),ticket=body.get('ticket');
      const access=await verify(ticket,tool,origin,fetcher);
      if(!access.allowed)return Response.json({error:'Your tool session could not be opened. Return to your account.',launchUrl:launch.href},{status:access.status,headers});
      const maxAge=Math.max(0,Math.floor((Date.parse(access.expiresAt)-Date.now())/1000));
      const response=new Response(null,{status:303,headers:{...headers,Location:new URL(safeNext(body.get('next')),url.origin).href,'Set-Cookie':`${cookieName}=${ticket}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}});
      if(['light','dark'].includes(body.get('appearance')))response.headers.append('Set-Cookie',`sv-appearance=${body.get('appearance')}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`);
      return response;
    }
    const ticket=(request.headers.get('cookie')||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    const access=await verify(ticket,tool,origin,fetcher);
    if(url.pathname==='/__spanvision/session')return Response.json({...access,launchUrl:launch.href},{status:access.allowed?200:access.status,headers});
    if(access.allowed)return new Response(null,{headers:{...headers,'x-middleware-next':'1'}});
    if(access.status===503)return Response.json({error:'Access checks are temporarily unavailable. Please try again.'},{status:503,headers});
    if(['GET','HEAD'].includes(request.method)&&(request.headers.get('accept')||'').includes('text/html'))return new Response(null,{status:303,headers:{...headers,Location:launch.href}});
    return Response.json({error:'A trial or paid tool session is required.',launchUrl:launch.href},{status:access.status,headers});
  }catch{return Response.json({error:'Access checks are temporarily unavailable. Please try again.'},{status:503,headers});}
}
export default guard;

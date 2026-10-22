import {createHmac,timingSafeEqual} from 'node:crypto';

export const toolIds=Object.freeze(['cad','cad2d','bim','pdf','ifc','calc','planner','fem','frame','calculation','geo','speech','stl','field','pointcloud','pile']);
export const trialPolicy=Object.freeze({days:2,hours:48,dailyLimit:3,scope:'all_tools',starts:'first_launch',reset:'every_24_hours_from_first_launch'});
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
const signature=(value,secret)=>createHmac('sha256',secret).update('spanvision-tool-access-v1\0'+value).digest();

export function issueToolTicket(grant,user,tool,secret){
  if(!secret||secret.length<32||!toolIds.includes(tool)||!validId(user.id)||!grant.allowed)throw new Error('Tool access is not configured.');
  const value=Buffer.from(JSON.stringify({v:1,sub:user.id,tool,grant:grant.grantId,exp:Math.floor(Date.parse(grant.expiresAt)/1000)})).toString('base64url');
  return value+'.'+signature(value,secret).toString('base64url');
}

export function readToolTicket(ticket,secret,now=Date.now()){
  try{
    if(!secret||secret.length<32||typeof ticket!=='string'||ticket.length>1600)return null;
    const parts=ticket.split('.');
    if(parts.length!==2||parts.some(part=>!part||!/^[A-Za-z0-9_-]+$/.test(part)))return null;
    const provided=Buffer.from(parts[1],'base64url'),expected=signature(parts[0],secret);
    if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return null;
    const value=JSON.parse(Buffer.from(parts[0],'base64url'));
    return value.v===1&&validId(value.sub)&&toolIds.includes(value.tool)&&/^[0-9a-f-]{36}$/i.test(value.grant)
      &&Number.isSafeInteger(value.exp)&&value.exp*1000>now?value:null;
  }catch{return null;}
}

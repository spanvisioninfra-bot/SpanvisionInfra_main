// Operator-only credential provisioning. This file is never packaged as a website endpoint.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {SUPER_ADMIN_EMAIL} from './access.mjs';
import {neonAuthUrl,neonRequest} from './neon-auth.mjs';

const runFile=promisify(execFile);
const project=fileURLToPath(new URL('../',import.meta.url));
export const defaultCredentialsFile=path.join(os.homedir(),process.platform==='win32'?'AppData/Local':'.config','SpanvisionInfra/private/admin-credentials.json');

async function privateDirectory(directory){
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  if(process.platform==='win32'){
    const identity=`${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
    if(!process.env.USERDOMAIN||!process.env.USERNAME)throw new Error('The Windows identity is unavailable; credentials were not written.');
    await runFile(path.join(process.env.SystemRoot||'C:/Windows','System32/icacls.exe'),
      [directory,'/inheritance:r','/grant:r',`${identity}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{windowsHide:true});
  }else await fs.chmod(directory,0o700);
}

function summary(record,file){
  return {email:record.email,userId:record.userId||null,status:record.status,credentialsFile:file,
    verificationRequired:record.status==='verification_pending'||record.status==='reset_pending'};
}

export async function provisionAdmin({env,mode='create',code,file=defaultCredentialsFile,fetcher=fetch}={}){
  const authUrl=neonAuthUrl(env||{});
  if(!authUrl)throw new Error('Set NEON_AUTH_BASE_URL to your Neon Auth URL.');
  const site=new URL(env.SITE_URL||'https://www.spanvisioninfra.com');
  if(site.protocol!=='https:')throw new Error('Use the HTTPS production website origin.');
  const target=path.resolve(file),relative=path.relative(path.resolve(project),target);
  if(!relative.startsWith('..')&&!path.isAbsolute(relative))throw new Error('Store admin credentials outside the Git checkout.');
  if(!['create','verify','reset','resend','status'].includes(mode))throw new Error('Choose create, verify, reset, resend or status.');
  let record;
  try{record=JSON.parse(await fs.readFile(target,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('The private credentials file could not be read.');}
  if(record&&(record.email!==SUPER_ADMIN_EMAIL||record.authUrl!==authUrl||typeof record.password!=='string'))
    throw new Error('The private credential file belongs to a different account or project.');
  async function save(){await privateDirectory(path.dirname(target));await fs.writeFile(target,JSON.stringify(record,null,2)+'\n',{mode:0o600});}
  if(mode==='status'){
    if(!record)throw new Error('No administrator credentials have been prepared yet.');
    return summary(record,target);
  }
  if(!record){
    if(mode!=='create'&&mode!=='reset')throw new Error('Create or reset the administrator credentials first.');
    record={version:1,email:SUPER_ADMIN_EMAIL,password:randomBytes(24).toString('base64url')+'aA7!',authUrl,
      userId:null,status:'prepared',preparedAt:new Date().toISOString()};
    await save();
  }
  const call=(endpoint,body)=>neonRequest(env,endpoint,body,fetcher,site.origin);
  if(mode==='create'){
    if(record.status==='ready'||record.status==='verification_pending')return summary(record,target);
    const created=await call('sign-up/email',{email:record.email,password:record.password,name:'Spanvision Infra Administrator'});
    if(!created.response.ok){
      const existing=['USER_ALREADY_EXISTS','USER_ALREADY_EXIST','USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'].includes(created.data?.code);
      record.status=existing?'existing_account':'creation_failed';await save();
      if(existing)throw new Error('This administrator already exists. Use reset to set the generated password through an email code.');
      throw new Error(`Neon rejected account creation (${created.response.status}${created.data?.code?'; '+created.data.code:''}). Check email/password sign-up and the trusted production origin.`);
    }
    const user=created.data?.user;
    if(typeof user?.id!=='string'||String(user.email).trim().toLowerCase()!==record.email)throw new Error('The created provider account could not be verified.');
    record.userId=user.id;record.status='verification_pending';await save();
  }else if(mode==='reset'){
    const requested=await call('email-otp/request-password-reset',{email:record.email});
    if(!requested.response.ok||requested.data?.success!==true)throw new Error('Neon could not send the password-reset code.');
    record.status='reset_pending';await save();
  }else if(mode==='resend'){
    if(!['verification_pending','reset_pending'].includes(record.status))throw new Error('No email code is pending.');
    const requested=record.status==='reset_pending'
      ?await call('email-otp/request-password-reset',{email:record.email})
      :await call('email-otp/send-verification-otp',{email:record.email,type:'email-verification'});
    if(!requested.response.ok||requested.data?.success!==true)throw new Error('Neon could not send a new email code.');
  }else if(mode==='verify'){
    if(!/^\d{6,8}$/.test(code||''))throw new Error('Enter the 6–8 digit email code when prompted.');
    if(!['verification_pending','reset_pending'].includes(record.status))throw new Error('No email verification or password reset is pending.');
    const verified=record.status==='reset_pending'
      ?await call('email-otp/reset-password',{email:record.email,otp:code,password:record.password})
      :await call('email-otp/verify-email',{email:record.email,otp:code});
    if(!verified.response.ok||(record.status==='reset_pending'?verified.data?.success!==true:verified.data?.status!==true))
      throw new Error('The email code was rejected or expired. Request a new code.');
    const login=await call('sign-in/email',{email:record.email,password:record.password,rememberMe:false});
    const user=login.data?.user;
    if(!login.response.ok||typeof user?.id!=='string'||user.emailVerified!==true
      ||String(user.email).trim().toLowerCase()!==record.email)
      throw new Error('The email step completed, but the generated password and verified identity could not be confirmed. Use the owner password-reset flow if this account already existed.');
    record.userId=user.id;record.status='ready';record.verifiedAt=new Date().toISOString();await save();
    // Revoke the helper's provider session. The owner signs in normally through the website.
    if(login.credential)await neonRequest(env,'sign-out',{},fetcher,site.origin,login.credential);
  }
  return summary(record,target);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const mode=process.argv[2]||'create';let code;
    if(mode==='verify'){
      const input=createInterface({input:process.stdin,output:process.stdout});
      try{code=(await input.question('Verification code from the administrator email: ')).trim();}finally{input.close();}
    }
    console.log(JSON.stringify(await provisionAdmin({env:process.env,mode,code}),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}

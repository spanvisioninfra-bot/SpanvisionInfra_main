export const SUPER_ADMIN_EMAIL='spanvisioninfra.admin@gmail.com';
const levels=['explorer','studio','team'];
const text=value=>typeof value==='string'?value:'';

// Authorization uses the identity returned by Supabase, never signup metadata or request fields.
export function publicUser(record,env={}){
  const verified=!!record.email_confirmed_at&&Number.isFinite(Date.parse(record.email_confirmed_at));
  const admin=verified&&record.is_anonymous!==true&&text(record.email).trim().toLowerCase()===SUPER_ADMIN_EMAIL
    &&!!env.SUPER_ADMIN_USER_ID&&record.id===env.SUPER_ADMIN_USER_ID;
  return {id:record.id,email:text(record.email),name:text(record.user_metadata?.full_name).slice(0,80),emailVerified:verified,
    role:admin?'super_admin':'member',permissions:admin?['users:read','plans:write','plans:all']:[]};
}

export function planAccess(user,subscriptions=[],override=null,now=Date.now()){
  if(user.role==='super_admin')return {plan:'team',plans:[...levels],source:'super_admin',expiresAt:null};
  if(override&&levels.includes(override.plan_id)&&(!override.expires_at||Date.parse(override.expires_at)>now)){
    return {plan:override.plan_id,plans:levels.slice(0,levels.indexOf(override.plan_id)+1),source:'admin',expiresAt:override.expires_at||null};
  }
  let level=0,end=null;
  for(const subscription of subscriptions){
    if(!['active','trialing'].includes(subscription.status)||(subscription.current_period_end&&!(Date.parse(subscription.current_period_end)>now)))continue;
    const plan=text(subscription.plan_key).startsWith('TEAM_')?'team':text(subscription.plan_key).startsWith('STUDIO_')?'studio':null;
    if(plan&&levels.indexOf(plan)>level){level=levels.indexOf(plan);end=subscription.current_period_end||null;}
  }
  return {plan:levels[level],plans:levels.slice(0,level+1),source:level?'subscription':'free',expiresAt:end};
}

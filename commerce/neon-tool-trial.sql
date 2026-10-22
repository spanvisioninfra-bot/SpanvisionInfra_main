-- Two-day tool trial. Apply after neon-schema.sql; safe to run again.
begin;
create table if not exists spanvision_commerce.tool_trials (
  user_id text primary key references spanvision_commerce.accounts(id) on delete cascade,
  started_at timestamptz not null default clock_timestamp()
);
create table if not exists spanvision_commerce.tool_launch_grants (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references spanvision_commerce.accounts(id) on delete cascade,
  request_id uuid not null,
  tool_id text not null check (tool_id in ('cad','cad2d','bim','pdf','ifc','calc','planner','fem','frame','calculation','geo','speech','stl','field','pointcloud','pile')),
  access_source text not null check (access_source in ('trial','subscription','admin','super_admin')),
  trial_day integer check (trial_day in (0,1)),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,request_id)
);
create index if not exists tool_launch_trial_day on spanvision_commerce.tool_launch_grants(user_id,trial_day) where access_source='trial';
alter table spanvision_commerce.tool_trials enable row level security;
alter table spanvision_commerce.tool_launch_grants enable row level security;
revoke all on spanvision_commerce.tool_trials,spanvision_commerce.tool_launch_grants from public;
grant select,insert,update on spanvision_commerce.tool_trials,spanvision_commerce.tool_launch_grants to spanvision_commerce_server;
drop policy if exists server_access on spanvision_commerce.tool_trials;
create policy server_access on spanvision_commerce.tool_trials to spanvision_commerce_server using(true) with check(true);
drop policy if exists server_access on spanvision_commerce.tool_launch_grants;
create policy server_access on spanvision_commerce.tool_launch_grants to spanvision_commerce_server using(true) with check(true);
create or replace function spanvision_commerce.tool_trial_status(account_id text)
returns jsonb language plpgsql security invoker set search_path=spanvision_commerce,pg_temp as $$
declare started timestamptz; moment timestamptz:=clock_timestamp(); day_number integer; used integer;
begin
  select started_at into started from tool_trials where user_id=account_id;
  if not found then return jsonb_build_object('status','not_started','remaining',3,'days',2,'dailyLimit',3); end if;
  if moment>=started+interval '48 hours' then
    return jsonb_build_object('status','expired','startedAt',started,'expiresAt',started+interval '48 hours','remaining',0,'days',2,'dailyLimit',3);
  end if;
  day_number:=greatest(0,floor(extract(epoch from (moment-started))/86400)::integer);
  select count(*) into used from tool_launch_grants where user_id=account_id and access_source='trial' and trial_day=day_number;
  return jsonb_build_object('status',case when used>=3 then 'daily_limit' else 'available' end,
    'startedAt',started,'expiresAt',started+interval '48 hours','remaining',greatest(0,3-used),
    'day',day_number+1,'days',2,'dailyLimit',3,'nextResetAt',started+(day_number+1)*interval '24 hours');
end $$;

create or replace function spanvision_commerce.claim_tool_launch(account_id text,selected_tool text,launch_request uuid,
  access_source text,access_expires timestamptz)
returns jsonb language plpgsql security invoker set search_path=spanvision_commerce,pg_temp as $$
declare existing tool_launch_grants; started timestamptz; moment timestamptz; day_number integer; trial jsonb; expiry timestamptz; grant_id uuid;
begin
  -- Serialize all tools for one account; multiple tabs cannot overrun the daily allowance.
  perform id from spanvision_commerce.accounts where id=account_id for update;
  if not found then raise exception 'Account not found'; end if;
  if access_source not in ('trial','subscription','admin','super_admin') or access_source is null then raise exception 'Invalid access source'; end if;
  if selected_tool not in ('cad','cad2d','bim','pdf','ifc','calc','planner','fem','frame','calculation','geo','speech','stl','field','pointcloud','pile') then raise exception 'Invalid tool'; end if;
  moment:=clock_timestamp();
  select * into existing from tool_launch_grants where user_id=account_id and request_id=launch_request;
  if found then
    if existing.tool_id<>selected_tool then raise exception 'Launch request belongs to another tool'; end if;
    return jsonb_build_object('allowed',existing.expires_at>moment,'grantId',existing.id,'expiresAt',existing.expires_at,
      'source',existing.access_source,'trial',tool_trial_status(account_id));
  end if;
  if access_source='trial' then
    insert into tool_trials(user_id) values(account_id) on conflict(user_id) do nothing;
    select started_at into started from tool_trials where user_id=account_id for update;
    trial:=tool_trial_status(account_id);
    if trial->>'status' in ('expired','daily_limit') then
      return jsonb_build_object('allowed',false,'trial',trial);
    end if;
    day_number:=greatest(0,floor(extract(epoch from (moment-started))/86400)::integer);
    expiry:=started+(day_number+1)*interval '24 hours';
  else
    expiry:=least(moment+interval '24 hours',coalesce(access_expires,moment+interval '24 hours'));
    if expiry<=moment then return jsonb_build_object('allowed',false); end if;
  end if;
  insert into tool_launch_grants(user_id,request_id,tool_id,access_source,trial_day,expires_at)
    values(account_id,launch_request,selected_tool,access_source,day_number,expiry) returning id into grant_id;
  return jsonb_build_object('allowed',true,'grantId',grant_id,'expiresAt',expiry,'source',access_source,'trial',tool_trial_status(account_id));
end $$;
revoke all on function spanvision_commerce.tool_trial_status(text),spanvision_commerce.claim_tool_launch(text,text,uuid,text,timestamptz) from public;
grant execute on function spanvision_commerce.tool_trial_status(text),spanvision_commerce.claim_tool_launch(text,text,uuid,text,timestamptz) to spanvision_commerce_server;
commit;

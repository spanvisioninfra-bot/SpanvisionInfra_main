-- Apply after schema.sql and tool-trial.sql. Safe to run again.
begin;
create table if not exists public.tool_day_passes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  receipt text not null unique,
  order_id text unique, payment_id text unique,
  state text not null default 'creating' check(state in ('creating','uncertain','ready','paid','refunded')),
  created_at timestamptz not null default clock_timestamp(),
  activated_at timestamptz, expires_at timestamptz,
  check ((activated_at is null and expires_at is null) or
    (activated_at is not null and expires_at=activated_at+interval '24 hours' and payment_id is not null))
);
alter table public.tool_day_passes enable row level security;
revoke all on public.tool_day_passes from public,anon,authenticated;
grant select,insert,update on public.tool_day_passes to service_role;
drop policy if exists server_access on public.tool_day_passes;
create policy server_access on public.tool_day_passes to service_role using(true) with check(true);
alter table public.tool_launch_grants drop constraint if exists tool_launch_grants_access_source_check;
alter table public.tool_launch_grants add constraint tool_launch_grants_access_source_check
  check(access_source in ('trial','day_pass','subscription','admin','super_admin'));

create or replace function public.day_pass_status(account_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare pass tool_day_passes; trial jsonb;
begin
  select * into pass from tool_day_passes where user_id=account_id;
  if found then
    return jsonb_build_object('status',case when pass.state='refunded' then 'refunded'
      when pass.expires_at>clock_timestamp() and pass.state='paid' then 'active'
      when pass.activated_at is not null then 'used' else 'pending' end,
      'state',pass.state,'receipt',pass.receipt,'orderId',pass.order_id,'paymentId',pass.payment_id,
      'activatedAt',pass.activated_at,'expiresAt',pass.expires_at);
  end if;
  trial:=tool_trial_status(account_id);
  return jsonb_build_object('status',case when trial->>'status'='expired' then 'eligible' else 'not_eligible' end);
end $$;

create or replace function public.claim_day_pass_order(account_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare pass tool_day_passes; info jsonb;
begin
  perform id from auth.users where id=account_id and email_confirmed_at is not null for update;
  if not found then raise exception 'Verified account required'; end if;
  info:=day_pass_status(account_id);
  if info->>'status' not in ('eligible','pending') then return info; end if;
  if exists(select 1 from billing_subscriptions where user_id=account_id and status='active'
    and (current_period_end is null or current_period_end>clock_timestamp())) or
    exists(select 1 from account_plan_overrides where user_id=account_id and plan_id in ('studio','team')
    and (expires_at is null or expires_at>clock_timestamp())) then
    return jsonb_build_object('status','not_eligible');
  end if;
  select * into pass from tool_day_passes where user_id=account_id;
  if found then
    return info||jsonb_build_object('state',case when pass.order_id is not null then pass.state
      when pass.state='creating' and pass.created_at>clock_timestamp()-interval '45 seconds' then 'processing'
      else 'recover' end);
  end if;
  insert into tool_day_passes(user_id,receipt) values(account_id,'svd_'||replace(gen_random_uuid()::text,'-','')) returning * into pass;
  return jsonb_build_object('status','pending','state','create','receipt',pass.receipt);
end $$;

create or replace function public.save_day_pass_order(account_id uuid,selected_order text,verified_payment text,revoked boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare pass tool_day_passes; moment timestamptz:=clock_timestamp();
begin
  select * into pass from tool_day_passes where user_id=account_id for update;
  if not found then raise exception 'No day pass reservation'; end if;
  if selected_order is null then
    update tool_day_passes set state='uncertain' where user_id=account_id and order_id is null;
  else
    if selected_order!~'^order_[A-Za-z0-9]+$' or
      (verified_payment is not null and verified_payment!~'^pay_[A-Za-z0-9]+$') or
      (pass.order_id is not null and pass.order_id<>selected_order) or
      (pass.payment_id is not null and verified_payment is not null and pass.payment_id<>verified_payment) then
      raise exception 'Day pass payment does not match';
    end if;
    update tool_day_passes set order_id=selected_order,payment_id=coalesce(payment_id,verified_payment),
      state=case when revoked or state='refunded' then 'refunded'
        when verified_payment is not null or state='paid' then 'paid' else 'ready' end,
      activated_at=case when not revoked and verified_payment is not null then coalesce(activated_at,moment) else activated_at end,
      expires_at=case when not revoked and verified_payment is not null then coalesce(expires_at,moment+interval '24 hours') else expires_at end
      where user_id=account_id;
  end if;
  return day_pass_status(account_id);
end $$;

create or replace function public.claim_day_pass_launch(account_id uuid,selected_tool text,launch_request uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare pass tool_day_passes; existing tool_launch_grants; grant_id uuid;
begin
  perform id from auth.users where id=account_id for update;
  if not found then raise exception 'Account not found'; end if;
  if selected_tool not in ('cad','cad2d','pdf','ifc','calc','planner','frame','calculation','geo','speech','field','pointcloud','pile') or selected_tool is null then
    return jsonb_build_object('allowed',false);
  end if;
  select * into pass from tool_day_passes where user_id=account_id for update;
  if not found or pass.state<>'paid' or pass.expires_at<=clock_timestamp() or pass.expires_at is null then
    return jsonb_build_object('allowed',false);
  end if;
  select * into existing from tool_launch_grants where user_id=account_id and request_id=launch_request;
  if found then
    if existing.tool_id<>selected_tool then raise exception 'Launch request belongs to another tool'; end if;
    return jsonb_build_object('allowed',existing.access_source='day_pass' and existing.expires_at>clock_timestamp(),
      'grantId',existing.id,'source',existing.access_source,'expiresAt',least(existing.expires_at,pass.expires_at));
  end if;
  insert into tool_launch_grants(user_id,request_id,tool_id,access_source,expires_at)
    values(account_id,launch_request,selected_tool,'day_pass',pass.expires_at) returning id into grant_id;
  return jsonb_build_object('allowed',true,'grantId',grant_id,'source','day_pass','expiresAt',pass.expires_at);
end $$;
revoke all on function public.day_pass_status(uuid),public.claim_day_pass_order(uuid),
  public.save_day_pass_order(uuid,text,text,boolean),public.claim_day_pass_launch(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.day_pass_status(uuid),public.claim_day_pass_order(uuid),
  public.save_day_pass_order(uuid,text,text,boolean),public.claim_day_pass_launch(uuid,text,uuid) to service_role;
commit;

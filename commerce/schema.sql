-- Run in the chosen Supabase PostgreSQL project. Application sessions belong to Supabase Auth.
create table if not exists public.billing_customers (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe','razorpay')),
  provider_customer_id text not null,
  primary key (user_id,provider),
  unique (provider,provider_customer_id)
);
create table if not exists public.billing_subscriptions (
  provider text not null check (provider in ('stripe','razorpay')),
  provider_subscription_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null check (plan_key ~ '^(STUDIO|TEAM)_(MONTHLY|ANNUAL)_(INR|USD|GBP)$'),
  status text not null,
  current_period_end timestamptz,
  observed_at timestamptz not null default now(),
  primary key (provider,provider_subscription_id)
);
create index if not exists billing_subscriptions_user on public.billing_subscriptions(user_id);
create table if not exists public.billing_events (
  provider text not null check (provider in ('stripe','razorpay')),
  event_id text not null,
  processed_at timestamptz not null default now(),
  primary key (provider,event_id)
);
create table if not exists public.billing_checkout_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_key text not null,
  expires_at timestamptz not null,
  checkout_url text
);
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.billing_checkout_locks enable row level security;
revoke all on public.billing_customers,public.billing_subscriptions,public.billing_events,public.billing_checkout_locks from anon,authenticated;
grant select,insert,update,delete on public.billing_customers,public.billing_subscriptions,public.billing_events,public.billing_checkout_locks to service_role;

create or replace function public.claim_billing_checkout(account_id uuid,selected_plan text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare claimed_id uuid; existing public.billing_checkout_locks;
begin
  insert into public.billing_checkout_locks(user_id,plan_key,expires_at)
  values(account_id,selected_plan,now()+interval '65 minutes')
  on conflict (user_id) do update set plan_key=excluded.plan_key,expires_at=excluded.expires_at,checkout_url=null
    where billing_checkout_locks.expires_at<now()
  returning user_id into claimed_id;
  if claimed_id is not null then return jsonb_build_object('claimed',true); end if;
  select * into existing from public.billing_checkout_locks where user_id=account_id;
  return jsonb_build_object('claimed',false,'plan_key',existing.plan_key,'checkout_url',existing.checkout_url);
end $$;
revoke all on function public.claim_billing_checkout(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_billing_checkout(uuid,text) to service_role;

-- Apply the provider snapshot without letting an older concurrent observation overwrite a newer one.
create or replace function public.apply_billing_subscription(record jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
begin
  insert into public.billing_subscriptions(provider,provider_subscription_id,user_id,plan_key,status,current_period_end,observed_at)
  values (record->>'provider',record->>'provider_subscription_id',(record->>'user_id')::uuid,record->>'plan_key',record->>'status',
    (record->>'current_period_end')::timestamptz,(record->>'observed_at')::timestamptz)
  on conflict (provider,provider_subscription_id) do update set
    status=excluded.status,current_period_end=excluded.current_period_end,observed_at=excluded.observed_at
  where excluded.user_id=billing_subscriptions.user_id and excluded.plan_key=billing_subscriptions.plan_key
    and excluded.observed_at>=billing_subscriptions.observed_at;
  return jsonb_build_object('saved',true);
end $$;
revoke all on function public.apply_billing_subscription(jsonb) from public,anon,authenticated;
grant execute on function public.apply_billing_subscription(jsonb) to service_role;

-- Manual plan access is separate from payment-provider subscription records.
create table if not exists public.account_plan_overrides (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('explorer','studio','team')),
  expires_at timestamptz,
  reason text not null check (char_length(reason) between 3 and 500),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.account_plan_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('grant','clear')),
  before_state jsonb,
  after_state jsonb,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);
create index if not exists account_plan_audit_user on public.account_plan_audit(user_id,created_at desc);
alter table public.account_plan_overrides enable row level security;
alter table public.account_plan_audit enable row level security;
revoke all on public.account_plan_overrides,public.account_plan_audit from public,anon,authenticated,service_role;
grant select on public.account_plan_overrides,public.account_plan_audit to service_role;

-- Only the server may call this function. The change and audit entry commit together.
create or replace function public.admin_set_plan_access(actor uuid,target uuid,requested_plan text,expires timestamptz,note text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target_email text; old_state jsonb; new_state jsonb;
begin
  if not exists(select 1 from auth.users where id=actor
    and lower(email)='spanvisioninfra.admin@gmail.com' and email_confirmed_at is not null) then
    raise exception 'Super-admin access is required' using errcode='42501';
  end if;
  if note is null or char_length(trim(note)) not between 3 and 500 then
    raise exception 'Add a valid reason' using errcode='22023';
  end if;
  if requested_plan is not null and requested_plan not in ('explorer','studio','team') then
    raise exception 'Invalid plan' using errcode='22023';
  end if;
  if expires is not null and (expires<=now() or requested_plan is null) then
    raise exception 'Invalid expiry' using errcode='22023';
  end if;
  -- Serialize changes for this account, including a first grant with no existing override.
  select lower(email) into target_email from auth.users where id=target for update;
  if not found then raise exception 'User not found' using errcode='P0002'; end if;
  if target_email='spanvisioninfra.admin@gmail.com' then
    raise exception 'The super admin has access to every plan' using errcode='22023';
  end if;
  select to_jsonb(o) into old_state from public.account_plan_overrides o where user_id=target;
  if requested_plan is null then
    delete from public.account_plan_overrides where user_id=target;
  else
    insert into public.account_plan_overrides(user_id,plan_id,expires_at,reason,updated_by,updated_at)
    values(target,requested_plan,expires,trim(note),actor,now())
    on conflict (user_id) do update set plan_id=excluded.plan_id,expires_at=excluded.expires_at,
      reason=excluded.reason,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
    select to_jsonb(o) into new_state from public.account_plan_overrides o where user_id=target;
  end if;
  insert into public.account_plan_audit(actor_id,user_id,action,before_state,after_state,reason)
  values(actor,target,case when requested_plan is null then 'clear' else 'grant' end,old_state,new_state,trim(note));
  return jsonb_build_object('saved',true);
end $$;
revoke all on function public.admin_set_plan_access(uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.admin_set_plan_access(uuid,uuid,text,timestamptz,text) to service_role;

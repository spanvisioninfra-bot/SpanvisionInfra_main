-- Neon migration, 14 October 2026. Run in the production database SQL editor.
-- Application data is separate from neon_auth; this migration never changes provider tables.
begin;
create schema if not exists spanvision_commerce;
revoke all on schema spanvision_commerce from public;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='spanvision_commerce_server') then
    create role spanvision_commerce_server nologin;
  end if;
end $$;
grant usage on schema spanvision_commerce to spanvision_commerce_server;
alter default privileges in schema spanvision_commerce revoke execute on functions from public;

create table if not exists spanvision_commerce.accounts (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  email text not null, name text not null default '', email_verified boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create table if not exists spanvision_commerce.billing_customers (
  user_id text not null references spanvision_commerce.accounts(id) on delete cascade,
  provider text not null check (provider in ('stripe','razorpay')), provider_customer_id text not null,
  primary key(user_id,provider), unique(provider,provider_customer_id)
);
create table if not exists spanvision_commerce.billing_subscriptions (
  provider text not null check (provider in ('stripe','razorpay')), provider_subscription_id text not null,
  user_id text not null references spanvision_commerce.accounts(id) on delete cascade,
  plan_key text not null check (plan_key ~ '^(STUDIO|TEAM)_(MONTHLY|ANNUAL)_(INR|USD|GBP)$'),
  status text not null, current_period_end timestamptz, observed_at timestamptz not null default now(),
  primary key(provider,provider_subscription_id)
);
create index if not exists billing_subscriptions_user on spanvision_commerce.billing_subscriptions(user_id);
create table if not exists spanvision_commerce.billing_events (
  provider text not null check (provider in ('stripe','razorpay')), event_id text not null,
  processed_at timestamptz not null default now(), primary key(provider,event_id)
);
create table if not exists spanvision_commerce.billing_checkout_locks (
  user_id text primary key references spanvision_commerce.accounts(id) on delete cascade,
  plan_key text not null, expires_at timestamptz not null, checkout_url text
);
create table if not exists spanvision_commerce.account_plan_overrides (
  user_id text primary key references spanvision_commerce.accounts(id) on delete cascade,
  plan_id text not null check (plan_id in ('explorer','studio','team')), expires_at timestamptz,
  reason text not null check (char_length(reason) between 3 and 500),
  updated_by text not null references spanvision_commerce.accounts(id), updated_at timestamptz not null default now()
);
create table if not exists spanvision_commerce.account_plan_audit (
  id uuid primary key default gen_random_uuid(), actor_id text not null references spanvision_commerce.accounts(id),
  user_id text not null references spanvision_commerce.accounts(id) on delete cascade,
  action text not null check (action in ('grant','clear')), before_state jsonb, after_state jsonb,
  reason text not null check (char_length(reason) between 3 and 500), created_at timestamptz not null default now()
);
create index if not exists account_plan_audit_user on spanvision_commerce.account_plan_audit(user_id,created_at desc);

-- The API server has a dedicated database role. Public/Data API clients cannot read these tables.
do $$ declare relation text; begin
  foreach relation in array array['accounts','billing_customers','billing_subscriptions','billing_events',
    'billing_checkout_locks','account_plan_overrides','account_plan_audit'] loop
    execute format('alter table spanvision_commerce.%I enable row level security',relation);
    execute format('revoke all on spanvision_commerce.%I from public',relation);
    execute format('drop policy if exists server_access on spanvision_commerce.%I',relation);
    execute format('create policy server_access on spanvision_commerce.%I to spanvision_commerce_server using(true) with check(true)',relation);
  end loop;
end $$;
grant select,insert,update on spanvision_commerce.accounts to spanvision_commerce_server;
grant select,insert,update,delete on spanvision_commerce.billing_customers,spanvision_commerce.billing_subscriptions,
  spanvision_commerce.billing_events,spanvision_commerce.billing_checkout_locks to spanvision_commerce_server;
revoke all on spanvision_commerce.account_plan_overrides,spanvision_commerce.account_plan_audit from spanvision_commerce_server;
grant select on spanvision_commerce.account_plan_overrides,spanvision_commerce.account_plan_audit to spanvision_commerce_server;

create or replace function spanvision_commerce.claim_billing_checkout(account_id text,selected_plan text)
returns jsonb language plpgsql security invoker set search_path=spanvision_commerce,pg_temp as $$
declare claimed_id text; existing spanvision_commerce.billing_checkout_locks;
begin
  insert into billing_checkout_locks(user_id,plan_key,expires_at)
  values(account_id,selected_plan,now()+interval '65 minutes')
  on conflict(user_id) do update set plan_key=excluded.plan_key,expires_at=excluded.expires_at,checkout_url=null
    where billing_checkout_locks.expires_at<now() returning user_id into claimed_id;
  if claimed_id is not null then return jsonb_build_object('claimed',true); end if;
  select * into existing from billing_checkout_locks where user_id=account_id;
  return jsonb_build_object('claimed',false,'plan_key',existing.plan_key,'checkout_url',existing.checkout_url);
end $$;

create or replace function spanvision_commerce.apply_billing_subscription(record jsonb)
returns jsonb language plpgsql security invoker set search_path=spanvision_commerce,pg_temp as $$
begin
  insert into billing_subscriptions(provider,provider_subscription_id,user_id,plan_key,status,current_period_end,observed_at)
  values(record->>'provider',record->>'provider_subscription_id',record->>'user_id',record->>'plan_key',record->>'status',
    (record->>'current_period_end')::timestamptz,(record->>'observed_at')::timestamptz)
  on conflict(provider,provider_subscription_id) do update set status=excluded.status,
    current_period_end=excluded.current_period_end,observed_at=excluded.observed_at
  where excluded.user_id=billing_subscriptions.user_id and excluded.plan_key=billing_subscriptions.plan_key
    and excluded.observed_at>=billing_subscriptions.observed_at;
  return jsonb_build_object('saved',true);
end $$;

create or replace function spanvision_commerce.admin_set_plan_access(actor text,target text,requested_plan text,
  expires timestamptz,note text,pinned_admin_id text)
returns jsonb language plpgsql security definer set search_path=spanvision_commerce,pg_temp as $$
declare target_email text; old_state jsonb; new_state jsonb;
begin
  if actor is null or pinned_admin_id is null or pinned_admin_id='' or actor<>pinned_admin_id
    or not exists(select 1 from accounts where id=actor
      and lower(email)='spanvisioninfra.admin@gmail.com' and email_verified=true) then
    raise exception 'Super-admin access is required' using errcode='42501';
  end if;
  if note is null or char_length(trim(note)) not between 3 and 500 then raise exception 'Add a valid reason'; end if;
  if requested_plan is not null and requested_plan not in ('explorer','studio','team') then raise exception 'Invalid plan'; end if;
  if expires is not null and (expires<=now() or requested_plan is null) then raise exception 'Invalid expiry'; end if;
  select lower(email) into target_email from accounts where id=target for update;
  if not found then raise exception 'User not found'; end if;
  if target_email='spanvisioninfra.admin@gmail.com' then raise exception 'The super admin has access to every plan'; end if;
  select to_jsonb(o) into old_state from account_plan_overrides o where user_id=target;
  if requested_plan is null then delete from account_plan_overrides where user_id=target;
  else
    insert into account_plan_overrides(user_id,plan_id,expires_at,reason,updated_by,updated_at)
    values(target,requested_plan,expires,trim(note),actor,now())
    on conflict(user_id) do update set plan_id=excluded.plan_id,expires_at=excluded.expires_at,
      reason=excluded.reason,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
    select to_jsonb(o) into new_state from account_plan_overrides o where user_id=target;
  end if;
  insert into account_plan_audit(actor_id,user_id,action,before_state,after_state,reason)
  values(actor,target,case when requested_plan is null then 'clear' else 'grant' end,old_state,new_state,trim(note));
  return jsonb_build_object('saved',true);
end $$;
revoke all on function spanvision_commerce.claim_billing_checkout(text,text),
  spanvision_commerce.apply_billing_subscription(jsonb),
  spanvision_commerce.admin_set_plan_access(text,text,text,timestamptz,text,text) from public;
grant execute on function spanvision_commerce.claim_billing_checkout(text,text),
  spanvision_commerce.apply_billing_subscription(jsonb),
  spanvision_commerce.admin_set_plan_access(text,text,text,timestamptz,text,text) to spanvision_commerce_server;
commit;

-- Create a separate LOGIN role with SQL, then grant this group to it, for example:
-- create role spanvision_app with login password 'REPLACE_WITH_YOUR_PRIVATE_RANDOM_PASSWORD';
-- grant spanvision_commerce_server to spanvision_app;
-- Use that role's pooled connection string only in Vercel DATABASE_URL.
-- Console-created roles inherit neon_superuser; create this limited role with SQL instead.

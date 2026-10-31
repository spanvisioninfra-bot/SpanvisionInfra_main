-- Public one-rupee checkout only. Apply after neon-schema.sql; safe to rerun.
begin;
create table if not exists spanvision_commerce.payment_test_orders (
  session_id uuid primary key, receipt text not null unique,
  order_id text unique, payment_id text unique,
  state text not null default 'creating' check(state in ('creating','uncertain','ready','paid')),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists payment_test_created on spanvision_commerce.payment_test_orders(created_at);
alter table spanvision_commerce.payment_test_orders enable row level security;
revoke all on spanvision_commerce.payment_test_orders from public;
grant select,insert,update on spanvision_commerce.payment_test_orders to spanvision_commerce_server;
drop policy if exists server_access on spanvision_commerce.payment_test_orders;
create policy server_access on spanvision_commerce.payment_test_orders to spanvision_commerce_server using(true) with check(true);

create or replace function spanvision_commerce.payment_test_order_status(test_session uuid)
returns jsonb language sql security invoker set search_path=spanvision_commerce,pg_temp as $$
  select jsonb_build_object('receipt',receipt,'orderId',order_id,'paymentId',payment_id,'state',state)
  from payment_test_orders where session_id=test_session;
$$;
create or replace function spanvision_commerce.claim_payment_test_order(test_session uuid)
returns jsonb language plpgsql security invoker set search_path=spanvision_commerce,pg_temp as $$
declare existing payment_test_orders%rowtype; moment timestamptz:=clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtext('spanvision_one_rupee_payment_test'));
  select * into existing from payment_test_orders where session_id=test_session;
  if found then
    return jsonb_build_object('receipt',existing.receipt,'orderId',existing.order_id,
      'state',case when existing.order_id is not null then existing.state
        when existing.state='creating' and existing.created_at>moment-interval '45 seconds' then 'processing'
        else 'recover' end);
  end if;
  if (select count(*) from payment_test_orders where created_at>moment-interval '1 minute')>=5
     or (select count(*) from payment_test_orders where created_at>moment-interval '1 hour')>=50 then
    return jsonb_build_object('state','rate_limited');
  end if;
  insert into payment_test_orders(session_id,receipt) values(test_session,'sv1_'||replace(test_session::text,'-','')) returning * into existing;
  return jsonb_build_object('state','create','receipt',existing.receipt);
end $$;
create or replace function spanvision_commerce.save_payment_test_order(test_session uuid,selected_order text,verified_payment text)
returns jsonb language plpgsql security invoker set search_path=spanvision_commerce,pg_temp as $$
begin
  if selected_order is null then
    update payment_test_orders set state='uncertain' where session_id=test_session and order_id is null;
  else
    if selected_order!~'^order_[A-Za-z0-9]+$' or (verified_payment is not null and verified_payment!~'^pay_[A-Za-z0-9]+$') then
      raise exception 'Invalid payment reference';
    end if;
    update payment_test_orders set order_id=selected_order,payment_id=coalesce(verified_payment,payment_id),
      state=case when verified_payment is not null or state='paid' then 'paid' else 'ready' end
      where session_id=test_session and (order_id is null or order_id=selected_order)
        and (payment_id is null or verified_payment is null or payment_id=verified_payment);
  end if;
  if not found then raise exception 'Payment order reservation does not match'; end if;
  return spanvision_commerce.payment_test_order_status(test_session);
end $$;
revoke all on function spanvision_commerce.payment_test_order_status(uuid),spanvision_commerce.claim_payment_test_order(uuid),spanvision_commerce.save_payment_test_order(uuid,text,text) from public;
grant execute on function spanvision_commerce.payment_test_order_status(uuid),spanvision_commerce.claim_payment_test_order(uuid),spanvision_commerce.save_payment_test_order(uuid,text,text) to spanvision_commerce_server;
commit;

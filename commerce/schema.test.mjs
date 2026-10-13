// Test the SQL with an isolated PGlite/PostgreSQL runtime, not the production database.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const runtime=process.env.PGLITE_MODULE;
if(!runtime)throw new Error('Set PGLITE_MODULE to the isolated @electric-sql/pglite/dist/index.js path.');
const {PGlite}=await import(pathToFileURL(runtime));
const admin='22345678-1234-4234-8234-123456789abc',member='12345678-1234-4234-8234-123456789abc';

test('PostgreSQL migration, admin permissions, grants, clearing and atomic audit rollback',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      insert into auth.users values('${admin}','spanvisioninfra.admin@gmail.com',now()),('${member}','member@example.test',now());`);
    const schema=await fs.readFile(new URL('schema.sql',import.meta.url),'utf8');
    await db.exec(schema);await db.exec(schema);
    const permissions=(await db.query(`select has_function_privilege('anon','public.admin_set_plan_access(uuid,uuid,text,timestamptz,text)','execute') as anon,
      has_function_privilege('authenticated','public.admin_set_plan_access(uuid,uuid,text,timestamptz,text)','execute') as member,
      has_function_privilege('service_role','public.admin_set_plan_access(uuid,uuid,text,timestamptz,text)','execute') as server,
      has_table_privilege('authenticated','public.account_plan_overrides','select') as client_read,
      has_table_privilege('service_role','public.account_plan_audit','insert') as direct_audit_write`)).rows[0];
    assert.deepEqual(permissions,{anon:false,member:false,server:true,client_read:false,direct_audit_write:false});
    const call=(actor,target,plan,expiry,reason)=>db.query('select public.admin_set_plan_access($1,$2,$3,$4,$5) as result',[actor,target,plan,expiry,reason]);
    await db.exec('set role service_role');
    await call(admin,member,'team',null,'Initial team access');
    await db.exec('reset role');
    assert.equal((await db.query('select plan_id from public.account_plan_overrides')).rows[0].plan_id,'team');
    let audit=(await db.query('select * from public.account_plan_audit order by created_at')).rows;
    assert.equal(audit.length,1);assert.equal(audit[0].actor_id,admin);assert.equal(audit[0].before_state,null);assert.equal(audit[0].after_state.plan_id,'team');
    await call(admin,member,null,null,'Restore billing access');
    assert.equal((await db.query('select * from public.account_plan_overrides')).rows.length,0);
    audit=(await db.query('select * from public.account_plan_audit order by created_at')).rows;
    assert.equal(audit.length,2);assert.equal(audit[1].action,'clear');assert.equal(audit[1].before_state.plan_id,'team');assert.equal(audit[1].after_state,null);
    await assert.rejects(call(member,member,'team',null,'Unauthorized attempt'),/Super-admin/);
    await assert.rejects(call(admin,admin,'explorer',null,'Attempt self downgrade'),/every plan/);
    await assert.rejects(call(admin,member,'unknown',null,'Invalid plan'),/Invalid plan/);
    await assert.rejects(call(admin,member,'studio','2020-01-01','Expired grant'),/Invalid expiry/);
    await db.query('update auth.users set email_confirmed_at=null where id=$1',[admin]);
    await assert.rejects(call(admin,member,'team',null,'Unverified account'),/Super-admin/);
    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[admin]);
    // A failed audit must roll back the access change rather than leave an unrecorded grant.
    await db.exec(`create function public.reject_test_audit() returns trigger language plpgsql as $$ begin raise exception 'Test audit failure'; end $$;
      create trigger reject_test_audit before insert on public.account_plan_audit for each row execute function public.reject_test_audit();`);
    await assert.rejects(call(admin,member,'team',null,'Test atomic rollback'),/Test audit failure/);
    assert.equal((await db.query('select * from public.account_plan_overrides')).rows.length,0);
    assert.equal((await db.query('select * from public.account_plan_audit')).rows.length,2);
    await db.exec('drop trigger reject_test_audit on public.account_plan_audit; drop function public.reject_test_audit(); set role authenticated;');
    await assert.rejects(call(admin,member,'team',null,'Client bypass attempt'),/permission denied/);
    await db.exec('reset role');
  }finally{await db.close();}
});

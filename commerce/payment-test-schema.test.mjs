import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createNeonStore} from './neon-store.mjs';

test('persistent payment reservations, rate limits and server-only permissions survive migration replay',async()=>{
  if(!process.env.PGLITE_MODULE)throw new Error('Set PGLITE_MODULE to the isolated test runtime.');
  const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE)),pg=new PGlite();
  try{
    await pg.exec(await fs.readFile(new URL('neon-schema.sql',import.meta.url),'utf8'));
    const sql=await fs.readFile(new URL('neon-payment-test.sql',import.meta.url),'utf8');await pg.exec(sql);await pg.exec(sql);
    await pg.exec('create role payment_browser; create role payment_app login; grant spanvision_commerce_server to payment_app; set role payment_app;');
    const query=async(sql,params)=>(await pg.query(sql,params)).rows;
    const permissions=(await query(`select has_function_privilege('payment_browser','spanvision_commerce.claim_payment_test_order(uuid)','execute') as browser_rpc,
      has_table_privilege('payment_browser','spanvision_commerce.payment_test_orders','select') as browser_read,
      has_table_privilege('payment_app','spanvision_commerce.payment_test_orders','delete') as app_delete`))[0];
    assert.deepEqual(permissions,{browser_rpc:false,browser_read:false,app_delete:false});
    const adapter=()=>createNeonStore(query),rpc=(name,body)=>adapter().request('rpc/'+name,{method:'POST',body:JSON.stringify(body)});
    const id=randomUUID(),body={test_session:id};
    const concurrent=await Promise.all([rpc('claim_payment_test_order',body),rpc('claim_payment_test_order',body)]);
    assert.equal(concurrent.filter(row=>row.state==='create').length,1);assert.equal(concurrent.filter(row=>row.state==='processing').length,1);
    const first=await rpc('save_payment_test_order',{...body,selected_order:'order_schema',verified_payment:null});assert.equal(first.state,'ready');
    assert.equal((await rpc('claim_payment_test_order',body)).orderId,'order_schema');
    const paid=await rpc('save_payment_test_order',{...body,selected_order:'order_schema',verified_payment:'pay_schema'});assert.equal(paid.state,'paid');
    assert.equal((await rpc('payment_test_order_status',body)).paymentId,'pay_schema');
    await assert.rejects(rpc('save_payment_test_order',{...body,selected_order:'order_other',verified_payment:null}),/does not match/);
    const uncertain={test_session:randomUUID()};await rpc('claim_payment_test_order',uncertain);await rpc('save_payment_test_order',{...uncertain,selected_order:null,verified_payment:null});
    assert.equal((await rpc('claim_payment_test_order',uncertain)).state,'recover');
    for(let index=0;index<3;index++)assert.equal((await rpc('claim_payment_test_order',{test_session:randomUUID()})).state,'create');
    assert.equal((await rpc('claim_payment_test_order',{test_session:randomUUID()})).state,'rate_limited');
    assert.equal((await rpc('claim_payment_test_order',body)).state,'paid','existing orders remain accessible during rate limiting');
    await pg.exec('reset role');
    await pg.query("update spanvision_commerce.payment_test_orders set created_at=clock_timestamp()-interval '2 minutes'");
    for(let index=0;index<45;index++){
      const session=randomUUID();await pg.query("insert into spanvision_commerce.payment_test_orders(session_id,receipt,created_at) values($1,$2,clock_timestamp()-interval '2 minutes')",[session,'sv1_'+session.replaceAll('-','')]);
    }
    await pg.exec('set role payment_app');assert.equal((await rpc('claim_payment_test_order',{test_session:randomUUID()})).state,'rate_limited');
    await pg.exec("reset role; update spanvision_commerce.payment_test_orders set created_at=clock_timestamp()-interval '2 hours'; set role payment_app;");
    assert.equal((await rpc('claim_payment_test_order',{test_session:randomUUID()})).state,'create');
    assert.equal((await query('select count(*)::int as count from spanvision_commerce.billing_subscriptions'))[0].count,0);
  }finally{await pg.close();}
});

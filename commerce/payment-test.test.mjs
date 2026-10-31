import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {createHandler} from './server.mjs';

const environment={SITE_URL:'https://www.spanvisioninfra.com',SESSION_SECRET:'isolated-public-payment-signing-secret-32',SUPABASE_URL:'https://database.example',SUPABASE_PUBLISHABLE_KEY:'isolated-public-key',SUPABASE_SERVICE_ROLE_KEY:'isolated-server-role',PAYMENT_TEST_ENABLED:'true',RAZORPAY_KEY_ID:'rzp_live_fixture',RAZORPAY_KEY_SECRET:'isolated-payment-secret'};
async function fixture(t,options={}){
  const env={...environment,...options.env},rows=new Map(),orders=new Map(),calls=[];
  let attempts=0,payment=null,ambiguous=options.ambiguous===true,rateLimited=false;
  const fetcher=async(url,request={})=>{
    calls.push({url,request});
    if(url.startsWith('https://database.example/rest/v1/rpc/')){
      const name=url.split('/').at(-1),body=JSON.parse(request.body),id=body.test_session,row=rows.get(id);
      if(name==='claim_payment_test_order'){
        if(row)return Response.json({...row,state:row.orderId?row.state:row.state==='creating'?'processing':'recover'});
        if(rateLimited)return Response.json({state:'rate_limited'});
        const receipt='sv1_'+id.replaceAll('-','');rows.set(id,{receipt,state:'creating'});return Response.json({receipt,state:'create'});
      }
      if(name==='save_payment_test_order'){
        assert(row);if(body.selected_order===null){if(!row.orderId)row.state='uncertain';}
        else{assert(!row.orderId||row.orderId===body.selected_order);row.orderId=body.selected_order;row.state=body.verified_payment?'paid':'ready';if(body.verified_payment)row.paymentId=body.verified_payment;}
        return Response.json(row);
      }
      if(name==='payment_test_order_status')return Response.json(row||null);
      throw new Error('Forbidden database write: '+name);
    }
    const endpoint=url.replace('https://api.razorpay.com/v1/','');
    assert(!endpoint.startsWith('subscriptions')&&!endpoint.endsWith('/capture'));
    if(endpoint==='orders'&&request.method==='POST'){
      const body=JSON.parse(request.body);assert.equal(body.amount,100);assert.equal(body.currency,'INR');assert.equal(body.partial_payment,false);assert.equal(body.notes.subscription,'none');
      const order={...body,id:'order_fixture'+(++attempts),status:'created'};orders.set(order.id,order);
      if(ambiguous){ambiguous=false;throw new Error('Simulated connection lost after provider creation');}
      return Response.json(order);
    }
    if(endpoint.startsWith('orders?')){const receipt=new URL(url).searchParams.get('receipt');return Response.json({items:[...orders.values()].filter(order=>order.receipt===receipt)});}
    if(/^orders\/order_[A-Za-z0-9]+\/payments$/.test(endpoint))return Response.json({items:payment?[payment]:[]});
    if(endpoint.startsWith('orders/'))return Response.json(orders.get(endpoint.slice(7)));
    if(endpoint.startsWith('payments/'))return Response.json(payment);
    throw new Error('Forbidden external request '+url);
  };
  async function client(){
    const server=http.createServer(createHandler({env,fetcher}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
    const base='http://127.0.0.1:'+server.address().port;
    return {
      get:async(cookie='',rewritten=false)=>fetch(base+(rewritten?'/api/commerce?__route=billing/payment-test/config':'/api/billing/payment-test/config'),{headers:{Cookie:cookie}}),
      post:(action,body={},cookie='',headers={})=>fetch(base+'/api/billing/payment-test/'+action,{method:'POST',headers:{Origin:env.SITE_URL,'Content-Type':'application/json',Cookie:cookie,...headers},body:JSON.stringify(body)}),
    };
  }
  const first=await client();
  const config=async target=>{const response=await (target||first).get();return {response,cookie:response.headers.get('set-cookie')?.split(';')[0]||''};};
  return {...first,client,config,calls,rows,orders,setRateLimited:value=>{rateLimited=value;},
    count:()=>attempts,setPayment:(status,orderId='order_fixture1',changes={})=>{payment={id:'pay_fixture',order_id:orderId,amount:100,currency:'INR',status,captured:status==='captured',amount_refunded:0,refund_status:null,...changes};},
    confirmation:()=>({razorpay_order_id:'order_fixture1',razorpay_payment_id:'pay_fixture',razorpay_signature:createHmac('sha256',env.RAZORPAY_KEY_SECRET).update('order_fixture1|pay_fixture').digest('hex')}),
  };
}

test('everyone can discover enabled checkout without login, secrets or provider writes',async t=>{
  const f=await fixture(t),{response,cookie}=await f.config();assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{enabled:true,amount:100,currency:'INR',live:true});assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Lax; Max-Age=86400; Secure/);
  assert.equal(f.calls.length,0);assert(!cookie.includes(environment.RAZORPAY_KEY_SECRET));
  assert.equal((await f.get(cookie,true)).status,200);
});
test('production switch defaults off and missing storage or keys cannot create orders',async t=>{
  for(const env of [{PAYMENT_TEST_ENABLED:'false'},{RAZORPAY_KEY_SECRET:''},{SUPABASE_SERVICE_ROLE_KEY:''}]){
    const f=await fixture(t,{env});assert.deepEqual(await (await f.get()).json(),{enabled:false});assert.equal((await f.post('order')).status,404);assert.equal(f.calls.length,0);
  }
});
test('fixed amount, same-origin, session and signature checks reject forged checkout requests',async t=>{
  const f=await fixture(t);assert.equal((await f.post('order')).status,403);const {cookie}=await f.config();
  assert.equal((await f.post('order',{amount:1,plan:'studio'},cookie)).status,400);
  assert.equal((await f.post('order',{},cookie,{Origin:'https://evil.example'})).status,403);
  assert.equal((await f.post('order',{},cookie,{'Sec-Fetch-Site':'cross-site'})).status,403);
  // Mutate the first signature character; the final character can be unchanged or alias padding bits.
  const proofAt=cookie.lastIndexOf('.')+1,forged=cookie.slice(0,proofAt)+(cookie[proofAt]==='A'?'B':'A')+cookie.slice(proofAt+1);
  assert.equal((await f.post('order',{},forged)).status,403);assert.equal(f.count(),0);
  const order=await f.post('order',{},cookie);assert.equal(order.status,200);assert.equal((await order.json()).status,'unpaid');
  f.setPayment('captured');const invalid=await f.post('verify',{...f.confirmation(),razorpay_signature:'0'.repeat(64)},cookie);assert.equal(invalid.status,400);
  assert.equal(f.calls.filter(call=>call.url.includes('/payments/pay_')).length,0);
});
test('serverless restart and retries reuse the persistent order; success never grants a plan',async t=>{
  const f=await fixture(t),{cookie}=await f.config();const first=await (await f.post('order',{},cookie)).json();
  const second=await f.client();assert.equal((await (await second.post('order',{},cookie)).json()).orderId,first.orderId);assert.equal(f.count(),1);
  f.setPayment('captured');const result=await (await second.post('verify',f.confirmation(),cookie)).json();assert.equal(result.verified,true);assert.equal(result.amount,100);assert.equal(result.plan,undefined);
  const resumed=await (await f.post('order',{},cookie)).json();assert.equal(resumed.verified,true);assert.equal(f.count(),1);
  assert(f.calls.every(call=>!call.url.includes('subscription')&&!call.url.includes('grant')));
});
test('status can recover a missed Checkout callback; pending and refunded states never count as paid',async t=>{
  const f=await fixture(t),{cookie}=await f.config();await f.post('order',{},cookie);
  f.setPayment('authorized');let result=await (await f.post('status',{},cookie)).json();assert.equal(result.verified,false);assert.equal(result.status,'authorized');
  f.setPayment('captured');result=await (await f.post('status',{},cookie)).json();assert.equal(result.verified,true);
  f.setPayment('refunded','order_fixture1',{amount_refunded:100,refund_status:'full'});result=await (await f.post('status',{},cookie)).json();assert.equal(result.verified,false);assert.equal(result.status,'refunded');
});
test('another browser, wrong order, amount or currency cannot claim a payment',async t=>{
  const f=await fixture(t),{cookie}=await f.config();await f.post('order',{},cookie);
  const stranger=await f.config();assert.equal((await f.post('verify',f.confirmation(),stranger.cookie)).status,409);
  for(const change of [{amount:99900},{currency:'USD'},{order_id:'order_foreign'}]){
    f.setPayment('captured','order_fixture1',change);assert.equal((await f.post('verify',f.confirmation(),cookie)).status,400);
  }
});
test('ambiguous order creation recovers by receipt without creating a second provider order',async t=>{
  const f=await fixture(t,{ambiguous:true}),{cookie}=await f.config();assert.equal((await f.post('order',{},cookie)).status,502);assert.equal(f.count(),1);
  const recovered=await f.post('order',{},cookie);assert.equal(recovered.status,200);assert.equal((await recovered.json()).orderId,'order_fixture1');assert.equal(f.count(),1);
});
test('persistent reservation prevents simultaneous creations and global limits stop order spam',async t=>{
  const f=await fixture(t),{cookie}=await f.config(),other=await f.client();
  const results=await Promise.all([f.post('order',{},cookie),other.post('order',{},cookie)]);assert(results.some(response=>response.status===200));assert.equal(f.count(),1);
  f.setRateLimited(true);const next=await f.config();assert.equal((await f.post('order',{},next.cookie)).status,429);assert.equal(f.count(),1);
});

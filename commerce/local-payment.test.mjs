import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {createLocalPaymentHandler} from './local-payment.mjs';
import {createHandler} from './server.mjs';

const settings={LOCAL_PAYMENT_ENABLED:'true',LOCAL_RAZORPAY_KEY_ID:'rzp_live_fixture',LOCAL_RAZORPAY_KEY_SECRET:'isolated-local-payment-secret'};
async function fixture(t,{env=settings,status='captured',upstreamFailure=false,change={}}={}){
  const calls=[];let orders=0;
  const handler=createLocalPaymentHandler({env,fetcher:async(url,options)=>{
    calls.push({url,options});
    if(upstreamFailure)return Response.json({error:{description:settings.LOCAL_RAZORPAY_KEY_SECRET}},{status:401});
    if(url.endsWith('/orders')){
      const order=JSON.parse(options.body);assert.equal(order.amount,100);assert.equal(order.currency,'INR');assert.equal(order.partial_payment,false);
      assert.equal(order.notes.subscription,'none');orders++;
      return Response.json({...order,id:'order_fixture'+orders,status:'created'});
    }
    return Response.json({id:'pay_fixture',order_id:'order_fixture1',amount:100,currency:'INR',status,captured:status==='captured',amount_refunded:0,...change});
  }});
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;
  let cookie='';
  const config=async()=>{const response=await fetch(origin+'/api/local-payment/config');cookie=response.headers.get('set-cookie')?.split(';')[0]||'';return response;};
  const post=(endpoint,body={},headers={})=>fetch(origin+'/api/local-payment/'+endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...headers},body:JSON.stringify(body)});
  const confirmation=(orderId='order_fixture1')=>({razorpay_order_id:orderId,razorpay_payment_id:'pay_fixture',razorpay_signature:createHmac('sha256',settings.LOCAL_RAZORPAY_KEY_SECRET).update(orderId+'|pay_fixture').digest('hex')});
  return {config,post,calls,confirmation,origin};
}

test('local panel config is private and never creates an order or exposes credentials',async t=>{
  const f=await fixture(t),response=await f.config(),data=await response.json();
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  assert.deepEqual(data,{enabled:true,amount:100,currency:'INR',live:true});assert.equal(f.calls.length,0);
  assert(!JSON.stringify(data).includes(settings.LOCAL_RAZORPAY_KEY_SECRET));
});

test('order is fixed at one rupee and reused across concurrent requests and retries',async t=>{
  const f=await fixture(t);await f.config();
  const tampered=await f.post('order',{amount:1,currency:'USD',plan:'studio'});assert.equal(tampered.status,400);assert.equal(f.calls.length,0);
  const responses=await Promise.all([f.post('order'),f.post('order')]);
  const [first,second]=await Promise.all(responses.map(response=>response.json()));assert.equal(responses[0].status,200);assert.deepEqual(first,second);
  assert.equal(first.amount,100);assert.equal(first.currency,'INR');assert.equal(first.keyId,settings.LOCAL_RAZORPAY_KEY_ID);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'https://api.razorpay.com/v1/orders');
  assert.equal(f.calls[0].options.headers.Authorization,'Basic '+Buffer.from(settings.LOCAL_RAZORPAY_KEY_ID+':'+settings.LOCAL_RAZORPAY_KEY_SECRET).toString('base64'));
  assert(!(await (await f.post('order')).text()).includes(settings.LOCAL_RAZORPAY_KEY_SECRET));assert.equal(f.calls.length,1);
});

test('only an owned order with a valid signature and captured INR 100-paise payment succeeds',async t=>{
  const f=await fixture(t);await f.config();await f.post('order');
  assert.equal((await f.post('verify',f.confirmation('order_foreign'))).status,400);
  assert.equal((await f.post('verify',{...f.confirmation(),razorpay_signature:'0'.repeat(64)})).status,400);
  assert.equal(f.calls.length,1);
  const response=await f.post('verify',f.confirmation());assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{verified:true,status:'captured',paymentId:'pay_fixture',amount:100,currency:'INR'});
  assert(f.calls.every(call=>!call.url.includes('subscriptions')&&!call.url.endsWith('/capture')));
  assert.equal((await f.post('order')).status,409);
  // Losing the local browser session cannot claim an order from another session.
  await f.config();assert.equal((await f.post('verify',f.confirmation())).status,400);
});

test('authorized, refunded, mismatched and failed payments are never marked paid',async t=>{
  for(const option of [{status:'authorized'},{status:'failed'},{change:{amount:99900}},{change:{currency:'USD'}},{change:{order_id:'order_other'}},{change:{amount_refunded:100}}]){
    const f=await fixture(t,option);await f.config();await f.post('order');
    const response=await f.post('verify',f.confirmation()),data=await response.json();
    assert.notEqual(data.verified,true);
    if(option.status==='authorized'){assert.equal(response.status,200);assert.equal(data.status,'authorized');}
    else assert(response.status>=400);
  }
});

test('disabled settings, hosted requests, cross-origin posts and missing sessions cannot call Razorpay',async t=>{
  for(const env of [{},{...settings,LOCAL_PAYMENT_ENABLED:'false'},{...settings,NODE_ENV:'production'}]){
    const f=await fixture(t,{env});assert.equal((await f.config()).status,404);assert.equal(f.calls.length,0);
  }
  const f=await fixture(t);assert.equal((await f.post('order')).status,403);await f.config();
  assert.equal((await f.post('order',{}, {Origin:'https://www.spanvisioninfra.com'})).status,403);
  assert.equal((await f.post('order',{}, {Origin:'null'})).status,403);
  const foreignHost=await new Promise((resolve,reject)=>{http.get(f.origin+'/api/local-payment/config',{headers:{Host:'www.spanvisioninfra.com'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject);});
  assert.equal(foreignHost,404);
  assert.equal((await f.post('order',{}, {'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await f.post('order',{}, {'Content-Type':'text/plain'})).status,415);
  assert.equal((await f.post('order',{extra:'x'.repeat(5000)})).status,413);assert.equal(f.calls.length,0);
});

test('provider failures do not reflect secrets or private upstream errors',async t=>{
  const f=await fixture(t,{upstreamFailure:true});await f.config();const response=await f.post('order');
  assert.equal(response.status,502);const text=await response.text();assert(!text.includes(settings.LOCAL_RAZORPAY_KEY_SECRET));assert.match(text,/local keys/);
});

test('deployed account handler does not implement the local payment endpoints',async t=>{
  const server=http.createServer(createHandler({env:{},fetcher:async()=>{throw new Error('No provider calls allowed');}}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/local-payment/config');assert.equal(response.status,404);
});

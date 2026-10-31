// Public one-time checkout. Never creates subscriptions or tool access grants.
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
const cookieName='sv_payment_test',amount=100,currency='INR',ttl=86400000;
const validId=(value,type)=>typeof value==='string'&&new RegExp('^'+type+'_[A-Za-z0-9]{1,80}$').test(value);
export class PaymentTestError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new PaymentTestError(status,message);};
export function paymentTestReady(env){return env.PAYMENT_TEST_ENABLED==='true'&&/^rzp_(live|test)_[A-Za-z0-9]+$/.test(env.RAZORPAY_KEY_ID||'')&&!!env.RAZORPAY_KEY_SECRET&&env.SESSION_SECRET?.length>=32;}
const signature=(value,env)=>createHmac('sha256',env.SESSION_SECRET).update('spanvision-payment-test-v1\0'+env.SITE_URL+'\0'+value).digest();
function readSession(req,env){
  try{
    const cookie=(req.headers.cookie||'').split(';').map(value=>value.trim()).find(value=>value.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if(!cookie||cookie.length>600)return null;
    const [value,proof,...extra]=cookie.split('.');if(extra.length||!value||!/^[A-Za-z0-9_-]+$/.test(proof||''))return null;
    const expected=signature(value,env),actual=Buffer.from(proof,'base64url');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
    const session=JSON.parse(Buffer.from(value,'base64url'));
    return /^[0-9a-f-]{36}$/.test(session.id||'')&&session.expires>Date.now()?session:null;
  }catch{return null;}
}
function createSession(res,env){
  const session={id:randomUUID(),expires:Date.now()+ttl},value=Buffer.from(JSON.stringify(session)).toString('base64url');
  const cookie=cookieName+'='+value+'.'+signature(value,env).toString('base64url')+'; Path=/api/billing/payment-test; HttpOnly; SameSite=Lax; Max-Age=86400'+(new URL(env.SITE_URL).protocol==='https:'?'; Secure':'');
  const existing=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',existing?[...(Array.isArray(existing)?existing:[existing]),cookie]:cookie);
  return session;
}
export async function paymentTestRoute(route,method,input,req,res,{env,fetcher,store,storageReady}){
  const action=route.slice('/api/billing/payment-test/'.length),enabled=paymentTestReady(env)&&storageReady;
  if(action==='config'&&method==='GET'){
    if(!enabled)return {enabled:false};
    if(!readSession(req,env))createSession(res,env);
    return {enabled:true,amount,currency,live:env.RAZORPAY_KEY_ID.startsWith('rzp_live_')};
  }
  if(!enabled)fail(404,'The ₹1 payment test is unavailable.');
  if(method!=='POST'||!['order','verify','status'].includes(action))fail(404,'Endpoint not found.');
  const session=readSession(req,env);if(!session)fail(403,'Reload the pricing page before opening the ₹1 checkout.');
  if(req.headers['sec-fetch-site']==='cross-site')fail(403,'Open the payment test on this website.');
  const rpc=(name,data)=>store('rpc/'+name,{method:'POST',body:JSON.stringify({test_session:session.id,...data})});
  async function razorpay(endpoint,body){
    let response,data;
    try{response=await fetcher('https://api.razorpay.com/v1/'+endpoint,{
      method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+Buffer.from(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET).toString('base64'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),
    });data=await response.json();}catch{fail(502,'Payment status could not be reached. Check the status before paying again.');}
    if(!response.ok)fail(502,'The ₹1 checkout is temporarily unavailable. Check the status before paying again.');return data;
  }
  function checkedOrder(order,record){
    if(!validId(order?.id,'order')||record.orderId&&order.id!==record.orderId||order.amount!==amount||order.currency!==currency||order.receipt!==record.receipt||order.notes?.purpose!=='website_one_rupee_test')fail(502,'The ₹1 order could not be verified.');
    return order;
  }
  function checkedPayment(payment,order){
    if(!validId(payment?.id,'pay')||payment.order_id!==order.id||payment.amount!==amount||payment.currency!==currency)fail(400,'This payment does not match the ₹1 order.');
    return payment;
  }
  async function inspect(order,record,paymentId){
    let payments;
    if(paymentId){
      const payment=checkedPayment(await razorpay('payments/'+paymentId),order);
      if(payment.id!==paymentId)fail(400,'The payment reference does not match this checkout.');
      payments=[payment];
    }
    else{
      const result=await razorpay('orders/'+order.id+'/payments');if(!Array.isArray(result.items))fail(502,'Payment status could not be verified.');
      payments=result.items.map(payment=>checkedPayment(payment,order));
    }
    const paid=payments.find(payment=>payment.status==='captured'&&payment.captured===true&&!(payment.amount_refunded>0)&&!payment.refund_status);
    if(paid){await rpc('save_payment_test_order',{selected_order:order.id,verified_payment:paid.id});return {verified:true,status:'captured',paymentId:paid.id,orderId:order.id,amount,currency};}
    if(record.state==='paid'||payments.some(payment=>payment.amount_refunded>0||payment.refund_status))return {verified:false,status:'refunded',orderId:order.id,amount,currency};
    return {verified:false,status:payments.some(payment=>['authorized','captured'].includes(payment.status))?'authorized':'unpaid',orderId:order.id,amount,currency};
  }
  if(action==='order'){
    if(Object.keys(input).length)fail(400,'The payment test is fixed at ₹1.');
    const record=await rpc('claim_payment_test_order',{});
    if(record?.state==='rate_limited')fail(429,'The payment test is busy. Please try again later.');
    if(record?.state==='processing')fail(409,'This order is still being prepared. Wait a moment before retrying.');
    if(!record?.receipt||!['create','recover','ready','paid'].includes(record.state))fail(502,'The payment test could not reserve an order.');
    let order;
    if(record.orderId){if(!validId(record.orderId,'order'))fail(502,'The saved payment reference is invalid.');order=checkedOrder(await razorpay('orders/'+record.orderId),record);}
    else if(record.state==='recover'){
      const result=await razorpay('orders?'+new URLSearchParams({receipt:record.receipt,count:'100'}));
      const matches=Array.isArray(result.items)?result.items.filter(order=>order.receipt===record.receipt):[];
      if(matches.length!==1)fail(409,'The previous order needs review. Contact support before starting another payment.');
      order=checkedOrder(matches[0],record);await rpc('save_payment_test_order',{selected_order:order.id,verified_payment:null});
    }else{
      try{
        order=checkedOrder(await razorpay('orders',{amount,currency,receipt:record.receipt,partial_payment:false,notes:{purpose:'website_one_rupee_test',subscription:'none'}}),record);
        if(order.status!=='created')fail(502,'The new ₹1 order is not ready.');
        await rpc('save_payment_test_order',{selected_order:order.id,verified_payment:null});
      }catch(error){try{await rpc('save_payment_test_order',{selected_order:null,verified_payment:null});}catch{}throw error;}
    }
    return {...await inspect(order,record),keyId:env.RAZORPAY_KEY_ID,live:env.RAZORPAY_KEY_ID.startsWith('rzp_live_')};
  }
  const record=await rpc('payment_test_order_status',{});
  if(!validId(record?.orderId,'order'))fail(409,'No payment order was found for this browser.');
  const order=checkedOrder(await razorpay('orders/'+record.orderId),record);
  if(action==='verify'){
    const {razorpay_order_id:orderId,razorpay_payment_id:paymentId,razorpay_signature:proof}=input;
    if(orderId!==record.orderId||!validId(paymentId,'pay')||typeof proof!=='string'||!/^[a-f0-9]{64}$/i.test(proof))fail(400,'The payment confirmation is invalid.');
    const expected=createHmac('sha256',env.RAZORPAY_KEY_SECRET).update(record.orderId+'|'+paymentId).digest();
    if(!timingSafeEqual(expected,Buffer.from(proof,'hex')))fail(400,'The payment signature could not be verified.');
    return inspect(order,record,paymentId);
  }
  if(Object.keys(input).length)fail(400,'Payment status does not accept a payment reference.');
  return inspect(order,record);
}

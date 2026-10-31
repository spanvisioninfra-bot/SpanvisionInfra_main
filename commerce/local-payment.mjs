// Development middleware only. Never imported by the deployed commerce handler.
import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

const prefix='/api/local-payment/';
const amount=100, currency='INR', lifetime=60*60*1000;
const localHost=name=>['localhost','127.0.0.1','[::1]'].includes(name);
const localPeer=address=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const providerId=(value,type)=>typeof value==='string'&&new RegExp('^'+type+'_[A-Za-z0-9]{1,80}$').test(value);

async function body(req){
  if(req.headers['content-type']?.split(';')[0]!=='application/json')fail(415,'Send JSON for the local payment test.');
  let bytes=0,text='';
  for await(const chunk of req){bytes+=chunk.length;if(bytes>4096)fail(413,'Payment request is too large.');text+=chunk;}
  try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}
  catch{fail(400,'Payment request is invalid.');}
}

export function createLocalPaymentHandler({env={},fetcher=fetch,now=Date.now}={}){
  const sessions=new Map();
  const key=env.LOCAL_RAZORPAY_KEY_ID,secret=env.LOCAL_RAZORPAY_KEY_SECRET;
  const enabled=env.LOCAL_PAYMENT_ENABLED==='true'&&/^rzp_(live|test)_[A-Za-z0-9]+$/.test(key||'')&&!!secret&&env.NODE_ENV!=='production';
  async function razorpay(endpoint,payload){
    let response,data;
    try{
      response=await fetcher('https://api.razorpay.com/v1/'+endpoint,{
        method:payload?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{Authorization:'Basic '+Buffer.from(key+':'+secret).toString('base64'),'Content-Type':'application/json'},
        ...(payload?{body:JSON.stringify(payload)}:{}),
      });
      data=await response.json();
    }catch{fail(502,'Razorpay could not be reached. Check your connection and try again.');}
    if(!response.ok)fail(502,response.status===401?'Razorpay rejected the local keys. Update the local payment settings.':'Razorpay could not complete this request. Check the payment in your Razorpay dashboard.');
    return data;
  }
  return async(req,res,next=()=>{res.statusCode=404;res.end();})=>{
    const pathname=(req.url||'').split('?')[0];
    if(!pathname.startsWith(prefix))return next();
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
    try{
      let origin;
      try{origin=new URL('http://'+req.headers.host);}catch{fail(404,'Local payment test is unavailable.');}
      if(!enabled||!localPeer(req.socket?.remoteAddress)||!localHost(origin.hostname))fail(404,'Local payment test is unavailable.');
      if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==origin.origin)fail(403,'Open the payment test from this local website.');
      if(req.method==='POST'&&req.headers.origin!==origin.origin)fail(403,'Open the payment test from this local website.');
      for(const [id,session] of sessions)if(session.expires<=now())sessions.delete(id);
      const cookie=req.headers.cookie?.split(';').map(item=>item.trim()).find(item=>item.startsWith('sv-local-payment='))?.slice(17);
      let session=sessions.get(cookie);
      if(pathname===prefix+'config'&&req.method==='GET'){
        if(!session){
          if(sessions.size>=100)fail(429,'Restart the local payment preview before testing again.');
          const id=randomBytes(24).toString('hex');session={expires:now()+lifetime};sessions.set(id,session);
          res.setHeader('Set-Cookie','sv-local-payment='+id+'; HttpOnly; SameSite=Strict; Path=/api/local-payment; Max-Age=3600');
        }
        return send(200,{enabled:true,amount,currency,live:key.startsWith('rzp_live_')});
      }
      if(!session)fail(403,'Reload the local pricing page before testing a payment.');
      if(req.method!=='POST')fail(405,'Method not allowed.');
      const input=await body(req);
      if(pathname===prefix+'order'){
        if(Object.keys(input).length)fail(400,'The local test amount is fixed at ₹1.');
        if(session.verified)fail(409,'This local payment has already been verified.');
        // Reuse the same in-flight/order result after cancellation, double click or retry.
        if(!session.orderPromise){
          const receipt='local_1inr_'+randomBytes(10).toString('hex');
          session.orderPromise=razorpay('orders',{amount,currency,receipt,partial_payment:false,notes:{purpose:'local_one_rupee_test',subscription:'none'}}).then(order=>{
            if(!providerId(order.id,'order')||order.amount!==amount||order.currency!==currency||order.status!=='created'||order.receipt!==receipt)fail(502,'The ₹1 order could not be verified. Do not continue with payment.');
            session.order=order.id;return {keyId:key,orderId:order.id,amount,currency,live:key.startsWith('rzp_live_')};
          });
          session.orderPromise.catch(()=>{session.orderPromise=null;});
        }
        return send(200,await session.orderPromise);
      }
      if(pathname===prefix+'verify'){
        const {razorpay_order_id:orderId,razorpay_payment_id:paymentId,razorpay_signature:signature}=input;
        if(!session.order||orderId!==session.order||!providerId(paymentId,'pay')||typeof signature!=='string'||!/^[a-f0-9]{64}$/i.test(signature))fail(400,'The payment confirmation is invalid.');
        const expected=createHmac('sha256',secret).update(session.order+'|'+paymentId).digest();
        if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))fail(400,'The payment signature could not be verified.');
        const payment=await razorpay('payments/'+paymentId);
        if(payment.id!==paymentId||payment.order_id!==session.order||payment.amount!==amount||payment.currency!==currency)fail(400,'The payment does not match this ₹1 test.');
        if(payment.status==='captured'&&payment.captured===true&&!(payment.amount_refunded>0)){
          session.verified=true;return send(200,{verified:true,status:'captured',paymentId,amount,currency});
        }
        if(payment.status==='authorized')return send(200,{verified:false,status:'authorized',paymentId,amount,currency});
        fail(409,'This payment is not captured. Check its status in Razorpay before paying again.');
      }
      fail(404,'Endpoint not found.');
    }catch(error){send(error.status||500,{error:error.status?error.message:'The local payment test could not be completed.'});}
  };
}

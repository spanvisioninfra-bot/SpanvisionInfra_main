// Account-bound purchase of one 24-hour extension. Separate from subscription/test payments.
import {createHmac,timingSafeEqual} from 'node:crypto';
import {dayPassPolicy} from './catalog.mjs';

export class DayPassError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new DayPassError(status,message);};
const validId=(value,type)=>typeof value==='string'&&new RegExp('^'+type+'_[A-Za-z0-9]{1,80}$').test(value);
export const dayPassEnabled=env=>env.DAY_PASS_ENABLED==='true';
export const dayPassReady=env=>dayPassEnabled(env)&&/^rzp_(live|test)_[A-Za-z0-9]+$/.test(env.RAZORPAY_KEY_ID||'')&&!!env.RAZORPAY_KEY_SECRET&&!!env.RAZORPAY_WEBHOOK_SECRET;
const rpc=(store,name,body)=>store('rpc/'+name,{method:'POST',body:JSON.stringify(body)});
export function publicDayPass(record){
  return {policy:dayPassPolicy,status:record?.status||'disabled',hasCheckout:!!record?.orderId,activatedAt:record?.activatedAt||null,expiresAt:record?.expiresAt||null};
}
export async function getDayPass(accountId,{env,store}){
  return dayPassEnabled(env)?rpc(store,'day_pass_status',{account_id:accountId}):null;
}
function paymentService({env,fetcher,store}){
  async function razorpay(endpoint,body){
    let response,data;
    try{
      response=await fetcher('https://api.razorpay.com/v1/'+endpoint,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:'Basic '+Buffer.from(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET).toString('base64'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
      data=await response.json();
    }catch{fail(502,'Payment status could not be reached. Check the status before paying again.');}
    if(!response.ok)fail(502,'The day-pass checkout is temporarily unavailable. Check the status before paying again.');
    return data;
  }
  function checkedOrder(order,record,userId){
    if(!validId(order?.id,'order')||record.orderId&&order.id!==record.orderId||order.amount!==100||order.currency!=='INR'||order.receipt!==record.receipt||order.notes?.purpose!=='tool_day_pass'||order.notes?.user_id!==userId)
      fail(502,'The day-pass order could not be verified.');
    return order;
  }
  function checkedPayment(payment,order){
    if(!validId(payment?.id,'pay')||payment.order_id!==order.id||payment.amount!==100||payment.currency!=='INR')fail(400,'This payment does not match your day pass.');
    return payment;
  }
  const save=(userId,orderId,paymentId=null,revoked=false)=>rpc(store,'save_day_pass_order',{account_id:userId,selected_order:orderId,verified_payment:paymentId,revoked});
  async function inspect(userId,record,order,paymentId){
    let payments;
    if(paymentId){const payment=checkedPayment(await razorpay('payments/'+paymentId),order);if(payment.id!==paymentId)fail(400,'The payment reference does not match.');payments=[payment];}
    else{const result=await razorpay('orders/'+order.id+'/payments');if(!Array.isArray(result.items))fail(502,'Payment status could not be verified.');payments=result.items.map(payment=>checkedPayment(payment,order));}
    const refunded=payments.find(payment=>(!record.paymentId||record.paymentId===payment.id)&&(payment.amount_refunded>0||payment.refund_status));
    if(refunded){const pass=await save(userId,order.id,refunded.id,true);return {...publicDayPass(pass),paymentStatus:'refunded'};}
    const paid=payments.find(payment=>payment.status==='captured'&&payment.captured===true&&!(payment.amount_refunded>0)&&!payment.refund_status);
    if(paid){
      if(order.status!=='paid'||order.amount_paid!==100||order.amount_due!==0)fail(502,'Payment capture is still being confirmed. Check payment status shortly.');
      const pass=await save(userId,order.id,paid.id);return {...publicDayPass(pass),paymentStatus:'captured'};
    }
    return {...publicDayPass(record),paymentStatus:payments.some(payment=>['authorized','captured'].includes(payment.status))?'authorized':'unpaid'};
  }
  return {razorpay,checkedOrder,save,inspect};
}

export async function dayPassRoute(action,method,input,user,{env,fetcher,store,access}){
  if(!dayPassEnabled(env)){
    if(action==='status'&&method==='GET')return publicDayPass(null);
    fail(404,'The day pass is not available yet.');
  }
  const record=await getDayPass(user.id,{env,store});
  if(action==='status'&&method==='GET')return {...publicDayPass(['studio','team'].includes(access.plan)||user.role==='super_admin'?{status:'not_eligible'}:record),canPurchase:dayPassReady(env)&&['eligible','pending'].includes(record?.status)&&access.plan==='explorer'&&user.role!=='super_admin'};
  if(method!=='POST'||!['order','verify','status'].includes(action))fail(404,'Endpoint not found.');
  if(!dayPassReady(env))fail(503,'The day-pass checkout is not available yet.');
  const service=paymentService({env,fetcher,store});
  if(action==='order'){
    if(Object.keys(input).length)fail(400,'The day pass costs exactly ₹1 for 24 hours.');
    if(user.role==='super_admin'||['studio','team'].includes(access.plan))fail(409,'Your account already has tool access.');
    const reserved=await rpc(store,'claim_day_pass_order',{account_id:user.id});
    if(reserved?.status==='active')return publicDayPass(reserved);
    if(!['eligible','pending'].includes(reserved?.status))fail(409,reserved?.status==='used'||reserved?.status==='refunded'?'Your one-time day pass has already been used. Choose Studio or Team.':'The day pass is available after your two-day free trial ends.');
    if(reserved.state==='processing')fail(409,'Your checkout is being prepared. Please wait before retrying.');
    if(!reserved.receipt||!['create','recover','ready'].includes(reserved.state))fail(502,'Your day pass could not reserve an order.');
    let order;
    if(reserved.orderId){
      if(!validId(reserved.orderId,'order'))fail(502,'The saved order reference is invalid.');
      order=service.checkedOrder(await service.razorpay('orders/'+reserved.orderId),reserved,user.id);
    }else if(reserved.state==='recover'){
      const result=await service.razorpay('orders?'+new URLSearchParams({receipt:reserved.receipt,count:'100'}));
      const matches=Array.isArray(result.items)?result.items.filter(item=>item.receipt===reserved.receipt):[];
      if(matches.length!==1)fail(409,'Your previous checkout needs review. Contact support before paying again.');
      order=service.checkedOrder(matches[0],reserved,user.id);await service.save(user.id,order.id);
    }else{
      try{
        order=service.checkedOrder(await service.razorpay('orders',{amount:100,currency:'INR',receipt:reserved.receipt,partial_payment:false,notes:{purpose:'tool_day_pass',user_id:user.id}}),reserved,user.id);
        if(order.status!=='created')fail(502,'Your new day-pass checkout is not ready.');
        await service.save(user.id,order.id);
      }catch(error){try{await service.save(user.id,null);}catch{}throw error;}
    }
    return {...await service.inspect(user.id,reserved,order),orderId:order.id,amount:100,currency:'INR',keyId:env.RAZORPAY_KEY_ID};
  }
  if(action==='status'&&Object.keys(input).length)fail(400,'Payment status does not accept a payment reference.');
  if(!validId(record?.orderId,'order'))fail(409,'No day-pass checkout was found for your account.');
  let paymentId;
  if(action==='verify'){
    const {razorpay_order_id:orderId,razorpay_payment_id:payment,razorpay_signature:proof}=input;
    if(Object.keys(input).some(key=>!['razorpay_order_id','razorpay_payment_id','razorpay_signature'].includes(key))||orderId!==record.orderId||!validId(payment,'pay')||typeof proof!=='string'||!/^[a-f0-9]{64}$/i.test(proof))fail(400,'The payment confirmation is invalid.');
    const expected=createHmac('sha256',env.RAZORPAY_KEY_SECRET).update(record.orderId+'|'+payment).digest();
    if(!timingSafeEqual(expected,Buffer.from(proof,'hex')))fail(400,'The payment signature could not be verified.');
    paymentId=payment;
  }
  const order=service.checkedOrder(await service.razorpay('orders/'+record.orderId),record,user.id);
  return service.inspect(user.id,record,order,paymentId);
}

// Caller verifies the raw webhook HMAC before this function. Never trust webhook amounts alone.
export async function dayPassWebhook(event,{env,fetcher,store}){
  if(!dayPassEnabled(env))return;
  const payment=event.payload?.payment?.entity,refund=event.payload?.refund?.entity,dispute=event.payload?.dispute?.entity;
  const orderId=payment?.order_id||event.payload?.order?.entity?.id;
  const paymentId=refund?.payment_id||dispute?.payment_id;
  if(!validId(orderId,'order')&&!validId(paymentId,'pay'))return;
  const filter=validId(orderId,'order')?'order_id=eq.'+orderId:'payment_id=eq.'+paymentId;
  const rows=await store('tool_day_passes?'+filter+'&select=user_id&limit=1');
  if(!rows[0])return;
  const userId=rows[0].user_id,record=await getDayPass(userId,{env,store}),service=paymentService({env,fetcher,store});
  const order=service.checkedOrder(await service.razorpay('orders/'+record.orderId),record,userId);
  if(event.event==='payment.dispute.created'){await service.save(userId,order.id,paymentId,true);return;}
  await service.inspect(userId,record,order);
}

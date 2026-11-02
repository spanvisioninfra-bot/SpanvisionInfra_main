import {Show,createSignal,createEffect,onCleanup} from 'solid-js';
import {accountRequest} from './account-client';
import './day-pass.css';

let sdk;
function loadCheckout(){
  if(window.Razorpay)return Promise.resolve();
  if(!sdk)sdk=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';
    const fail=()=>{clearTimeout(timer);script.remove();sdk=null;reject(new Error('Secure checkout could not load. Please try again.'));};
    const timer=setTimeout(fail,15000);
    script.onerror=fail;script.onload=()=>{if(!window.Razorpay){fail();return;}clearTimeout(timer);resolve();};document.head.append(script);
  });
  return sdk;
}
export default function DayPass(props){
  const [info,setInfo]=createSignal(null),[busy,setBusy]=createSignal(false),[error,setError]=createSignal(''),[message,setMessage]=createSignal(''),[pending,setPending]=createSignal(false);
  let checkout,disposed=false,version=0;
  onCleanup(()=>{disposed=true;version++;checkout?.close();});
  const active=()=>info()?.status==='active'&&Date.parse(info()?.expiresAt)>Date.now();
  const visible=()=>props.account.config()?.dayPassAvailable===true&&(!props.account.user()||props.account.user()?.role!=='super_admin'&&['eligible','pending','active','used','refunded'].includes(info()?.status));
  function update(result){
    setInfo(previous=>({...previous,...result}));
    if(result.status==='active'){
      setPending(false);setMessage('Your day pass is active. Enjoy unlimited launches until '+new Date(result.expiresAt).toLocaleString()+'.');props.onActivated?.();return true;
    }
    if(result.status==='used'||result.status==='refunded'){setPending(true);setMessage(result.status==='refunded'?'This payment was refunded or reversed.':'Your one-time day pass has ended. Choose Studio or Team to continue.');return true;}
    if(result.paymentStatus==='authorized'){setPending(true);setMessage('Payment received; confirmation is pending. Check payment status before paying again.');return true;}
    setPending(false);return false;
  }
  async function refresh(){
    const current=++version,user=props.account.user();setInfo(null);setError('');setMessage('');setPending(false);
    if(!user||user.role==='super_admin'||!props.account.config()?.dayPassAvailable)return;
    try{const result=await accountRequest('billing/day-pass/status');if(disposed||current!==version)return;update(result);
      if(result.status==='pending'&&result.hasCheckout){const status=await accountRequest('billing/day-pass/status',{});if(!disposed&&current===version)update(status);}
    }catch(error){if(!disposed&&current===version)setError(error.message);}
  }
  createEffect(()=>{props.account.user()?.id;props.account.config()?.dayPassAvailable;void refresh();});
  createEffect(()=>{
    if(info()?.status!=='active')return;
    const delay=Date.parse(info().expiresAt)-Date.now();
    if(delay>0){const timer=setTimeout(()=>void refresh(),delay+100);onCleanup(()=>clearTimeout(timer));}
  });
  async function check(){
    if(busy())return;setBusy(true);setError('');
    try{const result=await accountRequest('billing/day-pass/status',{});if(disposed)return;if(!update(result))setMessage('No completed payment is confirmed yet. If you see a debit, check again before paying.');}
    catch(error){if(!disposed)setError(error.message);}finally{if(!disposed)setBusy(false);}
  }
  async function pay(){
    if(busy()||pending()||active()||!info()?.canPurchase)return;
    setBusy(true);setError('');setMessage('Opening secure checkout…');
    try{
      await loadCheckout();const order=await accountRequest('billing/day-pass/order',{});if(disposed)return;
      if(update(order)){setBusy(false);return;}
      if(order.amount!==100||order.currency!=='INR'||!/^order_[A-Za-z0-9]+$/.test(order.orderId||''))throw new Error('The day-pass checkout must be exactly ₹1.');
      checkout=new window.Razorpay({key:order.keyId,amount:100,currency:'INR',order_id:order.orderId,name:'Spanvision Infra',description:'24-hour tool day pass · one-time payment',prefill:{email:props.account.user()?.email},
        handler:async result=>{
          if(disposed)return;setPending(true);setMessage('Confirming your day pass…');
          try{const status=await accountRequest('billing/day-pass/verify',result);if(!disposed)update(status);}
          catch(error){if(!disposed){setError(error.message+' Check payment status before paying again.');setMessage('');}}
          finally{if(!disposed)setBusy(false);}
        },modal:{ondismiss:()=>{checkout=null;if(!disposed){setBusy(false);if(!pending()&&!active())setMessage('Checkout closed. You can resume the same ₹1 checkout.');}}},
      });
      checkout.on('payment.failed',()=>{if(!disposed){setError('Payment was not completed. Check its status if your bank shows a debit.');setMessage('');}});
      checkout.open();setMessage('Complete the ₹1 payment in secure checkout.');
    }catch(error){if(!disposed){setError(error.message);setMessage('');setBusy(false);}}
  }
  return <Show when={visible()}><aside class="day-pass-card" aria-label="One-day tool access">
    <div class="day-pass-copy"><span class="eyebrow">ONE-DAY TOOL ACCESS</span><h3>{active()?'Your day pass is active':info()?.status==='used'?'Your day pass has ended':'Explore for one more day'}</h3>
      <p>₹1 for 24 hours of unlimited launches across 13 tools after your free trial. One pass per account. No automatic renewal.</p>
      <p class="day-pass-detail">BIM, STL-3D, FEM and AI features remain coming soon.</p>
    </div><div class="day-pass-actions"><strong class="day-pass-price">₹1 <small>INR · one time</small></strong>
      <Show when={props.account.user()} fallback={<a href="/login" class="button button-outline">Sign in to check eligibility →</a>}>
        <Show when={active()} fallback={<Show when={info()?.canPurchase&&!['used','refunded'].includes(info()?.status)} fallback={<a href="/pricing" class="button button-outline">Explore Studio & Team →</a>}>
          <button type="button" class="button button-light" disabled={busy()||pending()} onClick={pay}>{busy()?'Please wait…':pending()?'Payment pending':info()?.hasCheckout?'Resume ₹1 checkout':'Get 24-hour access · ₹1'}</button>
        </Show>}><a href="/tools" class="button button-light">Open the tools →</a></Show>
        <Show when={info()?.status==='pending'}><button type="button" class="button button-outline" disabled={busy()} onClick={check}>Check payment status</button></Show>
      </Show>
    </div><Show when={message()}><p class="day-pass-message" role="status">{message()}</p></Show><Show when={error()}><p class="form-error day-pass-message" role="alert">{error()}</p></Show>
  </aside></Show>;
}

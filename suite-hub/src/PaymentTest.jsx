import {Show,createSignal,onMount,onCleanup} from 'solid-js';
import './payment-test.css';

const local=import.meta.env.DEV&&['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const api=local?'/api/local-payment/':'/api/billing/payment-test/';

let checkoutScript;
function loadCheckout(){
  if(window.Razorpay)return Promise.resolve();
  if(!checkoutScript)checkoutScript=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';
    const timer=setTimeout(()=>{script.remove();checkoutScript=null;reject(new Error('Razorpay Checkout took too long to load. Try again.'));},15000);
    script.onload=()=>{clearTimeout(timer);if(window.Razorpay)resolve();else{checkoutScript=null;script.remove();reject(new Error('Razorpay Checkout is unavailable.'));}};
    script.onerror=()=>{clearTimeout(timer);checkoutScript=null;script.remove();reject(new Error('Could not load Razorpay Checkout. Check your connection.'));};
    document.head.append(script);
  });
  return checkoutScript;
}
async function request(endpoint,value){
  const response=await fetch(api+endpoint,{method:value===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(45000),...(value===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})});
  let result;try{result=await response.json();}catch{throw new Error('The payment service is unavailable.');}
  if(!response.ok)throw new Error(result.error||'The payment request failed.');return result;
}
export default function PaymentTest(){
  const [config,setConfig]=createSignal(null),[busy,setBusy]=createSignal(false),[message,setMessage]=createSignal(''),[error,setError]=createSignal(''),[confirmation,setConfirmation]=createSignal(null),[complete,setComplete]=createSignal(false);
  let checkout,disposed=false;
  onMount(()=>{request('config').then(data=>{if(!disposed)setConfig(data);}).catch(()=>{});});
  onCleanup(()=>{disposed=true;checkout?.close();});
  function showStatus(data){
    if(data.verified){setComplete(true);setMessage('₹1 payment verified. Payment ID: '+data.paymentId);return true;}
    if(data.status==='authorized'){setConfirmation(value=>value||{});setMessage('Payment authorized; capture is pending. Check the payment status below or in Razorpay. Do not pay again.');return true;}
    if(data.status==='refunded'){setConfirmation(value=>value||{});setMessage('This payment was refunded or reversed. Check your payment app for the current status.');return true;}
    setMessage('No completed payment was found. If your account shows a debit, check its status with your payment app before paying again.');return false;
  }
  async function verify(result){
    setBusy(true);setError('');setMessage('Verifying your ₹1 payment…');
    try{
      const data=await request('verify',result);if(disposed)return;
      if(local&&!data.verified)setMessage('Payment authorized; capture is pending. Check the payment status below or in Razorpay. Do not pay again.');
      else showStatus(data);
    }catch(error){if(!disposed){setMessage('');setError(error.message+' Use “Check payment status” before paying again.');}}
    finally{if(!disposed)setBusy(false);}
  }
  async function checkStatus(){
    if(local)return verify(confirmation());
    setBusy(true);setError('');setMessage('Checking your payment status…');
    try{const data=await request('status',{});if(!disposed)showStatus(data);}
    catch(error){if(!disposed){setError(error.message);setMessage('');}}
    finally{if(!disposed)setBusy(false);}
  }
  async function pay(){
    if(busy()||confirmation()||complete())return;
    setBusy(true);setError('');setMessage('Opening secure checkout…');
    try{
      await loadCheckout();const order=await request('order',{});if(disposed)return;
      if(order.amount!==100||order.currency!=='INR')throw new Error('The payment test must be exactly ₹1.');
      if(!local&&order.status&&showStatus(order)){setBusy(false);return;}
      checkout=new window.Razorpay({key:order.keyId,amount:order.amount,currency:order.currency,order_id:order.orderId,name:'Spanvision Infra',description:'₹1 payment test · no subscription',
        handler:result=>{if(disposed)return;setConfirmation(result);void verify(result);},
        modal:{ondismiss:()=>{if(!disposed&&!confirmation()){setBusy(false);setMessage('Checkout closed. No payment has been confirmed.');}}},
      });
      checkout.on('payment.failed',()=>{if(!disposed){setError('Payment was not completed. Check Razorpay if your bank shows a debit.');setMessage('');}});
      setMessage('Complete the ₹1 payment in Razorpay Checkout.');checkout.open();
    }catch(error){if(!disposed){setError(error.message);setMessage('');setBusy(false);}}
    finally{if(!disposed&&!checkout)setBusy(false);}
  }
  return <Show when={config()?.enabled}><aside class="local-payment-test" aria-labelledby="local-payment-title">
    <div class="local-payment-copy"><span class="local-payment-badge">{local?'LOCAL PAYMENT TEST':'ONE-TIME PAYMENT TEST'}</span><h3 id="local-payment-title">Try a ₹1 payment</h3><p>{config()?.live?'Live Razorpay checkout — this charges a real ₹1.':'Razorpay test mode — no real money is charged.'} This is a one-time test and does not start a subscription or unlock a plan.</p><p class="local-payment-note">{local?'Available only in this local preview.':'For UPI, choose your linked bank account. Wallet payments depend on merchant support.'}</p></div>
    <div class="local-payment-action"><span class="local-payment-amount">₹1<span>INR · one time</span></span><button type="button" class="button button-light" disabled={busy()||complete()||!!confirmation()} onClick={pay}>{complete()?'Payment verified':busy()?'Please wait…':config()?.live?'Pay ₹1 · live test':'Test ₹1 checkout'}</button></div>
    <Show when={message()}><p class="local-payment-message" role="status">{message()}</p></Show><Show when={error()}><p class="local-payment-error" role="alert">{error()}</p></Show>
    <Show when={!complete()&&(!local||confirmation())}><button type="button" class="button button-outline" disabled={busy()} onClick={checkStatus}>Check payment status</button></Show>
  </aside></Show>;
}

import {createSignal,createEffect,For,Show} from 'solid-js';
import {accountRequest} from './account-client';
import {passwordPolicy} from '../../commerce/password-policy.mjs';
import brand from './brand.json';

export function AuthGateway(props){
  const [busy,setBusy]=createSignal(false),[error,setError]=createSignal(''),[email,setEmail]=createSignal(''),[notice,setNotice]=createSignal(''),[recovery,setRecovery]=createSignal(false),[visible,setVisible]=createSignal(false);
  createEffect(()=>{props.screen;setError('');setNotice('');setVisible(false);});
  const title=()=>({login:'Welcome back.',signup:'Make space for your ideas.',forgot:'A fresh start.',verify:'Check your inbox.',reset:'Set a new password.'})[props.screen];
  const unconfigured=()=>!props.account.loading()&&props.account.config()?.authAvailable===false;
  const minPasswordLength=()=>props.account.config()?.passwordPolicy?.minLength??passwordPolicy.minLength;
  const maxPasswordLength=()=>props.account.config()?.passwordPolicy?.maxLength??passwordPolicy.maxLength;
  async function resendCode(){
    if(busy()||!props.account.config()?.authAvailable)return;
    setBusy(true);setError('');setNotice('');
    try{await accountRequest('account/resend-verification',{email:email(),type:recovery()?'recovery':'signup'});setNotice('A new code has been requested. Check your inbox.');}
    catch(error){setError(error.message);}finally{setBusy(false);}
  }
  async function submit(event){
    event.preventDefault();if(busy()||props.account.loading()||!props.account.config()?.authAvailable)return;
    const data=new FormData(event.currentTarget);setBusy(true);setError('');setNotice('');
    try{
      let result;
      if(props.screen==='signup'){
        if(data.get('password')!==data.get('confirm'))throw new Error('The passwords do not match.');
        setEmail(data.get('email'));setRecovery(false);
        result=await accountRequest('account/sign-up',{name:data.get('name'),email:data.get('email'),password:data.get('password')});
        if(result.verifyEmail){location.hash='verify';return;}
      }else if(props.screen==='login')result=await accountRequest('account/sign-in',{email:data.get('email'),password:data.get('password')});
      else if(props.screen==='forgot'){
        setEmail(data.get('email'));setRecovery(true);
        await accountRequest('account/recovery',{email:data.get('email')});location.hash='verify';return;
      }else if(props.screen==='verify'){
        result=await accountRequest('account/verify',{email:data.get('email'),code:data.get('code'),type:recovery()?'recovery':'signup'});
        if(result.recovery){location.hash='reset';return;}
        if(result.signInRequired){setNotice('Your email is verified. Sign in below with your password.');return;}
      }else if(props.screen==='reset'){
        if(data.get('password')!==data.get('confirm'))throw new Error('The passwords do not match.');
        result=await accountRequest('account/password',{password:data.get('password')});
        if(result.signInRequired){setNotice('Your password has been updated. Sign in below with your new password.');return;}
      }
      await props.account.refresh();
      if(props.account.error())throw new Error(props.account.error());
      const destination=result?.redirectTo||(props.account.user()?.role==='super_admin'?'#admin':'#account');
      const returnTool=new URL(location.href).searchParams.get('returnTool');
      if(destination!=='#admin'&&brand.modules.some(tool=>tool.id===returnTool)){
        const launch=new URL('/launch.html',location.origin);launch.searchParams.set('tool',returnTool);launch.searchParams.set('appearance',props.mode==='light'?'light':'dark');location.assign(launch.href);return;
      }
      location.hash=destination==='#admin'?'#admin':'#account';
    }catch(error){setError(error.message);}finally{setBusy(false);}
  }
  return <section class="identity-page"><aside class="identity-story"><span class="eyebrow">SPANVISION INFRA / YOUR PRACTICE</span><div><img class="identity-symbol" src={props.mode==='light'?'/spanvision-mark-light.svg':'/spanvision-mark.svg'} alt="" width="58" height="58"/><h2>Good ideas<br/>deserve a<br/><span>clear workspace.</span></h2><p>One place for the tools behind your next project.</p></div><a href="#modules" class="text-button">Explore the toolkit <span>↗</span></a></aside><div class="identity-form-panel"><a href="#landing" class="identity-back">← Back to home</a><span class="eyebrow">{props.screen==='signup'?'CREATE YOUR ACCOUNT':props.screen==='login'?'SIGN IN':'ACCOUNT ACCESS'}</span><h1>{title()}</h1><p class="identity-description">{({login:'Sign in to your Spanvision Infra account.',signup:'Create an account to start your two-day trial.',forgot:'Enter your email to receive a password-reset code.',verify:'Enter the code sent to your email. If the address has an account, a reset email can be sent.',reset:'Choose a strong password you haven’t used before.'})[props.screen]}</p>
    <Show when={props.account.loading()}><p class="account-setup-note" role="status">Checking account availability…</p></Show><Show when={unconfigured()}><p class="account-setup-note">Online sign-up and sign-in are not available yet. The authentication service has not been configured. Tool access requires a verified online account. Please try again shortly.</p></Show>
    <Show when={!props.account.loading()&&props.account.error()}><p class="account-setup-note" role="alert">{props.account.error()}</p></Show>
    <Show when={!props.account.loading()&&(props.account.error()||unconfigured())}><button type="button" class="button button-outline account-retry" onClick={()=>props.account.refresh()}>Retry connection <span>↻</span></button></Show>
    <Show when={!props.account.loading()&&!props.account.config()?.authAvailable}><div class="home-account-actions"><a class="button button-light" href="#profile">Create local profile →</a><a class="button button-outline" href="#modules">Open tools →</a></div></Show><form onSubmit={submit} class="identity-form"><Show when={props.screen==='signup'}><label>Full name<input name="name" autocomplete="name" maxlength="80" required placeholder="Your name"/></label></Show><Show when={props.screen!=='reset'}><label>Email address<input name="email" type="email" autocomplete="email" required maxlength="254" value={email()} onInput={event=>setEmail(event.currentTarget.value)} placeholder="you@company.com"/></label></Show>
    <Show when={['login','signup','reset'].includes(props.screen)}><label>Password<div class="password-field"><input name="password" type={visible()?'text':'password'} required minlength={props.screen==='login'?1:minPasswordLength()} maxlength={maxPasswordLength()} autocomplete={props.screen==='login'?'current-password':'new-password'} placeholder={props.screen==='login'?'Your password':`At least ${minPasswordLength()} characters`}/><button type="button" aria-label={visible()?'Hide password':'Show password'} aria-pressed={visible()} onClick={()=>setVisible(!visible())}>{visible()?'Hide':'Show'}</button></div></label></Show><Show when={['signup','reset'].includes(props.screen)}><label>Confirm password<input name="confirm" type={visible()?'text':'password'} required minlength={minPasswordLength()} maxlength={maxPasswordLength()} autocomplete="new-password" placeholder="Repeat your password"/></label></Show><Show when={props.screen==='verify'}><label>Email code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" minlength="6" maxlength="8" required placeholder="Enter your verification code"/></label><label>Verification purpose<select value={recovery()?'recovery':'signup'} onChange={event=>setRecovery(event.currentTarget.value==='recovery')}><option value="signup">Confirm new account</option><option value="recovery">Reset password</option></select></label></Show>
    <Show when={props.screen==='login'}><a href="#forgot" class="forgot-link">Forgot password?</a></Show><Show when={error()}><p role="alert" class="form-error">{error()}</p></Show><Show when={notice()}><p role="status" class="form-success">{notice()}</p></Show><button class="button button-light" disabled={busy()||props.account.loading()||!props.account.config()?.authAvailable}>{busy()?'Please wait…':props.account.loading()?'Checking connection…':!props.account.config()?.authAvailable?(unconfigured()?'Online accounts unavailable':'Connection unavailable'):({login:'Sign in',signup:'Create account',forgot:'Send reset code',verify:'Verify email',reset:'Update password'})[props.screen]} <span>→</span></button></form>
    <Show when={props.screen==='verify'&&props.account.config()?.authProvider==='neon'}><button type="button" class="text-button" disabled={busy()||!props.account.config()?.authAvailable} onClick={resendCode}>Send a new code</button></Show>
    <p class="identity-switch">{props.screen==='login'?<>New to Spanvision Infra? <a href="#signup">Create an account</a></>:<>Already have an account? <a href="#login">Sign in</a></>}</p><p class="identity-small">Your online account is separate from the drafts stored in each tool. Signing in does not upload your project files.</p></div></section>;
}
export function OnlineAccount(props){
  const [billing,setBilling]=createSignal([]),[access,setAccess]=createSignal(null),[trial,setTrial]=createSignal(null),[error,setError]=createSignal(''),[busy,setBusy]=createSignal(false);
  async function refreshBilling(){
    if(!props.account.user())return;
    try{const [result,usage]=await Promise.all([accountRequest('billing/status'),accountRequest('account/tool-status')]);setBilling(result.subscriptions);setAccess(result.access||null);setTrial(usage.trial);}catch(error){setError(error.message);}
  }
  createEffect(()=>{if(props.account.user())void refreshBilling();else{setBilling([]);setAccess(null);setTrial(null);}});
  async function action(callback){setBusy(true);setError('');try{await callback();}catch(error){setError(error.message);}finally{setBusy(false);}}
  return <section class="online-account marketing-section"><Show when={props.account.user()} fallback={<div class="signed-out-card"><span class="eyebrow">YOUR ACCOUNT</span><h1>A place for your practice.</h1><p>Sign in to view your account and billing. Your account tracks your trial and paid access.</p><a href="#login" class="button button-light">Sign in →</a><a href="#modules" class="text-button">Continue to tools</a></div>}>{user=><><div class="online-account-heading"><div><span class="eyebrow">YOUR ACCOUNT</span><h1>Hello, {user().name||'there'}.</h1><p>{user().email}</p></div><button class="button button-outline" disabled={busy()} onClick={()=>action(props.account.signOut)}>Sign out</button></div><div class="online-account-grid"><article><span class="eyebrow">WORKSPACE</span><h2>Your next project starts here.</h2><p>Open a tool and carry on with your work. Local drafts remain on the device where you created them.</p><a href="#modules" class="button button-light">Open the tools →</a><a href="#profile" class="text-button">Manage local profile</a><Show when={user().role==='super_admin'}><a href="#admin" class="button button-outline">Manage users & plans →</a></Show></article><article><span class="eyebrow">SUBSCRIPTIONS & BILLING</span><h2>Your plan.</h2><Show when={user().role==='super_admin'} fallback={<Show when={access()}><p class="account-access-plan">Account access: <strong>{({explorer:'Explorer',studio:'Studio',team:'Team'})[access().plan]}</strong>{access().source==='admin'?' · Admin grant':''}</p></Show>}><p class="account-access-plan"><strong>Super admin · All plans</strong><br/>Explorer, Studio and Team access.</p></Show><Show when={billing().length} fallback={<p>No paid subscription is recorded. After the two-day trial, a Studio or Team plan is required.</p>}><ul class="subscription-list"><For each={billing()}>{subscription=><li><b>{subscription.plan_key.replaceAll('_',' ')}</b><span>{subscription.status}</span><Show when={subscription.current_period_end}><small>Current billing period ends {new Date(subscription.current_period_end).toLocaleDateString('en-GB')}</small></Show></li>}</For></ul></Show><Show when={access()?.plan==='explorer'&&trial()}><div class="trial-status" role="status"><strong>{trial().status==='not_started'?'Your two-day trial is ready':trial().status==='expired'?'Your trial has ended':`Trial day ${trial().day} of 2 · ${trial().remaining} ${trial().remaining===1?'launch':'launches'} remaining`}</strong><p>{trial().status==='not_started'?'Your first tool launch starts the trial. You get 3 launches across all tools on each trial day.':trial().status==='expired'?'Choose Studio or Team to continue using the tools.':`Your trial ends ${new Date(trial().expiresAt).toLocaleString()}.`}</p></div></Show><a href="#pricing" class="button button-outline">Explore plans →</a><Show when={billing().some(subscription=>subscription.provider==='stripe')}><button class="text-button" disabled={busy()} onClick={()=>action(async()=>{const result=await accountRequest('billing/portal',{});location.assign(result.url);})}>Manage Stripe billing ↗</button></Show><Show when={billing().some(subscription=>subscription.provider==='razorpay')}><p class="billing-help">Use the Razorpay subscription link in your payment email to manage your subscription.</p></Show><button class="text-button" disabled={busy()} onClick={()=>action(refreshBilling)}>Refresh billing status</button><p class="billing-help">A checkout return is not proof of payment. Your plan updates after confirmation from the payment provider.</p></article></div><Show when={error()}><p role="alert" class="form-error">{error()}</p></Show></>}</Show></section>;
}

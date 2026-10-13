import {For,Show,createSignal} from 'solid-js';
import {plans,regions,selection,formatPrice} from '../../commerce/catalog.mjs';
import {accountRequest} from './account-client';

function Arrow(){return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>;}
function Check(){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>;}
export function Pricing(props){
  const [region,setRegion]=createSignal('IN'),[interval,setInterval]=createSignal('monthly'),[chosen,setChosen]=createSignal(null),[busy,setBusy]=createSignal(false),[error,setError]=createSignal('');
  let dialog,previousFocus;
  const approved=()=>props.account.config()?.pricingApproved===true;
  const displayedPlans=()=>props.account.config()?.plans||plans;
  function review(event,plan){previousFocus=event.currentTarget;setError('');setChosen(selection(plan.id,region(),interval()));dialog.showModal();}
  function close(){dialog.close();previousFocus?.focus();}
  async function checkout(){
    if(!props.account.user()){close();location.hash='signup';return;}
    setBusy(true);setError('');
    try{const choice=chosen();const result=await accountRequest('billing/checkout',{plan:choice.plan.id,region:choice.region.id,interval:choice.interval});location.assign(result.url);}
    catch(error){setError(error.message);}finally{setBusy(false);}
  }
  return <section class="pricing-section marketing-section" id="pricing-section" aria-labelledby="pricing-heading">
    <div class="marketing-section-heading"><div><span class="eyebrow">ROOM TO GROW</span><h2 id="pricing-heading">A plan for your practice.</h2></div><p>Start exploring today.<br/>Choose the way you want to work.</p></div>
    <div class="pricing-controls"><div class="billing-toggle" role="group" aria-label="Billing cycle"><button type="button" aria-pressed={interval()==='monthly'} onClick={()=>setInterval('monthly')}>Monthly</button><button type="button" aria-pressed={interval()==='annual'} onClick={()=>setInterval('annual')}>Annually <span>2 months included</span></button></div><label class="region-selector">Billing region<select value={region()} onChange={event=>setRegion(event.currentTarget.value)}><For each={regions}>{item=><option value={item.id}>{item.label} · {item.currency}</option>}</For></select></label></div>
    <Show when={!approved()}><p class="pricing-draft" role="note"><span>Pricing preview</span> Sample prices and proposed packages. Paid plans are not on sale yet; no payment will be taken.</p></Show>
    <div class="pricing-grid"><For each={displayedPlans()}>{plan=><article class="price-card" classList={{featured:plan.id==='studio'}}>
      <div class="price-card-top"><span class="eyebrow">{plan.id==='explorer'?'EXPLORE':plan.id==='studio'?'CREATE':'COLLABORATE'}</span><Show when={plan.id==='studio'}><span class="plan-tag">For individuals</span></Show></div>
      <h3>{plan.name}</h3><p class="plan-caption">{plan.caption}</p><div class="plan-price"><strong>{formatPrice(plan.prices[regions.find(item=>item.id===region()).currency]*(interval()==='annual'?10:1),region())}</strong><span>{plan.id==='explorer'?'always free':`/ ${interval()==='annual'?'year':'month'}`}</span></div><p class="plan-billing">{plan.id==='explorer'?'No card needed. No sign-in required.':`Per ${plan.id==='team'?'team':'account'} · billed ${interval()==='annual'?'annually':'monthly'}${approved()?'': ' · draft price'}`}</p>
      <Show when={plan.id!=='explorer'} fallback={<a class="button button-outline" href="#modules">Explore the tools<Arrow/></a>}><button class={`button ${plan.id==='studio'?'button-light':'button-outline'}`} onClick={event=>review(event,plan)}>{approved()?'Choose this plan':'Preview this plan'}<Arrow/></button></Show>
      <ul class="plan-features"><For each={plan.features}>{feature=><li><Check/><span>{feature}</span></li>}</For></ul>
    </article>}</For></div>
    <div class="payment-strip"><span>Made for practices in</span><b>India <i>INR</i></b><b>United States <i>USD</i></b><b>United Kingdom <i>GBP</i></b><span>Secure hosted checkout when billing opens.</span></div>
    <p class="pricing-footnote">Prices are set per region, rather than converted at checkout. Tax treatment and supported payment methods will be confirmed before subscriptions open. Team features are still being defined.</p>
    <dialog ref={dialog} class="checkout-dialog" aria-labelledby="checkout-title" onCancel={()=>previousFocus?.focus()}>
      <Show when={chosen()}>{choice=><><div class="checkout-title-row"><span class="eyebrow">{approved()?'YOUR SUBSCRIPTION':'PLAN PREVIEW'}</span><button type="button" class="close-icon" aria-label="Close plan preview" onClick={close}>×</button></div><h2 id="checkout-title">{choice().plan.name}, your way.</h2><dl class="checkout-summary"><div><dt>Billing region</dt><dd>{choice().region.label}</dd></div><div><dt>Billing cycle</dt><dd>{choice().interval==='annual'?'Annual':'Monthly'}</dd></div><div><dt>{approved()?'Plan price':'Draft price'}</dt><dd>{formatPrice(choice().amount,choice().region.id)} / {choice().interval==='annual'?'year':'month'}</dd></div></dl><Show when={!approved()}><p class="checkout-note">This is a preview. No payment will be taken. Final prices and plan features will be confirmed before subscriptions open.</p></Show><Show when={error()}><p class="form-error" role="alert">{error()}</p></Show><Show when={approved()} fallback={<><a href="#signup" class="button button-light" onClick={close}>Create your account<Arrow/></a><button class="text-button" onClick={close}>Keep exploring</button></>}><button class="button button-light" disabled={busy()} onClick={checkout}>{busy()?'Opening checkout…':props.account.user()?'Continue to secure checkout':'Create an account to continue'}<Arrow/></button></Show></>}</Show>
    </dialog>
  </section>;
}
export function FAQ(){
  return <section class="marketing-section faq-section" aria-labelledby="faq-heading"><div><span class="eyebrow">HELP & ANSWERS</span><h2 id="faq-heading">Frequently asked questions.</h2></div><div class="faq-list"><details><summary>Can I explore without an account?</summary><p>Yes. All 16 browser tools remain available with anonymous workspaces and local profiles. An online account is separate from your local tool drafts.</p></details><details><summary>Are the displayed subscriptions on sale?</summary><p>Paid packages and prices are currently a preview. Checkout stays closed until the plans, payment account and billing setup are confirmed.</p></details><details><summary>Where are my project files saved?</summary><p>Each tool has its own file workflow. Browser drafts stay on your device. BIM and map processing can use temporary server storage. Download important project files and results to keep them.</p></details><details><summary>Can users in India, the US and UK pay?</summary><p>The pricing page supports INR, USD and GBP. Once billing opens, supported methods will appear in hosted checkout for the selected region.</p></details><details><summary>How do I open a tool?</summary><p>Choose Tools from the navigation, then open the workspace you need. A short Spanvision Infra splash screen appears while the tool loads in a new tab.</p></details></div></section>;
}
export default function MarketingHome(props){
  return <div class="marketing-home">
    <section class="company-home-page" aria-labelledby="home-heading"><div class="company-intro">
      <div class="company-intro-copy">
        <h1 id="home-heading" data-sv-reveal>{props.organization}</h1>
        <div class="company-intro-bottom"><p data-sv-reveal>From first sketch to final calculation.<br/>Draw, validate, plan and build in one connected workspace.</p><div class="intro-actions" data-sv-reveal><a class="button button-light" href="#modules">Explore all tools<Arrow/></a><button class="button button-outline" onClick={props.openScan}>Explore scan & OCR</button></div></div>
        <div class="intro-summary" data-sv-reveal><span><b>{props.toolCount}</b> engineering tools</span><i/><span>One workspace. Your workflow.</span></div>
      </div>
      <picture class="landing-cover" aria-hidden="true"><source media="(max-width: 767px)" srcset="/bridge-steel-cover.png" width="941" height="1672"/><img class="landing-cover-image" src="/bridge-steel-cover-wide.png" width="1916" height="821" alt="" loading="eager" fetchpriority="high" decoding="async" draggable="false" onError={event=>{event.currentTarget.style.visibility='hidden';}}/></picture>
    </div>
    <section class="home-account-access" aria-labelledby="account-access-heading"><div><span class="eyebrow">YOUR WORKSPACE</span><h2 id="account-access-heading">{props.account.user()?'Welcome back.':'Explore freely. Sign in when you need to.'}</h2><p>Your tools are available without an account. Account access and subscriptions live here, alongside your toolkit.</p></div><div class="home-account-actions"><Show when={props.account.user()} fallback={<><a href="#login" class="button button-outline">Sign in</a><a href="#signup" class="button button-light">Create account<Arrow/></a></>}><a href="#account" class="button button-light">My account<Arrow/></a></Show></div></section>
    </section>
    <Pricing account={props.account}/>
    <FAQ/>
  </div>;
}

import {createServer} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';

const server=await createServer({server:{port:4237}});
await server.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  await mkdir('test-results/usability',{recursive:true});
  const page=await browser.newPage({reducedMotion:'reduce'});
  let signedIn=true,pricingApproved=true;
  let accountUser={id:'qa-admin',name:'Asha Rao',email:'asha@example.test',role:'super_admin'};
  let accountSubscriptions=[],accountAccess={plan:'team',source:'super_admin'};
  let accountTrial={status:'not_started'},billingReads=0;
  const adminUsers=[
    {id:'qa-asha',name:'Asha Rao',email:'asha@example.test',emailVerified:true,role:'member',access:{plan:'studio',source:'subscription'}},
    {id:'qa-bea',name:'Bea Thomas',email:'bea.with.a.long.address.for.layout.verification@example.test',emailVerified:true,role:'member',access:{plan:'explorer',source:'free'}},
    {id:'qa-cameron',name:'Cameron Lee',email:'cameron@example.test',emailVerified:true,role:'super_admin',access:{plan:'team',source:'super_admin'}},
  ];
  let adminWrites=0;
  // Exercise the optional payment panel without creating orders or payments.
  await page.route('**/api/**',route=>{
    const url=route.request().url();
    if(url.endsWith('/billing/status')){billingReads++;return route.fulfill({json:{subscriptions:accountSubscriptions,access:accountAccess}});}
    if(url.endsWith('/account/tool-status'))return route.fulfill({json:{access:accountAccess,trial:accountTrial}});
    if(url.endsWith('/account/sign-out')){signedIn=false;return route.fulfill({json:{ok:true}});}
    if(url.includes('/api/admin/')) {
      if(route.request().method()!=='GET'){adminWrites++;return route.abort();}
      const requestUrl=new URL(url);
      if(requestUrl.pathname.endsWith('/users')) {
        const number=Number(requestUrl.searchParams.get('page'));
        return route.fulfill({json:{users:number===2?adminUsers.slice(2):adminUsers.slice(0,2),page:number,hasNext:number===1,total:3}});
      }
      const user=adminUsers.find(user=>user.id===requestUrl.searchParams.get('user'));
      return route.fulfill({json:{user,access:user.access,override:null,subscriptions:[],audit:[]}});
    }
    const data=url.endsWith('/account/config')?{authAvailable:true,pricingApproved}:
      url.endsWith('/account/session')?{user:signedIn?accountUser:null}:
      url.endsWith('/order')?{amount:100,currency:'INR',orderId:'qa-order',keyId:'qa-key'}:
      url.endsWith('/config')?{enabled:true,live:false}:{};
    return route.fulfill({json:data});
  });
  for(const width of [320,390,820,1440,1920])for(const theme of ['dark','light']) {
    await page.setViewportSize({width,height:960});
    await page.goto(`http://127.0.0.1:4237/?appearance=${theme}`);
    await page.waitForSelector('.local-payment-test');
    const layout=await page.evaluate(()=>{
      const rect=e=>e.getBoundingClientRect();
      const hero=rect(document.querySelector('.company-intro'));
      const pricing=rect(document.querySelector('#pricing-section'));
      const size=s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
      const visible=[...document.querySelectorAll('.marketing-home *, .marketing-header *, .preview-footer *')].filter(e=>e.getClientRects().length);
      return {
        gap:pricing.top-hero.bottom,
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        contained:[...document.querySelectorAll('.plan-features li')].every(li=>{
          const r=rect(li),card=rect(li.closest('article'));
          return r.top>=card.top&&r.bottom<=card.bottom&&r.left>=card.left&&r.right<=card.right;
        }),
        heading:size('#pricing-heading'),title:size('.price-card h3'),
        small:['.intro-summary','.plan-billing','.local-payment-badge'].map(size),
        sizes:[...new Set(visible.filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>getComputedStyle(e).fontSize))],
        radii:[...new Set(visible.map(e=>getComputedStyle(e).borderRadius))],
      };
    });
    assert.equal(layout.gap,0);assert.equal(layout.overflow,false);assert.equal(layout.contained,true);
    assert.ok(layout.heading>layout.title);assert.ok(layout.small.every(n=>n>=12));
    assert.ok(layout.sizes.length<=10,JSON.stringify(layout.sizes));
    assert.ok(layout.radii.length<=6,JSON.stringify(layout.radii));
    const annual=page.getByRole('button',{name:'Annually'});
    await annual.click();assert.equal(await annual.getAttribute('aria-pressed'),'true');
    assert.equal(await page.getByRole('button',{name:'Monthly',exact:true}).getAttribute('aria-pressed'),'false');
    await page.locator('#sv-color-mode').focus();
    assert.equal(await page.locator('#sv-color-mode').evaluate(e=>e===document.activeElement),true);
    if(width===390||width===1440)await page.screenshot({path:`test-results/usability/home-${width}-${theme}.png`,fullPage:true});
    console.log('PASS',width,theme,JSON.stringify(layout));
  }
  const brand=JSON.parse(await readFile(new URL('../src/brand.json',import.meta.url),'utf8'));
  await page.route('**/__suite/status',route=>route.fulfill({json:{modules:brand.modules.map(m=>({...m,available:true}))}}));
  await page.route('**/__stl/status',route=>route.fulfill({json:{id:'stl',available:true}}));
  for(const width of [320,390,820,1440,1920])for(const theme of ['dark','light']) {
    await page.setViewportSize({width,height:960});
    await page.goto(`http://127.0.0.1:4237/tools?appearance=${theme}`);
    await page.waitForSelector('.module-bottom a');
    const result=await page.evaluate(()=>{
      const all=[...document.querySelectorAll('.company-catalog *, .marketing-header *, .preview-footer *')].filter(e=>e.getClientRects().length);
      const heading=document.querySelector('#tools-title').getBoundingClientRect();
      const action=document.querySelector('.catalog-heading>.button').getBoundingClientRect();
      const cards=[...document.querySelectorAll('.module-card')];
      return {
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        centerDifference:Math.abs((heading.top+heading.bottom-action.top-action.bottom)/2),
        headings:cards.every(c=>c.querySelector('h2')&&!c.querySelector('h3')),
        names:cards.every(c=>{const a=c.querySelector('.module-bottom a');return !a||a.textContent===`Open ${c.querySelector('h2').textContent}`;}),
        list:document.querySelectorAll('.trial-notice-details li').length,
        small:['.catalog-heading>.eyebrow','.footer-copyright'].map(s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize)),
        sizes:[...new Set(all.filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>getComputedStyle(e).fontSize))],
        radii:[...new Set(all.map(e=>getComputedStyle(e).borderRadius))],
        secondary:cards.every(c=>!c.querySelector('a.button-light')),
      };
    });
    assert.equal(result.overflow,false);assert.equal(result.headings,true);assert.equal(result.names,true);
    assert.equal(result.secondary,true);assert.equal(result.list,3);assert.ok(result.small.every(n=>n>=12));
    if(width>=768)assert.ok(result.centerDifference<1);
    assert.ok(result.sizes.length<=10,JSON.stringify(result.sizes));assert.ok(result.radii.length<=6,JSON.stringify(result.radii));
    if(width===390||width===1440)await page.screenshot({path:`test-results/usability/tools-${width}-${theme}.png`,fullPage:true});
    console.log('PASS tools',width,theme,JSON.stringify(result));
  }
  // Simulate a pending checkout callback locally; never load a payment provider.
  await page.addInitScript(()=>{
    window.Razorpay=function(options){
      this.on=()=>{};this.close=()=>{};
      this.open=()=>options.handler({razorpay_order_id:'qa-order',razorpay_payment_id:'qa-payment',razorpay_signature:'qa-signature'});
    };
  });
  for(const width of [320,390,820,1440,1920])for(const theme of ['dark','light']) {
    await page.setViewportSize({width,height:960});
    await page.goto(`http://127.0.0.1:4237/pricing?appearance=${theme}`);
    await page.waitForSelector('.local-payment-test');
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.getByRole('heading',{name:'Pricing',level:1}).count(),1);
    assert.equal(await page.locator('.price-card>h2').count(),3);
    assert.equal(await page.locator('.header-action.button-light').count(),0);
    await page.getByRole('button',{name:'Test ₹1 checkout',exact:true}).click();
    const checkStatus=page.getByRole('button',{name:'Check payment status',exact:true});
    await checkStatus.waitFor();
    assert.equal(await checkStatus.evaluate(e=>!!e.closest('.local-payment-buttons')),true);
    const result=await page.evaluate(()=>{
      const visible=[...document.querySelectorAll('.pricing-section *, .marketing-header *, .preview-footer *')].filter(e=>e.getClientRects().length);
      const toggle=document.querySelector('.billing-toggle'),region=document.querySelector('.region-selector');
      const t=toggle.getBoundingClientRect(),r=region.getBoundingClientRect();
      const selected=getComputedStyle(toggle.querySelector('[aria-pressed="true"]'));
      const inactive=getComputedStyle(toggle.querySelector('[aria-pressed="false"]'));
      const secondary=[...document.querySelectorAll('.price-card>.button-outline,.local-payment-buttons>.button-outline')].map(e=>{
        const s=getComputedStyle(e);return {border:s.borderTopWidth,color:s.borderTopColor,background:s.backgroundColor};
      });
      return {
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        controlGap:r.left-t.right,
        sameRow:Math.abs(r.top-t.top)<16,
        sizes:[...new Set(visible.filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>getComputedStyle(e).fontSize))],
        radii:[...new Set(visible.map(e=>getComputedStyle(e).borderRadius))],
        small:['.plan-billing','.local-payment-badge','.footer-copyright'].map(s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize)),
        distinctToggle:selected.backgroundColor!==inactive.backgroundColor,
        secondary,
      };
    });
    assert.equal(result.overflow,false);assert.equal(result.distinctToggle,true);
    assert.ok(result.sizes.length<=10,JSON.stringify(result.sizes));assert.ok(result.radii.length<=6,JSON.stringify(result.radii));
    assert.ok(result.small.every(n=>n>=12));
    assert.equal(result.secondary.length,3);
    assert.ok(result.secondary.every(s=>parseFloat(s.border)>0&&s.color!=='rgba(0, 0, 0, 0)'&&s.background!=='rgba(0, 0, 0, 0)'));
    if(width>=768){assert.equal(result.sameRow,true);assert.ok(result.controlGap<=24);}
    const annual=page.getByRole('button',{name:'Annually'});
    await annual.click();assert.equal(await annual.getAttribute('aria-pressed'),'true');
    await page.getByRole('combobox',{name:'Billing region'}).selectOption('US');
    assert.ok((await page.locator('.price-card').nth(1).locator('.plan-price').textContent()).includes('$'));
    const choose=page.locator('.price-card').nth(1).getByRole('button',{name:'Choose this plan'});
    await choose.click();assert.equal(await page.locator('.checkout-dialog[open]').count(),1);
    await page.keyboard.press('Escape');assert.equal(await choose.evaluate(e=>document.activeElement===e),true);
    if(width===390||width===1440)await page.screenshot({path:`test-results/usability/pricing-${width}-${theme}.png`,fullPage:true});
    console.log('PASS pricing',width,theme,JSON.stringify(result));
  }
  signedIn=false;pricingApproved=false;
  await page.goto('http://127.0.0.1:4237/pricing');
  await page.waitForSelector('.pricing-draft');
  assert.equal(await page.locator('.local-payment-test').count(),0);
  assert.equal(await page.getByRole('heading',{level:1,name:'Pricing'}).count(),1);
  await page.getByRole('link',{name:'Home',exact:true}).click();
  assert.equal(await page.getByRole('heading',{level:2,name:'Pricing',exact:true}).count(),1);
  assert.equal(await page.locator('.header-action.button-light').count(),1);
  console.log('PASS signed-out pricing preview and heading/header restoration on Home');
  signedIn=true;
  for(const width of [320,390,820,1440,1920])for(const theme of ['dark','light']) {
    await page.setViewportSize({width,height:960});
    await page.goto(`http://127.0.0.1:4237/faq?appearance=${theme}`);
    await page.waitForSelector('.faq-list summary');
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.getByRole('heading',{level:1,name:'Frequently asked questions.'}).count(),1);
    assert.equal(await page.locator('.header-action.button-outline').count(),1);
    assert.equal(await page.locator('.faq-list details').count(),5);
    assert.equal(await page.locator('iframe, #main-content nav, #main-content aside').count(),0);
    assert.equal(await page.getByRole('link',{name:'FAQ',exact:true}).getAttribute('aria-current'),'page');
    const firstSummary=page.locator('.faq-list summary').first();
    await firstSummary.focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('.faq-list details').first().getAttribute('open'),'');
    const result=await page.evaluate(()=>{
      const all=[...document.querySelectorAll('.faq-section *, .marketing-header *, .preview-footer *')].filter(e=>e.getClientRects().length);
      return {
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        footerGap:document.querySelector('footer').getBoundingClientRect().top-document.querySelector('.faq-list').getBoundingClientRect().bottom,
        copyrightSize:parseFloat(getComputedStyle(document.querySelector('.footer-copyright')).fontSize),
        answerSize:parseFloat(getComputedStyle(document.querySelector('.faq-list p')).fontSize),
        radii:[...new Set(all.map(e=>getComputedStyle(e).borderRadius))],
        whatsapp:/whatsapp|SSCSE/i.test(document.body.innerText),
      };
    });
    assert.equal(result.overflow,false);assert.equal(result.whatsapp,false);assert.ok(result.footerGap>=64);
    assert.ok(result.copyrightSize>=12);assert.ok(result.answerSize>=14);assert.ok(result.radii.length<=6);
    await page.keyboard.press('Space');
    assert.equal(await page.locator('.faq-list details').first().getAttribute('open'),null);
    if(width===390||width===1440)await page.screenshot({path:`test-results/usability/faq-${width}-${theme}.png`,fullPage:true});
    console.log('PASS faq',width,theme,JSON.stringify(result));
  }
  await page.getByRole('link',{name:'Home',exact:true}).click();
  assert.equal(await page.getByRole('heading',{level:2,name:'Frequently asked questions.'}).count(),1);
  assert.equal(await page.locator('.header-action.button-light').count(),1);
  console.log('PASS FAQ heading/header restoration on Home');
  for(const width of [320,390,820,1440,1920])for(const theme of ['dark','light']) {
    await page.setViewportSize({width,height:960});
    await page.goto(`http://127.0.0.1:4237/admin?appearance=${theme}`);
    await page.waitForFunction(()=>document.querySelectorAll('.admin-user').length===2);
    assert.equal(await page.locator('.admin-heading a').count(),0);
    assert.equal(await page.getByRole('link',{name:'My account',exact:true}).count(),1);
    const result=await page.evaluate(()=>{
      const visible=[...document.querySelectorAll('.admin-page *, .marketing-header *, .preview-footer *')].filter(e=>e.getClientRects().length);
      const search=document.querySelector('.admin-toolbar input').getBoundingClientRect();
      const refresh=document.querySelector('.admin-toolbar button').getBoundingClientRect();
      const badge=getComputedStyle(document.querySelector('.admin-heading .eyebrow'));
      const actions=[...document.querySelectorAll('.admin-page .button')].filter(e=>e.getClientRects().length).map(e=>getComputedStyle(e));
      return {
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        listWidth:document.querySelector('.admin-users').getBoundingClientRect().width,
        toolbarGap:refresh.left-search.right,
        badgeSize:parseFloat(badge.fontSize),badgeWeight:Number(badge.fontWeight),
        copyrightSize:parseFloat(getComputedStyle(document.querySelector('.footer-copyright')).fontSize),
        sizes:[...new Set(visible.filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>getComputedStyle(e).fontSize))],
        radii:[...new Set(visible.map(e=>getComputedStyle(e).borderRadius))],
        sharedButtons:actions.every(s=>s.fontSize==='12px'&&s.borderRadius==='8px'&&parseFloat(s.minHeight)>=44),
      };
    });
    assert.equal(result.overflow,false);assert.ok(result.listWidth<=840);assert.ok(result.badgeSize>=12);assert.ok(result.badgeWeight>=600);
    assert.ok(result.copyrightSize>=12);assert.ok(result.sizes.length<=10);assert.ok(result.radii.length<=6);assert.equal(result.sharedButtons,true);
    if(width>=768)assert.equal(result.toolbarGap,16);
    await page.getByRole('searchbox',{name:'Search this page'}).fill('Bea');
    assert.equal(await page.locator('.admin-user').count(),1);
    await page.getByRole('button',{name:'Refresh users',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.admin-user')?.textContent.includes('Bea'));
    await page.getByRole('searchbox',{name:'Search this page'}).fill('');
    const viewPlans=page.locator('.admin-user').first().getByRole('button',{name:'View plans →',exact:true});
    await viewPlans.click();await page.waitForSelector('.admin-plan-form');
    assert.equal(await page.locator('.admin-plan-dialog[open]').count(),1);
    assert.equal(await page.locator('.admin-plan-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
    await page.keyboard.press('Escape');assert.equal(await viewPlans.evaluate(e=>document.activeElement===e),true);
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.admin-user')?.textContent.includes('Cameron'));
    await page.getByRole('button',{name:'Previous',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.admin-user').length===2);
    if(width===390||width===1440)await page.screenshot({path:`test-results/usability/admin-${width}-${theme}.png`,fullPage:true});
    console.log('PASS admin',width,theme,JSON.stringify(result));
  }
  assert.equal(adminWrites,0);
  signedIn=false;
  await page.goto('http://127.0.0.1:4237/admin');
  await page.getByRole('link',{name:'Sign in',exact:true}).first().waitFor();
  assert.equal(await page.locator('.admin-toolbar,.admin-users').count(),0);
  console.log('PASS admin access guard; no plan changes submitted');
  signedIn=true;
  accountSubscriptions=[
    {plan_key:'studio_IN_monthly',status:'active',provider:'stripe',current_period_end:'2027-01-31T00:00:00Z'},
    {plan_key:'team_IN_monthly',status:'cancelled',provider:'razorpay'},
  ];
  for(const width of [320,390,820,1440,1920])for(const theme of ['dark','light']) {
    await page.setViewportSize({width,height:960});
    await page.goto(`http://127.0.0.1:4237/account?appearance=${theme}`);
    await page.waitForSelector('.subscription-list li');
    assert.equal(await page.locator('.header-action.button-outline').count(),1);
    assert.equal(await page.getByRole('link',{name:'My account',exact:true}).getAttribute('aria-current'),'page');
    const profile=page.getByRole('link',{name:'Manage local profile',exact:true});
    assert.equal(await profile.getAttribute('href'),'/profile');
    assert.equal(await profile.evaluate(e=>e.classList.contains('button-outline')),true);
    const refresh=page.getByRole('button',{name:'Refresh billing status',exact:true});
    assert.equal(await refresh.evaluate(e=>e.classList.contains('button-outline')),true);
    assert.equal(await page.getByRole('button',{name:'Manage Stripe billing',exact:true}).count(),1);
    const result=await page.evaluate(()=>{
      const visible=[...document.querySelectorAll('.online-account *, .marketing-header *, .preview-footer *')].filter(e=>e.getClientRects().length);
      const textBox=e=>{const r=document.createRange();r.selectNodeContents(e);return r.getBoundingClientRect();};
      const account=textBox(document.querySelector('.header-sign-in'));
      const admin=textBox(document.querySelector('.marketing-header nav a[href="/admin"]'));
      const signOut=getComputedStyle(document.querySelector('.account-sign-out'));
      const cardActions=[...document.querySelectorAll('.online-account-grid .button')].map(e=>{
        const s=getComputedStyle(e),card=e.closest('article'),cs=getComputedStyle(card);
        return {radius:s.borderRadius,size:s.fontSize,height:e.getBoundingClientRect().height,border:parseFloat(s.borderTopWidth),widthDifference:Math.abs(e.getBoundingClientRect().width-(card.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)))};
      });
      return {
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        headerTextDifference:Math.abs(account.top-admin.top),
        sizes:[...new Set(visible.filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>getComputedStyle(e).fontSize))],
        radii:[...new Set(visible.map(e=>getComputedStyle(e).borderRadius))],
        small:['.online-account-grid article:nth-child(2)>.eyebrow','.billing-help','.footer-copyright'].map(s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize)),
        signOut:{background:signOut.backgroundColor,border:signOut.borderTopWidth,minHeight:parseFloat(signOut.minHeight),size:signOut.fontSize},
        cardActions,
      };
    });
    assert.equal(result.overflow,false);assert.ok(result.sizes.length<=10);assert.ok(result.radii.length<=6);
    assert.ok(result.small.every(n=>n>=12));
    assert.ok(result.cardActions.every(s=>s.radius==='8px'&&s.size==='12px'&&s.height>=44&&s.border>0&&s.widthDifference<1));
    assert.equal(result.signOut.background,'rgba(0, 0, 0, 0)');assert.equal(parseFloat(result.signOut.border),0);assert.ok(result.signOut.minHeight>=44);
    if(width>=1024)assert.ok(result.headerTextDifference<1,JSON.stringify(result));
    const previousReads=billingReads;
    const updated=page.waitForResponse(r=>r.url().endsWith('/billing/status'));
    await refresh.click();await updated;
    assert.ok(billingReads>previousReads);
    await profile.focus();assert.equal(await profile.evaluate(e=>document.activeElement===e),true);
    if(width===390||width===1440)await page.screenshot({path:`test-results/usability/account-${width}-${theme}.png`,fullPage:true});
    console.log('PASS account',width,theme,JSON.stringify(result));
  }
  const profile=page.getByRole('link',{name:'Manage local profile',exact:true});
  await profile.focus();await page.keyboard.press('Enter');
  await page.waitForURL('**/profile');
  await page.getByRole('link',{name:'My account',exact:true}).click();
  await page.getByRole('link',{name:'Open the tools',exact:true}).click();
  await page.waitForURL('**/tools');assert.equal(await page.locator('.header-action.button-light').count(),1);
  accountUser={id:'qa-member',name:'Bea Thomas',email:'bea.with.a.long.address.for.layout.verification@example.test',role:'member'};
  accountSubscriptions=[];accountAccess={plan:'explorer',source:'free'};
  await page.setViewportSize({width:320,height:960});
  await page.goto('http://127.0.0.1:4237/account');
  await page.getByText('Your two-day trial is ready',{exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Manage users & plans',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.getByRole('button',{name:'Sign out',exact:true}).focus();await page.keyboard.press('Enter');
  await page.waitForURL('**/login');
  await page.goto('http://127.0.0.1:4237/account');
  await page.getByRole('link',{name:'Sign in →',exact:true}).waitFor();
  assert.equal(await page.locator('.online-account-grid').count(),0);
  console.log('PASS account keyboard navigation, member trial, sign-out and signed-out view');
} finally {await browser.close();await server.close();}

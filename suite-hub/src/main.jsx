import { createSignal, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import brand from './brand.json';
import { readLocalProfile, saveLocalProfile } from './local-profile';
import MarketingHome, {Pricing,FAQ} from './MarketingHome';
import {AuthGateway,OnlineAccount} from './AccountGateway';
import {createAccountState} from './account-client';
import AdminPanel from './AdminPanel';
import ToolIcon from './ToolIcon';
import { isLocalPreview, moduleUrl, toolLaunchUrl } from './module-url';
import './preview.css';
import './palette.css';
import './hub.css';
import './marketing.css';
import './admin.css';

const organization=brand.hub.organization||brand.organization;
function Arrow() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>; }
function Mark(props) { return <a class="brand-lockup" href="#landing" aria-label={`${organization} home`}><img class="company-mark" src={props.mode==='light'?'/spanvision-mark-light.svg':'/spanvision-mark.svg'} width="44" height="44" alt="" aria-hidden="true"/><span>{organization}<small>Engineering tools</small></span></a>; }
function SocialIcon(props) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <Show when={props.platform==='instagram'} fallback={<path fill="currentColor" d="M14 22v-8h3l.5-4H14V7.5c0-1 .3-1.5 1.5-1.5H18V2.3A22 22 0 0 0 14.7 2C11.4 2 10 4 10 7v3H7v4h3v8z"/>}>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.6"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>
    </Show>
  </svg>;
}
function SocialLinks() {
  const links=[{platform:'instagram',label:'Instagram',url:brand.hub.socialLinks?.instagram},{platform:'facebook',label:'Facebook',url:brand.hub.socialLinks?.facebook}];
  return <nav class="footer-social" aria-label="Spanvision Infra social pages"><For each={links.filter(link=>link.url)}>{link=><a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${organization} on ${link.label} (opens in a new tab)`}><SocialIcon platform={link.platform}/><span>{link.label}</span></a>}</For></nav>;
}

function currentScreen() {
  const requested=location.hash.slice(1)==='main-content'?'landing':location.hash.slice(1)||'landing';
  if(requested==='suggestions') {
    history.replaceState(history.state,'',location.pathname+location.search+'#modules');
    return 'modules';
  }
  return requested;
}
function App() {
  const account=createAccountState();
  const [screen,setScreen]=createSignal(currentScreen());
  const [mode,setMode]=createSignal(document.documentElement.dataset.svMode || 'dark');
  createEffect(()=>{
    const favicon=document.getElementById('company-favicon');
    if(favicon)favicon.href=mode()==='light'?'/spanvision-mark-light.svg':'/spanvision-mark.svg';
  });
  const [status,setStatus]=createSignal({});
  const [name,setName]=createSignal(readLocalProfile().name);
  const [error,setError]=createSignal('');
  const [success,setSuccess]=createSignal('');
  const [scanState,setScanState]=createSignal('ready');
  const [progress,setProgress]=createSignal(0);
  const [filename,setFilename]=createSignal('Choose a scanned PDF or image');
  const [scanFile,setScanFile]=createSignal(null);
  const [scanResult,setScanResult]=createSignal(null);
  const [scanError,setScanError]=createSignal('');
  const [scanPages,setScanPages]=createSignal('all');
  let modal, upload, scanController, previousFocus, requestController;
  const validScreens=['landing','modules','pricing','faq','login','signup','forgot','verify','reset','account','profile','admin'];
  const localPreview=isLocalPreview(location.hostname);
  const openUrl=module=>toolLaunchUrl(module,status()[module.id],mode(),location);
  function clearScan() { scanController?.abort(); scanController=undefined; }
  function closeScan() { clearScan(); modal.close(); previousFocus?.focus(); }
  function openScan(event) { previousFocus=event.currentTarget;clearScan();setScanState('ready');setScanError('');setProgress(0);modal.showModal(); }
  async function startScan() {
    clearScan();setScanError('');setScanResult(null);
    if(!scanFile()){setScanError('Choose a scanned PDF or image first.');return;}
    setProgress(0);setScanState('processing');
    const controller = scanController = new AbortController();
    try {
      const {recognizeScan}=await import('./scan-ocr.js');
      const result=await recognizeScan(scanFile(),{signal:controller.signal,pages:scanPages(),onProgress:setProgress});
      if(controller.signal.aborted)return;
      setScanResult(result);setScanState('complete');
    } catch(error) {
      if(controller.signal.aborted)return;
      setScanError(error.message||'Recognition failed. Try a clearer scan.');setScanState('ready');
    } finally { if(scanController===controller)scanController=undefined; }
  }
  async function saveScan(kind) {
    const {downloadScan}=await import('./scan-ocr.js');
    const base=filename().replace(/\.[^.]+$/,'');
    downloadScan(kind==='pdf'?scanResult().pdf:new Blob([scanResult().text],{type:'text/plain;charset=utf-8'}),`${base}-searchable.${kind==='pdf'?'pdf':'txt'}`);
  }
  function trapScanFocus(event) {
    if(event.key!=='Tab')return;
    const items=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(item=>item.getClientRects().length);
    const first=items[0],last=items.at(-1);
    if(!first){event.preventDefault();modal.focus();}
    else if(event.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){event.preventDefault();first.focus();}
  }
  async function refreshStatus() {
    requestController?.abort();requestController=new AbortController();
    try {
      const response=await fetch('/__suite/status',{signal:requestController.signal});
      if(!response.ok)throw new Error('Preview status unavailable');
      const result=await response.json();
      if(!Array.isArray(result.modules))throw new Error('Invalid preview status');
      const modules=Object.fromEntries(result.modules.map(module=>[module.id,module]));
      if(!localPreview){
        for(const module of brand.modules){
          if(!moduleUrl(module,modules[module.id],mode(),location.hostname))modules[module.id]={available:false,message:'This tool has not been deployed yet.'};
        }
        setStatus(modules);return;
      }
      const bim=brand.modules.find(module=>module.id==='bim');
      if(bim&&!modules.bim?.available){
        try {const response=await fetch(`http://127.0.0.1:${bim.port}/__bim/status`,{signal:AbortSignal.timeout(1500)});const health=await response.json();if(response.ok&&health.id==='bim')modules.bim=health;}catch{modules.bim={...bim,available:false,message:'Start the Vision BIM Validator preview to open this tool.'};}
      }
      const pile=brand.modules.find(module=>module.id==='pile');
      if(pile&&!modules.pile?.available){
        try {const response=await fetch(`http://127.0.0.1:${pile.port}/__pile/status`,{signal:AbortSignal.timeout(1500)});const health=await response.json();if(health.id==='pile')modules.pile=health;}catch{modules.pile={...pile,available:false,message:'Start the Pile Plane Workspace preview to open this tool.'};}
      }
      const pointcloud=brand.modules.find(module=>module.id==='pointcloud');
      if(pointcloud&&!modules.pointcloud?.available){
        try {const response=await fetch('http://127.0.0.1:'+pointcloud.port+'/__pointcloud/status',{signal:AbortSignal.timeout(1500)});const health=await response.json();if(health.id==='pointcloud')modules.pointcloud=health;}catch{modules.pointcloud={...pointcloud,available:false,message:'Start the Pointcloud Workspace preview to open this tool.'};}
      }
      const field=brand.modules.find(module=>module.id==='field');
      if(field&&!modules.field?.available){
        try {const response=await fetch(`http://127.0.0.1:${field.port}/__field/status`,{signal:AbortSignal.timeout(1500)});const health=await response.json();if(health.id==='field')modules.field=health;}catch {modules.field={...field,available:false,message:'Start the Field Workspace preview to open this tool.'};}
      }
      const speech=brand.modules.find(module=>module.id==='speech');
      if(speech&&!modules.speech?.available){
        try { const response=await fetch(`http://127.0.0.1:${speech.port}/__speech/status`,{signal:AbortSignal.timeout(1500)});const health=await response.json();if(health.id==='speech')modules.speech=health; } catch { modules.speech={...speech,available:false,message:'Start the independent Speech preview to open this tool.'}; }
      }
      const stl=brand.modules.find(module=>module.id==='stl');
      if(stl){try{const response=await fetch('http://127.0.0.1:'+stl.port+'/__stl/status',{signal:AbortSignal.timeout(1500)});const health=await response.json();modules.stl={...stl,...health};}catch{modules.stl={...stl,available:false,message:'Start STL preview to open this tool.'};}}
      setStatus(modules);
    } catch(e) {
      if(e.name==='AbortError')return;
      setStatus(Object.fromEntries(brand.modules.map(module=>[module.id,{available:false,message:localPreview?'Start the suite preview to open this module.':'Tool availability could not be loaded. Try checking again.'}])));
    }
  }
  function changeScreen() {
    setScreen(currentScreen());setError('');setSuccess('');
    window.scrollTo({top:0,behavior:'instant'});
    if(modal?.open)closeScan();
  }
  onMount(()=>{
    account.refresh();
    const syncMode=()=>setMode(document.documentElement.dataset.svMode || 'dark');
    window.addEventListener('spanvision:mode-change',syncMode);
    window.addEventListener('spanvision:mode-observed',syncMode);
    onCleanup(()=>{window.removeEventListener('spanvision:mode-change',syncMode);window.removeEventListener('spanvision:mode-observed',syncMode);});
    window.addEventListener('hashchange',changeScreen);
    refreshStatus();
    const onFocus=()=>refreshStatus();window.addEventListener('focus',onFocus);
    onCleanup(()=>{window.removeEventListener('hashchange',changeScreen);window.removeEventListener('focus',onFocus);requestController?.abort();clearScan();});
  });
  function submitProfile(event) {
    event.preventDefault();setError('');setSuccess('');
    try {
      const profile=saveLocalProfile(new FormData(event.currentTarget).get('name'));
      setName(profile.name);setSuccess('Profile saved in this browser.');
    } catch(error) {setError(error.message);}
  }
  function ToolLink(props) {
    const state=()=>status()[props.module.id];
    return <Show when={state()?.available} fallback={<button class={`button button-outline ${props.class||''}`} disabled title={state()?.message||'Checking preview availability'}>Unavailable <Arrow/></button>}>
      <a class={`button ${props.class||'button-light'}`} href={openUrl(props.module)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${props.module.label} in a new tab`}>Open {props.label||({planner:'Planning',fem:'FEM',frame:'Frame design',calculation:'Calculations'})[props.module.id]||props.module.label}<Arrow/></a>
    </Show>;
  }
  function Modules() {
    return <div class="module-grid"><For each={brand.modules}>{module=><article class="module-card" data-module={module.id}>
      <div class="module-top"><span class="tool-glyph"><ToolIcon id={module.id}/></span></div>
      <h3>{module.label}</h3><p>{module.description}</p>
      <div class="module-bottom"><ToolLink module={module}/><small>{status()[module.id]?.available?'Opens in a new tab':status()[module.id]?.message||'Checking the local preview…'}</small></div>
    </article>}</For></div>;
  }
  return <>
    <a class="skip-link" href="#main-content" onClick={event=>{event.preventDefault();document.getElementById('main-content')?.focus();}}>Skip to content</a>
    <header class="preview-header marketing-header" data-sv-reveal><Mark mode={mode()}/><nav aria-label="Main navigation"><For each={['landing','modules','pricing','faq']}>{route=><a href={`#${route}`} classList={{current:screen()===route}} aria-current={screen()===route?'page':undefined}>{({landing:'Home',modules:'Tools',pricing:'Pricing',faq:'FAQ'})[route]}</a>}</For><Show when={account.user()?.role==='super_admin'}><a href="#admin" classList={{current:screen()==='admin'}} aria-current={screen()==='admin'?'page':undefined}>Admin</a></Show></nav><Show when={account.user()} fallback={<a class="header-sign-in" href="#login" aria-current={screen()==='login'?'page':undefined}>Sign in</a>}><a class="header-sign-in" href="#account">My account</a></Show><a href={account.user()?'#modules':'#signup'} class="button button-light header-action">{account.user()?'Open workspace':'Create account'}<Arrow/></a></header>
    <main id="main-content" tabindex="-1">
      <Show when={screen()==='landing'}><MarketingHome mode={mode()} account={account} openScan={openScan} organization={organization} toolCount={brand.modules.length}/></Show>
      <Show when={screen()==='pricing'}><div class="dedicated-pricing"><Pricing account={account}/></div></Show>
      <Show when={screen()==='faq'}><div class="dedicated-faq"><FAQ/></div></Show>
      <Show when={['login','signup','forgot','verify','reset'].includes(screen())}><AuthGateway screen={screen()} account={account} mode={mode()}/></Show>
      <Show when={screen()==='account'}><OnlineAccount account={account}/></Show>
      <Show when={screen()==='admin'}><AdminPanel account={account}/></Show>
      <Show when={screen()==='modules'}>
        <section class="company-tools-page">
          <section class="company-catalog" aria-labelledby="tools-title">
            <div class="catalog-heading" data-sv-reveal><div><span class="eyebrow">SPANVISION INFRA TOOLKIT</span><h1 id="tools-title">All tools <span>{brand.modules.length}</span></h1><p>Choose a tool to open its workspace in a new tab.</p></div><button class="button button-outline" onClick={refreshStatus}>Check availability<Arrow/></button></div>
            <Modules/>
            <p class="catalog-note">{localPreview?'Files and saved preferences stay with each workspace.':'Browser drafts stay with each workspace. BIM and map processing uses temporary cloud storage; download your results to keep them.'}</p>
          </section>
        </section>
      </Show>
      <Show when={screen()==='profile'}><section class="account-page"><span class="preview-badge">LOCAL PROFILE</span><div class="account-heading"><div><span class="eyebrow">YOUR WORKSPACE</span><h1>Your local profile.</h1><p>Set a display name and choose your preferred appearance.</p></div><a href="#modules" class="button button-light">Open workspace<Arrow/></a></div><div class="account-grid"><aside class="account-nav"><span class="selected" aria-current="page">Profile</span><a href="#modules">All tools<Arrow/></a></aside><div class="account-card"><div class="profile-header"><span class="avatar">{name().split(' ').filter(Boolean).map(s=>s[0]).join('').slice(0,2)||'SI'}</span><div><h2>{name()||'Your workspace'}</h2><p>Local profile · {organization}</p></div></div><form novalidate onSubmit={submitProfile}><label>Display name<input name="name" value={name()} maxlength="80" autocomplete="name" placeholder="Your name"/></label><label>Organization<input value={organization} readonly/></label><label>Interface theme<select aria-label="Interface theme" value={mode()} onChange={event=>window.SpanvisionAppearance.setMode(event.currentTarget.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label><Show when={error()}><p role="alert" class="form-error">{error()}</p></Show><Show when={success()}><p role="status" class="form-success">{success()}</p></Show><button class="button button-light">Save profile<Arrow/></button></form></div><div class="account-details"><article><span class="eyebrow">LOCAL BY DESIGN</span><h3>Your files. Your control.</h3><p>Your profile saves in this browser. Tools open anonymously, and each workspace keeps its own drafts. Download project files to back them up or move them to another device.</p></article><article><span class="eyebrow">APPEARANCE</span><div class="palette"><i/><i/><i/><i/></div><p>{mode()==='light'?'Light':'Dark'} mode<br/>A clear space for detailed work.</p></article></div></div></section></Show>
      <Show when={!validScreens.includes(screen())}><section class="suggestions-page"><h1>Page not found.</h1><a href="#landing" class="button button-light">Back to overview<Arrow/></a></section></Show>
    </main>
    <footer class="preview-footer"><Mark mode={mode()}/><span>© 2026 {organization}</span><SocialLinks/></footer>
    <dialog ref={modal} class="scan-dialog" aria-labelledby="scan-title" onKeyDown={trapScanFocus} onCancel={event=>{event.preventDefault();closeScan();}}>
      <div class="scan-heading"><h2 id="scan-title">Scan & make searchable</h2><button class="scan-close" aria-label="Close scan" onClick={closeScan}>×</button></div><p class="scan-intro">Turn a scanned PDF into a document you can search.</p>
      <input hidden ref={upload} type="file" accept="application/pdf,image/*" onChange={event=>{const file=event.target.files?.[0];if(file){setScanFile(file);setFilename(file.name);setScanResult(null);setScanState('ready');setScanError('');}}}/>
      <button class="scan-upload" disabled={scanState()==='processing'} onClick={()=>upload.click()}><span class="file-glyph">PDF</span><span><b>{filename()}</b><small>Choose a scanned PDF or image</small></span><span>＋</span></button>
      <div class="scan-options"><label>Pages<select value={scanPages()} onChange={event=>setScanPages(event.currentTarget.value)} disabled={scanState()==='processing'}><option value="all">All pages (up to 25)</option><option value="first">First page</option></select></label><label>Document language<select disabled={scanState()==='processing'}><option>English</option></select></label></div>
      <Show when={scanState()==='processing'}><div class="scan-progress" role="status"><span>Recognizing text… <b>{progress()}%</b></span><progress value={progress()} max="100"/></div></Show><Show when={scanResult()}><p role="status" class="form-success">Recognition complete. Review the text before using it.</p><label>Recognized text<textarea class="scan-text" readonly value={scanResult().text||'No text was detected. Try a clearer image.'}/></label><div class="scan-downloads"><button class="button button-outline" onClick={()=>saveScan('pdf')}>Download searchable PDF</button><button class="button button-outline" onClick={()=>saveScan('txt')}>Download text</button></div></Show><Show when={scanError()}><p role="alert" class="form-error">{scanError()}</p></Show>
      <div class="preview-disclosure">Recognition runs in your browser. The first run downloads the English OCR model; your document is not uploaded. Files up to 50 MB and 25 pages.</div><div class="scan-actions"><span class="preview-badge">LOCAL OCR</span><div><button class="button button-outline" onClick={closeScan}>Cancel</button><button class="button button-light" disabled={scanState()==='processing'} onClick={()=>scanState()==='complete'?closeScan():startScan()}>{scanState()==='complete'?'Done':'Recognize text'}<Arrow/></button></div></div>
    </dialog>
  </>;
}
render(()=><App/>,document.getElementById('root'));

import { createSignal, onMount, onCleanup, For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import brand from './brand.json';
import { readLocalProfile, saveLocalProfile } from './local-profile';
import Globe from './Globe';
import { isLocalPreview, moduleUrl } from './module-url';
import './preview.css';
import './palette.css';
import './hub.css';

const organization=brand.hub.organization||brand.organization;
function Arrow() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>; }
function ToolIcon(props) {
  const paths={cad:'M4 4h16v16H4zM4 16 16 4M8 20 20 8',cad2d:'M4 20V4h16M8 16l8-8 3 3-8 8-4 1z',bim:'m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9',pdf:'M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6',ifc:'m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9',calc:'M5 3h14v18H5zM8 7h8M8 11h2M14 11h2M8 15h2M14 15h2M8 18h2M14 18h2',planner:'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h3M13 17h3',fem:'M3 20h18M5 20V5h14v15M5 5l14 15M19 5 5 20M3 5h4M17 5h4',frame:'M3 20h18M5 20V5h14v15M3 5h4M17 5h4M4 19h2M18 19h2',calculation:'M4 4h16v16H4zM8 8h3M9.5 6.5v3M14 8h3M8 13l3 3M11 13l-3 3M14 13h3M14 16h3',geo:'M3 5h18M3 10c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0M3 20h18',speech:'M4 10v4M8 6v12M12 3v18M16 6v12M20 10v4',stl:'m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5',field:'M9 4H5v17h14V4h-4M9 2h6v5H9zM8 13l3 3 5-6',pointcloud:'M4 4h2v2H4zM11 4h2v2h-2zM18 4h2v2h-2zM4 11h2v2H4zM11 11h2v2h-2zM18 11h2v2h-2zM4 18h2v2H4zM11 18h2v2h-2zM18 18h2v2h-2z',pile:'M3 6h18M6 6v13M12 6v13M18 6v13M4 19h4M10 19h4M16 19h4'};
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[props.module.id]}/></svg>;
}
function Mark() { return <a class="brand-lockup" href="#landing" aria-label={`${organization} home`}><img src="/spanvision-mark.svg" alt={brand.hub.mark||'SI'}/><span>{organization}<small>Engineering tools</small></span></a>; }

function currentScreen() {
  const requested=location.hash.slice(1)||'landing';
  if(requested==='login'||requested==='signup') {
    history.replaceState(history.state,'',location.pathname+location.search+'#account');
    return 'account';
  }
  if(requested==='suggestions') {
    history.replaceState(history.state,'',location.pathname+location.search+'#modules');
    return 'modules';
  }
  return requested;
}
function App() {
  const [screen,setScreen]=createSignal(currentScreen());
  const [mode,setMode]=createSignal(document.documentElement.dataset.svMode || 'dark');
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
  const validScreens=['landing','modules','account'];
  const localPreview=isLocalPreview(location.hostname);
  const openUrl=module=>moduleUrl(module,status()[module.id],mode(),location.hostname);
  function exploreTools() { document.getElementById('tools-title')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}); }
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
    return <div class="module-grid"><For each={brand.modules}>{(module,index)=><article class="module-card" data-module={module.id}>
      <div class="module-top"><div class="module-identity"><span class="tool-glyph"><ToolIcon module={module}/></span><span class="feature-number">/{String(index()+1).padStart(2,'0')}</span></div><span class={`availability ${status()[module.id]?.available?'available':''}`}><i/>{status()[module.id]?.available?'Ready to open':status()[module.id]?'Unavailable':'Checking…'}</span></div>
      <h3>{module.id==='pile'&&<img class="field-card-mark" src="/ppw-mark.svg" alt="PPW"/>}{module.id==='pointcloud'&&<img class="field-card-mark" src="/pw-mark.svg" alt="PW"/>}{module.id==='field'&&<img class="field-card-mark" src="/fw-mark.svg" alt="FW"/>}{module.label}</h3><p>{module.description}</p>
      <div class="module-bottom"><ToolLink module={module}/><small>{status()[module.id]?.available?'Opens in a new tab':status()[module.id]?.message||'Checking the local preview…'}</small></div>
    </article>}</For></div>;
  }
  return <>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="preview-header" data-sv-reveal><Mark/><nav aria-label="Main navigation"><For each={['landing','modules','account']}>{route=><a href={`#${route}`} classList={{current:screen()===route}} aria-current={screen()===route?'page':undefined}>{({landing:'Overview',modules:'Tools',account:'Profile'})[route]}</a>}</For></nav><a href="#modules" class="button button-light header-action" onClick={event=>{if(screen()==='landing'||screen()==='modules'){event.preventDefault();exploreTools();}}}>Open workspace<Arrow/></a></header>
    <main id="main-content" tabindex="-1">
      <Show when={screen()==='landing'||screen()==='modules'}>
        <section class="company-tools-page">
          <div class="company-intro">
            <div class="company-intro-copy">
            <span class="eyebrow" data-sv-reveal><i class="intro-line"/>ENGINEERING & INFRASTRUCTURE</span>
            <h1 data-sv-reveal>{organization}</h1>
            <div class="company-intro-bottom"><p data-sv-reveal>From first sketch to final calculation.<br/>Draw, validate, plan and build in one connected workspace.</p><div class="intro-actions" data-sv-reveal><button class="button button-light" onClick={exploreTools}>Explore all tools<Arrow/></button><button class="button button-outline" onClick={openScan}>Explore scan & OCR</button></div></div>
            <div class="intro-summary" data-sv-reveal><span><b>{brand.modules.length}</b> engineering tools</span><i/><span>One workspace. Your workflow.</span></div>
            </div>
            <Globe mode={mode()}/>
          </div>
          <section class="company-catalog" aria-labelledby="tools-title">
            <div class="catalog-heading" data-sv-reveal><div><h2 id="tools-title">All tools <span>{brand.modules.length}</span></h2><p>Choose a tool to open its workspace in a new tab.</p></div><button class="button button-outline" onClick={refreshStatus}>Check availability<Arrow/></button></div>
            <Modules/>
            <p class="catalog-note">{localPreview?'Files and saved preferences stay with each workspace.':'Browser drafts stay with each workspace. BIM and map processing uses temporary cloud storage; download your results to keep them.'}</p>
          </section>
        </section>
      </Show>
      <Show when={screen()==='account'}><section class="account-page"><span class="preview-badge">LOCAL PROFILE</span><div class="account-heading"><div><span class="eyebrow">YOUR WORKSPACE</span><h1>Your local profile.</h1><p>Set a display name and choose your preferred appearance.</p></div><a href="#modules" class="button button-light">Open workspace<Arrow/></a></div><div class="account-grid"><aside class="account-nav"><span class="selected" aria-current="page">Profile</span><a href="#modules">All tools<Arrow/></a></aside><div class="account-card"><div class="profile-header"><span class="avatar">{name().split(' ').filter(Boolean).map(s=>s[0]).join('').slice(0,2)||'SI'}</span><div><h2>{name()||'Your workspace'}</h2><p>Local profile · {organization}</p></div></div><form novalidate onSubmit={submitProfile}><label>Display name<input name="name" value={name()} maxlength="80" autocomplete="name" placeholder="Your name"/></label><label>Organization<input value={organization} readonly/></label><label>Interface theme<select aria-label="Interface theme" value={mode()} onChange={event=>window.SpanvisionAppearance.setMode(event.currentTarget.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label><Show when={error()}><p role="alert" class="form-error">{error()}</p></Show><Show when={success()}><p role="status" class="form-success">{success()}</p></Show><button class="button button-light">Save profile<Arrow/></button></form></div><div class="account-details"><article><span class="eyebrow">LOCAL BY DESIGN</span><h3>Your files. Your control.</h3><p>Your profile saves in this browser. Tools open anonymously, and each workspace keeps its own drafts. Download project files to back them up or move them to another device.</p></article><article><span class="eyebrow">APPEARANCE</span><div class="palette"><i/><i/><i/><i/></div><p>{mode()==='light'?'Light':'Dark'} mode<br/>A clear space for detailed work.</p></article></div></div></section></Show>
      <Show when={!validScreens.includes(screen())}><section class="suggestions-page"><h1>Page not found.</h1><a href="#landing" class="button button-light">Back to overview<Arrow/></a></section></Show>
    </main>
    <footer class="preview-footer"><Mark/><span>© 2026 {organization}</span><div><a href="#account">Local profile</a><a href="/notices.md" target="_blank" rel="noopener noreferrer">Open-source notices</a><a href="/bim-notices.md" target="_blank" rel="noopener noreferrer">BIM source notices</a><a href="/studio-notices.md" target="_blank" rel="noopener noreferrer">Studio source notices</a><a href="/ocr-notices.txt" target="_blank" rel="noopener noreferrer">OCR credits</a><a href="/globe-notices.txt" target="_blank" rel="noopener noreferrer">Globe credits</a></div></footer>
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

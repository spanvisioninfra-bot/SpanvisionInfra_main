// Apply launch preferences before the editor boots, then keep the workspace URL clean.
(() => {
  if(!/^https?:$/.test(location.protocol)||'__TAURI_INTERNALS__' in window||location.hostname==='tauri.localhost')return;
  const tool=document.currentScript?.dataset.tool;
  if(!tool)return;
  const url=new URL(location.href),path=url.pathname.replace(/\/+$/,'')||'/';
  const cookie=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('sv-appearance='))?.slice(14);
  const requested=url.searchParams.get('appearance');
  const mode=['light','dark'].includes(requested)?requested:['light','dark'].includes(cookie)?cookie:null;
  function remember(value){
    if(value!=='light'&&value!=='dark')return;
    try{localStorage.setItem('spanvision:color-mode',value);}catch{}
    document.cookie='sv-appearance='+value+'; Path=/; SameSite=Lax; Max-Age=31536000'+(location.protocol==='https:'?'; Secure':'');
  }
  if(mode){remember(mode);window.SpanvisionAppearance?.setMode(mode);}
  window.addEventListener('spanvision:mode-change',event=>remember(event.detail));
  window.addEventListener('spanvision:mode-observed',event=>remember(event.detail));
  const launch=url.searchParams.get('launch')==='workspace';
  url.searchParams.delete('appearance');url.searchParams.delete('launch');
  const workspace=path==='/workspace'||tool==='cad'&&path==='/app'||tool==='bim'&&path==='/viewer'
    ||path==='/'&&(launch||!['cad2d','speech'].includes(tool))||tool==='bim'&&path==='/home'&&launch;
  if(workspace)url.pathname='/workspace';
  const clean=url.pathname+url.search+url.hash;
  if(clean!==location.pathname+location.search+location.hash)history.replaceState(history.state,'',clean);
})();

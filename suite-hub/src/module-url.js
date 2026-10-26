export function isLocalPreview(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function moduleUrl(module, state, mode, hostname) {
  const target = state?.url || (isLocalPreview(hostname) ? `http://127.0.0.1:${module.port}${module.path}` : null);
  if (!target) return null;
  let url;
  try { url = new URL(target); } catch { return null; }
  if (!isLocalPreview(hostname) && (url.protocol !== 'https:' || isLocalPreview(url.hostname))) return null;
  const path=url.pathname.replace(/\/+$/,'')||'/';
  if(module.id&&(path==='/'||module.id==='cad'&&path==='/app'||module.id==='bim'&&['/home','/viewer'].includes(path)))url.pathname='/workspace';
  if(module.id==='speech'&&url.hash){
    const page=url.hash.slice(1);
    if(['landing','workspace','home','settings','dictionary','models','mic-test','meeting','transcribe','tts','suggestions','account'].includes(page)){
      url.pathname=['landing','home','workspace'].includes(page)?'/workspace':'/'+page;url.hash='';
    }
  }
  url.searchParams.delete('appearance');url.searchParams.delete('launch');
  // Local previews have no cross-origin handoff; apply the preference at boot.
  if(isLocalPreview(hostname))url.searchParams.set('appearance',mode==='light'?'light':'dark');
  return url.href;
}

export function toolLaunchUrl(module, state, mode, location) {
  if (!moduleUrl(module, state, mode, location.hostname)) return null;
  const url = new URL('/launch/'+encodeURIComponent(module.id), location.origin);
  return url.href;
}

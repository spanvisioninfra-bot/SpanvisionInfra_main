(() => {
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
  let checking=false,locked=false,expiryTimer;
  function lock(message,href='https://www.spanvisioninfra.com/#account') {
    if(locked)return;
    locked=true;
    const panel=document.createElement('div');
    panel.setAttribute('role','alertdialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Tool access');
    panel.style.cssText='position:fixed;inset:0;z-index:2147483647;background:var(--sv-page,#111);color:var(--sv-text,#fff);display:grid;place-content:center;text-align:center;padding:32px;font:16px/1.6 system-ui;';
    const heading=document.createElement('h1');heading.textContent='Your tool session has ended.';
    const text=document.createElement('p');text.textContent=message;
    const link=document.createElement('a');link.href=href;link.textContent='Return to your account';link.style.cssText='color:inherit;padding:12px;border:1px solid currentColor;border-radius:8px;';
    panel.append(heading,text,link);document.body.append(panel);
    for(const child of document.body.children)if(child!==panel)child.inert=true;
    document.documentElement.style.overflow='hidden';link.focus();
  }
  async function check(){
    if(checking||locked)return;checking=true;
    try{
      const response=await fetch('/__spanvision/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});
      const access=await response.json();
      if(!response.ok||access.allowed!==true){lock(response.status===503?'We could not verify access. Reconnect and try again.':'Open a new trial session or choose a paid plan.',access.launchUrl);return;}
      window.dispatchEvent(new CustomEvent('sv-tool-session',{detail:access}));
      clearTimeout(expiryTimer);
      expiryTimer=setTimeout(()=>lock('Open a new trial session or choose a paid plan.',access.launchUrl),Math.max(0,Date.parse(access.expiresAt)-Date.now()));
    }catch{lock('We could not verify access. Reconnect and try again.');}
    finally{checking=false;}
  }
  setInterval(check,30000);
  window.addEventListener('pageshow',check);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
  void check();
})();

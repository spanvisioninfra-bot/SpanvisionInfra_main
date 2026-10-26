export const routePaths=Object.freeze({
  landing:'/',modules:'/tools',pricing:'/pricing',faq:'/faq',login:'/login',signup:'/signup',
  forgot:'/forgot-password',verify:'/verify-email',reset:'/reset-password',account:'/account',profile:'/profile',admin:'/admin',
});
const screensByPath=new Map(Object.entries(routePaths).map(([screen,path])=>[path,screen]));
const aliases=new Map([
  ['/home','landing'],['/landing','landing'],['/index.html','landing'],['/modules','modules'],['/suggestions','modules'],
  ['/forgot','forgot'],['/verify','verify'],['/reset','reset'],
]);

export function routeHref(screen,search=''){
  if(!Object.hasOwn(routePaths,screen))throw new Error('Unknown page');
  const path=routePaths[screen];
  return path+(search?'?'+String(search).replace(/^\?/,''):'');
}

// Old bookmarks and checkout returns keep their query parameters while losing the route hash.
export function readRoute(href){
  const url=new URL(href),path=url.pathname.replace(/\/+$/,'')||'/';
  let screen=screensByPath.get(path)||aliases.get(path);
  const legacy=url.hash.slice(1),legacyScreen=legacy==='suggestions'?'modules':legacy;
  const legacyRoute=!!screen&&Object.hasOwn(routePaths,legacyScreen);
  if(legacyRoute){screen=legacyScreen;url.hash='';}
  if(screen)url.pathname=routePaths[screen];
  return {screen:screen||'not-found',href:url.pathname+url.search+url.hash,legacyRoute};
}

export function currentScreen(win=window){
  const route=readRoute(win.location.href);
  if(route.href!==win.location.pathname+win.location.search+win.location.hash)win.history.replaceState(win.history.state,'',route.href);
  return route.screen;
}

export function navigate(destination,{replace=false,preserveSearch=false,win=window}={}){
  const url=new URL(Object.hasOwn(routePaths,destination)?routePaths[destination]:destination,win.location.origin);
  if(url.origin!==win.location.origin||readRoute(url.href).screen==='not-found')throw new Error('Unknown page');
  if(preserveSearch&&!url.search)url.search=win.location.search;
  const href=readRoute(url.href).href;
  if(href!==win.location.pathname+win.location.search+win.location.hash)win.history[replace?'replaceState':'pushState'](null,'',href);
  win.dispatchEvent(new win.CustomEvent('spanvision:navigate'));
}

export function installNavigation(onChange,win=window){
  const onNavigate=()=>onChange({scroll:true});
  const onPop=()=>onChange({scroll:false});
  const onHash=()=>{if(readRoute(win.location.href).legacyRoute)onChange({scroll:true});};
  const onClick=event=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.target?.closest?.('a[href]');
    if(!link||link.hasAttribute('download')||link.target&&link.target!=='_self'||link.getAttribute('href').startsWith('#'))return;
    const url=new URL(link.href,win.location.href);
    if(url.origin!==win.location.origin||url.hash||readRoute(url.href).screen==='not-found')return;
    event.preventDefault();navigate(url.href,{win});
  };
  win.document.addEventListener('click',onClick);
  win.addEventListener('popstate',onPop);win.addEventListener('hashchange',onHash);win.addEventListener('spanvision:navigate',onNavigate);
  return ()=>{
    win.document.removeEventListener('click',onClick);
    win.removeEventListener('popstate',onPop);win.removeEventListener('hashchange',onHash);win.removeEventListener('spanvision:navigate',onNavigate);
  };
}

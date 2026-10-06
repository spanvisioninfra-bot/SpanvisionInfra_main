/* Shared browser appearance controls. Native editors keep ownership of their theme state. */
(() => {
  const script = document.currentScript;
  const module = script?.dataset.module || 'hub';
  const slot = script?.dataset.slot;
  const root = document.documentElement;
  root.dataset.svTool=module;
  const key = 'spanvision:color-mode';
  const read = name => { try { return localStorage.getItem(name); } catch { return null; } };
  const write = (name, value) => { try { localStorage.setItem(name, value); } catch {} };
  const json = name => { try { const value=JSON.parse(read(name)||'{}');return value && typeof value==='object' && !Array.isArray(value)?value:{}; } catch { return {}; } };
  const patch = (name, values) => write(name, JSON.stringify({...json(name),...values}));
  const requested = new URL(location.href).searchParams.get('appearance');
  const saved = read(key);
  // Apply the shared default before native preferences (including IndexedDB) load.
  root.dataset.svModeExplicit='true';
  const light = value => value === 'light' || value === 'Light';
  let mode = ['light','dark'].includes(requested) ? requested : ['light','dark'].includes(saved) ? saved : 'dark';
  let control;
  function mirrorPreferences() {
    const theme = mode === 'light' ? 'light' : 'spanvision-mono';
    switch(module) {
      case 'cad': { const value=json('spanvision.cad.settings');write('spanvision.cad.settings',JSON.stringify({...value,theme:{...value.theme,name:mode==='light'?'Light':'Spanvision Mono'}}));break; }
      case 'cad2d': write('spanvision.settings.uiTheme',JSON.stringify(theme));break;
      case 'bim': write('spanvision:vision-bim-validator:theme',theme);break;
      case 'pdf': patch('spanvision-pdf-workspace.preferences',{theme});patch('pdfEditorPreferences',{theme});break;
      case 'ifc': write('ifc-view.theme',theme);break;
      case 'calc': patch('ocs:settings',{theme});write('ocs-theme',theme);break;
      case 'planner': write('ops-theme',theme);break;
      case 'fem': write('fem2d-theme',theme);break;
      case 'frame': patch('ofs-settings',{theme});break;
      case 'calculation': patch('spanvision-calculation-preferences',{theme});break;
      case 'geo': write('ogs:theme',JSON.stringify(theme));break;
      case 'speech': patch('spanvision_speech_settings',{theme});break;
      case 'stl': write('oststl.theme',theme);break;
      case 'field': write('ofs_theme',mode);break;
      case 'pointcloud': patch('spanvision.pointcloud.appearance.v1',{version:1,uiTheme:theme});break;
    }
  }
  function paint() {
    root.dataset.svMode=mode;
    root.style.colorScheme=mode;
    if(control)control.value=mode;
    const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=mode==='light'?'#f5f6f8':'#000000';
  }
  function remember() {
    write(key,mode);
    if(['light','dark'].includes(new URL(location.href).searchParams.get('appearance'))) {
      const url=new URL(location.href);url.searchParams.set('appearance',mode);
      history.replaceState(history.state,'',url);
    }
  }
  function setMode(next) {
    if(next!=='light'&&next!=='dark')return;
    mode=next;remember();mirrorPreferences();paint();
    const theme=mode==='light'?'light':'spanvision-mono';
    if(root.dataset.theme!==theme)root.dataset.theme=theme;
    if(module==='cad')root.dataset.svPendingTheme=mode;
    window.dispatchEvent(new CustomEvent('spanvision:mode-change',{detail:mode}));
  }
  window.SpanvisionAppearance={getMode:()=>mode,setMode};
  if(root.dataset.svModeExplicit==='true')write(key,mode);
  mirrorPreferences();paint();root.dataset.theme=mode==='light'?'light':'spanvision-mono';
  if(module==='cad')root.dataset.svPendingTheme=mode;
  // Native settings menus remain in sync with the quick switch.
  const themeObserver=new MutationObserver(()=>{
    const next=light(root.dataset.theme)?'light':'dark';
    if(next===mode)return;
    mode=next;remember();paint();
    window.dispatchEvent(new CustomEvent('spanvision:mode-observed',{detail:mode}));
  });
  themeObserver.observe(root,{attributes:true,attributeFilter:['data-theme']});
  function mount() {
    const host=slot?.split(',').map(selector=>document.querySelector(selector.trim())).find(node=>node&&node.getBoundingClientRect().height>0);
    if(!host)return;
    const existing=document.getElementById('sv-color-mode');
    if(existing){if(existing.parentElement.parentElement!==host)host.append(existing.parentElement);return;}
    const label=document.createElement('label');label.className='sv-appearance-control';
    const icon=document.createElement('span');icon.className='sv-appearance-icon';icon.textContent='◐';icon.setAttribute('aria-hidden','true');
    const select=document.createElement('select');select.id='sv-color-mode';select.setAttribute('aria-label','Color mode');select.title='Color mode (default: Dark)';
    for(const [value,text]of [['dark','Dark'],['light','Light']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
    select.value=mode;select.addEventListener('change',()=>setMode(select.value));
    label.append(icon,select);host.append(label);control=select;
  }
  function start(){mount();const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

/* Shared location controls for geographic maps. Coordinates stay in memory. */
(() => {
  let cached;
  let pending;
  const controllers = new WeakMap();
  const valid = p => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
  function currentPosition() {
    if (!window.isSecureContext) return Promise.reject(new Error('Location needs HTTPS or localhost. Search or pan to a location.'));
    if (!navigator.geolocation) return Promise.reject(new Error('Location is unavailable in this browser. Search or pan to a location.'));
    if (cached && Date.now() - cached.time < 60000) return Promise.resolve(cached);
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Location timed out. Retry, search or pan to a location.')), 12000);
      navigator.geolocation.getCurrentPosition(position => {
        clearTimeout(timer);
        if (!valid(position.coords)) { reject(new Error('Your location is unavailable. Search or pan to a location.')); return; }
        cached = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, time: Date.now() };
        resolve(cached);
      }, error => {
        clearTimeout(timer);
        reject(new Error(error.code === 1 ? 'Location permission denied. Allow location in your browser, or search or pan manually.' : error.code === 3 ? 'Location timed out. Retry, search or pan to a location.' : 'Your location is unavailable. Retry, search or pan to a location.'));
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    }).finally(() => { pending = undefined; });
    return pending;
  }
  function attachMap(map, { autoLocate = true, zoom = 14 } = {}) {
    controllers.get(map)?.destroy();
    const container = map.getContainer();
    const bar = document.createElement('div');
    bar.className = 'sv-map-location';
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = 'Use my location';
    const status = document.createElement('span');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    bar.append(button, status); container.append(bar);
    let alive = true, request = 0, locating = false;
    function report(state, message) { bar.dataset.locationState = state; status.textContent = message; button.disabled = state === 'locating'; }
    function cancel() {
      request++;
      if (locating) { locating = false; report('manual', 'Map position kept. Use my location to recenter.'); }
    }
    function onInteraction(event) { if (!bar.contains(event.target) && (event.type !== 'keydown' || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-'].includes(event.key))) cancel(); }
    function trackCenter() { const center = map.getCenter(); container.dataset.mapLatitude = String(center.lat); container.dataset.mapLongitude = String(center.lng); }
    async function locate() {
      const id = ++request, start = map.getCenter();
      locating = true; report('locating', 'Finding your location…');
      try {
        const position = await currentPosition();
        if (!alive || id !== request) return;
        const center = map.getCenter();
        if (Math.abs(start.lat - center.lat) > 0.0001 || Math.abs(start.lng - center.lng) > 0.0001) { cancel(); return; }
        locating = false;
        map.setView([position.latitude, position.longitude], zoom, { animate: false });
        report('located', `Your location: ${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`);
      } catch (error) { if (alive && id === request) { locating = false; report('unavailable', error.message); } }
    }
    button.addEventListener('click', event => { event.stopPropagation(); void locate(); });
    // Prevent map drawing, dragging and wheel zoom when using the control.
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'dblclick', 'wheel']) bar.addEventListener(type, event => event.stopPropagation());
    for (const type of ['pointerdown', 'wheel', 'keydown']) container.addEventListener(type, onInteraction, true);
    const onSearch = () => cancel();
    window.addEventListener('ogs:map-fly-to', onSearch);
    map.on('moveend', trackCenter); trackCenter();
    const controller = { locate, cancel, destroy() {
      alive = false; request++;
      for (const type of ['pointerdown', 'wheel', 'keydown']) container.removeEventListener(type, onInteraction, true);
      window.removeEventListener('ogs:map-fly-to', onSearch);
      map.off('moveend', trackCenter); map.off('unload', controller.destroy); bar.remove(); controllers.delete(map);
    } };
    controllers.set(map, controller); map.on('unload', controller.destroy);
    report('ready', autoLocate ? '' : 'Saved or project location kept.');
    if (autoLocate) void locate();
    return controller;
  }
  window.SpanvisionLocation = { currentPosition, attachMap, cancelMap: map => controllers.get(map)?.cancel() };
})();

/* Coordinated interface motion. Editor geometry is never translated or scaled. */
(() => {
  const root=document.documentElement;
  const isHub=root.dataset.svTool==='hub';
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const capable=typeof Element.prototype.animate==='function'&&typeof IntersectionObserver==='function';
  const revealSelector='[data-sv-reveal], .module-card, .suggestion-card, .account-card, .account-details article, .account-heading, .account-nav, .auth-story, .auth-form-wrap, .suggestions-page>.eyebrow, .suggestions-page>h1, .suggestions-page>p, .preview-footer';
  const uiSelector='header, .titlebar, .title-bar, .brand-header, .ribbon, .ribbon-tabs, .toolbar, .statusbar, .status-bar, .sv-appearance-control, [role="toolbar"], [role="dialog"], [role="menu"], dialog[open]';
  const seen=new WeakSet(), active=new Map(), pending=new Set();
  let observer,reveals,themeTimer;
  function animate(node,frames,options){
    if(!capable||preference.matches||!node.isConnected)return;
    active.get(node)?.cancel();
    const animation=node.animate(frames,options);active.set(node,animation);
    const finished=()=>{if(active.get(node)===animation)active.delete(node);};
    animation.addEventListener('finish',finished,{once:true});animation.addEventListener('cancel',finished,{once:true});
  }
  function reveal(node){
    pending.delete(node);reveals?.unobserve(node);node.classList.remove('sv-reveal-waiting');
    node.dataset.svRevealed='true';
    const siblings=node.parentElement?.children;
    const index=siblings?Array.prototype.indexOf.call(siblings,node):0;
    animate(node,[{opacity:0,translate:'0 16px'},{opacity:1,translate:'0 0'}],{duration:580,delay:Math.min(index%4,3)*65,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'});
  }
  function discover(scope){
    if(!(scope instanceof Element))return;
    const selector=isHub?revealSelector:uiSelector;
    const candidates=[...(scope.matches(selector)?[scope]:[]),...scope.querySelectorAll(selector)];
    for(const node of candidates){
      if(seen.has(node)||!node.isConnected)continue;
      seen.add(node);node.dataset.svMotionElement='true';
      if(!capable||preference.matches){node.dataset.svRevealed='true';continue;}
      if(isHub){
        if(node.closest('dialog:not([open])'))continue;
        node.classList.add('sv-reveal-waiting');pending.add(node);reveals.observe(node);
      }else{
        // Opacity-only entrances keep measurements and pointer coordinates intact.
        animate(node,[{opacity:.65},{opacity:1}],{duration:240,easing:'ease-out'});
      }
    }
  }
  function forget(scope){
    if(!(scope instanceof Element))return;
    for(const node of [...pending])if(scope===node||scope.contains(node)){pending.delete(node);reveals?.unobserve(node);}
    for(const [node,animation]of active)if(scope===node||scope.contains(node)){animation.cancel();active.delete(node);}
  }
  function syncPreference(){
    root.dataset.svMotion=preference.matches?'reduced':'full';
    if(preference.matches){
      for(const [node,animation]of active){animation.cancel();active.delete(node);}
      for(const node of [...pending]){node.classList.remove('sv-reveal-waiting');node.dataset.svRevealed='true';reveals?.unobserve(node);}
      pending.clear();
    }
  }
  function themeChanged(){
    if(preference.matches)return;
    clearTimeout(themeTimer);root.dataset.svThemeChanging='true';
    themeTimer=setTimeout(()=>delete root.dataset.svThemeChanging,260);
  }
  function focused(event){
    const node=event.target.closest?.('.sv-reveal-waiting');
    if(node){reveal(node);active.get(node)?.finish();}
  }
  function start(){
    syncPreference();
    if(capable)reveals=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)reveal(entry.target);},{threshold:.06,rootMargin:'0px 0px -24px 0px'});
    discover(document.body);
    observer=new MutationObserver(records=>{
      for(const record of records){
        if(record.type==='attributes'){
          const node=record.target;
          if(node.matches('dialog[open]'))animate(node,[{opacity:.4},{opacity:1}],{duration:200,easing:'ease-out'});
          continue;
        }
        for(const node of record.removedNodes)forget(node);
        for(const node of record.addedNodes)discover(node);
      }
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  }
  preference.addEventListener('change',syncPreference);
  window.addEventListener('spanvision:mode-change',themeChanged);
  window.addEventListener('spanvision:mode-observed',themeChanged);
  document.addEventListener('focusin',focused);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.addEventListener('pagehide',event=>{
    // A cached page keeps its observers for restoration; a departing page releases them.
    if(event.persisted)return;
    observer?.disconnect();reveals?.disconnect();clearTimeout(themeTimer);
    for(const animation of active.values())animation.cancel();active.clear();pending.clear();
    preference.removeEventListener('change',syncPreference);
    window.removeEventListener('spanvision:mode-change',themeChanged);
    window.removeEventListener('spanvision:mode-observed',themeChanged);
    document.removeEventListener('focusin',focused);
  });
})();

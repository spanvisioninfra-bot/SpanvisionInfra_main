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
  // A native system/high-contrast choice must survive a reload. The explicit
  // shared switch (or URL) can replace it; the shared default cannot.
  let preservePlannerTheme = module === 'planner' && !['light','dark'].includes(requested)
    && ['system','dark','light','spanvision-mono','high-contrast','highContrast'].includes(read('ops-theme'));
  // Apply the shared default before native preferences (including IndexedDB) load.
  root.dataset.svModeExplicit='true';
  const light = value => value === 'light' || value === 'Light';
  let mode = ['light','dark'].includes(requested) ? requested : ['light','dark'].includes(saved) ? saved : 'dark';
  if (preservePlannerTheme) mode = light(root.dataset.theme) ? 'light' : 'dark';
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
      case 'planner': if (!preservePlannerTheme) write('ops-theme',theme);break;
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
    preservePlannerTheme=false;
    mode=next;remember();mirrorPreferences();paint();
    const theme=mode==='light'?'light':'spanvision-mono';
    if(root.dataset.theme!==theme)root.dataset.theme=theme;
    if(module==='cad')root.dataset.svPendingTheme=mode;
    window.dispatchEvent(new CustomEvent('spanvision:mode-change',{detail:mode}));
  }
  window.SpanvisionAppearance={getMode:()=>mode,setMode};
  if(root.dataset.svModeExplicit==='true')write(key,mode);
  mirrorPreferences();paint();
  if (!preservePlannerTheme) root.dataset.theme=mode==='light'?'light':'spanvision-mono';
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
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.classList.add('sv-appearance-icon');icon.setAttribute('viewBox','0 0 20 20');icon.setAttribute('aria-hidden','true');
    const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('cx','10');circle.setAttribute('cy','10');circle.setAttribute('r','7.5');circle.setAttribute('fill','none');circle.setAttribute('stroke','currentColor');
    const half=document.createElementNS('http://www.w3.org/2000/svg','path');
    half.setAttribute('d','M10 2.5a7.5 7.5 0 0 0 0 15Z');half.setAttribute('fill','currentColor');icon.append(circle,half);
    const select=document.createElement('select');select.id='sv-color-mode';select.setAttribute('aria-label','Color mode');select.title='Color mode (default: Dark)';
    for(const [value,text]of [['dark','Dark'],['light','Light']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
    select.value=mode;select.addEventListener('change',()=>setMode(select.value));
    label.append(icon,select);host.append(label);control=select;
  }
  function start(){mount();const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

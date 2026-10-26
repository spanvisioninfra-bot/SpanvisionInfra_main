import brand from './brand.json';
import { isLocalPreview, moduleUrl } from './module-url';
import { waitForBackend } from '../../deployment/service-readiness.mjs';
import {trialComingSoonTools,trialComingSoonMessage} from '../../commerce/catalog.mjs';
import './launch.css';

const launchUrl=new URL(location.href);
const id = launchUrl.pathname.match(/^\/launch\/([a-z0-9-]+)\/?$/)?.[1]||launchUrl.searchParams.get('tool');
const module = brand.modules.find(tool => tool.id === id);
if(module){
  launchUrl.pathname='/launch/'+module.id;
  launchUrl.searchParams.delete('tool');launchUrl.searchParams.delete('appearance');launchUrl.searchParams.delete('launch');
  history.replaceState(history.state,'',launchUrl.pathname+launchUrl.search);
}
const splash = document.querySelector('.tool-splash');
const status = document.getElementById('splash-status');
const actions = document.getElementById('splash-actions');
let controller;
const launchRequestId=crypto.randomUUID();
const accountLink=document.getElementById('splash-account');
const plansLink=document.getElementById('splash-plans');
accountLink.href='/login?returnTool='+encodeURIComponent(id||'');

async function checkTrialAvailability(signal){
  if(!trialComingSoonTools.includes(id))return;
  const response=await fetch('/api/account/tool-status',{credentials:'same-origin',cache:'no-store',signal});
  const usage=await response.json();
  if(response.status===401)accountLink.hidden=false;
  if(response.status===401||response.ok&&!['studio','team'].includes(usage.access?.plan))throw Object.assign(new Error(trialComingSoonMessage),{comingSoon:true});
  if(!response.ok)throw new Error(usage.error||'Tool access could not be checked. Please try again.');
}

async function authorizeTool(signal){
  const response=await fetch('/api/account/tool-launch',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool:id,requestId:launchRequestId}),signal});
  const grant=await response.json();
  if(!response.ok){
    if(response.status===401)accountLink.hidden=false;
    throw Object.assign(new Error(grant.error||'Tool access could not be checked. Please try again.'),{comingSoon:response.status===403&&grant.error===trialComingSoonMessage});
  }
  if(!grant.allowed){
    plansLink.hidden=false;
    if(grant.trial?.status==='daily_limit')throw new Error(grant.trial.day===1?'You have used today’s 3 trial launches. Your next trial day starts '+new Date(grant.trial.nextResetAt).toLocaleString()+'. You can also choose a paid plan.':'You have used today’s 3 trial launches on your final trial day. Choose Studio or Team to continue using the tools.');
    throw new Error('Your two-day trial has ended. Choose Studio or Team to continue using the tools.');
  }
  return grant;
}

function enterAuthorizedTool(url,ticket){
  const destination=new URL(url),form=document.createElement('form');
  form.method='POST';form.action=destination.origin+'/__spanvision/access';
  for(const [name,value] of Object.entries({ticket,next:destination.pathname+destination.search+destination.hash,appearance:window.SpanvisionAppearance.getMode()})){
    const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);
  }
  document.body.append(form);form.submit();
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, milliseconds);
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
  });
}

async function waitForService(signal) {
  const started = performance.now();
  await waitForBackend(id, `/__suite/ready/${id}`, { signal, onWaiting() {
    status.textContent = performance.now() - started > 45000 ? 'The workspace is still starting. Please wait…' : 'Preparing workspace…';
  } });
}

function updateAppearance() {
  const mode = window.SpanvisionAppearance.getMode();
  const mark = mode === 'light' ? '/spanvision-mark-light.svg' : '/spanvision-mark.svg';
  document.getElementById('splash-logo').src = mark;
  document.getElementById('company-favicon').href = mark;
}
updateAppearance();
window.addEventListener('spanvision:mode-change', updateAppearance);
window.addEventListener('spanvision:mode-observed', updateAppearance);
if (module) {
  document.getElementById('splash-title').textContent = module.label;
  document.title = `Opening ${module.label} — Spanvision Infra`;
}

async function openWorkspace() {
  controller?.abort();
  const request = controller = new AbortController();
  splash.dataset.state = 'loading';
  splash.setAttribute('aria-busy', 'true');
  actions.hidden = true;
  accountLink.hidden=true;plansLink.hidden=true;
  status.textContent = 'Opening workspace…';
  const started = performance.now();
  let stage = 'availability';
  let timeout = setTimeout(() => request.abort(), 12000);
  try {
    if (!module) throw new Error('This tool could not be found. Choose a tool from the workspace.');
    const response = await fetch('/__suite/status', { cache: 'no-store', signal: request.signal });
    if (!response.ok) throw new Error('Tool availability could not be checked. Please try again.');
    const manifest = await response.json();
    const state = Array.isArray(manifest.modules) ? manifest.modules.find(tool => tool.id === id) : null;
    if (!state?.available) throw new Error('This workspace is currently unavailable. Please try again shortly.');
    const url = moduleUrl(module, state, window.SpanvisionAppearance.getMode(), location.hostname);
    if (!url || (!isLocalPreview(location.hostname) && new URL(url).protocol !== 'https:')) throw new Error('This workspace has no valid deployment address.');
    if(!isLocalPreview(location.hostname)&&trialComingSoonTools.includes(id)){
      stage='access';clearTimeout(timeout);timeout=setTimeout(()=>request.abort(),30000);
      await checkTrialAvailability(request.signal);
    }
    if (!isLocalPreview(location.hostname) && ['bim', 'stl', 'fem'].includes(id)) {
      stage = 'startup';
      clearTimeout(timeout);
      timeout = setTimeout(() => request.abort(), 120000);
      await waitForService(request.signal);
    }
    await delay(Math.max(0, 700 - (performance.now() - started)), request.signal);
    if (request.signal.aborted) throw new Error('Tool availability took too long to respond. Please try again.');
    if(isLocalPreview(location.hostname))location.replace(url);
    else{
      stage='access';clearTimeout(timeout);timeout=setTimeout(()=>request.abort(),30000);
      status.textContent='Checking your trial or paid plan…';
      const grant=await authorizeTool(request.signal);
      enterAuthorizedTool(url,grant.ticket);
    }
  } catch (error) {
    if (request !== controller) return;
    splash.dataset.state = 'error';
    splash.setAttribute('aria-busy', 'false');
    status.textContent = request.signal.aborted ? (stage === 'startup' ? 'This workspace is taking longer to start. Please try again shortly.' : 'Tool availability took too long to respond. Please try again.') : error.message;
    actions.hidden = false;
    document.getElementById('splash-retry').hidden = !module||error.comingSoon===true;
  } finally {
    clearTimeout(timeout);
  }
}
document.getElementById('splash-retry').addEventListener('click', openWorkspace);
window.addEventListener('pagehide', () => controller?.abort());
void openWorkspace();

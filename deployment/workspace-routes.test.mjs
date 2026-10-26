import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {speechPath,speechRoute} from '../spanvision-speech-workspace/src/lib/routes.ts';

const source=fs.readFileSync(new URL('./browser-ui/workspace-route.js',import.meta.url),'utf8');
const tools=JSON.parse(fs.readFileSync(new URL('../branding/brand.json',import.meta.url))).modules;
function boot(tool,href,{cookies='',native=false}={}){
  const saved=new Map(),events=new Map(),writes=[];
  const document={currentScript:{dataset:{tool}},cookie:cookies};
  const window={addEventListener:(name,fn)=>events.set(name,fn),...(native?{__TAURI_INTERNALS__:{}}:{})};
  const context={URL,location:new URL(href),document,window,localStorage:{setItem:(name,value)=>saved.set(name,value)},history:{replaceState:(state,title,path)=>{writes.push(path);context.location=new URL(path,context.location.origin);}}};
  vm.runInNewContext(source,context);
  return {context,saved,events,writes};
}

test('all 16 tool launches lose technical parameters but retain the requested appearance',()=>{
  for(const tool of tools)for(const mode of ['light','dark']){
    const old=tool.id==='cad'?'/app/':tool.id==='bim'?'/viewer':'/';
    const result=boot(tool.id,'https://tool.example'+old+'?appearance='+mode+'&launch=workspace');
    assert.equal(result.context.location.href,'https://tool.example/workspace',tool.id);
    assert.equal(result.saved.get('spanvision:color-mode'),mode);
    assert.match(result.context.document.cookie,new RegExp('sv-appearance='+mode));
  }
});

test('clean workspace refresh uses the handoff preference and preserves real document links',()=>{
  const result=boot('cad','https://tool.example/workspace?project=one#drawing',{cookies:'__Host-sv-tool=private; sv-appearance=light'});
  assert.equal(result.context.location.href,'https://tool.example/workspace?project=one#drawing');
  assert.equal(result.saved.get('spanvision:color-mode'),'light');
  assert.equal(result.writes.length,0);
  result.events.get('spanvision:mode-change')({detail:'dark'});
  assert.equal(result.saved.get('spanvision:color-mode'),'dark');
  assert.match(result.context.document.cookie,/sv-appearance=dark/);
  result.events.get('spanvision:mode-observed')({detail:'light'});
  assert.equal(result.saved.get('spanvision:color-mode'),'light');
});

test('landing pages, separate app pages and invalid preference values remain safe',()=>{
  for(const [tool,path]of [['speech','/transcribe'],['speech','/'],['cad2d','/'],['bim','/validate'],['bim','/home']]){
    const result=boot(tool,'https://tool.example'+path+'?appearance=invalid&project=one');
    assert.equal(result.context.location.pathname,path);
    assert.equal(result.context.location.search,'?project=one');
    assert.equal(result.saved.size,0);
  }
});

test('desktop shells and file-based tools keep ownership of their URLs and preferences',()=>{
  for(const [href,native]of [['https://tauri.localhost/?appearance=light',false],['https://tool.example/?appearance=light',true],['file:///app/index.html?appearance=light',false]]){
    const result=boot('cad',href,{native});assert.equal(result.writes.length,0);assert.equal(result.saved.size,0);
  }
});

test('Speech uses clean routes and retains old workspace and account bookmarks',()=>{
  for(const view of ['home','settings','dictionary','models','mic-test','meeting','transcribe','tts','suggestions','account','landing']){
    const path=speechPath(view);assert(!path.includes('#'));
    assert.equal(speechRoute('https://tool.example'+path).view,view);
    assert.equal(speechRoute('https://tool.example/#'+(view==='home'?'workspace':view)).path,path);
  }
  assert.equal(speechRoute('https://tool.example/#about').path,'/workspace');
  assert.equal(speechRoute('https://tool.example/#login').path,'/account');
});

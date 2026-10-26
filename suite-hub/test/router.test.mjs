import test from 'node:test';
import assert from 'node:assert/strict';
import {routePaths,routeHref,readRoute,currentScreen,navigate} from '../src/router.mjs';

const origin='https://www.spanvisioninfra.com';
function fakeWindow(href){
  const entries=[],events=[];
  const win={location:new URL(href),CustomEvent,dispatchEvent:event=>events.push(event.type)};
  const write=(kind,state,title,path)=>{entries.push({kind,path});win.location=new URL(path,origin);};
  win.history={state:null,replaceState:(...args)=>write('replace',...args),pushState:(...args)=>write('push',...args)};
  return {win,entries,events};
}

test('every page has a clean path and can be opened directly',()=>{
  for(const [screen,path]of Object.entries(routePaths)){
    assert.equal(readRoute(origin+path).screen,screen);
    assert.equal(routeHref(screen),path);assert(!path.includes('#'));
  }
  assert.equal(routeHref('login','returnTool=frame'),'/login?returnTool=frame');
  assert.throws(()=>routeHref('toString'),/Unknown page/);
});

test('legacy hashes retain checkout, appearance and tool-return queries',()=>{
  for(const [legacy,screen]of [['faq','faq'],['modules','modules'],['suggestions','modules'],['landing','landing'],['reset','reset']]){
    const route=readRoute(origin+'/?appearance=light&returnTool=frame#'+legacy);
    assert.equal(route.screen,screen);assert.equal(route.href,routePaths[screen]+'?appearance=light&returnTool=frame');
  }
  assert.equal(readRoute(origin+'/?checkout=returned#account').href,'/account?checkout=returned');
});

test('aliases and trailing slashes normalize without erasing genuine fragment anchors',()=>{
  assert.equal(readRoute(origin+'/modules/').href,'/tools');
  assert.equal(readRoute(origin+'/home').href,'/');
  assert.equal(readRoute(origin+'/verify?returnTool=cad').href,'/verify-email?returnTool=cad');
  assert.equal(readRoute(origin+'/#main-content').href,'/#main-content');
  assert.equal(readRoute(origin+'/missing#faq').screen,'not-found');
});

test('old links are replaced rather than adding a broken Back-history entry',()=>{
  const {win,entries}=fakeWindow(origin+'/?checkout=returned#account');
  assert.equal(currentScreen(win),'account');
  assert.deepEqual(entries,[{kind:'replace',path:'/account?checkout=returned'}]);
  assert.equal(currentScreen(win),'account');assert.equal(entries.length,1);
});

test('programmatic navigation can preserve verification context without reloading',()=>{
  const {win,entries,events}=fakeWindow(origin+'/signup?returnTool=frame');
  navigate('verify',{preserveSearch:true,win});
  assert.equal(win.location.href,origin+'/verify-email?returnTool=frame');
  navigate('account',{replace:true,win});
  assert.equal(win.location.href,origin+'/account');
  assert.deepEqual(entries.map(e=>e.kind),['push','replace']);
  assert.deepEqual(events,['spanvision:navigate','spanvision:navigate']);
  navigate('account',{win});assert.equal(entries.length,2);
});

test('navigation rejects external origins, executable URLs and unknown routes',()=>{
  const {win,entries}=fakeWindow(origin+'/');
  for(const target of ['https://evil.example/faq','//evil.example/faq','javascript:alert(1)','/missing','toString']){
    assert.throws(()=>navigate(target,{win}),/Unknown page/);
  }
  assert.equal(entries.length,0);
});

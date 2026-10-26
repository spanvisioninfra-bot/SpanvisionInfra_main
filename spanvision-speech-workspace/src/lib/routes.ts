export const speechViews=['landing','suggestions','account','home','settings','dictionary','models','mic-test','meeting','transcribe','tts'] as const;
export type SpeechPage=typeof speechViews[number];
export function speechPath(view:string):string {
  return view==='landing'?'/':view==='home'?'/workspace':['login','signup'].includes(view)?'/account':'/'+view;
}
export function speechRoute(href:string,native=false):{view:SpeechPage;path:string}{
  const url=new URL(href),segment=url.hash.slice(1)||url.pathname.replace(/^\/+|\/+$/g,'');
  const value=['about','workspace'].includes(segment)?'home':['login','signup'].includes(segment)?'account':segment;
  const view:SpeechPage=speechViews.includes(value as SpeechPage)?value as SpeechPage:native?'home':'landing';
  return {view,path:speechPath(view)+url.search};
}

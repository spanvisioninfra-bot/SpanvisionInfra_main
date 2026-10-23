// Hosted feature access comes from the verified tool session, never local profile data.
export const aiComingSoonMessage='AI features — Coming soon for trial users. You can continue using the regular tool features.';
export const aiChecking={available:false,checking:true,message:'Checking AI availability…'};
function nativeOrPreview(context){
  return !!context.__TAURI_INTERNALS__||['localhost','127.0.0.1','[::1]'].includes(context.location?.hostname);
}
function stateFromSession(access){
  const ai=access?.features?.ai;
  if(access?.allowed!==true||!(Date.parse(access.expiresAt)>Date.now()))return {available:false,checking:false,message:'Open the tool again from your Spanvision Infra account.'};
  return {available:ai?.available===true,checking:false,message:ai?.available===true?'':aiComingSoonMessage};
}
export async function getAiFeatureAccess({context=globalThis,fetcher=context.fetch?.bind(context)}={}){
  if(nativeOrPreview(context))return {available:true,checking:false,message:''};
  try{
    const response=await fetcher('/__spanvision/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('Session unavailable');
    return stateFromSession(await response.json());
  }catch{return {available:false,checking:false,message:'We could not verify AI access. Reconnect and try again.'};}
}
export async function requireAiFeature(options){
  const access=await getAiFeatureAccess(options);
  if(!access.available)throw new Error(access.message);
}
export function subscribeAiFeature(listener,{context=globalThis,...options}={}){
  let active=true,revision=0;
  const update=access=>{if(active)listener(access);};
  const session=event=>{revision++;update(stateFromSession(event.detail));};
  context.addEventListener?.('sv-tool-session',session);
  update(nativeOrPreview(context)?{available:true,checking:false,message:''}:aiChecking);
  const request=revision;
  void getAiFeatureAccess({context,...options}).then(access=>{if(revision===request)update(access);});
  return ()=>{active=false;context.removeEventListener?.('sv-tool-session',session);};
}

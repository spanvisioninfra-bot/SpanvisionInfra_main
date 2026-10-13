import {createSignal} from 'solid-js';
export async function accountRequest(path,body){
  let response;
  try{response=await fetch(`/api/${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});}
  catch{throw new Error('We could not reach the account service. Please try again.');}
  let data;try{data=await response.json();}catch{throw new Error('Account setup is in progress. You can still open the tools.');}
  if(!response.ok)throw new Error(data.error||'The request could not be completed.');return data;
}
export function createAccountState(){
  const [config,setConfig]=createSignal(null),[user,setUser]=createSignal(null),[loading,setLoading]=createSignal(true),[error,setError]=createSignal('');
  async function refresh(){
    setLoading(true);setError('');
    try{const value=await accountRequest('account/config');setConfig(value);setUser((await accountRequest('account/session')).user);}
    catch(error){setError(error.message);}finally{setLoading(false);}
  }
  async function signOut(){await accountRequest('account/sign-out',{});setUser(null);location.hash='login';}
  return {config,user,loading,error,refresh,signOut};
}

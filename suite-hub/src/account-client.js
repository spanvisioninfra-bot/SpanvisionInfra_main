import {createSignal} from 'solid-js';
import {navigate} from './router.mjs';
export async function accountRequest(path,body){
  // Only retry reads. Repeating a sign-up or billing request could perform it twice.
  const attempts=body===undefined?2:1;
  for(let attempt=0;attempt<attempts;attempt++){
    let response;
    try{response=await fetch(`/api/${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});}
    catch{
      if(attempt+1<attempts){await new Promise(resolve=>setTimeout(resolve,500));continue;}
      throw new Error('We could not reach the account service. Check your connection and try again.');
    }
    if([502,503,504].includes(response.status)&&attempt+1<attempts){await new Promise(resolve=>setTimeout(resolve,500));continue;}
    let data;try{data=await response.json();}catch{throw new Error('The account service returned an unexpected response. Please try again.');}
    if(!response.ok)throw new Error(data.error||'The request could not be completed.');return data;
  }
}
export function createAccountState(){
  const [config,setConfig]=createSignal(null),[user,setUser]=createSignal(null),[loading,setLoading]=createSignal(true),[error,setError]=createSignal('');
  let pending;
  function refresh(){
    if(pending)return pending;
    setLoading(true);setError('');
    pending=(async()=>{
      try{
        const value=await accountRequest('account/config');
        if(typeof value?.authAvailable!=='boolean')throw new Error('The account service returned an unexpected response. Please try again.');
        setConfig(value);setUser((await accountRequest('account/session')).user);
      }
      catch(error){setUser(null);setError(error.message);}finally{setLoading(false);pending=undefined;}
    })();
    return pending;
  }
  async function signOut(){await accountRequest('account/sign-out',{});setUser(null);navigate('login',{replace:true});}
  return {config,user,loading,error,refresh,signOut};
}

import {createSignal,createEffect,For,Show} from 'solid-js';
import {accountRequest} from './account-client';

const label=value=>({explorer:'Explorer',studio:'Studio',team:'Team'})[value]||value;
const date=value=>value?new Date(value).toLocaleString('en-GB'):'No expiry';
export default function AdminPanel(props){
  const [users,setUsers]=createSignal([]),[page,setPage]=createSignal(1),[next,setNext]=createSignal(false),[total,setTotal]=createSignal(null),[loading,setLoading]=createSignal(false),[error,setError]=createSignal(''),[query,setQuery]=createSignal('');
  const [selected,setSelected]=createSignal(null),[detail,setDetail]=createSignal(null),[detailLoading,setDetailLoading]=createSignal(false),[saving,setSaving]=createSignal(false),[notice,setNotice]=createSignal('');
  let request=0,detailRequest=0,dialog,previousFocus;
  const allowed=()=>props.account.user()?.role==='super_admin';
  const shown=()=>users().filter(user=>`${user.email} ${user.name}`.toLowerCase().includes(query().toLowerCase()));
  async function loadPage(number=1){
    const sequence=++request;setLoading(true);setError('');
    try{
      const result=await accountRequest(`admin/users?page=${number}`);
      if(sequence!==request||!allowed())return;
      setUsers(result.users);setPage(result.page);setNext(result.hasNext);setTotal(result.total);
    }catch(error){if(sequence===request&&allowed()){setUsers([]);setNext(false);setError(error.message);}}
    finally{if(sequence===request)setLoading(false);}
  }
  createEffect(()=>{if(allowed()){void loadPage(1);}else{request++;detailRequest++;setUsers([]);setSelected(null);setDetail(null);dialog?.close();}});
  async function openUser(event,user){
    previousFocus=event.currentTarget;setSelected(user);setDetail(null);setNotice('');setError('');setDetailLoading(true);dialog.showModal();
    const sequence=++detailRequest;
    try{const result=await accountRequest(`admin/user?user=${encodeURIComponent(user.id)}`);if(sequence===detailRequest&&allowed())setDetail(result);}
    catch(error){if(sequence===detailRequest&&allowed())setError(error.message);}
    finally{if(sequence===detailRequest)setDetailLoading(false);}
  }
  function close(){
    if(saving())return;
    const id=selected()?.id;detailRequest++;dialog.close();setSelected(null);setDetail(null);
    // Saving refreshes the list, so the original button may have been replaced.
    const focus=previousFocus?.isConnected?previousFocus:document.querySelector(`.admin-user[data-user="${id}"] button`);
    focus?.focus();
  }
  async function save(event){
    event.preventDefault();if(saving()||!detail()||!allowed())return;
    const data=new FormData(event.currentTarget),id=detail().user.id;
    const expiry=data.get('expires');setSaving(true);setError('');setNotice('');
    try{
      await accountRequest('admin/plan',{userId:id,plan:data.get('plan')==='inherit'?null:data.get('plan'),expiresAt:data.get('plan')==='inherit'||!expiry?null:`${expiry}T23:59:59.999Z`,reason:data.get('reason')});
      const result=await accountRequest(`admin/user?user=${encodeURIComponent(id)}`);
      if(!allowed()||selected()?.id!==id)return;
      setDetail(result);setNotice('Plan access saved. Payment-provider billing was not changed.');await loadPage(page());
    }catch(error){if(allowed())setError(error.message);}finally{setSaving(false);}
  }
  return <section class="admin-page marketing-section"><Show when={allowed()} fallback={<div class="signed-out-card"><span class="eyebrow">ADMINISTRATION</span><h1>Super-admin access required.</h1><p>This area is available to the designated, verified administrator.</p><a class="button button-light" href={props.account.user()?'#account':'#login'}>{props.account.user()?'Back to my account':'Sign in'} →</a></div>}>
    <div class="admin-heading"><div><span class="eyebrow">SUPER ADMIN</span><h1>Users & plan access.</h1><p>Manage access across your workspace. Your account includes Explorer, Studio and Team.</p></div><a href="#account" class="button button-outline">My account →</a></div>
    <p class="admin-disclosure">Plan grants control account access. Subscription charges and cancellation remain with the payment provider. Each saved change records who changed it and why.</p>
    <div class="admin-toolbar"><label>Search this page<input type="search" placeholder="Name or email" value={query()} onInput={event=>setQuery(event.currentTarget.value)}/></label><button class="button button-outline" disabled={loading()||saving()} onClick={()=>loadPage(page())}>Refresh users</button></div>
    <Show when={error()&&!selected()}><p class="form-error" role="alert">{error()}</p></Show>
    <Show when={loading()}><p class="admin-empty" role="status">Loading users and plans…</p></Show>
    <Show when={!loading()&&shown().length} fallback={<Show when={!loading()&&!error()}><p class="admin-empty">{query()?'No users match on this page.':'No users on this page.'}</p></Show>}>
      <div class="admin-users"><For each={shown()}>{user=><article class="admin-user" data-user={user.id}><div class="admin-user-identity"><h2>{user.name||'Workspace user'}</h2><p>{user.email}</p><small>{user.emailVerified?'Verified email':'Email not verified'}{user.role==='super_admin'?' · Super admin':''}</small></div><div class="admin-user-plan"><strong>{user.role==='super_admin'?'All plans':label(user.access.plan)}</strong><span>{({super_admin:'Full access',admin:'Admin grant',subscription:'Provider subscription',free:'Free workspace'})[user.access.source]}</span></div><button class="button button-outline" disabled={saving()} onClick={event=>openUser(event,user)}>View plans →</button></article>}</For></div>
    </Show>
    <div class="admin-pagination"><span>Page {page()}<Show when={total()!==null}> · {total()} users</Show></span><div><button disabled={page()===1||loading()||saving()} onClick={()=>{setQuery('');loadPage(page()-1);}}>Previous</button><button disabled={!next()||loading()||saving()} onClick={()=>{setQuery('');loadPage(page()+1);}}>Next</button></div></div>
  </Show>
    <dialog ref={dialog} class="admin-plan-dialog" aria-labelledby="admin-plan-heading" onCancel={event=>{event.preventDefault();close();}}>
      <div class="checkout-title-row"><span class="eyebrow">USER PLAN ACCESS</span><button class="close-icon" type="button" aria-label="Close user plans" disabled={saving()} onClick={close}>×</button></div>
      <h2 id="admin-plan-heading">{selected()?.name||'Workspace user'}</h2><p class="admin-detail-email">{selected()?.email}</p>
      <Show when={detailLoading()}><p role="status" class="admin-empty">Loading plan details…</p></Show>
      <Show when={error()}><p class="form-error" role="alert">{error()}</p></Show><Show when={notice()}><p class="form-success" role="status">{notice()}</p></Show>
      <Show when={detail()}>{value=><><p class="admin-access-summary">Current access: <strong>{value().user.role==='super_admin'?'All plans':label(value().access.plan)}</strong> · {date(value().access.expiresAt)}</p>
        <Show when={value().user.role!=='super_admin'} fallback={<p class="account-setup-note">The super admin always has access to every plan.</p>}>
          <form class="admin-plan-form identity-form" onSubmit={save}><label>Access plan<select name="plan" value={value().override?.plan_id||'inherit'}><option value="inherit">Use subscription or free plan</option><option value="explorer">Explorer</option><option value="studio">Studio</option><option value="team">Team</option></select></label><label>Grant expiry (optional, UTC)<input name="expires" type="date" value={value().override?.expires_at?.slice(0,10)||''}/></label><label>Reason for change<textarea name="reason" required minlength="3" maxlength="500" placeholder="Why are you changing this user's access?"/></label><button class="button button-light" disabled={saving()}>{saving()?'Saving…':'Save plan access'} →</button></form>
        </Show>
        <div class="admin-detail-section"><h3>Payment subscriptions</h3><Show when={value().subscriptions.length} fallback={<p>No payment subscription is recorded.</p>}><ul><For each={value().subscriptions}>{subscription=><li><strong>{subscription.plan_key.replaceAll('_',' ')}</strong><span>{subscription.provider} · {subscription.status}</span><small>Billing period: {date(subscription.current_period_end)}</small></li>}</For></ul></Show></div>
        <div class="admin-detail-section"><h3>Recent access changes</h3><Show when={value().audit.length} fallback={<p>No manual changes are recorded.</p>}><ul><For each={value().audit}>{entry=><li><strong>{entry.action==='clear'?'Manual grant cleared':`${label(entry.after_state?.plan_id)} granted`}</strong><span>{entry.reason}</span><small>{date(entry.created_at)}</small></li>}</For></ul></Show></div>
      </>}</Show>
    </dialog>
  </section>;
}

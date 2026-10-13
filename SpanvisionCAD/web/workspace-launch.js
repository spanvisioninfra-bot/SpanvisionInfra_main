// Open suite launches through CAD's shared GUI/web control API.
window.SpanvisionCADLaunch = async function () {
  if (new URL(location.href).searchParams.get('launch') !== 'workspace') return;
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const deadline = Date.now() + 20000;
  while (!window.wasmBindings && Date.now() < deadline) await sleep(50);
  const bindings = window.wasmBindings;
  if (!bindings?.ocs_control_submit || !bindings?.ocs_control_take) throw new Error('The CAD engine is still starting.');
  async function request(value) {
    const ticket = bindings.ocs_control_submit(JSON.stringify(value));
    while (Date.now() < deadline) {
      const response = bindings.ocs_control_take(ticket);
      if (response) return JSON.parse(response);
      await sleep(50);
    }
    throw new Error('The CAD engine took too long to respond.');
  }
  const state = await request({op:'state'});
  if (!state.ok) throw new Error('The drawing workspace could not be checked.');
  const active = state.documents.find(document => document.id === state.document_id);
  if (!active) throw new Error('The drawing workspace could not be found.');
  if (!active.start) return;
  const result = await request({op:'new',request_id:crypto.randomUUID(),client_id:'suite-launch',session_id:state.session_id,document_id:state.document_id});
  if (!result.ok) throw new Error('The drawing could not be opened. Please try again.');
  while (Date.now() < deadline) {
    const next = await request({op:'state'});
    if (next.ok && next.documents.some(document => document.id === next.document_id && !document.start)) return;
    await sleep(50);
  }
  throw new Error('The drawing took too long to open.');
};

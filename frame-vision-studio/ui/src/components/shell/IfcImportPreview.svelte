<script>
  import { dialogFocus } from '../../lib/dialog.js';
  import { ifcImportPreview, activeWorkspaceView } from '../../stores/ui.js';
  import { get } from 'svelte/store';
  import { createKozijn, updateCellType, removeKozijn, selectKozijn, currentKozijn } from '../../stores/kozijn.js';
  import { toast } from '../../stores/toast.js';
  let busy = false;
  let added = new Set();
  $: rows = $ifcImportPreview ? [
    ...$ifcImportPreview.windows.map(item => ({ ...item, kind: 'Window' })),
    ...$ifcImportPreview.doors.map(item => ({ ...item, kind: 'Door' })),
  ] : [];
  $: if (!$ifcImportPreview) added = new Set();
  function close() { if (!busy) ifcImportPreview.set(null); }
  async function addFrame(item) {
    busy = true;
    const previous = get(currentKozijn);
    let frame;
    try {
      if (item.widthMm <= 134 || item.heightMm <= 134) {
        throw new Error('These dimensions leave no opening with the default 67 mm frame members. Create a frame with a suitable member width instead.');
      }
      frame = await createKozijn(item.name, item.properties.Tag || item.name, item.widthMm, item.heightMm);
      if (item.kind === 'Door') await updateCellType(0, 'door', null);
      added = new Set([...added, item.guid]);
      activeWorkspaceView.set('editor');
      toast.success(`${item.kind} added: ${frame.name}. Review its frame style and fittings.`);
    } catch (error) {
      if (frame) {
        try { await removeKozijn(frame.id); if (previous) await selectKozijn(previous.id); }
        catch (rollbackError) { toast.error(`Could not remove the incomplete frame: ${rollbackError}`); }
      }
      toast.error(String(error));
    }
    finally { busy = false; }
  }
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') close(); }} />
{#if $ifcImportPreview}
  <div class="overlay">
    <section class="preview" role="dialog" aria-modal="true" aria-labelledby="ifc-preview-title" tabindex="-1" use:dialogFocus>
      <header><h2 id="ifc-preview-title">IFC frame dimensions</h2><button onclick={close} disabled={busy} aria-label="Close IFC preview">×</button></header>
      <p>{$ifcImportPreview.filename}</p>
      <p>Review dimensions before adding a frame. The default frame style is applied; panels, fittings, geometry and placement are not copied from the IFC.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Type</th><th>Name</th><th>Width (mm)</th><th>Height (mm)</th><th>Action</th></tr></thead>
        <tbody>{#each rows as item}<tr>
          <td>{item.kind}</td><td>{item.name}</td><td>{item.widthMm}</td><td>{item.heightMm}</td>
          <td><button disabled={busy || added.has(item.guid)} onclick={() => addFrame(item)}>{added.has(item.guid) ? 'Added' : 'Add frame'}</button></td>
        </tr>{/each}</tbody>
      </table></div>
      {#if !rows.length}<p>No windows or doors with explicit dimensions were found.</p>{/if}
      {#if $ifcImportPreview.openings.length}<p>{$ifcImportPreview.openings.length} opening identities found. Opening dimensions require geometry extraction and are unavailable in this import.</p>{/if}
      <footer><button onclick={close} disabled={busy}>Close</button></footer>
    </section>
  </div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; z-index: 2000; background: #0009; display: grid; place-items: center; padding: 20px; }
  .preview { width: min(840px,100%); max-height: 85vh; overflow: auto; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-color); padding: 22px; border-radius: 12px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; } h2 { font-size: 19px; margin: 0; }
  p { line-height: 1.5; margin: 14px 0; } .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; text-align: left; } th, td { padding: 10px; border-bottom: 1px solid var(--border-color); }
  button { color: var(--text-primary); background: var(--bg-surface-alt, var(--bg-surface)); border: 1px solid var(--border-color); padding: 8px 12px; border-radius: 5px; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; } button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; } footer { display: flex; justify-content: flex-end; padding-top: 16px; }
</style>

<script>
  import { ifcComparison } from '../../stores/ui.js';
  import { dialogFocus } from '../../lib/dialog.js';
  function close() { ifcComparison.set(null); }
  function download() {
    const blob = new Blob([JSON.stringify({ scope: 'Window/door identities and explicit overall dimensions only. File comparison matches GlobalIds; project roundtrip matches unique Tags, then GlobalIds.', ...$ifcComparison }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'frame-ifc-comparison.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>
<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && $ifcComparison) close(); }} />
{#if $ifcComparison}
  <div class="overlay">
    <section role="dialog" aria-modal="true" aria-labelledby="ifc-comparison-title" tabindex="-1" use:dialogFocus>
      <header><h2 id="ifc-comparison-title">IFC comparison</h2><button onclick={close} aria-label="Close IFC comparison">×</button></header>
      <p>Checks window/door identities, names, types and explicit overall dimensions. Geometry, placement, fittings and other properties are outside this comparison.</p>
      <p>{$ifcComparison.added.length} added · {$ifcComparison.removed.length} removed · {$ifcComparison.modified.length} modified · {$ifcComparison.unchanged} unchanged</p>
      {#each [['Added', $ifcComparison.added], ['Removed', $ifcComparison.removed]] as [title, rows]}
        {#if rows.length}<h3>{title}</h3><ul>{#each rows as row}<li>{row.name} ({row.entityType}) — {row.widthMm} × {row.heightMm} mm · {row.guid}</li>{/each}</ul>{/if}
      {/each}
      {#each $ifcComparison.modified as row}
        <h3>{row.name} · {row.guid}</h3>
        <div class="table-wrap"><table><thead><tr><th>Property</th><th>Previous</th><th>Current</th></tr></thead><tbody>{#each row.changes as change}<tr><td>{change.property}</td><td>{change.oldValue}</td><td>{change.newValue}</td></tr>{/each}</tbody></table></div>
      {/each}
      <footer><button onclick={download}>Download comparison</button><button onclick={close}>Close</button></footer>
    </section>
  </div>
{/if}
<style>
  .overlay { position: fixed; inset: 0; z-index: 2100; background: #0009; display: grid; place-items: center; padding: 16px; }
  section { width: min(840px,100%); max-height: 85vh; overflow: auto; padding: 22px; border-radius: 12px; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-color); overflow-wrap: anywhere; }
  header, footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; } h2 { margin: 0; font-size: 19px; } h3 { font-size: 15px; margin: 16px 0 8px; } p, li { line-height: 1.5; } .table-wrap { overflow-x: auto; } table { width: 100%; border-collapse: collapse; text-align: left; } th, td { padding: 8px; border-bottom: 1px solid var(--border-color); }
  footer { justify-content: flex-end; margin-top: 20px; flex-wrap: wrap; } button { color: inherit; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 5px; padding: 8px 12px; cursor: pointer; } button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
</style>

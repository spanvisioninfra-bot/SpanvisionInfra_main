<script>
  import { unsavedChangesPrompt } from '../../stores/ui.js';
  import { dialogFocus } from '../../lib/dialog.js';
  import { fileSave } from '../../lib/project-actions.js';
  let busy = $state(false);
  let error = $state('');
  function finish(proceed) {
    if (busy) return;
    const request = $unsavedChangesPrompt;
    unsavedChangesPrompt.set(null); error = '';
    request?.resolve(proceed);
  }
  async function save() {
    if (busy) return;
    busy = true; error = '';
    const saved = await fileSave();
    busy = false;
    if (saved) finish(true);
    else error = 'The project was not saved. Retry or cancel to keep editing.';
  }
  function keydown(event) {
    if ($unsavedChangesPrompt && event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); finish(false);
    }
  }
</script>

<svelte:window onkeydown={keydown} />
{#if $unsavedChangesPrompt}
  <div class="project-prompt-overlay">
    <div class="project-prompt" role="dialog" aria-modal="true" aria-labelledby="project-unsaved-title" tabindex="-1" use:dialogFocus>
      <h2 id="project-unsaved-title">Unsaved changes</h2>
      <p>{$unsavedChangesPrompt.profileOnly ? 'Save your working profile before replacing it, or discard its edits.' : 'Save your current project and working profile before continuing, or discard their edits.'}</p>
      {#if error}<p role="alert">{error}</p>{/if}
      <div class="actions">
        <button onclick={() => finish(false)} disabled={busy}>Cancel</button>
        <button onclick={() => finish(true)} disabled={busy}>Discard changes</button>
        <button class="primary" onclick={save} disabled={busy} aria-busy={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .project-prompt-overlay { position: fixed; inset: 0; z-index: 2000; background: rgb(0 0 0 / 55%); display: grid; place-items: center; padding: 16px; }
  .project-prompt { width: min(460px, 100%); padding: 24px; background: var(--bg-surface); color: var(--text-primary); border: var(--border-default); border-radius: 8px; box-shadow: var(--shadow-lg); }
  h2 { margin: 0 0 12px; font-size: 20px; } p { margin: 0 0 20px; line-height: 1.5; }
  .actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
  button { border: var(--border-default); border-radius: 4px; padding: 9px 12px; background: var(--bg-surface-alt); color: var(--text-primary); }
  .primary { font-weight: 600; } button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
</style>

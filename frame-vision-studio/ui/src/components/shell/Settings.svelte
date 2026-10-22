<script>
  import { dialogFocus } from "../../lib/dialog.js";
  import { _ , locale } from "svelte-i18n";
  import { showSettings, theme, setTheme, THEMES } from "../../stores/ui.js";

  let activeCategory = "general";
  let dialogEl;
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };

  function onTitleMouseDown(e) {
    if (e.target.closest('.window-close')) return;
    dragging = true;
    const rect = dialogEl.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!dragging || !dialogEl) return;
    dialogEl.style.left = Math.max(0, Math.min(window.innerWidth - dialogEl.offsetWidth, e.clientX - dragOffset.x)) + 'px';
    dialogEl.style.top = Math.max(0, Math.min(window.innerHeight - dialogEl.offsetHeight, e.clientY - dragOffset.y)) + 'px';
    dialogEl.style.margin = '0';
    dialogEl.style.position = 'fixed';
  }

  function onMouseUp() {
    dragging = false;
  }

  function handleKeydown(e) {
    if (e.key === "Escape") showSettings.set(false);
  }
</script>

<svelte:window onkeydown={handleKeydown} onmousemove={onMouseMove} onmouseup={onMouseUp} />

{#if $showSettings}
  <div class="overlay">
    <div class="window" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1" use:dialogFocus bind:this={dialogEl} onclick={(e) => { e.stopPropagation(); }}>

      <div class="window-titlebar" onmousedown={onTitleMouseDown}>
        <span class="window-title" id="settings-title">{$_('settings.title')}</span>
        <button class="window-close" aria-label={$_("shell.close")} onclick={() => showSettings.set(false)}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div class="window-body">
        <div class="window-sidebar">
          <button class="nav-item" class:active={activeCategory === "general"} onclick={() => activeCategory = "general"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            {$_('settings.cat.general')}
          </button>
        </div>

        <div class="window-content">
          {#if activeCategory === "general"}
            <div class="form-group">
              <label class="form-label" for="settings-language">{$_('settings.language')}</label>
              <select id="settings-language" class="form-control" value={$locale} onchange={(e) => locale.set(e.target.value)}>
                <option value="en">{$_('lang.en')}</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="settings-theme">{$_('settings.theme')}</label>
              <select id="settings-theme" class="form-control" value={$theme} onchange={(e) => setTheme(e.target.value)}>
                {#each THEMES as t}
                  <option value={t}>{$_('settings.theme.' + t)}</option>
                {/each}
              </select>
            </div>

          {/if}
        </div>
      </div>

      <div class="window-footer">
        <button class="btn" onclick={() => showSettings.set(false)}>{$_('settings.close')}</button>
      </div>

    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .window {
    max-height: calc(100dvh - 24px);
    width: 520px;
    max-width: 90vw;
    background: var(--bg-surface, #f0f0f0);
    border: 1px solid var(--border-color, #999);
    border-radius: 4px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .window-titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 30px;
    padding: 0 4px 0 10px;
    background: var(--bg-surface-alt, #fff);
    border-bottom: 1px solid var(--border-color, #ddd);
    cursor: default;
    user-select: none;
  }

  .window-title {
    font-size: 12px;
    color: var(--text-primary);
  }

  .window-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    color: var(--text-muted);
    transition: background 0.1s, color 0.1s;
  }

  .window-close:hover {
    background: var(--hover-overlay);
    color: white;
  }

  .window-body {
    display: flex;
    min-height: 260px;
  }

  .window-sidebar {
    width: 150px;
    padding: 8px 6px;
    border-right: 1px solid var(--border-color, #ddd);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    font-size: 12px;
    color: var(--text-primary);
    border-radius: 3px;
    text-align: left;
    transition: background 0.1s;
  }

  .nav-item:hover {
    background: var(--hover-overlay);
  }

  .nav-item.active {
    background: var(--bg-selected);
    color: var(--text-primary);
    font-weight: 600;
  }

  .window-content {
    min-width: 0;
    overflow-y: auto;
    flex: 1;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .form-control {
    padding: 5px 8px;
    border: 1px solid var(--border-color, #aaa);
    border-radius: 3px;
    background: var(--bg-surface, #fff);
    color: var(--text-primary);
    font-size: 12px;
    max-width: 200px;
  }

  .form-control:focus {
    outline: none;
    border-color: var(--amber);
  }

  .window-footer {
    display: flex;
    justify-content: flex-end;
    padding: 8px 12px;
    border-top: 1px solid var(--border-color, #ddd);
  }

  .btn {
    padding: 5px 20px;
    font-size: 12px;
    border: 1px solid var(--border-color, #aaa);
    border-radius: 3px;
    background: var(--bg-surface-alt, #e1e1e1);
    color: var(--text-primary);
    cursor: default;
    transition: background 0.1s;
  }

  .btn:hover {
    background: var(--border-color, #d0d0d0);
  }
  @media (max-width: 600px) { .window-body { flex-direction: column; min-height: 0; overflow-y: auto; } .window-sidebar { width: 100%; flex-direction: row; border-right: 0; border-bottom: var(--border-default); } .window-content { padding: 20px; } .form-control { width: 100%; max-width: none; min-height: 40px; } .window-titlebar, .window-close { height: 40px; } }
</style>

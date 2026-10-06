import { Show, createSignal, onMount, onCleanup } from 'solid-js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { t } from '@/state/locale-store';
import { loadFile } from '@/actions/load-file';
import { createParameterCsv } from '@spanvision-infra/ifc-core';
import { allParameters, selectedParameter, fileName } from '@/state/ifc-store';
import { controlsEnabled } from '@/state/player-store';
import LanguageSelector from '@/components/LanguageSelector';
import AppearanceMenu from '@/components/AppearanceMenu';
import { brand } from '@/brand';
import brandMark from '../../../../brands/spanvision/sv-monogram.svg?url';
import styles from '@/styles/components/Header.module.css';

export default function Header() {
  const [isMaximized, setIsMaximized] = createSignal(false);
  const appWindow = '__TAURI_INTERNALS__' in window ? getCurrentWindow() : null;
  let fileInputRef: HTMLInputElement | undefined;

  const updateMaximized = async () => {
    if (appWindow) setIsMaximized(await appWindow.isMaximized());
  };

  onMount(() => {
    if (!appWindow) return;
    updateMaximized();
    const unlisten = appWindow.onResized(() => {
      updateMaximized();
    });
    onCleanup(() => {
      unlisten.then((fn) => fn());
    });
  });

  const handleFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) {
      loadFile(input.files[0]);
      input.value = '';
    }
  };

  function exportParameter() {
    const name = selectedParameter();
    const parameter = allParameters.get(name);
    if (!parameter) return;
    const url = URL.createObjectURL(new Blob([createParameterCsv(name, parameter)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName().replace(/\.ifc$/i, '')}-parameters.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <header class={styles.header} data-tauri-drag-region>
      <img src={brandMark} alt="" class={styles.appIcon} />
      <button
        class={styles.openBtn}
        onClick={() => fileInputRef?.click()}
        title={t('toolbar.openFile')}
      >
        <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
          <path
            d="M2 5.5a1 1 0 0 1 1-1h3.17a1 1 0 0 1 .7.29l1.42 1.42a1 1 0 0 0 .7.29H15a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5.5Z"
            stroke="currentColor"
            stroke-width="1.3"
          />
        </svg>
      </button>
      <button class={styles.openBtn} onClick={exportParameter} disabled={!controlsEnabled()} title="Export parameter CSV" aria-label="Export parameter CSV">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
        </svg>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ifc"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div class={styles.dragRegion} data-tauri-drag-region onDblClick={() => appWindow?.toggleMaximize()}>
        <span class={styles.appTitle}>{brand.productName}</span>
        <span class={styles.ownershipLabel}>{brand.ownershipLabel}</span>
      </div>

      <AppearanceMenu />
      <LanguageSelector />

      <Show when={appWindow}>
        <div class={styles.windowControls}>
          <button
            class={styles.windowButton}
            onClick={() => appWindow?.minimize()}
            title={t('header.minimize')}
          >
            <svg width="10" height="1" viewBox="0 0 10 1">
              <rect fill="currentColor" width="10" height="1" />
            </svg>
          </button>
          <button
            class={styles.windowButton}
            onClick={() => appWindow?.toggleMaximize()}
            title={isMaximized() ? t('header.restore') : t('header.maximize')}
          >
            <Show
              when={isMaximized()}
              fallback={
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <rect fill="none" stroke="currentColor" stroke-width="1" x="0.5" y="0.5" width="9" height="9" />
                </svg>
              }
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect fill="none" stroke="currentColor" stroke-width="1" x="2.5" y="0.5" width="7" height="7" />
                <polyline fill="none" stroke="currentColor" stroke-width="1" points="0.5,2.5 0.5,9.5 7.5,9.5 7.5,2.5" />
              </svg>
            </Show>
          </button>
          <button
            class={`${styles.windowButton} ${styles.windowButtonClose}`}
            onClick={() => appWindow?.close()}
            title={t('header.close')}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line stroke="currentColor" stroke-width="1.2" x1="0" y1="0" x2="10" y2="10" />
              <line stroke="currentColor" stroke-width="1.2" x1="10" y1="0" x2="0" y2="10" />
            </svg>
          </button>
        </div>
      </Show>
    </header>
  );
}

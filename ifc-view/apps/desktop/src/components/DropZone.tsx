import { showDropZone, isDragOver } from '@/state/ui-store';
import { loadFile } from '@/actions/load-file';
import { t } from '@/state/locale-store';
import styles from '@/styles/components/DropZone.module.css';

export default function DropZone() {
  let fileInputRef: HTMLInputElement | undefined;

  const handleFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void loadFile(file);
    // Permit retrying the same file after an import error.
    input.value = '';
  };

  return (
    <div class={`${styles.dropZone} ${!showDropZone() ? styles.hidden : ''} ${isDragOver() ? styles.dragover : ''}`}>
      <div class={styles.dropZoneBox}>
        <div class={styles.dropZoneIcon}>{'\u{1F4E6}'}</div>
        <h2 class={styles.dropZoneTitle}>{t('drop.title')}</h2>
        <p class={styles.dropZoneSubtitle}>
          <span>{t('drop.subtitle1')}</span>
          <br />
          <span class={styles.dropZoneDetail}>{t('drop.subtitle2')}</span>
        </p>
        <div class={styles.dropZoneFormats}>
          <span class={styles.formatBadge}>.ifc</span>
        </div>
        <p class={styles.dropZoneOr}>{t('drop.or')}</p>
        <button type="button" class={styles.fileInputLabel} onClick={() => fileInputRef?.click()}>
          <span aria-hidden="true">{'\u{1F4C2}'}</span>
          {t('drop.chooseFile')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          class={styles.fileInput}
          accept=".ifc"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}

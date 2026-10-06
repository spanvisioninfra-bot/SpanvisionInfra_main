import { load, type Store } from "@tauri-apps/plugin-store";

let _store: Store | null = null;
const browserMode = () => typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window);

async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await load("preferences.json", { autoSave: true, defaults: {} });
  }
  return _store;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  if (key === 'theme' && typeof document !== 'undefined' && document.documentElement.dataset.svModeExplicit === 'true') {
    return (document.documentElement.dataset.svMode === 'light' ? 'light' : 'spanvision-mono') as T;
  }
  if (browserMode()) {
    try {
      const value = localStorage.getItem(`spanvision.fem.setting.${key}`);
      return value === null ? fallback : JSON.parse(value) as T;
    } catch { return fallback; }
  }
  try {
    const store = await getStore();
    const value = await store.get<T>(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  if (browserMode()) {
    localStorage.setItem(`spanvision.fem.setting.${key}`, JSON.stringify(value));
    return;
  }
  try {
    const store = await getStore();
    await store.set(key, value);
  } catch {
    // silently fail if store unavailable
  }
}

/**
 * Abonneer op wijzigingen van één setting (Tauri plugin-store `onKeyChange`).
 * Retourneert een unsubscribe-functie; in de browser (geen Tauri) een no-op.
 */
export async function onSettingChange<T>(
  key: string,
  cb: (value: T | undefined) => void,
): Promise<() => void> {
  try {
    const store = await getStore();
    return await store.onKeyChange<T>(key, (value) => cb(value ?? undefined));
  } catch {
    return () => {};
  }
}

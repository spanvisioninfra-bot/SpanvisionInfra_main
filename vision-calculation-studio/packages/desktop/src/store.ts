import { load, type Store } from "@tauri-apps/plugin-store";

let _store: Store | null = null;
const BROWSER_PREFERENCES_KEY = "spanvision-calculation-preferences";
const isDesktop = () => Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

function browserPreferences(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(BROWSER_PREFERENCES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await load("preferences.json", { autoSave: true, defaults: {} });
  }
  return _store;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  if (key === "language") return "en" as T;
  if (!isDesktop()) return (browserPreferences()[key] as T | undefined) ?? fallback;
  try {
    const store = await getStore();
    const value = await store.get<T>(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  if (key === "language") value = "en" as T;
  if (!isDesktop()) {
    try {
      localStorage.setItem(BROWSER_PREFERENCES_KEY, JSON.stringify({ ...browserPreferences(), [key]: value }));
    } catch { /* Private browsing may disable persistence. */ }
    return;
  }
  try {
    const store = await getStore();
    await store.set(key, value);
  } catch {
    // silently fail if store unavailable
  }
}

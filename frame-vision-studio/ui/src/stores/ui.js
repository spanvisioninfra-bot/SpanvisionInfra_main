import { writable } from "svelte/store";
import { saveSetting, getSetting } from "../lib/settings.js";

export const activeRibbonTab = writable("home");
export const activeWorkspaceView = writable("editor");
export const showAppMenu = writable(false);
export const showSettings = writable(false);
export const ifcImportPreview = writable(null);
export const ifcComparison = writable(null);
export const unsavedChangesPrompt = writable(null);
export const zoom = writable(0.35);
export const editorPan = writable({ x: 40, y: 30 });

export const THEMES = [
  "spanvision-mono",
  "default",
  "light",
  "dark",
  "blue",
  "amber-navy",
  "warm-ember",
  "highContrast",
];

const savedTheme = (THEMES.includes(getSetting("theme")) ? getSetting("theme") : "spanvision-mono");
document.documentElement.setAttribute("data-theme", savedTheme);
export const theme = writable(savedTheme);

export function setTheme(id) {
  if (!THEMES.includes(id)) return;
  theme.set(id);
  document.documentElement.setAttribute("data-theme", id);
  saveSetting("theme", id);
}

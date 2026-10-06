import { writable, derived, get } from "svelte/store";
import { invoke, isWeb } from "../lib/tauri.js";
import { downloadBytes } from "../lib/browserDownload.js";
import { refreshCustomProfiles } from "./profiles.js";

export const project = writable(null);
export const projectPath = writable(null);
export const isDirty = writable(false);

export const kozijnen = derived(project, ($project) =>
  $project ? $project.kozijnen : []
);

/** Mark the project as modified. Call after any mutation. */
export function markDirty() {
  isDirty.set(true);
}

export async function loadProject() {
  try {
    const p = await invoke("get_project");
    project.set(p);
    return p;
  } catch (e) {
    console.error("Laden project mislukt:", e);
    return null;
  }
}

export async function newProject(name, number) {
  const p = await invoke("new_project", { name, number });
  project.set(p);
  projectPath.set(null);
  isDirty.set(false);
  await refreshCustomProfiles();
  return p;
}

export async function openProject(filePath) {
  let p;
  if (isWeb) {
    if (!(filePath instanceof File)) throw new Error('Choose an actual .ofs project file.');
    if (filePath.size > 64 * 1024 * 1024) throw new Error('Frame projects are limited to 64 MB.');
    const json = new TextDecoder('utf-8', { fatal: true }).decode(await filePath.arrayBuffer());
    p = await invoke("open_project", { json });
  } else { p = await invoke("open_project", { filePath }); }
  project.set(p);
  projectPath.set(isWeb ? filePath.name : filePath);
  isDirty.set(false);
  await refreshCustomProfiles();
  return p;
}

export async function saveProject(filePath) {
  if (isWeb) {
    const json = await invoke("save_project");
    const name = String(filePath || 'project.ofs').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    downloadBytes(name.toLowerCase().endsWith('.ofs') ? name : name + '.ofs', json, 'application/json');
  } else { await invoke("save_project", { filePath }); }
  projectPath.set(filePath);
  isDirty.set(false);
}

export async function refreshProject() {
  return loadProject();
}

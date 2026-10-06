/**
 * Project file actions — New, Open, Save, Save As.
 * Includes unsaved changes protection.
 */
import { get } from "svelte/store";
import { _ } from "svelte-i18n";
import { newProject, openProject, saveProject, projectPath, isDirty, project } from "../stores/project.js";
import { clearHistory } from "../stores/history.js";
import { isTauri } from "./tauri.js";
import { toast } from "../stores/toast.js";
import { chooseBrowserFile } from './browserFile.js';
import { unsavedChangesPrompt } from '../stores/ui.js';
import { currentKozijn, currentGeometry, selectedCellIndex, selectedMember, selectedLayoutLeafId, selectKozijn } from '../stores/kozijn.js';
import { currentVliesgevel } from '../stores/vliesgevel.js';
import { profileEditor } from '../stores/profileEditor.js';
import { hasUnsavedProfile, saveEditorProfile } from './profile-actions.js';

async function getDialogs() {
  if (isTauri) return await import("@tauri-apps/plugin-dialog");
  return {
    open: async () => chooseBrowserFile('.ofs'),
    save: async () => prompt("Project filename:", get(projectPath) || 'project.ofs'),
  };
}

/**
 * Check for unsaved changes and prompt user.
 * Returns true if it's safe to proceed, false if user cancelled.
 */
export async function confirmUnsavedChanges({profileOnly = false} = {}) {
  if (!hasUnsavedProfile() && (profileOnly || !get(isDirty))) return true;

  if (get(unsavedChangesPrompt)) return false;
  return new Promise(resolve => unsavedChangesPrompt.set({ resolve, profileOnly }));
}

async function activateProject(p) {
  currentKozijn.set(null); currentGeometry.set(null); selectedCellIndex.set(null);
  selectedMember.set(null); selectedLayoutLeafId.set(null); currentVliesgevel.set(null);
  profileEditor.newProfile();
  clearHistory();
  if (p.kozijnen[0]) await selectKozijn(p.kozijnen[0].id);
}

export async function fileNew() {
  if (!(await confirmUnsavedChanges())) return false;
  await activateProject(await newProject("New", ""));
  return true;
}

export async function fileOpen() {
  if (!(await confirmUnsavedChanges())) return false;
  const { open } = await getDialogs();
  const path = await open({
    filters: [{ name: "Frame Vision Studio", extensions: ["ofs"] }],
    multiple: false,
  });
  if (path) {
    try {
      await activateProject(await openProject(path));
      return true;
    } catch (error) { toast.error(String(error)); return false; }
  }
  return false;
}

export async function fileSave() {
  let path = get(projectPath);
  if (!path) {
    const { save } = await getDialogs();
    path = isTauri ? await save({
      filters: [{ name: "Frame Vision Studio", extensions: ["ofs"] }],
      defaultPath: "project.ofs",
    }) : (get(project)?.projectInfo?.name || 'project') + '.ofs';
  }
  if (path) {
    try {
      if (hasUnsavedProfile()) await saveEditorProfile();
      await saveProject(path);
      toast.success(isTauri ? get(_)("alert.saved") : 'Project download created.');
      return true;
    } catch (error) { toast.error(String(error)); return false; }
  }
  return false;
}

export async function fileSaveAs() {
  const { save } = await getDialogs();
  const path = await save({
    filters: [{ name: "Frame Vision Studio", extensions: ["ofs"] }],
    defaultPath: "project.ofs",
  });
  if (path) {
    try {
      if (hasUnsavedProfile()) await saveEditorProfile();
      await saveProject(path);
      toast.success(isTauri ? get(_)("alert.saved") : 'Project download created.');
      return true;
    } catch (error) { toast.error(String(error)); return false; }
  }
  return false;
}

import { get } from 'svelte/store';
import { invoke } from './tauri.js';
import { profileEditor, editorIsDirty } from '../stores/profileEditor.js';
import { refreshCustomProfiles } from '../stores/profiles.js';
import { markDirty, refreshProject } from '../stores/project.js';

let pendingSave;
/** Commit the working profile before saving or replacing the project. */
export async function saveEditorProfile() {
  if (pendingSave) return pendingSave;
  pendingSave = (async () => {
    const data = profileEditor.getExportData();
    if (!data.name?.trim()) throw new Error('Enter a profile name before saving.');
    const id = data.id || `custom-${crypto.randomUUID()}`;
    await invoke('add_custom_profile', {profileJson:JSON.stringify({...data,id})});
    await refreshCustomProfiles();
    await refreshProject();
    markDirty();
    profileEditor.update(state => ({...state,isDirty:false,profile:{...state.profile,id}}));
  })();
  try { return await pendingSave; } finally { pendingSave = null; }
}

export function hasUnsavedProfile() { return get(editorIsDirty); }

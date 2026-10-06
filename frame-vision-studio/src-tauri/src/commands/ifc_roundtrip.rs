use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn compare_ifc_files(
    old_path: String,
    new_path: String,
) -> Result<String, String> {
    let old = ofs_core::import::ifc_import::parse_ifc_file(&old_path)?;
    let new = ofs_core::import::ifc_import::parse_ifc_file(&new_path)?;
    let diff = ofs_core::ifc_roundtrip::compare_ifc_imports(&old, &new);
    serde_json::to_string(&diff).map_err(|e| e.to_string())
}

/// Compare IFC explicit dimensions/identities against the current project.
#[tauri::command]
pub fn compare_ifc_roundtrip(state: State<'_, AppState>, file_path: String) -> Result<String, String> {
    let old = ofs_core::import::ifc_import::parse_ifc_file(&file_path)?;
    let project = state.project.lock().map_err(|e| e.to_string())?;
    let diff = ofs_core::ifc_roundtrip::compare_project_to_ifc(&project, old)?;
    serde_json::to_string(&diff).map_err(|e| e.to_string())
}

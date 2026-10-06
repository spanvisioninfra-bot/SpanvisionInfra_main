use crate::state::AppState;
use ofs_core::kozijn::Project;
use tauri::State;

#[tauri::command]
pub fn new_project(
    state: State<'_, AppState>,
    name: String,
    number: String,
) -> Result<Project, String> {
    let project = Project::new(&name, &number);
    let mut current = state.project.lock().map_err(|e| e.to_string())?;
    *current = project.clone();
    let mut path = state.project_path.lock().map_err(|e| e.to_string())?;
    *path = None;
    Ok(project)
}

#[tauri::command]
pub fn get_project(state: State<'_, AppState>) -> Result<Project, String> {
    let project = state.project.lock().map_err(|e| e.to_string())?;
    Ok(project.clone())
}

#[tauri::command]
pub fn open_project(state: State<'_, AppState>, file_path: String) -> Result<Project, String> {
    use std::io::Read;
    let file = std::fs::File::open(&file_path).map_err(|e| e.to_string())?;
    let mut contents = String::new();
    file.take(64 * 1024 * 1024 + 1).read_to_string(&mut contents).map_err(|e| e.to_string())?;
    let project = Project::from_document_json(&contents)?;
    let mut current = state.project.lock().map_err(|e| e.to_string())?;
    *current = project.clone();
    let mut path = state.project_path.lock().map_err(|e| e.to_string())?;
    *path = Some(file_path);
    Ok(project)
}

#[tauri::command]
pub fn save_project(state: State<'_, AppState>, file_path: String) -> Result<(), String> {
    let project = state.project.lock().map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&*project).map_err(|e| e.to_string())?;
    ofs_core::export::write_export_bytes(&file_path, json.as_bytes())?;
    drop(project);
    let mut path = state.project_path.lock().map_err(|e| e.to_string())?;
    *path = Some(file_path);
    Ok(())
}

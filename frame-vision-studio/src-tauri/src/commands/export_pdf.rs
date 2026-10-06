use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn export_kozijnstaat(
    state: State<'_, AppState>,
    output_path: String,
    format: String,
) -> Result<String, String> {
    let project = {
        let project = state.project.lock().map_err(|e| e.to_string())?;
        project.clone()
    };

    match format.as_str() {
        "xlsx" => {
            ofs_core::export::xlsx::generate_kozijnstaat_xlsx(&project, &output_path)?;
        }
        "pdf" => {
            ofs_core::export::pdf::generate_kozijnstaat_pdf(&project, &output_path)?;
        }
        _ => return Err("Choose PDF or Excel for the frame schedule.".into()),
    }

    Ok(output_path)
}

#[tauri::command]
pub async fn export_quotation_pdf(
    state: State<'_, AppState>,
    output_path: String,
) -> Result<String, String> {
    let project = {
        let project = state.project.lock().map_err(|e| e.to_string())?;
        project.clone()
    };

    let bytes = ofs_core::export::pdf_quotation::project_quotation_pdf_bytes(&project)?;
    ofs_core::export::write_export_bytes(&output_path, &bytes)?;

    Ok(output_path)
}

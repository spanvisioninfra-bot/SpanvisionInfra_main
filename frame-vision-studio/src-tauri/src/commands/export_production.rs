use crate::state::AppState;
use ofs_core::export::pdf_labels::LabelConfig;
use tauri::State;

#[tauri::command]
pub async fn export_production_lists(
    state: State<'_, AppState>,
    output_path: String,
    format: String,
) -> Result<String, String> {
    let production_data = {
        let project = state.project.lock().map_err(|e| e.to_string())?;
        ofs_core::export::checked_project_production(&project)?
    };

    match format.as_str() {
        "csv" => {
            ofs_core::export::csv_production::generate_production_csv(
                &production_data,
                &output_path,
            )?;
        }
        "xlsx" => {
            ofs_core::export::xlsx::generate_production_xlsx(
                &production_data,
                &output_path,
            )?;
        }
        "pdf" => {
            ofs_core::export::pdf::generate_production_pdf(
                &production_data,
                &output_path,
            )?;
        }
        _ => return Err("Choose PDF, Excel or CSV for production lists.".into()),
    }

    Ok(output_path)
}

#[tauri::command]
pub fn export_labels_pdf(
    state: State<'_, AppState>,
    output_path: String,
) -> Result<(), String> {
    let project = state.project.lock().map_err(|e| e.to_string())?;
    let config = LabelConfig::default();
    let bytes = ofs_core::export::pdf_labels::generate_labels_pdf(&project, &config)?;
    ofs_core::export::write_export_bytes(&output_path, &bytes)?;
    Ok(())
}

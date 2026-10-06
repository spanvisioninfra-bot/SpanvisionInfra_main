use crate::state::AppState;
use ofs_core::quotation::{Quotation, QuotationStatus};
use tauri::State;

#[tauri::command]
pub fn get_quotations(state: State<'_, AppState>) -> Result<Vec<Quotation>, String> {
    let project = state.project.lock().map_err(|e| e.to_string())?;
    Ok(project.quotations.clone())
}

#[tauri::command]
pub fn create_quotation(
    state: State<'_, AppState>,
    kozijn_marks: Option<Vec<String>>,
    total_incl_btw: Option<f64>,
) -> Result<Quotation, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let quotation = match (kozijn_marks, total_incl_btw) {
        (None, None) => Quotation::from_project(&project)?,
        (Some(marks), Some(total)) => {
            Quotation::validate_amount(total)?;
            if marks.is_empty() || marks.iter().any(|mark| !project.kozijnen.iter().any(|frame| &frame.mark == mark)) {
                return Err("Choose existing project frames before creating a quotation.".into());
            }
            Quotation::new_draft(marks, total)
        }
        _ => return Err("Supply both frame marks and total, or create a reference estimate from the project.".into()),
    };
    project.quotations.push(quotation.clone());
    Ok(quotation)
}

#[tauri::command]
pub fn update_quotation_status(
    state: State<'_, AppState>,
    quotation_id: String,
    status: QuotationStatus,
) -> Result<Quotation, String> {
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let quotation = project
        .quotations
        .iter_mut()
        .find(|q| q.id == quotation_id)
        .ok_or("Quotation not found")?;
    quotation.status = status;
    Ok(quotation.clone())
}

#[tauri::command]
pub fn create_quotation_revision(
    state: State<'_, AppState>,
    quotation_id: String,
    new_total: f64,
    change_description: String,
) -> Result<Quotation, String> {
    Quotation::validate_amount(new_total)?;
    if change_description.trim().is_empty() { return Err("Describe the quotation revision.".into()); }
    let mut project = state.project.lock().map_err(|e| e.to_string())?;
    let original = project
        .quotations
        .iter()
        .find(|q| q.id == quotation_id)
        .ok_or("Quotation not found")?
        .clone();
    if original.version == u32::MAX { return Err("This quotation has reached the maximum revision number.".into()); }
    let revision = original.create_revision(new_total, &change_description);
    project.quotations.push(revision.clone());
    Ok(revision)
}

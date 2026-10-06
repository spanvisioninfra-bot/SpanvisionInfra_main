//! Labels use the same piece identifiers as the cut list and CNC archive.
use crate::kozijn::Project;
use super::pdf_document::{Report, INK, MUTED};

#[derive(Debug, Clone)]
pub struct LabelConfig {
    pub label_width_mm: f32,
    pub label_height_mm: f32,
    pub columns: usize,
    pub rows: usize,
    /// Padding inside each label, in mm.
    pub margin_mm: f32,
}

impl Default for LabelConfig {
    fn default() -> Self { Self { label_width_mm:70.0, label_height_mm:37.0, columns:3, rows:7, margin_mm:5.0 } }
}

pub fn generate_labels_pdf(project: &Project, config: &LabelConfig) -> Result<Vec<u8>, String> {
    let slots = config.columns.checked_mul(config.rows).filter(|n| *n > 0 && *n <= 1000)
        .ok_or("Label columns and rows must be positive, with at most 1,000 labels per sheet.")?;
    let grid_w = config.columns as f32 * config.label_width_mm;
    let grid_h = config.rows as f32 * config.label_height_mm;
    let usable_w = config.label_width_mm - 2.0 * config.margin_mm;
    let usable_h = config.label_height_mm - 2.0 * config.margin_mm;
    if [grid_w,grid_h,usable_w,usable_h,config.margin_mm].iter().any(|v| !v.is_finite()) ||
        config.margin_mm < 0.0 || grid_w > 210.0 || grid_h > 280.0 || usable_w < 40.0 || usable_h < 27.0 {
        return Err("Labels must fit A4 with at least 40 x 27 mm of text space per label and non-negative padding.".into());
    }
    let data = super::checked_project_production(project)?;
    let count: usize = data.iter().flat_map(|p| &p.cut_list).map(|p| p.quantity as usize).sum();
    if count == 0 || count > 100_000 { return Err("Export between 1 and 100,000 production labels per batch.".into()); }
    let mut pdf = Report::new("Production labels",210.0,297.0,5.0)?;
    pdf.ops.clear(); // Label sheets reserve their entire grid for stickers.
    let start_x = (210.0 - grid_w) / 2.0;
    let start_y = 297.0 - (297.0 - grid_h) / 2.0;
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let mut index = 0;
    for prod in &data {
        for piece in &prod.cut_list {
            for _ in 0..piece.quantity {
                if index > 0 && index % slots == 0 { pdf.finish_page(); }
                let slot = index % slots;
                let x = start_x + (slot % config.columns) as f32 * config.label_width_mm + config.margin_mm;
                let top = start_y - (slot / config.columns) as f32 * config.label_height_mm - config.margin_mm;
                let preview = |pdf:&Report, value:&str, size:f32| -> String {
                    let lines = pdf.wrap(value,size,usable_w,false);
                    if lines.len() <= 1 { lines[0].clone() } else {
                        let mut first = lines[0].clone();
                        while !first.is_empty() && pdf.wrap(&format!("{first}..."),size,usable_w,false).len() > 1 { first.pop(); }
                        format!("{first}...")
                    }
                };
                pdf.text(&preview(&pdf,&project.project_info.name,5.0),5.0,x,top-2.0,false,MUTED);
                let id_lines = pdf.wrap(&piece.piece_id,8.0,usable_w,true);
                if id_lines.len() > 2 { return Err("A production piece identifier is too long for this label. Shorten the frame mark or use wider labels.".into()); }
                for (line_index,line) in id_lines.iter().enumerate() {
                    pdf.text(line,8.0,x,top-6.0-line_index as f32*3.5,true,INK);
                }
                let desc = format!("{} | {}",piece.member_type.label_en(),piece.profile_name);
                pdf.text(&preview(&pdf,&desc,6.0),6.0,x,top-13.0,false,INK);
                pdf.text(&format!("Net: {} mm",piece.net_length_mm),6.0,x,top-17.0,false,INK);
                pdf.text(&format!("Gross: {} mm",piece.gross_length_mm),6.0,x,top-21.0,false,INK);
                pdf.text(&format!("{date} | Qty 1"),5.0,x,top-25.0,false,MUTED);
                index += 1;
            }
        }
    }
    pdf.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invalid_label_grids_without_panicking() {
        let mut p = Project::new("Labels", "");
        p.kozijnen.push(crate::kozijn::Kozijn::new("One", "ONE", 1200.0, 1500.0));
        for config in [LabelConfig{columns:0,..Default::default()}, LabelConfig{rows:0,..Default::default()},
            LabelConfig{margin_mm:f32::NAN,..Default::default()}, LabelConfig{label_width_mm:100.0,..Default::default()}] {
            assert!(generate_labels_pdf(&p,&config).is_err());
        }
        assert!(generate_labels_pdf(&Project::new("Empty",""),&Default::default()).is_err());
    }
}

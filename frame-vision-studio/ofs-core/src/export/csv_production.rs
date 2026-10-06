//! CSV production list generation.
//!
//! Generates semicolon-delimited CSV files (UTF-8 BOM) for:
//! cutting, glazing, hardware, gaskets, bill of materials and panels.

use std::io::Write;

use crate::production::ProductionData;

/// Generate CSV production list files in the given output directory.
pub fn generate_production_csv(
    production_data: &[ProductionData],
    output_dir: &str,
) -> Result<(), String> {
    let files = production_csv_files(production_data)?;
    std::fs::create_dir_all(output_dir).map_err(|e| format!("Cannot create export directory: {e}"))?;
    for (name, bytes) in files {
        let path = std::path::Path::new(output_dir).join(name);
        super::write_export_bytes(path.to_str().ok_or("Export path is not UTF-8")?, &bytes)?;
    }

    Ok(())
}

/// The same byte generators serve browser downloads and native files.
pub fn production_csv_files(data: &[ProductionData]) -> Result<Vec<(String, Vec<u8>)>, String> {
    let mut files = vec![("cut-list.csv".into(), write_kortlijst(data)?),
        ("glass-list.csv".into(), write_glaslijst(data)?),
        ("hardware-list.csv".into(), write_beslaglijst(data)?),
        ("gasket-list.csv".into(), write_rubberlijst(data)?),
        ("bill-of-materials.csv".into(), write_stuklijst(data)?)];
    if data.iter().any(|p| !p.panel_list.is_empty()) { files.push(("panel-list.csv".into(), write_paneellijst(data)?)); }
    if data.iter().any(|p| !p.glaslat_list.is_empty()) { files.push(("glazing-bead-list.csv".into(), write_glaslatlijst(data)?)); }
    Ok(files)
}

fn write_row(w: &mut impl Write, fields: &[&str]) -> Result<(), String> {
    let line = fields.iter().map(|field| {
        let trimmed = field.trim_start();
        let safe = if trimmed.starts_with(['=', '+', '-', '@']) && trimmed.parse::<f64>().is_err() {
            format!("'{field}")
        } else { field.to_string() };
        // Delimiters, line breaks and quotes must remain inside one CSV cell.
        format!("\"{}\"", safe.replace('"', "\"\""))
    }).collect::<Vec<_>>().join(";");
    writeln!(w, "{}", line).map_err(|e| e.to_string())
}

fn write_kortlijst(data: &[ProductionData]) -> Result<Vec<u8>, String> {
    let mut w = b"\xEF\xBB\xBF".to_vec();
    write_row(
        &mut w,
        &[
            "Frame", "Position", "Member", "Profile", "Material",
            "Net_mm", "Gross_mm", "Angle_left_deg", "Angle_right_deg", "Quantity",
        ],
    )?;
    for prod in data {
        for item in &prod.cut_list {
            write_row(
                &mut w,
                &[
                    &prod.kozijn_mark,
                    &item.piece_id,
                    item.member_type.label_en(),
                    &item.profile_name,
                    &item.material,
                    &format!("{}", item.net_length_mm),
                    &format!("{}", item.gross_length_mm),
                    &format!("{}", item.miter_left_deg),
                    &format!("{}", item.miter_right_deg),
                    &format!("{}", item.quantity),
                ],
            )?;
        }
    }
    Ok(w)
}

fn write_glaslijst(data: &[ProductionData]) -> Result<Vec<u8>, String> {
    let mut w = b"\xEF\xBB\xBF".to_vec();
    write_row(
        &mut w,
        &[
            "Frame", "Position", "Glass_type", "Width_mm", "Height_mm",
            "Thickness_mm", "Ug_W_m2K", "Area_m2", "Quantity",
        ],
    )?;
    for prod in data {
        for item in &prod.glass_list {
            write_row(
                &mut w,
                &[
                    &prod.kozijn_mark,
                    &item.piece_id,
                    &item.glass_type,
                    &format!("{}", item.width_mm),
                    &format!("{}", item.height_mm),
                    &format!("{}", item.thickness_mm),
                    &item.ug_value.to_string(),
                    &item.area_m2.to_string(),
                    &format!("{}", item.quantity),
                ],
            )?;
        }
    }
    Ok(w)
}

fn write_beslaglijst(data: &[ProductionData]) -> Result<Vec<u8>, String> {
    let mut w = b"\xEF\xBB\xBF".to_vec();
    write_row(&mut w, &["Frame", "Cell", "Component", "Description", "Quantity"])?;
    for prod in data {
        for item in &prod.hardware_list {
            write_row(
                &mut w,
                &[
                    &prod.kozijn_mark,
                    &format!("{}", item.cell_index + 1),
                    &item.component,
                    &item.description,
                    &format!("{}", item.quantity),
                ],
            )?;
        }
    }
    Ok(w)
}

fn write_rubberlijst(data: &[ProductionData]) -> Result<Vec<u8>, String> {
    let mut w = b"\xEF\xBB\xBF".to_vec();
    write_row(&mut w, &["Frame", "Type", "Length_mm", "Quantity"])?;
    for prod in data {
        for item in &prod.gasket_list {
            write_row(
                &mut w,
                &[
                    &prod.kozijn_mark,
                    item.gasket_type.label_en(),
                    &format!("{}", item.length_mm),
                    &format!("{}", item.quantity),
                ],
            )?;
        }
    }
    Ok(w)
}

fn write_stuklijst(data: &[ProductionData]) -> Result<Vec<u8>, String> {
    let mut w = b"\xEF\xBB\xBF".to_vec();
    write_row(
        &mut w,
        &["Frame", "Category", "Description", "Unit", "Quantity"],
    )?;
    for prod in data {
        for item in &prod.bom {
            write_row(
                &mut w,
                &[
                    &prod.kozijn_mark,
                    &item.category,
                    &item.description,
                    &item.unit,
                    &item.quantity.to_string(),
                ],
            )?;
        }
    }
    Ok(w)
}

fn write_paneellijst(data: &[ProductionData]) -> Result<Vec<u8>, String> {
    let mut w = b"\xEF\xBB\xBF".to_vec();
    write_row(
        &mut w,
        &["Frame", "Position", "Width_mm", "Height_mm", "Type", "Quantity"],
    )?;
    for prod in data {
        for item in &prod.panel_list {
            write_row(
                &mut w,
                &[
                    &prod.kozijn_mark,
                    &item.piece_id,
                    &format!("{}", item.width_mm),
                    &format!("{}", item.height_mm),
                    &item.panel_type,
                    &format!("{}", item.quantity),
                ],
            )?;
        }
    }
    Ok(w)
}

fn write_glaslatlijst(data: &[ProductionData]) -> Result<Vec<u8>, String> {
    let mut w = b"\xEF\xBB\xBF".to_vec();
    write_row(&mut w, &["Frame","Position","Cell","Side","Material","Width_mm","Height_mm","Cut_length_mm","Mitred","Quantity"])?;
    for prod in data {
        for item in &prod.glaslat_list {
            write_row(&mut w, &[&prod.kozijn_mark,&item.piece_id,&(item.cell_index+1).to_string(),
                &item.position,&item.material,&item.width_mm.to_string(),&item.height_mm.to_string(),
                &item.total_length_mm.to_string(),if item.mitered {"Yes"}else{"No"},&item.quantity.to_string()])?;
        }
    }
    Ok(w)
}

#[cfg(test)]
mod tests {
    #[test]
    fn fields_keep_quotes_delimiters_and_newlines_and_neutralize_formulas() {
        let mut bytes = Vec::new();
        super::write_row(&mut bytes, &["frame;one", "A\"B\nC", "=1+1", "-45", " +SUM(A1)"]).unwrap();
        assert_eq!(String::from_utf8(bytes).unwrap(), "\"frame;one\";\"A\"\"B\nC\";\"'=1+1\";\"-45\";\"' +SUM(A1)\"\n");
    }
    #[test]
    fn production_files_include_real_cut_lengths_and_utf8_headers() {
        let frame = crate::kozijn::Kozijn::new("CSV check", "CSV-01", 900.0, 2100.0);
        let data = crate::production::compute_production_data(&frame);
        let files = super::production_csv_files(&[data]).unwrap();
        assert_eq!(files.len(), 5);
        let cut = String::from_utf8(files[0].1.clone()).unwrap();
        assert!(cut.starts_with("\u{feff}\"Frame\";\"Position\""));
        assert!(cut.contains("\"Frame top\""));
        assert!(cut.contains("\"CSV-01\""));
        // Default timber rails run through; the jambs fit between 67 mm rails.
        assert!(cut.contains("\"1966\""));
        assert!(cut.contains("\"900\""));
    }
    #[test]
    fn fractional_cut_lengths_and_bead_pieces_survive_csv_export() {
        let mut frame = crate::kozijn::Kozijn::new("Fractional dimensions", "FRAC", 900.25, 2100.5);
        frame.cells[0].glaslat = Some(Default::default());
        let files = super::production_csv_files(&[crate::production::compute_production_data(&frame)]).unwrap();
        let cut = String::from_utf8(files[0].1.clone()).unwrap();
        assert!(cut.contains("\"900.25\""));
        assert!(cut.contains("\"1966.5\""));
        let beads = files.iter().find(|(name,_)|name=="glazing-bead-list.csv").unwrap();
        assert!(String::from_utf8(beads.1.clone()).unwrap().contains("\"Inside\""));
    }
}

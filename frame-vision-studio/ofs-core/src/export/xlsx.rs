//! Excel (.xlsx) export for kozijnstaat and production lists.

use rust_xlsxwriter::{Format, FormatAlign, FormatBorder, Color, Workbook};

use crate::kozijn::Project;
use crate::production::ProductionData;

const DEEP_FORGE: u32 = 0x36363E;
const ALT_BG: u32 = 0xF9FAFB;
const BORDER_COLOR: u32 = 0xE5E7EB;

fn header_format() -> Format {
    Format::new()
        .set_bold()
        .set_font_name("Calibri")
        .set_font_size(9.0)
        .set_text_wrap()
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(DEEP_FORGE))
        .set_align(FormatAlign::Center)
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(BORDER_COLOR))
}

fn data_format(alt: bool) -> Format {
    let mut f = Format::new()
        .set_font_name("Calibri")
        .set_font_size(9.0)
        .set_text_wrap()
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(BORDER_COLOR));
    if alt {
        f = f.set_background_color(Color::RGB(ALT_BG));
    }
    f
}

fn data_format_center(alt: bool) -> Format {
    data_format(alt).set_align(FormatAlign::Center)
}

// ── Kozijnstaat (window schedule) ──────────────────────────────

pub fn generate_kozijnstaat_xlsx(project: &Project, output_path: &str) -> Result<(), String> {
    super::write_export_bytes(output_path, &kozijnstaat_xlsx_bytes(project)?)
}

pub fn kozijnstaat_xlsx_bytes(project: &Project) -> Result<Vec<u8>, String> {
    if project.kozijnen.is_empty() { return Err("Add a frame before exporting its schedule.".into()); }
    let mut wb = Workbook::new();
    let ws = wb.add_worksheet();
    ws.set_name("Frame schedule").map_err(|e| e.to_string())?;

    let hfmt = header_format();

    let headers = [
        "Mark",
        "Name",
        "Width (mm)",
        "Height (mm)",
        "Material",
        "Columns",
        "Rows",
        "Cells",
        "Panel types",
        "Glazing",
        "Inside colour",
        "Outside colour",
    ];

    for (col, header) in headers.iter().enumerate() {
        ws.write_string_with_format(0, col as u16, *header, &hfmt)
            .map_err(|e| e.to_string())?;
    }

    for (row_idx, kozijn) in project.kozijnen.iter().enumerate() {
        let row = (row_idx + 1) as u32;
        let alt = row % 2 == 0;
        let dfmt = data_format(alt);
        let dfmt_c = data_format_center(alt);

        let frame = &kozijn.frame;
        let cells = &kozijn.cells;
        let grid = &kozijn.grid;

        // Panel type summary
        let mut type_counts: std::collections::BTreeMap<&str, usize> =
            std::collections::BTreeMap::new();
        for cell in cells {
            let label = cell.panel_type.label_en();
            *type_counts.entry(label).or_insert(0) += 1;
        }
        let type_summary: Vec<String> = type_counts
            .iter()
            .map(|(k, v)| format!("{}x {}", v, k))
            .collect();
        let type_str = type_summary.join(", ");

        let mat_label = super::pdf::material_label(&frame.material);

        let glaz_label = cells.iter().filter(|c| c.panel_type != crate::kozijn::PanelType::Panel)
            .map(|c| format!("{} {} mm", c.glazing.glass_type, c.glazing.thickness_mm))
            .collect::<std::collections::BTreeSet<_>>().into_iter().collect::<Vec<_>>().join(", ");

        ws.write_string_with_format(row, 0, &kozijn.mark, &dfmt)
            .map_err(|e| e.to_string())?;
        ws.write_string_with_format(row, 1, &kozijn.name, &dfmt)
            .map_err(|e| e.to_string())?;
        ws.write_number_with_format(row, 2, frame.outer_width as f64, &dfmt_c)
            .map_err(|e| e.to_string())?;
        ws.write_number_with_format(row, 3, frame.outer_height as f64, &dfmt_c)
            .map_err(|e| e.to_string())?;
        ws.write_string_with_format(row, 4, &mat_label, &dfmt)
            .map_err(|e| e.to_string())?;
        ws.write_number_with_format(row, 5, grid.columns.len() as f64, &dfmt_c)
            .map_err(|e| e.to_string())?;
        ws.write_number_with_format(row, 6, grid.rows.len() as f64, &dfmt_c)
            .map_err(|e| e.to_string())?;
        ws.write_number_with_format(row, 7, cells.len() as f64, &dfmt_c)
            .map_err(|e| e.to_string())?;
        ws.write_string_with_format(row, 8, &type_str, &dfmt)
            .map_err(|e| e.to_string())?;
        ws.write_string_with_format(row, 9, &glaz_label, &dfmt)
            .map_err(|e| e.to_string())?;
        ws.write_string_with_format(row, 10, &frame.color_inside, &dfmt)
            .map_err(|e| e.to_string())?;
        ws.write_string_with_format(row, 11, &frame.color_outside, &dfmt)
            .map_err(|e| e.to_string())?;
    }

    // Set column widths
    let widths = [10.0, 15.0, 12.0, 12.0, 15.0, 10.0, 10.0, 10.0, 25.0, 15.0, 12.0, 12.0];
    for (col, w) in widths.iter().enumerate() {
        ws.set_column_width(col as u16, *w)
            .map_err(|e| e.to_string())?;
    }

    wb.save_to_buffer().map_err(|e| format!("Cannot generate Excel workbook: {e}"))
}

// ── Production lists XLSX ──────────────────────────────────────

pub fn generate_production_xlsx(production_data: &[ProductionData], output_path: &str) -> Result<(), String> {
    super::write_export_bytes(output_path, &production_xlsx_bytes(production_data)?)
}

pub fn production_xlsx_bytes(production_data: &[ProductionData]) -> Result<Vec<u8>, String> {
    if production_data.is_empty() { return Err("Add a frame before exporting production lists.".into()); }
    let mut wb = Workbook::new();
    let hfmt = header_format();

    // Kortlijst
    {
        let ws = wb.add_worksheet();
        ws.set_name("Cut list").map_err(|e| e.to_string())?;
        let headers = [
            "Frame", "Pos.", "Member", "Profile", "Material",
            "Net (mm)", "Gross (mm)", "Left angle (deg)", "Right angle (deg)", "Quantity",
        ];
        write_headers(ws, &headers, &hfmt)?;

        let mut row = 1u32;
        for prod in production_data {
            for item in &prod.cut_list {
                let alt = row % 2 == 0;
                let df = data_format(alt);
                let dfc = data_format_center(alt);

                ws.write_string_with_format(row, 0, &prod.kozijn_mark, &df).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 1, &item.piece_id, &df).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 2, item.member_type.label_en(), &df).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 3, &item.profile_name, &df).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 4, &item.material, &df).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 5, item.net_length_mm, &dfc).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 6, item.gross_length_mm, &dfc).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 7, item.miter_left_deg, &dfc).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 8, item.miter_right_deg, &dfc).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 9, item.quantity as f64, &dfc).map_err(|e| e.to_string())?;
                row += 1;
            }
        }
        autofit_widths(ws, &headers, row)?;
    }

    // Glaslijst
    {
        let ws = wb.add_worksheet();
        ws.set_name("Glass list").map_err(|e| e.to_string())?;
        let headers = [
            "Frame", "Pos.", "Glass type", "Width (mm)", "Height (mm)", "Thickness (mm)", "Ug", "Area (m2)", "Quantity",
        ];
        write_headers(ws, &headers, &hfmt)?;

        let mut row = 1u32;
        for prod in production_data {
            for item in &prod.glass_list {
                let alt = row % 2 == 0;
                let df = data_format(alt);
                let dfc = data_format_center(alt);

                ws.write_string_with_format(row, 0, &prod.kozijn_mark, &df).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 1, &item.piece_id, &df).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 2, &item.glass_type, &df).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 3, item.width_mm, &dfc).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 4, item.height_mm, &dfc).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 5, item.thickness_mm, &dfc).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 6, item.ug_value, &dfc).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 7, item.area_m2, &dfc).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 8, item.quantity as f64, &dfc).map_err(|e| e.to_string())?;
                row += 1;
            }
        }
        autofit_widths(ws, &headers, row)?;
    }

    // Beslaglijst
    {
        let ws = wb.add_worksheet();
        ws.set_name("Hardware list").map_err(|e| e.to_string())?;
        let headers = ["Frame", "Cell", "Component", "Description", "Quantity"];
        write_headers(ws, &headers, &hfmt)?;

        let mut row = 1u32;
        for prod in production_data {
            for item in &prod.hardware_list {
                let alt = row % 2 == 0;
                let df = data_format(alt);
                let dfc = data_format_center(alt);

                ws.write_string_with_format(row, 0, &prod.kozijn_mark, &df).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 1, (item.cell_index + 1) as f64, &dfc).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 2, &item.component, &df).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 3, &item.description, &df).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 4, item.quantity as f64, &dfc).map_err(|e| e.to_string())?;
                row += 1;
            }
        }
        autofit_widths(ws, &headers, row)?;
    }

    // Rubberlijst
    {
        let ws = wb.add_worksheet();
        ws.set_name("Gasket list").map_err(|e| e.to_string())?;
        let headers = ["Frame", "Type", "Length (mm)", "Quantity"];
        write_headers(ws, &headers, &hfmt)?;

        let mut row = 1u32;
        for prod in production_data {
            for item in &prod.gasket_list {
                let alt = row % 2 == 0;
                let df = data_format(alt);
                let dfc = data_format_center(alt);

                ws.write_string_with_format(row, 0, &prod.kozijn_mark, &df).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 1, item.gasket_type.label_en(), &df).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 2, item.length_mm, &dfc).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 3, item.quantity as f64, &dfc).map_err(|e| e.to_string())?;
                row += 1;
            }
        }
        autofit_widths(ws, &headers, row)?;
    }

    // Paneellijst (only if data exists)
    let has_panels = production_data.iter().any(|p| !p.panel_list.is_empty());
    if has_panels {
        let ws = wb.add_worksheet();
        ws.set_name("Panel list").map_err(|e| e.to_string())?;
        let headers = ["Frame", "Pos.", "Width (mm)", "Height (mm)", "Type", "Quantity"];
        write_headers(ws, &headers, &hfmt)?;

        let mut row = 1u32;
        for prod in production_data {
            for item in &prod.panel_list {
                let alt = row % 2 == 0;
                let df = data_format(alt);
                let dfc = data_format_center(alt);

                ws.write_string_with_format(row, 0, &prod.kozijn_mark, &df).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 1, &item.piece_id, &df).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 2, item.width_mm, &dfc).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 3, item.height_mm, &dfc).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 4, &item.panel_type, &df).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 5, item.quantity as f64, &dfc).map_err(|e| e.to_string())?;
                row += 1;
            }
        }
        autofit_widths(ws, &headers, row)?;
    }

    // Glazing beads are physical production pieces, not just BOM totals.
    if production_data.iter().any(|p| !p.glaslat_list.is_empty()) {
        let ws = wb.add_worksheet();
        ws.set_name("Glazing bead list").map_err(|e| e.to_string())?;
        let headers = ["Frame","Position","Cell","Side","Material","Width (mm)","Height (mm)","Cut length (mm)","Mitred","Quantity"];
        write_headers(ws,&headers,&hfmt)?;
        let mut row = 1u32;
        for prod in production_data {
            for item in &prod.glaslat_list {
                let df = data_format(row % 2 == 0);
                let dc = data_format_center(row % 2 == 0);
                for (col,value) in [&prod.kozijn_mark,&item.piece_id,&item.position,&item.material].iter().enumerate() {
                    let column = [0,1,3,4][col];
                    ws.write_string_with_format(row,column,*value,&df).map_err(|e|e.to_string())?;
                }
                for (column,value) in [(2,(item.cell_index+1) as f64),(5,item.width_mm),(6,item.height_mm),(7,item.total_length_mm),(9,item.quantity as f64)] {
                    ws.write_number_with_format(row,column,value,&dc).map_err(|e|e.to_string())?;
                }
                ws.write_string_with_format(row,8,if item.mitered {"Yes"}else{"No"},&df).map_err(|e|e.to_string())?;
                row += 1;
            }
        }
        autofit_widths(ws,&headers,row)?;
    }

    // Stuklijst
    {
        let ws = wb.add_worksheet();
        ws.set_name("Bill of materials").map_err(|e| e.to_string())?;
        let headers = ["Frame", "Category", "Description", "Unit", "Quantity"];
        write_headers(ws, &headers, &hfmt)?;

        let mut row = 1u32;
        for prod in production_data {
            for item in &prod.bom {
                let alt = row % 2 == 0;
                let df = data_format(alt);
                let dfc = data_format_center(alt);

                ws.write_string_with_format(row, 0, &prod.kozijn_mark, &df).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 1, &item.category, &df).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 2, &item.description, &df).map_err(|e| e.to_string())?;
                ws.write_string_with_format(row, 3, &item.unit, &df).map_err(|e| e.to_string())?;
                ws.write_number_with_format(row, 4, item.quantity, &dfc).map_err(|e| e.to_string())?;
                row += 1;
            }
        }
        autofit_widths(ws, &headers, row)?;
    }

    wb.save_to_buffer().map_err(|e| format!("Cannot generate Excel workbook: {e}"))
}

fn write_headers(
    ws: &mut rust_xlsxwriter::Worksheet,
    headers: &[&str],
    fmt: &Format,
) -> Result<(), String> {
    for (col, header) in headers.iter().enumerate() {
        ws.write_string_with_format(0, col as u16, *header, fmt)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn autofit_widths(
    ws: &mut rust_xlsxwriter::Worksheet,
    headers: &[&str],
    _row_count: u32,
) -> Result<(), String> {
    for (col, header) in headers.iter().enumerate() {
        let w = (header.len() as f64 + 3.0).min(30.0).max(8.0);
        ws.set_column_width(col as u16, w)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

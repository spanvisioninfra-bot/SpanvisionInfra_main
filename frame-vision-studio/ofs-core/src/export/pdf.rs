//! Actual, paginated schedules and production documents shared by both apps.
use crate::kozijn::{Kozijn, Material, Project, WoodType};
use crate::production::ProductionData;
use super::pdf_document::{Report, INK, MUTED};

pub fn generate_kozijnstaat_pdf(project: &Project, path: &str) -> Result<(), String> {
    super::write_export_bytes(path, &kozijnstaat_pdf_bytes(project)?)
}

pub fn kozijnstaat_pdf_bytes(project: &Project) -> Result<Vec<u8>, String> {
    if project.kozijnen.is_empty() { return Err("Add a frame before exporting its schedule.".into()); }
    let mut pdf = Report::new("Frame schedule", 297.0, 210.0, 12.0)?;
    pdf.paragraph(&format!("Project: {} | Number: {} | Client: {}", project.project_info.name,
        project.project_info.number, project.project_info.client), 9.0, false);
    pdf.y -= 4.0;
    let rows = project.kozijnen.iter().map(|k| {
        let mut types = std::collections::BTreeMap::new();
        let mut glass = std::collections::BTreeSet::new();
        for cell in &k.cells {
            *types.entry(cell.panel_type.label_en()).or_insert(0) += 1;
            if cell.panel_type != crate::kozijn::PanelType::Panel {
                glass.insert(format!("{} {} mm", cell.glazing.glass_type, cell.glazing.thickness_mm));
            }
        }
        vec![k.mark.clone(), k.name.clone(), k.frame.outer_width.to_string(),
            k.frame.outer_height.to_string(), material_label(&k.frame.material),
            k.grid.columns.len().to_string(), k.grid.rows.len().to_string(), k.cells.len().to_string(),
            types.iter().map(|(t,n)| format!("{n} x {t}")).collect::<Vec<_>>().join(", "),
            glass.into_iter().collect::<Vec<_>>().join(", "), k.frame.color_inside.clone(), k.frame.color_outside.clone()]
    }).collect::<Vec<_>>();
    pdf.table("Frames (dimensions in mm)", &["Mark","Name","Width","Height","Material","Columns","Rows","Cells","Panel types","Glazing","Inside","Outside"],
        &[16.0,32.0,18.0,18.0,26.0,14.0,12.0,12.0,42.0,43.0,20.0,20.0], &rows);
    pdf.finish()
}

pub fn generate_workshop_pdf(k: &Kozijn, project: &Project, path: &str) -> Result<(), String> {
    super::write_export_bytes(path, &workshop_pdf_bytes(k, project)?)
}

pub fn workshop_pdf_bytes(k: &Kozijn, project: &Project) -> Result<Vec<u8>, String> {
    super::ifc::validate_ifc_export(k, super::ifc::LodLevel::Lod300)?;
    if k.frame.outer_width > 1_000_000.0 || k.frame.outer_height > 1_000_000.0 {
        return Err("Workshop dimensions exceed the supported drawing range of 1,000,000 mm.".into());
    }
    if k.layout.is_some() || !k.extensions.is_empty() {
        return Err("Workshop PDF currently supports rectangular grid frames without extensions. Export IFC to share other modeled layouts.".into());
    }
    let mut pdf = Report::new("Workshop drawing", 420.0, 297.0, 15.0)?;
    pdf.paragraph(&format!("Project: {} | Frame: {} - {}", project.project_info.name, k.mark, k.name), 10.0, false);
    pdf.paragraph(&format!("{} x {} mm | {} | Depth {} mm", k.frame.outer_width,
        k.frame.outer_height, material_label(&k.frame.material), k.frame.frame_depth), 9.0, false);
    let ow = k.frame.outer_width as f32;
    let oh = k.frame.outer_height as f32;
    // Reserve a right-hand band for dimension text, including large values.
    let available_w = 310.0;
    let available_h = pdf.y - 65.0;
    if available_h < 40.0 { return Err("Project and frame descriptions are too long for one workshop sheet.".into()); }
    let scale = (available_w / ow).min(available_h / oh);
    let ox = (420.0 - 60.0 - ow * scale) / 2.0;
    let oy = 45.0;
    let sx = |x: f64| ox + x as f32 * scale;
    let sy = |y: f64| oy + y as f32 * scale;
    let geo = crate::geometry::compute_2d_geometry(k);
    if geo.frame_polygons.is_empty() {
        for rect in &geo.frame_rects { pdf.rect(sx(rect.x), sy(rect.y), rect.width as f32 * scale,
            rect.height as f32 * scale, (0.82,0.84,0.86)); }
    } else {
        use printpdf::*;
        for ring in &geo.frame_polygons {
            pdf.ops.extend([Op::SetFillColor { col: super::pdf_document::color((0.82,0.84,0.86)) },
                Op::DrawPolygon { polygon: Polygon { rings: vec![PolygonRing { points: ring.iter().map(|p|
                    LinePoint { p: Point { x: Mm(sx(p[0])).into(), y: Mm(sy(p[1])).into() }, bezier: false }).collect() }],
                    mode: PaintMode::FillStroke, winding_order: WindingOrder::NonZero } }]);
        }
    }
    for rect in geo.h_dividers.iter().chain(&geo.v_dividers) {
        pdf.rect(sx(rect.x), sy(rect.y), rect.width as f32 * scale, rect.height as f32 * scale, (0.82,0.84,0.86));
    }
    for cell in &geo.cell_rects {
        let r = &cell.rect;
        pdf.line(sx(r.x),sy(r.y),sx(r.x+r.width),sy(r.y),0.4);
        pdf.line(sx(r.x+r.width),sy(r.y),sx(r.x+r.width),sy(r.y+r.height),0.4);
        pdf.line(sx(r.x+r.width),sy(r.y+r.height),sx(r.x),sy(r.y+r.height),0.4);
        pdf.line(sx(r.x),sy(r.y+r.height),sx(r.x),sy(r.y),0.4);
        pdf.text(&format!("Cell {}",cell.cell_index+1),8.0,sx(r.x+r.width/2.0)-8.0,sy(r.y+r.height/2.0),false,INK);
    }
    // Print the actual scale rather than an inaccurate rounded standard scale.
    pdf.line(ox,oy-10.0,ox+ow*scale,oy-10.0,0.5);
    for x in [ox,ox+ow*scale] { pdf.line(x,oy-7.0,x,oy-13.0,0.5); }
    pdf.text(&format!("{} mm",k.frame.outer_width),9.0,ox+ow*scale/2.0-10.0,oy-17.0,false,INK);
    let xd = ox+ow*scale+12.0;
    pdf.line(xd,oy,xd,oy+oh*scale,0.5);
    for y in [oy,oy+oh*scale] { pdf.line(xd-3.0,y,xd+3.0,y,0.5); }
    pdf.text(&format!("{} mm",k.frame.outer_height),9.0,xd+4.0,oy+oh*scale/2.0,false,INK);
    pdf.text(&format!("Drawing scale 1:{:.3} | Dimensions in mm | Print at 100%",1.0/scale),8.0,15.0,16.0,false,MUTED);
    pdf.finish()
}

pub fn generate_production_pdf(data: &[ProductionData], path: &str) -> Result<(), String> {
    super::write_export_bytes(path, &production_pdf_bytes(data)?)
}

pub fn production_pdf_bytes(data: &[ProductionData]) -> Result<Vec<u8>, String> {
    if data.is_empty() { return Err("Add a frame before exporting production lists.".into()); }
    let mut pdf = Report::new("Production lists",297.0,210.0,12.0)?;
    for (i, prod) in data.iter().enumerate() {
        if i > 0 { pdf.new_page(); }
        pdf.paragraph(&format!("Frame: {} - {} | Dimensions in mm",prod.kozijn_mark,prod.kozijn_name),10.0,true);
        pdf.y -= 4.0;
        let rows = prod.cut_list.iter().map(|p| vec![p.piece_id.clone(),p.member_type.label_en().into(),
            p.profile_name.clone(),p.material.clone(),p.net_length_mm.to_string(),p.gross_length_mm.to_string(),
            p.miter_left_deg.to_string(),p.miter_right_deg.to_string(),p.quantity.to_string()]).collect::<Vec<_>>();
        pdf.table("Cut list", &["Position","Member","Profile","Material","Net mm","Gross mm","Left deg","Right deg","Qty"],
            &[26.0,35.0,55.0,35.0,28.0,28.0,22.0,22.0,22.0], &rows);
        let rows = prod.glass_list.iter().map(|p| vec![p.piece_id.clone(),p.glass_type.clone(),p.width_mm.to_string(),
            p.height_mm.to_string(),p.thickness_mm.to_string(),p.ug_value.to_string(),format!("{:.4}",p.area_m2),p.quantity.to_string()]).collect::<Vec<_>>();
        pdf.table("Glass list", &["Position","Type","Width mm","Height mm","Thickness mm","Ug W/m2K","Area m2","Qty"],
            &[35.0,55.0,32.0,32.0,35.0,32.0,28.0,24.0], &rows);
        let rows = prod.hardware_list.iter().map(|p| vec![(p.cell_index+1).to_string(),p.component.clone(),p.description.clone(),p.quantity.to_string()]).collect::<Vec<_>>();
        pdf.table("Hardware list", &["Cell","Component","Description","Qty"], &[24.0,65.0,160.0,24.0], &rows);
        let rows = prod.gasket_list.iter().map(|p| vec![p.gasket_type.label_en().into(),p.length_mm.to_string(),p.quantity.to_string()]).collect::<Vec<_>>();
        pdf.table("Gasket list", &["Type","Length mm","Qty"], &[160.0,85.0,28.0], &rows);
        let rows = prod.panel_list.iter().map(|p| vec![p.piece_id.clone(),p.width_mm.to_string(),p.height_mm.to_string(),p.panel_type.clone(),p.quantity.to_string()]).collect::<Vec<_>>();
        pdf.table("Panel list", &["Position","Width mm","Height mm","Type","Qty"], &[45.0,35.0,35.0,130.0,28.0], &rows);
        let rows = prod.glaslat_list.iter().map(|p| vec![p.piece_id.clone(),(p.cell_index+1).to_string(),p.position.clone(),p.material.clone(),
            p.width_mm.to_string(),p.height_mm.to_string(),p.total_length_mm.to_string(),if p.mitered {"Yes"}else{"No"}.into(),p.quantity.to_string()]).collect::<Vec<_>>();
        pdf.table("Glazing bead list", &["Position","Cell","Side","Material","Width mm","Height mm","Cut length mm","Mitred","Qty"],
            &[40.0,18.0,28.0,60.0,28.0,28.0,33.0,20.0,18.0], &rows);
        let rows = prod.bom.iter().map(|p| vec![p.category.clone(),p.description.clone(),p.unit.clone(),format!("{:.4}",p.quantity)]).collect::<Vec<_>>();
        pdf.table("Bill of materials", &["Category","Description","Unit","Quantity"], &[50.0,170.0,25.0,28.0], &rows);
    }
    pdf.finish()
}

pub(super) fn material_label(m: &Material) -> String {
    match m {
        Material::Wood(w) => format!("Wood ({})",match w { WoodType::Meranti=>"Meranti",WoodType::Accoya=>"Accoya",WoodType::Vuren=>"Spruce",WoodType::Eiken=>"Oak" }),
        Material::Aluminum=>"Aluminium".into(),Material::Pvc=>"PVC".into(),Material::WoodAluminum=>"Wood-aluminium".into(),
    }
}

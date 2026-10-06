//! Deterministic fixtures for independent PDF/XLSX content and rendering QA.
use ofs_core::{kozijn::{Kozijn, Project, PanelType}, production::compute_production_data, export};

fn main() -> Result<(), String> {
    let destination = std::env::args().nth(1).ok_or("Pass a QA output directory")?;
    std::fs::create_dir_all(&destination).map_err(|e|e.to_string())?;
    let write = |name:&str,bytes:&[u8]| export::write_export_bytes(
        &std::path::Path::new(&destination).join(name).to_string_lossy(),bytes);
    let mut project = Project::new("Café façade - Ελληνικά - Кириллица", "QA-EXPORT-2026");
    project.project_info.client = "Export verification client".into();
    for i in 1..=78 {
        let mut frame = Kozijn::new(&format!("Long façade description Café façade row {i:03}"),&format!("Q{i:03}"),1200.25,1500.5);
        frame.cells[0].panel_type = PanelType::TurnTilt;
        frame.cells[0].glaslat = Some(Default::default());
        frame.cells[0].hardware_set = ofs_core::hardware::default_hardware_set(PanelType::TurnTilt,
            None,1066.25,1366.5,24.0,&frame.frame.material,Default::default());
        project.kozijnen.push(frame);
    }
    write("schedule-long.pdf",&export::pdf::kozijnstaat_pdf_bytes(&project)?)?;
    write("schedule-long.xlsx",&export::xlsx::kozijnstaat_xlsx_bytes(&project)?)?;
    let first = &project.kozijnen[0];
    write("workshop.pdf",&export::pdf::workshop_pdf_bytes(first,&project)?)?;
    let wide = Kozijn::new("Wide drawing", "WIDE", 120000.25,10000.5);
    write("workshop-wide.pdf",&export::pdf::workshop_pdf_bytes(&wide,&project)?)?;
    let mut prod = compute_production_data(first);
    let seed = prod.cut_list[0].clone();
    prod.cut_list = (1..=90).map(|i| {
        let mut piece = seed.clone(); piece.piece_id = format!("CUT-{i:03}");
        piece.profile_name = format!("Profile Café façade unique {i:03}"); piece
    }).collect();
    write("production-long.pdf",&export::pdf::production_pdf_bytes(&[prod.clone()])?)?;
    write("production-long.xlsx",&export::xlsx::production_xlsx_bytes(&[prod])?)?;
    let mut panel_frame = first.clone();
    panel_frame.mark = "PANEL-01".into();
    panel_frame.name = "Actual sandwich panel fixture".into();
    panel_frame.cells[0].panel_type = PanelType::Panel;
    panel_frame.cells[0].hardware_set = None;
    panel_frame.cells[0].panel_filling = Some(Default::default());
    let panel_data = compute_production_data(&panel_frame);
    assert_eq!(panel_data.panel_list.len(),1);
    write("panel-production.pdf",&export::pdf::production_pdf_bytes(&[panel_data.clone()])?)?;
    write("panel-production.xlsx",&export::xlsx::production_xlsx_bytes(&[panel_data])?)?;
    let prices = project.kozijnen.iter().map(|k|(k.mark.clone(),100.25)).collect::<Vec<_>>();
    let company = export::pdf_quotation::CompanyInfo {name:"Spanvision Infra".into(),address:"QA office".into(),phone:"QA".into(),email:"QA".into(),kvk:"QA".into(),btw_id:"QA".into()};
    let totals = ofs_core::pricing::PricingConfig {btw_percentage:18.0,..Default::default()}.calculate(78.0*100.25);
    let terms = (1..=70).map(|i|format!("TERM-{i:03}: Every supplied term remains in the exported document.")).collect::<Vec<_>>().join("\n");
    write("estimate-long.pdf",&export::pdf_quotation::generate_quotation_pdf(&project,&company,&prices,&totals,&terms)?)?;
    let mut label_project = project.clone(); label_project.kozijnen.truncate(8);
    write("labels.pdf",&export::pdf_labels::generate_labels_pdf(&label_project,&Default::default())?)?;
    write("project.ofs",serde_json::to_string_pretty(&project).map_err(|e|e.to_string())?.as_bytes())?;
    println!("Generated actual export fixtures with 78 frames, 90 cut rows and 70 terms.");
    Ok(())
}

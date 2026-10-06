//! Estimates retain every line item and term across pages.
use crate::kozijn::Project;
use crate::pricing::QuotationPrice;
use super::pdf_document::Report;

pub struct CompanyInfo {
    pub name: String,
    pub address: String,
    pub phone: String,
    pub email: String,
    pub kvk: String,
    pub btw_id: String,
}

pub fn generate_quotation_pdf(project: &Project, company: &CompanyInfo, prices: &[(String,f64)],
    quotation_price: &QuotationPrice, terms: &str) -> Result<Vec<u8>, String> {
    if prices.is_empty() { return Err("Add a frame before exporting an estimate.".into()); }
    if prices.iter().any(|(_,v)| !v.is_finite() || *v < 0.0) ||
        [quotation_price.subtotal,quotation_price.discount_amount,quotation_price.transport,
         quotation_price.montage,quotation_price.subtotal_after_extras,quotation_price.btw_amount,
         quotation_price.total_incl_btw].iter().any(|v| !v.is_finite() || *v < 0.0) {
        return Err("Estimate amounts must be finite and non-negative.".into());
    }
    let mut pdf = Report::new("Cost estimate (EUR)",210.0,297.0,18.0)?;
    pdf.paragraph(&company.name,13.0,true);
    pdf.paragraph(&company.address,9.0,false);
    pdf.paragraph(&format!("Phone: {} | Email: {}",company.phone,company.email),8.0,false);
    pdf.paragraph(&format!("Registration: {} | Tax ID: {}",company.kvk,company.btw_id),8.0,false);
    pdf.y -= 5.0;
    pdf.paragraph(&format!("Project: {} | Number: {}",project.project_info.name,project.project_info.number),10.0,true);
    pdf.paragraph(&format!("Client: {}",project.project_info.client),9.0,false);
    pdf.paragraph("Estimate uses the supplied reference cost table. Confirm local rates and tax before issuing a commercial quotation.",8.0,false);
    pdf.y -= 5.0;
    let rows = prices.iter().map(|(mark,total)|vec![mark.clone(),format!("{total:.2}")]).collect::<Vec<_>>();
    pdf.table("Frame estimates", &["Frame mark","Amount EUR"], &[124.0,50.0], &rows);
    let totals = vec![
        vec!["Subtotal".into(),format!("{:.2}",quotation_price.subtotal)],
        vec!["Discount".into(),format!("-{:.2}",quotation_price.discount_amount)],
        vec!["Transport".into(),format!("{:.2}",quotation_price.transport)],
        vec!["Installation".into(),format!("{:.2}",quotation_price.montage)],
        vec!["Tax".into(),format!("{:.2}",quotation_price.btw_amount)],
        vec!["Total including tax".into(),format!("{:.2}",quotation_price.total_incl_btw)],
    ];
    pdf.table("Totals", &["Description","EUR"], &[124.0,50.0], &totals);
    if !terms.is_empty() { pdf.paragraph("Terms",11.0,true); pdf.paragraph(terms,8.0,false); }
    pdf.finish()
}

/// A consistent reference estimate for both Windows and the browser. The app
/// currently stores project pricing, but no company-address or currency setup.
pub fn project_quotation_pdf_bytes(project:&Project) -> Result<Vec<u8>,String> {
    let (prices, total) = crate::pricing::project_reference_estimate(project)?;
    let company = CompanyInfo {name:"Spanvision Infra".into(),address:"Company address not configured".into(),
        phone:"Not configured".into(),email:"Not configured".into(),kvk:"Not configured".into(),btw_id:"Not configured".into()};
    generate_quotation_pdf(project,&company,&prices,&total,
        "Reference estimate only. Currency: EUR.\nConfirm the project tax percentage and local supplier rates.\nCompany contact and registration details must be completed before commercial issue.")
}

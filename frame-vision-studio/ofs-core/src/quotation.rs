use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quotation {
    pub id: String,
    pub version: u32,
    pub status: QuotationStatus,
    pub created_at: String,
    pub valid_until: String,
    pub kozijn_marks: Vec<String>,
    pub total_incl_btw: f64,
    pub notes: String,
    pub change_description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuotationStatus {
    Draft,
    Sent,
    Accepted,
    Rejected,
    Expired,
}

impl Quotation {
    pub fn from_project(project: &crate::kozijn::Project) -> Result<Self, String> {
        let (prices, total) = crate::pricing::project_reference_estimate(project)?;
        let mut draft = Self::new_draft(prices.into_iter().map(|(mark, _)| mark).collect(), total.total_incl_btw);
        draft.notes = "Reference estimate in EUR. Confirm local supplier rates and project tax before commercial issue.".into();
        Ok(draft)
    }

    pub fn validate_amount(total: f64) -> Result<(), String> {
        if !total.is_finite() || total < 0.0 { return Err("Quotation total must be finite and non-negative.".into()); }
        Ok(())
    }

    pub fn new_draft(kozijn_marks: Vec<String>, total: f64) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            version: 1,
            status: QuotationStatus::Draft,
            created_at: chrono::Utc::now().to_rfc3339(),
            valid_until: (chrono::Utc::now() + chrono::Duration::days(30)).to_rfc3339(),
            kozijn_marks,
            total_incl_btw: total,
            notes: String::new(),
            change_description: "First version".into(),
        }
    }

    pub fn create_revision(&self, new_total: f64, change_desc: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            version: self.version + 1,
            status: QuotationStatus::Draft,
            created_at: chrono::Utc::now().to_rfc3339(),
            valid_until: (chrono::Utc::now() + chrono::Duration::days(30)).to_rfc3339(),
            kozijn_marks: self.kozijn_marks.clone(),
            total_incl_btw: new_total,
            notes: String::new(),
            change_description: change_desc.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn project_draft_uses_actual_frames_and_pricing_and_rejects_invalid_input() {
        let mut project = crate::kozijn::Project::new("Estimate", "E1");
        assert!(Quotation::from_project(&project).is_err());
        let frame = crate::kozijn::Kozijn::new("One", "FRAME-1", 1200.25, 1500.5);
        let base = crate::calculation::estimate_cost(&frame, &Default::default()).total_cost;
        project.kozijnen.push(frame);
        project.pricing_config = Some(crate::pricing::PricingConfig {
            discount_percentage: 10.0, btw_percentage: 18.0, transport_cost: 25.0,
            montage_cost_per_hour: 45.0, montage_hours: 2.0, ..Default::default()
        });
        let draft = Quotation::from_project(&project).unwrap();
        assert_eq!(draft.kozijn_marks, vec!["FRAME-1"]);
        assert!((draft.total_incl_btw - (base * 0.9 + 25.0 + 90.0) * 1.18).abs() < 1e-8);
        project.pricing_config.as_mut().unwrap().btw_percentage = f64::NAN;
        assert!(Quotation::from_project(&project).is_err());
        for amount in [f64::NAN, f64::INFINITY, -1.0] { assert!(Quotation::validate_amount(amount).is_err()); }
    }
}

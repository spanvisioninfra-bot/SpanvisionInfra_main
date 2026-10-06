use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PricingConfig {
    pub discount_percentage: f64,
    pub btw_percentage: f64,        // default 21.0
    pub btw_verlegd: bool,          // reverse charge
    pub transport_cost: f64,
    pub montage_cost_per_hour: f64,
    pub montage_hours: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotationPrice {
    pub subtotal: f64,
    pub discount_amount: f64,
    pub transport: f64,
    pub montage: f64,
    pub subtotal_after_extras: f64,
    pub btw_amount: f64,
    pub total_incl_btw: f64,
}

impl PricingConfig {
    pub fn validate(&self) -> Result<(), String> {
        if !(0.0..=100.0).contains(&self.discount_percentage) || !(0.0..=100.0).contains(&self.btw_percentage) ||
            [self.transport_cost, self.montage_cost_per_hour, self.montage_hours].iter().any(|v| !v.is_finite() || *v < 0.0) {
            return Err("Set finite non-negative pricing values, with discount and tax between 0 and 100 percent.".into());
        }
        Ok(())
    }

    pub fn calculate(&self, material_subtotal: f64) -> QuotationPrice {
        let discount_amount = material_subtotal * self.discount_percentage / 100.0;
        let after_discount = material_subtotal - discount_amount;
        let montage = self.montage_cost_per_hour * self.montage_hours;
        let subtotal_after_extras = after_discount + self.transport_cost + montage;
        let btw_amount = if self.btw_verlegd { 0.0 } else { subtotal_after_extras * self.btw_percentage / 100.0 };
        let total = subtotal_after_extras + btw_amount;

        QuotationPrice {
            subtotal: material_subtotal,
            discount_amount,
            transport: self.transport_cost,
            montage,
            subtotal_after_extras,
            btw_amount,
            total_incl_btw: total,
        }
    }
}

/// Reference prices in EUR, shared by saved drafts and PDF estimates.
pub fn project_reference_estimate(project: &crate::kozijn::Project) -> Result<(Vec<(String, f64)>, QuotationPrice), String> {
    crate::export::checked_project_production(project)?;
    let table = crate::calculation::PriceTable::default();
    let prices = project.kozijnen.iter().map(|frame| (frame.mark.clone(),
        crate::calculation::estimate_cost(frame, &table).total_cost)).collect::<Vec<_>>();
    let config = project.pricing_config.clone().unwrap_or(PricingConfig { btw_percentage: 21.0, ..Default::default() });
    config.validate()?;
    let result = config.calculate(prices.iter().map(|(_, total)| total).sum());
    if prices.iter().any(|(_,total)| !total.is_finite() || *total < 0.0) ||
        [result.subtotal, result.discount_amount, result.transport, result.montage,
            result.subtotal_after_extras, result.btw_amount, result.total_incl_btw].iter().any(|v| !v.is_finite() || *v < 0.0) {
        return Err("The reference estimate exceeds the supported amount range.".into());
    }
    Ok((prices, result))
}

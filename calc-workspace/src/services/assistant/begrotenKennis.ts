/**
 * Domeinkennis voor de Calculatieassistent: hoe een Nederlandse bouwbegroting
 * in elkaar zit en welke vakregels gelden bij het opbouwen en wijzigen ervan.
 * Dit is dé plek waar die kennis in de repo leeft — wordt als onderdeel van
 * de system prompt aan het taalmodel meegegeven.
 */
export const BEGROTEN_KENNIS = `
## Domain knowledge: construction estimating

Structure: costs belong ONLY to calculation rows, never directly to items or chapters.
- Chapter (NL-SfB style: 00 General, 05 Site setup, 21 Concrete work, … 90 External works)
  └─ Estimate item: a work description containing rows, without its own price
     └─ Calculation row: quantity × unit price
The contract sum adds the existing cascade of overheads and markups to direct cost:
subcontract overheads → general site costs → guarantees → work preparation → risk →
profit → insurance → VAT → rounding. Percentages are company-specific; never invent
them. Use only percentages already present in the document.

Resource categories retain their protocol identifiers:
- arbeid (labor): hours × the A/B/C rate-group rate. Hourly rows use unit "uur",
  with norm = hours per unit (1 for an hourly unit). Wages follow from the rate
  group. An hourly labor rate is NEVER a material price.
- materiaal (materials): purchase cost per unit, using the row's price.
- materieel (equipment): machine hire or deployment, priced per unit without wages.
- onderaannemer (subcontractor): outsourced work; preserve this category because
  subcontract overheads apply only to these costs.
- overig (other): provisional sums and other allowances.

For work measured in m², use quantity in m², labor norm in hours/m² and a separate
material unit price per m². Separate supply allowances from installation labor.
A lump sum is appropriate only for a real provisional allowance, clearly labelled.

Rules:
- Never invent arbitrary prices; retain quoted amounts and actual allowances.
- Make quantities traceable, e.g. 2 × 37 m × 3 m × 40% = 88.8 m², and explain
  the derivation in the description or notes.
- Base unit prices on comparable rows already in the document. Apply indexation
  or deviations only when the user requests them.
- Compare benchmarks in €/m² gross floor area, excluding VAT; flag large deviations.
- The application recalculates totals after edits. Explain the effect on the total
  when relevant. Write all generated descriptions and explanations in English.
`;

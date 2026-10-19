/**
 * Permanente vuurlast — bepaling conform NEN 6090.
 *
 * Permanente vuurlast = energie-inhoud van vaste, niet-verwijderbare
 * bouwdelen (constructiehout, dakbedekking, brandbare isolatie, etc.).
 * Onderscheid met variabele vuurlast die wordt veroorzaakt door
 * inventaris / gebruiksinhoud.
 *
 * Formule:
 *   q_{f,k} = Σ (m_i · H_{u,i} · ψ_i) / A_v        [MJ/m²]
 *
 *   m_i   = massa brandbaar materiaal i             [kg]
 *   H_u,i = onderste calorische waarde van i        [MJ/kg]
 *   ψ_i   = verbrandingsfactor (≤ 1, typisch 1.0)
 *   A_v   = gebruiksoppervlak brandcompartiment     [m²]
 *
 * Calorische waarden (NEN 6090 Tabel A.1 / EN 1991-1-2 Tabel E.3):
 *   Hout & cellulose            17.5 MJ/kg
 *   PUR / PIR-isolatie          26    MJ/kg
 *   EPS / XPS-isolatie          40    MJ/kg
 *   Bitumen dakbedekking        38    MJ/kg
 *   PVC                         17    MJ/kg
 *   Polyethyleen / polypropyleen 43   MJ/kg
 *   Steenwol / glaswol           0    MJ/kg (niet brandbaar — ψ=0)
 *   Beton, staal, gips           0    MJ/kg (niet brandbaar)
 */

export const permanenteVuurlast = `"Permanent fire load — assessment per NEN 6090

'<i>Permanent fire load q<sub>f,k</sub> expresses the energy content of fixed combustible building components per m² of usable floor area. Contents and occupancy loads (variable fire load) are assessed separately.</i>

# 1. Gebruiksoppervlak brandcompartiment

A_v = ?*(m^2)', usable floor area A_v (m²) of the fire compartment'

# 2. Brandbare materials — massa's

'<i>Enter the total mass in kg permanently present in the fire compartment for each material category. A volume × density estimate is often sufficient; see section 5.</i>

m_hout = ?*(kg)', constructiehout + houten finishes + plaatmateriaal (kg)'
m_pir = ?*(kg)', PUR / PIR-isolatie (kg)'
m_eps = ?*(kg)', EPS / XPS-isolatie (kg)'
m_bitumen = ?*(kg)', bitumen dakbedekking (kg)'
m_pvc = ?*(kg)', PVC-houdende leidingen + kunststof afwerking (kg)'
m_pe = ?*(kg)', PE / PP-leidingen + kunststof folie (kg)'

m_overig = ?*(kg)', overige brandbare materialen (kg)'
H_u_overig = ?*(MJ/kg)', calorific value of other materials (MJ/kg)'

# 3. Calorische values (NEN 6090 Table A.1)

#hide
H_u_hout = 17.5 MJ/kg
H_u_pir = 26 MJ/kg
H_u_eps = 40 MJ/kg
H_u_bitumen = 38 MJ/kg
H_u_pvc = 17 MJ/kg
H_u_pe = 43 MJ/kg
#show

'<table style="width:auto; border-collapse:collapse; font-size:0.9em;"><tr><td style="padding:2px 12px;"><b>Material</b></td><td style="padding:2px 12px;"><b>H<sub>u</sub> [MJ/kg]</b></td></tr><tr><td>Timber and cellulose</td><td>17.5</td></tr><tr><td>PUR / PIR</td><td>26</td></tr><tr><td>EPS / XPS</td><td>40</td></tr><tr><td>Bitumen</td><td>38</td></tr><tr><td>PVC</td><td>17</td></tr><tr><td>PE / PP</td><td>43</td></tr><tr><td>Mineral/glass wool, concrete, steel, gypsum</td><td>0 (non-combustible)</td></tr></table>

# 4. Verbrandingsfactor ψ

'<i>Combustion factor ψ accounts for incomplete combustion, typically ψ = 1.0 for cellulose-containing materials. NEN 6090 permits ψ = 0.8 for moderately combustible materials; ψ = 1.0 is commonly adopted conservatively for permanent fire load.</i>

#hide
ψ = 1.0
#show

# 5. Energie-inhoud per categorie

Q_hout = m_hout*H_u_hout*ψ
Q_pir = m_pir*H_u_pir*ψ
Q_eps = m_eps*H_u_eps*ψ
Q_bitumen = m_bitumen*H_u_bitumen*ψ
Q_pvc = m_pvc*H_u_pvc*ψ
Q_pe = m_pe*H_u_pe*ψ
Q_overig = m_overig*H_u_overig*ψ

Q_totaal = Q_hout + Q_pir + Q_eps + Q_bitumen + Q_pvc + Q_pe + Q_overig

# 6. Permanent fire load

'<b>Specifieke permanente vuurlast (formule §6.2 NEN 6090):</b>

q_f,k = Q_totaal/A_v

# 7. Check against the limit

'<i>The q<sub>f,k</sub> limit depends on compartment size and required fire resistance of separating construction under the Dutch Bouwbesluit/Bbl. The worksheet cites an approximate practical threshold of 500 MJ/m² for light residential/office use, and 1000–3000 MJ/m² for industrial/storage use with higher fire-resistance requirements.</i>

@select gebouwfunctie "Gebouwfunctie (typische grenswaarde)"
  Wonen (≤ 500 MJ/m²) = 500
  Kantoor / onderwijs (≤ 500 MJ/m²) = 500
  Logies / gezondheidszorg (≤ 500 MJ/m²) = 500
  Bijeenkomst / winkel (≤ 800 MJ/m²) = 800
  Lichte industrie (≤ 1200 MJ/m²) = 1200
  Zware industrie / opslag (≤ 3000 MJ/m²) = 3000
@end

q_grens = gebouwfunctie*MJ/m^2

UC_vuurlast = q_f,k/q_grens

#if UC_vuurlast ≤ 1.0
    'UC = q<sub>f,k</sub>/q<sub>grens</sub> = 'UC_vuurlast'<span style="color:green"> ≤ 1.0 → <b>Passes</b></span>
#else
    'UC = q<sub>f,k</sub>/q<sub>grens</sub> = 'UC_vuurlast'<span style="color:red"> > 1.0 → <b>Fails</b></span>
#end if

# 8. Mass estimates (helper)

'<i>Simplified mass estimates for common building components:</i><ul><li><b>Timber</b>, ρ ≈ 450 kg/m³: 95×45 studs at 600 mm spacing in a 2.5 m wall give about 7 kg/m² of wall; 50×200 joists at 600 mm give about 7.5 kg/m² of floor; 18 mm plywood about 8 kg/m²; 14 mm oak parquet about 10 kg/m².</li><li><b>PUR/PIR</b>, ρ ≈ 35 kg/m³: 3.5 kg/m² per 100 mm insulation.</li><li><b>EPS</b>, ρ ≈ 20 kg/m³: 2.0 kg/m² per 100 mm.</li><li><b>Bitumen roofing</b>, two-layer APP: about 5–8 kg/m².</li><li><b>PVC</b> drainage pipe Ø110 mm, wall 3.2 mm: about 1.7 kg/m.</li></ul>

'<hr/><i>Limitations:<ul><li>Non-combustible concrete, steel, mineral/glass wool, gypsum, and aluminum do not contribute to fire load; exclude them from m_hout and similar inputs.</li><li>Fire-resistant gypsum (Promat, Knauf Brand) is treated as non-combustible. Cardboard facing may be included under m_hout but is often negligible (&lt;0.5 kg/m²).</li><li>Contents and storage form the <i>variable</i> fire load, treated separately in NEN 6090 Table A.2. Total fire load is q<sub>f,k,tot</sub> = q<sub>f,k,perm</sub> + q<sub>f,k,var</sub>.</li><li>For formal BIO reporting under Dutch building-regulation equivalence, consult NEN 6090 §6 and apply δ<sub>q1</sub>/δ<sub>q2</sub> for compartment size and activation risk.</li></ul></i>
`;

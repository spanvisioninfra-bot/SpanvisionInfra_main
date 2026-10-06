/** All values are numeric SI: areas mm², stresses MPa, force kN.
 * This independent sheet does not read Dutch project annex factors.
 */
export const steelTensionInternational = `# Steel tension cross-section — India / US / UK

This sheet verifies two cross-section limit states for a fully connected flat plate under concentric axial tension. A section within capacity is not approval of the member or its connection.

@select tension_method "Method for this steel tension sheet only"
India — IS 800:2007 limit state = 1
US — ANSI/AISC 360-22 LRFD = 2
US — ANSI/AISC 360-22 ASD = 3
UK — BS EN 1993-1-1:2005+A1:2014 + NA+A1:2014 = 4
@end

## Basis and scope

#if tension_method == 1
India: IS 800:2007 (third revision), clauses 6.2 and 6.3.1, Table 5. gamma_m0 = 1.10; gamma_m1 = 1.25; plate rupture coefficient = 0.90. Enter factored design tension using the applicable Indian load combinations.
#end if
#if tension_method == 2
US: ANSI/AISC 360-22 D2(a) and D2(b). phi_y = 0.90; phi_r = 0.75. Enter required strength from LRFD factored load combinations. This module supports only fully connected plates with U = 1.00 under D3.
#end if
#if tension_method == 3
US: ANSI/AISC 360-22 D2(a) and D2(b). Omega_y = 1.67; Omega_r = 2.00. Enter required strength from ASD load combinations, not LRFD factored tension. This module supports only fully connected plates with U = 1.00 under D3.
#end if
#if tension_method == 4
UK: first-generation BS EN 1993-1-1:2005+A1:2014, clause 6.2.3(2), expressions 6.6 and 6.7, with NA+A1:2014. gamma_M0 = 1.00; gamma_M2 = 1.10 for cross-section tension fracture. Enter N_Ed using matching first-generation UK load combinations. Category C slip-resistant connections and second-generation Eurocodes are outside this sheet.
#end if

## Inputs (numeric SI values)

Gross area in mm²:
tension_Ag = ?
Net area in mm² after the governing standard-specific hole deductions:
tension_An = ?
Yield strength fy in MPa from the applicable material standard and thickness:
tension_fy = ?
Ultimate strength fu in MPa from the applicable material standard and thickness:
tension_fu = ?
Required tension in kN on the force basis of the selected method:
tension_N = ?

## Cross-section calculation

#if steelTensionValid(tension_method, tension_Ag, tension_An, tension_fy, tension_fu, tension_N)
Input record: Ag = {{tension_Ag}} mm²; An = {{tension_An}} mm²; fy = {{tension_fy}} MPa; fu = {{tension_fu}} MPa; required tension = {{tension_N}} kN.
Gross-section yielding capacity (kN):
tension_Ry = steelTensionYield(tension_method, tension_Ag, tension_An, tension_fy, tension_fu, tension_N)
Net-section rupture capacity (kN):
tension_Ru = steelTensionRupture(tension_method, tension_Ag, tension_An, tension_fy, tension_fu, tension_N)
Governing cross-section capacity (kN):
tension_R = steelTensionCapacity(tension_method, tension_Ag, tension_An, tension_fy, tension_fu, tension_N)
Utilization (required tension divided by cross-section capacity):
tension_UC = steelTensionUtilization(tension_method, tension_Ag, tension_An, tension_fy, tension_fu, tension_N)
#if tension_Ry < tension_Ru
Governing limit state: gross-section yielding.
#else
#if tension_Ru < tension_Ry
Governing limit state: net-section rupture.
#else
Governing limit states: yielding and rupture are equal.
#end if
#end if
#if tension_UC <= 1
Cross-section within capacity for the two checked limit states. Complete member verification remains outstanding.
#else
Cross-section exceeds capacity. Complete member verification remains outstanding.
#end if
#else
Invalid inputs — no capacity or conclusion is calculated. Choose a listed method; provide finite numeric values, 0 < An <= Ag, 100 <= fy <= 700 MPa, fy <= fu <= 1000 MPa, and nonnegative tension. Compression and other materials are outside this module.
#end if

## Excluded checks and verification status

Connection strength and block shear; shear lag and partially connected sections; UK Category C slip-resistant connections; fatigue and fracture toughness; bending and compression; load combinations and geolocation loads; serviceability and slenderness; fire and seismic detailing are excluded.
The selected method applies to this sheet only. Existing NEN sheets retain their Dutch national annex rules. Independent arithmetic references have been checked; external engineering review is pending. The September 2026 AISC errata has not yet been verified, so the US method is not released for production design.
Source references: BIS standards catalogue; AISC 360-22 and its revisions and errata; SCI Steel Building Design: Concise Eurocodes, P362 sections 6.1 and 6.2.3; UK NA+A1:2014 identified by BSI. No complete country-code coverage is claimed.
`;

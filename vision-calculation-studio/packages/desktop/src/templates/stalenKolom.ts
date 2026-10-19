/**
 * Stalen kolom — invoerblad bij StalenKolomDesigner.tsx.
 *
 * VISUEEL ONLY: invoer, knikschema en profieldoorsnede. De toetsing volgens
 * EN 1993-1-1 §6.3 (χ, knikkrommen, N-M-interactie 6.61/6.62) is nog niet
 * uitgewerkt.
 *
 * Variabelenamen komen exact overeen met StalenKolomDesigner.tsx.
 */

export const stalenKolom = `"Steel column — buckling en bending (EN 1993-1-1 §6.3)

'<i>A column under compression and bending. Enter three buckling lengths separately: L<sub>cr,y</sub> and L<sub>cr,z</sub> for flexural buckling about the strong and weak axes, and L<sub>cr</sub> for the unrestrained length governing lateral-torsional buckling. Sway or non-sway behavior determines the buckling factor.</i>

# 1. Section en geometrie

@select profiel "Steel section"
  HEA 100 = 1
  HEA 120 = 2
  HEA 140 = 3
  HEA 160 = 4
  HEA 180 = 5
  HEA 200 = 6
  HEA 220 = 7
  HEA 240 = 8
  HEA 260 = 9
  HEA 300 = 10
  HEB 100 = 11
  HEB 120 = 12
  HEB 140 = 13
  HEB 160 = 14
  HEB 180 = 15
  HEB 200 = 16
  HEB 220 = 17
  HEB 240 = 18
  HEB 260 = 19
  HEB 300 = 20
  IPE 200 = 21
  IPE 240 = 22
  IPE 270 = 23
  IPE 300 = 24
  IPE 330 = 25
  IPE 360 = 26
  IPE 400 = 27
@end

@select staalsoort "Steel grade"
  S235 = 235
  S275 = 275
  S355 = 355
@end

@select knikvorm "Buckling mode"
  Fixed nodes = 1
  Movable nodes = 2
@end

L_kolom = ?*(mm)', kolomlengte L'
L_cry = ?*(mm)', kniklengte om de y-as L_cr,y'
L_crz = ?*(mm)', kniklengte om de z-as L_cr,z'
L_cr = ?*(mm)', unrestrained length L_cr (lateral-torsional buckling)'

# 2. Loads

N_Ed = ?*(kN)', axial force N_Ed (compression positive)'
M_yA = ?*(kN*m)', moment aan de bovenzijde M_yA,Ed'
M_yB = ?*(kN*m)', moment aan de onderzijde M_yB,Ed'
q_z = ?*(kN/m)', distributed load perpendicular to the column q_z,Ed'
z_aangrijp = ?*(mm)', aangrijpingspunt z, gemeten vanaf de bovenkant'

'<h6>Input summary</h6>
L_kolom
L_cry
L_crz
L_cr
N_Ed
M_yA
M_yB
q_z

# 3. Checks

'<i><b>Not yet implemented.</b> This sheet defines inputs and a parametric drawing only. Section class, N<sub>b,Rd</sub> with Table 6.2 buckling curves, lateral-torsional resistance M<sub>b,Rd</sub>, and N-M interaction (6.61)/(6.62) with Annex B k factors are planned.</i>
`;

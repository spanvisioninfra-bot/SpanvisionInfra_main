/**
 * Lasberekening — invoerblad bij LasDesigner.tsx.
 *
 * VISUEEL ONLY: invoer en isometrisch beeld met de zes belastingcomponenten.
 * De richtingsmethode van EN 1993-1-8 §4.5.3.2 is nog niet uitgewerkt.
 *
 * Variabelenamen komen exact overeen met LasDesigner.tsx.
 */

export const lasberekening = `"Weld calculation — hoeklas below zes belastingcomponenten

'<i>A weld group L × b with throat thickness a, subjected to three forces and three moments. F<sub>x</sub> acts perpendicular to the weld plane; F<sub>y</sub> and F<sub>z</sub> act in the plane. M<sub>x</sub> twists about the weld axis; M<sub>y</sub> and M<sub>z</sub> cause bending. The resultant will determine σ<sub>⊥</sub>, τ<sub>⊥</sub>, and τ<sub>∥</sub> in the throat plane.</i>

# 1. Inputs

@select staalsoort "Steel grade"
  S235 = 235
  S275 = 275
  S355 = 355
@end

@select typelas "Weld type"
  Fillet weld = 1
  Butt weld (full penetration) = 2
@end

L_las = ?*(mm)', weld group length L'
b_las = ?*(mm)', weld group width b'
a_las = ?*(mm)', keeldikte a'

@select langeverb "Long connection (reductie β_Lw)"
  not applicable = 0
  lap connection β_Lw,1 = 1
  longitudinal stiffener β_Lw,2 = 2
@end

# 2. Loads

F_xEd = ?*(kN)', axial force perpendicular to the weld plane F_x,Ed'
F_yEd = ?*(kN)', in-plane shear force F_y,Ed'
F_zEd = ?*(kN)', in-plane shear force F_z,Ed'
M_xEd = ?*(kN*m)', wringend moment M_x,Ed'
M_yEd = ?*(kN*m)', bending moment M_y,Ed'
M_zEd = ?*(kN*m)', bending moment M_z,Ed'

'<h6>Input summary</h6>
L_las
b_las
a_las
F_xEd
F_yEd
F_zEd
M_xEd
M_yEd
M_zEd

# 3. Checks

'<i><b>Not yet implemented.</b> This sheet defines inputs and a parametric drawing only. The EN 1993-1-8 §4.5.3.2 directional method — √(σ<sub>⊥</sub>² + 3τ<sub>⊥</sub>² + 3τ<sub>∥</sub>²) ≤ f<sub>u</sub>/(β<sub>w</sub>γ<sub>M2</sub>), plus σ<sub>⊥</sub> ≤ 0.9·f<sub>u</sub>/γ<sub>M2</sub> — is planned.</i>
`;

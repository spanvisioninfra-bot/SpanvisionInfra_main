/**
 * Ponsberekening — invoerblad bij PonsDesigner.tsx.
 *
 * VISUEEL ONLY: invoer, doorsnede met de ponskegel en plattegrond met de
 * controleperimeter u_1 op 2d. De toetsing (v_Ed, v_Rd,c, ponswapening) is nog
 * niet uitgewerkt.
 *
 * Variabelenamen komen exact overeen met PonsDesigner.tsx.
 */

export const ponsberekening = `"Punching shear — flat slab (EN 1992-1-1 §6.4)

'<i>A column on a flat slab transfers shear over a small area. The check uses control perimeter u<sub>1</sub>, at 2d from the column face with rounded corners. Factor β increases shear stress for edge or corner columns and eccentric loads.</i>

# 1. Geometry

@select vorm "Column shape"
  Rectangular column = 1
  Circular column = 2
@end

@select plaats "Column location in the slab"
  No edge (internal column) = 1
  Edge column = 2
  Corner column = 3
@end

@select kolomkop "Column head / drukhoofd"
  none = 0
  rectangular column head = 1
  circular column head = 2
@end

c_1 = ?*(mm)', kolomafmeting c_1'
c_2 = ?*(mm)', kolomafmeting c_2'
h_plaat = ?*(mm)', slab thickness h'

# 2. Concrete and reinforcement

@select betonklasse "Concrete strength class"
  C20/25 = 20
  C25/30 = 25
  C30/37 = 30
  C35/45 = 35
  C40/50 = 40
  C45/55 = 45
  C50/60 = 50
@end

@select betonstaal "Reinforcement grade"
  B500A = 1
  B500B = 2
  B500C = 3
@end

d_wapy = ?*(mm)', diameter langswapening in y-richting'
s_wapy = ?*(mm)', longitudinal reinforcement spacing in y'
d_wapz = ?*(mm)', diameter langswapening in z-richting'
s_wapz = ?*(mm)', longitudinal reinforcement spacing in z'

@select eerstelaag "Onderste wapeningslaag"
  Longitudinal reinforcement y = 1
  Longitudinal reinforcement z = 2
@end

c_dek = ?*(mm)', cover c'
hoek_pons = ?', punching reinforcement angle [degrees]'

@select beta_keuze "Factor β"
  Berekenen according to 6.4.3 = 0
  Handmatig invoeren = 1
@end
beta_hand = ?', manual β value'

# 3. Loads

V_Ed = ?*(kN)', ponskracht V_Ed'
q_Ed = ?*(kN/m^2)', slab load inside the control perimeter q_Ed'
e_y = ?*(mm)', excentriciteit in y-richting'
e_z = ?*(mm)', excentriciteit in z-richting'

'<h6>Input summary</h6>
c_1
c_2
h_plaat
c_dek
V_Ed
e_y
e_z

# 4. Checks

'<i><b>Not yet implemented.</b> This sheet defines inputs and the parametric drawing only. Effective depth d, perimeters u<sub>0</sub>/u<sub>1</sub>, β under §6.4.3, v<sub>Ed</sub>, v<sub>Rd,c</sub> under (6.47), maximum column-face shear stress, and punching reinforcement under (6.52) are planned.</i>
`;

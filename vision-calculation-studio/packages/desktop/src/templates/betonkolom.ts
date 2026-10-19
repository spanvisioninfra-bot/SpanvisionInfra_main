/**
 * Betonkolom — invoerblad bij BetonkolomDesigner.tsx.
 *
 * VISUEEL ONLY: invoer, doorsnede met staafverdeling en aanzicht met de
 * kolomlengte. De toetsing (slankheid, tweede orde, M-N-diagram) is nog niet
 * uitgewerkt.
 *
 * Variabelenamen komen exact overeen met BetonkolomDesigner.tsx.
 */

export const betonkolom = `"Concrete column — compression and bending with second-order effects

'<i>A reinforced concrete column under axial force and bending. Slenderness determines whether second-order effects must be included; the perimeter bar arrangement determines the M-N interaction diagram. Inputs follow the reference program: geometry, reinforcement, buckling, and loads.</i>

# 1. Geometry

@select vorm "Section shape"
  Rectangular column = 1
  Circular column = 2
@end

h_kol = ?*(mm)', section height h'
b_kol = ?*(mm)', section width b'
L_kol = ?*(mm)', kolomlengte L'

@select insitu "In-situ gestorte funderingspaal"
  No = 0
  Yes = 1
@end

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

c_dek = ?*(mm)', stirrup cover c'
n_h = ?', number of bars along the height (per side)'
n_b = ?', number of bars along the width (per side)'
d_staaf = ?*(mm)', staafdiameter langswapening'
d_beugel = ?*(mm)', beugeldiameter'
s_beugel = ?*(mm)', beugelafstand'

# 3. Buckling

L_cry = ?*(mm)', kniklengte om de y-as L_0,y'
L_crz = ?*(mm)', kniklengte om de z-as L_0,z'

# 4. Loads

N_Ed = ?*(kN)', axial force N_Ed (compression positive)'
M_yEd = ?*(kN*m)', moment om de y-as M_y,Ed'
M_zEd = ?*(kN*m)', moment om de z-as M_z,Ed'

'<h6>Input summary</h6>
h_kol
b_kol
L_kol
c_dek
d_staaf
N_Ed
M_yEd

# 5. Checks

'<i><b>Not yet implemented.</b> This sheet currently defines inputs and the parametric drawing only. The slenderness limit λ<sub>lim</sub> in §5.8.3.1, second-order magnification using nominal stiffness (§5.8.7) or curvature (§5.8.8), M-N interaction, and minimum reinforcement are planned.</i>
`;

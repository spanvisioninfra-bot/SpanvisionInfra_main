/**
 * Betondoorsnede — invoerblad bij BetondoorsnedeDesigner.tsx.
 *
 * VISUEEL ONLY: invoer en parametrische doorsnede met wapeningslagen en
 * beugels. De toetsing (M-N-interactie, dwarskracht, wringing, scheurwijdte)
 * is nog niet uitgewerkt.
 *
 * Variabelenamen komen exact overeen met BetondoorsnedeDesigner.tsx.
 */

export const betondoorsnede = `"Concrete section — rectangular section below M, N, V en T

'<i>A reinforced rectangular section with three reinforcement layers and stirrups. Inputs define geometry, cover, and bar layout, from which internal lever arms and resistances will be derived. Characteristic forces N<sub>k</sub> and M<sub>k</sub> are used for crack-width checks.</i>

# 1. Section

b_dsn = ?*(mm)', width b'
h_dsn = ?*(mm)', height h'

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

# 2. Reinforcement

n_onder = ?', number of bottom bars'
d_onder = ?*(mm)', staafdiameter onderin'
n_midden = ?', number of intermediate-layer bars (0 = none)'
d_midden = ?*(mm)', staafdiameter tussenlaag'
n_boven = ?', number of top bars'
d_boven = ?*(mm)', staafdiameter bovenin'
d_beugel = ?*(mm)', beugeldiameter'
s_beugel = ?*(mm)', beugelafstand'
n_sneden = ?', number of stirrup legs'

# 3. Loads

N_Ed = ?*(kN)', axial force N_Ed (compression positive)'
M_Ed = ?*(kN*m)', bending moment M_Ed'
V_Ed = ?*(kN)', dwarskracht V_Ed'
T_Ed = ?*(kN*m)', wringend moment T_Ed'
N_k = ?*(kN)', characteristic axial force N_k (SLS)'
M_k = ?*(kN*m)', karakteristiek moment M_k (BGT)'

'<h6>Input summary</h6>
b_dsn
h_dsn
c_dek
n_onder
d_onder
n_boven
d_boven
N_Ed
M_Ed
V_Ed

# 4. Checks

'<i><b>Not yet implemented.</b> This sheet currently defines inputs and the parametric section only. M-N interaction with the rectangular stress block, shear per §6.2 (V<sub>Rd,c</sub> and truss analogy), torsion per §6.3, crack width per §7.3, and the M-N-κ diagram are planned.</i>
`;

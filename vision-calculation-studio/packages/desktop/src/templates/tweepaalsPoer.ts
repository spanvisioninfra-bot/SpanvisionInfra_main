/**
 * Tweepaals poer — invoerblad bij TweepaalsPoerDesigner.tsx.
 *
 * VISUEEL ONLY: invoer, plattegrond en doorsnede met de trekband en beugels.
 * De toetsing (staafwerkmodel of buigingstheorie, verankering, pons) is nog
 * niet uitgewerkt.
 *
 * Variabelenamen komen exact overeen met TweepaalsPoerDesigner.tsx.
 */

export const tweepaalsPoer = `"Two-pile cap — column on two piles

'<i>A pile cap distributes the column load between two piles. A deep cap behaves as a strut-and-tie system: two compression struts from the column to the piles and a tension tie at the bottom. The tie must be fully anchored above each pile, hence the bent-up bar ends.</i>

# 1. Geometry

@select kolomvorm "Column shape"
  Circular column = 1
  Rectangular column = 2
@end

@select paalvorm "Pile shape"
  Rectangular pile = 1
  Circular pile = 2
@end

d_kolom = ?*(mm)', column diameter or width'
b_paal = ?*(mm)', paalafmeting in de lengterichting'
l_paal = ?*(mm)', paalafmeting in de dwarsrichting'
b_poer = ?*(mm)', pile cap width b'
h_poer = ?*(mm)', pile cap depth h'
l_hoh = ?*(mm)', pile center-to-center spacing l'
oversteek = ?*(mm)', pile cap projection beyond the pile centerline'

# 2. Concrete and reinforcement

@select betonklasse "Concrete strength class"
  C20/25 = 20
  C25/30 = 25
  C30/37 = 30
  C35/45 = 35
  C40/50 = 40
  C45/55 = 45
@end

@select betonstaal "Reinforcement grade"
  B500A = 1
  B500B = 2
  B500C = 3
@end

@select betonoppervlak "Concrete area"
  Verifiable = 1
  Not verifiable = 2
@end

c_dek = ?*(mm)', cover c'
n_langs = ?', number of tension tie bars'
d_langs = ?*(mm)', staafdiameter trekband'
n_sneden = ?', number of stirrup legs'
d_beugel = ?*(mm)', beugeldiameter'
s_beugel = ?*(mm)', beugelafstand'

# 3. Loads

F_Ed = ?*(kN)', design column load F_Ed'
F_qp = ?*(kN)', quasi-blijvende kolomlast F_qp'

'<h6>Input summary</h6>
d_kolom
b_poer
h_poer
l_hoh
c_dek
n_langs
d_langs
F_Ed

# 4. Checks

'<i><b>Not yet implemented.</b> This sheet defines inputs and a parametric drawing only. Pile reactions, compression struts and tension tie (§6.5), nodal stresses above piles, tie anchorage, shear, and punching around the column are planned.</i>
`;

/**
 * Penverbinding — invoerblad bij PenDesigner.tsx.
 *
 * VISUEEL ONLY: invoer en parametrisch beeld van een oogplaat met vork.
 * De toetsing van EN 1993-1-8 §3.13 is nog niet uitgewerkt.
 *
 * Variabelenamen komen exact overeen met PenDesigner.tsx.
 */

export const penverbinding = `"Pin connection — lug plate with pin

'<i>An eye plate in a fork connected by a pin. EN 1993-1-8 §3.13 specifies plate geometry around the hole (a and c) and checks pin shear, bending, and bearing. A replaceable pin also requires a contact-stress check at the serviceability limit state.</i>

# 1. Inputs

@select staalsoort "Steel grade lug plate en fork"
  S235 = 235
  S275 = 275
  S355 = 355
@end

@select penkwaliteit "Pin grade"
  4.6 = 46
  5.6 = 56
  8.8 = 88
  10.9 = 109
@end

@select vervangbaar "Pen must replaceable are"
  Yes = 1
  No = 0
@end

d_pen = ?*(mm)', pin diameter d'
d_0 = ?*(mm)', gatdiameter d_0'
a_oog = ?*(mm)', distance from hole to end of eye plate a'
c_oog = ?*(mm)', distance from hole to side of eye plate c'
t_oog = ?*(mm)', eye plate thickness t'
t_vork = ?*(mm)', thickness of one fork plate a_1'
c_1 = ?*(mm)', clearance between eye and fork c_1'

F_Ed = ?*(kN)', design tension force F_Ed'
F_Edser = ?*(kN)', karakteristieke trekkracht in de BGT F_Ed,ser'

'<h6>Input summary</h6>
d_pen
d_0
a_oog
c_oog
t_oog
F_Ed

# 2. Checks

'<i><b>Not yet implemented.</b> This sheet defines inputs and the parametric drawing only. Plate geometry under EN 1993-1-8 Table 3.9, pin shear/bending/bearing under Table 3.10, and SLS contact stress checks are planned.</i>
`;

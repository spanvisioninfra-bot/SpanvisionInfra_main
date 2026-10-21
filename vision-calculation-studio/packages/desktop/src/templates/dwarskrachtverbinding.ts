/**
 * Dwarskrachtverbinding — invoerblad bij DwarskrachtDesigner.tsx.
 *
 * VISUEEL ONLY: invoer, zijaanzicht en kopplaataanzicht. De toetsing
 * (boutgroep, kopplaat, liggerlijf, blokschuif) is nog niet uitgewerkt.
 *
 * Variabelenamen komen exact overeen met DwarskrachtDesigner.tsx.
 */

export const dwarskrachtverbinding = `"Shear connection — scharnierende ligger-kolomverbinding

'<i>A pinned beam-to-column connection using an end plate, web plate, or angles. It transfers shear only and must have sufficient rotation capacity to behave as a hinge. The number of bolt rows controls both the drawing and the resistance.</i>

# 1. System

@select verbindingsvorm "Connection type"
  End plate = 1
  Web plate (gusset plate) = 2
  Double angle = 3
@end

@select kolomprofiel "Column section"
  HEA 160 = 4
  HEA 180 = 5
  HEA 200 = 6
  HEA 220 = 7
  HEA 240 = 8
  HEA 260 = 9
  HEA 300 = 10
  HEB 160 = 14
  HEB 200 = 16
  HEB 240 = 18
  HEB 300 = 20
@end

@select liggerprofiel "Beam section"
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

@select boutkwaliteit "Bolt grade"
  4.6 = 46
  5.6 = 56
  8.8 = 88
  10.9 = 109
@end

@select boutmaat "Bolt size"
  M12 = 12
  M16 = 16
  M20 = 20
  M24 = 24
@end

@select hartlijn "Bolt centerline"
  staggered = 1
  aligned = 2
@end

# 2. End plate en bouten

n_boutrijen = ?', number of bolt rows'
t_kp = ?*(mm)', dikte kopplaat'
b_kp = ?*(mm)', end plate width'
e_kp = ?*(mm)', top and bottom edge distances'
p_kp = ?*(mm)', bolt row pitch'
w_kp = ?*(mm)', horizontal bolt center-to-center spacing'
a_las = ?*(mm)', weld throat thickness between beam web and end plate'

V_Ed = ?*(kN)', dwarskracht V_Ed'

'<h6>Input summary</h6>
n_boutrijen
t_kp
b_kp
e_kp
p_kp
w_kp
V_Ed

# 3. Checks

'<i><b>Not yet implemented.</b> This sheet defines inputs and the parametric drawing only. Bolt-group shear and bearing, end-plate and beam-web shear, block tearing under §3.10.2, and weld checks are planned.</i>
`;

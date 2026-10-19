/**
 * Momentverbinding — invoerblad bij MomentverbindingDesigner.tsx.
 *
 * VISUEEL ONLY: invoer, zijaanzicht en kopplaataanzicht. De componentenmethode
 * van EN 1993-1-8 §6 (M_j,Rd, rotatiestijfheid S_j, classificatie) is nog niet
 * uitgewerkt.
 *
 * Variabelenamen komen exact overeen met MomentverbindingDesigner.tsx.
 */

export const momentverbinding = `"Moment connection — beam to column with end plate

'<i>A moment-resisting beam-to-column connection with a bolted end plate and optional haunch beneath the beam. Resistance is governed by the weakest component: end plate bending, column flange, column web in compression, tension and shear, or bolt rows. Bolt rows and the haunch control both the drawing and internal lever arms.</i>

# 1. System

@select stabiliteit "Frame stability"
  Unbraced = 1
  Braced = 2
@end

@select verbindingstype "Connection type"
  Bolted connection = 1
  Welded connection = 2
@end

@select kopplaattype "End plate"
  Short end plate = 1
  Continuous end plate = 2
  Extended end plate = 3
@end

@select kolomprofiel "Column section"
  HEB 140 = 13
  HEB 160 = 14
  HEB 180 = 15
  HEB 200 = 16
  HEB 220 = 17
  HEB 240 = 18
  HEB 260 = 19
  HEB 300 = 20
  HEA 200 = 6
  HEA 240 = 8
  HEA 300 = 10
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
  M27 = 27
  M30 = 30
@end

@select console "Bracket below de ligger"
  None = 0
  Bracket without flange = 1
  Bracket with flange = 2
@end

# 2. End plate en bouten

n_boutrijen = ?', number of bolt rows'
t_kp = ?*(mm)', dikte kopplaat'
b_kp = ?*(mm)', end plate width'
e_kp = ?*(mm)', randafstand bovenin de kopplaat'
p_kp = ?*(mm)', bolt row pitch'
w_kp = ?*(mm)', horizontal bolt center-to-center spacing'
h_console = ?*(mm)', haunch height'
l_console = ?*(mm)', haunch length'
a_flens = ?*(mm)', weld throat thickness between beam flange and end plate'
a_lijf = ?*(mm)', weld throat thickness between beam web and end plate'

# 3. Loads

L_b = ?*(mm)', beam span L_b'
M_Ed = ?*(kN*m)', moment in de verbinding M_Ed'
V_Ed = ?*(kN)', dwarskracht in de verbinding V_Ed'

'<h6>Input summary</h6>
n_boutrijen
t_kp
b_kp
p_kp
w_kp
M_Ed
V_Ed

# 4. Checks

'<i><b>Not yet implemented.</b> This sheet defines inputs and the parametric drawing only. The EN 1993-1-8 §6 component method is planned: end-plate and column-flange T stubs, column-web compression/tension/shear, effective tension per bolt row, M<sub>j,Rd</sub>, rotational stiffness S<sub>j,ini</sub>, and classification.</i>
`;

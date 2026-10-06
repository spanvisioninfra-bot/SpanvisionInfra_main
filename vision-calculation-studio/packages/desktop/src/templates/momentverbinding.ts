/**
 * Momentverbinding — invoerblad bij MomentverbindingDesigner.tsx.
 *
 * VISUEEL ONLY: invoer, zijaanzicht en kopplaataanzicht. De componentenmethode
 * van EN 1993-1-8 §6 (M_j,Rd, rotatiestijfheid S_j, classificatie) is nog niet
 * uitgewerkt.
 *
 * Variabelenamen komen exact overeen met MomentverbindingDesigner.tsx.
 */

export const momentverbinding = `"Moment connection — ligger op column met end plate

'<i>Een momentvaste ligger-kolomverbinding met een geboute kopplaat en
'eventueel een console onder de ligger. De weerstand volgt uit de zwakste
'component: de kopplaat op buiging, de kolomflens, het kolomlijf op druk,
'trek en afschuiving, en de boutrijen. Het aantal boutrijen en de console
'sturen zowel de tekening als de inwendige hefboomsarmen.</i>

# 1. Systeem

@select stabiliteit "Stability van het raamwerk"
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

n_boutrijen = ?', aantal boutrijen'
t_kp = ?*(mm)', dikte kopplaat'
b_kp = ?*(mm)', breedte kopplaat'
e_kp = ?*(mm)', randafstand bovenin de kopplaat'
p_kp = ?*(mm)', steek tussen de boutrijen'
w_kp = ?*(mm)', horizontale hart-op-hart afstand van de bouten'
h_console = ?*(mm)', hoogte van de console'
l_console = ?*(mm)', lengte van de console'
a_flens = ?*(mm)', keeldikte las ligger­flens op kopplaat'
a_lijf = ?*(mm)', keeldikte las liggerlijf op kopplaat'

# 3. Loads

L_b = ?*(mm)', overspanning van de ligger L_b'
M_Ed = ?*(kN*m)', moment in de verbinding M_Ed'
V_Ed = ?*(kN)', dwarskracht in de verbinding V_Ed'

'<h6>Overzicht van de invoer</h6>
n_boutrijen
t_kp
b_kp
p_kp
w_kp
M_Ed
V_Ed

# 4. Toetsing

'<i><b>Nog niet uitgewerkt.</b> Dit blad legt voorlopig alleen de invoer en het
'parametrische beeld vast. De componentenmethode van EN 1993-1-8 §6 — de
'T-stukken van kopplaat en kolomflens, het kolomlijf op druk/trek/afschuiving,
'de effectieve trekkracht per boutrij, M<sub>j,Rd</sub>, de rotatiestijfheid
'S<sub>j,ini</sub> en de classificatie — volgt.</i>
`;

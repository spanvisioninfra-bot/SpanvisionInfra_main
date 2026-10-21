/**
 * Schoorverbinding — invoerblad bij SchoorDesigner.tsx.
 *
 * VISUEEL ONLY: invoer en parametrisch beeld van een hoekstaal op een
 * schetsplaat. De toetsing (EN 1993-1-8 §3.10.3 voor het enkelzijdig
 * aangesloten hoekprofiel) is nog niet uitgewerkt.
 *
 * Variabelenamen komen exact overeen met SchoorDesigner.tsx.
 */

export const schoorverbinding = `"Brace connection — angle to gusset plate

'<i>An angle brace bolted through one leg to a gusset plate. Connecting only one leg produces eccentric loading; EN 1993-1-8 §3.10.3 accounts for it using β<sub>2</sub>/β<sub>3</sub> on the net section. The brace angle controls the gusset geometry.</i>

# 1. Inputs

@select hoekprofiel "Angle section"
  L 40x40x4 = 1
  L 45x45x5 = 2
  L 50x50x5 = 3
  L 60x60x6 = 4
  L 70x70x7 = 5
  L 80x80x8 = 6
  L 90x90x9 = 7
  L 100x100x10 = 8
@end

@select uitvoering "Uitvoering"
  single angle = 1
  double angle (back to back) = 2
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

n_bouten = ?', number of bolts in the row'
t_schets = ?*(mm)', dikte schetsplaat'
hoek = ?', brace angle to the horizontal [degrees]'
e_1 = ?*(mm)', randafstand e_1'
p_1 = ?*(mm)', steek p_1'
b_schets = ?*(mm)', gusset plate width'
h_schets = ?*(mm)', gusset plate height'
a_las = ?*(mm)', keeldikte las schetsplaat'
F_Ed = ?*(kN)', design brace force F_Ed'

'<h6>Input summary</h6>
n_bouten
t_schets
hoek
e_1
p_1
F_Ed

# 2. Checks

'<i><b>Not yet implemented.</b> This sheet defines inputs and a parametric drawing only. Angle tension checks on gross/net sections with β<sub>2</sub>/β<sub>3</sub> from §3.10.3, bolt shear and bearing, gusset plate, and weld checks are planned.</i>
`;

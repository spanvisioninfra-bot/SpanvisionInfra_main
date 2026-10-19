/**
 * Spuwer (noodoverlaat) in een dakrand-opstand volgens
 * NEN-EN 1991-1-3+C1/NB(nl) art. 7.2 / 7.3.
 *
 * Gecalibreerd op 8 de referentie-uitwerking-referenties (A = 600 m²), alle exact gereproduceerd.
 * Sets 1S-5S bij t = 50 jaar (i_r = 0,00005):
 *   1S  n=3  b=600  h=80   h_nd=50 → d_nd = 45,7  d_hw = 96   h_min = 76   UC = 0,95  ✓
 *   2S  n=2  b=600  h=80   h_nd=50 → d_nd = 59,8  d_hw = 110  h_min = 90   UC = 1,12  ✗
 *   3S  n=2  b=300  h=80   h_nd=50 → d_nd = 95,0  d_hw = 145  h_min = 125  UC = 1,56  ✗
 *   4S  n=2  b=600  h=100  h_nd=50 → d_nd = 59,8  d_hw = 110  h_min = 90   UC = 0,90  ✓
 *   5S  n=2  b=600  h=80   h_nd=30 → d_nd = 59,8  d_hw = 90   h_min = 90   UC = 1,12  ✗
 * Ook de ronde-spuwerdiameter klopt: 160 / 160 / 80 / 160 / 160 mm.
 * Sets 6S-8S variëren de ontwerplevensduur (n=3, b=600, h=80, h_nd=30):
 *   6S  t=5 jaar    i_r = 0,000027 → d_nd = 30,3  d_hw = 60  UC = 0,75  ✓
 *   7S  t=15 jaar   i_r = 0,000041 → d_nd = 40,0  d_hw = 70  UC = 0,87  ✓
 *   8S  t=100 jaar  i_r = 0,000056 → d_nd = 49,3  d_hw = 79  UC = 0,99  ✓
 *
 * Uit de referentiebladen afgeleide de referentie-uitwerking-keuzes:
 *   • d_nd rekent met de breedte van één spuwer maal het aantal (b·n), dus met
 *     de totale spuwerbreedte in meters.
 *   • De regenwaterbelasting gebruikt 10 kN/m³ (96 mm → 0,96 kN/m²), niet 9,81.
 *   • h_min = 30 + d_hw − h_nd, wat neerkomt op d_nd + 30: de 30 mm uit §7.3(3)
 *     tegen verstopping wordt bovenop de wáterstand in de spuwer gelegd.
 *   • d_min gebruikt de onafgeronde d_nd (set 1S geeft 160 mm, met de afgeronde
 *     46 mm zou er 158 uitkomen).
 *   • Tabel NB.1 (i_r per referentieperiode), alle vier geverifieerd:
 *     5 jaar → 0,000027 · 15 jaar → 0,000041 · 50 jaar → 0,00005 · 100 jaar → 0,000056.
 *
 * Variabelenamen komen exact overeen met SpuwerDesigner.tsx.
 */

export const spuwer = `"Scupper — emergency overflow in de dakrand (EN 1991-1-3 NB art. 7.2)

'<i>An emergency roof outlet discharges rainwater that the normal drains cannot carry. The bottom of its b × h opening is h<sub>nd</sub> above the roof surface. During the design storm, water rises d<sub>nd</sub> above that edge, giving roof water depth d<sub>hw</sub> = d<sub>nd</sub> + h<sub>nd</sub>. Clause §7.3(3) requires another 30 mm of clear outlet height above the water to reduce blockage risk; this determines the minimum opening height.</i>

# 1. Inputs

A_afv = ?', oppervlakte afvoergebied A [m²]'
n_sp = ?', number of emergency outlets n'
b_sp = ?*(mm)', width of one outlet b'
h_sp = ?*(mm)', height of one outlet h'
h_nd = ?*(mm)', bovenzijde dakbedekking tot onderzijde spuwer h_nd'

@select t_ref "Design working life (reference period t)"
  5 years (temporary) = 5
  15 years (agricultural) = 15
  50 years (buildings) = 50
  100 years (monumental) = 100
@end

#hide
'Tabel NB.1 — regenintensiteit i_r [m³/s]/m² per referentieperiode. Alle vier de
'waarden zijn tegen een de referentie-uitwerking-referentie geverifieerd.
irtab = [5; 15; 50; 100 |0.000027; 0.000041; 0.00005; 0.000056]
i_r = hlookup(irtab; t_ref; 1; 2)
#show

A_afv
n_sp
b_sp
h_sp
b_tot = n_sp*b_sp', total outlet width'
b_tot
h_nd
t_ref', referentieperiode [jaar]'
i_r', rainfall intensity from NB Table NB.1 [m³/s]/m²

# 2. Rainwater flow rate — (7.2)

Q_h = A_afv*i_r', regenwaterdebiet [m³/s]'
Q_h

# 3. Water depth above the bottom of the emergency outlet — (7.4)

'<i>d<sub>nd</sub> = 0.7·(Q<sub>h</sub>/(b·n))<sup>2/3</sup>, with width and result in meters; the result below is converted to mm.</i>
#hide
'Breedte van één spuwer in meters — de formule is empirisch en rekent in SI.
b_m = b_sp/(1000*mm)
#show
b_m', width of one outlet [m]'
d_nd = 0.7*(Q_h/(b_m*n_sp))^(2/3)*1000*mm', water depth above the outlet bottom'
d_nd

# 4. Waterstand en regenwaterbelasting — (7.8)

d_hw = d_nd + h_nd', waterhoogte t.p.v. de spuwer'
d_hw
q_rw = 10*kN/m^3*d_hw to kN/m^2', regenwaterbelasting t.p.v. de spuwer'
q_rw

# 5. Minimum scupper height — §7.3(3)

'<i>Clause §7.3(3) requires 30 mm additional outlet height to reduce blockage: 30 + d<sub>hw</sub> is the required height above roofing, of which h<sub>nd</sub> is already below the outlet.</i>
h_30 = 30*mm + d_hw', required height above the roof surface'
h_30
h_min = 30*mm + d_hw - h_nd', minimum required outlet height'
h_min
UC = h_min/h_sp
#if UC ≤ 1.0
    'u.c. = h<sub>min</sub>/h = 'UC'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
#else
    'u.c. = h<sub>min</sub>/h = 'UC'<span style="color: red"> > 1.0 → <b>fails</b></span>
#end if

# 6. Circular scupper at equal d_nd — (7.7)

'<i>Inverse calculation: which diameter gives the same water depth d<sub>nd</sub> at the same flow per outlet? From d<sub>nd</sub> = 0.29·(Q<sub>h</sub>/d)<sup>2/3</sup>, d = (Q<sub>h</sub>/n)/(d<sub>nd</sub>/0.29)<sup>1.5</sup>.</i>
#hide
dnd_m = d_nd/(1000*mm)
#show
d_min = (Q_h/n_sp)/(dnd_m/0.29)^1.5*1000*mm', minimum required round outlet diameter'
d_min

# 7. Summary

#if UC ≤ 1.0
    '<b>u.c. = 'UC'</b><span style="color: green"> ≤ 1.0 → <b>Spuwer passes</b></span>
#else
    '<b>u.c. = 'UC'</b><span style="color: red"> > 1.0 → <b>Spuwer fails</b></span>
#end if

'<hr/><i>Limitations:<ul><li>Eight reference cases were reproduced exactly (A=600 m², n=2/3, b=300/600 mm, h=80/100 mm, h<sub>nd</sub>=30/50 mm, t=5/15/50/100 years), including d<sub>nd</sub>, d<sub>hw</sub>, q, h<sub>min</sub>, UC, and round outlet diameter.</li><li>Rainwater load uses 10 kN/m³: d<sub>hw</sub>=96 mm gives 0.96 kN/m².</li><li>h<sub>min</sub> = 30 + d<sub>hw</sub> − h<sub>nd</sub> reduces to d<sub>nd</sub> + 30. A higher sill does not reduce UC, but does change water depth d<sub>hw</sub> and rainwater load.</li><li>Round outlet diameter uses unrounded d<sub>nd</sub>.</li><li>Rainfall intensity i<sub>r</sub> follows design working life (NB Table NB.1): 5 years → 0.000027; 15 → 0.000041; 50 → 0.00005; 100 → 0.000056 [m³/s]/m². All four were reference-verified.</li></ul></i>
`;

/**
 * Oplegging op metselwerk — geconcentreerde last op een metselwerkwand volgens
 * NEN-EN 1996-1-1:2006+A1:2013+NB:2018 §6.1.3.
 *
 * Methodiek exact gespiegeld aan de de referentie-uitwerking-referentieberekening
 * (3BM Bouwtechniek, document1.pdf, de referentie-uitwerking 2027.3.02):
 *   f_k  = K·f_b^α·f_m^β                                (3.2)
 *   h_c  = h − h_k                                       (effectieve hoogte)
 *   l_efm = a_L + min(a_1; ½·h_c/tan60) + min(L_r; ½·h_c/tan60)
 *   β    = (1 + 0,3·a_1/h_c)·(1,5 − 1,1·A_b/A_ef) ≤ β_max = min(1,25+a_1/2h_c; 1,5)
 *   N_Rdc = β·A_b·f_d                                    (6.10)
 *   N_Ed  = N_Edc + a_L·q_Edc                            (incl. wandlast over oplegging)
 *   UC    = N_Ed / N_Rdc                                 (6.9)
 *
 * De variabelenamen komen exact overeen met OplegMetselwerkDesigner.tsx.
 *
 * ⚠ Openstaand (zie noten onderaan): de factoren K/α/β zijn alleen voor
 * cellenbeton geverifieerd tegen de referentie; de overige steensoorten staan
 * op standaard EN-waarden (0,7/0,3) en moeten nog tegen NB:2018 worden getoetst.
 */

export const oplegMetselwerk = `"Bearing on masonry — concentrated load (EN 1996-1-1 §6.1.3)

'<i>Checks concentrated bearing (a beam end or lintel in a recess) on an unreinforced masonry wall. The load spreads at 60° over effective height h<sub>c</sub> = h − h<sub>k</sub>, giving effective length l<sub>efm</sub> at mid-height. Method per NEN-EN 1996-1-1+NB §6.1.3 and the reference calculation.</i>

# 1. Masonry & material

@select overspanning "Span direction"
  Perpendicular = 1
  Parallel = 2
@end

@select steensoort "Masonry unit type (holtepercentage → steengroep)"
  Clay brick <25% = 1
  Clay brick <55% = 2
  Calcium silicate brick <25% = 3
  Calcium silicate brick <55% = 4
  Concrete block <25% = 5
  Concrete block <60% = 6
  Aerated concrete <25% = 7
@end

f_b = ?', normalized masonry unit compressive strength f_b [N/mm²] — fb value (clay/concrete units), CS class (calcium silicate, CS12→12), or G class (aerated concrete, G2→2)'

@select morteltype "Mortar type"
  Masonry mortar = 1
  Thin-layer mortar = 2
@end

f_m = ?', mortar strength f_m [N/mm²] — M class (general-purpose) or L class (thin-layer); thin-layer mortar does not affect f_k (β=0)'

@select steencategorie "Masonry unit category / uitvoeringsklasse (basis γ_M)"
  Category I = 1
  Category II = 2
  Category III = 3
@end

#hide
'Steenmatrix: [id | K_metsel | K_lijm]. f_k = K·f_b^α·f_m^β.
'Metselmortel: α=0,65 · β=0,25 · K = 0,6 (groep 1 <25%) / 0,5 (groep 2 <55%/<60%).
'Lijmmortel:   α=0,85 · β=0   · K per steensoort (EN-tabel; cellenbeton<25% = 0,8 geverifieerd).
steenmat = [1; 2; 3; 4; 5; 6; 7 |0.6; 0.5; 0.6; 0.5; 0.6; 0.5; 0.6 |0.75; 0.70; 0.80; 0.70; 0.80; 0.70; 0.80]
K_metsel = hlookup(steenmat; steensoort; 1; 2)
K_lijm = hlookup(steenmat; steensoort; 1; 3)
K = if(morteltype ≡ 2; K_lijm; K_metsel)
α = if(morteltype ≡ 2; 0.85; 0.65)
β_exp = if(morteltype ≡ 2; 0; 0.25)
'γ_M = basis(categorie), alleen CC1 verlaagt met 0,2 (CC2 = CC3 = basis). Gekalibreerd:
'Cat I → CC1=1,5 · CC2=1,7 · CC3=1,7; Cat II → CC1=2,0. base: I=1,7 · II=2,2 · III=2,7(geëxtrapoleerd).
γ_base = if(steencategorie ≡ 1; 1.7; if(steencategorie ≡ 2; 2.2; 2.7))
γ_M = γ_base - if(CC ≡ 1; 0.2; 0)
'Referentie past de bovengrens f_m ≤ 2·f_b NIET toe (alleen ≤ 20 N/mm²).
f_m_eff = min(f_m; 20)
#show

f_k = K*f_b^α*f_m_eff^β_exp', karakteristieke druksterkte metselwerk (form. 3.2) [N/mm²]'
f_k
f_d = f_k/γ_M', design compressive strength (3.1) [N/mm²]'
f_d

# 2. Geometry

h = ?', wandhoogte [mm]'
t = ?', wanddikte [mm]'
a_L = ?', bearing length in the wall plane [mm]'
a_t = ?', bearing width through the wall thickness [mm]'
h_k = ?', recess depth — recessed beam [mm]'
a_1 = ?', distance from wall end to the near bearing edge [mm]'
L_r = ?', wall length to the right of the bearing [mm]'
exc = ?', load eccentricity relative to the wall centerline [mm]'

h_c = h - h_k', effective height to the load level (bottom of recess)'
h_c

# 3. Load

N_Edc = ?', geconcentreerde last (F-last) [kN]'
q_Edc = ?', verdeelde wandlast (Q-last) [kN/m]'

# 4. Load spread (60°, at ½·h_c)

'<i>The load spreads at 60° from the bearing plate at the bottom of the recess. Effective length l<sub>efm</sub> is determined at half the effective height and limited by the wall end a<sub>1</sub> and available wall length L<sub>r</sub>.</i>

#hide
tan60 = 1.7320508
reach = 0.5*h_c/tan60', horizontale spreiding per zijde [mm]'
links = min(a_1; reach)', l_efm;1'
rechts = min(L_r; reach)', l_efm;2'
#show
l_efm = a_L + links + rechts', effective length (= b_opl + l_efm;1 + l_efm;2)'
l_efm

# 5. Concentrated load check — art. 6.1.3

A_b = a_L*a_t', belaste (opleg)vlak [mm²]'
A_ef = l_efm*t', effectief vlak [mm²]'
A_b
A_ef

#hide
ratio_Ab = A_b/A_ef
β_calc = (1 + 0.3*a_1/h_c)*(1.5 - 1.1*ratio_Ab)
β_max = min(1.25 + a_1/(2*h_c); 1.5)
#show
β = max(1.0; min(β_calc; β_max))', verhogingsfactor geconcentreerde last (6.11)'
β
N_Rdc = β*A_b*f_d/1000', opnamecapaciteit lokale oplegging [kN] (6.10)'
N_Rdc
N_Ed = N_Edc + a_L/1000*q_Edc', rekenlast incl. wandlast over de oplegging [kN]'
N_Ed

UC = N_Ed/N_Rdc
#if UC ≤ 1.0
    'UC = N<sub>Ed</sub>/N<sub>Rdc</sub> = 'UC'<span style="color: green"> ≤ 1,0 → <b>passes</b></span> (6.9)
#else
    'UC = N<sub>Ed</sub>/N<sub>Rdc</sub> = 'UC'<span style="color: red"> > 1,0 → <b>fails</b></span> (6.9)
#end if

# 6. Nevenvoorwaarden

'<b>Geldigheid methode 6.1.3 — verhouding vlakken:</b>
ratio_Ab = A_b/A_ef
#if ratio_Ab ≤ 0.45
    'A<sub>b</sub>/A<sub>ef</sub> = 'ratio_Ab'<span style="color: green"> ≤ 0,45 → <b>passes</b></span>
#else
    'A<sub>b</sub>/A<sub>ef</sub> = 'ratio_Ab'<span style="color: red"> > 0,45 → method is invalid</span>
#end if

'<b>Detaillering — art. 8.1.6(1): minimale oplegmaat ≥ 90 mm:</b>
opleg_min = min(a_L; a_t)
#if opleg_min ≥ 90
    'min(a<sub>L</sub>; a<sub>t</sub>) = 'opleg_min' mm<span style="color: green"> ≥ 90 mm → <b>passes</b></span>
#else
    'min(a<sub>L</sub>; a<sub>t</sub>) = 'opleg_min' mm<span style="color: red"> < 90 mm → <b>fails</b></span>
#end if

'<b>Excentriciteit — voorwaarde e ≤ t/4:</b>
#if abs(exc) ≤ t/4
    'e = 'abs(exc)' mm<span style="color: green"> ≤ t/4 = 't/4' mm → <b>passes</b></span>
#else
    'e = 'abs(exc)' mm<span style="color: red"> > t/4 = 't/4' mm → buiten toepassingsgebied</span>
#end if

# 7. Summary

#if UC ≤ 1.0
    '<b>UC = 'UC'</b><span style="color: green"> ≤ 1,0 → <b>Bearing passes</b></span>
#else
    '<b>UC = 'UC'</b><span style="color: red"> > 1,0 → <b>Bearing fails</b></span>
#end if

'<hr/><i>Limitations and open points against reference calculations:<ul><li><b>General-purpose mortar (M class):</b> f_k = K·f_b<sup>0.65</sup>·f_m<sup>0.25</sup>; K depends on unit group (group 1 &lt;25%: 0.6; group 2 &lt;55%/&lt;60%: 0.5). Verified: calcium silicate &lt;25%, aerated concrete &lt;25% (K=0.6), and clay brick &lt;55% (K=0.5). Clay brick &lt;25%, concrete units, and calcium silicate &lt;55% follow the group pattern.</li><li><b>Thin-layer mortar (L class):</b> f_k = K·f_b<sup>0.85</sup> (β=0; f_m drops out), with K by unit type from the EN table. Aerated concrete &lt;25% (K=0.8) is verified; other K values remain unconfirmed.</li><li><b>γ_M depends on category and CC:</b> category bases I=1.7, II=2.2, III=2.7; only CC1 subtracts 0.2 (CC2=CC3=base). Verified: category I CC1=1.5, CC2=1.7, CC3=1.7, and category II CC1=2.0. Category III and category II CC2/CC3 are extrapolated.</li><li><b>f<sub>m</sub> limit:</b> the reference omits f<sub>m</sub> ≤ 2·f<sub>b</sub> (§3.6.1.2), enforcing only f<sub>m</sub> ≤ 20. This sheet reproduces that <b>departure from the code</b>; assess whether it is appropriate.</li><li>N<sub>Ed</sub> includes wall load: N<sub>Edc</sub> + a<sub>L</sub>·q<sub>Edc</sub>.</li><li>l<sub>efm</sub> uses 60° spread over ½·h<sub>c</sub>, h<sub>c</sub> = h − h<sub>k</sub>, limited by wall end a<sub>1</sub> (which may be zero) and available wall length.</li><li>For art. 8.1.6, the reference shows one orientation-dependent bearing dimension. This sheet checks min(a<sub>L</sub>; a<sub>t</sub>) ≥ 90 mm, giving the same conclusion.</li></ul></i>
`;

/**
 * Boutberekening — weerstanden van één bout volgens NEN-EN 1993-1-8 tabel 3.4.
 *
 * BOUWSTEEN: dit blad levert F_v,Rd, F_b,Rd, F_t,Rd en B_p,Rd voor één bout.
 * De momentverbinding, dwarskrachtverbinding, schoorverbinding en penverbinding
 * hangen daaraan; de formules staan daarom bewust op zichzelf, zonder aannames
 * over de verbinding waarin de bout zit.
 *
 * Gecalibreerd op zes de referentie-uitwerking-referenties (document1C t/m 6C), basis
 * S235 · 8.8 · M16 · draad in het afschuifvlak · eindbout · t 20 · e₁ 30 ·
 * p₁ 80 · e₂ 25 · p₂ 60 → F_t,Rd 90,4 · F_v,Rd 60,3 · F_b,Rd 112,1 kN.
 * Varianten: schacht in het afschuifvlak (F_v,Rd 77,2 — met A i.p.v. A_s) ·
 * binnenste bout (α_d = p₁/3d₀ − ¼ = 1,231 → α_b 1,00 → F_b,Rd 201,7) ·
 * randbout (identiek aan de eindbout) · enkele bout (k₁ zonder de p₂-tak) ·
 * e₁ 60 met e₂ 50 (k₁ op de bovengrens 2,5 én α_b op 1,00 → F_b,Rd 230,4).
 * F_t,Rd, F_v,Rd en F_b,Rd komen in alle zes exact overeen.
 *
 * AFWIJKING — B_p,Rd. de referentie-uitwerking vult voor d_m de sleutelwijdte over de platte
 * kanten in (M16 → 24,0 mm). §3.6.1(3) vraagt het gemiddelde van de maat over
 * de platte kanten en die over de hoeken, dus 25,4 mm voor M16. de referentie-uitwerking komt
 * daardoor 5,5 % lager uit (260,6 tegen 275,8 kN) — veilig, maar niet
 * economisch. Zie docs/afwijkingen-referentie.
 *
 * AFWIJKING — boutpositie. Tabel 3.4 kent twee ONAFHANKELIJKE assen: eind- of
 * binnenste bout in de krachtsrichting (bepaalt α_d) en rand- of binnenste bout
 * loodrecht daarop (bepaalt k₁). de referentie-uitwerking heeft die tot één keuzelijst
 * samengetrokken en neemt voor k₁ het minimum van beide takken. Dat is veilig,
 * maar de combinatie "binnenste bout loodrecht op de kracht" is er niet mee uit
 * te drukken. Dit blad houdt de twee assen gescheiden.
 *
 * §3.6.1(10) — de begrenzing F_b,Rd ≤ 1,5·f_u·d·t/γ_M2 bij een enkele overlap
 * met één boutrij zit erin als aparte keuze (`overlaptype`). Alle zes
 * referentiebladen hebben twee boutrijen, dus die stand blijft ongetoetst; op
 * de basisinvoer zou de grens 138,2 kN zijn, ruim boven de 112,1 uit tabel 3.4.
 *
 * QUIRK — de referentie-uitwerking drukt bij B_p,Rd "3,14" af maar rekent met de volle π;
 * met 3,14 zou er 260,4 in plaats van 260,6 kN uitkomen.
 *
 * Variabelenamen komen exact overeen met BoutDesigner.tsx.
 */

export const boutberekening = `"Bolt calculation — single-bolt resistances per NEN-EN 1993-1-8 Table 3.4

'<i>Calculates four resistances of a single bolt: tension, shear, plate bearing, and punching of the plate beneath the head or nut. This sheet is a building block: connection sheets use its F<sub>v,Rd</sub> and F<sub>b,Rd</sub> values.</i>

# 1. Inputs

@select staalsoort "Steel grade plaatmateriaal"
  S235 = 235
  S275 = 275
  S355 = 355
@end

@select boutkwaliteit "Bolt grade"
  4.6 = 46
  4.8 = 48
  5.6 = 56
  5.8 = 58
  6.8 = 68
  8.8 = 88
  10.9 = 109
@end

@select boutdiameter "Bolt diameter"
  M12 = 12
  M16 = 16
  M20 = 20
  M24 = 24
  M27 = 27
  M30 = 30
  M36 = 36
@end

@select afschuifvlak "Shear plane location"
  Shear plane through thread = 1
  Shear plane through shank = 2
@end

@select boutpositie "Position along the force direction — determines α_d"
  Eindbout = 1
  Binnenste bout = 2
@end

@select randpositie "Position perpendicular to the force — determines k_1"
  Randbout = 1
  Binnenste bout = 2
@end

@select overlaptype "Connection form — §3.6.1(10)"
  Overige cases = 1
  Single lap with one bolt row = 2
@end

t_plaat = ?*(mm)', thinnest plate thickness t — also used as t_p for punching'
e_1 = ?*(mm)', eindafstand in de krachtsrichting e_1'
p_1 = ?*(mm)', pitch along the force direction p_1 — inner bolts only'
e_2 = ?*(mm)', edge distance perpendicular to the force e_2'
p_2 = ?*(mm)', pitch perpendicular to the force p_2 — inner bolts only'

n_v = ?', number of shear planes in this bolt'

'<i>Leave both forces below at zero to obtain resistances only; §8 will then be omitted. The reference program has no force inputs and prints resistances only.</i>
F_v,Ed = ?*(kN)', bolt shear force — 0 = no check'
F_t,Ed = ?*(kN)', bolt tension force — 0 = no check'

# 2. Material- en boutgegevens

#hide
'Tabellen op de kale keuzewaarde; hieronder pas van eenheden voorzien.
fub_ = if(boutkwaliteit ≡ 46; 400; if(boutkwaliteit ≡ 48; 400; if(boutkwaliteit ≡ 56; 500; if(boutkwaliteit ≡ 58; 500; if(boutkwaliteit ≡ 68; 600; if(boutkwaliteit ≡ 88; 800; 1000))))))
fyb_ = if(boutkwaliteit ≡ 46; 240; if(boutkwaliteit ≡ 48; 320; if(boutkwaliteit ≡ 56; 300; if(boutkwaliteit ≡ 58; 400; if(boutkwaliteit ≡ 68; 480; if(boutkwaliteit ≡ 88; 640; 900))))))
'α_v = 0,6 voor 4.6, 5.6 en 8.8; 0,5 voor 4.8, 5.8, 6.8 en 10.9 (tabel 3.4).
avd_ = if(boutkwaliteit ≡ 46; 0.6; if(boutkwaliteit ≡ 56; 0.6; if(boutkwaliteit ≡ 88; 0.6; 0.5)))
'Staalsoort: f_u volgens de Nationale Bijlage bij NEN-EN 1993-1-1, t ≤ 40 mm.
fu_ = if(staalsoort ≡ 235; 360; if(staalsoort ≡ 275; 430; 490))
'Gatdiameter bij normale gatspeling (EN 1090-2): +1 mm t/m M14, +2 mm t/m M24, +3 mm daarboven.
d0_ = if(boutdiameter ≡ 12; 13; if(boutdiameter ≡ 16; 18; if(boutdiameter ≡ 20; 22; if(boutdiameter ≡ 24; 26; if(boutdiameter ≡ 27; 30; if(boutdiameter ≡ 30; 33; 39))))))
'Spanningsoppervlak van de draad volgens ISO 898-1.
As_ = if(boutdiameter ≡ 12; 84.3; if(boutdiameter ≡ 16; 157; if(boutdiameter ≡ 20; 245; if(boutdiameter ≡ 24; 353; if(boutdiameter ≡ 27; 459; if(boutdiameter ≡ 30; 561; 817))))))
'Sleutelwijdte s over de platte kanten en maat e over de hoeken (ISO 4014/4032).
sw_ = if(boutdiameter ≡ 12; 18; if(boutdiameter ≡ 16; 24; if(boutdiameter ≡ 20; 30; if(boutdiameter ≡ 24; 36; if(boutdiameter ≡ 27; 41; if(boutdiameter ≡ 30; 46; 55))))))
ew_ = if(boutdiameter ≡ 12; 20.03; if(boutdiameter ≡ 16; 26.75; if(boutdiameter ≡ 20; 32.95; if(boutdiameter ≡ 24; 39.55; if(boutdiameter ≡ 27; 45.20; if(boutdiameter ≡ 30; 50.85; 60.79))))))
γ_M2 = 1.25
k_2 = 0.9
#show

d = boutdiameter*mm', nominale boutdiameter'
d_0 = d0_*mm', hole diameter for normal clearance'
A_s = As_ mm^2', tensile stress area of the thread'
A = pi*d^2/4', area of the unthreaded shank'
f_ub = fub_ N/mm^2', bolt material tensile strength (Table 3.1)'
f_yb = fyb_ N/mm^2', bolt material yield strength (Table 3.1)'
f_u = fu_ N/mm^2', plate material tensile strength'
d_m = (sw_ + ew_)/2*mm', mean of widths across flats and corners — §3.6.1(3)'

d
d_0
A_s
A
f_ub
f_u
d_m

# 3. Tension resistance — table 3.4

'<i>Tension resistance always uses A<sub>s</sub>: the threaded section governs regardless of the shear-plane location. k<sub>2</sub> = 0.9 for an ordinary bolt and 0.63 for a countersunk bolt.</i>

F_t,Rd = k_2*f_ub*A_s/γ_M2 to kN
F_t,Rd

# 4. Afschuifweerstand per afschuifvlak — table 3.4

'<i>When the shear plane passes through threads, resistance uses A<sub>s</sub> and α<sub>v</sub> depends on bolt grade. Through an unthreaded shank, it uses A and α<sub>v</sub> = 0.6 for every grade.</i>

A_v = if(afschuifvlak ≡ 1; A_s; A)', section at the shear plane'
α_v = if(afschuifvlak ≡ 1; avd_; 0.6)', afschuiffactor'

A_v
α_v
F_v,Rd = α_v*f_ub*A_v/γ_M2 to kN', per afschuifvlak'
F_v,Rd
F_v,Rd,tot = n_v*F_v,Rd', total over all shear planes in this bolt'
F_v,Rd,tot

# 5. Stuikweerstand — table 3.4

'<i>Table 3.4 treats the two axes independently. Along the force direction, α<sub>d</sub> uses e<sub>1</sub> for an end bolt and p<sub>1</sub> for an inner bolt. Perpendicular to the force, k<sub>1</sub> uses e<sub>2</sub> for an edge bolt and p<sub>2</sub> for an inner bolt. These positions can be set independently; k<sub>1</sub> is capped at 2.5.</i>

k_1,rand = 2.8*e_2/d_0 - 1.7', edge-bolt branch'
k_1,bin = 1.4*p_2/d_0 - 1.7', inner-bolt branch'
k_1 = min(if(randpositie ≡ 1; k_1,rand; k_1,bin); 2.5)

k_1,rand
k_1,bin
k_1

α_d = if(boutpositie ≡ 1; e_1/(3*d_0); p_1/(3*d_0) - 0.25)', e_1 branch for an end bolt, p_1 branch for an inner bolt'
α_d
α_b = min(min(α_d; f_ub/f_u); 1.0)
α_b

F_b,Rd,tab = k_1*α_b*f_u*d*t_plaat/γ_M2 to kN', per Table 3.4'
F_b,Rd,tab

'<h6>Single-lap connection with one bolt row — §3.6.1(10) limit</h6>

'<i>A single-lap connection with one bolt row can rotate because of the eccentric single shear plane. The code therefore limits bearing resistance to 1.5·f<sub>u</sub>·d·t/γ<sub>M2</sub> and requires washers under both the head and nut.</i>

F_b,Rd,cap = 1.5*f_u*d*t_plaat/γ_M2 to kN', bovengrens uit §3.6.1(10)'
F_b,Rd,cap
F_b,Rd,nb = if(overlaptype ≡ 2; min(F_b,Rd,tab; F_b,Rd,cap); F_b,Rd,tab)', per Table 3.4'
'<i>Alternative assumption — edge-position k<sub>1</sub> (register item 7). The reference calculation combines the two axes of Table 3.4 and always takes the smaller branch.</i>
#hide
k_1,XC = min(min(k_1,rand; k_1,bin); 2.5)
F_b,Rd,tab,XC = k_1,XC*α_b*f_u*d*t_plaat/γ_M2 to kN
#show
k_1,XC
F_b,Rd,XC = if(overlaptype ≡ 2; min(F_b,Rd,tab,XC; F_b,Rd,cap); F_b,Rd,tab,XC)', volgens de referentie-uitwerking'
F_b,Rd = if(rekenwijze ≡ 1; F_b,Rd,XC; F_b,Rd,nb)', gehanteerde stuikweerstand'
F_b,Rd,nb
F_b,Rd,XC
F_b,Rd

#if overlaptype ≡ 2
    #if F_b,Rd,tab > F_b,Rd,cap
        '<b style="color: #b45309">The §3.6.1(10) limit governs:</b> Table 3.4 gives 'F_b,Rd,tab' kN, but a single-lap connection with one bolt row is limited to 'F_b,Rd,cap' kN. <b>Provide washers under both head and nut</b>, as required by §3.6.1(10).
    #else
        'The §3.6.1(10) limit ('F_b,Rd,cap' kN) does not govern here; Table 3.4 already gives 'F_b,Rd,tab' kN. <b>Washers under both head and nut remain required.</b>
    #end if
#else
    '<i>Not applicable: the limit applies only to a single-lap connection with one bolt row. If applicable here, resistance would be capped at 'F_b,Rd,cap' kN.</i>
#end if

# 6. Ponsweerstand — §3.6.1(3)

'<i>Punching of the plate beneath the head or nut. t<sub>p</sub> is the thickness of the plate bearing against the head or nut; this sheet equates it to the entered plate thickness.</i>

t_p = t_plaat
B_p,Rd,nb = 0.6*pi*d_m*t_p*f_u/γ_M2 to kN', with d_m per §3.6.1(3)'
'<i>Alternative assumption — d<sub>m</sub> (register item 6). The reference calculation uses width across flats where §3.6.1(3) requires the mean of widths across flats and corners. This gives a lower, conservative punching resistance.</i>
d_m,XC = sw_*mm', sleutelwijdte — de referentie-uitwerking'
B_p,Rd,XC = 0.6*pi*d_m,XC*t_p*f_u/γ_M2 to kN', volgens de referentie-uitwerking'
B_p,Rd = if(rekenwijze ≡ 1; B_p,Rd,XC; B_p,Rd,nb)', gehanteerde ponsweerstand'
B_p,Rd,nb
B_p,Rd,XC
B_p,Rd

# 7. Afstandseisen — table 3.3

'<i>These are warnings, separate from resistance calculations. Table 3.4 applies only within these limits. The reference program does not check them.</i>

#hide
e1min = 1.2*d_0
e2min = 1.2*d_0
p1min = 2.2*d_0
p2min = 2.4*d_0
pmax = min(14*t_plaat; 200 mm)
'Eenheidloos maken, anders vergelijkt de #if een lengte met een kaal getal.
tekort = (if(e_1 < e1min; 1; 0) + if(e_2 < e2min; 1; 0) + if(boutpositie ≡ 2; if(p_1 < p1min; 1; 0); 0) + if(randpositie ≡ 2; if(p_2 < p2min; 1; 0); 0) + if(boutpositie ≡ 2; if(p_1 > pmax; 1; 0); 0) + if(randpositie ≡ 2; if(p_2 > pmax; 1; 0); 0))
#show

'<table style="border-collapse:collapse; font-size:13px">
'<tr><th style="text-align:left; padding:2px 12px 2px 0">Afstand</th><th style="text-align:right; padding-right:14px">aanwezig [mm]</th><th style="text-align:right; padding-right:14px">minimum [mm]</th><th style="text-align:right">maximum [mm]</th></tr>
'<tr><td style="padding:2px 12px 2px 0">e<sub>1</sub></td><td style="text-align:right; padding-right:14px">'e_1'</td><td style="text-align:right; padding-right:14px">1,2 d<sub>0</sub> = 'e1min'</td><td style="text-align:right">—</td></tr>
'<tr><td style="padding:2px 12px 2px 0">e<sub>2</sub></td><td style="text-align:right; padding-right:14px">'e_2'</td><td style="text-align:right; padding-right:14px">1,2 d<sub>0</sub> = 'e2min'</td><td style="text-align:right">—</td></tr>
'<tr><td style="padding:2px 12px 2px 0">p<sub>1</sub></td><td style="text-align:right; padding-right:14px">'p_1'</td><td style="text-align:right; padding-right:14px">2,2 d<sub>0</sub> = 'p1min'</td><td style="text-align:right">'pmax'</td></tr>
'<tr><td style="padding:2px 12px 2px 0">p<sub>2</sub></td><td style="text-align:right; padding-right:14px">'p_2'</td><td style="text-align:right; padding-right:14px">2,4 d<sub>0</sub> = 'p2min'</td><td style="text-align:right">'pmax'</td></tr>
'</table>

#if tekort ≡ 0
    '<span style="color: green">All applicable distances comply with Table 3.3.</span>
#else
    '<span style="color: red">'tekort' distance(s) fall outside Table 3.3; the resistances above cannot then be used without further assessment.</span>
#end if

'<i>The e<sub>1</sub> and e<sub>2</sub> maxima (4t + 40 mm) apply only to structures exposed to weather and are not checked here. p<sub>1</sub> and p<sub>2</sub> are checked only where the bolt is an inner bolt in the relevant direction.</i>

# 8. Checking de bout

#hide
'Eenheidloos, zodat de #if met een kaal getal kan vergelijken.
belast = (F_v,Ed + F_t,Ed)/(1*kN)
#show

#if belast ≤ 0
    '<i>No forces entered — this sheet gives resistances only. Enter F<sub>v,Ed</sub> and/or F<sub>t,Ed</sub> to obtain unity checks.</i>
#else
    'Shear and bearing are checked separately; tension is checked through both the bolt and punching of the plate.

    UC_v = F_v,Ed/F_v,Rd,tot', bolt shear'
    UC_b = F_v,Ed/F_b,Rd', stuik in de plaat'
    UC_t = F_t,Ed/F_t,Rd', bolt tension'
    UC_p = F_t,Ed/B_p,Rd', plate punching'
    UC_v
    UC_b
    UC_t
    UC_p

    'Combined tension and shear use the interaction expression in Table 3.4.
    UC_vt = F_v,Ed/F_v,Rd,tot + F_t,Ed/(1.4*F_t,Rd)', combined tension and shear'
    UC_vt

    #hide
    UC_max = max(max(max(UC_v; UC_b); max(UC_t; UC_p)); UC_vt)
    #show
    #if UC_max ≤ 1.0
        '<b style="color: green">Passes — governing unity check 'UC_max'.</b>
    #else
        '<b style="color: red">Fails — governing unity check 'UC_max'.</b>
    #end if
#end if

# 9. Difference from the reference program

'<i>This sheet follows the code. The reference calculation differs at two points; the comparisons below show the effect for these inputs. The complete register is in <b>docs/afwijkingen-referentie</b>.</i>

#hide
'Beide takken staan al bij §6 en §8; hier alleen het verschil, eenheidloos.
'Let op: vergelijken met de NORM-tak, niet met de gehanteerde waarde — anders
'meldt dit blok "geen afwijking" zodra de de referentie-uitwerking-stand is gekozen.
Δk = abs(F_b,Rd,nb - F_b,Rd,XC)/(1*kN)
#show

'<b style="color: #1d4ed8">B<sub>p,Rd</sub> — d<sub>m</sub> per §3.6.1(3).</b> The reference calculation uses width across flats ('d_m,XC' mm for M'boutdiameter'), while §3.6.1(3) requires its mean with width across corners ('d_m' mm). This gives 'B_p,Rd,nb' kN versus 'B_p,Rd,XC' kN; the reference result is <b>conservative but uneconomical</b>.

#if Δk ≤ 0.05
    '<span style="color: green">Bearing resistance agrees for these inputs: F<sub>b,Rd</sub> = 'F_b,Rd,XC' kN in both.</span>
#else
    '<b style="color: #1d4ed8">F<sub>b,Rd</sub> — k<sub>1</sub> for an inner bolt perpendicular to the force.</b> The reference calculation merges the two Table 3.4 axes into one selection and uses the minimum of both branches ('k_1,XC'). The table requires only the p<sub>2</sub> branch for this position ('k_1'). This gives 'F_b,Rd,nb' kN versus 'F_b,Rd,XC' kN. <i>The reference program cannot represent this configuration, so this comparison has not been verified against a reference sheet.</i>
#end if

# 10. Summary

'<table style="border-collapse:collapse; font-size:13px">
'<tr><th style="text-align:left; padding:2px 12px 2px 0">Resistance</th><th style="text-align:right">Value</th></tr>
'<tr><td style="padding:2px 12px 2px 0">F<sub>t,Rd</sub> — bolt tension</td><td style="text-align:right">'F_t,Rd' kN</td></tr>
'<tr><td style="padding:2px 12px 2px 0">F<sub>v,Rd</sub> — shear per shear plane</td><td style="text-align:right">'F_v,Rd' kN</td></tr>
'<tr><td style="padding:2px 12px 2px 0">F<sub>v,Rd</sub> — over all shear planes (n<sub>v</sub> = 'n_v')</td><td style="text-align:right">'F_v,Rd,tot' kN</td></tr>
'<tr><td style="padding:2px 12px 2px 0">F<sub>b,Rd</sub> — plate bearing</td><td style="text-align:right">'F_b,Rd' kN</td></tr>
'<tr><td style="padding:2px 12px 2px 0">B<sub>p,Rd</sub> — punching</td><td style="text-align:right">'B_p,Rd' kN</td></tr>
'</table>

'<hr/><i>Limitations:<ul><li>Calibrated against <b>six</b> reference calculations (document1C–6C). The S235 / 8.8 / M16 threaded end-bolt case, t 20, e<sub>1</sub> 30, p<sub>1</sub> 80, e<sub>2</sub> 25, p<sub>2</sub> 60, gives F<sub>t,Rd</sub> 90.4, F<sub>v,Rd</sub> 60.3, and F<sub>b,Rd</sub> 112.1 kN. Variants include shank in the shear plane (A instead of A<sub>s</sub>: 77.2), inner bolt (α<sub>d</sub> = p<sub>1</sub>/3d<sub>0</sub> − ¼ = 1.231, capped α<sub>b</sub> = 1.00: 201.7), edge bolt, single bolt, and e<sub>1</sub> 60 with e<sub>2</sub> 50 (k<sub>1</sub> = 2.5, α<sub>b</sub> = 1.00: 230.4). Tension, shear, and bearing agree exactly in all six; punching differs because of d<sub>m</sub>.</li><li><b>Not reference-verified:</b> grades with α<sub>v</sub> = 0.5 (4.8, 5.8, 6.8, 10.9), steel grades other than S235, diameters other than M16, and §8 unity checks. The reference program prints resistances without force input.</li><li>Enable the <b>§3.6.1(10)</b> limit manually for a <b>single-lap connection with one bolt row</b>. Reference sheets have two rows, so this mode is not reference-verified. Washers under both head and nut are required.</li><li>Connection modules must separately apply <b>§3.8</b> long-joint reduction β<sub>Lf</sub> when L<sub>j</sub> &gt; 15d, and <b>§3.6.1(12)</b> packing-plate reduction β<sub>p</sub> when t<sub>p</sub> &gt; d/3, to the F<sub>v,Rd</sub> supplied here.</li><li><b>Block tearing</b> (§3.10.2) and <b>prying</b> (§3.11) are excluded. For a flexible end plate in tension, entered bolt tension must include prying force.</li><li>F<sub>v,Rd</sub> is <b>per shear plane</b> for a bearing connection (category A). Slip-resistant categories B/C require §3.9 and are excluded.</li><li>The bearing check uses the <b>thinnest</b> plate t. For punching, t<sub>p</sub> is strictly the plate beneath the head or nut; this sheet equates both, as in the reference program.</li><li>Table 3.4 assumes <b>normal hole clearance</b>. Oversized or slotted holes require bearing factors 0.8 or 0.6 under §3.6.1(14); these are excluded.</li></ul></i>
`;

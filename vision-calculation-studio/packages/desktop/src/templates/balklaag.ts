/**
 * Balklaag — houten vloerbalken volgens NEN-EN 1995-1-1+C1+A1:2011/NB:2013.
 *
 * Reproduceert de referentie-uitwerking: 3 belastingsgevallen (permanent UDL,
 * veranderlijk UDL, geconcentreerde last met concentratiefactor k_r),
 * BGT-doorbuiging (w_fin met kruip k_def) en UGT (buiging §6.1.6 + afschuiving
 * §6.1.7).
 *
 * Eigengewicht balk: A · ρ_mean · g volgens EN 1991-1-1 / EN 338 (ρ_mean per
 * sterkteklasse). De referentie-uitwerking rekent met een vaste 550 kg/m³ én g = 10 m/s²;
 * hier de correcte ρ_mean (C24 = 420 kg/m³) met g = 9,81. Zie punt 8 in
 * docs/afwijkingen-referentie.md.
 *
 * Gecalibreerd op document1 t/m document9 — zie scripts/check-balklaag.mjs.
 */

export const balklaag = `"Floor joists — timber floor beams according to EN 1995-1-1

'<i>Checks a simply supported timber floor joist under permanent and variable floor loads and a concentrated load. Includes SLS deflection with creep and ULS bending and shear.</i>

# 1. Section and material

@select profiel "Section (b×h)"
  46×96 = 1
  46×146 = 2
  46×171 = 3
  46×196 = 4
  63×146 = 5
  63×171 = 6
  63×196 = 7
  63×221 = 8
  71×146 = 9
  71×171 = 10
  71×196 = 11
  71×221 = 12
  71×246 = 13
  71×271 = 14
  96×171 = 15
  96×196 = 16
  96×221 = 17
  96×246 = 18
  96×271 = 19
  SLS 38×89 = 20
  SLS 38×140 = 21
  SLS 38×184 = 22
  SLS 38×235 = 23
  SLS 38×285 = 24
  SLS double 76×184 = 25
  SLS double 76×235 = 26
  SLS double 76×285 = 27
@end

@select sterkteklasse "Strength class"
  C18 = 1
  C24 = 2
  C30 = 3
  GL24h = 4
  GL28h = 5
@end

@select klimaat "Service class"
  Service class 1 = 1
  Service class 2 = 2
  Service class 3 = 3
@end

@select duurklasse "Load duration class (governing variable action)"
  Short = 1
  Medium = 2
  Long = 3
  Permanent = 4
@end

#hide
'Profielmatrix: [id | b(mm) | h(mm)]
'Regels 20 t/m 27 zijn SLS-maten: geschaafd naaldhout in de Noord-Amerikaanse
'maatvoering (38 mm dik), zoals dat in de houtskeletbouw wordt geleverd. De
'dubbele varianten zijn twee stuks tegen elkaar.
profielen = [1; 2; 3; 4; 5; 6; 7; 8; 9; 10; 11; 12; 13; 14; 15; 16; 17; 18; 19; 20; 21; 22; 23; 24; 25; 26; 27 |46; 46; 46; 46; 63; 63; 63; 63; 71; 71; 71; 71; 71; 71; 96; 96; 96; 96; 96; 38; 38; 38; 38; 38; 76; 76; 76 |96; 146; 171; 196; 146; 171; 196; 221; 146; 171; 196; 221; 246; 271; 171; 196; 221; 246; 271; 89; 140; 184; 235; 285; 184; 235; 285]
'Materiaalmatrix: [id | f_m,k | f_v,k | E_mean | ρ_mean | γ_M]
materialen = [1; 2; 3; 4; 5 |18; 24; 30; 24; 28 |3.4; 4.0; 4.0; 3.5; 3.5 |9000; 11000; 12000; 11500; 12600 |380; 420; 460; 420; 425 |1.30; 1.30; 1.30; 1.25; 1.25]

b_balk = hlookup(profielen; profiel; 1; 2)*mm
h_balk = hlookup(profielen; profiel; 1; 3)*mm
f_m,k = hlookup(materialen; sterkteklasse; 1; 2)*N/mm^2
f_v,k = hlookup(materialen; sterkteklasse; 1; 3)*N/mm^2
E_mean = hlookup(materialen; sterkteklasse; 1; 4)*N/mm^2
ρ_mean = hlookup(materialen; sterkteklasse; 1; 5)*kg/m^3
γ_M = hlookup(materialen; sterkteklasse; 1; 6)
'k_mod (EN 1995-1-1 Tabel 3.1) — klimaatklasse 1 en 2 gelijk, klasse 3 lager:
k_mod_12 = if(duurklasse ≡ 1; 0.90; if(duurklasse ≡ 2; 0.80; if(duurklasse ≡ 3; 0.70; 0.60)))
k_mod_3 = if(duurklasse ≡ 1; 0.70; if(duurklasse ≡ 2; 0.65; if(duurklasse ≡ 3; 0.55; 0.50)))
k_mod = if(klimaat ≡ 3; k_mod_3; k_mod_12)
k_def = if(klimaat ≡ 1; 0.60; if(klimaat ≡ 2; 0.80; 2.00))', kruipfactor (Tabel 3.2)'
'Hoogtefactor k_h op f_m,k — massief §3.2(3) bij h < 150 mm, gelijmd gelamineerd
'§3.3(3) bij h < 600 mm. Op 71×221 is k_h = 1 voor massief en 1,10 voor GL.
h_ruw = hlookup(profielen; profiel; 1; 3)', balkhoogte als kaal getal in mm'
gelijmd = if(sterkteklasse ≡ 4; 1; if(sterkteklasse ≡ 5; 1; 0))
k_h_massief = if(h_ruw < 150; min(1.3; (150/h_ruw)^0.2); 1)
k_h_gelijmd = if(h_ruw < 600; min(1.1; (600/h_ruw)^0.1); 1)
k_h = if(gelijmd ≡ 1; k_h_gelijmd; k_h_massief)
f_m,k_eff = k_h*f_m,k', karakteristieke buigsterkte incl. hoogtefactor'
#show

'<h6>Selected section and material</h6>
b_balk
h_balk
f_m,k
f_v,k
E_mean
k_mod
k_h
f_m,k_eff

f_m,d = k_mod*f_m,k_eff/γ_M', design bending strength (including k_h)'
f_v,d = k_mod*f_v,k/γ_M', design shear strength'
f_m,d
f_v,d

# 2. Geometry en structural model

@select schema "Structural model"
  Simply supported beam = 1
  Beam with an overhang at one end = 2
  Beam on three supports (two spans) = 3
  Trimmer beam along an opening = 4
@end

L_d = ?*(mm)', dagmaat (vrije overspanning)'
a_opl = ?*(mm)', opleglengte per zijde'
hoh = ?*(mm)', joist center-to-center spacing'
t_vloer = ?*(mm)', dikte beschot'
E_beschot = ?*(N/mm^2)', E-modulus beschot (E_0,ser,rep)'
b_vloer = ?*(m)', floor panel width — required for the vibration check'

'<i>The dimensions below apply only to the selected structural model; they are ignored for other models.</i>
a_over = ?*(mm)', overhang length — model 2 only'
L_veld2 = ?*(mm)', second span — model 3 only'
b_sparing = ?*(mm)', opening width = trimmer beam span — model 4'
l_staart = ?*(mm)', tail length of interrupted joists — model 4'

#hide
'De theoretische overspanning van het maatgevende veld. Bij een raveelbalk is
'dat de breedte van de sparing tussen de wisselbalken, bij de overige schema's
'de dagmaat plus de opleglengte.
L_th_0 = L_d + a_opl
L_th_rav = b_sparing + a_opl
#show
L_th = if(schema ≡ 4; L_th_rav; L_th_0)', theoretische overspanning'

# 3. Loads

'<i>Enter one permanent and one variable floor load. Include floor finishes, ceilings, fixed partitions, and other sustained loads in G<sub>k</sub>. Movable partitions belong to variable load Q<sub>k</sub> under EN 1991-1-1 §6.3.1.2. Do not include the beam self-weight here: §5 calculates it from section area and density.</i>

G_k = ?*(kN/m^2)', permanente vloerbelasting'
Q_k = ?*(kN/m^2)', veranderlijke vloerbelasting'
F_k = ?*(kN)', geconcentreerde last'

@select belastingcat "Load category (Table NB.2 — A1.1)"
  A — residential areas = 1
  B — office areas = 2
  C — assembly areas = 3
  D — retail areas = 4
  E — storage areas = 5
  F — traffic areas, vehicle ≤ 25 kN = 6
  G — verkeersruimte, 25 < voertuig ≤ 160 kN = 7
  H — roofs = 8
  Snow load = 9
  Wind load = 10
  Enter manually = 11
@end

ψ_0_zelf = ?', ψ0 — manual input only'
ψ_2_zelf = ?', ψ2 — manual input only'

#hide
'ψ-factoren uit NEN-EN 1990 Tabel NB.2 — A1.1. Dezelfde waarden als het
'normblad "EN 1990 — Rekenwaarden" in de bibliotheek; één bron, zodat de
'twee niet uit elkaar kunnen lopen.
'   [categorie | ψ_0 | ψ_1 | ψ_2]
ψ_tabel = [1; 2; 3; 4; 5; 6; 7; 8; 9; 10 |0.4; 0.5; 0.4; 0.4; 1.0; 0.7; 0.7; 0; 0; 0 |0.5; 0.5; 0.7; 0.7; 0.9; 0.7; 0.5; 0; 0.2; 0.2 |0.3; 0.3; 0.6; 0.6; 0.8; 0.6; 0.3; 0; 0; 0]
#show

ψ_0 = if(belastingcat ≡ 11; ψ_0_zelf; hlookup(ψ_tabel; belastingcat; 1; 2))
ψ_1 = if(belastingcat ≡ 11; ψ_0_zelf; hlookup(ψ_tabel; belastingcat; 1; 3))
ψ_2 = if(belastingcat ≡ 11; ψ_2_zelf; hlookup(ψ_tabel; belastingcat; 1; 4))

Q_k_eff = Q_k', veranderlijke vloerbelasting'

# 4. Section properties

A = b_balk*h_balk
I_y = b_balk*h_balk^3/12', traagheidsmoment'
W_y = b_balk*h_balk^2/6', weerstandsmoment'
S_y = b_balk*h_balk^2/8', first moment of area (NL) for shear'

'<i><b>Alternative assumption — self-weight (register item 8).</b> The reference calculation uses a fixed density of 550 kg/m³ and g = 10 m/s²; the code method uses ρ<sub>mean</sub> from EN 338 and g = 9.81. Project settings determine which assumption governs the conclusion.</i>
#hide
ρ_xc = 550 kg/m^3
g_xc = 10 m/s^2
g_nb = 9.81 m/s^2
#show
g_balk_xc = A*ρ_xc*g_xc to kN/m', eigen gewicht — de referentie-uitwerking'
g_balk_nb = A*ρ_mean*g_nb to kN/m', eigen gewicht — EN 338'
g_balk = if(rekenwijze ≡ 1; g_balk_xc; g_balk_nb)', gehanteerd eigen gewicht'

# 4b. Force distribution of the selected structural model

'<i>Each span has a restraining end moment, allowing one coefficient set for all structural models. Multiplying by the line load gives moment, shear force, and deflection. Independent numerical beam analysis verified the coefficients: moments and shear forces agree exactly; deflection is 0–4% conservative.</i>

#hide
'Schema 1 en 4 — enkelvoudige ligger.
c_M_1 = L_th^2/8
c_Ms_1 = 0*mm^2
c_V_1 = L_th/2
c_u_1 = 5*L_th^4/384

'Schema 2 — overstek. Alles volgt uit de reactie bij de eerste oplegging; die
'wordt nul zodra het overstek even lang is als de overspanning, en negatief
'daarboven — dan is er geen veldmoment meer.
c_R_2 = (L_th^2 - a_over^2)/(2*L_th)
c_M_2 = if(c_R_2 > 0*mm; c_R_2^2/2; 0*mm^2)
c_Ms_2 = a_over^2/2
c_V_2 = max(c_R_2; a_over; L_th - c_R_2)
c_u_2 = max(1.04*(5*L_th^4/384 - c_Ms_2*L_th^2/16); 0*mm^4)
'Zakking van het uiteinde van het overstek. Negatief betekent dat het eind
'omhoog komt: bij een kort overstek kantelt de ligger over de tweede oplegging.
c_ue_2 = a_over/24*(4*a_over^2*L_th + 3*a_over^3 - L_th^3)

'Schema 3 — drie steunpunten, via de drie-momentenvergelijking.
c_Ms_3 = (L_th^3 + L_veld2^3)/(8*(L_th + L_veld2))
c_R3a = L_th/2 - c_Ms_3/L_th
c_R3b = L_veld2/2 - c_Ms_3/L_veld2
c_M_3 = max(c_R3a^2; c_R3b^2)/2
c_V_3 = max(L_th - c_R3a; L_veld2 - c_R3b; c_R3a; c_R3b)
c_u3a = 5*L_th^4/384 - c_Ms_3*L_th^2/16
c_u3b = 5*L_veld2^4/384 - c_Ms_3*L_veld2^2/16
c_u_3 = max(1.04*max(c_u3a; c_u3b); 0*mm^4)
#show

c_M = if(schema ≡ 2; c_M_2; if(schema ≡ 3; c_M_3; c_M_1))', veldmoment per eenheid lijnlast'
c_Ms = if(schema ≡ 2; c_Ms_2; if(schema ≡ 3; c_Ms_3; c_Ms_1))', steunmoment per eenheid lijnlast'
c_V = if(schema ≡ 2; c_V_2; if(schema ≡ 3; c_V_3; c_V_1))', dwarskracht per eenheid lijnlast'
c_u = if(schema ≡ 2; c_u_2; if(schema ≡ 3; c_u_3; c_u_1))', zakking × EI per eenheid lijnlast'
c_ue = if(schema ≡ 2; c_ue_2; 0*mm^4)', overhang tip deflection × EI'

'<i>The diagrams require complete shapes as well as extreme values. The dimensionless shapes below use q = 1 and EI = 1, allowing drawings to scale to the calculated results. Independent numerical beam analysis verified them exactly over the full length.</i>

#hide
'Ondergrens van 1 mm op de lengtes. Bij het allereerste renderen staan de
'invoervelden nog op nul; zonder die ondergrens deelt alles hieronder door nul
'en zet elk van de dertig lijnstukken NaN-coordinaten neer. De tekening klopt
'een tel later vanzelf, maar tot die tijd stroomt de console vol.
d_L = max(L_th/(1 mm); 1)', overspanning van het eerste veld'
d_a = if(schema ≡ 2; a_over/(1 mm); 0)', overstek'
d_L2 = if(schema ≡ 3; L_veld2/(1 mm); 0)', tweede veld'
d_tot = max(d_L + d_a + d_L2; 1)', totale lengte'
d_Ms = c_Ms/(1 mm^2)', steunmoment per eenheid lijnlast'
d_RA = d_L/2 - d_Ms/d_L', eindreactie van het eerste veld'
d_RC = if(d_L2 > 0; d_L2/2 - d_Ms/d_L2; 0)', eindreactie van het tweede veld'

'Zakking van een veld: scharnier links, inklemmend moment M rechts.
uv(x; L; M) = x*(L^3 - 2*L*x^2 + x^3)/24 - M*x*(L^2 - x^2)/(6*L)
'Hoekverdraaiing aan de rechterzijde van datzelfde veld.
tv(L; M) = M*L/3 - L^3/24
'Zakking van een uitkraging, gemeten vanaf de oplegging: de starre rotatie
'vanuit het veld plus de eigen doorbuiging van de kraag.
uo(t; a; L; M) = tv(L; M)*t + t^2*(6*a^2 - 4*a*t + t^2)/24

'Zakking, moment en dwarskracht op afstand x vanaf het begin.
uz(x) = if(x ≤ d_L; uv(x; d_L; d_Ms); if(d_a > 0; uo(x - d_L; d_a; d_L; d_Ms); uv(d_tot - x; d_L2; d_Ms)))
mz(x) = if(x ≤ d_L; d_RA*x - x^2/2; if(d_a > 0; -(d_tot - x)^2/2; d_RC*(d_tot - x) - (d_tot - x)^2/2))
vz(x) = if(x ≤ d_L; d_RA - x; if(d_a > 0; d_tot - x; (d_tot - x) - d_RC))

'Pieken om op te schalen; die volgen uit de coefficienten hierboven.
d_Mp = max(max(c_M; c_Ms)/(1 mm^2); 0.001)
d_Vp = max(c_V/(1 mm); 0.001)
d_up = max(max(c_u/(1 mm^4); abs(c_ue)/(1 mm^4)); 0.001)
'Plaats van de opleggingen als deel van de tekenbreedte.
d_o2 = d_L/d_tot
#show

# 5. Load case 1 — Permanent

'<i>For a trimmer beam, loaded width is half the tail length rather than joist spacing. Each interrupted joist transfers its support reaction to the trimmer, equivalent to a floor strip of width l<sub>staart</sub>/2 per meter.</i>
b_belast = if(schema ≡ 4; l_staart/2; hoh)', loaded width per meter of beam'

P_g,k = b_belast*G_k + g_balk to kN/m', permanent line load on the beam'
M_g,veld = c_M*P_g,k to kN*m', veldmoment'
M_g,steun = c_Ms*P_g,k to kN*m', steunmoment'
M_g,k = max(M_g,veld; M_g,steun) to kN*m', governing — the section is prismatic'
V_g,k = c_V*P_g,k to kN
u_g,k = c_u*P_g,k/(E_mean*I_y) to mm', instantaneous deflection from permanent loads'
ue_g,k = c_ue*P_g,k/(E_mean*I_y) to mm', same, at the overhang tip'

# 6. Load case 2 — Veranderlijk (gelijkmatig)

q_q,k = b_belast*Q_k_eff to kN/m', lijnlast veranderlijk'
M_q,veld = c_M*q_q,k to kN*m
M_q,steun = c_Ms*q_q,k to kN*m
M_q,k = max(M_q,veld; M_q,steun) to kN*m
V_q,k = c_V*q_q,k to kN
u_q,k = c_u*q_q,k/(E_mean*I_y) to mm
ue_q,k = c_ue*q_q,k/(E_mean*I_y) to mm', overhang tip'

# 7. Load case 3 — Geconcentreerde load

'<i>Decking distributes a point load across several beams. Concentration factor k<sub>r</sub> gives the share carried by one beam (NEN-EN 1995-1-1 NB). Stiffer, thicker decking gives a smaller k<sub>r</sub>.</i>

#hide
a_ref = 1000 mm
'Derde term = (EI)_l/EI_ref, met (EI)_l = E_beschot·t³/12 per mm plaatbreedte.
'De E-modulus van het beschot is invoer (§2); vroeger stond hier een vaste
'7000 N/mm², waardoor een stijver of slapper beschot niet doorwerkte.
EI_ref = 50000000', referentiestijfheid per mm plaatbreedte (N·mm)'
t_ruw = t_vloer/(1 mm)
E_vl = E_beschot/(1 N/mm^2)', E-modulus beschot, dimensieloos voor de deling'
#show
k_r_0 = 0.37 + 0.8*hoh/a_ref - E_vl*t_ruw^3/12/EI_ref
'For a trimmer, the point load acts directly on the beam without distribution across floor joists, so k<sub>r</sub> = 1.
k_r = if(schema ≡ 4; 1; min(1; k_r_0))', concentration factor, capped at 1.0 (NEN-EN 1995-1-1 NB)'
F_Q,k = F_k*k_r to kN', effective point load on one beam'
F_Q,k
'<i>The point load is considered at mid-span and, where present, at the overhang tip. These positions do not act simultaneously; each check uses the more unfavorable result.</i>
M_Q_veld = F_Q,k*L_th/4 to kN*m', point load at mid-span'
M_Q_eind = if(schema ≡ 2; F_Q,k*a_over; 0*kN*m)', point load at the overhang tip'
M_Q,k = max(M_Q_veld; M_Q_eind) to kN*m
V_Q,k = F_Q,k to kN', point load at the support → full shear force on the beam'
u_Q_veld = 1/48*F_Q,k*L_th^3/(E_mean*I_y) to mm
u_Q_eind = if(schema ≡ 2; F_Q,k*a_over^2*(L_th + a_over)/(3*E_mean*I_y); 0*mm)
u_Q,k = max(u_Q_veld; u_Q_eind) to mm

# 8. Section of de floor joists

'<i>Floor decking of thickness t<sub>vloer</sub> on joists at center-to-center spacing hoh.</i>

#hide
'De doorsnede staat op schaal: balkbreedte, balkhoogte, beschotdikte en de
'hart-op-hart afstand krijgen allemaal dezelfde factor, zodat de verhoudingen
'kloppen met het gekozen profiel. Eerder stonden er vaste pixelmaten, waardoor
'een slanke balk er even plomp uitzag als een zware.
svgW = 480
n_balk = 4
mm_ruw = 1 mm', hulpeenheid om maten kaal te maken'
b_ruw = b_balk/mm_ruw
h_ruw2 = h_balk/mm_ruw
hoh_ruw = hoh/mm_ruw
t_ruw2 = t_vloer/mm_ruw
'Breedte van de balkengroep in mm, en de schaal die hem in 420 px laat passen.
groep_mm = (n_balk - 1)*hoh_ruw + b_ruw
sc_x = 420/groep_mm
'Hoogte begrenzen: beschot + balk mag niet boven de 110 px uitkomen.
sc_y = 110/(t_ruw2 + h_ruw2)
sc = min(sc_x; sc_y)
bw = b_ruw*sc
bh = h_ruw2*sc
gap = hoh_ruw*sc
vt = max(4; t_ruw2*sc)
x0 = (svgW - (n_balk - 1)*gap - bw)/2
vy = 46', bovenkant beschot'
by = vy + vt', bovenkant balken'
svgH = by + bh + 46
#show
'<svg viewbox="0 0 480 'svgH'" xmlns="http://www.w3.org/2000/svg" style="font-size:11px; width:100%; max-height:'svgH'px;">
'  <rect x="24" y="'vy'" width="432" height="'vt'" style="fill:#D9B382; stroke:#8B6F47; stroke-width:0.8"/>
#for i = 0 : n_balk - 1
'  <rect x="'x0 + i*gap'" y="'by'" width="'bw'" height="'bh'" style="fill:#E3C08A; stroke:#8B6F47; stroke-width:0.8"/>
#loop
'  <line x1="'x0 + bw/2'" y1="'by + bh + 18'" x2="'x0 + gap + bw/2'" y2="'by + bh + 18'" style="stroke:#1E40AF; stroke-width:0.7"/>
'  <circle cx="'x0 + bw/2'" cy="'by + bh + 18'" r="2.2" style="fill:#1E40AF"/>
'  <circle cx="'x0 + gap + bw/2'" cy="'by + bh + 18'" r="2.2" style="fill:#1E40AF"/>
'  <text x="'x0 + gap/2 + bw/2'" y="'by + bh + 13'" text-anchor="middle" style="fill:#1E40AF; font-weight:700">hoh = 'hoh'</text>
'  <text x="26" y="'vy - 5'" style="fill:#8B6F47">beschot t = 't_vloer'</text>
'  <text x="456" y="'by + bh + 13'" text-anchor="end" style="fill:#8B6F47">balk 'b_balk' × 'h_balk'</text>
'</svg>'

# 8b. Structural model

#if schema ≡ 4
    '<i>Plan of the opening. Interrupted joists terminate at the trimmer, which transfers its load to the two adjacent trimming joists. The drawing is to scale.</i>

    #hide
    'Tekengebied: de sparing plus anderhalve balkafstand aan weerszijden, en in
    'de lengte de staart plus de helft daarvan om de sparing zelf te tonen.
    pw = b_sparing + 3*hoh
    ph = 1.5*l_staart
    p_s = min(400/(pw/(1 mm)); 150/(ph/(1 mm)))
    p_b = p_s*pw/(1 mm)
    p_h = p_s*ph/(1 mm)
    p_x0 = 40 + (400 - p_b)/2
    p_y0 = 30
    p_spb = p_s*b_sparing/(1 mm)
    p_st = p_s*l_staart/(1 mm)
    p_hoh = p_s*hoh/(1 mm)
    p_mid = p_x0 + p_b/2
    p_wl = p_mid - p_spb/2
    p_wr = p_mid + p_spb/2
    p_rav = p_y0 + p_st
    p_ond = p_y0 + p_h
    p_n = max(1; floor(b_sparing/hoh) - 1)
    p_stap = p_spb/(p_n + 1)
    #show
    '<svg viewbox="0 0 480 220" xmlns="http://www.w3.org/2000/svg" style="font-size:11px; width:100%; max-height:230px;">
    '  <!-- de muur waar de balken op liggen -->
    '  <line x1="'p_x0 - 10'" y1="'p_y0'" x2="'p_x0 + p_b + 10'" y2="'p_y0'" style="stroke:#374151; stroke-width:2"/>
    #for i = 0 : 20
    '  <line x1="'p_x0 - 10 + i*(p_b + 20)/20'" y1="'p_y0'" x2="'p_x0 - 16 + i*(p_b + 20)/20'" y2="'p_y0 - 7'" style="stroke:#374151; stroke-width:0.7"/>
    #loop
    '  <!-- doorlopende balken naast de wisselbalken -->
    '  <line x1="'p_wl - p_hoh'" y1="'p_y0'" x2="'p_wl - p_hoh'" y2="'p_ond'" style="stroke:#8B6F47; stroke-width:1.4"/>
    '  <line x1="'p_wr + p_hoh'" y1="'p_y0'" x2="'p_wr + p_hoh'" y2="'p_ond'" style="stroke:#8B6F47; stroke-width:1.4"/>
    '  <!-- de sparing -->
    '  <rect x="'p_wl'" y="'p_rav'" width="'p_spb'" height="'p_ond - p_rav'" style="fill:#F1F5F9; stroke:#94A3B8; stroke-width:0.8; stroke-dasharray:4 3"/>
    '  <text x="'p_mid'" y="'(p_rav + p_ond)/2 + 4'" text-anchor="middle" style="fill:#64748B">sparing</text>
    '  <!-- onderbroken balken: van de muur tot op de raveelbalk -->
    #for i = 1 : p_n
    '  <line x1="'p_wl + i*p_stap'" y1="'p_y0'" x2="'p_wl + i*p_stap'" y2="'p_rav'" style="stroke:#8B6F47; stroke-width:1.4"/>
    #loop
    '  <!-- wisselbalken: die dragen de raveelbalk -->
    '  <rect x="'p_wl - 3'" y="'p_y0'" width="6" height="'p_ond - p_y0'" style="fill:#E3C08A; stroke:#8B6F47; stroke-width:1.2"/>
    '  <rect x="'p_wr - 3'" y="'p_y0'" width="6" height="'p_ond - p_y0'" style="fill:#E3C08A; stroke:#8B6F47; stroke-width:1.2"/>
    '  <text x="'p_wl - 8'" y="'p_ond + 12'" text-anchor="end" style="fill:#8B6F47">wisselbalk</text>
    '  <text x="'p_wr + 8'" y="'p_ond + 12'" style="fill:#8B6F47">wisselbalk</text>
    '  <!-- de raveelbalk zelf -->
    '  <rect x="'p_wl'" y="'p_rav - 4'" width="'p_spb'" height="8" style="fill:#B45309; stroke:#7C2D12; stroke-width:1"/>
    '  <text x="'p_mid'" y="'p_rav - 8'" text-anchor="middle" style="fill:#7C2D12; font-weight:700">raveelbalk</text>
    '  <!-- maatlijnen -->
    '  <line x1="'p_wl'" y1="'p_ond + 26'" x2="'p_wr'" y2="'p_ond + 26'" style="stroke:#1E40AF; stroke-width:1"/>
    '  <circle cx="'p_wl'" cy="'p_ond + 26'" r="2.6" style="fill:#1E40AF"/>
    '  <circle cx="'p_wr'" cy="'p_ond + 26'" r="2.6" style="fill:#1E40AF"/>
    '  <text x="'p_mid'" y="'p_ond + 22'" text-anchor="middle" style="fill:#1E40AF; font-weight:700">b<tspan baseline-shift="sub" font-size="8">sparing</tspan> = 'b_sparing'</text>
    '  <line x1="'p_x0 - 26'" y1="'p_y0'" x2="'p_x0 - 26'" y2="'p_rav'" style="stroke:#1E40AF; stroke-width:1"/>
    '  <circle cx="'p_x0 - 26'" cy="'p_y0'" r="2.6" style="fill:#1E40AF"/>
    '  <circle cx="'p_x0 - 26'" cy="'p_rav'" r="2.6" style="fill:#1E40AF"/>
    '  <text x="'p_x0 - 30'" y="'(p_y0 + p_rav)/2'" text-anchor="end" style="fill:#1E40AF; font-weight:700">l<tspan baseline-shift="sub" font-size="8">staart</tspan> = 'l_staart'</text>
    '</svg>'

    '<i>The trimmer spans the opening and carries a floor strip of width l<sub>staart</sub>/2 per meter. It is shown below as a beam on two supports.</i>
#end if

'<i>The beam carries the line loads from §5 and §6 and the concentrated load from §7. Loads are characteristic values per beam; §10 derives ULS design values. The drawing is to scale.</i>

#hide
'Totale lengte: bij een overstek of een tweede veld hoort daar meer bij dan
'alleen de overspanning van het eerste veld.
L_tot = if(schema ≡ 2; L_th + a_over; if(schema ≡ 3; L_th + L_veld2; L_th))
s_schaal = 360/max(L_tot/(1 mm); 1)', ondergrens: bij het eerste renderen is de lengte nog nul'
sx1 = 60', eerste oplegging
sx2 = sx1 + s_schaal*L_th/(1 mm)', tweede oplegging
sx3 = sx1 + s_schaal*L_tot/(1 mm)', einde van de balk, of de derde oplegging
sy = 96', hoogte van de balk-as
smid = (sx1 + sx2)/2
s_stap = (sx3 - sx1)/14', pijlafstand in de lastbanden
#show
'<svg viewbox="0 0 480 190" xmlns="http://www.w3.org/2000/svg" style="font-size:11px; width:100%; max-height:210px;">
'  <!-- veranderlijke verdeelde last: eigen band met eigen basislijn -->
#if q_q,k > 0 kN/m
    #for i = 0 : 14
    '  <line x1="'sx1 + i*s_stap'" y1="'sy - 76'" x2="'sx1 + i*s_stap'" y2="'sy - 62'" style="stroke:#B45309; stroke-width:0.9"/>
    '  <polygon points="'sx1 + i*s_stap','sy - 58' 'sx1 + i*s_stap - 3.5','sy - 66' 'sx1 + i*s_stap + 3.5','sy - 66'" style="fill:#B45309"/>
    #loop
    '  <line x1="'sx1'" y1="'sy - 76'" x2="'sx3'" y2="'sy - 76'" style="stroke:#B45309; stroke-width:1"/>
    '  <text x="'sx1 + 50'" y="'sy - 80'" style="fill:#B45309; font-weight:700">q<tspan baseline-shift="sub" font-size="8">q,k</tspan> = 'q_q,k' kN/m</text>
#end if
'<!-- permanent distributed load: band directly on the beam -->
#for i = 0 : 14
'  <line x1="'sx1 + i*s_stap'" y1="'sy - 46'" x2="'sx1 + i*s_stap'" y2="'sy - 8'" style="stroke:#475569; stroke-width:0.9"/>
'  <polygon points="'sx1 + i*s_stap','sy - 4' 'sx1 + i*s_stap - 3.5','sy - 12' 'sx1 + i*s_stap + 3.5','sy - 12'" style="fill:#475569"/>
#loop
'  <line x1="'sx1'" y1="'sy - 46'" x2="'sx3'" y2="'sy - 46'" style="stroke:#475569; stroke-width:1"/>
'  <text x="'sx1 + 50'" y="'sy - 50'" style="fill:#475569; font-weight:700">P<tspan baseline-shift="sub" font-size="8">g,k</tspan> = 'P_g,k' kN/m</text>
'  <!-- geconcentreerde veranderlijke last; de witte onderlaag houdt hem
'       leesbaar waar hij door de twee lastbanden heen zakt -->
#if F_Q,k > 0 kN
    '  <line x1="'smid'" y1="'sy - 92'" x2="'smid'" y2="'sy - 12'" style="stroke:#ffffff; stroke-width:4"/>
    '  <line x1="'smid'" y1="'sy - 92'" x2="'smid'" y2="'sy - 12'" style="stroke:#B91C1C; stroke-width:1.4"/>
    '  <polygon points="'smid','sy - 7' 'smid - 5','sy - 18' 'smid + 5','sy - 18'" style="fill:#B91C1C"/>
    '  <text x="'smid + 8'" y="'sy - 84'" style="fill:#B91C1C; font-weight:700">F<tspan baseline-shift="sub" font-size="8">Q,k</tspan> = 'F_Q,k' kN</text>
#end if
'  <!-- de balk over zijn volle lengte -->
'  <rect x="'sx1'" y="'sy - 6'" width="'sx3 - sx1'" height="12" style="fill:#E3C08A; stroke:#8B6F47; stroke-width:0.9"/>
'  <!-- eerste oplegging: scharnier -->
'  <polygon points="'sx1','sy + 6' 'sx1 - 11','sy + 26' 'sx1 + 11','sy + 26'" style="fill:none; stroke:#374151; stroke-width:0.9"/>
'  <line x1="'sx1 - 18'" y1="'sy + 27'" x2="'sx1 + 18'" y2="'sy + 27'" style="stroke:#374151; stroke-width:0.9"/>
'  <!-- tweede oplegging: rol -->
'  <polygon points="'sx2','sy + 6' 'sx2 - 11','sy + 22' 'sx2 + 11','sy + 22'" style="fill:none; stroke:#374151; stroke-width:0.9"/>
'  <circle cx="'sx2 - 6'" cy="'sy + 26'" r="4" style="fill:none; stroke:#374151; stroke-width:0.9"/>
'  <circle cx="'sx2 + 6'" cy="'sy + 26'" r="4" style="fill:none; stroke:#374151; stroke-width:0.9"/>
'  <line x1="'sx2 - 18'" y1="'sy + 31'" x2="'sx2 + 18'" y2="'sy + 31'" style="stroke:#374151; stroke-width:0.9"/>
#if schema ≡ 3
    '  <!-- derde oplegging -->
    '  <polygon points="'sx3','sy + 6' 'sx3 - 11','sy + 22' 'sx3 + 11','sy + 22'" style="fill:none; stroke:#374151; stroke-width:0.9"/>
    '  <circle cx="'sx3 - 6'" cy="'sy + 26'" r="4" style="fill:none; stroke:#374151; stroke-width:0.9"/>
    '  <circle cx="'sx3 + 6'" cy="'sy + 26'" r="4" style="fill:none; stroke:#374151; stroke-width:0.9"/>
    '  <line x1="'sx3 - 18'" y1="'sy + 31'" x2="'sx3 + 18'" y2="'sy + 31'" style="stroke:#374151; stroke-width:0.9"/>
#end if
'  <!-- maatlijn van het eerste veld -->
'  <line x1="'sx1'" y1="'sy + 52'" x2="'sx2'" y2="'sy + 52'" style="stroke:#1E40AF; stroke-width:1"/>
'  <circle cx="'sx1'" cy="'sy + 52'" r="2.6" style="fill:#1E40AF"/>
'  <circle cx="'sx2'" cy="'sy + 52'" r="2.6" style="fill:#1E40AF"/>
'  <text x="'smid'" y="'sy + 48'" text-anchor="middle" style="fill:#1E40AF; font-weight:700">L<tspan baseline-shift="sub" font-size="8">th</tspan> = 'L_th'</text>
#if schema ≡ 2
    '  <line x1="'sx2'" y1="'sy + 52'" x2="'sx3'" y2="'sy + 52'" style="stroke:#1E40AF; stroke-width:1"/>
    '  <circle cx="'sx3'" cy="'sy + 52'" r="2.6" style="fill:#1E40AF"/>
    '  <text x="'(sx2 + sx3)/2'" y="'sy + 48'" text-anchor="middle" style="fill:#1E40AF; font-weight:700">a = 'a_over'</text>
#end if
#if schema ≡ 3
    '  <line x1="'sx2'" y1="'sy + 52'" x2="'sx3'" y2="'sy + 52'" style="stroke:#1E40AF; stroke-width:1"/>
    '  <circle cx="'sx3'" cy="'sy + 52'" r="2.6" style="fill:#1E40AF"/>
    '  <text x="'(sx2 + sx3)/2'" y="'sy + 48'" text-anchor="middle" style="fill:#1E40AF; font-weight:700">L<tspan baseline-shift="sub" font-size="8">2</tspan> = 'L_veld2'</text>
#end if
'</svg>'
'<span style="display:inline-block; width:14px; border-top:3px solid #475569; vertical-align:middle"></span>&nbsp;permanent &nbsp;&nbsp; <span style="display:inline-block; width:14px; border-top:3px solid #B45309; vertical-align:middle"></span>&nbsp;veranderlijk, verdeeld &nbsp;&nbsp; <span style="display:inline-block; width:14px; border-top:3px solid #B91C1C; vertical-align:middle"></span>&nbsp;veranderlijk, geconcentreerd

'<i>Permanent and variable loads remain separate because the ULS combination uses different partial factors (1.20 and 1.50), and each has its own ψ factor in SLS combinations.</i>

# 9. SLS checks — deflection (§7.2)

'<i>Two SLS combinations apply here (EN 1990 §6.5.3): <ul><li><b>Characteristic (6.14b)</b> — G<sub>k</sub> + Q<sub>k,1</sub> + Σψ<sub>0,i</sub>·Q<sub>k,i</sub>. This gives instantaneous deflection w<sub>inst</sub>, without creep, immediately after loading.</li><li><b>Quasi-permanent (6.16b)</b> — G<sub>k</sub> + Σψ<sub>2,i</sub>·Q<sub>k,i</sub>. This sustained portion causes creep. Deformation factor k<sub>def</sub> (Table 3.2) gives final deflection w<sub>fin</sub>.</li></ul>The final state combines both: w<sub>fin</sub> = (1+k<sub>def</sub>)·u<sub>g</sub> + (1+ψ<sub>2</sub>·k<sub>def</sub>)·u<sub>var</sub>. The full permanent load creeps; variable load contributes only its quasi-permanent share ψ<sub>2</sub>.</i>

@select controleer "Check deflection"
  Yes = 1
  No = 0
@end

@select grensfactor "Permissible additional deflection"
  0.004 × L = 0.004
  0.003 × L = 0.003
  0.002 × L = 0.002
@end

#if controleer ≡ 1
    'Alternative assumption — which variable-load deflection contributes (register item 9).
    u_var_xc = u_q,k to mm', de referentie-uitwerking: alleen de gelijkmatig verdeelde variant'
    u_var_nb = max(u_q,k; u_Q,k) to mm', code method: the governing of the two'
    u_var = if(rekenwijze ≡ 1; u_var_xc; u_var_nb) to mm', gehanteerd'
    '<h6>9.1 Characteristic combination (6.14b) — instantaneous deflection</h6> w<sub>inst</sub> = u<sub>g</sub> + u<sub>var</sub>, without creep:
    w_inst = u_g,k + u_var to mm

    '<h6>9.2 Quasi-permanent combination (6.16b) — creep component</h6> Only sustained loading causes creep: the full permanent load plus ψ<sub>2</sub> times the variable load.
    w_qp = u_g,k + ψ_2*u_var to mm', deflection under the quasi-permanent combination'
    w_kruip = k_def*w_qp to mm', additional deflection due to creep'

    '<h6>9.3 Eindstand (§7.2, formule 7.2)</h6>
    w_fin = (1 + k_def)*u_g,k + (1 + ψ_2*k_def)*u_var to mm
    w_lim = grensfactor*L_th
    UC_doorbuiging = w_fin/w_lim
    #if UC_doorbuiging ≤ 1.0
        'UC<sub>deflection</sub> = w<sub>fin</sub>/w<sub>fin,max</sub> = 'UC_doorbuiging'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
    #else
        'UC<sub>deflection</sub> = w<sub>fin</sub>/w<sub>fin,max</sub> = 'UC_doorbuiging'<span style="color: red"> > 1.0 → <b>fails</b></span>
    #end if

    '<h6>9.4 Deflection curve</h6><i>The dashed curve shows instantaneous deflection (6.14b); the solid curve shows final deflection including creep (6.16b). Both use the same scale, so their difference shows the creep contribution. The shape follows the selected structural model.</i>
    #hide
    ux1 = 60
    ux2 = 420
    uas = 40', hoogte van de onvervormde as'
    uamp = 40', pixels voor de grootste zakking'
    'Beide krommen op dezelfde schaal, anders valt niet te zien wat de kruip
    'er bovenop doet.
    w_grootst_u = max(max(w_fin; w_inst); 0.001 mm)
    u_inst_s = uamp*w_inst/w_grootst_u
    u_fin_s = uamp*w_fin/w_grootst_u
    #show
    '<svg viewbox="0 0 480 140" xmlns="http://www.w3.org/2000/svg" style="font-size:11px; width:100%; max-height:150px;">
    '  <line x1="'ux1 - 8'" y1="'uas'" x2="'ux2 + 8'" y2="'uas'" style="stroke:#374151; stroke-width:0.8; stroke-dasharray:4 3"/>
    #for i = 0 : 29
    '  <line x1="'ux1 + (ux2 - ux1)*i/30'" y1="'uas + u_inst_s*uz(i*d_tot/30)/d_up'" x2="'ux1 + (ux2 - ux1)*(i + 1)/30'" y2="'uas + u_inst_s*uz((i + 1)*d_tot/30)/d_up'" style="stroke:#0EA5E9; stroke-width:1.1; stroke-dasharray:5 3"/>
    '  <line x1="'ux1 + (ux2 - ux1)*i/30'" y1="'uas + u_fin_s*uz(i*d_tot/30)/d_up'" x2="'ux1 + (ux2 - ux1)*(i + 1)/30'" y2="'uas + u_fin_s*uz((i + 1)*d_tot/30)/d_up'" style="stroke:#0369A1; stroke-width:1.3"/>
    #loop
    '  <!-- opleggingen -->
    '  <polygon points="'ux1','uas' 'ux1 - 7','uas + 14' 'ux1 + 7','uas + 14'" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
    '  <line x1="'ux1 - 10'" y1="'uas + 14'" x2="'ux1 + 10'" y2="'uas + 14'" style="stroke:#6b7280; stroke-width:0.9"/>
    '  <polygon points="'ux1 + (ux2 - ux1)*d_o2','uas' 'ux1 + (ux2 - ux1)*d_o2 - 7','uas + 11' 'ux1 + (ux2 - ux1)*d_o2 + 7','uas + 11'" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
    '  <circle cx="'ux1 + (ux2 - ux1)*d_o2 - 3.5'" cy="'uas + 14'" r="2.4" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
    '  <circle cx="'ux1 + (ux2 - ux1)*d_o2 + 3.5'" cy="'uas + 14'" r="2.4" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
    '  <line x1="'ux1 + (ux2 - ux1)*d_o2 - 10'" y1="'uas + 17'" x2="'ux1 + (ux2 - ux1)*d_o2 + 10'" y2="'uas + 17'" style="stroke:#6b7280; stroke-width:0.9"/>
    #if schema ≡ 3
        '  <polygon points="'ux2','uas' 'ux2 - 7','uas + 11' 'ux2 + 7','uas + 11'" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
        '  <circle cx="'ux2 - 3.5'" cy="'uas + 14'" r="2.4" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
        '  <circle cx="'ux2 + 3.5'" cy="'uas + 14'" r="2.4" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
        '  <line x1="'ux2 - 10'" y1="'uas + 17'" x2="'ux2 + 10'" y2="'uas + 17'" style="stroke:#6b7280; stroke-width:0.9"/>
    #end if
    '  <text x="'ux1 + 4'" y="'uas - 6'" style="fill:#374151; font-weight:700">onvervormd</text>
    '  <text x="'ux1 + 8'" y="'uas + uamp + 24'" style="fill:#0369A1; font-weight:700">w<tspan baseline-shift="sub" font-size="8">fin</tspan> (6.16b + kruip) = 'w_fin' — grens 'w_lim'</text>
    '  <text x="'ux1 + 8'" y="'uas + uamp + 38'" style="fill:#0EA5E9; font-weight:700">w<tspan baseline-shift="sub" font-size="8">inst</tspan> (6.14b) = 'w_inst'</text>
    '</svg>'
#else
    'Deflection is not checked (Check deflection = No).
    UC_doorbuiging = 0
#end if

# 9b. SLS checks — vibration (§7.3.3)

'<i>The residential floor vibration check adds two criteria to the frequency requirement: stiffness under a 1 kN point load (expression 7.3) and response velocity to a unit impulse (expression 7.4). Both apply only when f<sub>1</sub> ≥ 8 Hz; below that, §7.3.3(2) requires a full vibration analysis.</i>

@select controleer_trilling "Controleer trilling"
  Yes = 1
  No = 0
@end

ζ = ?', damping ratio (§7.3.1: 0.01 for floors without a finishing layer)'
a_tril = ?*(mm/kN)', stiffness limit a (NB table — 1.0 mm/kN)'
b_tril = ?', velocity criterion parameter b (Figure 7.2, approximately 120)'

#if controleer_trilling ≡ 1
    '<h6>9b.1 Stiffness</h6> Decking per meter of floor width — spanning perpendicular to the joists:
    I_beschot = 1 m*t_vloer^3/12 to m^4
    EI_l = E_beschot*I_beschot/(1 m) to N*m^2/m', (EI)_l — beschot'
    'Floor joists per meter of floor width — spanning in the beam direction:
    EI_b = E_mean*I_y/hoh to N*m^2/m', (EI)_b — balken'

    '<h6>9b.2 Natural frequency (expression 7.5)</h6> Vibrating mass per m² includes permanent weight only (§7.3.3). Variable load is excluded because the floor vibrates in its normal service condition rather than at full design loading.
    m_opp = (G_k + g_balk/hoh)/(9.81 m/s^2) to kg/m^2
    f_1 = π/(2*L_th^2)*sqrt(EI_b/m_opp) to Hz
    #if f_1 ≥ 8 Hz
        'f<sub>1</sub> = 'f_1'<span style="color: green"> ≥ 8 Hz → the two criteria below apply</span>
    #else
        'f<sub>1</sub> = 'f_1'<span style="color: red"> < 8 Hz → the simplified check does not apply; §7.3.3(2) requires full vibration analysis</span>
    #end if

    '<h6>9b.3 Criterion 1 — stiffness under 1 kN (expression 7.3)</h6> The point load spreads across several joists; k<sub>r</sub> from §7 gives the share carried by the most heavily loaded joist.
    F_tril = 1 kN*k_r to kN', effective point load on one beam'
    w_1kN = F_tril*L_th^3/(48*E_mean*I_y) to mm
    w_per_kN = w_1kN/(1 kN) to mm/kN
    UC_tril_a = w_per_kN/a_tril
    #if UC_tril_a ≤ 1.0
        'UC<sub>w/F</sub> = 'UC_tril_a'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
    #else
        'UC<sub>w/F</sub> = 'UC_tril_a'<span style="color: red"> > 1.0 → <b>fails</b></span>
    #end if

    '<h6>9b.4 Criterion 2 — response velocity (expressions 7.4, 7.6, 7.7)</h6> Number of vibration modes below 40 Hz (expression 7.7). A very stiff floor may already have f_1 above 40 Hz, leaving no modes below 40 Hz; the square-root argument is then limited to zero.
    n_40_arg = max(0; (40 Hz/f_1)^2 - 1)
    n_40 = (n_40_arg*(b_vloer/L_th)^4*EI_l/EI_b)^0.25
    'Response velocity to a unit impulse (expression 7.6):
    v_resp = 4*(0.4 + 0.6*n_40)/(m_opp*b_vloer*L_th + 200 kg) to m/(N*s^2)
    'Grenswaarde (formule 7.4): b^(f_1·ζ − 1)
    v_lim = b_tril^(f_1*ζ/(1 Hz) - 1)*1 m/(N*s^2)
    UC_tril_v = v_resp/v_lim
    #if UC_tril_v ≤ 1.0
        'UC<sub>v</sub> = 'UC_tril_v'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
    #else
        'UC<sub>v</sub> = 'UC_tril_v'<span style="color: red"> > 1.0 → <b>fails</b></span>
    #end if

    UC_trilling = max(UC_tril_a; UC_tril_v)
    #if UC_trilling ≤ 1.0
        '<b>Trillingen voldoen</b> (maatgevende UC = 'UC_trilling')
    #else
        '<b><span style="color: red">Vibration fails</span></b> (governing UC = 'UC_trilling')
    #end if
#else
    'Vibration is not checked (Check vibration = No).
    UC_trilling = 0
#end if

# 10. ULS checks

'<h6>10.1 Maatgevende krachten</h6>
'Permanent + veranderlijk (UDL):
M_yEd_1 = 1.20*M_g,k + 1.50*M_q,k to kN*m
V_zEd_1 = 1.20*V_g,k + 1.50*V_q,k to kN
'Permanent + geconcentreerde last:
M_yEd_2 = 1.20*M_g,k + 1.50*M_Q,k to kN*m
V_zEd_2 = 1.20*V_g,k + 1.50*V_Q,k to kN

'<i>The consequence class is set in project settings. It determines K<sub>FI</sub> (Table NB.A1.1), which applies to every worksheet in the project.</i>
K_FI', gevolgklasse-factor uit de projectgegevens (EN 1990)'
M_y,Ed = K_FI*max(M_yEd_1; M_yEd_2) to kN*m', incl. K_FI'
V_z,Ed = K_FI*max(V_zEd_1; V_zEd_2) to kN', incl. K_FI'
M_y,Ed
V_z,Ed

'<h6>10.1b Bending moment and shear force diagrams (ULS)</h6>

'<i>Both diagrams follow the selected structural model. An overhang or second span can reverse the bending moment over a support; this represents tension at the top of the section.</i>

#hide
mx1 = 60
mx2 = 420
mmid = (mx1 + mx2)/2
'De M-lijn hangt onder zijn as maar kan er bij een steunmoment ook bovenuit
'komen; de V-lijn steekt naar twee kanten. Vandaar ruime tussenruimte.
mh = 38', halve hoogte van elk diagram in pixels
my = 60', as van de M-lijn
vy2 = 195', as van de V-lijn
#show
'<svg viewbox="0 0 480 250" xmlns="http://www.w3.org/2000/svg" style="font-size:11px; width:100%; max-height:260px;">
'  <!-- M-lijn -->
'  <line x1="'mx1 - 10'" y1="'my'" x2="'mx2 + 10'" y2="'my'" style="stroke:#374151; stroke-width:1"/>
#for i = 0 : 29
'  <line x1="'mx1 + (mx2 - mx1)*i/30'" y1="'my + mh*mz(i*d_tot/30)/d_Mp'" x2="'mx1 + (mx2 - mx1)*(i + 1)/30'" y2="'my + mh*mz((i + 1)*d_tot/30)/d_Mp'" style="stroke:#1E40AF; stroke-width:1.3"/>
#loop
'  <text x="'mx1 - 10'" y="'my - 8'" style="fill:#374151; font-weight:700">M-lijn</text>
'  <text x="'mmid'" y="'my + mh + 16'" text-anchor="middle" style="fill:#1E40AF; font-weight:700">M<tspan baseline-shift="sub" font-size="8">y,Ed</tspan> = 'M_y,Ed'</text>
'  <!-- V-lijn -->
'  <line x1="'mx1 - 10'" y1="'vy2'" x2="'mx2 + 10'" y2="'vy2'" style="stroke:#374151; stroke-width:1"/>
#for i = 0 : 29
'  <line x1="'mx1 + (mx2 - mx1)*i/30'" y1="'vy2 - mh*vz(i*d_tot/30)/d_Vp'" x2="'mx1 + (mx2 - mx1)*(i + 1)/30'" y2="'vy2 - mh*vz((i + 1)*d_tot/30)/d_Vp'" style="stroke:#15803D; stroke-width:1.3"/>
#loop
'  <text x="'mx1 - 10'" y="'vy2 - 8'" style="fill:#374151; font-weight:700">V diagram</text>
'  <text x="'mx1 + 4'" y="'vy2 - mh - 6'" style="fill:#15803D; font-weight:700">+V<tspan baseline-shift="sub" font-size="8">z,Ed</tspan> = 'V_z,Ed'</text>
'  <!-- supports below both axes -->
#for j = 0 : 1
'  <polygon points="'mx1','my + j*(vy2 - my)' 'mx1 - 7','my + j*(vy2 - my) + 14' 'mx1 + 7','my + j*(vy2 - my) + 14'" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
'  <line x1="'mx1 - 10'" y1="'my + j*(vy2 - my) + 14'" x2="'mx1 + 10'" y2="'my + j*(vy2 - my) + 14'" style="stroke:#6b7280; stroke-width:0.9"/>
'  <polygon points="'mx1 + (mx2 - mx1)*d_o2','my + j*(vy2 - my)' 'mx1 + (mx2 - mx1)*d_o2 - 7','my + j*(vy2 - my) + 11' 'mx1 + (mx2 - mx1)*d_o2 + 7','my + j*(vy2 - my) + 11'" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
'  <circle cx="'mx1 + (mx2 - mx1)*d_o2 - 3.5'" cy="'my + j*(vy2 - my) + 14'" r="2.4" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
'  <circle cx="'mx1 + (mx2 - mx1)*d_o2 + 3.5'" cy="'my + j*(vy2 - my) + 14'" r="2.4" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
'  <line x1="'mx1 + (mx2 - mx1)*d_o2 - 10'" y1="'my + j*(vy2 - my) + 17'" x2="'mx1 + (mx2 - mx1)*d_o2 + 10'" y2="'my + j*(vy2 - my) + 17'" style="stroke:#6b7280; stroke-width:0.9"/>
#loop
#if schema ≡ 3
    #for j = 0 : 1
    '  <polygon points="'mx2','my + j*(vy2 - my)' 'mx2 - 7','my + j*(vy2 - my) + 11' 'mx2 + 7','my + j*(vy2 - my) + 11'" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
    '  <circle cx="'mx2 - 3.5'" cy="'my + j*(vy2 - my) + 14'" r="2.4" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
    '  <circle cx="'mx2 + 3.5'" cy="'my + j*(vy2 - my) + 14'" r="2.4" style="fill:none; stroke:#6b7280; stroke-width:0.9"/>
    '  <line x1="'mx2 - 10'" y1="'my + j*(vy2 - my) + 17'" x2="'mx2 + 10'" y2="'my + j*(vy2 - my) + 17'" style="stroke:#6b7280; stroke-width:0.9"/>
    #loop
#end if
'</svg>'

'<h6>10.2 Buiging — §6.1.6 (6.11)</h6>
σ_m,y,d = M_y,Ed/W_y to N/mm^2
σ_m,y,d
UC_buiging = σ_m,y,d/f_m,d
#if UC_buiging ≤ 1.0
    'UC<sub>bending</sub> = σ<sub>m,y,d</sub>/f<sub>m,d</sub> = 'UC_buiging'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
#else
    'UC<sub>bending</sub> = σ<sub>m,y,d</sub>/f<sub>m,d</sub> = 'UC_buiging'<span style="color: red"> > 1.0 → <b>fails</b></span>
#end if

'<h6>10.3 Afschuiving — §6.1.7 (6.13)</h6>
τ_d = V_z,Ed*S_y/(b_balk*I_y) to N/mm^2
UC_afsch = τ_d/f_v,d
#if UC_afsch ≤ 1.0
    'UC<sub>shear</sub> = τ<sub>d</sub>/f<sub>v,d</sub> = 'UC_afsch'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
#else
    'UC<sub>shear</sub> = τ<sub>d</sub>/f<sub>v,d</sub> = 'UC_afsch'<span style="color: red"> > 1.0 → <b>fails</b></span>
#end if

# 11. Summary — all unity checks

UC_max = max(UC_doorbuiging; UC_buiging; UC_afsch; UC_trilling)

#hide
'Kleur per regel: rood zodra een toets boven 1,0 uitkomt, oranje vanaf 0,90
'(voldoet, maar zonder marge), anders groen.
kl_buig = if(UC_buiging > 1; 1; if(UC_buiging > 0.9; 2; 3))
kl_afsch = if(UC_afsch > 1; 1; if(UC_afsch > 0.9; 2; 3))
kl_door = if(UC_doorbuiging > 1; 1; if(UC_doorbuiging > 0.9; 2; 3))
kl_tril = if(UC_trilling > 1; 1; if(UC_trilling > 0.9; 2; 3))
c_1 = "#b91c1c"
c_2 = "#b45309"
c_3 = "#047857"
kleur_buig = if(kl_buig ≡ 1; c_1; if(kl_buig ≡ 2; c_2; c_3))
kleur_afsch = if(kl_afsch ≡ 1; c_1; if(kl_afsch ≡ 2; c_2; c_3))
kleur_door = if(kl_door ≡ 1; c_1; if(kl_door ≡ 2; c_2; c_3))
kleur_tril = if(kl_tril ≡ 1; c_1; if(kl_tril ≡ 2; c_2; c_3))
oordeel_buig = if(UC_buiging ≤ 1; "voldoet"; "voldoet niet")
oordeel_afsch = if(UC_afsch ≤ 1; "voldoet"; "voldoet niet")
oordeel_door = if(UC_doorbuiging ≤ 1; "voldoet"; "voldoet niet")
oordeel_tril = if(UC_trilling ≤ 1; "voldoet"; "voldoet niet")
#show

'<table style="width:100%; border-collapse:collapse; font-size:0.95em;">
'<tr style="border-bottom:2px solid #374151;">
'<th style="text-align:left; padding:5px 8px;">Toets</th>
'<th style="text-align:left; padding:5px 8px;">Norm</th>
'<th style="text-align:right; padding:5px 8px;">UC</th>
'<th style="text-align:left; padding:5px 8px;">Oordeel</th></tr>
'<tr style="border-bottom:1px solid #e5e7eb;">
'<td style="padding:5px 8px;">Buiging</td>
'<td style="padding:5px 8px;">§6.1.6 (6.11)</td>
'<td style="padding:5px 8px; text-align:right; font-weight:700; color:'kleur_buig'">'UC_buiging'</td>
'<td style="padding:5px 8px; color:'kleur_buig'">'oordeel_buig'</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;">
'<td style="padding:5px 8px;">Afschuiving</td>
'<td style="padding:5px 8px;">§6.1.7 (6.13)</td>
'<td style="padding:5px 8px; text-align:right; font-weight:700; color:'kleur_afsch'">'UC_afsch'</td>
'<td style="padding:5px 8px; color:'kleur_afsch'">'oordeel_afsch'</td></tr>
#if controleer ≡ 1
'<tr style="border-bottom:1px solid #e5e7eb;">
'<td style="padding:5px 8px;">Deflection</td>
'<td style="padding:5px 8px;">§7.2 (7.2)</td>
'<td style="padding:5px 8px; text-align:right; font-weight:700; color:'kleur_door'">'UC_doorbuiging'</td>
'<td style="padding:5px 8px; color:'kleur_door'">'oordeel_door'</td></tr>
#else
'<tr style="border-bottom:1px solid #e5e7eb;">
'<td style="padding:5px 8px;">Deflection</td>
'<td style="padding:5px 8px;">§7.2</td>
'<td style="padding:5px 8px; text-align:right; color:#9ca3af;">—</td>
'<td style="padding:5px 8px; color:#9ca3af;">not checked</td></tr>
#end if
#if controleer_trilling ≡ 1
'<tr style="border-bottom:1px solid #e5e7eb;">
'<td style="padding:5px 8px;">Trilling</td>
'<td style="padding:5px 8px;">§7.3.3 (7.3, 7.4)</td>
'<td style="padding:5px 8px; text-align:right; font-weight:700; color:'kleur_tril'">'UC_trilling'</td>
'<td style="padding:5px 8px; color:'kleur_tril'">'oordeel_tril'</td></tr>
#else
'<tr style="border-bottom:1px solid #e5e7eb;">
'<td style="padding:5px 8px;">Vibration</td>
'<td style="padding:5px 8px;">§7.3.3</td>
'<td style="padding:5px 8px; text-align:right; color:#9ca3af;">—</td>
'<td style="padding:5px 8px; color:#9ca3af;">not checked</td></tr>
#end if
'</table>

#if UC_max ≤ 1.0
    '<b>Governing UC = 'UC_max'</b><span style="color: green"> ≤ 1.0 → <b>Floor joists passes</b></span>
#else
    '<b>Governing UC = 'UC_max'</b><span style="color: red"> > 1.0 → <b>Floor joists fails</b></span>
#end if

'<hr/><i>Assumptions and limitations:<ul><li>Beam self-weight uses EN 338 ρ<sub>mean</sub> (C24 = 420 kg/m³) and g = 9.81 m/s². The reference calculation uses 550 kg/m³ and g = 10, so results here are slightly more favorable.</li><li>Concentration factor k<sub>r</sub> was verified against four reference sheets (18 and 25 mm decking, spacing 600 and 1000, two sections).</li><li>Depth factor k<sub>h</sub> was verified for glulam (GL24h, 221 mm → 1.10) and solid timber (71×146 → 1.005).</li><li>Shear uses full beam width b without k<sub>cr</sub> reduction, following the reference calculation.</li><li>The reference limitations exclude vibration (§7.3) and lateral-torsional buckling, assuming lateral restraint from decking. Near 5 m spans, f<sub>1</sub> can fall below 8 Hz and §7.3.3 applies.</li><li>Bearing compression (§6.1.5) is not checked, as in the reference calculation. The base case gives UC 0.89 with k<sub>c,90</sub> = 1.25, so assess it separately.</li></ul></i>
`;

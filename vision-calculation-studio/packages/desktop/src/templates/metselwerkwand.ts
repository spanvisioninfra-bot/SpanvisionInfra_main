/**
 * Dragende (ongewapende) metselwerkwand op druk volgens
 * NEN-EN 1996-1-1:2006+A1:2013+NB:2018 §5.5.1 + §6.1.2 + bijlage G.
 *
 * Gecalibreerd op 14 de referentie-uitwerking-referenties, alle exact gereproduceerd. Basis:
 * ℓ = 1000, h = 2800, t = 120 mm, N_Ed = N_Ed,max = 200 kN, kalkzandsteen <25%
 * CS12 + M15, categorie I, CC2, n = 2.
 *   1  alle M = 0                    → Φ_i = 0,900  Φ_m = 0,605  UC = 0,79
 *                                      + min.exc.: Φ_m2 = 0,360 → 200/151,07 = 1,32
 *   2  M_1Ed = 5                     → Φ_i,t = 0,506  N_Rd,t = 211,91  UC = 0,94
 *   3  M_mEd = 5                     → e_mk = 29,7  Φ_m = 0,201  UC = 2,37
 *   4  N=300 N_max=150 M=7/5/3 n=3   → n → 2 (L_v ≥ 15t)  Φ = 0,533/0,756/0,334  UC = 2,14
 *   5  M_mEd = 1                     → e_m = 9,7  Φ_m = 0,539  N_Rd,m = 225,77  UC = 0,89
 *   6  N_Ed = 30                     → lage-belastingstak, e_cap = 55,7  UC = 0,12
 *   7  n = 4, L_v = 2000             → ρ_4 = 0,36  h_ef = 1000  Φ_m = 0,839  UC = 0,57
 *                                      + min.exc. met ρ_4: h_ef2 = 1000 → UC = 0,62
 *   8  baksteen<25% fb18 + lijm L12,5→ f_k = 9,00  f_d = 5,29  UC = 0,52 / 0,87
 *   9  CC3 + M5                      → f_k = 4,51  γ_M = 1,70  UC = 1,04
 *  10  M = 10/5/7                     → e_t = 50 > 0,25t → ρ_2 = 1,00  h_ef = 2800
 *                                      Φ = 0,063/0,313/0,075  N_Rd = 26,39  UC = 7,58
 *  11-14 dezelfde wand met elk van de vier ondersteuningsopties → alle vier
 *                                      identiek aan set 10 (de e_t-overschrijving
 *                                      wint, dus ρ_2 = 1,00 ongeacht de optie)
 *
 * Uit de referentiebladen afgeleide de referentie-uitwerking-keuzes:
 *   • E = 700·f_k (NB:2018) — bevestigd op f_k = 5,94 / 9,00 / 4,51.
 *   • e_k = 0: φ_∞ = 0 in NB:2018. Blijft invoerbaar (6.7), default 0.
 *   • f_k-exponenten hangen af van het morteltype én de steensoort:
 *     metselmortel altijd α = 0,65 / β = 0,25; lijmmortel op baksteen
 *     α = 0,75 / β = 0,10 met K = 0,8 (set 8), lijmmortel op cellenbeton
 *     α = 0,85 / β = 0 met K = 0,8 (oplegmodule). Overige lijm-cellen volgen dat
 *     patroon maar zijn NIET geverifieerd.
 *   • γ_M is gelijk voor CC2 en CC3 (set 9); alleen CC1 verlaagt met 0,2.
 *   • Een verticale randsteuning vervalt bij L_v ≥ 15·t (n = 3, set 4) resp.
 *     L_v ≥ 30·t (n = 4, set 7 blijft n = 4 bij L_v = 2000 < 3600).
 *   • ρ_2 = 0,75 vervalt zodra de excentriciteit aan de kop e_t = |M_1Ed|/|N_Ed|
 *     groter is dan 0,25·t (§5.5.1.2(4), set 10: 50 > 30 mm → ρ_2 = 1,00). De
 *     regel kijkt alléén naar de kop, niet naar M_2Ed.
 *   • ρ_3/ρ_4 rekenen met L_v, niet met ℓ.
 *   • Lage-belastingstak N_Ed/(ℓ·t·f_d) ≤ 0,1 (set 6): e_i wordt begrensd op
 *     t/2 − N_Ed/(2·ℓ·f_d) en het afgekapte deel komt als ΔM = (e_i,f − e_i)·N_Ed
 *     terug in M_Ed,mc = M_mEd + (ΔM_t + ΔM_b)/2.
 *   • De minimale-excentriciteitstoets rekent met ρ_2 = 1,00 maar behoudt de
 *     verticale randsteuning (set 7: h_ef2 = ρ_4·h = 1000, niet h = 2800), toetst
 *     N_Ed,max, en wordt overgeslagen zodra de eerste toets al niet voldoet
 *     (sets 3, 4, 9).
 *   • N_Rd = min(N_Rd,t; N_Rd,b; N_Rd,m); UC = N_Ed/N_Rd.
 *
 * Variabelenamen komen exact overeen met MetselwerkwandDesigner.tsx.
 */

export const metselwerkwand = `"Load-bearing masonry wall — compression (EN 1996-1-1 §6.1.2)

'<i>An unreinforced load-bearing masonry wall under axial force N<sub>Ed</sub> and moments M<sub>1Ed</sub> at the top, M<sub>mEd</sub> at mid-height, and M<sub>2Ed</sub> at the base. Checks cover slenderness (§5.5.1.4) and resistance at the top, base, and mid-height using reduction factor Φ (§6.1.2.2 and Annex G). Loads are <b>design values</b>.</i>

# 1. Geometry & randsteuning

@select ondersteuning "Support above/below (determines ρ₂)"
  wall with a concrete floor or roof on both sides = 1
  concrete floor or roof supported on one side of the wall = 2
  wall with a timber floor or roof on both sides = 3
  timber floor or roof supported on one side of the wall = 4
@end

@select n_rand "Number of supported edges n"
  2 (top + bottom) = 2
  3 (+ one vertical edge) = 3
  4 (+ two vertical edges) = 4
@end

l_w = ?*(mm)', wandlengte ℓ'
h_w = ?*(mm)', wandhoogte h'
t_w = ?*(mm)', wanddikte t'
L_v = ?*(mm)', afstand tot de gesteunde (verticale) rand'

# 2. Masonry

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
@end

phi_inf = ?', final creep coefficient φ_∞ for creep eccentricity e_k (6.7); NB:2018 → 0'

#hide
'Kolommen: [id | K_metsel | K_lijm | α_lijm | β_lijm]. Metselmortel heeft altijd
'α = 0,65 en β = 0,25. Geverifieerd: kalkzandsteen<25%+metselmortel (set 1-6, 9),
'baksteen<25%+lijmmortel (set 8: K=0,8 α=0,75 β=0,1) en cellenbeton<25%+lijmmortel
'(oplegmodule: K=0,8 α=0,85 β=0). De overige lijmmortel-cellen volgen dat patroon
'(klei → 0,75/0,10; overig → 0,85/0) en zijn NIET tegen een referentie getoetst.
steenmat = [1; 2; 3; 4; 5; 6; 7 |0.6; 0.5; 0.6; 0.5; 0.6; 0.5; 0.6 |0.80; 0.70; 0.80; 0.70; 0.80; 0.70; 0.80 |0.75; 0.75; 0.85; 0.85; 0.85; 0.85; 0.85 |0.10; 0.10; 0; 0; 0; 0; 0]
K = if(morteltype ≡ 2; hlookup(steenmat; steensoort; 1; 3); hlookup(steenmat; steensoort; 1; 2))
alfa = if(morteltype ≡ 2; hlookup(steenmat; steensoort; 1; 4); 0.65)
bexp = if(morteltype ≡ 2; hlookup(steenmat; steensoort; 1; 5); 0.25)
'EN 771-1 t/m 6 kent alleen categorie I en II.
gam_base = if(steencategorie ≡ 1; 1.7; 2.2)
gam_M = gam_base - if(CC ≡ 1; 0.2; 0)
f_meff = min(f_m; 20)
K_E = 700
#show

K', factor K (steengroep + morteltype)'
alfa', exponent α'
bexp', exponent β'
gam_M
f_k = K*f_b^alfa*f_meff^bexp*N/mm^2', karakteristieke druksterkte metselwerk (3.2)'
f_k
f_d = f_k/gam_M', design compressive strength (3.1)'
f_d
E_mw = K_E*f_k', elasticiteitsmodulus E = 700·f_k (NB:2018)'
E_mw

# 3. Loads (design values)

N_Ed = ?*(kN)', axial force'
N_Ed_max = ?*(kN)', maximum axial force — minimum-eccentricity check only'
M_1Ed = ?*(kN*m)', top moment'
M_mEd = ?*(kN*m)', mid-height moment'
M_2Ed = ?*(kN*m)', base moment'

# 4. Effectieve height — §5.5.1.2

'<i>Concrete floor restraint permits ρ<sub>2</sub> = 0.75 only while top eccentricity e<sub>t</sub> = |M<sub>1Ed</sub>|/|N<sub>Ed</sub>| ≤ 0.25·t (§5.5.1.2(4)); beyond this, restraint is lost and ρ<sub>2</sub> = 1.00. Vertical edge support counts only while L<sub>v</sub> &lt; 15·t for n = 3, or &lt; 30·t for n = 4; otherwise n returns to 2. Factors ρ<sub>3</sub> and ρ<sub>4</sub> follow (5.3)–(5.6), using L<sub>v</sub> between stiff edges.</i>
#hide
'Terugval op n = 2 zodra de gesteunde rand te ver weg staat.
n_lim = if(n_rand ≡ 4; 30*t_w; 15*t_w)
n_eff = if(n_rand ≡ 2; 2; if(L_v ≥ n_lim; 2; n_rand))
N_min = max(abs(N_Ed); 0.001*kN)
#show
e_t0 = abs(M_1Ed)/N_min to mm', first-order top eccentricity (determines whether ρ_2 = 0.75 is permitted)'
e_t0
e_grens = 0.25*t_w', limit above which rotational restraint is lost (§5.5.1.2(4))'
e_grens
#hide
'Beton (optie 1-2) → 0,75; hout (optie 3-4) → 1,00. Bij een oplegging aan één
'zijde geldt 0,75 alleen bij een opleglengte ≥ ⅔·t en ≥ 85 mm.
rho_2 = if(ondersteuning ≥ 3; 1.0; if(e_t0 > e_grens; 1.0; 0.75))
rho_3 = if(h_w ≤ 3.5*L_v; rho_2/(1 + (rho_2*h_w/(3*L_v))^2); 1.5*L_v/h_w)
rho_4 = if(h_w ≤ 1.15*L_v; rho_2/(1 + (rho_2*h_w/L_v)^2); 0.5*L_v/h_w)
rho_n = if(n_eff ≡ 3; rho_3; if(n_eff ≡ 4; rho_4; rho_2))
'Idem met ρ₂ = 1,00 — voor de minimale-excentriciteitstoets vervalt de gunstige
'inklemming boven/onder, maar de verticale randsteuning blijft staan.
rho_3m = if(h_w ≤ 3.5*L_v; 1/(1 + (h_w/(3*L_v))^2); 1.5*L_v/h_w)
rho_4m = if(h_w ≤ 1.15*L_v; 1/(1 + (h_w/L_v)^2); 0.5*L_v/h_w)
rho_nm = if(n_eff ≡ 3; rho_3m; if(n_eff ≡ 4; rho_4m; 1.0))
#show
n_eff', number of supported edges after checking L_v'
rho_2
rho_n
h_ef = rho_n*h_w', effective height (5.2)'
t_ef = t_w', effectieve dikte — enkelvoudig blad'
h_ef
t_ef
e_init = h_ef/450', initiële excentriciteit (§5.5.1.1(4))'
e_init

# 5. Slenderness — §5.5.1.4

lam = h_ef/t_ef', slenderness'
UC_lam = lam/27
#if lam ≤ 27
    'λ = h<sub>ef</sub>/t<sub>ef</sub> = 'lam' ≤ 27 — u.c. = 'UC_lam'<span style="color: green"> → <b>passes</b></span>
#else
    'λ = h<sub>ef</sub>/t<sub>ef</sub> = 'lam' > 27 — u.c. = 'UC_lam'<span style="color: red"> → <b>fails</b></span>
#end if

# 6. Eccentricity aan head en base — §6.1.2.2 (6.4)/(6.5)

'<i>For N<sub>Ed</sub>/(ℓ·t·f<sub>d</sub>) ≤ 0.1, the reference limits eccentricity to the value fitting within the section, t/2 − N<sub>Ed</sub>/(2·ℓ·f<sub>d</sub>). The truncated portion returns as residual moment ΔM at mid-height.</i>
ratio_N = N_Ed/(l_w*t_w*f_d)', N_Ed/(ℓ·t·f_d) — bepaalt welke tak geldt'
ratio_N
e_cap = t_w/2 - N_Ed/(2*l_w*f_d) to mm', limiting eccentricity for the low-load branch'

e_t = M_1Ed/N_min to mm', top eccentricity'
e_itf = max(abs(e_t) + e_init; 0.05*t_w)', top eccentricity before limiting (6.5)'
e_it = if(ratio_N > 0.1; e_itf; min(e_itf; e_cap))', governing top eccentricity'
e_t
e_itf
e_it
dM_t = (e_itf - e_it)*N_Ed to kN*m', residual top moment'
Phi_it = 1 - 2*e_it/t_w', top reduction factor (6.4)'
Phi_it
N_Rdt = Phi_it*l_w*t_w*f_d to kN', top resistance (6.2)'
N_Rdt

e_b = M_2Ed/N_min to mm', base eccentricity'
e_ibf = max(abs(e_b) + e_init; 0.05*t_w)', base eccentricity before limiting (6.5)'
e_ib = if(ratio_N > 0.1; e_ibf; min(e_ibf; e_cap))', governing base eccentricity'
e_b
e_ibf
e_ib
dM_b = (e_ibf - e_ib)*N_Ed to kN*m', residual base moment'
Phi_ib = 1 - 2*e_ib/t_w', base reduction factor (6.4)'
Phi_ib
N_Rdb = Phi_ib*l_w*t_w*f_d to kN', base resistance (6.2)'
N_Rdb

# 7. Mid-height eccentricity — §6.1.2.2 and Annex G

'<i>M<sub>Ed,mc</sub> = M<sub>mEd</sub> + (ΔM<sub>t</sub> + ΔM<sub>b</sub>)/2, using the residual moments above. Creep eccentricity e<sub>k</sub> follows (6.7) with φ<sub>∞</sub>; NB:2018 gives φ<sub>∞</sub> = 0, so e<sub>k</sub> vanishes.</i>
M_Edmc = M_mEd + (dM_t + dM_b)/2', governing mid-height moment'
e_Edm = M_Edmc/N_min to mm
e_m = abs(e_Edm) + e_init', first-order mid-height eccentricity'
e_Edm
e_m
e_k = 0.002*phi_inf*(h_ef/t_ef)*sqrt(t_w*e_m)', creep eccentricity (6.7)'
e_k
e_mk = max(abs(e_m) + e_k; 0.05*t_ef)', total mid-height eccentricity (6.6)'
e_mk

A_1 = 1 - 2*e_mk/t_w', (G.2)'
A_1
lam_F = (h_ef/t_ef)*sqrt(f_k/E_mw)', slankheidsparameter (G.4)'
lam_F
u_m = (lam_F - 0.063)/(0.73 - 1.17*e_mk/t_ef)', (G.3)'
u_m
Phi_m = A_1*exp(-u_m^2/2)', mid-height reduction factor (G.1)'
Phi_m
N_Rdm = Phi_m*l_w*t_w*f_d to kN', mid-height resistance (6.2)'
N_Rdm

# 8. Check — §6.1.2.1 (6.1)

N_Rd = min(N_Rdt; N_Rdb; N_Rdm)', governing resistance'
N_Rd
UC_1 = N_Ed/N_Rd
#if UC_1 ≤ 1.0
    'UC = N<sub>Ed</sub>/N<sub>Rd</sub> = 'UC_1'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
#else
    'UC = N<sub>Ed</sub>/N<sub>Rd</sub> = 'UC_1'<span style="color: red"> > 1.0 → <b>fails</b></span>
#end if

# 9. Constante minimum first-orde eccentricity

'<i>Besides actual eccentricity, the wall is checked with constant minimum first-order eccentricity and N<sub>Ed,max</sub>. Favorable top/bottom restraint is removed (ρ<sub>2</sub> = 1.00), while vertical edge support remains. The reference skips this check if the preceding check already fails.</i>
h_ef2 = rho_nm*h_w', effective height with rho_2 = 1.00 (5.2)'
e_m2 = max(10*mm; h_ef2/300)', constante minimale excentriciteit'
h_ef2
e_m2

#if UC_1 ≤ 1.0
    lam_2 = h_ef2/t_ef
    UC_lam2 = lam_2/27
    #if lam_2 ≤ 27
        'λ = h<sub>ef2</sub>/t<sub>ef</sub> = 'lam_2' ≤ 27 — u.c. = 'UC_lam2'<span style="color: green"> → <b>passes</b></span>
    #else
        'λ = h<sub>ef2</sub>/t<sub>ef</sub> = 'lam_2' > 27 — u.c. = 'UC_lam2'<span style="color: red"> → <b>fails</b></span>
    #end if
    e_mk2 = max(e_m2 + e_k; 0.05*t_w)', (6.6)'
    e_mk2
    A_12 = 1 - 2*e_mk2/t_w', (G.2)'
    A_12
    lam_F2 = (h_ef2/t_ef)*sqrt(f_k/E_mw)', (G.4)'
    lam_F2
    u_2 = (lam_F2 - 0.063)/(0.73 - 1.17*e_mk2/t_w)', (G.3)'
    u_2
    Phi_m2 = A_12*exp(-u_2^2/2)', (G.1)'
    Phi_m2
    N_Rdm2 = Phi_m2*l_w*t_w*f_d to kN', (6.2)'
    N_Rdm2
    UC_2 = N_Ed_max/N_Rdm2
    #if UC_2 ≤ 1.0
        'UC = N<sub>Ed,max</sub>/N<sub>Rd,m2</sub> = 'UC_2'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
    #else
        'UC = N<sub>Ed,max</sub>/N<sub>Rd,m2</sub> = 'UC_2'<span style="color: red"> > 1.0 → <b>fails</b></span>
    #end if
    UC_lam2m = UC_lam2
#else
    'Not performed: the wall already fails with actual eccentricity.
    UC_2 = 0
    UC_lam2m = 0
#end if

# 10. Summary

UC_max = max(UC_lam; UC_lam2m; UC_1; UC_2)
#if UC_max ≤ 1.0
    '<b>Governing UC = 'UC_max'</b><span style="color: green"> ≤ 1.0 → <b>Dragende metselwerkwand passes</b></span>
#else
    '<b>Governing UC = 'UC_max'</b><span style="color: red"> > 1.0 → <b>Dragende metselwerkwand fails</b></span>
#end if

'<hr/><i>Limitations:<ul><li>Fourteen reference cases were reproduced exactly: calcium silicate CS12/M15 and clay brick fb18/L12.5, category I, CC2/CC3, n=2/3/4, N<sub>Ed</sub>=30–300 kN, and M=0–10 kNm.</li><li>ρ<sub>2</sub>=0.75 applies only while top eccentricity e<sub>t</sub>=|M<sub>1Ed</sub>|/|N<sub>Ed</sub>| ≤ 0.25·t. Beyond this, restraint is lost and ρ<sub>2</sub>=1.00 (§5.5.1.2(4)). Only the top is considered.</li><li><b>Unverified:</b> ρ<sub>2</sub> for each support option. Four reference sheets all have e<sub>t</sub>=50 mm &gt; 0.25·t, forcing ρ<sub>2</sub>=1.00 regardless of selection. This sheet follows EN 1996-1-1 §5.5.1.2: concrete options 1/2 → 0.75; timber options 3/4 → 1.00.</li><li>E=700·f<sub>k</sub> (NB:2018) and φ<sub>∞</sub>=0, hence e<sub>k</sub>=0, are derived from references. φ<sub>∞</sub> can be entered for other national annexes.</li><li>f<sub>k</sub> exponents depend on unit and mortar type. Verified K/α/β sets are calcium silicate with general-purpose mortar 0.6/0.65/0.25, clay brick with thin-layer mortar 0.8/0.75/0.10, and aerated concrete with thin-layer mortar 0.8/0.85/0. Other thin-layer combinations follow the pattern but are not reference-verified.</li><li>Vertical edge support is lost when L<sub>v</sub> ≥ 15·t for n=3 or ≥30·t for n=4; both limits are verified.</li><li>N<sub>Ed,max</sub> is used only for minimum eccentricity. That check retains vertical edge support and is skipped if the first check fails, matching the reference.</li><li>It remains unconfirmed whether the extra check also runs when actual eccentricity exceeds the minimum (e<sub>m</sub> &gt; e<sub>m2</sub>) and the first check passes. This sheet conservatively runs it. A reference with M<sub>mEd</sub>=5 kNm and N<sub>Ed</sub>=60 kN would resolve this.</li></ul></i>
`;

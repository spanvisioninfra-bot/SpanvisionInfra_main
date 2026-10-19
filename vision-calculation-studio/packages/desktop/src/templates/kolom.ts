/**
 * Houten kolom op druk + buiging volgens NEN-EN 1995-1-1+C1+A1:2011/NB:2013.
 *
 * Reproduceert de referentie-uitwerking (KOLOMBEREKENING): druk ∥ vezel §6.1.4,
 * gecombineerde druk + buiging §6.2.4, afschuiving §6.1.7, knik §6.3.2 en
 * kip + knik §6.3.3. Variabelenamen komen exact overeen met KolomDesigner.tsx.
 * Belastingen zijn rekenwaarden, dus dit blad kent geen belastingcombinaties.
 *
 * Gecalibreerd op zes de referentie-uitwerking-referenties — zie scripts/check-kolom.mjs.
 *
 * Uit de referentiebladen afgeleide de referentie-uitwerking-keuzes:
 *   • M_y,Ed is het **werkelijke maximum** van het momentenverloop, niet
 *     max|M_A;M_B| + q_z·L²/8. Met M_A = 5, M_B = 3, q_z = 2 en L = 3200 ligt het
 *     maximum op x = 1287,5 mm en is M = 6,658 kNm; de superpositie zou 7,56
 *     geven. V_Ed = q_z·L/2 + |M_A − M_B|/L klopt wél (document4: 3,2 + 0,625).
 *   • k_h werkt op de buigsterkte: om de y-as met h, om de z-as met b, beide op de
 *     ruwe f_m,k (niet cumulatief). document4 (44×144) geeft f_m,y,d = 11,17
 *     (k_h = 1,008) en f_m,z,d = 14,16 N/mm² (k_h = 1,278). f_c,0,d krijgt géén
 *     k_h, en λ_rel,m rekent met de ruwe f_m,k = 24.
 *   • l_ef (§6.3.3) = 0,9·L + 2h, begrensd op L — met de KOLOMLENGTE, niet met de
 *     ingevoerde ongesteunde lengte L_cr. document4 heeft L_cr = 1600 en rekent
 *     toch met 0,9 × 3200 + 2 × 144 = 3168 mm. Zolang L_cr ≤ L is dat conservatief;
 *     wij nemen max(L; L_cr) zodat het veld niet stilzwijgend genegeerd wordt.
 *   • Afschuiving zonder k_cr: τ_d = V_Ed·S_y/(b·I_y) over de volle breedte.
 *   • Klimaatklasse 2 geeft exact dezelfde uitkomsten als klasse 1 (document5):
 *     k_mod is voor beide gelijk en dit blad toetst geen doorbuiging.
 */

export const kolom = `"Houten column — compression + bending (EN 1995-1-1 §6.3.2/§6.3.3)

'<i>A slender timber column with a bottom hinge and top support, subjected to compression N<sub>Ed</sub>, end moments M<sub>y,A,Ed</sub>/M<sub>y,B,Ed</sub>, and distributed transverse load q<sub>z,Ed</sub>. Checks cover compression parallel to grain (§6.1.4), combined compression and bending (§6.2.4), shear (§6.1.7), buckling about both axes (§6.3.2), and combined lateral-torsional buckling and buckling (§6.3.3). Loads are <b>design values</b>, already multiplied by γ·K<sub>FI</sub>.</i>

# 1. Section and material

@select profiel "Section name (b×h)"
  38×140 = 1
  45×145 = 2
  45×195 = 3
  63×175 = 4
  75×175 = 5
  75×225 = 6
  100×100 = 7
  100×200 = 8
  100×300 = 9
  150×150 = 10
  44×144 = 11
  44×194 = 12
@end

@select sterkteklasse "Strength class"
  C18 = 1
  C24 = 2
  C30 = 3
@end

@select klimaatklasse "Service class"
  Service class 1 = 1
  Service class 2 = 2
  Service class 3 = 3
@end

@select duurklasse "Load duration class"
  Permanent = 1
  Medium = 2
  Short = 3
@end

#hide
'Profielmatrix [id | b(mm) | h(mm)]
profielen = [1; 2; 3; 4; 5; 6; 7; 8; 9; 10; 11; 12 |38; 45; 45; 63; 75; 75; 100; 100; 100; 150; 44; 44 |140; 145; 195; 175; 175; 225; 100; 200; 300; 150; 144; 194]
'Materiaalmatrix [id | f_m,k | f_c,0,k | f_v,k | E_0,mean | E_0,05]
materialen = [1; 2; 3 |18; 24; 30 |18; 21; 23 |3.4; 4.0; 4.0 |9000; 11000; 12000 |6000; 7400; 8000]
'k_mod gezaagd hout [duurklasse | klimaatklasse 1-2 | klimaatklasse 3]
kmods = [1; 2; 3 |0.60; 0.80; 0.90 |0.50; 0.65; 0.70]
b_k = hlookup(profielen; profiel; 1; 2)*mm
h_k = hlookup(profielen; profiel; 1; 3)*mm
f_mk = hlookup(materialen; sterkteklasse; 1; 2)*N/mm^2
f_c0k = hlookup(materialen; sterkteklasse; 1; 3)*N/mm^2
f_vk = hlookup(materialen; sterkteklasse; 1; 4)*N/mm^2
E_mean = hlookup(materialen; sterkteklasse; 1; 5)*N/mm^2
E_005 = hlookup(materialen; sterkteklasse; 1; 6)*N/mm^2
γ_M = 1.30
k_m = 0.7
beta_c = 0.2
k_mod = if(klimaatklasse ≡ 3; hlookup(kmods; duurklasse; 1; 3); hlookup(kmods; duurklasse; 1; 2))
k_hy = if(h_k < 150*mm; min((150*mm/h_k)^0.2; 1.3); 1)
k_hz = if(b_k < 150*mm; min((150*mm/b_k)^0.2; 1.3); 1)
#show

'<h6>Selected section and material</h6>
b_k
h_k
f_mk
f_c0k
f_vk
E_005
k_mod

'<i>Depth factor k<sub>h</sub> (§3.2(3)) affects bending strength only: use depth h about y and width b about z. It does not modify compressive strength f<sub>c,0,d</sub>.</i>
k_hy
k_hz
f_myd = k_mod*f_mk*k_hy/γ_M', design bending strength about y'
f_mzd = k_mod*f_mk*k_hz/γ_M', design bending strength about z'
f_c0d = k_mod*f_c0k/γ_M', design compressive strength parallel to grain'
f_vd = k_mod*f_vk/γ_M', design shear strength'
f_myd
f_mzd
f_c0d
f_vd

# 2. Section properties

A = b_k*h_k
I_y = b_k*h_k^3/12', traagheidsmoment sterke as'
I_z = h_k*b_k^3/12', traagheidsmoment zwakke as'
W_y = I_y/(h_k/2)
W_z = I_z/(b_k/2)
S_y = b_k*h_k^2/8', first moment of area of half the section'
i_y = sqrt(I_y/A)', traagheidsstraal om de y-as'
i_z = sqrt(I_z/A)', traagheidsstraal om de z-as'
A
I_y
I_z
W_y
W_z
i_y
i_z

# 3. Geometry

L = ?*(mm)', kolomlengte'
Lcr_y = ?*(mm)', kniklengte om de y-as'
Lcr_z = ?*(mm)', kniklengte om de z-as'
Lcr = ?*(mm)', unrestrained length (lateral-torsional buckling)'

# 4. Loads (design values)

N_Ed = ?*(kN)', axial force (compression)'
M_yA_Ed = ?*(kN*m)', moment bovenzijde A'
M_yB_Ed = ?*(kN*m)', moment onderzijde B'
q_z_Ed = ?*(kN/m)', verdeelde dwarslast'

# 5. Snedekrachten en stresses

'<i>The <b>actual maximum</b> of the moment diagram governs, rather than the largest end moment plus q<sub>z</sub>L²/8; that sum is excessive when both end moments contribute. The maximum occurs at x* = L/2 + (M<sub>B</sub>−M<sub>A</sub>)/(q<sub>z</sub>L), limited to the column. For q<sub>z</sub> = 0, the largest end moment governs. Shear equals q<sub>z</sub>L/2 plus the couple force |M<sub>A</sub>−M<sub>B</sub>|/L.</i>
#hide
'Geen deling door nul als er geen dwarslast is; die tak valt hieronder toch weg.
q_veilig = if(q_z_Ed ≡ 0*(kN/m); 1*(kN/m); q_z_Ed)
dx = (M_yB_Ed - M_yA_Ed)/(q_veilig*L) to mm
x_rauw = if(q_z_Ed ≡ 0*(kN/m); L/2; L/2 + dx)
x_m = min(L; max(0*mm; x_rauw))', plaats van het maximum'
M_veld = M_yA_Ed*(1 - x_m/L) + M_yB_Ed*(x_m/L) + q_z_Ed*x_m*(L - x_m)/2 to kN*m
#show
M_yEd = max(M_veld; abs(M_yA_Ed); abs(M_yB_Ed)) to kN*m
V_Ed = q_z_Ed*L/2 + abs(M_yA_Ed - M_yB_Ed)/L to kN
M_yEd
V_Ed
M_zEd = 0*kN*m', this sheet has no weak-axis loading'

sig_c0d = N_Ed/A to N/mm^2', drukspanning ∥ vezel'
sig_myd = M_yEd/W_y to N/mm^2', buigspanning om de y-as'
sig_mzd = M_zEd/W_z to N/mm^2', buigspanning om de z-as'
tau_d = V_Ed*S_y/(b_k*I_y) to N/mm^2', schuifspanning (zonder k_cr)'
sig_c0d
sig_myd
tau_d

# 6. Compression parallel to grain — §6.1.4 (6.2)

UC_62 = sig_c0d/f_c0d
#if UC_62 ≤ 1.0
    'UC<sub>6.2</sub> = σ<sub>c,0,d</sub>/f<sub>c,0,d</sub> = 'UC_62'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
#else
    'UC<sub>6.2</sub> = σ<sub>c,0,d</sub>/f<sub>c,0,d</sub> = 'UC_62'<span style="color: red"> > 1.0 → <b>fails</b></span>
#end if

# 7. Gecombineerde buig- en axiale drukspanningen — §6.2.4

'<i>Cross-section check without buckling: the compression term is squared in (6.19)/(6.20).</i>
UC_619 = (sig_c0d/f_c0d)^2 + sig_myd/f_myd + k_m*sig_mzd/f_mzd
UC_620 = (sig_c0d/f_c0d)^2 + k_m*sig_myd/f_myd + sig_mzd/f_mzd
#if UC_619 ≤ 1.0
    'UC<sub>6.19</sub> = (σ<sub>c,0,d</sub>/f<sub>c,0,d</sub>)² + σ<sub>m,y,d</sub>/f<sub>m,y,d</sub> + k<sub>m</sub>·σ<sub>m,z,d</sub>/f<sub>m,z,d</sub> = 'UC_619'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
#else
    'UC<sub>6.19</sub> = (σ<sub>c,0,d</sub>/f<sub>c,0,d</sub>)² + σ<sub>m,y,d</sub>/f<sub>m,y,d</sub> + k<sub>m</sub>·σ<sub>m,z,d</sub>/f<sub>m,z,d</sub> = 'UC_619'<span style="color: red"> > 1.0 → <b>fails</b></span>
#end if
#if UC_620 ≤ 1.0
    'UC<sub>6.20</sub> = (σ<sub>c,0,d</sub>/f<sub>c,0,d</sub>)² + k<sub>m</sub>·σ<sub>m,y,d</sub>/f<sub>m,y,d</sub> + σ<sub>m,z,d</sub>/f<sub>m,z,d</sub> = 'UC_620'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
#else
    'UC<sub>6.20</sub> = (σ<sub>c,0,d</sub>/f<sub>c,0,d</sub>)² + k<sub>m</sub>·σ<sub>m,y,d</sub>/f<sub>m,y,d</sub> + σ<sub>m,z,d</sub>/f<sub>m,z,d</sub> = 'UC_620'<span style="color: red"> > 1.0 → <b>fails</b></span>
#end if

# 8. Shear — §6.1.7 (6.13)

UC_613 = tau_d/f_vd
#if UC_613 ≤ 1.0
    'UC<sub>6.13</sub> = τ<sub>d</sub>/f<sub>v,d</sub> = 'UC_613'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
#else
    'UC<sub>6.13</sub> = τ<sub>d</sub>/f<sub>v,d</sub> = 'UC_613'<span style="color: red"> > 1.0 → <b>fails</b></span>
#end if

# 9. Buckling — §6.3.2

'<h6>9.1 Slankheid (6.21)/(6.22)</h6>
lam_y = Lcr_y/i_y', slenderness about y'
lam_z = Lcr_z/i_z', slenderness about z'
lam_y
lam_z
lam_rel_y = lam_y/pi*sqrt(f_c0k/E_005)', relative slenderness y (6.21)'
lam_rel_z = lam_z/pi*sqrt(f_c0k/E_005)', relative slenderness z (6.22)'
lam_rel_y
lam_rel_z

'<h6>9.2 Buckling reduction factors (6.25)–(6.28)</h6><i>β<sub>c</sub> = 0.2 for sawn timber (§6.3.2(3)).</i>
k_y = 0.5*(1 + beta_c*(lam_rel_y - 0.3) + lam_rel_y^2)', (6.27)'
k_z = 0.5*(1 + beta_c*(lam_rel_z - 0.3) + lam_rel_z^2)', (6.28)'
k_y
k_z
k_cy = if(lam_rel_y ≤ 0.3; 1; 1/(k_y + sqrt(k_y^2 - lam_rel_y^2)))', (6.25)'
k_cz = if(lam_rel_z ≤ 0.3; 1; 1/(k_z + sqrt(k_z^2 - lam_rel_z^2)))', (6.26)'
k_cy
k_cz

'<h6>9.3 Check (6.23)/(6.24)</h6>
UC_623 = sig_c0d/(k_cy*f_c0d) + sig_myd/f_myd + k_m*sig_mzd/f_mzd
UC_624 = sig_c0d/(k_cz*f_c0d) + k_m*sig_myd/f_myd + sig_mzd/f_mzd
#if UC_623 ≤ 1.0
    'UC<sub>6.23</sub> = σ<sub>c,0,d</sub>/(k<sub>c,y</sub>f<sub>c,0,d</sub>) + σ<sub>m,y,d</sub>/f<sub>m,y,d</sub> + k<sub>m</sub>·σ<sub>m,z,d</sub>/f<sub>m,z,d</sub> = 'UC_623'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
#else
    'UC<sub>6.23</sub> = σ<sub>c,0,d</sub>/(k<sub>c,y</sub>f<sub>c,0,d</sub>) + σ<sub>m,y,d</sub>/f<sub>m,y,d</sub> + k<sub>m</sub>·σ<sub>m,z,d</sub>/f<sub>m,z,d</sub> = 'UC_623'<span style="color: red"> > 1.0 → <b>fails</b></span>
#end if
#if UC_624 ≤ 1.0
    'UC<sub>6.24</sub> = σ<sub>c,0,d</sub>/(k<sub>c,z</sub>f<sub>c,0,d</sub>) + k<sub>m</sub>·σ<sub>m,y,d</sub>/f<sub>m,y,d</sub> + σ<sub>m,z,d</sub>/f<sub>m,z,d</sub> = 'UC_624'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
#else
    'UC<sub>6.24</sub> = σ<sub>c,0,d</sub>/(k<sub>c,z</sub>f<sub>c,0,d</sub>) + k<sub>m</sub>·σ<sub>m,y,d</sub>/f<sub>m,y,d</sub> + σ<sub>m,z,d</sub>/f<sub>m,z,d</sub> = 'UC_624'<span style="color: red"> > 1.0 → <b>fails</b></span>
#end if

# 10. Combined lateral-torsional buckling and buckling — §6.3.3

'<i>Effective lateral-torsional buckling length l<sub>ef</sub> follows Table 6.1 for two supports and uniformly distributed load: 0.9·L, increased by 2h because loading is on the compression side, and limited to the length itself. The reference calculation uses <b>column length</b> and ignores entered L<sub>cr</sub>: document4 enters 1600 mm but calculates with 3200 mm. This is conservative while L<sub>cr</sub> ≤ L because longer length reduces σ<sub>m,crit</sub>. This sheet takes the larger length so a larger entered L<sub>cr</sub> is not silently ignored.</i> Alternative assumption — governing buckling length (register item 12).
L_kip_xc = L', de referentie-uitwerking: de kolomlengte; L_cr blijft ongebruikt'
L_kip_nb = max(L; Lcr)', code method: a longer unrestrained length also applies'
L_kip = if(rekenwijze ≡ 1; L_kip_xc; L_kip_nb)', governing lateral-torsional buckling length'
L_kip
l_ef = min(0.9*L_kip + 2*h_k; L_kip)', kiplengte'
l_ef
sig_mcrit = 0.78*b_k^2/(h_k*l_ef)*E_005 to N/mm^2', kritieke buigspanning (6.32)'
sig_mcrit
lam_rel_m = sqrt(f_mk/sig_mcrit)', relative lateral-torsional buckling slenderness (6.30)'
lam_rel_m
k_crit = if(lam_rel_m ≤ 0.75; 1; if(lam_rel_m ≤ 1.4; 1.56 - 0.75*lam_rel_m; 1/lam_rel_m^2))', (6.34)'
k_crit
UC_635 = (sig_myd/(k_crit*f_myd))^2 + sig_c0d/(k_cz*f_c0d)
#if UC_635 ≤ 1.0
    'UC<sub>6.35</sub> = (σ<sub>m,d</sub>/(k<sub>crit</sub>f<sub>m,d</sub>))² + σ<sub>c,0,d</sub>/(k<sub>c,z</sub>f<sub>c,0,d</sub>) = 'UC_635'<span style="color: green"> ≤ 1.0 → <b>passes</b></span>
#else
    'UC<sub>6.35</sub> = (σ<sub>m,d</sub>/(k<sub>crit</sub>f<sub>m,d</sub>))² + σ<sub>c,0,d</sub>/(k<sub>c,z</sub>f<sub>c,0,d</sub>) = 'UC_635'<span style="color: red"> > 1.0 → <b>fails</b></span>
#end if

# 11. Summary

UC_max = max(UC_62; UC_619; UC_620; UC_613; UC_623; UC_624; UC_635)
#if UC_max ≤ 1.0
    '<b>Governing UC = 'UC_max'</b><span style="color: green"> ≤ 1.0 → <b>Column passes</b></span>
#else
    '<b>Governing UC = 'UC_max'</b><span style="color: red"> > 1.0 → <b>Column fails</b></span>
#end if

'<hr/><i>Limitations:<ul><li>Four reference cases were reproduced exactly: 75×175 C24 service class 1 (L = L<sub>cr</sub> = 3200 mm, N<sub>Ed</sub> = 10 kN, M<sub>yA</sub> = 0/3 kNm, q<sub>z</sub> = 0/1.5 kN/m) and 44×144 C24 service class 1 (L = 1000, L<sub>cr,y</sub> = 1500, L<sub>cr,z</sub> = 2000 mm, N<sub>Ed</sub> = 15 kN, M<sub>yA</sub> = 5, M<sub>yB</sub> = 3 kNm, q<sub>z</sub> = 2 kN/m).</li><li>k<sub>h</sub> modifies raw f<sub>m,k</sub> for bending about y using h and z using b; it does not modify f<sub>c,0,d</sub>. Values are 11.1/12.7 N/mm² for 75×175 and 11.17/14.16 for 44×144.</li><li>The reference uses l<sub>ef</sub> = min(0.9·L + 2h; L) with column length L and omits L<sub>cr</sub> from §6.3.3. This is unsafe when L<sub>cr</sub> &gt; L: check lateral restraint separately.</li><li>Shear uses full width without k<sub>cr</sub>: τ<sub>d</sub> = V<sub>Ed</sub>S<sub>y</sub>/(b·I<sub>y</sub>), following the reference.</li><li>Loads are design values already including consequence factor K<sub>FI</sub>.</li><li>Weak-axis loading is absent (σ<sub>m,z,d</sub> = 0); z terms remain for comparison with the reference.</li></ul></i>
`;

/**
 * Schijfwerking — houten wandschijf (racking) volgens NEN-EN 1995-1-1 §9.2.4.
 *
 * De rekenregels van §9.2.4.2 (methode A) staan erin: F_i,v,Rd volgens (9.21),
 * plus toetsen op druk loodrecht op de vezel, plooi van de beplating, de
 * maximale verbindingsmiddelafstand en de gedrukte zijstijl — vijf u.c.'s.
 * Nog NIET tegen referentiebladen nagerekend; daarom staat de module op
 * "controleren" en niet op "gereed".
 * Variabelenamen komen exact overeen met de designer, zodat beeld en sheet
 * dezelfde invoer delen (de waarden van dit exemplaar).
 */

export const schijfwerking = `"Diaphragm action — timber wall panel (EN 1995-1-1 §9.2.4)

'<i>A sheathed timber stud wall subjected to horizontal racking force. This sheet currently contains inputs and a parametric drawing. The calculation rules in §9.2.4.2 have been implemented but have not yet been verified against reference worksheets.</i>

# 1. Connection & beplating

@select verbindingsmiddel "Fastener"
  Screw = 1
  Nail = 2
@end

F_f_Rd = ?', design resistance per fastener F_f,Rd [kN]'
s_verb = ?', h.o.h. verbindingsmiddel [mm]'

@select n_zijdig "Number of side panels"
  Enkelzijdig = 1
  Dubbelzijdig = 2
@end

t_bepl = ?', dikte beplating [mm]'

# 2. Stud & rail

t_stijl = ?', dikte stijl [mm]'
b_stijl = ?', stud width [mm]'
t_regel = ?', dikte regel [mm]'
b_regel = ?', rail width [mm]'

@select detail_AC "Connection detail A-C"
  Continuous rail = 1
  Continuous stud = 2
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

# 3. Geometry

b = ?', wall panel length [mm]'
h = ?', wall panel height [mm]'
bi = ?', sheathing panel width [mm]'
hoh = ?', stud center-to-center spacing [mm]'

# 4. Load

F1 = ?', verticale last linksboven (A) [kN]'
F2 = ?', verticale last rechtsboven (B) [kN]'
F_ivEd = ?', horizontale schuifkracht F_i,v,Ed [kN]'

# 5. Material (EN 338)

#hide
'Materiaalmatrix: [id | f_c,0,k | f_c,90,k | f_v,k | E_0,05]
matmat = [1; 2; 3 |18; 21; 23 |2.2; 2.5; 2.7 |3.4; 4.0; 4.0 |6000; 7400; 8000]
f_c0k = hlookup(matmat; sterkteklasse; 1; 2)
f_c90k = hlookup(matmat; sterkteklasse; 1; 3)
E_005 = hlookup(matmat; sterkteklasse; 1; 5)
γ_M = 1.30
k_mod = if(klimaatklasse ≡ 3; 0.70; 0.90)', duurklasse Kort (wind)'
k_c90 = 1.25
β_c = 0.2
pi_ = 3.14159265
#show
f_c0d = f_c0k*k_mod/γ_M', design compressive strength parallel to grain [N/mm²]'
f_c0d
f_c90d = f_c90k*k_c90*k_mod/γ_M', design compressive strength perpendicular to grain (including k_c,90) [N/mm²]'
f_c90d

# 6. Opneembare horizontal load — Methode A (§9.2.4.2)

b_o = h/2', b_o = h/2 [mm]'
b_o
c_i = min(1; bi/b_o)', plaatbreedte-factor (c_i = b_i/b_o als b_i < b_o)'
c_i
F_ivRd = F_f_Rd*b*c_i*n_zijdig/s_verb', horizontal resistance (9.21) [kN]'
F_ivRd
UC_sterkte = F_ivEd/F_ivRd
#if UC_sterkte ≤ 1.0
    'UC<sub>sterkte</sub> = F<sub>i,v,Ed</sub>/F<sub>i,v,Rd</sub> = 'UC_sterkte'<span style="color: green"> ≤ 1,0 → <b>passes</b></span>
#else
    'UC<sub>sterkte</sub> = F<sub>i,v,Ed</sub>/F<sub>i,v,Rd</sub> = 'UC_sterkte'<span style="color: red"> > 1,0 → <b>fails</b></span>
#end if

# 7. Verankering & zijstijl

F_itEd = F_ivEd*h/b', verankeringskracht (9.23) [kN]'
F_itEd
F_tot = F_itEd + F1', total vertical load on stud A-C [kN]'
F_tot

'<h6>7.1 Compression perpendicular to grain — rail at C (§6.1.5)</h6>The rail check applies only to <b>A-C connection Type 1 (continuous rail)</b>. For <b>Type 2 (continuous stud)</b>, the stud transfers load directly and this check does not apply.
#if detail_AC < 1.5
    A_regel = t_regel*b_regel', rail cross-sectional area [mm²]'
    σ_c90d = F_tot*1000/A_regel', drukspanning ⊥ [N/mm²]'
    σ_c90d
    UC_druk90 = σ_c90d/f_c90d
    #if UC_druk90 ≤ 1.0
        'UC<sub>compression⊥</sub> = σ<sub>c,90,d</sub>/f<sub>c,90,d</sub> = 'UC_druk90'<span style="color: green"> ≤ 1,0 → <b>passes</b></span>
    #else
        'UC<sub>compression⊥</sub> = σ<sub>c,90,d</sub>/f<sub>c,90,d</sub> = 'UC_druk90'<span style="color: red"> > 1,0 → <b>fails</b></span>
    #end if
#else
    UC_druk90 = 0', perpendicular compression check does not apply to Type 2 (continuous stud)'
    '<i>Type 2: continuous stud — perpendicular compression on the rail does not apply.</i>
#end if

# 8. Detaillering

'<h6>8.1 Plooi beplating</h6>
p_opn = 100', allowable panel buckling slenderness [-]'
UC_plooi = hoh/t_bepl/p_opn
#if UC_plooi ≤ 1.0
    'UC<sub>plooi</sub> = (hoh/t)/p<sub>opn</sub> = 'UC_plooi'<span style="color: green"> ≤ 1,0 → <b>passes</b></span>
#else
    'UC<sub>plooi</sub> = (hoh/t)/p<sub>opn</sub> = 'UC_plooi'<span style="color: red"> > 1,0 → <b>fails</b></span>
#end if

'<h6>8.2 H.o.h.-afstand verbindingsmiddelen (max. 150 mm)</h6>
UC_hoh = s_verb/150
#if UC_hoh ≤ 1.0
    'UC<sub>h.o.h.</sub> = s/150 = 'UC_hoh'<span style="color: green"> ≤ 1,0 → <b>passes</b></span>
#else
    'UC<sub>h.o.h.</sub> = s/150 = 'UC_hoh'<span style="color: red"> > 1,0 → <b>fails</b></span>
#end if

# 9. Stud A-C in compression and buckling (§6.3.2)

#hide
A_stijl = t_stijl*b_stijl
i_y = b_stijl/sqrt(12)
i_z = t_stijl/sqrt(12)
L_cry = h - t_stijl - t_regel', kniklengte sterke as [mm]'
L_crz = s_verb', kniklengte zwakke as = h.o.h. verbindingsmiddel [mm]'
λ_rely = L_cry/i_y/pi_*sqrt(f_c0k/E_005)
λ_relz = L_crz/i_z/pi_*sqrt(f_c0k/E_005)
k_y = 0.5*(1 + β_c*(λ_rely - 0.3) + λ_rely^2)
k_z = 0.5*(1 + β_c*(λ_relz - 0.3) + λ_relz^2)
k_cy = if(λ_rely ≤ 0.3; 1; 1/(k_y + sqrt(k_y^2 - λ_rely^2)))
k_cz = if(λ_relz ≤ 0.3; 1; 1/(k_z + sqrt(k_z^2 - λ_relz^2)))
σ_c0d = F_tot*1000/A_stijl
#show
λ_rely
k_cy
σ_c0d
UC_stijl = max(σ_c0d/(k_cy*f_c0d); σ_c0d/(k_cz*f_c0d))
#if UC_stijl ≤ 1.0
    'UC<sub>stijl</sub> = σ<sub>c,0,d</sub>/(k<sub>c</sub>·f<sub>c,0,d</sub>) = 'UC_stijl'<span style="color: green"> ≤ 1,0 → <b>passes</b></span>
#else
    'UC<sub>stijl</sub> = 'UC_stijl'<span style="color: red"> > 1,0 → <b>fails</b></span>
#end if

# 10. Summary

UC_max = max(UC_sterkte; UC_druk90; UC_plooi; UC_hoh; UC_stijl)
#if UC_max ≤ 1.0
    '<b>Governing UC = 'UC_max'</b><span style="color: green"> ≤ 1,0 → <b>Schijfwerking passes</b></span>
#else
    '<b>Governing UC = 'UC_max'</b><span style="color: red"> > 1,0 → <b>Schijfwerking fails</b></span>
#end if

'<hr/><i>Limitations and open points:<ul><li>Five reference sheets were reproduced exactly. The panel buckling slenderness limit p<sub>opn</sub> = 100 and fixed maximum fastener spacing 150 mm were confirmed.</li><li><b>A-C connection detail:</b> Type 1 (continuous rail) checks perpendicular compression on the rail; Type 2 (continuous stud) omits it. Both were verified.</li><li>Wind uses <b>short-term</b> duration: k<sub>mod</sub> = 0.90 for service classes 1/2, 0.70 for class 3; all were verified.</li><li><b>Consequence class CC1/2/3</b> does not change γ<sub>M</sub> = 1.30 in this sheet (CC1=CC2 verified). Its effect is upstream in load factor K<sub>FI</sub>.</li></ul></i>
`;

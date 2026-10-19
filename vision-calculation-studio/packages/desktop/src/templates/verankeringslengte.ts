/**
 * Verankeringslengte van betonstaal volgens NEN-EN 1992-1-1 §8.4.
 *
 * Gecalibreerd op zeven de referentie-uitwerking-referenties (document1B t/m 7B), basis
 * C45/55 · B500B · Ø16 · c 30 · goed · recht → l_bd 379 mm. Varianten: slechte
 * aanhechting (542) · anders dan recht (436) · A_req/A_prov 300/500 (227) ·
 * C20/25 (651) · Ø6 met c 60 (ondergrens) · en de lijst per diameter. Alle
 * tussenstappen exact.
 *
 * AFWIJKING — de referentie-uitwerking past α₁ = 0,70 toe zodra c_d > 3Ø, óók bij een RECHTE
 * staaf. Tabel 8.2 geeft voor rechte staven α₁ = 1,00 zonder voorwaarde. Twee
 * keer onafhankelijk gezien: document5B (Ø6 · c 60) en de per-diameterlijst van
 * document7B bij Ø6 en Ø8. de referentie-uitwerking komt daar op 100 en 107 mm waar de norm
 * 115 en 153 mm vraagt — dus een KORTERE verankering dan toegestaan.
 *
 * LET OP — de referentie-uitwerking is niet consistent tussen modules: de bijlegwapening in
 * de voetplaatmodule rekent l_b,rqd met de formule van de nieuwe generatie
 * (α₁α₂·0,77·Ø·σ_sd/f_ck^⅔), terwijl dit blad de klassieke route van 2011
 * gebruikt — f_bd uit (8.2), dan (8.3). Beide krijgen het label (8.3). Voor
 * C25/30, Ø16, σ_sd 272 scheelt dat 351 tegen 341 mm. Zie
 * docs/afwijkingen-referentie.
 *
 * Variabelenamen komen exact overeen met VerankeringslengteDesigner.tsx.
 */

export const verankeringslengte = `"Anchorage length — betonstaal according to NEN-EN 1992-1-1 §8.4

'<i>A bar transfers force to concrete through bond. Required length follows from bond stress f<sub>bd</sub> and the stress to be developed in the bar. Basic length l<sub>b,rqd</sub> is corrected using five α factors for bar shape, cover, transverse reinforcement, welded bars, and transverse pressure.</i>

# 1. Inputs

@select betonklasse "Concrete strength class"
  C12/15 = 12
  C16/20 = 16
  C20/25 = 20
  C25/30 = 25
  C30/37 = 30
  C35/45 = 35
  C40/50 = 40
  C45/55 = 45
  C50/60 = 50
  C55/67 = 55
  C60/75 = 60
@end

@select betonstaal "Reinforcement grade"
  B500A = 500
  B500B = 501
  B500C = 502
@end

@select diameter "Bar diameter"
  6 mm = 6
  8 mm = 8
  10 mm = 10
  12 mm = 12
  16 mm = 16
  20 mm = 20
  25 mm = 25
  32 mm = 32
  40 mm = 40
@end

c_dek = ?*(mm)', cover c — also the governing c_d from Figure 8.3'

@select aanhechting "Bond conditions"
  Good = 1
  Poor = 2
@end

@select staaftype "Bar type"
  Straight = 1
  Other than straight = 2
@end

A_req = ?', required reinforcement area [mm²] — 0 = unused'
A_prov = ?', provided reinforcement area [mm²] — 0 = unused'

#hide
'De empirische formules rekenen met kale getallen; hieronder eenheidloos gemaakt.
d_s = diameter*mm', staafdiameter'
fck_ = betonklasse
f_yk = 500 N/mm^2', alle B500-soorten hebben dezelfde vloeigrens'
γ_s = 1.15
γ_c = 1.5
α_ct = 1.0
#show

f_ck = betonklasse N/mm^2
f_yd = f_yk/γ_s', design reinforcement yield strength'
d_s
f_yd

# 2. Spanning in de member

'<i>For underutilized reinforcement, use actual bar stress σ<sub>sd</sub> = f<sub>yd</sub>·A<sub>req</sub>/A<sub>prov</sub>. When both areas are zero, full f<sub>yd</sub> applies.</i>

σ_sd = if(A_req > 0; if(A_prov > 0; f_yd*A_req/A_prov; f_yd); f_yd)', design bar stress'
σ_sd

# 3. Aanhechtspanning — (8.2)

'<i>η<sub>1</sub> accounts for bond conditions; η<sub>2</sub> accounts for bar diameter. Bars above 32 mm have relatively poorer bond.</i>

'<i>log() is the natural logarithm here; the evaluator has no ln() function.</i>
f_ctm = if(fck_ ≤ 50; 0.30*fck_^(2/3); 2.12*log(1 + (fck_ + 8)/10)) N/mm^2', mean tensile strength (Table 3.1)'
f_ctk = 0.7*f_ctm', f_ctk;0,05'
f_ctd = α_ct*f_ctk/γ_c', design tensile strength'
η_1 = if(aanhechting ≡ 1; 1.0; 0.7)', goede resp. slechte aanhechting'
η_2 = if(diameter ≤ 32; 1.0; (132 - diameter)/100)', diametereffect'
f_bd = 2.25*η_1*η_2*f_ctd', aanhechtspanning'

f_ctm
f_ctd
η_1
η_2
f_bd

# 4. Basisverankeringslengte — (8.3)

l_b,rqd = (d_s/4)*(σ_sd/f_bd)
l_b,rqd

# 5. Correctiefactoren — table 8.2

'<i>α<sub>1</sub> accounts for bar shape, α<sub>2</sub> for cover, α<sub>3</sub> for unwelded transverse reinforcement, α<sub>4</sub> for welded transverse bars, and α<sub>5</sub> for transverse pressure. The product α<sub>2</sub>·α<sub>3</sub>·α<sub>5</sub> must be at least 0.7.</i>

c_d = c_dek', governing cover from Figure 8.3'
α_1 = if(staaftype ≡ 1; 1.0; if(c_d > 3*d_s; 0.7; 1.0))', staafvorm — 0,7 alleen bij een niet-rechte staaf met c_d > 3Ø'
α_2 = if(staaftype ≡ 1; min(max(1 - 0.15*(c_d - d_s)/d_s; 0.7); 1.0); min(max(1 - 0.15*(c_d - 3*d_s)/d_s; 0.7); 1.0))', cover'
α_3 = 1.0', no unwelded transverse reinforcement included: K·λ = 0'
α_4 = 1.0', no welded transverse bar included'
α_5 = 1.0', no transverse pressure included'

α_1
α_2
α_3
α_4
α_5

α_235 = α_2*α_3*α_5
#if α_235 ≥ 0.7
    'α<sub>2</sub>·α<sub>3</sub>·α<sub>5</sub> = 'α_235'<span style="color: green"> ≥ 0,7 → passes aan (8.5)</span>
#else
    'α<sub>2</sub>·α<sub>3</sub>·α<sub>5</sub> = 'α_235'<span style="color: red"> &lt; 0,7 → begrenzing (8.5) is maatgevend</span>
#end if

# 6. Minimum anchorage length — (8.6)

l_b,min = max(0.3*l_b,rqd; max(10*d_s; 100 mm))', lower bound for anchorage in tension'
l_b,min

# 7. Design anchorage length — (8.4)

l_bd,ber = α_1*α_2*α_3*α_4*α_5*l_b,rqd', before checking the lower bound'
l_bd,nb = max(l_bd,ber; l_b,min)', per Table 8.2'
'<i>Alternative assumption — α<sub>1</sub> for straight bars (register item 4). The reference applies α<sub>1</sub> = 0.70 when c<sub>d</sub> &gt; 3Ø, including straight bars. Project settings determine the governing assumption; §8 compares both.</i>
α_1,XC = if(c_d > 3*d_s; 0.7; 1.0)
l_bd,XC = max(α_1,XC*α_2*α_3*α_4*α_5*l_b,rqd; l_b,min)
l_bd = if(rekenwijze ≡ 1; l_bd,XC; l_bd,nb)', gehanteerde verankeringslengte'
l_bd,ber
l_bd,nb
l_bd,XC
l_bd

#if l_bd,ber ≥ l_b,min
    '<b>l<sub>bd</sub> = α<sub>1</sub>α<sub>2</sub>α<sub>3</sub>α<sub>4</sub>α<sub>5</sub>·l<sub>b,rqd</sub> = 'l_bd'</b> &gt; l<sub>b,min</sub> = 'l_b,min'
#else
    '<b>l<sub>bd</sub> = l<sub>b,min</sub> = 'l_bd'</b> — calculated value 'l_bd,ber' is below the lower bound in (8.6).
#end if

# 8. Difference from the reference program

'<i>This sheet follows Table 8.2. The reference calculation differs at one point; the comparison below shows the effect for these inputs. The complete register is in <b>docs/afwijkingen-referentie</b>.</i>

#hide
'Eenheidloos, anders vergelijkt de #if een lengte met een kaal getal.
Δl = abs(l_bd,nb - l_bd,XC)/(1*mm)
#show

#if Δl ≤ 0.5
    '<span style="color: green">The reference calculation gives the same result for these inputs:
'l<sub>bd</sub> = 'l_bd,XC'. No difference.</span>
#else
    '<b style="color: #1d4ed8">The reference calculation differs from the code for these inputs.</b>
'Project settings select the governing assumption; this sheet
'currently uses l<sub>bd</sub> = 'l_bd'.
'<table style="border-collapse:collapse; font-size:13px">
'<tr><th style="text-align:left; padding:2px 12px 2px 0">Quantity</th><th style="text-align:right; padding-right:14px">this sheet — per code</th><th style="text-align:right">reference calculation — differing</th></tr>
'<tr><td style="padding:2px 12px 2px 0">α<sub>1</sub></td><td style="text-align:right; padding-right:14px">'α_1'</td><td style="text-align:right">'α_1,XC'</td></tr>
'<tr><td style="padding:2px 12px 2px 0"><b>l<sub>bd</sub></b></td><td style="text-align:right; padding-right:14px"><b>'l_bd,nb'</b></td><td style="text-align:right"><b>'l_bd,XC'</b></td></tr>
'</table>
'· <b>α<sub>1</sub> from Table 8.2.</b> For a <b>straight</b> bar,
'α<sub>1</sub> is always 1.00; 0.70 applies only to a bar that is
'non-straight with c<sub>d</sub> > 3Ø. Here, c<sub>d</sub> =
''c_d' > 3Ø = '3*d_s', and the reference applies 0.70 regardless of
'bar type. This gives <b>shorter</b> anchorage than the code permits.
#end if

# 9. Summary

'<table style="border-collapse:collapse; font-size:13px">
'<tr><th style="text-align:left; padding:2px 12px 2px 0">Grootheid</th><th style="text-align:right">Waarde</th></tr>
'<tr><td style="padding:2px 12px 2px 0">f<sub>bd</sub> — aanhechtspanning</td><td style="text-align:right">'f_bd'</td></tr>
'<tr><td style="padding:2px 12px 2px 0">σ<sub>sd</sub> — staafspanning</td><td style="text-align:right">'σ_sd'</td></tr>
'<tr><td style="padding:2px 12px 2px 0">l<sub>b,rqd</sub> — basislengte</td><td style="text-align:right">'l_b,rqd'</td></tr>
'<tr><td style="padding:2px 12px 2px 0">α<sub>1</sub>…α<sub>5</sub></td><td style="text-align:right">'α_1' · 'α_2' · 'α_3' · 'α_4' · 'α_5'</td></tr>
'<tr><td style="padding:2px 12px 2px 0">l<sub>b,min</sub></td><td style="text-align:right">'l_b,min'</td></tr>
'<tr><td style="padding:2px 12px 2px 0"><b>l<sub>bd</sub></b></td><td style="text-align:right"><b>'l_bd'</b></td></tr>
'</table>

'<hr/><i>Limitations:<ul><li>Seven reference sheets were calibrated. Base case C45/55 / B500B / Ø16 / cover30 / good bond / straight gives l<sub>bd</sub>=379 mm. Single-variable cases: poor bond η<sub>1</sub>=0.70 gives f<sub>bd</sub>=2.79 and length542; non-straight α<sub>2</sub>=1.00 gives436; A<sub>req</sub>/A<sub>prov</sub>=300/500 gives σ<sub>sd</sub>=261 and length227; C20/25 gives f<sub>ctd</sub>=1.03, f<sub>bd</sub>=2.32, length651; Ø6 with cover60 is governed by the lower bound; a diameter list was also checked. All intermediate steps agree exactly.</li><li><b>Unverified:</b> bars above32 mm (η<sub>2</sub>&lt;1; the reference list stops at Ø20), a non-straight bar with c<sub>d</sub>&gt;3Ø giving α<sub>1</sub>=0.70, and concrete above C50/60.</li><li>c<sub>d</sub> equals entered cover here, as in the reference. Figure8.3 requires the minimum of half bar spacing, side cover, and cover; determine and enter this yourself for closely spaced bars.</li><li>α<sub>3</sub> and α<sub>5</sub> are1.0: unwelded transverse reinforcement and transverse pressure are excluded. This is conservative but uneconomical, matching the reference with K·λ=0.</li><li>l<sub>b,min</sub> applies to <b>tension anchorage</b>. For compression, the lower bound is0.6·l<sub>b,rqd</sub> rather than0.3·l<sub>b,rqd</sub>.</li></ul></i>
`;

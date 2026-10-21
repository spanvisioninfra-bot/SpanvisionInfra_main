/**
 * Kruipcoëfficiënt φ(t;t₀) volgens NEN-EN 1992-1-1 bijlage B.
 *
 * Gecalibreerd op zes de referentie-uitwerking-referenties (t₀ = 28 d, h₀ = 300 mm):
 *   document1A  C45/55 · N · RH 50 → φ_RH 1,434 · β(f_cm) 2,308 · β(t₀) 0,488 ·
 *                                    φ₀ 1,617 · β_H 653 · β_c 0,998 · φ 1,614 → 1,61
 *   document3A  C20/25 · N · RH 50 → φ_RH 1,747 (B.3a) · β(f_cm) 3,175 ·
 *                                    φ₀ 2,709 · β_H 700 (B.8a) · φ 2,703 → 2,70
 *   document5A  C45/55 · N · RH 30 → φ_RH 1,640 · φ₀ 1,849 · φ 1,845 → 1,85
 *   document6A  C45/55 · N · RH 70 → φ_RH 1,229 · φ₀ 1,385 · φ 1,382 → 1,38
 *   document2A  C45/55 · R · RH 50 → zie afwijking 1
 *   document4A  C45/55 · S · RH 50 → zie afwijking 1
 *
 * LET OP 1: het gerapporteerde getal is φ(t;t₀), níét φ₀. Het referentieblad
 * rekent met t = 100000 dagen (≈ 274 jaar, praktisch t = ∞); φ₀ alleen zou
 * 1,62 opleveren. Een eerdere lezing schreef het verschil aan afkappen toe —
 * dat was onjuist, het is de tijdsfactor β_c.
 *
 * AFWIJKING 1: De referentie-uitwerking rekent (B.9) uit (R: t₀ 28 → 32,5 d · S: 28 → 24,2 d)
 * maar vult in (B.5) toch de onbewerkte 28 in, waardoor de cementklasse daar
 * géén effect heeft (N, R en S geven alle drie 1,61). Dit blad volgt de norm:
 * R → 1,57, S → 1,66.
 *
 * AFWIJKING 2: bij de referentie-uitwerking is β_H onafhankelijk van RH — de term
 * (0,012·RH)^18 draagt nooit bij, dus staat er bij RH 30/50/70 steeds 653 waar
 * bij RH 70 volgens de norm 673 hoort. Bij t = 100000 verandert dat het
 * eindresultaat niet (1,382 in beide gevallen); bij korte belastingduur wel.
 * Dit blad rekent de term mee.
 *
 * De invoer spiegelt het de referentie-uitwerking-scherm: betonkwaliteit, cementklasse, RH,
 * t₀ en h₀ als directe invoer (h₀ = 2·A_c/u wordt niet zelf uitgerekend).
 *
 * Variabelenamen komen exact overeen met KruipfactorDesigner.tsx.
 */

export const kruipfactor = `"Creep factor — φ(∞,t₀) according to NEN-EN 1992-1-1 bijlage B

'<i>Creep is the gradual increase in concrete deformation under sustained compression. The creep coefficient φ defines the additional strain: ε<sub>cc</sub> = φ·σ<sub>c</sub>/E<sub>c</sub>. Annex B splits φ<sub>0</sub> into relative humidity and member thickness φ<sub>RH</sub>, concrete strength β(f<sub>cm</sub>), and age at loading β(t<sub>0</sub>).</i>

# 1. Inputs

@select betonkwaliteit "Concrete grade"
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
  C70/85 = 70
  C80/95 = 80
  C90/105 = 90
@end

@select cementklasse "Cement class"
  S — slow verhardend (32,5 N) = 1
  N — normal verhardend (32,5 R; 42,5 N) = 2
  R — rapid verhardend (42,5 R; 52,5 N/R) = 3
@end

RH = ?', ambient relative humidity RH [%]'
t_0 = ?', concrete age at loading t_0 [days]'
h_0 = ?*(mm)', notional member size h_0 (= 2·A_c/u)'

f_ck = betonkwaliteit N/mm^2', karakteristieke cilinderdruksterkte'
f_cm = f_ck + 8 N/mm^2', gemiddelde druksterkte — (3.1)'

f_ck
f_cm
RH
t_0
h_0

#hide
'De formules van bijlage B zijn empirisch en dimensioneel inconsistent: h_0 hoort
'er in mm in, f_cm in N/mm². Hieronder eenheidloos gemaakt.
h0_ = h_0/(1*mm)
fcm_ = f_cm/(1 N/mm^2)
α_cem = if(cementklasse ≡ 1; -1; if(cementklasse ≡ 2; 0; 1))', exponent uit (B<span>.</span>9)'
#show

# 2. Correctiefactoren for de concrete strength

'<i>For f<sub>cm</sub> &gt; 35 N/mm², α<sub>1</sub>…α<sub>3</sub> reduce creep: stronger concrete creeps relatively less.</i>

α_1 = (35/fcm_)^0.7
α_2 = (35/fcm_)^0.2
α_3 = (35/fcm_)^0.5
α_1
α_2
α_3

# 3. The three component factors of φ₀

'<h6>3.1 Relatieve vochtigheid and elementdikte — (B<span>.</span>3)</h6>

'<i>Dry air and a thin section accelerate drying and increase creep. Use (B<span>.</span>3a) for f<sub>cm</sub> ≤ 35, or (B<span>.</span>3b) with α<sub>1</sub> and α<sub>2</sub> above that limit.</i>

#if fcm_ ≤ 35
    'f<sub>cm</sub> = 'f_cm' ≤ 35 N/mm² → (B<span>.</span>3a)
    φ_RH = 1 + (1 - RH/100)/(0.1*h0_^(1/3))
#else
    'f<sub>cm</sub> = 'f_cm' > 35 N/mm² → (B<span>.</span>3b), with α<sub>1</sub> and α<sub>2</sub>
    φ_RH = (1 + (1 - RH/100)/(0.1*h0_^(1/3))*α_1)*α_2
#end if
φ_RH

'<h6>3.2 Betonsterkte — (B<span>.</span>4)</h6>
β_fcm = 16.8/sqrt(fcm_)
β_fcm

'<h6>3.3 Age at loading — (B<span>.</span>5), with cement correction (B<span>.</span>9)</h6>

'<i>At the same age, rapid-hardening cement R has hardened further and creeps less; slow-hardening cement S creeps more. Expression (B<span>.</span>9) accounts for this by adjusting age. For class N, α = 0 and age is unchanged.</i>

t_0,cor = max(0.5; t_0*(9/(2 + t_0^1.2) + 1)^α_cem)', gecorrigeerde ouderdom (B<span>.</span>9)'
t_0,cor
β_t0 = 1/(0.1 + t_0,cor^0.20)
β_t0

# 4. Basiskruipcoëfficiënt φ₀

φ_0 = φ_RH*β_fcm*β_t0', basiskruipcoëfficiënt'
φ_0

'<b>φ<sub>0</sub> = φ<sub>RH</sub> · β(f<sub>cm</sub>) · β(t<sub>0</sub>) = 'φ_RH' · 'β_fcm' · 'β_t0' = <b>'φ_0'</b></b>

# 5. Ontwikkeling in de time

'<i>β<sub>c</sub> is the fraction of basic creep developed by time t, increasing from 0 at t = t<sub>0</sub> to 1 at t = ∞. The reported result is φ(t;t<sub>0</sub>), rather than φ<sub>0</sub>.</i>

t = ?', time considered t [days] — 100000 ≈ final state'
t

'<i>β<sub>H</sub> also has two branches: for f<sub>cm</sub> ≤ 35, use (B<span>.</span>8a) without α<sub>3</sub>; above 35, use (B<span>.</span>8b) with it.</i>
#hide
β_H,romp = 1.5*(1 + (0.012*RH)^18)*h0_
α_H = if(fcm_ ≤ 35; 1; α_3)', α_3 telt alleen mee boven f_cm = 35'
#show
β_H = min(β_H,romp + 250*α_H; 1500*α_H)', (B<span>.</span>8a) resp. (B<span>.</span>8b)'
β_H
β_c = if(t ≤ t_0; 0; ((t - t_0)/(β_H + t - t_0))^0.3)', (B<span>.</span>7)'
β_c

# 6. Kruipcoëfficiënt

φ_t,nb = φ_0*β_c', volgens bijlage B'
'<i>Alternative assumptions (register items 1 and 2): the reference calculation inserts unadjusted t<sub>0</sub> into (B.5), printing but not using cement correction (B.9), and makes β<sub>H</sub> independent of RH. Both branches are shown below; project settings select the governing method.</i>
#hide
'de referentie-uitwerking vult in (B.5) de ONgecorrigeerde t_0 in, ook al is (B.9) uitgerekend.
β_t0,XC = 1/(0.1 + t_0^0.20)
φ_0,XC = φ_RH*β_fcm*β_t0,XC
'Bij de referentie-uitwerking draagt de term (0,012·RH)^18 in β_H nooit bij.
β_H,XC = min(1.5*h0_ + 250*α_H; 1500*α_H)
β_c,XC = if(t ≤ t_0; 0; ((t - t_0)/(β_H,XC + t - t_0))^0.3)
#show
β_H,XC', β_H zoals de referentie-uitwerking hem neemt — zonder de RH-term'
φ_t,XC = φ_0,XC*β_c,XC', volgens de referentie-uitwerking'
φ_t = if(rekenwijze ≡ 1; φ_t,XC; φ_t,nb)', gehanteerde kruipcoëfficiënt'
φ_t,nb
φ_t,XC
φ_t

'<b>φ(t;t<sub>0</sub>) = φ<sub>0</sub> · β<sub>c</sub> = 'φ_0' · 'β_c' = <b>'φ_t'</b></b>

'<i>Effective modulus of elasticity for long-term effects (§7.4.3(5)):</i>
E_cm = 22000*((fcm_)/10)^0.3 N/mm^2', (3.14) — secantmodulus'
E_c,eff = E_cm/(1 + φ_t)', effective modulus under sustained loading'
E_cm
E_c,eff

# 7. Difference from the reference program

'<i>This sheet follows NEN-EN 1992-1-1 Annex B. The reference calculation differs at two points. The comparisons below show their effects for these inputs; the complete register is in <b>docs/afwijkingen-referentie</b>.</i>

#hide
Δφ = abs(φ_t,nb - φ_t,XC)
Δβ_H = β_H - β_H,XC
'Melden zodra φ óf β_H verschilt — β_H kan afwijken terwijl φ bij t → ∞ gelijk blijft.
afw = if(Δφ > 0.005; 1; if(Δβ_H > 0.5; 1; 0))
#show

#if afw ≡ 0
    '<span style="color: green">The reference calculation gives the same result for these inputs:
'φ = 'φ_t,XC'. No difference.</span>
#else
    '<b style="color: #1d4ed8">The reference calculation differs from the code for these inputs.</b>
'This sheet follows Annex B; its value is the code result. The difference
'is shown below to explain the comparison.
'<table style="border-collapse:collapse; font-size:13px">
'<tr><th style="text-align:left; padding:2px 12px 2px 0">Quantity</th><th style="text-align:right; padding-right:14px">this sheet — per code</th><th style="text-align:right">reference calculation — differing</th></tr>
'<tr><td style="padding:2px 12px 2px 0">β(t<sub>0</sub>)</td><td style="text-align:right; padding-right:14px">'β_t0'</td><td style="text-align:right">'β_t0,XC'</td></tr>
'<tr><td style="padding:2px 12px 2px 0">β<sub>H</sub></td><td style="text-align:right; padding-right:14px">'β_H'</td><td style="text-align:right">'β_H,XC'</td></tr>
'<tr><td style="padding:2px 12px 2px 0"><b>φ(t;t<sub>0</sub>)</b></td><td style="text-align:right; padding-right:14px"><b>'φ_t,nb'</b></td><td style="text-align:right"><b>'φ_t,XC'</b></td></tr>
'</table>
    #if cementklasse ≡ 2
    #else
        '· <b>Cement correction (B<span>.</span>9).</b> This sheet calculates β(t<sub>0</sub>) using the
'adjusted age t<sub>0</sub> = 't_0,cor' days, as required by (B<span>.</span>9)
'The reference calculates this correction but inserts (B<span>.</span>5)
'the unadjusted 't_0' days into the calculation, so cement class has no effect
'there.
    #end if
    #if Δβ_H ≤ 0.5
    #else
        '· <b>β<sub>H</sub> from (B<span>.</span>8).</b> This sheet includes the term
'(0,012·RH)<sup>18</sup> ; at RH = 'RH'% it contributes 'Δβ_H' extra.
'The reference omits this term. For a long
'load duration the effect on φ is small, but it matters for short durations.
    #end if
#end if

# 8. Summary

'<table style="border-collapse:collapse; font-size:13px">
'<tr><th style="text-align:left; padding:2px 12px 2px 0">Quantity</th><th style="text-align:right">Value</th></tr>
'<tr><td style="padding:2px 12px 2px 0">φ<sub>RH</sub> — humidity + thickness</td><td style="text-align:right">'φ_RH'</td></tr>
'<tr><td style="padding:2px 12px 2px 0">β(f<sub>cm</sub>) — concrete strength</td><td style="text-align:right">'β_fcm'</td></tr>
'<tr><td style="padding:2px 12px 2px 0">β(t<sub>0</sub>) — age at loading</td><td style="text-align:right">'β_t0'</td></tr>
'<tr><td style="padding:2px 12px 2px 0">φ<sub>0</sub> — basic creep coefficient</td><td style="text-align:right">'φ_0'</td></tr>
'<tr><td style="padding:2px 12px 2px 0">β<sub>H</sub> · β<sub>c</sub></td><td style="text-align:right">'β_H' · 'β_c'</td></tr>
'<tr><td style="padding:2px 12px 2px 0"><b>φ(t;t<sub>0</sub>) — creep coefficient</b></td><td style="text-align:right"><b>'φ_t'</b></td></tr>
'<tr><td style="padding:2px 12px 2px 0">E<sub>c,eff</sub></td><td style="text-align:right">'E_c,eff'</td></tr>
'</table>

'<hr/><i>Limitations:<ul><li>Six reference cases were calibrated at t<sub>0</sub>=28 days and h<sub>0</sub>=300 mm: C45/55/N/RH50 gives φ=1.614; C20/25/N/RH50 gives 2.703 using (B.3a)/(B.8a); C45/55/N/RH30 gives φ<sub>RH</sub>=1.640 and φ=1.845; RH70 gives 1.229 and 1.382. Cement R/S cases are discussed below. Both branches of (B.3)/(B.8) and RH dependence were verified.</li><li><b>The reported result is φ(t;t<sub>0</sub>), not φ<sub>0</sub>.</b> The reference uses t=100000 days (about 274 years, effectively ∞), giving 1.614 → 1.61. φ<sub>0</sub>=1.617 would round to 1.62.</li><li><b>β<sub>H</sub> has two forms.</b> Up to f<sub>cm</sub>=35, (B.8a) excludes α<sub>3</sub>: C20/25 gives 1.5·1.0001·300 + 250 = 700. Above 35, (B.8b) includes α<sub>3</sub>: C45/55 gives 450 + 250·0.813 = 653. Limits are 1500 and 1500·α<sub>3</sub>.</li><li><b>Difference 1 — cement S/R.</b> The reference calculates (B.9), adjusting 28 days to 32.5 for R or 24.2 for S, but still uses unadjusted 28 in (B.5). N/R/S therefore all give 1.61. This sheet uses corrected t<sub>0</sub> per the code: R gives φ=1.57, S gives 1.66. For N (α=0), results agree.</li><li><b>Difference 2 — reference β<sub>H</sub> is independent of RH.</b> It omits (0.012·RH)<sup>18</sup>, printing 653 at RH30/50/70%. The code requires 673 at RH70%. At t=100000 days, β<sub>c</sub>≈0.998 so both final results round to 1.382; short durations differ. This sheet includes the term.</li><li>Cement correction (B.9) affects β(t<sub>0</sub>) only; β<sub>c</sub>(t;t<sub>0</sub>) uses actual loading age.</li><li>Enter h<sub>0</sub> directly, as in the reference, calculated as 2·A<sub>c</sub>/u with u the drying perimeter.</li><li>Annex B covers 40% ≤ RH ≤ 100% and ordinary concrete mixes. Formulas still evaluate outside this range, but results are outside their scope, even though the reference accepts RH30%. High-strength concrete with silica or elevated temperatures requires the additional Annex B rules.</li></ul></i>
`;

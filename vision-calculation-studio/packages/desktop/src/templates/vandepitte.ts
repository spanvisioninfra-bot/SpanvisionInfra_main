/**
 * Prof. D. Vandepitte — Berekening van Constructies, Boekdeel I
 * Ifc-Calc rekenmodule templates
 *
 * Formules en verwijzingen conform het boek:
 * "Berekening van Constructies" door Prof. D. Vandepitte
 * Boekdeel I — Universiteit Gent
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Schuifspanningen — Formule van Jourawsky (Hoofdstuk 2, art. 2.4)
// ─────────────────────────────────────────────────────────────────────────────

/** Vandepitte Hfd. 2 — Schuifspanningen door dwarskrachten */
export const vandepitteSchuifspanning = `# Shear stresses from transverse forces — Jourawsky formula
Source: Prof. D. Vandepitte — Calculation of Structures, Volume I, Chapter 2, art. 2.4

Shear stress in a thin-walled section is determined using
the Jourawsky formula (Chapter 2, expression 4):

  tau(s) = V * S_z(s) / (I_z * t(s))

where S_z is the first moment of area of the part of the section
tussen de vrije rand (s=0) en het langsvlakje ter plaatse van de berekening.

## Profielkeuze

@select profieltype "Type section"
Rechthoekige section (lambda = 3/2) = 1
I section (loaded in the web plane) = 2
Cirkelvormige section (lambda = 4/3) = 3
@end

## Section properties

@select invoermethode "Inputs section"
Rechthoekig b x h = 1
Handmatige inputs I_z en S_z,max = 2
@end

#if invoermethode == 1
Rectangular section width and depth:

b = 200 mm
h = 400 mm

Traagheidsmoment:

I_z = b * h^3 / 12 to mm^4

First moment of area (maximum, at the neutral axis):

S_zmax = b * h^2 / 8 to mm^3

Wall thickness at the neutral axis:

t = b to mm
#else
Manually entered values:

I_z = 83560000 mm^4
S_zmax = 628400 mm^3
t = 7.1 mm
#end if

## Load

@select belastingtype "Type belastingschema"
Gelijkmatig distributed (q) = 1
Point load at mid-span (F) = 2
@end

Overspanning:

L = 6000 mm

#if belastingtype == 1
Distributed load:

q = 25 kN/m

Maximum shear force (at the support):

V_max = q * L / 2 to kN
#else
Puntlast:

F = 100 kN

Maximale dwarskracht:

V_max = F / 2 to kN
#end if

## Schuifspanning (Jourawsky, Hfd. 2, formula 4)

Maximum shear stress (at the neutral axis):

tau_max = V_max * S_zmax / (I_z * t) to N/mm^2

Shear stress shape factor lambda (Chapter 2, art. 1.1):

Vandepitte definieert lambda als de factor waarmee de gemiddelde
schuifspanning (V/A) moet worden vermenigvuldigd om de maximale
to obtain shear stress. For a rectangular section,
is lambda = 3/2, voor een cirkelvormige doorsnede lambda = 4/3.

#if profieltype == 1
Voor een rechthoekige doorsnede geldt lambda = 3/2:

A_bruto = b * h to mm^2

tau_controle = 3/2 * V_max / A_bruto to N/mm^2
#end if

#if profieltype == 3
Voor een cirkelvormige doorsnede geldt lambda = 4/3:

A_bruto = b * h to mm^2

tau_controle = 4/3 * V_max / A_bruto to N/mm^2
#end if

## Permissible stress

Allowable shear stress (depending on material):

tau_toel = 100 N/mm^2

Unity check:

UC_schijf = tau_max / tau_toel

#if UC_schijf < 1
  Schuifspanning voldoet (UC < 1.0).
#else
  Shear stress exceeds the limit!
#end if

## Overzicht

@svg
<svg width="500" height="300" viewBox="0 0 500 300">
  <defs>
    <marker id="arrowDown" markerWidth="8" markerHeight="8" refX="4" refY="8" orient="auto">
      <polygon points="0 0, 8 8, 4 6" fill="#dc2626"/>
    </marker>
    <marker id="arrowUp" markerWidth="8" markerHeight="8" refX="4" refY="0" orient="auto">
      <polygon points="0 8, 8 8, 4 0" fill="#059669"/>
    </marker>
  </defs>
  <!-- Doorsnede rechthoek -->
  <rect x="50" y="40" width="100" height="220" fill="#e8e0d0" stroke="#374151" stroke-width="2"/>
  <!-- Neutrale lijn -->
  <line x1="30" y1="150" x2="170" y2="150" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="6"/>
  <text x="175" y="154" font-size="11" fill="#3b82f6">N.L.</text>
  <!-- Tau verdeling parabolisch -->
  <path d="M 150,40 Q 210,150 150,260" fill="none" stroke="#dc2626" stroke-width="2"/>
  <line x1="150" y1="150" x2="210" y2="150" stroke="#dc2626" stroke-width="1.5" marker-end="url(#arrowDown)" transform="rotate(-90,180,150)"/>
  <text x="215" y="154" font-size="11" fill="#dc2626">tau_max</text>
  <!-- Afmetingen -->
  <line x1="50" y1="275" x2="150" y2="275" stroke="#6b7280" stroke-width="1"/>
  <line x1="50" y1="270" x2="50" y2="280" stroke="#6b7280" stroke-width="1"/>
  <line x1="150" y1="270" x2="150" y2="280" stroke="#6b7280" stroke-width="1"/>
  <text x="100" y="290" text-anchor="middle" font-size="11" fill="#6b7280">b = {{b}} mm</text>
  <line x1="25" y1="40" x2="25" y2="260" stroke="#6b7280" stroke-width="1"/>
  <line x1="20" y1="40" x2="30" y2="40" stroke="#6b7280" stroke-width="1"/>
  <line x1="20" y1="260" x2="30" y2="260" stroke="#6b7280" stroke-width="1"/>
  <text x="15" y="155" text-anchor="middle" font-size="11" fill="#6b7280" transform="rotate(-90,15,155)">h = {{h}} mm</text>
  <!-- Formule -->
  <text x="350" y="80" text-anchor="middle" font-size="13" fill="#1e40af" font-weight="bold">Jourawsky</text>
  <text x="350" y="110" text-anchor="middle" font-size="12" fill="#374151">tau = V * S_z / (I_z * t)</text>
  <text x="350" y="150" text-anchor="middle" font-size="12" fill="#dc2626">tau_max = {{tau_max}} N/mm2</text>
  <text x="350" y="180" text-anchor="middle" font-size="12" fill="#374151">V_max = {{V_max}} kN</text>
  <text x="350" y="220" text-anchor="middle" font-size="14" fill="#059669" font-weight="bold">UC = {{UC_schijf}}</text>
</svg>
@end
`;

// ─────────────────────────────────────────────────────────────────────────────
// 2. Doorbuiging inclusief dwarskrachten (Hoofdstuk 2, art. 1.2)
// ─────────────────────────────────────────────────────────────────────────────

/** Vandepitte Hfd. 2 — Doorbuiging met effect van dwarskrachten */
export const vandepitteDoorbuiging = `# Deflection including Dwarskrachteffect
Source: Prof. D. Vandepitte — Calculation of Structures, Volume I, Chapter 2, art. 1.2

Vandepitte shows (Chapter 2, expression 2) that deflection has two components:
- v_2: deflection from bending moments (M/EI)
- v_1: deflection from shear forces (lambda*V/GA)

De differentiaalvergelijking luidt (formule 2):

  (d2v/dx2) = M/EI + lambda*p/GA

## Material

@select materiaal "Material"
Steel S235 (E=210000, G=81000) = 1
Steel S355 (E=210000, G=81000) = 2
Timber C24 (E=11000, G=690) = 3
Concrete C30/37 (E=33000, G=13750) = 4
Aluminium (E=70000, G=26000) = 5
@end

#if materiaal == 1
E = 210000 N/mm^2
G = 81000 N/mm^2
#end if

#if materiaal == 2
E = 210000 N/mm^2
G = 81000 N/mm^2
#end if

#if materiaal == 3
E = 11000 N/mm^2
G = 690 N/mm^2
#end if

#if materiaal == 4
E = 33000 N/mm^2
G = 13750 N/mm^2
#end if

#if materiaal == 5
E = 70000 N/mm^2
G = 26000 N/mm^2
#end if

## Section

@select doorsnedevorm "Section"
Rechthoekig (lambda = 6/5) = 1
I-section (lambda ~ A/A_lijf) = 2
@end

b = 200 mm
h = 400 mm

Oppervlakte:

A = b * h to mm^2

Traagheidsmoment:

I = b * h^3 / 12 to mm^4

Shear deflection shape factor lambda (Chapter 2, art. 1.1):

Vandepitte: voor een rechthoekige doorsnede is lambda = 6/5.
For an I section, lambda is approximately A/(A_lijf),
the total area divided by the web area.

lambda = 1.2

## Load en geometrie

@select belastinggeval "Belastinggeval"
Gelijkmatig verdeelde load q = 1
Point load F at mid-span = 2
@end

L = 5000 mm

#if belastinggeval == 1
q = 15 kN/m

## Deflection door bending moments (Hfd. 2, art. 1.2.1)

v_2 = 5 * q * L^4 / (384 * E * I) to mm

## Deflection door dwarskrachten (Hfd. 2, formula 3)

v_1 = lambda * q * L^2 / (8 * G * A) to mm
#else
F = 50 kN

## Deflection door bending moments

v_2 = F * L^3 / (48 * E * I) to mm

## Deflection door dwarskrachten (Hfd. 2, art. 1.2.2)

v_1 = lambda * F * L / (4 * G * A) to mm
#end if

## Total deflection

v_totaal = v_2 + v_1 to mm

Aandeel dwarskrachten:

aandeel_V = v_1 / v_totaal * 100

Vandepitte notes (Chapter 2, art. 1.3.1) that v_1 is usually small:
t.o.v. v_2. Voor I-profielen met lambda ~ 3 en h/L = 0,1 is v_1
only 3.1% of v_2. For very short members, however, the contribution
can be significant.

Verhouding h/L:

ratio_hL = h / L

#if ratio_hL < 0.1
  De verhouding h/L < 1/10: het dwarskrachteffect is verwaarloosbaar (< 3%).
#else
  De verhouding h/L >= 1/10: houd rekening met het dwarskrachteffect!
#end if

## Grenswaarde

Allowable deflection (L/250):

v_toel = L / 250 to mm

UC_doorbuiging = v_totaal / v_toel

#if UC_doorbuiging < 1
  Doorbuiging voldoet (UC < 1.0).
#else
  Deflection fails!
#end if
`;

// ─────────────────────────────────────────────────────────────────────────────
// 3. Knikken van drukstaven — Euler (Hoofdstuk 5, art. 5.2-5.4)
// ─────────────────────────────────────────────────────────────────────────────

/** Vandepitte Hfd. 5 — Knikken van drukstaven (Euler) */
export const vandepitteKnikken = `# Buckling of compression members — Euler theory
Source: Prof. D. Vandepitte — Calculation of Structures, Volume I, Chapter 5, art. 5.2-5.4

De kritieke knikbelasting volgens Euler (Hfd. 5, art. 5.2.2.3):

- P_k = n^2 · pi^2 · E · I / l^2

met de kniklengte l_k = l / n, oftewel (Hfd. 5, art. 5.4.6):

- P_k = pi^2 · E · I / l_k^2

Buckling length l_k depends on the boundary conditions (Chapter 5, art. 5.4):
- Staaf a (inklemming-vrij):     l_k = 2 * l
- Staaf b (scharnier-scharnier): l_k = l
- Staaf c (inklemming-inklemming): l_k = l / 2
- Staaf d (inklemming-scharnier): l_k = 0.699 * l

## Material

@select materiaal "Material"
Steel S235 (E=210000, f_y=235) = 1
Steel S355 (E=210000, f_y=355) = 2
Timber C24 (E=11000, f_c=21) = 3
Aluminium 6061-T6 (E=70000, f_y=240) = 4
@end

#if materiaal == 1
E = 210000 N/mm^2
f_y = 235 N/mm^2
#end if

#if materiaal == 2
E = 210000 N/mm^2
f_y = 355 N/mm^2
#end if

#if materiaal == 3
E = 11000 N/mm^2
f_y = 21 N/mm^2
#end if

#if materiaal == 4
E = 70000 N/mm^2
f_y = 240 N/mm^2
#end if

## Section

@select doorsnedevorm "Doorsnedevorm"
Rechthoekig b x h = 1
Cirkelvormig (diameter D) = 2
Buisprofiel (D x t) = 3
@end

#if doorsnedevorm == 1
b = 100 mm
h = 100 mm

A = b * h to mm^2
I_min = b * h^3 / 12 to mm^4

#if b < h
I_min = h * b^3 / 12 to mm^4
#end if

Traagheidsstraal:

i_min = sqrt(I_min / A) to mm
#end if

#if doorsnedevorm == 2
D = 100 mm

A = pi / 4 * D^2 to mm^2
I_min = pi / 64 * D^4 to mm^4
i_min = D / 4 to mm
#end if

#if doorsnedevorm == 3
D = 114.3 mm
t_w = 6.3 mm

A = pi / 4 * (D^2 - (D - 2*t_w)^2) to mm^2
I_min = pi / 64 * (D^4 - (D - 2*t_w)^4) to mm^4
i_min = sqrt(I_min / A) to mm
#end if

## Randvoorwaarden en systeemlengte

@select randvoorwaarden "Randvoorwaarden (Hfd. 5, art. 5.4)"
Member a: fixed-free (beta_k = 2.0) = 2.0
Member b: pinned-pinned (beta_k = 1.0) = 1.0
Member c: fixed-fixed (beta_k = 0.5) = 0.5
Member d: fixed-pinned (beta_k = 0.699) = 0.699
@end

Systeemlengte:

l = 3000 mm

Factor beta_k (Hfd. 5, art. 5.4.6):

beta_k = randvoorwaarden * 1

Kniklengte:

l_k = beta_k * l to mm

## Eulerse knikbelasting (Hfd. 5, art. 5.2.2.3)

P_E = pi^2 * E * I_min / l_k^2 to kN

## Slenderness

Slenderness:

lambda = l_k / i_min

Grensslankheid (overgang plastisch-elastisch knikken):

lambda_grens = pi * sqrt(E / f_y)

#if lambda > lambda_grens
  Elastisch knikken is maatgevend (lambda > lambda_grens).
  De Euler-formule is geldig.
#else
  Inelastic buckling: the Euler formula overestimates resistance.
  Use a buckling curve, for example from Eurocode.
#end if

## Kritieke stress

sigma_E = P_E / A to N/mm^2

Verhouding sigma_E / f_y:

ratio = sigma_E / f_y

## Load en checks

Axial force (design):

N_Ed = 150 kN

Drukspanning:

sigma_d = N_Ed / A to N/mm^2

Unity check against the Euler buckling load:

UC_knik = N_Ed / P_E

#if UC_knik < 1
  Knikstabiliteit voldoet (UC < 1.0).
#else
  Buckling stability fails!
#end if

## Overzicht

@svg
<svg width="550" height="380" viewBox="0 0 550 380">
  <defs>
    <marker id="arrowDown" markerWidth="8" markerHeight="8" refX="4" refY="8" orient="auto">
      <polygon points="0 0, 8 8, 4 6" fill="#dc2626"/>
    </marker>
    <pattern id="hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="#a3a3a3" stroke-width="0.8"/>
    </pattern>
  </defs>
  <!-- Staaf a: inklemming-vrij -->
  <rect x="30" y="340" width="50" height="10" fill="url(#hatch)" stroke="#374151" stroke-width="1"/>
  <line x1="55" y1="340" x2="55" y2="100" stroke="#1e40af" stroke-width="3"/>
  <line x1="45" y1="100" x2="65" y2="100" stroke="#dc2626" stroke-width="2"/>
  <line x1="55" y1="100" x2="55" y2="75" stroke="#dc2626" stroke-width="2" marker-end="url(#arrowDown)" transform="rotate(180,55,87)"/>
  <text x="55" y="65" text-anchor="middle" font-size="11" fill="#dc2626">P</text>
  <text x="55" y="370" text-anchor="middle" font-size="10" fill="#374151">a: l_k=2l</text>
  <!-- Staaf b: scharnier-scharnier -->
  <polygon points="175,340 168,355 182,355" fill="none" stroke="#374151" stroke-width="1.5"/>
  <line x1="175" y1="340" x2="175" y2="100" stroke="#1e40af" stroke-width="3"/>
  <polygon points="175,100 168,85 182,85" fill="none" stroke="#374151" stroke-width="1.5"/>
  <line x1="175" y1="85" x2="175" y2="60" stroke="#dc2626" stroke-width="2" marker-end="url(#arrowDown)" transform="rotate(180,175,72)"/>
  <text x="175" y="50" text-anchor="middle" font-size="11" fill="#dc2626">P</text>
  <text x="175" y="370" text-anchor="middle" font-size="10" fill="#374151">b: l_k=l</text>
  <!-- Staaf c: inklemming-inklemming -->
  <rect x="270" y="340" width="50" height="10" fill="url(#hatch)" stroke="#374151" stroke-width="1"/>
  <line x1="295" y1="340" x2="295" y2="100" stroke="#1e40af" stroke-width="3"/>
  <rect x="270" y="90" width="50" height="10" fill="url(#hatch)" stroke="#374151" stroke-width="1"/>
  <line x1="295" y1="90" x2="295" y2="60" stroke="#dc2626" stroke-width="2" marker-end="url(#arrowDown)" transform="rotate(180,295,75)"/>
  <text x="295" y="50" text-anchor="middle" font-size="11" fill="#dc2626">P</text>
  <text x="295" y="370" text-anchor="middle" font-size="10" fill="#374151">c: l_k=l/2</text>
  <!-- Staaf d: inklemming-scharnier -->
  <rect x="390" y="340" width="50" height="10" fill="url(#hatch)" stroke="#374151" stroke-width="1"/>
  <line x1="415" y1="340" x2="415" y2="100" stroke="#1e40af" stroke-width="3"/>
  <polygon points="415,100 408,85 422,85" fill="none" stroke="#374151" stroke-width="1.5"/>
  <line x1="415" y1="85" x2="415" y2="60" stroke="#dc2626" stroke-width="2" marker-end="url(#arrowDown)" transform="rotate(180,415,72)"/>
  <text x="415" y="50" text-anchor="middle" font-size="11" fill="#dc2626">P</text>
  <text x="415" y="370" text-anchor="middle" font-size="10" fill="#374151">d: l_k=0.7l</text>
  <!-- Resultaten -->
  <text x="490" y="140" font-size="12" fill="#374151">P_E = {{P_E}} kN</text>
  <text x="490" y="165" font-size="12" fill="#374151">lambda = {{lambda}}</text>
  <text x="490" y="190" font-size="12" fill="#374151">l_k = {{l_k}} mm</text>
  <text x="490" y="230" font-size="14" fill="#059669" font-weight="bold">UC = {{UC_knik}}</text>
</svg>
@end
`;

// ─────────────────────────────────────────────────────────────────────────────
// 4. Doorbuiging van liggers — Analogieen van Mohr (Hoofdstuk 1, art. 2.1)
// ─────────────────────────────────────────────────────────────────────────────

/** Vandepitte Hfd. 1 — Doorbuiging met analogieen van Mohr */
export const vandepitteMohr = `# Beam deflection — Mohr analogies
Source: Prof. D. Vandepitte — Calculation of Structures, Volume I, Chapter 1, art. 2.1

Vandepitte uses the Mohr analogies to calculate
elastic beam displacements and rotations (Chapter 1, art. 2.1).

The reduced bending moment diagram M/EI is treated as a fictitious
belasting op een hulpligger L'. De doorbuiging in een punt U is dan
gelijk aan het buigend moment in U van de fictieve balk L'.

## Examples (Hfd. 1, art. 2.1.6)

### Prismatic beam with an overhang

@select belastinggeval "Belastinggeval"
Puntlast P aan end overkraging = 1
Gelijkmatig verdeelde load q = 2
@end

## Geometry

Span between supports:

L = 6000 mm

Overhang length:

a = 2000 mm

## Material en section

E = 210000 N/mm^2

Traagheidsmoment:

I = 83560000 mm^4

EI = E * I to kN*mm^2

#if belastinggeval == 1
## Point load P on the overhang

P = 10 kN

### Deflection at D (mid-span)

Vandepitte (Hfd. 1, art. 2.1.6, voorbeeld 1):
By the first Mohr analogy, the bending moment at D
in the fictitious beam equals deflection a_1:

a_1 = P * a * L^2 / (16 * EI) to mm

Direction: upward (the beam bends upward at mid-span when
the overhang carries a downward load).

### Verdraaiing at support B

theta_1 = P * a * L / (6 * EI)

#if a < L
  Opmerking: de formule is geldig voor a < L.
#end if

### Deflection at overhang tip C

Deflection from rotation at B plus local deflection:

a_C = P * a^2 * (a + L) / (3 * EI) to mm

#else
## Gelijkmatig verdeelde load q

q = 10 kN/m

### Mid-span deflection

M_max = q * L^2 / 8 to kN*m

a_1 = 5 * q * L^4 / (384 * EI) to mm

### Deflection at the overhang tip

a_C = q * a^2 / (24 * EI) * (4 * a^2 + 3 * a * L) to mm

#end if

## Grenswaarde

Allowable deflection (L/250):

v_toel = L / 250 to mm

#if belastinggeval == 1
UC_doorbuiging = a_C / v_toel
#else
UC_doorbuiging = a_1 / v_toel
#end if

#if UC_doorbuiging < 1
  Doorbuiging voldoet (UC < 1.0).
#else
  Deflection fails!
#end if

## Overzicht

@svg
<svg width="600" height="220" viewBox="0 0 600 220">
  <defs>
    <marker id="arrowRed" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#dc2626"/>
    </marker>
  </defs>
  <!-- Balk -->
  <line x1="80" y1="100" x2="520" y2="100" stroke="#1e40af" stroke-width="3"/>
  <!-- Oplegging links (scharnier) A -->
  <polygon points="80,100 65,130 95,130" fill="none" stroke="#374151" stroke-width="2"/>
  <line x1="60" y1="133" x2="100" y2="133" stroke="#374151" stroke-width="2"/>
  <text x="80" y="148" text-anchor="middle" font-size="11" fill="#374151">A</text>
  <!-- Oplegging rechts (rol) B -->
  <polygon points="400,100 385,130 415,130" fill="none" stroke="#374151" stroke-width="2"/>
  <circle cx="392" cy="135" r="5" fill="none" stroke="#374151" stroke-width="1.5"/>
  <circle cx="408" cy="135" r="5" fill="none" stroke="#374151" stroke-width="1.5"/>
  <line x1="382" y1="143" x2="418" y2="143" stroke="#374151" stroke-width="2"/>
  <text x="400" y="158" text-anchor="middle" font-size="11" fill="#374151">B</text>
  <!-- Punt C (einde overkraging) -->
  <text x="520" y="92" text-anchor="middle" font-size="11" fill="#374151">C</text>
  <!-- Punt D (midden overspanning) -->
  <text x="240" y="92" text-anchor="middle" font-size="11" fill="#374151">D</text>
  <circle cx="240" cy="100" r="3" fill="#3b82f6"/>
  <!-- Belasting op overkraging -->
  <line x1="520" y1="45" x2="520" y2="95" stroke="#dc2626" stroke-width="2" marker-end="url(#arrowRed)"/>
  <text x="520" y="38" text-anchor="middle" font-size="12" fill="#dc2626">P</text>
  <!-- Maat overspanning -->
  <line x1="80" y1="175" x2="400" y2="175" stroke="#6b7280" stroke-width="1" stroke-dasharray="4"/>
  <line x1="80" y1="169" x2="80" y2="181" stroke="#6b7280" stroke-width="1"/>
  <line x1="400" y1="169" x2="400" y2="181" stroke="#6b7280" stroke-width="1"/>
  <text x="240" y="192" text-anchor="middle" font-size="11" fill="#6b7280">L = {{L}} mm</text>
  <!-- Maat overkraging -->
  <line x1="400" y1="175" x2="520" y2="175" stroke="#6b7280" stroke-width="1" stroke-dasharray="4"/>
  <line x1="520" y1="169" x2="520" y2="181" stroke="#6b7280" stroke-width="1"/>
  <text x="460" y="192" text-anchor="middle" font-size="11" fill="#6b7280">a = {{a}} mm</text>
  <!-- Doorbuigingslijn -->
  <path d="M 80,100 Q 240,95 400,100 Q 460,108 520,115" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-dasharray="6"/>
</svg>
@end
`;

// ─────────────────────────────────────────────────────────────────────────────
// 5. Eigenfrequentie van liggers (Hoofdstuk 8, art. 8.2-8.3)
// ─────────────────────────────────────────────────────────────────────────────

/** Vandepitte Hfd. 8 — Eigenfrequentie van liggers */
export const vandepitteEigenfrequentie = `# Beam natural frequency
Source: Prof. D. Vandepitte — Calculation of Structures, Volume I, Chapter 8, art. 8.2-8.3

The natural frequency of an elastically supported mass is (Chapter 8, expression 154):

  f = 1/(2*pi) * sqrt(K/m)

waarbij K de veerstijfheid is en m de massa.

## System

@select systeem "System type (Chapter 8, art. 8.2.3)"
Cantilever beam with a tip mass = 1
Beam on two supports with a mid-span point mass = 2
Elastically restrained member with distributed mass = 3
@end

## Material en section

E = 210000 N/mm^2

Traagheidsmoment:

I = 83560000 mm^4

Overspanning:

L = 6000 mm

#if systeem == 1
## Cantilever beam with a point mass (Chapter 8, art. 8.2.3, expression 157)

Tip mass:

m = 500 kg

Veerstijfheid kraagbalk: K = 3*EI/L^3

K = 3 * E * I / L^3 to N/mm

Static deflection under self-weight:

u_st = m * gravity / K to mm

Eigenfrequentie (formule 157):

f = 1 / (2 * pi) * sqrt(K / m) to Hz

Approximation using static deflection (Chapter 8, expression 154):

f_controle = 1 / (2 * pi) * sqrt(gravity / u_st) to Hz

#end if

#if systeem == 2
## Beam with a mid-span point mass (Chapter 8, art. 8.2.3, expression 157)

Mid-span mass:

m = 500 kg

Veerstijfheid: K = 48*EI/L^3

K = 48 * E * I / L^3 to N/mm

Static deflection:

u_st = m * gravity / K to mm

Eigenfrequentie (formule 157):

f = 1 / (2 * pi) * sqrt(K / m) to Hz

Benadering:

f_controle = 1 / (2 * pi) * sqrt(gravity / u_st) to Hz

#end if

#if systeem == 3
## Elastically restrained member with distributed mass (Chapter 8, art. 8.8)

For a fixed member with uniformly distributed mass, Vandepitte gives
massa de eigenfrequentie (Hfd. 8, formule 163-164):

  f_1 = c_1^2 / (2*pi) * sqrt(EI / (m_bar * L^4))

met c_1 = 4.730 voor de eerste eigenfrequentie.

Mass per unit length:

m_bar = 50 kg/m

First eigenvalue (Chapter 8, art. 8.8):

c_1 = 4.730

The natural frequency of a fixed member is (Chapter 8, expression 164):

The ratio to a beam on two supports is:
approximately 33/140 (Chapter 8, expression 164).

f = c_1^2 / (2 * pi) * sqrt(E * I / (m_bar * L^4)) to Hz

#end if

## Beoordeling

#if f > 5 Hz
  Eigenfrequentie > 5 Hz: geen dynamische problemen te verwachten
  under pedestrian loading.
#else
  Eigenfrequentie <= 5 Hz: risico op resonantie met voetgangersbelasting!
  Nader dynamisch onderzoek is nodig.
#end if

#if f > 3 Hz
  Eigenfrequentie > 3 Hz: geen problemen bij normale vloerbelasting.
#else
  Eigenfrequentie <= 3 Hz: trillingshinder is waarschijnlijk!
#end if
`;

// ─────────────────────────────────────────────────────────────────────────────
// 6. Virtuele Arbeid — Berekening van verplaatsingen (Hoofdstuk 1, art. 1.1-1.4)
// ─────────────────────────────────────────────────────────────────────────────

/** Vandepitte Hfd. 1 — Beginsel van de virtuele arbeid */
export const vandepitteVirtueleArbeid = `# Principle of virtual work
Source: Prof. D. Vandepitte — Calculation of Structures, Volume I, Chapter 1, art. 1.1-1.4

The principle of virtual work (Chapter 1, expression 3):

The total virtual work of all internal forces R_i,
for every possible combination of virtual displacements
vanuit de vervormingstoestand, is nul:

- SOM(F_i · delta_i) + SOM(R_i · delta_i) = 0

## Application: truss member deflection

Virtual work under virtual strain (Chapter 1, art. 1.3):
For a member with tension n and virtual strain delta_epsilon,
the virtual work per unit length is -n * delta_epsilon.

## Vakwerk

@select vakwerktype "Type truss"
Eenvoudige driehoek = 1
Warren truss (6 velden) = 2
@end

Number of bars:

n_staven = 11

Overspanning:

L = 12000 mm

Truss depth:

H = 2000 mm

## Material

E = 210000 N/mm^2

## Staafkrachten (voorbeeld)

Oppervlakte bovenrand:

A_boven = 2000 mm^2

Oppervlakte onderrand:

A_onder = 2000 mm^2

Oppervlakte diagonaal:

A_diag = 1000 mm^2

## Load

Point load at a node (middle of the bottom chord):

F = 100 kN

## Deflection using virtual work (Chapter 1, art. 1.5)

Deflection a at the point and in the direction of the virtual
unit force is calculated as:

- a = SOM( N_i · n_i · L_i / (E · A_i) )

waarbij:
- N_i = staafkracht door werkelijke belasting
- n_i = staafkracht door virtuele eenheidslast
- L_i = lengte van de staaf
- E * A_i = axiale stijfheid

Simplified example: deflection from the top chord member:

N_boven = F * L / (4 * H) to kN

n_boven = 1 * L / (4 * H)

L_boven = L / 2 to mm

delta_boven = N_boven * n_boven * L_boven / (E * A_boven) to mm

Example: deflection from the bottom chord member:

N_onder = F * L / (4 * H) to kN

n_onder = 1 * L / (4 * H)

L_onder = L / 2 to mm

delta_onder = N_onder * n_onder * L_onder / (E * A_onder) to mm

Example: deflection from a diagonal:

L_diag = sqrt(H^2 + (L/4)^2) to mm

N_diag = F / 2 * L_diag / H to kN

n_diag = 1 / 2 * L_diag / H

delta_diag = N_diag * n_diag * L_diag / (E * A_diag) to mm

Approximate total deflection (2×top + 2×bottom + 2×diagonal):

delta_totaal = 2 * delta_boven + 2 * delta_onder + 2 * delta_diag to mm

## Grenswaarde

v_toel = L / 300 to mm

UC = delta_totaal / v_toel

#if UC < 1
  Doorbuiging van het vakwerk voldoet (UC < 1.0).
#else
  Truss deflection fails!
#end if
`;

// ─────────────────────────────────────────────────────────────────────────────
// Export bundel
// ─────────────────────────────────────────────────────────────────────────────

export const vandepitteFormules: { id: string; label: string; template: string }[] = [
  {
    id: 'vdp-schuifspanning',
    label: 'Vandepitte: Schuifspanningen (Jourawsky)',
    template: vandepitteSchuifspanning,
  },
  {
    id: 'vdp-doorbuiging',
    label: "Vandepitte: Deflection including shear",
    template: vandepitteDoorbuiging,
  },
  {
    id: 'vdp-knikken',
    label: 'Vandepitte: Knikken (Euler)',
    template: vandepitteKnikken,
  },
  {
    id: 'vdp-mohr',
    label: "Vandepitte: Deflection (Mohr)",
    template: vandepitteMohr,
  },
  {
    id: 'vdp-eigenfrequentie',
    label: 'Vandepitte: Eigenfrequentie',
    template: vandepitteEigenfrequentie,
  },
  {
    id: 'vdp-virtuele-arbeid',
    label: 'Vandepitte: Virtuele Arbeid (vakwerk)',
    template: vandepitteVirtueleArbeid,
  },
];

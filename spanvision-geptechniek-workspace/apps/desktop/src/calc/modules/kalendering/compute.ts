// apps/desktop/src/calc/modules/kalendering/compute.ts
//
// Kalendering — verwacht aantal slagen per slag-set op basis van
// conusweerstand op paalpunt-niveau, paaldiameter en valblok-energie.
//
// Excel-bron (project-template):
//   =AFRONDEN.BOVEN.EXCEL(400/(($F$13/($J$13*$J$13*D16)));1)
//
// waar:
//   400  = slag-set in mm (over welke zakkings-afstand we tellen)
//   F13  = E_blok in kNm  (slag-energie van het valblok)
//   J13  = diameter van de paal in m
//   D16  = q_c (conusweerstand) in MPa
//
// Algebraïsch herwerkt:
//   N_slagen = CEILING( slagSet_mm × D_m² × q_c_MPa / E_blok_kNm )
//
// Voor rechthoekige palen rekenen we met de equivalente diameter
//   D_eq = √(a · b)   (a en b in mm, geconverteerd naar m voor de formule)
//
// Eenheden bewust gemengd zoals in de Excel — de formule is empirisch en
// werkt mits je slagSet in mm, D in m, q_c in MPa, en E in kNm invult.

import type { KalenderingInput, KalenderingResult, KalenderingValblok } from "./types";
import {
  CUSTOM_VALBLOK_ID,
  computeEBlokKnm,
  getValblok,
} from "./catalog";

function ceil(x: number): number {
  return Math.ceil(x);
}

/** Resolve het effectieve valblok: catalog-entry óf custom (uit input). */
export function resolveValblok(input: KalenderingInput): KalenderingValblok | null {
  if (input.valblokId === CUSTOM_VALBLOK_ID) {
    const eBlok = computeEBlokKnm(input.customMassaKg, input.customValhoogteM);
    if (eBlok <= 0) return null;
    return {
      id: CUSTOM_VALBLOK_ID,
      name: "Custom drop hammer",
      massaKg: input.customMassaKg,
      valhoogteM: input.customValhoogteM,
      eBlokKnm: eBlok,
    };
  }
  return getValblok(input.valblokId) ?? null;
}

/** Bereken de equivalente diameter [mm].
 *  - rond:        D_eq = D
 *  - rechthoekig: D_eq = √(a · b)
 */
export function computeDEqMm(input: KalenderingInput): number {
  if (input.paalSoort === "rond") return input.diameterMm;
  // rechthoekig: meetkundig gemiddelde van a en b
  const a = input.diameterMm;
  const b = input.zijdeBMm;
  if (a <= 0 || b <= 0) return 0;
  return Math.sqrt(a * b);
}

export function computeKalendering(input: KalenderingInput): KalenderingResult {
  const warnings: string[] = [];

  // 1. Valblok resolven
  const valblok = resolveValblok(input);
  if (!valblok) {
    return {
      ok: false,
      error:
        input.valblokId === CUSTOM_VALBLOK_ID
          ? "For a custom drop hammer, both mass and drop height must be > 0."
          : `Unknown drop hammer ID: ${input.valblokId}`,
      warnings,
      eBlokKnm: 0,
      dEqMm: 0,
      slagenPerSet: 0,
      slagenPerMeter: 0,
    };
  }

  // 2. Equivalente diameter
  const dEqMm = computeDEqMm(input);
  if (dEqMm <= 0) {
    return {
      ok: false,
      error:
        input.paalSoort === "rond"
          ? "Diameter must be > 0."
          : "Both sides a and b must be > 0 for a rectangular pile.",
      warnings,
      eBlokKnm: valblok.eBlokKnm,
      dEqMm: 0,
      slagenPerSet: 0,
      slagenPerMeter: 0,
    };
  }

  // 3. Sanity-checks op qc en slag-set
  if (!Number.isFinite(input.conusweerstandMpa) || input.conusweerstandMpa <= 0) {
    return {
      ok: false,
      error: "Cone resistance must be > 0 MPa.",
      warnings,
      eBlokKnm: valblok.eBlokKnm,
      dEqMm,
      slagenPerSet: 0,
      slagenPerMeter: 0,
    };
  }
  if (!Number.isFinite(input.slagSetMm) || input.slagSetMm <= 0) {
    return {
      ok: false,
      error: "Set per blow must be > 0 mm.",
      warnings,
      eBlokKnm: valblok.eBlokKnm,
      dEqMm,
      slagenPerSet: 0,
      slagenPerMeter: 0,
    };
  }

  // 4. Formule — D omzetten naar meter (Excel-formule J13 zit in m).
  const dEqM = dEqMm / 1000;
  const numerator = input.slagSetMm * dEqM * dEqM * input.conusweerstandMpa;
  const ratio = numerator / valblok.eBlokKnm;
  const slagenPerSet = ceil(ratio);

  // 5. Slagen per meter — pro rata uit slagSet en aantal slagen.
  //    N_per_m = N_per_set × (1000 / slagSet_mm)
  //    NB: we ronden NIET af op heel getal hier, want dit is een
  //    extrapolatie — een fractioneel gemiddelde is informatiever
  //    dan een vroegtijdig afgeronde slag-count.
  const slagenPerMeter = slagenPerSet * (1000 / input.slagSetMm);

  // 6. Praktijk-waarschuwingen
  if (slagenPerSet > 200) {
    warnings.push(
      `Zeer hoge slagcount (${slagenPerSet} per ${input.slagSetMm}mm) — consider a heavier hammer to prevent damage to the pile head.`,
    );
  }
  if (slagenPerSet < 3) {
    warnings.push(
      `Zeer lage slagcount (${slagenPerSet} per ${input.slagSetMm}mm) — verify that the pile achieves the calculated capacity; the driving estimate may be optimistic.`,
    );
  }
  if (input.conusweerstandMpa > 30) {
    warnings.push(
      `q_c = ${input.conusweerstandMpa.toFixed(1)}MPa is exceptionally high. Check that this is the correct value at pile tip level.`,
    );
  }

  return {
    ok: true,
    warnings,
    eBlokKnm: valblok.eBlokKnm,
    dEqMm,
    slagenPerSet,
    slagenPerMeter,
  };
}

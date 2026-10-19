/**
 * rapportVoorwaarden — mag het standaardrapport NU naar PDF? De zuivere oordelen
 * achter de export via het bedieningskanaal (`rapport_voorbereiden`).
 *
 * WAAROM WEIGEREN EN NIET "GEWOON PRINTEN"
 * ----------------------------------------
 * Het live rapport toont bij ontbrekende resultaten "Nog niet berekend", en de
 * balk "Model gewijzigd" print niet mee (report.css, @media print). Een PDF van
 * een model zonder (verse) berekening ziet er dus af uit — met lege
 * hoofdstukken, of met een toetsing die bij een eerdere krachtsverdeling hoort.
 * Een document dat er compleet uitziet maar niet klopt is erger dan een
 * foutmelding. Deze module zegt daarom per toestand: WACHT (er loopt of komt
 * nog iets), WEIGER (met de reden in gewone taal), of OK.
 *
 * Alles hier is zuiver: de toestand komt als argument binnen, zodat de oordelen
 * zonder app te testen zijn (test-rapport-gereedheid.mjs).
 */
import type { Analysetype } from "../components/fem/femTypes";
import type { RapportKop } from "../components/report/useProjectInfo";

/** Wat de export over de rekengang en de toetsing moet weten. */
export interface RekenVoorwaarden {
  /** Staan er knopen of staven in het model? */
  heeftModel: boolean;
  /** Zijn er combinatieresultaten (`combinationResults !== null`)? */
  heeftResultaten: boolean;
  /** De reden dat de laatste rekengang mislukte, of null. */
  rekenfout: string | null;
  /** Staat er na een modelwijziging een automatische herberekening gepland? */
  herberekeningGepland: boolean;
  /** Aantal rekengangen (knop Berekenen / `rekenen` / live) dat nog loopt. */
  lopendeRekengangen: number;
  /** Loopt de toetsing (checkStore.isRunning)? */
  toetsingLoopt: boolean;
  /** De fout van de laatste toetsronde, of null. */
  toetsfout: string | null;
  /** Is er getoetst sinds de laatste wissing (checkStore.lastRunAt !== null)? */
  toetsingGedraaid: boolean;
  /** Is die toetsing gedaan op precies de resultaten die nu in het rapport staan? */
  toetsingHoortBijResultaten: boolean;
  /** Heeft het model staven die de toetsing zou oppakken (anyCheckableBeams)? */
  toetsbareStaven: boolean;
  analysetype: Analysetype;
  /**
   * Komen de resultaten uit de VOLLEDIGE rekengang (knop Berekenen, of
   * `rekenen` via het kanaal)? Alleen van belang bij tweedeOrdeFysisch: de
   * toets-knop rekent zo nodig zelf door, maar dan zonder de fysisch
   * niet-lineaire ronde — P-Δ-krachten waar de gescheurde verdeling hoort.
   */
  resultatenUitVolledigeRekengang: boolean;
}

export type Oordeel =
  | { soort: "ok" }
  | { soort: "wacht"; reden: string }
  | { soort: "weiger"; reden: string };

/**
 * Het oordeel. Eerst de WACHT-redenen: zolang er iets loopt of gepland staat
 * zegt de rest van de toestand niets (resultaten en toetsing worden bij een
 * modelwijziging gewist en daarna opnieuw gevuld).
 */
export function beoordeelRekenVoorwaarden(v: RekenVoorwaarden): Oordeel {
  if (v.lopendeRekengangen > 0) {
    return { soort: "wacht", reden: "a calculation is running (analysis, physically nonlinear iteration or verification)" };
  }
  if (v.herberekeningGepland) {
    return { soort: "wacht", reden: "a recalculation is scheduled after a model change" };
  }
  if (v.toetsingLoopt) return { soort: "wacht", reden: "verification is still running" };

  if (!v.heeftModel) return { soort: "weiger", reden: "there is no model in the app" };
  if (v.rekenfout !== null) {
    return { soort: "weiger", reden: `the last calculation failed: ${v.rekenfout}` };
  }
  if (!v.heeftResultaten) {
    return {
      soort: "weiger",
      reden:
        "there are no results — no calculation has been run, or the model changed after the last " +
        "calculation. Call `rekenen` first",
    };
  }
  if (v.toetsfout !== null) {
    return { soort: "weiger", reden: `verification returned an error: ${v.toetsfout}` };
  }
  if (v.analysetype === "tweedeOrdeFysisch" && !v.resultatenUitVolledigeRekengang) {
    return {
      soort: "weiger",
      reden:
        "physically nonlinear second-order analysis requires results from the full calculation " +
        "(Calculate button or `rekenen`), including the physically nonlinear iteration; the " +
        "current results came from a different process. Call `rekenen`",
    };
  }
  if (v.toetsbareStaven && !v.toetsingGedraaid) {
    return {
      soort: "weiger",
      reden:
        "verification is missing or was cleared after a change, while the model contains " +
        "members that require verification. Call `rekenen` or `toetsen`",
    };
  }
  if (v.toetsbareStaven && !v.toetsingHoortBijResultaten) {
    return {
      soort: "weiger",
      reden:
        "verification belongs to a different calculation from the results currently shown in the report " +
        "(outdated). Call `toetsen` or `rekenen`",
    };
  }
  // Een model ZONDER toetsbare staven is geldig: dan staat er niets te toetsen.
  // Het toetsingsoverzicht zegt dat zelf (CheckTableSection), dus de PDF ook.
  return { soort: "ok" };
}

// ── De argumenten van de export ─────────────────────────────────────────────

export interface ExportOpties {
  type: "volledig" | "beperkt" | null;
  formaat: "A4" | "A3" | null;
  orientatie: "portrait" | "landscape" | null;
  /** De kop voor deze export, of null = de projectgegevens van de app. */
  kop: RapportKop | null;
  tijdslimietMs: number;
}

const STANDAARD_TIJDSLIMIET_MS = 120_000;

/**
 * Lees en controleer de argumenten van `rapport_voorbereiden`. Een onbekende
 * waarde of een onbekend veld is een fout met de naam erbij — een tikfout in
 * "beperkt" zou anders stil een volledig rapport opleveren.
 */
export function leesExportOpties(args: Record<string, unknown>): ExportOpties {
  const bekend = new Set(["type", "formaat", "orientatie", "project", "tijdslimiet_ms"]);
  for (const k of Object.keys(args)) {
    if (!bekend.has(k)) throw new Error(`unknown argument “${k}” (known: ${[...bekend].join(", ")})`);
  }
  const keuze = <T extends string>(k: string, toegestaan: readonly T[]): T | null => {
    const v = args[k];
    if (v === undefined || v === null) return null;
    if (typeof v !== "string" || !(toegestaan as readonly string[]).includes(v)) {
      throw new Error(`“${k}” must be one of ${toegestaan.join(" | ")}, not ${JSON.stringify(v)}`);
    }
    return v as T;
  };
  const type = keuze("type", ["volledig", "beperkt"] as const);
  const formaat = keuze("formaat", ["A4", "A3"] as const);
  const orientatie = keuze("orientatie", ["portrait", "landscape"] as const);

  let kop: RapportKop | null = null;
  const p = args.project;
  if (p !== undefined && p !== null) {
    if (typeof p !== "object" || Array.isArray(p)) throw new Error("`project` must be an object");
    const velden: Record<string, keyof RapportKop> = {
      naam: "name",
      nummer: "projectNumber",
      constructeur: "engineer",
      bedrijf: "company",
      datum: "date",
    };
    kop = { name: "", projectNumber: "", engineer: "", company: "", date: "" };
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      const doel = velden[k];
      if (!doel) {
        throw new Error(`unknown field “project.${k}” (known: ${Object.keys(velden).join(", ")})`);
      }
      if (v === null || v === undefined) continue;
      if (typeof v !== "string") throw new Error(`“project.${k}” must be text`);
      kop[doel] = v;
    }
  }

  let tijdslimietMs = STANDAARD_TIJDSLIMIET_MS;
  const t = args.tijdslimiet_ms;
  if (t !== undefined && t !== null) {
    if (typeof t !== "number" || !Number.isFinite(t)) throw new Error("`tijdslimiet_ms` must be a number");
    tijdslimietMs = Math.min(600_000, Math.max(1_000, t));
  }
  return { type, formaat, orientatie, kop, tijdslimietMs };
}

// ── Veranderde er iets tussen "klaar" en de afdruk? ─────────────────────────

/** Een momentopname waarmee de export na het printen controleert of alles bleef staan. */
export interface ExportMoment {
  /** Teller die ophoogt bij elke modelwijziging en elke rekengang (App.tsx). */
  generatie: number;
  /** Aantal pagineerslagen (rapportGereedheid). */
  slagen: number;
  aantalVellen: number;
  /** checkStore.lastRunAt */
  toetsingOp: number | null;
  weergave: string;
}

/**
 * De reden dat het document tijdens het printen kan zijn veranderd, of null.
 * Dan hoort de PDF weg: hij kan een half herpagineerd rapport of een rapport
 * van een ander model bevatten, en dat is van buiten niet te zien.
 */
export function vergelijkExportMoment(voor: ExportMoment, na: ExportMoment): string | null {
  if (na.weergave !== "report") return `the view changed during printing (to "${na.weergave}")`;
  if (na.generatie !== voor.generatie) return "the model or calculation changed during printing";
  if (na.toetsingOp !== voor.toetsingOp) return "verification changed during printing";
  if (na.slagen !== voor.slagen) {
    return `the report was repaginated during printing (pass ${voor.slagen} → ${na.slagen})`;
  }
  if (na.aantalVellen !== voor.aantalVellen) {
    return `the sheet count changed during printing (${voor.aantalVellen} → ${na.aantalVellen})`;
  }
  return null;
}

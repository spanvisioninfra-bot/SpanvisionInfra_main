/**
 * Het model van een begeleiding (`api.help.startGuide`, contract 1.4.0): validatie en de splitsing
 * van een stap-tekst in opdracht en uitleg. Puur — geen store, geen DOM — zodat
 * `tests/planning/check-ext-help.ts` het headless kan aflopen.
 *
 * WAAROM STRENG VALIDEREN. De stappen komen uit extensie-code en worden door de app getekend. Een
 * half object (geen `nl`-tekst, een `check` die geen functie is) mag het paneel niet halverwege laten
 * klappen; daarom wordt de hele begeleiding vóór het starten gecontroleerd en bij de eerste fout
 * niets gestart. De extensie krijgt alle gevonden problemen in één foutmelding terug.
 */
import type { ExtGuide, ExtGuideStep, ExtHelpText } from './types';

/** Zelfde vorm als een Help-artikel-id (`helpArticleRegistry.ts`). */
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Een anker is de waarde van een `data-tour-anchor`-attribuut. De host bouwt er zelf de selector
 * `[data-tour-anchor="…"]` van; aanhalingstekens, backslashes en spaties zijn daarom uitgesloten.
 */
const ANCHOR_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/;

/** Bovengrens tegen een per ongeluk gegenereerde reuzenlijst; een tutorial heeft er een handvol. */
export const MAX_GUIDE_STEPS = 200;

/** Een regel met alleen `---` scheidt opdracht en uitleg. */
const SEPARATOR_RE = /^\s*---\s*$/;

function isText(value: unknown): value is ExtHelpText {
  const v = value as Partial<ExtHelpText> | null;
  return typeof v === 'object' && v !== null
    && typeof v.nl === 'string' && v.nl.trim() !== ''
    && typeof v.en === 'string' && v.en.trim() !== '';
}

function separatorCount(markdown: string): number {
  return markdown.replace(/\r\n/g, '\n').split('\n').filter(line => SEPARATOR_RE.test(line)).length;
}

/**
 * Controleer een begeleiding. `hasAsset` beantwoordt of een `resetAsset` echt in de eigen assets
 * van de extensie zit. Lege lijst = geldig.
 */
export function validateGuide(guide: unknown, hasAsset: (name: string) => boolean): string[] {
  const errors: string[] = [];
  const g = guide as Partial<ExtGuide> | null;
  if (typeof g !== 'object' || g === null) return ['guide must be an object'];
  if (typeof g.id !== 'string' || !ID_RE.test(g.id)) errors.push('invalid ID (use lowercase letters, numbers, and hyphens)');
  if (!isText(g.title)) errors.push('title.nl and title.en must be non-empty text');
  if (!Array.isArray(g.steps) || g.steps.length === 0) {
    errors.push('steps must be a non-empty list');
    return errors;
  }
  if (g.steps.length > MAX_GUIDE_STEPS) errors.push(`at most ${MAX_GUIDE_STEPS} steps`);
  const seen = new Set<string>();
  g.steps.forEach((raw, index) => {
    const step = raw as Partial<ExtGuideStep> | null;
    const label = typeof step?.id === 'string' && step.id ? `step "${step.id}"` : `step ${index + 1}`;
    if (typeof step !== 'object' || step === null) {
      errors.push(`${label}: must be an object`);
      return;
    }
    if (typeof step.id !== 'string' || !ID_RE.test(step.id)) errors.push(`${label}: invalid id (lowercase letters, numbers and hyphens)`);
    else if (seen.has(step.id)) errors.push(`${label}: duplicate id`);
    else seen.add(step.id);
    if (!isText(step.body)) {
      errors.push(`${label}: body.nl and body.en must be non-empty text`);
    } else {
      for (const lang of ['nl', 'en'] as const) {
        if (separatorCount(step.body[lang]) > 1) errors.push(`${label}: body.${lang} has more than one separator line ---`);
        if (!splitGuideBody(step.body[lang]).task.trim()) errors.push(`${label}: body.${lang} has no task before ---`);
      }
    }
    if (step.anchor !== undefined && (typeof step.anchor !== 'string' || !ANCHOR_RE.test(step.anchor))) {
      errors.push(`${label}: anchor must be an anchor name (letters, numbers and : . _ -)`);
    }
    if (step.check !== undefined && typeof step.check !== 'function') errors.push(`${label}: check must be a function`);
    if (step.prepare !== undefined && typeof step.prepare !== 'function') errors.push(`${label}: prepare must be a function`);
    if (step.resetAsset !== undefined) {
      if (typeof step.resetAsset !== 'string' || !/\.ifc$/i.test(step.resetAsset)) {
        errors.push(`${label}: resetAsset must name an .ifc asset`);
      } else if (!hasAsset(step.resetAsset)) {
        errors.push(`${label}: resetAsset "${step.resetAsset}" is not in the extension assets`);
      }
    }
  });
  return errors;
}

/** Opdracht (vóór `---`) en uitleg (erna; leeg als er geen scheiding is). */
export function splitGuideBody(markdown: string): { task: string; explanation: string } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const at = lines.findIndex(line => SEPARATOR_RE.test(line));
  if (at < 0) return { task: markdown, explanation: '' };
  return { task: lines.slice(0, at).join('\n'), explanation: lines.slice(at + 1).join('\n') };
}

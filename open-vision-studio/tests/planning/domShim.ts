/**
 * Minimale DOM-stub voor check-scripts die (indirect) `@/i18n/config` binnentrekken.
 *
 * `config.ts` zet bij het láden al `document.documentElement.dir` (RTL-afhandeling), en Node heeft
 * geen `document`. Zonder deze stub knalt zo'n bundel bij de eerste import — nog vóór de eerste
 * assertie. Bewust géén jsdom-dependency: er is precies één property nodig.
 *
 * Importeer dit bestand als ALLEREERSTE import van het check-script; ESM voert imports in
 * bronvolgorde uit, dus de stub staat er voordat i18n zichzelf initialiseert.
 */
const g = globalThis as unknown as { document?: unknown };
if (!g.document) {
  g.document = { documentElement: {} };
}

export {};

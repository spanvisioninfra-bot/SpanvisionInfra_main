// Band-collapse-batterij (issue #35): "alle groepen in-/uitklappen" tegen de ECHTE store.
// Bewijst dat inklappen ook GENESTE banden pakt wanneer er al een band dicht stond — precies het
// geval waar een route via `viewRows` stukgaat, want een ingeklapte band emit zijn subbanden niet.
// De data-gedreven view-cases (cases-view.json) kunnen dit niet dekken: die roepen `computeViewRows`
// rechtstreeks aan en komen nooit langs de store-acties.
import { useAppStore } from '@/state/appStore';
import { createDefaultTaskTime } from '@/utils/taskDefaults';
import { encodeBandKey } from '@/engine/view/visibleRows';

const S = () => useAppStore.getState();
let fails = 0;
const check = (ok: boolean, label: string, extra = '') => {
  if (ok) console.log(`ok  ${label}`);
  else { console.log(`XX  ${label}${extra ? ` — ${extra}` : ''}`); fails++; }
};
const eqSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

// --- Opbouw: 2 codetypes (Fase × Zone) ⇒ 2 bovenbanden × 2 subbanden = 6 banden ---
S().newProject();
const faseId = S().addActivityCodeType('Fase');
const ruwbouw = S().addActivityCodeValue(faseId, { code: 'Ruwbouw' });
const afbouw = S().addActivityCodeValue(faseId, { code: 'Afbouw' });
const zoneId = S().addActivityCodeType('Zone');
const noord = S().addActivityCodeValue(zoneId, { code: 'Noord' });
const zuid = S().addActivityCodeValue(zoneId, { code: 'Zuid' });

for (const [naam, fase, zone] of [
  ['Heien', ruwbouw, noord], ['Wapening', ruwbouw, zuid],
  ['Stucwerk', afbouw, noord], ['Schilderen', afbouw, zuid],
] as const) {
  const id = S().addTask({
    name: naam, isMilestone: false, parentId: null,
    time: createDefaultTaskTime('2026-06-01', 1),
  });
  S().setTaskActivityCode(id, faseId, fase);
  S().setTaskActivityCode(id, zoneId, zone);
}

S().setGroup([
  { field: { src: 'activityCode', typeId: faseId }, dir: 'asc' },
  { field: { src: 'activityCode', typeId: zoneId }, dir: 'asc' },
]);

// De volledige, met de hand opgeschreven verwachting (rawKey van een activity-code = de valueId).
const ALLE_BANDEN = [
  encodeBandKey([ruwbouw]), encodeBandKey([ruwbouw, noord]), encodeBandKey([ruwbouw, zuid]),
  encodeBandKey([afbouw]), encodeBandKey([afbouw, noord]), encodeBandKey([afbouw, zuid]),
];

const bandRijen = () => S().viewRows.filter(r => r.kind === 'group').map(r => (r as { key: string }).key);

check(eqSet(bandRijen(), ALLE_BANDEN), 'uitgangspunt: alle 6 banden staan open in viewRows',
  `kreeg ${bandRijen().length}`);

// --- Stap 1: klap één BOVENband in; zijn subbanden verdwijnen daarmee uit viewRows ---
S().setCollapsedGroupKey(encodeBandKey([ruwbouw]), true);
const naief = bandRijen(); // dit is precies wat een viewRows-route zou zien
check(!naief.includes(encodeBandKey([ruwbouw, noord])) && !naief.includes(encodeBandKey([ruwbouw, zuid])),
  'viewRows-route is incompleet: subbanden van de ingeklapte band ontbreken',
  `viewRows-banden: ${naief.length}/6`);

// --- Stap 2: alles inklappen moet tóch alle 6 sleutels opleveren ---
S().collapseAllGroups();
check(eqSet(S().view.collapsedGroupKeys, ALLE_BANDEN),
  'collapseAllGroups pakt ALLE banden, ook de geneste onder een reeds ingeklapte band',
  `kreeg ${S().view.collapsedGroupKeys.length}: ${JSON.stringify(S().view.collapsedGroupKeys)}`);

// --- Stap 3: uitklappen opent alles weer, in één keer ---
S().expandAllGroups();
check(S().view.collapsedGroupKeys.length === 0, 'expandAllGroups leegt de collapse-set');
check(eqSet(bandRijen(), ALLE_BANDEN), 'na uitklappen zijn alle 6 banden weer zichtbaar',
  `kreeg ${bandRijen().length}`);

// --- Stap 4: de modus-bewuste wrappers (bandkop-contextmenu) doen hetzelfde ---
S().collapseAll();
check(eqSet(S().view.collapsedGroupKeys, ALLE_BANDEN),
  'collapseAll() routeert in gegroepeerde weergave naar de banden');
S().expandAll();
check(S().view.collapsedGroupKeys.length === 0, 'expandAll() routeert in gegroepeerde weergave naar de banden');

// --- Stap 5: zonder groepering blijven de taak-acties gelden en is de band-actie een no-op ---
S().setGroup([]);
S().collapseAll();
check(S().view.collapsedGroupKeys.length === 0 && S().ui.collapsedTaskIds.length === 0,
  'boommodus: collapseAll() raakt de banden niet (en deze vlakke set heeft geen summary-taken)');
S().collapseAllGroups();
check(S().view.collapsedGroupKeys.length === 0, 'collapseAllGroups zonder groepering is een no-op');

console.log(fails === 0 ? 'BAND-COLLAPSE: alles groen' : `BAND-COLLAPSE: ${fails} fout(en)`);
process.exit(fails === 0 ? 0 : 1);

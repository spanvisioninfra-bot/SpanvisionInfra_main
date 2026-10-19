import type { CostItem, CostSchedule, RowType } from '@/types/costModel';
import { useAppStore } from '@/state/appStore';

/**
 * Calculatieassistent — de brug tussen het taalmodel en het geopende document.
 *
 * 1) buildBudgetContext geeft het model een compacte, genummerde weergave van
 *    de actieve begroting (Nr is de verwijssleutel).
 * 2) Het model mag in zijn antwoord één ```ocs-acties```-blok teruggeven met
 *    wijzigingen; parseActies haalt dat eruit.
 * 3) applyActies voert ze uit op de store — met undo-historie, de vaste
 *    regels voor uur-regels (norm 1 + tariefgroep + loon, nooit als
 *    materiaalprijs) en een herberekening achteraf.
 */

// ── 1. Context ──────────────────────────────────────────────────────────

// De begrotingscontext gaat via stdin (geen lengtelimiet), dus de hele
// begroting kan mee — de assistent moet immers alle regels kennen om vragen
// te beantwoorden. Ruime veiligheidsbovengrens tegen pathologische gevallen.
const MAX_CONTEXT_REGELS = 2000;

export function buildBudgetContext(schedule: CostSchedule, items: CostItem[]): string {
  const tarieven = schedule.tarieven ?? { A: 66, B: 46, C: 82 };
  const zichtbaar = items.filter((i) => !i.rowType.startsWith('staart_'));
  const kostprijs = zichtbaar
    .filter((i) => i.parentId === null)
    .reduce((s, i) => s + (i.total ?? 0), 0);

  const fmt = (v: number | null | undefined) =>
    v == null || v === 0 ? '' : String(Math.round(v * 100) / 100);

  const regels = zichtbaar.slice(0, MAX_CONTEXT_REGELS).map((i) => {
    const kolommen = [
      i.nr || '?',
      i.rowType,
      i.description,
      [fmt(i.quantity), i.unit ?? ''].filter(Boolean).join(' '),
      i.rowType === "regel" ? `unitPrice=${fmt(i.normUnitPrice)} laborPerUnit=${fmt(i.laborPrice)} hoursPerUnit=${fmt(i.normQuantity)} rateGroup=${i.tariefGroep ?? ''} resourceType=${i.resourceType ?? ''}` : '',
      `total=${fmt(i.total)}`,
    ];
    return kolommen.filter(Boolean).join(' | ');
  });
  const rest = zichtbaar.length - MAX_CONTEXT_REGELS;
  if (rest > 0) regels.push(`(… ${rest} more rows not shown)`);

  return [
    `Project: ${schedule.projectName || schedule.name || "(untitled)"}`,
    `Direct cost (excluding overheads and VAT): ${Math.round(kostprijs)}`,
    `Hourly rates: A=${tarieven.A} B=${tarieven.B} C=${tarieven.C}`,
    '',
    "Estimate rows (No. | type | description | quantity | details | total):",
    ...regels,
  ].join('\n');
}

/** Protocol-uitleg voor in de system prompt. */
export const ACTIE_PROTOCOL = `
You can MODIFY the estimate by including exactly one action block in your response:

\`\`\`ocs-acties
{"acties":[ ... ]}
\`\`\`

Allowed actions (always refer to the exact "nr" from the estimate rows):
- {"type":"update","nr":"21.01.01","veld":"aantal","waarde":14} — fields: aantal (quantity), prijs (material/purchase unit price), omschrijving (description), eenheid (unit), norm (hours per unit), tariefgroep (A/B/C), code
- {"type":"add_hoofdstuk","code":"32","omschrijving":"Stairs"}
- {"type":"add_post","onderNr":"21","omschrijving":"Foundation"}
- {"type":"add_regel","onderNr":"21.01","omschrijving":"Concrete C30","aantal":12,"eenheid":"m3","prijs":145,"resourceType":"materiaal"} — resourceType values: arbeid (labor) | materiaal (materials) | materieel (equipment) | onderaannemer (subcontractor) | overig (other). For hourly rows, use eenheid "uur" and supply tariefgroep; wages are calculated from the rate group, so do NOT specify prijs.
- {"type":"verwijder","nr":"21.01.02"}

Rules: include an action block only when the user actually requests a change. Briefly explain the action in English. Amounts exclude VAT. Never invent row numbers that are not in the supplied list. Preserve all protocol field names and enum values exactly; write human-readable descriptions in English.`;

// ── 2. Parsen ───────────────────────────────────────────────────────────

export interface AssistantActie {
  type: string;
  [key: string]: unknown;
}

export function parseActies(text: string): { acties: AssistantActie[]; cleanText: string } {
  const match = text.match(/```(?:ocs-acties|json)?\s*\n?(\{[\s\S]*?\})\s*```/);
  if (!match) return { acties: [], cleanText: text };
  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed?.acties)) return { acties: [], cleanText: text };
    const cleanText = text.replace(match[0], '').trim();
    return { acties: parsed.acties as AssistantActie[], cleanText };
  } catch {
    return { acties: [], cleanText: text };
  }
}

// ── 3. Uitvoeren ────────────────────────────────────────────────────────

const VELD_MAP: Record<string, keyof CostItem> = {
  aantal: 'quantity',
  hoeveelheid: 'quantity',
  prijs: 'normUnitPrice',
  omschrijving: 'description',
  eenheid: 'unit',
  norm: 'normQuantity',
  tariefgroep: 'tariefGroep',
  code: 'code',
};

function nieuwItem(rowType: RowType, parentId: string | null, overrides: Partial<CostItem>): CostItem {
  return {
    id: crypto.randomUUID(),
    parentId,
    sortOrder: 999999, // normalisatie zet hem netjes achteraan bij zijn ouder
    code: '',
    description: '',
    unit: 'st',
    quantity: null,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth: 0,
    notes: '',
    ifcGuid: crypto.randomUUID(),
    rowType,
    staartPercentage: null,
    nr: '',
    normQuantity: null,
    normFactor: null,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: null,
    resourceLibraryId: null,
    verrekenbaar: rowType === "chapter" ? 'V' : null,
    tariefGroep: null,
    ...overrides,
  } as CostItem;
}

/** Voer de acties uit op het actieve document. Geeft per actie een resultaatregel. */
export function applyActies(acties: AssistantActie[]): string[] {
  const resultaten: string[] = [];
  if (acties.length === 0) return resultaten;

  const store = useAppStore.getState();
  store.pushHistory(store.items, 'Calculatieassistent');

  const tarieven = store.schedule.tarieven ?? { A: 66, B: 46, C: 82 };
  const vindOpNr = (nr: unknown): CostItem | undefined =>
    useAppStore.getState().items.find((i) => i.nr === String(nr ?? '').trim());

  for (const actie of acties) {
    try {
      switch (actie.type) {
        case 'update': {
          const item = vindOpNr(actie.nr);
          if (!item) throw new Error(`nr ${actie.nr} not found`);
          const veld = VELD_MAP[String(actie.veld ?? '').toLowerCase()];
          if (!veld) throw new Error(`unknown field "${actie.veld}"`);
          let waarde: unknown = actie.waarde;
          if (['quantity', 'normUnitPrice', 'normQuantity'].includes(veld)) {
            waarde = waarde == null || waarde === '' ? null : Number(waarde);
            if (waarde !== null && isNaN(waarde as number)) throw new Error("value is not a number");
          }
          useAppStore.getState().updateItem(item.id, veld, waarde as never);
          resultaten.push(`✔ ${actie.nr}: ${String(actie.veld)} → ${actie.waarde}`);
          break;
        }
        case 'add_hoofdstuk': {
          const item = nieuwItem("chapter", null, {
            code: String(actie.code ?? ''),
            description: String(actie.omschrijving ?? "New chapter"),
          });
          useAppStore.getState().setItems([...useAppStore.getState().items, item]);
          resultaten.push(`✔ Chapter ${item.code} "${item.description}" toegevoegd`);
          break;
        }
        case 'add_post': {
          const ouder = vindOpNr(actie.onderNr);
          if (!ouder) throw new Error(`onderNr ${actie.onderNr} not found`);
          const item = nieuwItem('begrotingspost', ouder.id, {
            description: String(actie.omschrijving ?? "New item"),
            quantity: actie.aantal != null ? Number(actie.aantal) : null,
            unit: (actie.eenheid as CostItem['unit']) ?? "st",
          });
          useAppStore.getState().setItems([...useAppStore.getState().items, item]);
          resultaten.push(`✔ Post "${item.description}" added under ${actie.onderNr}`);
          break;
        }
        case 'add_regel': {
          const ouder = vindOpNr(actie.onderNr);
          if (!ouder) throw new Error(`onderNr ${actie.onderNr} not found`);
          const eenheid = String(actie.eenheid ?? "st");
          const groep = (String(actie.tariefgroep ?? 'A').toUpperCase() as 'A' | 'B' | 'C');
          const isUren = eenheid.toLowerCase() === "uur";
          // Uur-regels volgen de vaste calculatieregels: norm 1, loon via de
          // tariefgroep, géén materiaalprijs — anders belandt loon in de
          // materiaalkolom.
          const item = nieuwItem('regel', ouder.id, {
            description: String(actie.omschrijving ?? "New row"),
            quantity: actie.aantal != null ? Number(actie.aantal) : null,
            unit: eenheid as CostItem['unit'],
            ...(isUren
              ? {
                  normQuantity: 1,
                  tariefGroep: groep,
                  laborPrice: tarieven[groep] ?? 66,
                  normUnitPrice: null,
                  resourceType: 'arbeid',
                }
              : {
                  normUnitPrice: actie.prijs != null ? Number(actie.prijs) : null,
                  normQuantity: actie.norm != null ? Number(actie.norm) : null,
                  tariefGroep: actie.tariefgroep != null ? groep : null,
                  laborPrice: actie.norm != null && actie.tariefgroep != null ? (tarieven[groep] ?? 66) * Number(actie.norm) : null,
                  resourceType: (actie.resourceType as CostItem['resourceType']) ?? null,
                }),
          });
          useAppStore.getState().setItems([...useAppStore.getState().items, item]);
          resultaten.push(`✔ Regel "${item.description}" added under ${actie.onderNr}`);
          break;
        }
        case 'verwijder': {
          const item = vindOpNr(actie.nr);
          if (!item) throw new Error(`nr ${actie.nr} not found`);
          // Verwijder inclusief alle afstammelingen
          const huidige = useAppStore.getState().items;
          const weg = new Set<string>([item.id]);
          let groeit = true;
          while (groeit) {
            groeit = false;
            for (const i of huidige) {
              if (i.parentId && weg.has(i.parentId) && !weg.has(i.id)) {
                weg.add(i.id);
                groeit = true;
              }
            }
          }
          useAppStore.getState().setItems(huidige.filter((i) => !weg.has(i.id)));
          resultaten.push(`✔ ${actie.nr} "${item.description}" verwijderd (${weg.size} calc ${weg.size === 1 ? '' : 's'})`);
          break;
        }
        default:
          throw new Error(`onbekende actie "${actie.type}"`);
      }
    } catch (e) {
      resultaten.push(`✖ ${actie.type}: ${(e as Error).message}`);
    }
  }

  useAppStore.getState().recalculate();
  return resultaten;
}

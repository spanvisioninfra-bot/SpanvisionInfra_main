/**
 * Contract-check voor de icoon-sanitizer (src/utils/sanitizeSvgIcon.ts, bevinding K6a).
 *
 * DEKKING EN DE GRENS DAARVAN. Node kent geen `DOMParser` (geverifieerd op Node 24: `undefined`)
 * en het project heeft geen jsdom/linkedom-dependency. De PARSE-stap van `sanitizeSvgIcon` is
 * hier dus NIET te dekken; wat wel volledig gedekt is, is de beslissings- en herbouwlaag: de
 * allowlists, de harde verwijderingen, de waardecheck, het schoonmaken van de boom en het
 * serialiseren. Die laag is bewust DOM-vrij gehouden (`IconNode`) juist om dit mogelijk te maken.
 * De kwaadaardige gevallen worden hieronder aangeboden als de `IconNode`-boom die een
 * XML-parser voor de bijbehorende string oplevert — de string staat er telkens bij.
 * Het gedrag zónder parser (fallback naar `null`) wordt óók getest, want dat is het pad dat de
 * suite en een eventuele SSR-omgeving zelf raken.
 */
import {
  sanitizeSvgIcon,
  sanitizeIconTree,
  sanitizeIconNode,
  serializeIconNode,
  asTextIcon,
  isAllowedElement,
  isAllowedAttribute,
  isSafeAttributeValue,
  TEXT_NODE_TAG,
  type IconNode,
} from '@/utils/sanitizeSvgIcon';

let failures = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    failures++;
    console.error(`XX ${name}`);
  } else {
    console.log(`ok ${name}`);
  }
}

/** Beknopte bouwers voor de boom die een XML-parser zou opleveren. */
const el = (tag: string, attrs: Array<[string, string]> = [], children: IconNode[] = []): IconNode =>
  ({ tag, attrs, children });
const txt = (text: string): IconNode => ({ tag: TEXT_NODE_TAG, attrs: [], children: [], text });

/** Volledige route voor een geparste boom: schoonmaken + serialiseren, of null. */
const run = (root: IconNode): string | null => {
  const clean = sanitizeIconTree(root);
  return clean === null ? null : serializeIconNode(clean);
};

// ── Aanvalsvectoren (de string staat telkens in de testnaam) ─────────────────

// <svg onload="alert(1)"><path d="M0 0h24"/></svg>
const onloadTree = el('svg', [['viewBox', '0 0 24 24'], ['onload', 'alert(1)']], [el('path', [['d', 'M0 0h24']])]);
check(
  'onload: handler weg, geometrie blijft',
  run(onloadTree) === '<svg viewBox="0 0 24 24"><path d="M0 0h24"></path></svg>',
);

// <svg><script>alert(1)</script></svg>  → script weg, niets zichtbaars over → null
check('script: element weg en niets over → null', run(el('svg', [], [el('script', [], [txt('alert(1)')])])) === null);
check('script: staat niet in de allowlist', isAllowedElement('script') === false);

// <img src="x" onerror="alert(1)">  → geen svg-wortel
check('img-wortel: geen <svg> → null', run(el('img', [['src', 'x'], ['onerror', 'alert(1)']])) === null);

// <svg><use href="#icon"/></svg>
check('use: element weg → null', run(el('svg', [], [el('use', [['href', '#icon']])])) === null);
check('use: staat niet in de allowlist', isAllowedElement('use') === false);

// <svg><foreignObject><script/></foreignObject><circle r="4"/></svg>
check(
  'foreignObject: weg, rest blijft',
  run(el('svg', [], [el('foreignObject', [], [el('script')]), el('circle', [['r', '4']])])) ===
    '<svg><circle r="4"></circle></svg>',
);

// <svg><rect style="background:url(https://evil)"/></svg>  → style eruit, rect blijft
check(
  'style-attribuut: weg, element blijft',
  run(el('svg', [], [el('rect', [['style', 'background:url(https://evil)'], ['width', '10']])])) ===
    '<svg><rect width="10"></rect></svg>',
);

// SMIL-omweg: <svg><animate attributeName="onload" to="alert(1)"/><path d="M0 0"/></svg>
check(
  'animate/set: SMIL-omweg weg',
  run(el('svg', [], [el('animate', [['attributeName', 'onload']]), el('set'), el('path', [['d', 'M0 0']])])) ===
    '<svg><path d="M0 0"></path></svg>',
);

// <svg><a href="javascript:alert(1)"><path d="M0 0"/></a></svg>  → hele <a> weg, dus ook zijn kind
check('a-element: weg inclusief kinderen → null', run(el('svg', [], [el('a', [['href', 'javascript:alert(1)']], [el('path', [['d', 'M0 0']])])])) === null);

// Attribuutnamen, hoofdletter- en prefix-varianten
check('ONLOAD in hoofdletters: geweigerd', isAllowedAttribute('ONLOAD') === false);
check('onclick: geweigerd', isAllowedAttribute('onclick') === false);
check('href: geweigerd', isAllowedAttribute('href') === false);
check('xlink:href: geweigerd', isAllowedAttribute('xlink:href') === false);
check('XLINK:HREF: geweigerd', isAllowedAttribute('XLINK:HREF') === false);
check('style: geweigerd', isAllowedAttribute('style') === false);
check('xml:base (prefix): geweigerd', isAllowedAttribute('xml:base') === false);
check('class (niet op de allowlist): geweigerd', isAllowedAttribute('class') === false);
check('viewBox: toegestaan', isAllowedAttribute('viewBox') === true);
check('stroke-width: toegestaan', isAllowedAttribute('stroke-width') === true);
check('xmlns: toegestaan', isAllowedAttribute('xmlns') === true);

// Attribuutwaarden
check('waarde: javascript: geweigerd', isSafeAttributeValue('javascript:alert(1)') === false);
check('waarde: javascript: met witruimte ertussen geweigerd', isSafeAttributeValue('java script :alert(1)') === false);
check('waarde: url(#verloop) toegestaan', isSafeAttributeValue('url(#verloop)') === true);
check('waarde: url(https://evil) geweigerd', isSafeAttributeValue('url(https://evil/x.svg)') === false);
check('waarde: url(data:...) geweigerd', isSafeAttributeValue('url(data:image/svg+xml;base64,AA)') === false);
check('waarde: gewone geometrie toegestaan', isSafeAttributeValue('M12 2 L2 22 h20 Z') === true);
check(
  'waarde: fill met externe url wordt gestript, element blijft',
  run(el('svg', [], [el('path', [['fill', 'url(https://evil/x)'], ['d', 'M0 0']])])) ===
    '<svg><path d="M0 0"></path></svg>',
);

// ── Legitiem icoon blijft intact ────────────────────────────────────────────

// Lucide-achtig: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="..."/></svg>
const lucide = el(
  'svg',
  [['xmlns', 'http://www.w3.org/2000/svg'], ['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round']],
  [el('path', [['d', 'M12 2 L2 22 h20 Z']]), el('circle', [['cx', '12'], ['cy', '14'], ['r', '3']])],
);
check(
  'lucide-achtig icoon blijft byte-voor-byte overeind',
  run(lucide) ===
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
      '<path d="M12 2 L2 22 h20 Z"></path><circle cx="12" cy="14" r="3"></circle></svg>',
);
check('currentColor overleeft (themering blijft werken)', (run(lucide) as string).includes('stroke="currentColor"'));

// Verloop met hoofdlettergevoelige namen: canonieke spelling terug, ongeacht invoer-casing.
check(
  'canonieke spelling: LINEARGRADIENT/VIEWBOX → linearGradient/viewBox',
  run(el('SVG', [['VIEWBOX', '0 0 8 8']], [
    el('defs', [], [el('LINEARGRADIENT', [['id', 'g'], ['gradientUnits', 'userSpaceOnUse']], [el('STOP', [['offset', '0'], ['stop-color', 'red']])])]),
    el('rect', [['width', '8'], ['height', '8'], ['fill', 'url(#g)']]),
  ])) ===
    '<svg viewBox="0 0 8 8"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="red"></stop></linearGradient></defs>' +
      '<rect width="8" height="8" fill="url(#g)"></rect></svg>',
);

// ── Tekst en escaping ───────────────────────────────────────────────────────

check('tekst wordt geëscaped in <title>', run(el('svg', [], [el('title', [], [txt('<script>alert(1)</script>')]), el('path', [['d', 'M0 0']])])) ===
  '<svg><title>&lt;script&gt;alert(1)&lt;/script&gt;</title><path d="M0 0"></path></svg>');
check('quote in attribuutwaarde wordt geëscaped',
  run(el('svg', [], [el('path', [['d', 'M0 0" onload="alert(1)']])])) ===
    '<svg><path d="M0 0&quot; onload=&quot;alert(1)"></path></svg>');
check('losse tekst buiten een tekstelement verdwijnt',
  run(el('svg', [], [txt('   '), el('path', [['d', 'M0 0']]), txt('rommel')])) === '<svg><path d="M0 0"></path></svg>');
check('alleen witruimte in de svg → niets zichtbaars → null', run(el('svg', [], [txt('   ')])) === null);

// ── Tekst-iconen (emoji) ────────────────────────────────────────────────────

check('emoji is een tekst-icoon', asTextIcon('🧩') === '🧩');
check('emoji met witruimte wordt getrimd', asTextIcon('  ⚙  ') === '⚙');
check('samengestelde emoji (ZWJ) blijft tekst', asTextIcon('👨‍👩‍👧') === '👨‍👩‍👧');
check('markup is geen tekst-icoon', asTextIcon('<svg></svg>') === null);
check('lange tekst is geen tekst-icoon', asTextIcon('dit is gewoon een zin') === null);
check('lege string is geen tekst-icoon', asTextIcon('   ') === null);

const emoji = sanitizeSvgIcon('🧩');
check('sanitizeSvgIcon: emoji → tekst-variant', emoji !== null && emoji.kind === 'text' && emoji.text === '🧩');
check('sanitizeSvgIcon: leeg/undefined → null', sanitizeSvgIcon(undefined) === null && sanitizeSvgIcon('') === null);

// ── Gedrag zonder DOMParser (deze omgeving) ─────────────────────────────────

const hasDomParser = typeof (globalThis as { DOMParser?: unknown }).DOMParser !== 'undefined';
check('deze omgeving heeft geen DOMParser (parse-stap dus niet gedekt)', hasDomParser === false);
check('sanitizeSvgIcon zonder DOMParser: markup → null i.p.v. crash',
  sanitizeSvgIcon('<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>') === null);
check('sanitizeSvgIcon zonder DOMParser: kwaadaardige markup → null',
  sanitizeSvgIcon('<svg onload="alert(1)"><img src=x onerror=alert(1)></svg>') === null);

// ── Element-allowlist, positief ─────────────────────────────────────────────

for (const tag of ['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'title', 'desc', 'linearGradient', 'radialGradient', 'stop', 'clipPath']) {
  check(`allowlist bevat <${tag}>`, isAllowedElement(tag) === true);
}
for (const tag of ['script', 'foreignObject', 'use', 'image', 'animate', 'set', 'a', 'iframe', 'style', 'div']) {
  check(`allowlist bevat <${tag}> NIET`, isAllowedElement(tag) === false);
}
check('losse tekstknoop blijft behouden door sanitizeIconNode', sanitizeIconNode(txt('hoi'))?.text === 'hoi');
check('lege tekstknoop verdwijnt', sanitizeIconNode(txt('')) === null);

if (failures > 0) {
  console.error(`TOTAAL: ${failures} afwijking(en)`);
  process.exitCode = 1;
} else {
  console.log('TOTAAL: alles groen');
}

import { NEN_NAMES } from './nen1414Names.js';
// NEN 1414 Symbol Library — Dutch standard for safety symbols on technical drawings
// PNG assets bundled in /assets/nen1414/ (converted TIF→PNG)
// Categories by prefix: Tb=Brandbeveiliging, Td=Deuren, Tn=Noodverlichting, Tr=Rook/warmteafvoer, Tv=Ventilatie, Tw=Water/sprinkler

// Import all PNG assets via Vite glob
const pngModules = import.meta.glob('/assets/nen1414/*.png', { eager: true, query: '?url', import: 'default' });

function getAssetUrl(id) {
  const key = `/assets/nen1414/${id}.png`;
  return pngModules[key] || '';
}

// Helper: wrap a raster image URL in an SVG <image> tag for stamp tool compatibility
// Uses absolute URL so it works when the SVG is loaded from a blob: context
function rasterSvg(id) {
  const url = getAssetUrl(id);
  if (!url) return '';
  // Vite inlines PNGs <4KB as data: URIs; larger ones become /assets/*.png paths.
  // blob: context can't resolve relative paths, so only prepend origin for root-relative URLs.
  const absoluteUrl = url.startsWith('/') ? window.location.origin + url : url;
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><image href="${absoluteUrl}" width="64" height="64"/></svg>`;
}

// Human-readable names for NEN 1414 symbols
const NAMES = NEN_NAMES;

// Build categories from prefix
const CATEGORY_META = {
  'Tb': { name: 'NL NEN 1414 — Brandbeveiliging', color: '#dc2626' },
  'Tbk': { name: 'NL NEN 1414 — Blussystemen', color: '#b91c1c' },
  'Td': { name: 'NL NEN 1414 — Deuren', color: '#92400e' },
  'Tn': { name: 'NL NEN 1414 — Noodverlichting', color: '#ca8a04' },
  'Tr': { name: 'NL NEN 1414 — Rook/Warmteafvoer', color: '#6b7280' },
  'Tv': { name: 'NL NEN 1414 — Ventilatie', color: '#059669' },
  'Tw': { name: 'NL NEN 1414 — Water/Sprinkler', color: '#2563eb' },
};

const ALL_IDS = Object.keys(NAMES);

function getPrefix(id) {
  // Tbk before Tb (longer prefix first)
  if (id.startsWith('Tbk')) return 'Tbk';
  if (id.startsWith('Tb')) return 'Tb';
  if (id.startsWith('Td')) return 'Td';
  if (id.startsWith('Tn')) return 'Tn';
  if (id.startsWith('Tr')) return 'Tr';
  if (id.startsWith('Tv')) return 'Tv';
  if (id.startsWith('Tw')) return 'Tw';
  return 'Tb'; // fallback
}

// Build categories
export const NEN1414_CATEGORIES = (() => {
  const catMap = new Map();
  for (const id of ALL_IDS) {
    const prefix = getPrefix(id);
    if (!catMap.has(prefix)) {
      const meta = CATEGORY_META[prefix] || { name: `NL NEN 1414 — ${prefix}`, color: '#666' };
      catMap.set(prefix, {
        id: `nen1414-${prefix.toLowerCase()}`,
        name: meta.name,
        industry: 'aec',
        country: 'nl',
        color: meta.color,
        icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1"/><text x="8" y="11" font-size="7" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle" font-family="sans-serif">N</text></svg>`,
        builtin: true,
        symbols: [],
      });
    }
    catMap.get(prefix).symbols.push({
      id: `nen1414-${id}`,
      name: NAMES[id] || id,
      svg: rasterSvg(id),
    });
  }
  return [...catMap.values()];
})();

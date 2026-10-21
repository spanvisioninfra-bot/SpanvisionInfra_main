/** Verify the language exposed by each tool and its bundled English resources. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = JSON.parse(fs.readFileSync(path.join(root, 'branding/brand.json'), 'utf8'));
const sources = {
  cad: ['SpanvisionCAD/src/i18n.rs', /pub const ALL: \[Language; 1\] = \[Language::EnUs\]/],
  cad2d: ['spanvision-2d-cad-workspace/index.html', /<html[^>]+lang=["']en(?:-[^"']+)?["']/],
  bim: ['vision-bim-validator/viewer/index.html', /<html[^>]+lang=["']en(?:-[^"']+)?["']/],
  pdf: ['spanvision-pdf-workspace/open-pdf-studio/js/i18n/config.js', /supportedLngs:\s*\[['"]en['"]\]/],
  ifc: ['ifc-view/apps/desktop/src/state/locale-store.ts', /return translations\.en\[key\]/],
  calc: ['calc-workspace/src/i18n/config.ts', /supportedLngs:\s*\[['"]en['"]\]/],
  planner: ['open-vision-studio/src/i18n/config.ts', /LANGUAGE_LABELS[^=]*=\s*\{\s*en:/],
  fem: ['fem-vision-studio/design-mockup/src/i18n/config.ts', /supportedLngs:\s*\[['"]en['"]\]/],
  frame: ['frame-vision-studio/ui/src/lib/i18n.js', /initialLocale:\s*['"]en['"]/],
  calculation: ['vision-calculation-studio/packages/desktop/src/i18n/config.ts', /supportedLngs:\s*\[['"]en['"]\]/],
  geo: ['spanvision-geptechniek-workspace/apps/desktop/src/i18n/config.ts', /supportedLngs:\s*\[['"]en['"]\]/],
  speech: ['spanvision-speech-workspace/src/lib/i18n.tsx', /availableLocales:\s*Locale\[\]\s*=\s*\[['"]en['"]\]/],
  stl: ['spanvision-stl-3d-map-workspace/web/index.html', /<html[^>]+lang=["']en(?:-[^"']+)?["']/],
  field: ['spanvision-field-workspace/src/i18n.ts', /supportedLngs:\s*\[['"]en['"]\]/],
  pointcloud: ['spanvision-pointcloud-workspace/index.html', /<html[^>]+lang=["']en(?:-[^"']+)?["']/],
  pile: ['spanvision-pile-plane-workspace/apps/pile-plan-studio/src/i18n/config.ts', /supportedLngs:\s*\[['"]en['"]\]/],
};
const dutch = /\b(?:opslaan|annuleren|verwijderen|toevoegen|instellingen|weergave|eigenschappen|berekenen|waarschuwingen|geselecteerd|wachtwoord|gebruiker|mislukt|naamloos|ongedaan|hieronder|hierboven|breedte|hoogte|lengte|geen|volgende|afdrukken|afmetingen|omschrijving|invoer|uitvoer|verbinding|plakken|kopi[eë]ren|knippen|bevestigen|ontbreekt|verplicht|aangemaakt|opgeslagen|tekeningen|kolommen)\b/i;
function englishFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? (['node_modules', 'dist', 'target', 'vendor', '.venv', 'build', 'tests', '__tests__'].includes(entry.name) ? [] : englishFiles(path.join(directory, entry.name)))
    : entry.name.endsWith('.json') && /[/\\]locales[/\\]en(?:-US)?(?:[/\\]|\.json$)/.test(path.join(directory, entry.name)) ? [path.join(directory, entry.name)] : []);
}
let checkedStrings = 0;
const violations = [];
function checkValue(value, file, key = '') {
  if (typeof value === 'string') {
    checkedStrings++;
    // Interpolation names and inline code are stable application identifiers.
    const display = value.replace(/\{\{[^}]*\}\}|`[^`]*`/g, '');
    if (dutch.test(display)) violations.push(`${path.relative(root, file)}: ${key}`);
  } else if (value && typeof value === 'object') for (const [name, child] of Object.entries(value)) checkValue(child, file, key ? `${key}.${name}` : name);
}
assert.equal(brand.language, 'en');
for (const module of brand.modules) {
  const [file, policy] = sources[module.id] || [];
  assert.ok(file && policy, `No English language check for ${module.id}`);
  assert.match(fs.readFileSync(path.join(root, file), 'utf8'), policy, `${module.label} must start in English`);
  const app = path.join(root, module.directory, module.frontendDirectory || '');
  const localeRoots = module.id === 'pdf' ? [path.join(app, 'js/i18n')] : [path.join(app, 'src')];
  for (const localeFile of localeRoots.flatMap(englishFiles)) checkValue(JSON.parse(fs.readFileSync(localeFile, 'utf8')), localeFile);
  console.log(`PASS ${module.label}: English startup policy`);
}
assert.deepEqual(violations, [], 'Dutch interface text remains in an English resource bundle');
console.log(`PASS ${brand.modules.length} tools; ${checkedStrings} English resource strings checked.`);

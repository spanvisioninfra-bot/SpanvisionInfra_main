import fs from 'node:fs';
import path from 'node:path';
import ts from '../calc-workspace/node_modules/typescript/lib/typescript.js';

const output = process.argv[2] || 'qa/deployment/output/ui-english-audit-2026-10-15';
const modules = JSON.parse(fs.readFileSync('branding/brand.json', 'utf8')).modules;
const dutchWords = /\b(opslaan|annuleren|verwijderen|toevoegen|instellingen|weergave|eigenschappen|berekening(?:en)?|berekenen|waarschuwing(?:en)?|ongeldig(?:e)?|bestanden|bestand|sluiten|geselecteerd(?:e)?|selecteer|opnieuw|wachtwoord|gebruiker(?:s)?|mislukt|geladen|laden|naamloos|ongedaan|ongedaan|hieronder|hierboven|klik|kies|voer|bekijk|breedte|hoogte|lengte|geen|nieuw(?:e)?|fout(?:melding)?|volgende|terug|afdrukken|afmetingen|omschrijving|aantal|invoer|uitvoer|verbinding|werkvlak|plakken|kopi[eë]ren|knippen|bevestigen|wordt|worden|heeft|hebt|zijn|niet|moet|moeten|ontbreekt|verplicht|alleen|volledig|voeg|verwijder|geef|schakel|gebruik|gebruikers|wilt|weten|ondersteund|ondersteunt|onbekend|beschikbaar|onderdelen|aangemaakt|opgeslagen|leeg|leegte|mogelijk|tekening|tekeningen|aanmaken|aangemaakt|afbreken|verplicht|voorwaarde|berekening|beton|hout|staal|dekking|stijfheid|frequentie|betonstaaf|staaf|knopen|hoofdstuk|hoofdstukken|beknopt|uitgebreid|profieldatabase|rekengrootheden|gereed|gereedschap|voltooid|koptekst|onderhoek|sparing|wand|muur|cirkel|trappen|overig|vergelijken|verschillen|oppervlak|overtreden|schuifkracht|schuifspanning|buiging|torsie|dwarskracht|verplaatsing|verbindingen|tijdelijk|voltooid|projecten|beheer|naam|beschrijving|kantoorgebouw|validatie|tekeninstellingen|voorkeuren|lettertype|cellen|bewerken|bewerkt|voorbeelden|voorvertoning|onder|boven|onderaan|bovenaan|huidige|huidig|grafiek|aantekeningen|notities|opmerking|informatie|aslijnen|vakken|wapening|deuren|ramen|niveau|verdieping|draaien|draaipunten|hulp|openen|verder|opmaak|oorsprong|doorgaan|stoppen|afronden|bibliotheek|venster|vensters|helptekst|bijwerken|vernieuwen|grootte|lettertype|bladzijde|pagina’s|verplaatsen|zoeken|zoekresultaten|zoeken|laden|geladen|gegevens|gegevensbron|gegevensbronnen|kaartlagen|balken|staven|tijdlijn|werkruimte|overzicht|verkennen|ongedaan|opmerkingen|gelukt|vereist|opvragen|ingeschakeld|uitgeschakeld|getoond|bewerken|bewerk|kolommen|kolomkop|begroting|offerte|totaalbedrag|toon|verberg|taalkeuze)\b/i;
const extraDutchWords = /\b(tonen|profiel|profielen|hartlijn|tagtekst|doorgetrokken|gestippeld|gestreept|aangepast|achtergrond|voorgrond|dikte|straal|hoek|rotatie|aansluiting|aansluitingen|horizontaal|verticaal|diagonaal|eenheid|eenheden|voorbeeld|voorinstelling|voorinstellingen|lijnen|lijnkleur|vulkleur|vulling|transparantie|koppeling|koppelingen|koppelen|ontkoppelen|richting|omkeren|omgekeerd|spiegelen|wissen|herstellen|hernoemen|herladen|hervatten|onderbreken|uitvoeren|samenvoegen|uitsnijden|uitschakelen|inschakelen|vergrendeld|ontgrendelen|vergrendelen|geldig|standaardwaarde|druk|trek|oplegging|opleggingen|materiaal|materialen|doorsnede|constructie|constructies|tijdstip|kalender|kalenders|dagelijks|maandelijks|wekelijks|jaarlijks|gisteren|vandaag|morgen|inclusief|exclusief|huidige|verwijzing|verwijzingen|afgelopen|herhaald|herhaling|aanwezig|opsomming|langzaam|bezig|succesvol|afronding|nauwkeurig|nauwkeurigheid|belastingen|belastinggevallen|belastingcombinaties|combinaties|snede|sneden|verwijderd|toegevoegd|gewijzigd|aangemeld|afgemeld|toegang|wacht|bezig|bewerking|bewerkingen|sneltoets|sneltoetsen|aanpassen|toepassen|vergroten|verkleinen|uitsnede|identiteit|identiteiten|bronvolgorde|buiten|binnen|dubbele|begint|leesteken|tekens|beschadigd|afgekapt|afsluiten|maten|afstanden|afstand|pagina|aantal|indeling|aflevering|plaatsing|verdiepingen|toelichting|oordeel|reden|bestandsgrootte|verwerken|verwerking|afmetingen|randen|rand|steunpunt|steunpunten|scharnier|scharnieren|stabiliteit|vervorming|spanningen|doorbuiging|buigmoment|oppervlakte|omtrek|waarde|waarden|opties|groeperen|groep|groepen|resultaten|bevestiging|wachten|binnenkort|knop|knoppen)\b/i;
const dutchGrammar = /\b(?:het|een|voor|naar|deze|zijn|alle|bericht|minimaal|maximaal|tenminste|verloopt|verliep|binnenkort|draairichting|dezelfde|elk|elke|daarom|zodat|anders|omdat|nooit|onmogelijk|samen|automatisch|handmatig|beschrijf|controleer|indien|welke)\b/i;
const dutch = { test: value => { const text = value.replace(/\{\{[^}]*\}\}/g, ''); return dutchWords.test(text) || extraDutchWords.test(text) || dutchGrammar.test(text); } };
const skip = new Set(['node_modules', 'target', 'dist', 'build', '.venv', 'vendor', 'tests', '__tests__', '__fixtures__', 'fixtures']);
function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? (skip.has(entry.name) ? [] : files(path.join(dir, entry.name))) : [path.join(dir, entry.name)]);
}
function roots(module) {
  if (module.id === 'cad') return ['SpanvisionCAD/src', 'SpanvisionCAD/web', 'SpanvisionCAD/site/locales/en-US.json'];
  if (module.id === 'pdf') return [module.directory + '/js', module.directory + '/index.html'];
  if (module.id === 'stl') return [module.directory + '/web', module.directory + '/app'];
  if (module.id === 'ifc') return [module.directory + '/apps/desktop/src'];
  if (module.id === 'bim') return [module.directory + '/viewer/src', module.directory + '/server'];
  if (module.id === 'fem') return [module.directory + '/design-mockup/src', module.directory + '/src/i18n'];
  if (module.id === 'calculation') return ['vision-calculation-studio/packages/desktop/src', 'vision-calculation-studio/packages/web/src', 'vision-calculation-studio/packages/core/src'];
  return [module.directory + '/' + (module.frontendDirectory ? module.frontendDirectory + '/' : '') + 'src'];
}
function walkValue(value, key, file, rows) {
  if (typeof value === 'string' && dutch.test(value)) rows.push({ file, line: 0, kind: 'english-resource', key, text: value });
  else if (value && typeof value === 'object') for (const [name, child] of Object.entries(value)) walkValue(child, key ? key + '.' + name : name, file, rows);
}
const result = {};
for (const module of [{ id: 'hub', directory: 'suite-hub' }, ...modules]) {
  const rows = [];
  for (const file of roots(module).flatMap(root => fs.existsSync(root) && fs.statSync(root).isFile() ? [root] : files(root))) {
    const normalized = file.replaceAll('\\', '/');
    if (!/\.(?:[cm]?jsx?|tsx?|svelte|html|py|rs|json)$/.test(file) || /(?:\.test\.|\.spec\.|\.d\.ts$)/.test(file)) continue;
    if (/\/i18n\/(?:nl|de|fr|es|it|pt|pl|ru|zh|ar|fa|tr|hi|ja|ko)\.(?:ts|json)$/.test(normalized) || normalized.endsWith('/src/i18n.rs')) continue;
    if (/\/locales\//.test(normalized) && !/\/locales\/en(?:-US)?(?:\/|\.json$)/.test(normalized)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.json')) {
      if (/\/locales\/en/.test(normalized)) { try { walkValue(JSON.parse(source), '', file, rows); } catch {} }
      continue;
    }
    if (/\.(py|rs|svelte|html)$/.test(file)) {
      for (const match of source.matchAll(/(?:"([^"\r\n]*(?:\\.[^"\r\n]*)*)"|'([^'\r\n]*(?:\\.[^'\r\n]*)*)'|>([^<>\n{}]+)<)/g)) {
        const value = match[1] ?? match[2] ?? match[3];
        const lineStart = source.lastIndexOf('\n', match.index) + 1;
        if (!dutch.test(value) || /^\s*(?:#|\/\/|\*|<!--)/.test(source.slice(lineStart, match.index))) continue;
        rows.push({ file, line: source.slice(0, match.index).split('\n').length, kind: 'literal', text: value.trim() });
      }
      continue;
    }
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node) {
      if (ts.isPropertyAssignment(node) && /^(nl|de|fr|es|it|pt|pl|ru|zh|ar|fa|tr|hi|ja|ko)$/.test(node.name.getText(parsed).replace(/['"]/g,''))) return;
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && dutch.test(node.text)) {
        const parent = node.parent;
        if (ts.isPropertyAssignment(parent) && parent.name === node) return;
        if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isImportSpecifier(parent) || ts.isLiteralTypeNode(parent)) return;
        if (ts.isJsxAttribute(parent) && !['title', 'placeholder', 'aria-label', 'alt', 'label'].includes(parent.name.text)) return;
        if (ts.isCallExpression(parent) && /(?:^|\.)t$/.test(parent.expression.getText(parsed)) && parent.arguments[0] === node) return;
        if (/^\.{1,2}\//.test(node.text) || /^(?:\.|#)[\s\S]*\{[\s\S]*\}/.test(node.text)) return;
        const fallback = ts.isCallExpression(parent) && /(?:^|\.)t{1,2}$/.test(parent.expression.getText(parsed)) && parent.arguments[0] !== node;
        let messageNode = node;
        while (messageNode.parent && (ts.isTemplateSpan(messageNode.parent) || ts.isTemplateExpression(messageNode.parent))) messageNode = messageNode.parent;
        const messageParent = messageNode.parent;
        const message = ts.isNewExpression(messageParent) && /Error$/.test(messageParent.expression.getText(parsed)) || ts.isCallExpression(messageParent) && /(?:setError|showToast|alert|confirm|prompt|notify|setStatus|setMessage|setWarning|setProgressText|invalid|fail|reject)$/.test(messageParent.expression.getText(parsed));
        let attributeAncestor = parent;
        for (let depth = 0; depth < 8 && attributeAncestor && !ts.isJsxAttribute(attributeAncestor) && !ts.isJsxElement(attributeAncestor); depth++) attributeAncestor = attributeAncestor.parent;
        if (attributeAncestor && ts.isJsxAttribute(attributeAncestor) && !['title', 'placeholder', 'aria-label', 'alt', 'label'].includes(attributeAncestor.name.text)) return;
        if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind)) return;
        let uiAncestor = parent;
        for(let depth=0;depth<4 && uiAncestor && !ts.isJsxExpression(uiAncestor) && !ts.isJsxAttribute(uiAncestor);depth++)uiAncestor=uiAncestor.parent;
        const jsxDisplay = uiAncestor && (ts.isJsxExpression(uiAncestor) || ts.isJsxAttribute(uiAncestor) && ['title','placeholder','aria-label','alt','label'].includes(uiAncestor.name.text));
        const shownArray = ts.isCallExpression(parent) && /(?:notes|warnings|messages|meldingen|issues|errors)\.push$/.test(parent.expression.getText(parsed));
        const display = fallback || message || jsxDisplay || shownArray || ts.isJsxText(node) || ts.isJsxAttribute(parent) || ts.isJsxExpression(parent)
          || ts.isPropertyAssignment(parent) && /^(label|name|title|description|hint|message|caption|placeholder|help|tooltip|defaultValue|text|tekst|melding|detail|reason|subject|content|explanation|note|warning|summary|error|problem|details)$/.test(parent.name.getText(parsed));
        if (!display && /^[a-z][a-z0-9_.:/-]*$/.test(node.text)) return;
        rows.push({ file, line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1, kind: display ? 'display' : 'literal', start:node.getStart(parsed), end:node.getEnd(), parent:parent.getText(parsed).slice(0,260), text: node.text.trim() });
      }
      ts.forEachChild(node, visit);
    }
    visit(parsed);
  }
  result[module.id] = rows;
}
fs.mkdirSync(output, {recursive:true});
fs.writeFileSync(path.join(output, 'source-audit.json'), JSON.stringify(result, null, 2));
for (const [id, rows] of Object.entries(result)) console.log(JSON.stringify({ id, count: rows.length, examples: rows.slice(0, 6).map(row => ({ file: row.file, line: row.line, kind: row.kind, text: row.text.slice(0, 170) })) }));

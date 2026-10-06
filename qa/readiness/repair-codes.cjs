const fs = require('fs');
const path = require('path');
const root = process.cwd();
function edit(file, pairs) {
  const p = path.join(root, file), before = fs.readFileSync(p, 'utf8');
  let after = before;
  for (const [a,b] of pairs) after = after.split(a).join(b);
  if (before !== after) fs.writeFileSync(p, after);
}
// Keep the currently supported chapter code. Historical Dutch unit/resource
// codes are independently required by native files and numerical fixtures.
for (const {file} of JSON.parse(fs.readFileSync('qa/readiness/calc-code-repairs.json','utf8'))) {
  if (file) edit(file, [['"hoofdstuk"','"chapter"']]);
}
for (const file of ['components/grid/WpCalcBottomPanel.tsx','services/importers/ifcxImporter.ts','services/importers/wpcalcImporter.ts']) {
  edit('calc-workspace/src/'+file, [['=== "V"','=== "B"'], ['!== "V"','!== "B"']]);
}
edit('calc-workspace/src/services/importers/tradxmlImporter.ts', [['c.tagName === "Heading"', "c.tagName === 'Kop'"]]);
edit('spanvision-pdf-workspace/open-pdf-studio/js/plattegrond/maatvoering.js', [["? \"or\" :", "? 'van' :"]]);
edit('spanvision-pdf-workspace/open-pdf-studio/js/symbols/catalog-opslagkeuze.js', [['? "file" :', "? 'bestand' :"]]);
edit('spanvision-pdf-workspace/open-pdf-studio/js/plattegrond/skill.js', [['{width ', '{breedte '], [', width,', ', breedte,'], ['; width standaard', '; breedte standaard']]);
edit('spanvision-pdf-workspace/open-pdf-studio/scripts/test-nen-ifc-map.mjs', [["/'([^']+)':\\s*'([^']*)'/g", '/[\'\"]([^\'\"]+)[\'\"]:\\s*[\'\"]([^\'\"]*)[\'\"]/g']]);
edit('spanvision-stl-3d-map-workspace/tests/test_workspace.py', [['Spanvision infra','Spanvision Infra']]);
edit('spanvision-pile-plane-workspace/apps/pile-plan-studio/src/productInfo.test.ts', [['Spanvision infra','Spanvision Infra']]);
edit('spanvision-geptechniek-workspace/apps/desktop/src/calc/modules/kalendering/compute.test.ts', [['/custom valblok/i','/custom drop hammer/i'], ['/beide zijdes/i','/both sides/i']]);

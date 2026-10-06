const fs = require('fs');
const dir = 'calc-workspace/src/test/';
function edit(file,pairs) {
  let s = fs.readFileSync(dir+file, 'utf8');
  for(const [a,b] of pairs) s = s.split(a).join(b);
  fs.writeFileSync(dir+file, s);
}
edit('bouw1PrintSummary.test.ts', [['Algemene bedrijfskosten','General overhead']]);
edit('printCleanViews.test.ts', [[">Subtotaal<", ">Subtotal<"], ['1.920,00','1,920.00'], ['400,00','400.00'], ['2\\.320,00','2,320\\.00'], ['Totaal excl\\. BTW','Total excl\\. VAT']]);
edit('reportOptions.test.ts', [['640,00','640.00']]);
// English-only is the requested product behavior, including old saved Dutch
// preferences. Keep the same report totals, structural checks and unit codes.
edit('reportLanguage.test.ts', [
  ['<html lang="nl">','<html lang="en">'], ['>Omschrijving</th>','>Description</th>'],
  ['>Hoeveelheid</th>','>Quantity</th>'], ['>Bedrag</th>','>Amount</th>'],
  ['>Subtotaal<','>Subtotal<'], ['Opdrachtgever:', 'Client:'],
  ['"Pagina " counter(page)', '"Page " counter(page)'],
  ['center">uur<', 'center">h<'], ['2.320,00','2,320.00'],
  ["expect(html).not.toContain('Description');", "expect(html).not.toContain('Omschrijving');"],
  ["expect(resolveReportLanguage()).toBe('nl');", "expect(resolveReportLanguage()).toBe('en');"],
  ["expect(html).toContain('Inschrijfstaat');", "expect(html).toContain('Tender schedule');"],
  ['>Eenheidsprijs</th>', '>Unit price</th>'],
  ["expect(nl).toContain('Algemene bedrijfskosten:');", "expect(nl).toContain('General overhead:');"],
  ["expect(nl).toContain('Totaalprijs incl. btw.:');", "expect(nl).toContain('Total price incl. VAT:');"],
  ["toBe('Aanneemsom excl. BTW')", "toBe('Contract sum excl. VAT')"],
  ["toBe('Totaal kolommen:')", "toBe('Column totals:')"],
  ["expect(nl['units.uur']).toBe('uur');", "expect(nl['units.uur']).toBe('h');"],
]);
// Avoid replacing negative Dutch-copy assertions in the existing English test.
let s = fs.readFileSync(dir+'reportLanguage.test.ts','utf8');
const marker = s.indexOf('it("rapporttaal \'nl\'');
if(marker >= 0) s = s.slice(0,marker)+s.slice(marker).replace("expect(html).toContain('Totaal excl. BTW');", "expect(html).toContain('Total excl. VAT');");
fs.writeFileSync(dir+'reportLanguage.test.ts',s);

import type { ParameterInfo } from './ifc';
import { naturalSort } from './value-sorter';

function csvCell(value: string | number): string {
  const text = String(value);
  // IFC values are untrusted spreadsheet input. Keep formulas as literal text.
  const safe = /^\s*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Export the selected parameter's complete groups, independent of viewport filters. */
export function createParameterCsv(name: string, parameter: ParameterInfo): string {
  const rows: (string | number)[][] = [['Parameter', 'Value', 'Express ID']];
  for (const value of [...parameter.values].sort(naturalSort)) {
    for (const id of parameter.objectIds.get(value) ?? []) rows.push([name, value, id]);
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

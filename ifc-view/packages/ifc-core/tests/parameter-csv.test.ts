import { describe, expect, it } from 'vitest';
import { createParameterCsv, sortParameters } from '../src';

describe('parameter export and discovery', () => {
  it('exports every element in natural group order with a UTF-8 BOM', () => {
    const csv = createParameterCsv('Mark', {
      values: new Set(['Phase 10', 'Phase 2']),
      objectIds: new Map([['Phase 10', [100]], ['Phase 2', [20, 21]]]),
    });
    expect(csv).toBe('\uFEFF"Parameter","Value","Express ID"\r\n"Mark","Phase 2","20"\r\n"Mark","Phase 2","21"\r\n"Mark","Phase 10","100"\r\n');
  });
  it('quotes CSV punctuation and makes spreadsheet formulas literal', () => {
    const csv = createParameterCsv('=DANGEROUS()', {
      values: new Set(['a,"b"\nc', '  @SUM(1)']),
      objectIds: new Map([['a,"b"\nc', [1]], ['  @SUM(1)', [2]]]),
    });
    expect(csv).toContain('"\'=DANGEROUS()"');
    expect(csv).toContain('"\'  @SUM(1)"');
    expect(csv).toContain('"a,""b""\nc"');
  });
  it('keeps single-group and large parameters available instead of silently excluding them', () => {
    const single = { values: new Set(['1']), objectIds: new Map([['1', [11]]]) };
    const many = { values: new Set(Array.from({ length: 100 }, (_, i) => String(i))), objectIds: new Map<string, number[]>() };
    expect(sortParameters(new Map([['Single phase', single], ['Mark', many], ['expressId', many]]))).toEqual([['Mark', many], ['Single phase', single]]);
  });
});

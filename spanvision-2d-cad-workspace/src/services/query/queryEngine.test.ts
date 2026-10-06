import { describe, expect, it } from 'vitest';
import { executeQuery } from './queryEngine';

const context = { shapes: [], drawings: [], pileTypes: [] };

describe('browser SQL distribution', () => {
  it('executes arithmetic and a real materialized geometry table', () => {
    const scalar = executeQuery('SELECT 2 + 3 AS [value]', context);
    expect(scalar.error).toBeUndefined();
    expect(scalar.rows).toEqual([{ value: 5 }]);
    const count = executeQuery('SELECT COUNT(*) AS [total] FROM shapes', context);
    expect(count.error).toBeUndefined();
    expect(count.rows).toEqual([{ total: 0 }]);
  });

  it('returns a query error and recovers for the next query', () => {
    expect(executeQuery('SELECT FROM', context).error).toBeTruthy();
    expect(executeQuery('SELECT COUNT(*) AS [total] FROM shapes', context).rows)
      .toEqual([{ total: 0 }]);
  });
});

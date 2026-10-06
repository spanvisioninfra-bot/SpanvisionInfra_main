import { describe, expect, it } from 'vitest';
import { parseDXF } from './dxfImport';

describe('DXF model-space geometry', () => {
  it('keeps TEXT and MTEXT heights in drawing units regardless of paper scale', () => {
    const shapes = parseDXF('0\nSECTION\n2\nENTITIES\n0\nTEXT\n10\n450\n20\n1050\n40\n40\n1\nDoor\n0\nMTEXT\n10\n0\n20\n-240\n40\n25\n1\n900 x 2100 mm\n0\nENDSEC\n0\nEOF', 'layer', 'drawing');
    expect(shapes).toHaveLength(2);
    expect(shapes[0]).toMatchObject({ type: 'text', fontSize: 40, isModelText: true, position: {x:450,y:-1050} });
    expect(shapes[1]).toMatchObject({ type: 'text', fontSize: 25, isModelText: true });
  });
  it('rejects malformed coordinates before a document can receive them', () => {
    for (const coordinate of ['NaN', 'Infinity', 'broken']) {
      expect(() => parseDXF(`0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n${coordinate}\n20\n0\n11\n900\n21\n2100\n0\nENDSEC\n0\nEOF`, 'layer', 'drawing')).toThrow(/invalid or non-finite geometry/);
    }
  });
});

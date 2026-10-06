import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXYZ } from './XYZParser.ts';

const parse = (text: string) => parseXYZ(new TextEncoder().encode(text).buffer);
test('comments and a header without point data produce a useful error', () => {
  assert.throws(() => parse('  # survey\n// notes\n'), /empty/);
  assert.throws(() => parse('X Y Z\n'), /no point coordinates/);
});
test('all bounds include an outlier between the former sampled rows', () => {
  const rows = Array.from({length: 20_001}, () => '0 0 0');
  rows[1] = '100 200 -300';
  const result = parse(rows.join('\n'));
  assert.equal(result.header.maxX, 100);
  assert.equal(result.header.maxY, 200);
  assert.equal(result.header.minZ, -300);
  assert.deepEqual(result.center, [50, 100, -150]);
});
test('non-finite coordinates are rejected and colour/intensity buffers stay finite', () => {
  assert.throws(() => parse('Infinity 0 0\nNaN 1 1'), /no finite/);
  const result = parse('X,Y,Z,I,R,G,B\n1,2,3,NaN,-20,500,NaN\nInfinity,0,0,1,1,1,1');
  assert.equal(result.header.numberOfPoints, 1);
  assert.equal(result.colors[0], 0);
  assert.equal(result.colors[1], 1);
  assert.ok([...result.positions, ...result.colors, ...result.intensities].every(Number.isFinite));
});

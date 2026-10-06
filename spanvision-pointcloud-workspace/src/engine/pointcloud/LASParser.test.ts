import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLAS } from './LASParser.ts';

function fixture(minor = 2, format = 2, count = 2): ArrayBuffer {
  const headerSize = minor === 4 ? 375 : 227;
  const recordSize = format === 7 ? 36 : 26;
  const buffer = new ArrayBuffer(headerSize + count * recordSize);
  const view = new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode('LASF'));
  view.setUint8(24, 1); view.setUint8(25, minor);
  view.setUint16(94, headerSize, true); view.setUint32(96, headerSize, true);
  view.setUint8(104, format); view.setUint16(105, recordSize, true);
  view.setUint32(107, minor === 4 ? 0 : count, true);
  if (minor === 4) view.setBigUint64(247, BigInt(count), true);
  for (const offset of [131, 139, 147]) view.setFloat64(offset, 0.01, true);
  view.setFloat64(155, 1000, true); view.setFloat64(163, 2000, true); view.setFloat64(171, 3000, true);
  for (let i = 0; i < Math.min(count, 2); i++) {
    const offset = headerSize + i * recordSize;
    for (const [axis, value] of (i ? [500, 900, -100] : [100, 200, 300]).entries()) view.setInt32(offset + axis * 4, value, true);
    view.setUint16(offset + 12, 32768, true);
    view.setUint8(offset + (format >= 6 ? 16 : 15), i ? 6 : format >= 6 ? 42 : 130);
    const rgb = offset + (format >= 6 ? 30 : 20);
    view.setUint16(rgb, 65535, true); view.setUint16(rgb + 2, 1, true); view.setUint16(rgb + 4, 256, true);
  }
  return buffer;
}

test('LAS applies scales/offsets, actual full bounds, 16-bit RGB and legacy classification flags', () => {
  const parsed = parseLAS(fixture());
  assert.deepEqual(parsed.center, [1003, 2005.5, 3001]);
  assert.deepEqual([...parsed.positions], [-2, 2, 3.5, 2, -2, -3.5]);
  assert.deepEqual([...parsed.classifications], [2, 6]);
  assert.equal(parsed.colors[0], 1);
  assert.ok(Math.abs(parsed.colors[1] - 1 / 65535) < 1e-8);
  assert.ok(Math.abs(parsed.colors[2] - 256 / 65535) < 1e-8);
});

test('LAS 1.4 reads extended counts and retains the full modern classification byte', () => {
  const buffer = fixture(4, 7);
  new DataView(buffer).setUint32(107, 1, true); // Extended count remains authoritative.
  const parsed = parseLAS(buffer);
  assert.equal(parsed.header.numberOfPoints, 2);
  assert.deepEqual([...parsed.classifications], [42, 6]);
});

test('LAS bounds include source points omitted by the rendering budget', () => {
  const buffer = fixture(2, 2, 1_000_001);
  const view = new DataView(buffer);
  view.setInt32(227 + 26, 100_000, true);
  const parsed = parseLAS(buffer);
  assert.equal(parsed.positions.length / 3, 500_001);
  assert.equal(parsed.header.maxX, 2000);
  assert.equal(parsed.center[0], 1500);
});

test('LAS rejects truncated headers/records, unsafe counts, bad offsets, scales and formats', () => {
  assert.throws(() => parseLAS(new ArrayBuffer(10)), /header/);
  const good = fixture();
  assert.throws(() => parseLAS(good.slice(0, good.byteLength - 1)), /Truncated LAS point/);
  for (const [modify, expected] of [
    [(v: DataView) => v.setUint32(96, 100, true), /offsets/],
    [(v: DataView) => v.setFloat64(131, NaN, true), /scale/],
    [(v: DataView) => v.setFloat64(139, 0, true), /scale/],
    [(v: DataView) => v.setUint16(105, 10, true), /record length/],
    [(v: DataView) => v.setUint8(104, 128), /Compressed/],
    [(v: DataView) => v.setUint8(25, 5), /version/],
    [(v: DataView) => v.setUint32(107, 0, true), /no points/],
  ] as const) {
    const bad = good.slice(0); modify(new DataView(bad)); assert.throws(() => parseLAS(bad), expected);
  }
  const badCount = fixture(4, 7);
  new DataView(badCount).setBigUint64(247, 2n ** 60n, true);
  assert.throws(() => parseLAS(badCount), /invalid point count/);
});

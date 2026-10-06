import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePTS } from './PTSParser.ts';
import { parsePTX } from './PTXParser.ts';

const bytes = (value: string) => new TextEncoder().encode(value).buffer;
const ptx = (points: string[], matrix = ['1 0 0 0','0 1 0 0','0 0 1 0','0 0 0 1']) =>
  ['1',String(points.length),'0 0 0','1 0 0','0 1 0','0 0 1',...matrix,...points].join('\n');

test('PTS rejects empty data and keeps all finite bounds and normalized buffers', () => {
  assert.throws(() => parsePTS(bytes('5\n')), /no point coordinates/);
  assert.throws(() => parsePTS(bytes('Infinity 0 0\nNaN 1 1')), /no finite/);
  const rows = Array.from({length:20_001}, () => '0 0 0 0 255 0 0');
  rows[1] = '100 200 -300 -2048 1 500 NaN';
  const result = parsePTS(bytes(rows.join('\n')));
  assert.deepEqual(result.center,[50,100,-150]);
  assert.equal(result.intensities[0],0.5);
  assert.equal(result.intensities[1],0);
  assert.equal(result.colors[4],1);
  assert.ok([...result.positions,...result.colors,...result.intensities].every(Number.isFinite));
});

test('PTX applies Cyclone row-vector rotation and translation and byte RGB values', () => {
  const result = parsePTX(bytes(ptx(['1 2 3 0.5 1 128 255','2 2 3 1 0 0 0'],
    ['0 1 0 0','-1 0 0 0','0 0 1 0','10 20 30 1'])));
  assert.equal(result.header.minX,8);
  assert.equal(result.header.minY,21);
  assert.equal(result.header.maxY,22);
  assert.equal(result.header.minZ,33);
  assert.deepEqual(result.center,[8,21.5,33]);
  assert.ok(Math.abs(result.colors[0] - 1/255) < 1e-8);
  assert.equal(result.intensities[0],0.5);
  assert.ok([...result.positions,...result.colors,...result.intensities].every(Number.isFinite));
});

test('PTX rejects malformed dimensions, truncated headers/data, and invalid point sets', () => {
  assert.throws(() => parsePTX(bytes('1')), /Truncated/);
  assert.throws(() => parsePTX(bytes(ptx(['1 2 3 1']).replace(/^1\n/,'1.5\n'))), /dimensions/);
  assert.throws(() => parsePTX(bytes(ptx(['1 2 3 1']).replace(/^1\n1\n/,'2\n2\n'))), /truncated/);
  assert.throws(() => parsePTX(bytes(ptx(['0 0 0 0','Infinity 0 0 0']))), /no finite/);
  const result = parsePTX(bytes(ptx(['1 2 3 NaN NaN -2 500'])));
  assert.ok([...result.positions,...result.colors,...result.intensities].every(Number.isFinite));
  assert.equal(result.colors[2],1);
});

test('PTX bounds include an outlier beyond the former 5000-row sample', () => {
  const points=Array.from({length:10_001},()=> '1 2 3 1'); points[1]='101 202 -303 1';
  const result=parsePTX(bytes(ptx(points)));
  assert.equal(result.header.maxX,101); assert.equal(result.header.minZ,-303);
});

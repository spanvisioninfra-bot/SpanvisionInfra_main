import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePLY } from './PLYParser.ts';
import { parseXYZ } from './XYZParser.ts';
import { parsePTS } from './PTSParser.ts';
import { exportToPLY, exportToXYZ, exportToPTS, exportToCSV } from './PointcloudExporter.ts';
import { exportToOBJ } from './MeshExporter.ts';
import { parseOBJ } from './OBJParser.ts';

const bytes = (text: string) => new TextEncoder().encode(text).buffer;
const ascii = (rows: string[], extra = '') => bytes([
  'ply', 'format ascii 1.0', 'comment end_header is text inside a comment',
  `element vertex ${rows.length}`, 'property double x', 'property double y', 'property double z',
  'property uchar red', 'property uchar green', 'property uchar blue',
  'property float intensity', 'property uchar classification', extra, 'end_header', ...rows,
].filter(Boolean).join('\n') + '\n');
const worldPoints = (parsed: ReturnType<typeof parsePLY>) => Array.from({ length: parsed.positions.length / 3 }, (_, i) => [
  parsed.center[0] + parsed.positions[i * 3],
  parsed.center[1] - parsed.positions[i * 3 + 2],
  parsed.center[2] + parsed.positions[i * 3 + 1],
]);

test('PLY uses declared RGB types, classification and complete bounds', () => {
  const rows = Array.from({ length: 20_001 }, () => '100 200 300 1 128 255 0.5 2');
  rows[1] = '200 400 -300 255 0 0 1 6';
  const parsed = parsePLY(ascii(rows));
  assert.deepEqual(parsed.center, [150, 300, 0]);
  assert.equal(parsed.header.maxY, 400);
  assert.equal(parsed.header.minZ, -300);
  assert.ok(Math.abs(parsed.colors[0] - 1 / 255) < 1e-8);
  assert.equal(parsed.colors[2], 1);
  assert.deepEqual([...parsed.classifications.slice(0, 2)], [2, 6]);
  assert.equal(parsed.hasClassification, true);
  assert.ok([...parsed.positions, ...parsed.colors, ...parsed.intensities].every(Number.isFinite));
});

test('PLY little and big endian scalar properties follow declared byte order', () => {
  for (const little of [true, false]) {
    const header = bytes(`ply\nformat binary_${little ? 'little' : 'big'}_endian 1.0\nelement vertex 1\nproperty double z\nproperty float x\nproperty double y\nproperty ushort red\nproperty ushort green\nproperty ushort blue\nend_header\n`);
    const buffer = new ArrayBuffer(header.byteLength + 26);
    new Uint8Array(buffer).set(new Uint8Array(header));
    const view = new DataView(buffer, header.byteLength);
    view.setFloat64(0, -3.5, little); view.setFloat32(8, 1.25, little); view.setFloat64(12, 2.5, little);
    view.setUint16(20, 65535, little); view.setUint16(22, 32768, little); view.setUint16(24, 1, little);
    const parsed = parsePLY(buffer);
    assert.deepEqual(worldPoints(parsed), [[1.25, 2.5, -3.5]]);
    assert.equal(parsed.colors[0], 1);
    assert.ok(Math.abs(parsed.colors[2] - 1 / 65535) < 1e-8);
  }
});

test('PLY triangle export/reimport retains world coordinates, color, classes and topology', async () => {
  const source = ascii([
    '1000000.125 2000000.25 30 1 128 255 0.25 2',
    '1000000.625 2000000.25 31 255 0 0 0.5 6',
    '1000000.125 2000000.75 30.5 0 255 0 0.75 9',
  ], 'element face 1\nproperty list uchar int vertex_indices');
  const parsed = parsePLY(bytes(new TextDecoder().decode(source) + '3 0 1 2\n'));
  assert.deepEqual([...parsed.indices!], [0, 1, 2]);
  for (const binary of [false, true]) {
    const reopened = parsePLY(await exportToPLY(parsed, binary).arrayBuffer());
    assert.deepEqual(worldPoints(reopened), worldPoints(parsed));
    assert.deepEqual([...reopened.classifications], [2, 6, 9]);
    assert.deepEqual([...reopened.colors], [...parsed.colors]);
    assert.deepEqual([...reopened.indices!], [0, 1, 2]);
  }
  const obj = exportToOBJ(parsed.positions, parsed.indices!, undefined, parsed.colors, parsed.center);
  const reopened = parseOBJ(bytes(obj));
  assert.deepEqual(worldPoints(reopened), worldPoints(parsed));
  assert.deepEqual([...reopened.indices!], [0, 1, 2]);
});

test('text exports restore source axes and survey offsets; PTS preserves signed intensity', () => {
  const parsed = parsePLY(ascii(['100 200 300 1 128 255 0.5 2', '102 204 306 255 0 0 0.25 6']));
  const expected = [[100, 200, 300], [102, 204, 306]];
  assert.deepEqual(worldPoints(parseXYZ(bytes(exportToXYZ(parsed)))), expected);
  const pts = parsePTS(bytes(exportToPTS(parsed)));
  assert.deepEqual(worldPoints(pts), expected);
  assert.deepEqual([...pts.intensities], [0.5, 0.25]);
  assert.deepEqual(exportToCSV(parsed).trim().split('\n').slice(1).map(row => row.split(',').slice(0, 3).map(Number)), expected);
  const csv = parseXYZ(bytes(exportToCSV(parsed)));
  assert.deepEqual(worldPoints(csv), expected);
  assert.deepEqual([...csv.colors], [...parsed.colors]);
  assert.deepEqual([...csv.intensities], [...parsed.intensities]);
  assert.deepEqual([...csv.classifications], [2, 6]);
});

test('PLY rejects missing data, invalid coordinates, unsupported types and bad face indices', () => {
  const valid = ascii(['1 2 3 1 128 255 0.5 2']);
  assert.throws(() => parsePLY(valid.slice(0, valid.byteLength - 10)), /Truncated/);
  assert.throws(() => parsePLY(ascii(['Infinity 2 3 1 128 255 0.5 2'])), /non-finite/);
  const text = new TextDecoder().decode(valid);
  assert.throws(() => parsePLY(bytes(text.replace('property double x', 'property mystery x'))), /property type/);
  const faceHeader = 'element face 1\nproperty list uchar int vertex_indices';
  const triangle = new TextDecoder().decode(ascii(['1 2 3 1 128 255 0.5 2'], faceHeader)) + '3 0 0 9\n';
  assert.throws(() => parsePLY(bytes(triangle)), /invalid vertex index/);
  assert.throws(() => parsePLY(bytes(triangle.replace('3 0 0 9', '4 0 0 0 0'))), /triangle/);
  assert.throws(() => parsePLY(bytes('ply\nformat ascii 1.0\ncomment end_header\n')), /header/);
});

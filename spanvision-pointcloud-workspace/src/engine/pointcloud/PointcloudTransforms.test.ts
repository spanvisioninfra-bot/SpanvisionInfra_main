import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXYZ } from './XYZParser.ts';
import { parsePLY } from './PLYParser.ts';
import { exportToPLY } from './PointcloudExporter.ts';
import { setBrowserPointcloud, getBrowserPointcloud, removeBrowserPointcloud } from './BrowserPointcloudStore.ts';
import { translatePointcloud, scalePointcloud, thinPointcloud } from './PointcloudTransforms.ts';
import { surveyToViewer, viewerToSurvey, rotateSurveyPositions } from './SurveyCoordinates.ts';

const parse = (text: string) => parseXYZ(new TextEncoder().encode(text).buffer);
const world = (parsed: ReturnType<typeof parse>) => Array.from({ length: parsed.positions.length / 3 }, (_, i) => [
  parsed.center[0] + parsed.positions[3 * i], parsed.center[1] - parsed.positions[3 * i + 2], parsed.center[2] + parsed.positions[3 * i + 1],
]);

test('native octree chunk axes match browser geometry and camera coordinates invert the rotation', () => {
  const parsed = parse('100 200 300\n102 204 306');
  const local = new Float32Array([.5, 1, 1.5]);
  const chunkCenter: [number, number, number] = [99.5, 199, 298.5];
  rotateSurveyPositions(local);
  const offset = surveyToViewer(chunkCenter, parsed.center);
  const viewer: [number, number, number] = [local[0] + offset[0], local[1] + offset[1], local[2] + offset[2]];
  assert.deepEqual(viewer, [...parsed.positions.slice(0, 3)]);
  assert.deepEqual(viewerToSurvey(viewer, parsed.center), [100, 200, 300]);
});

test('survey XYZ translation and independent-axis scaling survive PLY export/reimport', async () => {
  const id = 'transform-reference';
  setBrowserPointcloud(id, parse('100 200 300\n102 204 306'));
  try {
    scalePointcloud(id, 2, 3, 4);
    const parsed = translatePointcloud(id, 5, 10, 15)!;
    assert.deepEqual(world(parsed), [[104, 206, 306], [108, 218, 330]]);
    assert.deepEqual([parsed.header.minX, parsed.header.maxY, parsed.header.maxZ], [104, 218, 330]);
    const exported = parsePLY(await exportToPLY(parsed, false).arrayBuffer());
    assert.deepEqual(world(exported), [[104, 206, 306], [108, 218, 330]]);
  } finally { removeBrowserPointcloud(id); }
});

test('invalid or overflowing edits leave existing positions and metadata intact', () => {
  const id = 'invalid-edit';
  const parsed = parse('1 2 3\n4 5 6');
  setBrowserPointcloud(id, parsed);
  const positions = [...parsed.positions], header = { ...parsed.header };
  try {
    assert.throws(() => translatePointcloud(id, NaN, 0, 0), /finite/);
    assert.throws(() => translatePointcloud(id, 1e40, 0, 0), /finite range/);
    assert.throws(() => scalePointcloud(id, 1, 0, 1), /non-zero/);
    assert.throws(() => scalePointcloud(id, Infinity, 1, 1), /finite/);
    assert.throws(() => thinPointcloud(id, NaN), /percentage/);
    assert.deepEqual([...parsed.positions], positions);
    assert.deepEqual(parsed.header, header);
  } finally { removeBrowserPointcloud(id); }
});

test('thinning preserves corresponding RGB, intensity, classification and export count', async () => {
  const id = 'thin-attributes';
  const rows = Array.from({ length: 10 }, (_, i) => `${i},${i * 2},${i * 3},${i * 20},${i * 10},${i * 5},${i / 10},${i}`);
  setBrowserPointcloud(id, parse('x,y,z,r,g,b,intensity,classification\n' + rows.join('\n')));
  try {
    const parsed = thinPointcloud(id, 30)!;
    assert.equal(parsed.positions.length / 3, 3);
    assert.equal(parsed.header.numberOfPoints, 3);
    const output = parsePLY(await exportToPLY(parsed, false).arrayBuffer());
    for (let i = 0; i < 3; i++) {
      const index = world(output)[i][0];
      assert.deepEqual(world(output)[i], [index, index * 2, index * 3]);
      assert.equal(output.classifications[i], index);
      assert.ok(Math.abs(output.colors[3 * i] - index * 20 / 255) < 1e-6);
      assert.ok(Math.abs(output.intensities[i] - index / 10) < 1e-6);
    }
  } finally { removeBrowserPointcloud(id); }
});

test('mesh thinning rejects invalid topology and a reflected scale retains winding', () => {
  const id = 'mesh-edit';
  const parsed = parse('0 0 0\n1 0 0\n0 1 0');
  parsed.indices = new Uint32Array([0, 1, 2]);
  setBrowserPointcloud(id, parsed);
  try {
    assert.throws(() => thinPointcloud(id, 50), /mesh vertices/);
    assert.equal(getBrowserPointcloud(id), parsed);
    assert.deepEqual([...parsed.indices], [0, 1, 2]);
    scalePointcloud(id, -1, 1, 1);
    assert.deepEqual([...parsed.indices], [0, 2, 1]);
  } finally { removeBrowserPointcloud(id); }
});

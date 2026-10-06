/**
 * Browser-side XYZ/TXT point cloud parser.
 *
 * Supports common text formats:
 *   X Y Z
 *   X Y Z R G B
 *   X Y Z I
 *   X Y Z I R G B
 *   X,Y,Z (comma-separated)
 */

import type { ParsedPointcloud, LASHeader } from './LASParser';

export function parseXYZ(buffer: ArrayBuffer): ParsedPointcloud {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split(/\r?\n/).map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  if (lines.length === 0) throw new Error('XYZ file is empty');

  // Skip comment lines at the start
  let startLine = 0;
  while (startLine < lines.length && (lines[startLine].startsWith('#') || lines[startLine].startsWith('//'))) {
    startLine++;
  }

  // Detect delimiter (space, comma, tab, semicolon)
  const sampleLine = lines[startLine].trim();
  const delimiter = sampleLine.includes(',') ? /[,\s]+/ :
                    sampleLine.includes(';') ? /[;\s]+/ :
                    sampleLine.includes('\t') ? /\t+/ : /\s+/;

  const sampleParts = sampleLine.split(delimiter);
  let numCols = sampleParts.length;
  let columnNames: string[] = [];

  // Try to detect if first row is a header
  if (isNaN(parseFloat(sampleParts[0]))) {
    columnNames = sampleParts.map(name => name.toLowerCase());
    startLine++;
    if (startLine < lines.length) numCols = lines[startLine].split(delimiter).length;
  }
  if (startLine === lines.length) throw new Error('XYZ file contains no point coordinates');

  const column = (...names: string[]) => columnNames.findIndex(name => names.includes(name));
  const namedCoordinates = ['x', 'y', 'z'].every(name => column(name) >= 0);
  const xIdx = namedCoordinates ? column('x') : 0;
  const yIdx = namedCoordinates ? column('y') : 1;
  const zIdx = namedCoordinates ? column('z') : 2;
  const intensityIdx = namedCoordinates ? column('i', 'intensity', 'intensity_normalized') : (numCols === 4 || numCols >= 7 ? 3 : -1);
  const defaultColorIdx = intensityIdx >= 0 ? 4 : 3;
  const rIdx = namedCoordinates ? column('r', 'red', 'red_uint8', 'red_normalized') : (numCols >= 6 ? defaultColorIdx : -1);
  const gIdx = namedCoordinates ? column('g', 'green', 'green_uint8', 'green_normalized') : (numCols >= 6 ? defaultColorIdx + 1 : -1);
  const bIdx = namedCoordinates ? column('b', 'blue', 'blue_uint8', 'blue_normalized') : (numCols >= 6 ? defaultColorIdx + 2 : -1);
  const classificationIdx = namedCoordinates ? column('classification', 'class') : -1;
  const hasIntensity = intensityIdx >= 0;
  const hasColor = [rIdx, gIdx, bIdx].every(index => index >= 0);

  const maxPoints = 1_000_000;
  const totalLines = lines.length - startLine;
  const stride = totalLines > maxPoints ? Math.ceil(totalLines / maxPoints) : 1;
  const estimatedCount = Math.ceil(totalLines / stride);

  const positions = new Float32Array(estimatedCount * 3);
  const colors = new Float32Array(estimatedCount * 3);
  const intensities = new Float32Array(estimatedCount);
  const classifications = new Float32Array(estimatedCount);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let maxColor = 0, maxIntensity = 0;

  // Bounds must cover every point, including outliers between sampled rows.
  for (let i = startLine; i < lines.length; i++) {
    const parts = lines[i].trim().split(delimiter);
    if (parts.length < 3) continue;
    const x = parseFloat(parts[xIdx]);
    const y = parseFloat(parts[yIdx]);
    const z = parseFloat(parts[zIdx]);
    if (![x, y, z].every(Number.isFinite)) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    if (hasColor) for (const index of [rIdx, gIdx, bIdx]) {
      const value = Number(parts[index]);
      if (Number.isFinite(value)) maxColor = Math.max(maxColor, value);
    }
    if (hasIntensity && Number.isFinite(Number(parts[intensityIdx]))) maxIntensity = Math.max(maxIntensity, Number(parts[intensityIdx]));
  }
  if (!Number.isFinite(minX)) throw new Error('XYZ file contains no finite point coordinates');

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  // Named CSV RGB fields use byte channels; explicit normalized fields use 0..1.
  const colorScale = namedCoordinates
    ? (columnNames[rIdx]?.endsWith('_normalized') ? 1 : 255)
    : (maxColor > 1 ? 255 : 1);
  const intensityScale = maxIntensity > 1 && columnNames[intensityIdx] !== 'intensity_normalized' ? 255 : 1;

  let outIdx = 0;

  for (let i = startLine; i < lines.length; i += stride) {
    const parts = lines[i].trim().split(delimiter);
    if (parts.length < 3) continue;

    const x = parseFloat(parts[xIdx]);
    const y = parseFloat(parts[yIdx]);
    const z = parseFloat(parts[zIdx]);
    if (![x, y, z].every(Number.isFinite)) continue;

    positions[outIdx * 3] = x - cx;
    positions[outIdx * 3 + 1] = z - cz;
    positions[outIdx * 3 + 2] = -(y - cy);

    if (hasIntensity) {
      const intensity = parseFloat(parts[intensityIdx]);
      intensities[outIdx] = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity / intensityScale)) : 0;
    }

    if (hasColor) {
      const r = parseFloat(parts[rIdx]);
      const g = parseFloat(parts[gIdx]);
      const b = parseFloat(parts[bIdx]);
      const channel = (v: number) => Number.isFinite(v) ? Math.max(0, Math.min(1, v / colorScale)) : 0.8;
      colors[outIdx * 3] = channel(r);
      colors[outIdx * 3 + 1] = channel(g);
      colors[outIdx * 3 + 2] = channel(b);
    } else {
      colors[outIdx * 3] = 0.8;
      colors[outIdx * 3 + 1] = 0.8;
      colors[outIdx * 3 + 2] = 0.8;
    }
    if (classificationIdx >= 0) {
      const code = Number(parts[classificationIdx]);
      classifications[outIdx] = Number.isInteger(code) && code >= 0 && code <= 255 ? code : 0;
    }

    outIdx++;
  }

  const header: LASHeader = {
    signature: 'XYZ',
    versionMajor: 0, versionMinor: 0,
    headerSize: 0, offsetToPointData: 0,
    pointDataFormat: 0, pointDataRecordLength: 0,
    numberOfPoints: outIdx,
    scaleX: 1, scaleY: 1, scaleZ: 1,
    offsetX: 0, offsetY: 0, offsetZ: 0,
    minX, minY, minZ, maxX, maxY, maxZ,
  };

  return {
    header,
    positions: positions.slice(0, outIdx * 3),
    colors: colors.slice(0, outIdx * 3),
    intensities: intensities.slice(0, outIdx),
    classifications: classifications.slice(0, outIdx),
    center: [cx, cy, cz],
    hasColor,
    hasIntensity,
    hasClassification: classificationIdx >= 0,
  };
}

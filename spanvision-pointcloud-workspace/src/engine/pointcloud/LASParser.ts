/**
 * Browser-side LAS file parser.
 *
 * Reads uncompressed LAS files (1.0–1.4) from an ArrayBuffer and extracts
 * positions, colors, intensities, and classifications.
 *
 * Compressed files use the separate laz-perf WASM parser.
 */

export interface LASHeader {
  signature: string;
  versionMajor: number;
  versionMinor: number;
  headerSize: number;
  offsetToPointData: number;
  pointDataFormat: number;
  pointDataRecordLength: number;
  numberOfPoints: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface ParsedPointcloud {
  header: LASHeader;
  /** Float32 XYZ positions relative to bounds center */
  positions: Float32Array;
  /** Float32 RGB colors normalized 0–1 (or white if no color) */
  colors: Float32Array;
  /** Float32 intensities normalized 0–1 */
  intensities: Float32Array;
  /** Float32 classification codes */
  classifications: Float32Array;
  /** Center of bounds [x, y, z] for world offset */
  center: [number, number, number];
  hasColor: boolean;
  hasIntensity: boolean;
  hasClassification: boolean;
  /** Optional triangle face indices (for mesh formats like OBJ) */
  indices?: Uint32Array;
}

/** Point formats that include RGB color data */
export const FORMATS_WITH_RGB = new Set([2, 3, 5, 7, 8, 10]);

/** RGB offset within point record for each format */
export function getRGBOffset(format: number): number {
  switch (format) {
    case 2: return 20;   // Format 0 (20 bytes) + RGB
    case 3: return 28;   // Format 1 (28 bytes) + RGB
    case 5: return 28;   // Format 1 (28 bytes) + RGB (via VLR)
    case 7: return 30;   // Format 6 (30 bytes) + RGB
    case 8: return 30;   // Format 6 (30 bytes) + RGB + NIR
    case 10: return 30;  // Format 6 (30 bytes) + RGB + NIR + Wave
    default: return -1;
  }
}

/** Classification byte offset within point record */
export function getClassificationOffset(format: number): number {
  // Formats 0–5: classification at byte 15
  // Formats 6–10: classification at byte 16
  return format >= 6 ? 16 : 15;
}

export function parseLAS(buffer: ArrayBuffer): ParsedPointcloud {
  if (buffer.byteLength < 227) throw new Error('Truncated LAS header');
  const view = new DataView(buffer);

  // Validate signature
  const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (sig !== 'LASF') {
    throw new Error(`Invalid LAS file: expected "LASF" signature, got "${sig}"`);
  }

  const versionMajor = view.getUint8(24);
  const versionMinor = view.getUint8(25);
  if (versionMajor !== 1 || versionMinor > 4) throw new Error('Unsupported LAS version; expected LAS 1.0–1.4');
  const headerSize = view.getUint16(94, true);
  const offsetToPointData = view.getUint32(96, true);
  const pointDataFormat = view.getUint8(104);
  const pointDataRecordLength = view.getUint16(105, true);
  const legacyPointCount = view.getUint32(107, true);
  const minimumHeader = versionMinor === 4 ? 375 : versionMinor === 3 ? 235 : 227;
  if (headerSize < minimumHeader || headerSize > buffer.byteLength || offsetToPointData < headerSize || offsetToPointData > buffer.byteLength) throw new Error('Invalid or truncated LAS header offsets');
  if (pointDataFormat & 0xc0) throw new Error('Compressed LAS data must be imported through the LAZ parser');
  const minimumRecordLengths = [20, 28, 26, 34, 57, 63, 30, 36, 38, 59, 67];
  const maximumFormat = versionMinor === 4 ? 10 : versionMinor === 3 ? 5 : versionMinor === 2 ? 3 : 1;
  if (pointDataFormat > maximumFormat || pointDataRecordLength < minimumRecordLengths[pointDataFormat]) throw new Error('Unsupported LAS point format or invalid record length');

  // LAS 1.4 has 64-bit point count at offset 247
  let numberOfPoints = legacyPointCount;
  if (versionMinor === 4) {
    // Read as two 32-bit values (JS doesn't handle uint64 well)
    const lo = view.getUint32(247, true);
    const hi = view.getUint32(251, true);
    const extendedCount = hi * 0x100000000 + lo;
    if (extendedCount > 0) numberOfPoints = extendedCount;
  }
  if (!Number.isSafeInteger(numberOfPoints) || numberOfPoints <= 0) throw new Error('LAS file contains no points or an invalid point count');
  const dataEnd = offsetToPointData + numberOfPoints * pointDataRecordLength;
  if (!Number.isSafeInteger(dataEnd) || dataEnd > buffer.byteLength) throw new Error('Truncated LAS point data');

  // Scale & offset (doubles at fixed positions)
  const scaleX = view.getFloat64(131, true);
  const scaleY = view.getFloat64(139, true);
  const scaleZ = view.getFloat64(147, true);
  const offsetX = view.getFloat64(155, true);
  const offsetY = view.getFloat64(163, true);
  const offsetZ = view.getFloat64(171, true);
  if (![scaleX, scaleY, scaleZ, offsetX, offsetY, offsetZ].every(Number.isFinite) || [scaleX, scaleY, scaleZ].some(scale => scale <= 0)) throw new Error('Invalid LAS scale or coordinate offset');

  // Bounds
  let maxX = -Infinity, minX = Infinity, maxY = -Infinity, minY = Infinity, maxZ = -Infinity, minZ = Infinity;
  let maxColor = 0;
  // Bounds cover all source points, including those omitted by the render budget.
  for (let i = 0; i < numberOfPoints; i++) {
    const offset = offsetToPointData + i * pointDataRecordLength;
    const x = view.getInt32(offset, true) * scaleX + offsetX;
    const y = view.getInt32(offset + 4, true) * scaleY + offsetY;
    const z = view.getInt32(offset + 8, true) * scaleZ + offsetZ;
    if (![x, y, z].every(Number.isFinite)) throw new Error('LAS contains non-finite coordinates');
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    const rgb = getRGBOffset(pointDataFormat);
    if (rgb >= 0) for (const channel of [0, 2, 4]) maxColor = Math.max(maxColor, view.getUint16(offset + rgb + channel, true));
  }

  const header: LASHeader = {
    signature: sig,
    versionMajor, versionMinor,
    headerSize, offsetToPointData,
    pointDataFormat, pointDataRecordLength,
    numberOfPoints,
    scaleX, scaleY, scaleZ,
    offsetX, offsetY, offsetZ,
    minX, minY, minZ,
    maxX, maxY, maxZ,
  };

  // Center of bounds for coordinate offset
  const cx = minX / 2 + maxX / 2;
  const cy = minY / 2 + maxY / 2;
  const cz = minZ / 2 + maxZ / 2;

  // Limit points for browser performance
  const maxPoints = 1_000_000;
  const stride = numberOfPoints > maxPoints ? Math.ceil(numberOfPoints / maxPoints) : 1;
  const actualCount = Math.ceil(numberOfPoints / stride);

  const positions = new Float32Array(actualCount * 3);
  const colors = new Float32Array(actualCount * 3);
  const intensities = new Float32Array(actualCount);
  const classifications = new Float32Array(actualCount);

  const hasColor = FORMATS_WITH_RGB.has(pointDataFormat);
  const rgbOffset = getRGBOffset(pointDataFormat);
  const classOffset = getClassificationOffset(pointDataFormat);

  let outIdx = 0;

  for (let i = 0; i < numberOfPoints; i += stride) {
    const offset = offsetToPointData + i * pointDataRecordLength;

    // Ensure we don't read past buffer
    if (offset + pointDataRecordLength > buffer.byteLength) break;

    // XYZ as int32, then apply scale + offset
    const rawX = view.getInt32(offset, true);
    const rawY = view.getInt32(offset + 4, true);
    const rawZ = view.getInt32(offset + 8, true);

    const x = rawX * scaleX + offsetX - cx;
    const y = rawY * scaleY + offsetY - cy;
    const z = rawZ * scaleZ + offsetZ - cz;

    positions[outIdx * 3] = x;
    positions[outIdx * 3 + 1] = z; // Z-up to Y-up conversion
    positions[outIdx * 3 + 2] = -y;

    // Intensity at byte 12 (uint16)
    const intensity = view.getUint16(offset + 12, true);
    intensities[outIdx] = intensity / 65535;

    // Classification
    const classification = view.getUint8(offset + classOffset);
    // LAS 1.1–1.3 legacy records pack synthetic/key-point/withheld flags into this byte.
    classifications[outIdx] = pointDataFormat < 6 && versionMinor > 0 ? classification & 0x1f : classification;

    // RGB color
    if (hasColor && rgbOffset >= 0) {
      // RGB values are uint16 in LAS (0–65535)
      const r = view.getUint16(offset + rgbOffset, true);
      const g = view.getUint16(offset + rgbOffset + 2, true);
      const b = view.getUint16(offset + rgbOffset + 4, true);
      maxColor = Math.max(maxColor, r, g, b);
      colors[outIdx * 3] = r;
      colors[outIdx * 3 + 1] = g;
      colors[outIdx * 3 + 2] = b;
    } else {
      // No color data — use white
      colors[outIdx * 3] = 0.8;
      colors[outIdx * 3 + 1] = 0.8;
      colors[outIdx * 3 + 2] = 0.8;
    }

    outIdx++;
  }
  // Compatibility for files whose producer stored byte RGB in the uint16 fields.
  // Choose one scale for the cloud; channel-by-channel scaling corrupts dark colors.
  if (hasColor) {
    const divisor = maxColor <= 255 ? 255 : 65535;
    for (let i = 0; i < colors.length; i++) colors[i] /= divisor;
  }
  if (!positions.every(Number.isFinite)) throw new Error('LAS coordinate range exceeds the renderer limits');

  // Trim arrays if we read fewer points than expected
  const finalPositions = outIdx < actualCount ? positions.slice(0, outIdx * 3) : positions;
  const finalColors = outIdx < actualCount ? colors.slice(0, outIdx * 3) : colors;
  const finalIntensities = outIdx < actualCount ? intensities.slice(0, outIdx) : intensities;
  const finalClassifications = outIdx < actualCount ? classifications.slice(0, outIdx) : classifications;

  return {
    header,
    positions: finalPositions,
    colors: finalColors,
    intensities: finalIntensities,
    classifications: finalClassifications,
    center: [cx, cy, cz],
    hasColor,
    hasIntensity: true,
    hasClassification: true,
  };
}

/**
 * Browser-side LAZ file parser using laz-perf WASM.
 *
 * Decompresses LAZ files and extracts point data the same way as LASParser.
 */

import type { ParsedPointcloud, LASHeader } from './LASParser';
import { FORMATS_WITH_RGB, getRGBOffset, getClassificationOffset } from './LASParser';

export async function parseLAZ(buffer: ArrayBuffer): Promise<ParsedPointcloud> {
  if (buffer.byteLength < 227) throw new Error('Truncated LAZ header');
  // Dynamically import laz-perf
  const { create } = await import('laz-perf');
  const wasmUrl = new URL(`${import.meta.env.BASE_URL}laz-perf.wasm`, self.location.href).href;
  const lp = await create({ locateFile: (file: string) => file.endsWith('.wasm') ? wasmUrl : file });

  const view = new DataView(buffer);

  // Validate signature
  const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (sig !== 'LASF') {
    throw new Error(`Invalid LAZ file: expected "LASF" signature, got "${sig}"`);
  }

  // Read header (same as LAS)
  const versionMajor = view.getUint8(24);
  const versionMinor = view.getUint8(25);
  const headerSize = view.getUint16(94, true);
  const offsetToPointData = view.getUint32(96, true);
  const pointDataFormat = view.getUint8(104) & 0x3f;
  const pointDataRecordLength = view.getUint16(105, true);
  const legacyPointCount = view.getUint32(107, true);
  const minimumHeader = versionMinor === 4 ? 375 : versionMinor === 3 ? 235 : 227;
  if (versionMajor !== 1 || versionMinor > 4 || headerSize < minimumHeader || headerSize > buffer.byteLength || offsetToPointData < headerSize || offsetToPointData > buffer.byteLength) throw new Error('Invalid or unsupported LAZ header');

  let numberOfPoints = legacyPointCount;
  if (versionMinor === 4) {
    const lo = view.getUint32(247, true);
    const hi = view.getUint32(251, true);
    const extendedCount = hi * 0x100000000 + lo;
    if (extendedCount > 0) numberOfPoints = extendedCount;
  }
  if (!Number.isSafeInteger(numberOfPoints) || numberOfPoints <= 0) throw new Error('Invalid LAZ point count');

  const scaleX = view.getFloat64(131, true);
  const scaleY = view.getFloat64(139, true);
  const scaleZ = view.getFloat64(147, true);
  const offsetX = view.getFloat64(155, true);
  const offsetY = view.getFloat64(163, true);
  const offsetZ = view.getFloat64(171, true);
  if (![scaleX, scaleY, scaleZ, offsetX, offsetY, offsetZ].every(Number.isFinite) || [scaleX, scaleY, scaleZ].some(scale => scale <= 0)) throw new Error('Invalid LAZ scale or coordinate offset');

  let maxX = -Infinity, minX = Infinity, maxY = -Infinity, minY = Infinity, maxZ = -Infinity, minZ = Infinity;

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

  // Use laz-perf to decompress
  const filePtr = lp._malloc(buffer.byteLength);
  const fileData = new Uint8Array(buffer);
  lp.HEAPU8.set(fileData, filePtr);

  const laszip = new lp.LASZip();
  let pointPtr = 0;
  try {
    laszip.open(filePtr, buffer.byteLength);

    const lazPointCount = laszip.getCount();
    const lazPointFormat = laszip.getPointFormat();
    const lazPointLength = laszip.getPointLength();

    // Use the LAZ decompressed count if available
    const totalPoints = lazPointCount > 0 ? lazPointCount : numberOfPoints;
    if (!Number.isSafeInteger(totalPoints) || totalPoints <= 0) throw new Error('Invalid decompressed LAZ point count');

    // Limit points for browser performance
    const maxPoints = 1_000_000;
    const stride = totalPoints > maxPoints ? Math.ceil(totalPoints / maxPoints) : 1;
    const actualCount = Math.ceil(totalPoints / stride);

    const positions = new Float32Array(actualCount * 3);
    const world = new Float64Array(actualCount * 3);
    const colors = new Float32Array(actualCount * 3);
    const intensities = new Float32Array(actualCount);
    const classifications = new Float32Array(actualCount);

    // The actual point format might differ from header if LAZ rewrites it
    const actualFormat = lazPointFormat >= 0 ? (lazPointFormat <= 10 ? lazPointFormat : pointDataFormat) : pointDataFormat;
    const minimumRecordLengths = [20, 28, 26, 34, 57, 63, 30, 36, 38, 59, 67];
    if (actualFormat < 0 || actualFormat > 10 || lazPointLength < minimumRecordLengths[actualFormat]) throw new Error('Invalid decompressed LAZ point format');
    const hasColor = FORMATS_WITH_RGB.has(actualFormat);
    const rgbOffset = getRGBOffset(actualFormat);
    const classOffset = getClassificationOffset(actualFormat);

    // Allocate buffer for one decompressed point
    pointPtr = lp._malloc(lazPointLength);
    let pointBuf = new DataView(lp.HEAPU8.buffer, pointPtr, lazPointLength);

    let outIdx = 0;
    let maxColor = 0;

    for (let i = 0; i < totalPoints; i++) {
      laszip.getPoint(pointPtr);

      // Decoder initialization can grow WASM memory and detach the previous buffer.
      if (pointBuf.buffer !== lp.HEAPU8.buffer) {
        pointBuf = new DataView(lp.HEAPU8.buffer, pointPtr, lazPointLength);
      }

      const rawX = pointBuf.getInt32(0, true);
      const rawY = pointBuf.getInt32(4, true);
      const rawZ = pointBuf.getInt32(8, true);

      const x = rawX * scaleX + offsetX;
      const y = rawY * scaleY + offsetY;
      const z = rawZ * scaleZ + offsetZ;
      if (![x, y, z].every(Number.isFinite)) throw new Error('LAZ contains non-finite coordinates');
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      if (hasColor) for (const channel of [0, 2, 4]) maxColor = Math.max(maxColor, pointBuf.getUint16(rgbOffset + channel, true));
      if (i % stride !== 0) continue;
      world.set([x, y, z], outIdx * 3);

      const intensity = pointBuf.getUint16(12, true);
      intensities[outIdx] = intensity / 65535;

      if (classOffset < lazPointLength) {
        const classification = pointBuf.getUint8(classOffset);
        classifications[outIdx] = actualFormat < 6 && versionMinor > 0 ? classification & 0x1f : classification;
      }

      if (hasColor && rgbOffset >= 0 && rgbOffset + 6 <= lazPointLength) {
        const r = pointBuf.getUint16(rgbOffset, true);
        const g = pointBuf.getUint16(rgbOffset + 2, true);
        const b = pointBuf.getUint16(rgbOffset + 4, true);
        colors[outIdx * 3] = r;
        colors[outIdx * 3 + 1] = g;
        colors[outIdx * 3 + 2] = b;
      } else {
        colors[outIdx * 3] = 0.8;
        colors[outIdx * 3 + 1] = 0.8;
        colors[outIdx * 3 + 2] = 0.8;
      }

      outIdx++;
    }

    const cx = minX / 2 + maxX / 2, cy = minY / 2 + maxY / 2, cz = minZ / 2 + maxZ / 2;
    for (let i = 0; i < outIdx; i++) {
      positions[i * 3] = world[i * 3] - cx;
      positions[i * 3 + 1] = world[i * 3 + 2] - cz;
      positions[i * 3 + 2] = -(world[i * 3 + 1] - cy);
    }
    if (!positions.every(Number.isFinite)) throw new Error('LAZ coordinate range exceeds the renderer limits');
    if (hasColor) {
      const divisor = maxColor <= 255 ? 255 : 65535;
      for (let i = 0; i < colors.length; i++) colors[i] /= divisor;
    }
    Object.assign(header, { minX, minY, minZ, maxX, maxY, maxZ, numberOfPoints: totalPoints });

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
  } finally {
    laszip.delete();
    if (pointPtr) lp._free(pointPtr);
    lp._free(filePtr);
  }
}

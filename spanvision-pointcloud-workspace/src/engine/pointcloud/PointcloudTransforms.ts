/**
 * Pointcloud Transform Operations
 *
 * Pure functions for translating, scaling, and thinning pointcloud data.
 * Operates on ParsedPointcloud data in the BrowserPointcloudStore.
 */

import { getBrowserPointcloud, setBrowserPointcloud } from './BrowserPointcloudStore.ts';
import type { ParsedPointcloud } from './LASParser';

/**
 * Translate in source survey X/Y/Z axes, mapped to the viewer's Y-up axes.
 */
export function translatePointcloud(pcId: string, dx: number, dy: number, dz: number): ParsedPointcloud | null {
  const parsed = getBrowserPointcloud(pcId);
  if (!parsed) return null;
  if (![dx, dy, dz].every(Number.isFinite)) throw new Error('Translation must contain finite X, Y and Z distances');
  replacePositions(parsed, (x, y, z) => [x + dx, y + dz, z - dy]);
  return parsed;
}

/**
 * Scale all points around the centroid by (sx, sy, sz). Mutates positions in-place.
 */
export function scalePointcloud(pcId: string, sx: number, sy: number, sz: number): ParsedPointcloud | null {
  const parsed = getBrowserPointcloud(pcId);
  if (!parsed) return null;
  if (![sx, sy, sz].every(value => Number.isFinite(value) && value !== 0)) {
    throw new Error('Scale factors must be finite and non-zero');
  }

  const pos = parsed.positions;
  const count = pos.length / 3;

  // Compute centroid
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < count; i++) {
    cx += pos[i * 3];
    cy += pos[i * 3 + 1];
    cz += pos[i * 3 + 2];
  }
  cx /= count;
  cy /= count;
  cz /= count;

  // Source Z maps to viewer Y; source Y maps to negative viewer Z.
  replacePositions(parsed, (x, y, z) => [cx + (x - cx) * sx, cy + (y - cy) * sz, cz + (z - cz) * sy]);
  if (sx * sy * sz < 0 && parsed.indices) {
    for (let i = 0; i < parsed.indices.length; i += 3) {
      [parsed.indices[i + 1], parsed.indices[i + 2]] = [parsed.indices[i + 2], parsed.indices[i + 1]];
    }
  }

  return parsed;
}

/**
 * Thin the pointcloud to keep only `percentage`% of points via random sampling.
 * Creates new arrays and updates the store entry.
 */
export function thinPointcloud(pcId: string, percentage: number): ParsedPointcloud | null {
  const parsed = getBrowserPointcloud(pcId);
  if (!parsed) return null;

  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) throw new Error('Keep percentage must be greater than zero and at most 100');
  if (parsed.indices?.length) throw new Error('Thinning requires a point cloud. It cannot remove mesh vertices while preserving its faces.');
  const oldCount = parsed.positions.length / 3;
  const keepCount = Math.max(1, Math.round(oldCount * percentage / 100));

  if (keepCount >= oldCount) return parsed;

  // Fisher-Yates partial shuffle to select random indices
  const indices = new Uint32Array(oldCount);
  for (let i = 0; i < oldCount; i++) indices[i] = i;
  for (let i = 0; i < keepCount; i++) {
    const j = i + Math.floor(Math.random() * (oldCount - i));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  // Sort kept indices for cache-friendly access
  const kept = Array.from(indices.subarray(0, keepCount)).sort((a, b) => a - b);

  const newPositions = new Float32Array(keepCount * 3);
  const newColors = new Float32Array(keepCount * 3);
  const newIntensities = new Float32Array(keepCount);
  const newClassifications = new Float32Array(keepCount);

  for (let w = 0; w < keepCount; w++) {
    const src = kept[w];
    newPositions[w * 3] = parsed.positions[src * 3];
    newPositions[w * 3 + 1] = parsed.positions[src * 3 + 1];
    newPositions[w * 3 + 2] = parsed.positions[src * 3 + 2];
    newColors[w * 3] = parsed.colors[src * 3];
    newColors[w * 3 + 1] = parsed.colors[src * 3 + 1];
    newColors[w * 3 + 2] = parsed.colors[src * 3 + 2];
    newIntensities[w] = parsed.intensities[src];
    newClassifications[w] = parsed.classifications[src];
  }

  const thinned: ParsedPointcloud = {
    ...parsed,
    header: { ...parsed.header },
    positions: newPositions,
    colors: newColors,
    intensities: newIntensities,
    classifications: newClassifications,
  };
  updateBounds(thinned);
  setBrowserPointcloud(pcId, thinned);
  return thinned;
}

function replacePositions(parsed: ParsedPointcloud, transform: (x: number, y: number, z: number) => [number, number, number]): void {
  const result = new Float32Array(parsed.positions.length);
  for (let i = 0; i < result.length; i += 3) {
    result.set(transform(parsed.positions[i], parsed.positions[i + 1], parsed.positions[i + 2]), i);
    if (![result[i], result[i + 1], result[i + 2]].every(Number.isFinite)) throw new Error('The transformed coordinates exceed the supported finite range');
  }
  parsed.positions = result;
  updateBounds(parsed);
}

function updateBounds(parsed: ParsedPointcloud): void {
  const h = parsed.header;
  h.minX = h.minY = h.minZ = Infinity;
  h.maxX = h.maxY = h.maxZ = -Infinity;
  for (let i = 0; i < parsed.positions.length; i += 3) {
    const x = parsed.center[0] + parsed.positions[i];
    const y = parsed.center[1] - parsed.positions[i + 2];
    const z = parsed.center[2] + parsed.positions[i + 1];
    h.minX = Math.min(h.minX, x); h.maxX = Math.max(h.maxX, x);
    h.minY = Math.min(h.minY, y); h.maxY = Math.max(h.maxY, y);
    h.minZ = Math.min(h.minZ, z); h.maxZ = Math.max(h.maxZ, z);
  }
  h.numberOfPoints = parsed.positions.length / 3;
}

/**
 * Pointcloud Exporter — Export pointcloud data to multiple formats.
 *
 * Supports PLY (ASCII/binary), XYZ, PTS, and CSV export formats.
 * Each function takes a ParsedPointcloud and returns a Blob or string.
 */

import type { ParsedPointcloud } from './LASParser';

/** Undo the renderer's centering and Z-up to Y-up rotation before writing survey data. */
function surveyPosition(parsed: ParsedPointcloud, index: number): [number, number, number] {
  const point: [number, number, number] = [
    parsed.center[0] + parsed.positions[index * 3],
    parsed.center[1] - parsed.positions[index * 3 + 2],
    parsed.center[2] + parsed.positions[index * 3 + 1],
  ];
  if (!point.every(Number.isFinite)) throw new Error('Cannot export non-finite point coordinates');
  return point;
}

// ============================================================================
// PLY Export
// ============================================================================

/**
 * Export a pointcloud (and optional mesh) to PLY format.
 *
 * @param parsed - The parsed pointcloud data
 * @param binary - If true, use binary little-endian format (default: true)
 * @returns Blob containing the PLY file
 */
export function exportToPLY(parsed: ParsedPointcloud, binary = true): Blob {
  const numVerts = parsed.positions.length / 3;
  const hasFaces = !!(parsed.indices && parsed.indices.length > 0);
  const numFaces = hasFaces ? parsed.indices!.length / 3 : 0;

  // Build header
  const headerLines = [
    'ply',
    binary ? 'format binary_little_endian 1.0' : 'format ascii 1.0',
    'comment Exported from Pointcloud Workspace',
    `element vertex ${numVerts}`,
    'property double x',
    'property double y',
    'property double z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'property float intensity',
    'property uchar classification',
  ];

  if (hasFaces) {
    headerLines.push(`element face ${numFaces}`);
    headerLines.push('property list uchar int vertex_indices');
  }

  headerLines.push('end_header');
  const headerStr = headerLines.join('\n') + '\n';

  if (!binary) {
    // ASCII format
    const lines: string[] = [headerStr.trimEnd()];

    for (let i = 0; i < numVerts; i++) {
      const [x, y, z] = surveyPosition(parsed, i);
      const r = Math.round(parsed.colors[i * 3] * 255);
      const g = Math.round(parsed.colors[i * 3 + 1] * 255);
      const b = Math.round(parsed.colors[i * 3 + 2] * 255);
      const intensity = parsed.intensities[i];
      const classification = Math.round(parsed.classifications[i]);

      lines.push(`${x} ${y} ${z} ${r} ${g} ${b} ${intensity} ${classification}`);
    }

    if (hasFaces) {
      const indices = parsed.indices!;
      for (let i = 0; i < numFaces; i++) {
        const a = indices[i * 3];
        const b = indices[i * 3 + 1];
        const c = indices[i * 3 + 2];
        lines.push(`3 ${a} ${b} ${c}`);
      }
    }

    return new Blob([lines.join('\n') + '\n'], { type: 'application/octet-stream' });
  }

  // Binary little-endian format
  const headerBytes = new TextEncoder().encode(headerStr);

  // Double survey coordinates retain small distances at large geographic offsets.
  // Each vertex: 3 doubles (24) + RGB (3) + intensity (4) + classification (1).
  const vertexSize = 32;
  // Each face: 1 uchar (count=3) + 3 ints (12) = 13 bytes
  const faceSize = 13;

  const dataSize = numVerts * vertexSize + numFaces * faceSize;
  const buffer = new ArrayBuffer(headerBytes.length + dataSize);
  const uint8 = new Uint8Array(buffer);
  uint8.set(headerBytes, 0);

  const view = new DataView(buffer);
  let offset = headerBytes.length;

  for (let i = 0; i < numVerts; i++) {
    const [x, y, z] = surveyPosition(parsed, i);
    view.setFloat64(offset, x, true);
    view.setFloat64(offset + 8, y, true);
    view.setFloat64(offset + 16, z, true);
    // Color (3 x uint8)
    uint8[offset + 24] = Math.round(parsed.colors[i * 3] * 255);
    uint8[offset + 25] = Math.round(parsed.colors[i * 3 + 1] * 255);
    uint8[offset + 26] = Math.round(parsed.colors[i * 3 + 2] * 255);
    // Intensity (float32 LE)
    view.setFloat32(offset + 27, parsed.intensities[i], true);
    // Classification (uint8)
    uint8[offset + 31] = Math.round(parsed.classifications[i]);
    offset += vertexSize;
  }

  if (hasFaces) {
    const indices = parsed.indices!;
    for (let i = 0; i < numFaces; i++) {
      uint8[offset] = 3; // vertex count per face
      view.setInt32(offset + 1, indices[i * 3], true);
      view.setInt32(offset + 5, indices[i * 3 + 1], true);
      view.setInt32(offset + 9, indices[i * 3 + 2], true);
      offset += faceSize;
    }
  }

  return new Blob([buffer], { type: 'application/octet-stream' });
}

// ============================================================================
// XYZ Export
// ============================================================================

/**
 * Export a pointcloud to XYZ text format.
 * Format: X Y Z R G B (one point per line, colors as 0-255 integers)
 *
 * @param parsed - The parsed pointcloud data
 * @returns XYZ file content as a string
 */
export function exportToXYZ(parsed: ParsedPointcloud): string {
  const numVerts = parsed.positions.length / 3;
  const lines: string[] = [];

  for (let i = 0; i < numVerts; i++) {
    const [x, y, z] = surveyPosition(parsed, i);
    const r = Math.round(parsed.colors[i * 3] * 255);
    const g = Math.round(parsed.colors[i * 3 + 1] * 255);
    const b = Math.round(parsed.colors[i * 3 + 2] * 255);

    lines.push(`${x} ${y} ${z} ${r} ${g} ${b}`);
  }

  return lines.join('\n') + '\n';
}

// ============================================================================
// PTS Export (Leica format)
// ============================================================================

/**
 * Export a pointcloud to PTS (Leica) text format.
 * First line: point count
 * Format: X Y Z intensity R G B (one point per line)
 *
 * @param parsed - The parsed pointcloud data
 * @returns PTS file content as a string
 */
export function exportToPTS(parsed: ParsedPointcloud): string {
  const numVerts = parsed.positions.length / 3;
  const lines: string[] = [String(numVerts)];

  for (let i = 0; i < numVerts; i++) {
    const [x, y, z] = surveyPosition(parsed, i);
    // Leica PTS stores signed intensity; parsing maps -2048..2047 to 0..1.
    const intensity = Math.min(2047, Math.max(-2048, Math.round(parsed.intensities[i] * 4096 - 2048)));
    const r = Math.round(parsed.colors[i * 3] * 255);
    const g = Math.round(parsed.colors[i * 3 + 1] * 255);
    const b = Math.round(parsed.colors[i * 3 + 2] * 255);

    lines.push(`${x} ${y} ${z} ${intensity} ${r} ${g} ${b}`);
  }

  return lines.join('\n') + '\n';
}

// ============================================================================
// CSV Export
// ============================================================================

/**
 * Export a pointcloud to CSV format.
 * Header: x,y,z,r,g,b,intensity,classification
 *
 * @param parsed - The parsed pointcloud data
 * @returns CSV file content as a string
 */
export function exportToCSV(parsed: ParsedPointcloud): string {
  const numVerts = parsed.positions.length / 3;
  const lines: string[] = ['x,y,z,r,g,b,intensity,classification'];

  for (let i = 0; i < numVerts; i++) {
    const [x, y, z] = surveyPosition(parsed, i);
    const r = Math.round(parsed.colors[i * 3] * 255);
    const g = Math.round(parsed.colors[i * 3 + 1] * 255);
    const b = Math.round(parsed.colors[i * 3 + 2] * 255);
    const intensity = parsed.intensities[i];
    const classification = Math.round(parsed.classifications[i]);

    lines.push(`${x},${y},${z},${r},${g},${b},${intensity},${classification}`);
  }

  return lines.join('\n') + '\n';
}

// ============================================================================
// Download Helper
// ============================================================================

/**
 * Trigger a browser download of a file.
 *
 * @param content - The file content as a Blob or string
 * @param filename - Download filename (e.g., "pointcloud.ply")
 */
export function downloadFile(content: Blob | string, filename: string): void {
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: 'text/plain' });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

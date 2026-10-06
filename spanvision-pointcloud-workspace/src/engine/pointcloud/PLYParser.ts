/** Stanford PLY point clouds and triangle meshes, ASCII or either binary byte order. */
import type { ParsedPointcloud, LASHeader } from './LASParser';

interface Property { name: string; type: string; countType?: string }
interface Element { name: string; count: number; properties: Property[] }
const sizes: Record<string, number> = {
  char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2,
  int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8,
};
const integerTypes = new Set(['char', 'int8', 'uchar', 'uint8', 'short', 'int16', 'ushort', 'uint16', 'int', 'int32', 'uint', 'uint32']);
const boundedUnit = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export function parsePLY(buffer: ArrayBuffer): ParsedPointcloud {
  const bytes = new Uint8Array(buffer);
  let headerEnd = 0, lineStart = 0;
  const lines: string[] = [];
  // Only a complete header line terminates the header; comments can contain end_header.
  for (let i = 0; i < Math.min(bytes.length, 1_048_576); i++) {
    if (bytes[i] !== 10) continue;
    const line = new TextDecoder().decode(bytes.subarray(lineStart, i)).replace(/\r$/, '');
    lines.push(line); lineStart = i + 1;
    if (line === 'end_header') { headerEnd = i + 1; break; }
  }
  if (!headerEnd || lines[0] !== 'ply') throw new Error('Invalid PLY header');
  const elements: Element[] = [];
  let format = '';
  for (const line of lines.slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'format') {
      if (format || parts[2] !== '1.0') throw new Error('Unsupported PLY format version');
      format = parts[1];
    } else if (parts[0] === 'element') {
      const count = Number(parts[2]);
      if (!Number.isSafeInteger(count) || count < 0 || count > buffer.byteLength) throw new Error('Invalid PLY element count');
      elements.push({ name: parts[1], count, properties: [] });
    } else if (parts[0] === 'property') {
      const element = elements[elements.length - 1];
      if (!element) throw new Error('PLY property has no element');
      const property: Property = parts[1] === 'list'
        ? { countType: parts[2], type: parts[3], name: parts[4] }
        : { type: parts[1], name: parts[2] };
      if (!sizes[property.type] || !property.name || (property.countType && !integerTypes.has(property.countType))) throw new Error('Unsupported PLY property type');
      if (element.properties.some(p => p.name === property.name)) throw new Error('Duplicate PLY property');
      element.properties.push(property);
    }
  }
  if (!['ascii', 'binary_little_endian', 'binary_big_endian'].includes(format)) throw new Error('Unsupported PLY format: ' + format);
  const vertex = elements.find(e => e.name === 'vertex');
  if (!vertex?.count || elements.filter(e => e.name === 'vertex').length !== 1) throw new Error('PLY file has no unique vertex element');
  for (const name of ['x', 'y', 'z']) {
    if (!vertex.properties.some(p => p.name === name && !p.countType)) throw new Error('PLY file missing scalar x/y/z vertex properties');
  }
  const hasFaces = elements.some(e => e.name === 'face' && e.count > 0);
  if (hasFaces && vertex.count > 1_000_000) throw new Error('PLY mesh exceeds the browser limit of 1,000,000 vertices; simplify the mesh before importing');
  const stride = Math.max(1, Math.ceil(vertex.count / 1_000_000));
  const count = Math.ceil(vertex.count / stride);
  // Double coordinates retain survey offsets until the complete bounds are known.
  const world = new Float64Array(count * 3), colors = new Float32Array(count * 3);
  const intensities = new Float32Array(count), classifications = new Float32Array(count);
  const indices: number[] = [];
  const colorNames = ['red', 'green', 'blue'].map((name, i) => vertex.properties.find(p => p.name === name || p.name === ['r', 'g', 'b'][i])?.name);
  const hasColor = colorNames.every(Boolean);
  const intensityName = vertex.properties.find(p => ['intensity', 'scalar_intensity'].includes(p.name))?.name;
  const className = vertex.properties.find(p => ['classification', 'class'].includes(p.name))?.name;
  const propertyByName = new Map(vertex.properties.map(p => [p.name, p]));
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let written = 0, offset = headerEnd, rowIndex = 0;
  const view = new DataView(buffer), little = format === 'binary_little_endian';
  const asciiLines = format === 'ascii' ? new TextDecoder().decode(bytes.subarray(headerEnd)).split(/\r?\n/).filter(line => line.trim()) : [];
  const binaryScalar = (type: string): number => {
    if (offset + sizes[type] > buffer.byteLength) throw new Error('Truncated PLY binary data');
    let value: number;
    switch (type) {
      case 'char': case 'int8': value = view.getInt8(offset); break;
      case 'uchar': case 'uint8': value = view.getUint8(offset); break;
      case 'short': case 'int16': value = view.getInt16(offset, little); break;
      case 'ushort': case 'uint16': value = view.getUint16(offset, little); break;
      case 'int': case 'int32': value = view.getInt32(offset, little); break;
      case 'uint': case 'uint32': value = view.getUint32(offset, little); break;
      case 'float': case 'float32': value = view.getFloat32(offset, little); break;
      default: value = view.getFloat64(offset, little);
    }
    offset += sizes[type]; return value;
  };
  for (const element of elements) {
    if (!element.properties.length && element.count) throw new Error('PLY element has no properties');
    for (let row = 0; row < element.count; row++) {
      const tokens = format === 'ascii' ? asciiLines[rowIndex++]?.trim().split(/\s+/) : undefined;
      if (format === 'ascii' && !tokens) throw new Error('Truncated PLY ASCII data');
      let tokenIndex = 0;
      const scalar = (type: string): number => {
        if (!tokens) return binaryScalar(type);
        if (tokenIndex >= tokens.length) throw new Error('Truncated PLY ASCII row');
        const value = Number(tokens[tokenIndex++]);
        if (integerTypes.has(type) && !Number.isInteger(value)) throw new Error('Invalid PLY integer value');
        return value;
      };
      const values: Record<string, number | number[]> = {};
      for (const property of element.properties) {
        if (!property.countType) { values[property.name] = scalar(property.type); continue; }
        const length = scalar(property.countType);
        const remaining = tokens ? tokens.length - tokenIndex : Math.floor((buffer.byteLength - offset) / sizes[property.type]);
        if (!Number.isSafeInteger(length) || length < 0 || length > remaining) throw new Error('Invalid or truncated PLY list');
        const list: number[] = [];
        for (let item = 0; item < length; item++) {
          const value = scalar(property.type);
          if (element.name === 'face' && ['vertex_indices', 'vertex_index'].includes(property.name)) list.push(value);
        }
        values[property.name] = list;
      }
      if (tokens && tokenIndex !== tokens.length) throw new Error('Unexpected extra PLY row values');
      if (element.name === 'vertex') {
        const x = Number(values.x), y = Number(values.y), z = Number(values.z);
        if (![x, y, z].every(Number.isFinite)) throw new Error('PLY contains non-finite vertex coordinates');
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        if (row % stride) continue;
        world.set([x, y, z], written * 3);
        for (let channel = 0; channel < 3; channel++) {
          const name = colorNames[channel], type = name && propertyByName.get(name)?.type;
          const divisor = type && ['uchar', 'uint8'].includes(type) ? 255 : type && ['ushort', 'uint16'].includes(type) ? 65535 : 1;
          colors[written * 3 + channel] = hasColor ? boundedUnit(Number(values[name!]) / divisor) : 0.8;
        }
        intensities[written] = intensityName ? boundedUnit(Number(values[intensityName])) : 0;
        const classification = className ? Number(values[className]) : 0;
        classifications[written] = Number.isInteger(classification) && classification >= 0 && classification <= 255 ? classification : 0;
        written++;
      } else if (element.name === 'face') {
        const face = values.vertex_indices ?? values.vertex_index;
        if (!Array.isArray(face) || face.length !== 3) throw new Error('Only triangle PLY faces are supported; triangulate the mesh before importing');
        if (face.some(index => !Number.isInteger(index) || index < 0 || index >= vertex.count)) throw new Error('PLY face contains an invalid vertex index');
        if (indices.length + 3 > 9_000_000) throw new Error('PLY mesh exceeds the browser limit of 3,000,000 triangles');
        indices.push(...face);
      }
    }
  }
  const center: [number, number, number] = [minX / 2 + maxX / 2, minY / 2 + maxY / 2, minZ / 2 + maxZ / 2];
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = world[i * 3] - center[0]; positions[i * 3 + 1] = world[i * 3 + 2] - center[2]; positions[i * 3 + 2] = -(world[i * 3 + 1] - center[1]);
  }
  if (!positions.every(Number.isFinite)) throw new Error('PLY coordinate range exceeds the renderer limits');
  const header: LASHeader = {
    signature: 'PLY', versionMajor: 0, versionMinor: 0, headerSize: headerEnd, offsetToPointData: headerEnd,
    pointDataFormat: 0, pointDataRecordLength: 0, numberOfPoints: count,
    scaleX: 1, scaleY: 1, scaleZ: 1, offsetX: 0, offsetY: 0, offsetZ: 0,
    minX, minY, minZ, maxX, maxY, maxZ,
  };
  return { header, positions, colors, intensities, classifications, center, hasColor, hasIntensity: !!intensityName, hasClassification: !!className,
    ...(indices.length ? { indices: new Uint32Array(indices) } : {}) };
}

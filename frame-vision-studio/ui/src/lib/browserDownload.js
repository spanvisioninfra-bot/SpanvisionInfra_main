/** Stored ZIP files keep all generated production documents in one download. */
export function createStoredZip(files) {
  if (!files.length || files.length > 65535) throw new Error('Invalid export file count.');
  const encoder = new TextEncoder(), locals = [], entries = [], names = new Set();
  let offset = 0;
  for (const [filename, content] of files) {
    if (!filename || /[/\\\x00-\x1f]/.test(filename) || filename === '.' || filename === '..' || names.has(filename)) {
      throw new Error('Export filenames must be unique and must not contain paths.');
    }
    names.add(filename);
    const name = encoder.encode(filename);
    const bytes = typeof content === 'string' ? encoder.encode(content) : new Uint8Array(content);
    if (name.length > 65535 || offset + bytes.length > 256 * 1024 * 1024) throw new Error('Export archive exceeds its size limit.');
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length), local = new DataView(header.buffer);
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); local.setUint16(12, 33, true); // UTF-8; 1980-01-01
    local.setUint32(14, crc, true); local.setUint32(18, bytes.length, true); local.setUint32(22, bytes.length, true);
    local.setUint16(26, name.length, true); header.set(name, 30);
    locals.push(header, bytes);
    const central = new Uint8Array(46 + name.length), directory = new DataView(central.buffer);
    directory.setUint32(0, 0x02014b50, true); directory.setUint16(4, 20, true); directory.setUint16(6, 20, true);
    directory.setUint16(8, 0x0800, true); directory.setUint16(14, 33, true);
    directory.setUint32(16, crc, true); directory.setUint32(20, bytes.length, true); directory.setUint32(24, bytes.length, true);
    directory.setUint16(28, name.length, true); directory.setUint32(42, offset, true); central.set(name, 46);
    entries.push(central); offset += header.length + bytes.length;
  }
  const directorySize = entries.reduce((size, entry) => size + entry.length, 0);
  const end = new Uint8Array(22), trailer = new DataView(end.buffer);
  trailer.setUint32(0, 0x06054b50, true); trailer.setUint16(8, files.length, true); trailer.setUint16(10, files.length, true);
  trailer.setUint32(12, directorySize, true); trailer.setUint32(16, offset, true);
  const result = new Uint8Array(offset + directorySize + end.length);
  let cursor = 0;
  for (const part of [...locals, ...entries, end]) { result.set(part, cursor); cursor += part.length; }
  return result;
}

export function downloadBytes(filename, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

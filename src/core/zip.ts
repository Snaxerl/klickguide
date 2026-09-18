/**
 * Small, uncompressed ZIP writer (PKZIP APPNOTE). No parser or decompressor.
 * Used only for our own UTF-8 Markdown and PNG files; never for imported archives.
 */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
}
const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes)
    crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function makeZip(entries: ZipEntry[]): Uint8Array {
  if (entries.length > 65000)
    throw new Error('Too many ZIP entries');
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const directoryParts: Uint8Array[] = [];
  const names = new Set<string>();
  let offset = 0;
  for (const entry of entries) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(entry.name) || entry.name.startsWith('/') || entry.name.split('/').includes('..') || names.has(entry.name))
      throw new Error('Unsafe or duplicate ZIP path');
    names.add(entry.name);
    const name = encoder.encode(entry.name);
    if (name.length > 65535 || entry.data.byteLength > 0xffffffff)
      throw new Error('ZIP entry too large');
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length);
    const header = new DataView(local.buffer);
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true);
    header.setUint16(12, 33, true); // 1980-01-01; deterministic archive metadata.
    header.setUint32(14, crc, true);
    header.setUint32(18, entry.data.length, true);
    header.setUint32(22, entry.data.length, true);
    header.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, entry.data);
    const directory = new Uint8Array(46 + name.length);
    const view = new DataView(directory.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(14, 33, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, entry.data.length, true);
    view.setUint32(24, entry.data.length, true);
    view.setUint16(28, name.length, true);
    view.setUint32(42, offset, true);
    directory.set(name, 46);
    directoryParts.push(directory);
    offset += local.length + entry.data.length;
  }
  const directorySize = directoryParts.reduce((sum, part) => sum + part.length, 0);
  if (offset + directorySize + 22 > 0xffffffff)
    throw new Error('ZIP64 is not supported');
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, offset, true);
  const result = new Uint8Array(offset + directorySize + end.length);
  let cursor = 0;
  for (const part of [...localParts, ...directoryParts, end]) {
    result.set(part, cursor);
    cursor += part.length;
  }
  return result;
}

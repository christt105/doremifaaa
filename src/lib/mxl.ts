export type Bytes = ArrayBuffer | Uint8Array;

interface ZipEntry {
  name: string;
  method: number;
  size: number;
  offset: number;
}

function view(buf: Bytes): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

export function isZip(buf: Bytes): boolean {
  const b = view(buf);
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

function zipEntries(b: Uint8Array): Map<string, ZipEntry> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = b.length - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  const utf8 = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('corrupt zip central directory');
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = utf8.decode(b.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { name, method, size, offset: local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(data as Uint8Array<ArrayBuffer>).catch(() => {});
  writer.close().catch(() => {});
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

async function entryData(b: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(e.offset, true) !== 0x04034b50) throw new Error(`corrupt zip entry ${e.name}`);
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const raw = b.subarray(start, start + e.size);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRaw(raw);
  throw new Error(`unsupported zip compression method ${e.method}`);
}

export function decodeXml(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder().decode(bytes);
}

export async function unzip(buf: Bytes): Promise<Map<string, Uint8Array>> {
  const b = view(buf);
  const files = new Map<string, Uint8Array>();
  for (const e of zipEntries(b).values()) if (!e.name.endsWith('/')) files.set(e.name, await entryData(b, e));
  return files;
}

export async function readScoreXml(buf: Bytes): Promise<string> {
  const b = view(buf);
  if (!isZip(b)) return decodeXml(b);
  const entries = zipEntries(b);
  const container = entries.get('META-INF/container.xml');
  const root = container ? /full-path\s*=\s*["']([^"']+)["']/.exec(decodeXml(await entryData(b, container)))?.[1] : undefined;
  const entry =
    (root && entries.get(root)) || [...entries.values()].find((e) => /\.(xml|musicxml)$/i.test(e.name) && !e.name.startsWith('META-INF'));
  if (!entry) throw new Error('no MusicXML file in archive');
  return decodeXml(await entryData(b, entry));
}

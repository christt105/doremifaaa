import { inflateRawSync } from 'node:zlib';

export function unzip(buffer) {
  const files = new Map();
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(p + 10);
    const size = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const name = buffer.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(raw) : raw);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

export function scoreXml(buffer) {
  if (buffer.subarray(0, 2).toString('latin1') !== 'PK') return buffer.toString('utf8');
  const files = unzip(buffer);
  const container = files.get('META-INF/container.xml')?.toString('utf8') ?? '';
  const root = /full-path="([^"]+)"/.exec(container)?.[1];
  const entry = root && files.has(root) ? root : [...files.keys()].find((k) => /\.(xml|musicxml)$/.test(k) && !k.startsWith('META-INF'));
  return files.get(entry).toString('utf8');
}

export function check(xml) {
  let divisions = 1;
  let time = [4, 4];
  let notes = 0;
  const staves = Number(/<staves>(\d+)<\/staves>/.exec(xml)?.[1] ?? 1);
  const keys = new Set([...xml.matchAll(/<fifths>(-?\d+)<\/fifths>/g)].map((m) => Number(m[1])));
  const times = new Set([...xml.matchAll(/<beats>(\d+)<\/beats>\s*<beat-type>(\d+)<\/beat-type>/g)].map((m) => `${m[1]}/${m[2]}`));
  const wrongLength = [];
  const emptyStaff = [];
  const measures = xml.split(/<part\s+id=/).slice(1, 2).flatMap((part) => part.split(/<measure(?=[\s>])/).slice(1));
  for (const m of measures) {
    const number = /number="([^"]+)"/.exec(m)?.[1] ?? '?';
    divisions = Number(/<divisions>(\d+)<\/divisions>/.exec(m)?.[1] ?? divisions);
    const t = /<beats>(\d+)<\/beats>\s*<beat-type>(\d+)<\/beat-type>/.exec(m);
    if (t) time = [Number(t[1]), Number(t[2])];
    const expected = (time[0] * divisions * 4) / time[1];
    const voices = new Map();
    const sounding = new Set();
    for (const n of m.matchAll(/<note\b[^>]*>([\s\S]*?)<\/note>/g)) {
      const body = n[1];
      const staff = /<staff>(\d+)<\/staff>/.exec(body)?.[1] ?? '1';
      if (!/<rest\b/.test(body)) {
        notes++;
        sounding.add(staff);
      }
      if (/<chord\/>|<grace\b/.test(body)) continue;
      const key = `${staff}:${/<voice>(\d+)<\/voice>/.exec(body)?.[1] ?? '1'}`;
      voices.set(key, (voices.get(key) ?? 0) + Number(/<duration>(\d+)<\/duration>/.exec(body)?.[1] ?? 0));
    }
    const implicit = /^[^>]*implicit="yes"/.test(m);
    if (!implicit && [...voices.values()].some((v) => v !== expected)) wrongLength.push(number);
    for (let s = 1; s <= staves; s++) if (!sounding.has(String(s))) emptyStaff.push(`${number}:${s}`);
  }
  return { keys: [...keys], times: [...times], staves, measures: measures.length, notes, wrongLength, emptyStaff };
}

export function quality(buffer) {
  try {
    const r = check(scoreXml(buffer));
    return { measures: r.measures, notes: r.notes, wrongLength: r.wrongLength, emptyStaff: r.emptyStaff };
  } catch {
    return null;
  }
}

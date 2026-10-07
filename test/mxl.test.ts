import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { isZip, readScoreXml, unzip } from '../src/lib/mxl';

const REAL_DIR = '/home/bot/scratch/doremi-vault/Piano/Partituras/_musicxml/';

function zip(files: [string, string, 'store' | 'deflate'][]): Uint8Array {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text, mode] of files) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = mode === 'deflate' ? deflateRawSync(raw) : raw;
    const method = mode === 'deflate' ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]));
}

const score = '<?xml version="1.0"?><score-partwise><part id="P1"><measure number="1"/></part></score-partwise>';
const container = '<container><rootfiles><rootfile full-path="music/score.xml"/></rootfiles></container>';

describe('mxl reading', () => {
  it('detects zip archives', () => {
    expect(isZip(zip([['a.xml', 'x', 'store']]))).toBe(true);
    expect(isZip(new TextEncoder().encode(score))).toBe(false);
    expect(isZip(new Uint8Array([0x50]))).toBe(false);
  });

  it('returns plain XML as text', async () => {
    expect(await readScoreXml(new TextEncoder().encode(score).buffer)).toBe(score);
  });

  it('decodes UTF-16 XML with a byte order mark', async () => {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(score, 'utf16le')]);
    expect(await readScoreXml(new Uint8Array(bytes))).toBe(score);
  });

  it('honours the container rootfile with deflated entries', async () => {
    const buf = zip([
      ['META-INF/container.xml', container, 'deflate'],
      ['decoy.xml', '<nope/>', 'deflate'],
      ['music/score.xml', score, 'deflate']
    ]);
    expect(await readScoreXml(buf.buffer as ArrayBuffer)).toBe(score);
  });

  it('reads stored entries and falls back to the first MusicXML file', async () => {
    const buf = zip([
      ['META-INF/other.xml', '<x/>', 'store'],
      ['piece.musicxml', score, 'store']
    ]);
    expect(await readScoreXml(buf)).toBe(score);
    expect([...(await unzip(buf)).keys()]).toEqual(['META-INF/other.xml', 'piece.musicxml']);
  });

  it('rejects archives without a score', async () => {
    await expect(readScoreXml(zip([['readme.txt', 'hi', 'store']]))).rejects.toThrow('no MusicXML');
    await expect(readScoreXml(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]))).rejects.toThrow('not a zip');
  });

  const real = existsSync(REAL_DIR) ? readdirSync(REAL_DIR).filter((f) => f.endsWith('.mxl')) : [];
  it.skipIf(!real.length)('reads the Audiveris .mxl files', async () => {
    for (const f of real) {
      const xml = await readScoreXml(readFileSync(REAL_DIR + f));
      expect(xml.startsWith('<?xml'), f).toBe(true);
      expect(xml.trimEnd().endsWith('</score-partwise>'), f).toBe(true);
    }
  });
});

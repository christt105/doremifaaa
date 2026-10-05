import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM module without types
import { Vault, embeds, linkTarget, parseFrontmatter, sniff } from '../server/vault.mjs';

const root = mkdtempSync(join(tmpdir(), 'doremifaaa-vault-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function write(path: string, content: string | Buffer) {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

write(
  'Piano/Partituras/Blue Bird.md',
  '---\ntype: partitura\ntitulo: "Blue Bird"\nestado: "Not started"\ndificultad: "Beginner"\npaperless_id: 111\ntags:\n  - anime\n  - naruto\n---\n\n![[Blue Bird.pdf]]\n'
);
write('Piano/Partituras/_pdf/Blue Bird.pdf', 'http://paperless.local:8010/share/abc');
write('Piano/Partituras/Route 201.md', '---\ntype: partitura\ntitulo: "Route 201"\nmusicxml: "[[route201.mxl]]"\n---\n');
write('Piano/scores/route201.mxl', Buffer.from([0x50, 0x4b, 3, 4]));
write('Piano/Partituras/Wind.md', '---\ntype: partitura\ntitulo: Wind\n---\n![[Wind.pdf]]');
write('Piano/Partituras/Wind.musicxml', '<score-partwise/>');
write('Piano/Partituras/_pdf/Wind.pdf', '%PDF-1.4 fake');
write('Other/Note.md', '---\ntype: task\n---\n');
write('.obsidian/Hidden.md', '---\ntype: partitura\n---\n');

describe('frontmatter parsing', () => {
  it('reads scalars, quoted strings, numbers and lists', () => {
    const { data, body } = parseFrontmatter('---\na: "x: y"\nb: 12\nc:\n  - one\n  - "two"\nd: [p, q]\ne:\nf: 2024-05-16\n---\nbody');
    expect(data).toEqual({ a: 'x: y', b: 12, c: ['one', 'two'], d: ['p', 'q'], e: null, f: '2024-05-16' });
    expect(body).toBe('body');
  });

  it('extracts wikilinks and embeds', () => {
    expect(linkTarget('[[Some file.mxl|alias]]')).toBe('Some file.mxl');
    expect(linkTarget('plain/path.pdf')).toBe('plain/path.pdf');
    expect(embeds('text ![[A.pdf]] and ![[B.png|300]]')).toEqual(['A.pdf', 'B.png']);
  });
});

describe('vault scan', () => {
  it('finds only partitura notes and resolves their files', async () => {
    const vault = new Vault({ root });
    const { pieces } = await vault.get();
    expect(pieces.map((p: { id: string }) => p.id)).toEqual(['Blue Bird', 'Route 201', 'Wind']);
    const [blue, route, wind] = pieces;
    expect(blue).toMatchObject({ status: 'Not started', difficulty: 'Beginner', tags: ['anime', 'naruto'], paperlessId: 111, hasPdf: true, hasScore: false });
    expect(route.hasScore).toBe(true);
    expect(route.scoreFile.endsWith('route201.mxl')).toBe(true);
    expect(wind.hasScore).toBe(true);
    expect(wind.scoreFile.endsWith('Wind.musicxml')).toBe(true);
    expect(vault.inside(join(root, '..', 'escape'))).toBe(false);
  });

  it('tells real PDFs from share link stubs', async () => {
    expect(await sniff(join(root, 'Piano/Partituras/_pdf/Blue Bird.pdf'))).toMatchObject({ kind: 'url', url: 'http://paperless.local:8010/share/abc' });
    expect((await sniff(join(root, 'Piano/Partituras/_pdf/Wind.pdf'))).kind).toBe('pdf');
  });
});

describe('vault exclusions', () => {
  it('skips the templates folder and notes with template placeholders', async () => {
    write('Templates/Partitura.md', '---\ntype: partitura\ntitulo: "<% tp.file.title %>"\n---\n');
    write('Piano/Partituras/Draft.md', '---\ntype: partitura\ntitulo: "{{title}}"\n---\n');
    const { pieces } = await new Vault({ root }).get();
    expect(pieces.map((p: { id: string }) => p.id)).toEqual(['Blue Bird', 'Route 201', 'Wind']);
    const all = await new Vault({ root, exclude: [] }).get();
    expect(all.pieces).toHaveLength(3);
  });
});

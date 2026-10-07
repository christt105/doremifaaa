import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain ESM module without types
import { createApp, loadConfig } from '../server/index.mjs';
// @ts-expect-error plain ESM module without types
import { Importer } from '../server/importer.mjs';
// @ts-expect-error plain ESM module without types
import { Store } from '../server/store.mjs';
// @ts-expect-error plain ESM module without types
import { Vault } from '../server/vault.mjs';

const root = mkdtempSync(join(tmpdir(), 'doremifaaa-import-'));
const vaultDir = join(root, 'vault');
afterAll(() => rmSync(root, { recursive: true, force: true }));

const minuet = readFileSync(join(__dirname, '..', 'public', 'samples', 'minuet.musicxml'));
const pdf = Buffer.from('%PDF-1.4\n% real\n%%EOF\n');
const remotePdf = Buffer.from('%PDF-1.7\n% remote\n%%EOF\n');

function write(path: string, content: string | Buffer) {
  const full = join(vaultDir, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

write('P/Wind.md', '---\ntype: partitura\ntitulo: Wind\nestado: "Learning"\ndificultad: "Advanced"\nfecha_inicio: 2024-05-16\nfuente: "https://example.com/wind"\ntags:\n  - anime\n---\n![[Wind.pdf]]\n');
write('P/Wind.musicxml', minuet);
write('P/_pdf/Wind.pdf', pdf);
write('P/Route 201.md', '---\ntype: partitura\ntitulo: "Route 201"\n---\n![[Route 201.pdf]]\n');
write('P/_pdf/Route 201.pdf', 'http://paperless.local:8010/share/route');
write('P/Foreign.md', '---\ntype: partitura\ntitulo: Foreign\n---\n![[Foreign.pdf]]\n');
write('P/_pdf/Foreign.pdf', 'http://evil.example/share/x');
write('P/Blue Bird.md', '---\ntype: partitura\ntitulo: "Blue Bird"\npaperless_id: 111\n---\n');

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir, { recursive: true }) as string[]) {
    const full = join(dir, name);
    if (statSync(full).isFile()) out[name] = readFileSync(full).toString('base64');
  }
  return out;
}

const pdfResponse = () => new Response(remotePdf, { status: 200 });

function setup(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, token = 'tok') {
  const store = new Store({ dir: mkdtempSync(join(root, 'data-')) });
  const vault = new Vault({ root: vaultDir });
  const allowedRemote = (url: string) => new URL(url).origin === 'http://paperless.local:8010';
  return { store, importer: new Importer({ vault, store, allowedRemote, paperlessUrl: 'http://paperless.local:8010', paperlessToken: token, fetch: fetchImpl }) };
}

describe('vault importer', () => {
  it('copies scores, PDFs and metadata without touching the vault', async () => {
    const before = snapshot(vaultDir);
    const fetchImpl = vi.fn(async () => pdfResponse());
    const { store, importer } = setup(fetchImpl);
    expect(await importer.plan()).toMatchObject({ total: 4, new: 4, imported: 0 });
    const result = await importer.run();
    expect(result.imported.sort()).toEqual(['Blue Bird', 'Foreign', 'Route 201', 'Wind']);
    expect(result.failed).toEqual([]);

    const wind = store.findByOrigin('vault', 'Wind');
    expect(wind).toMatchObject({ title: 'Wind', status: 'Learning', difficulty: 'Advanced', startedAt: '2024-05-16', source: 'https://example.com/wind', tags: ['anime'], notePath: 'P/Wind.md', scoreFormat: 'musicxml', hasPdf: true });
    expect(readFileSync(store.filePath(wind.id, 'score'))).toEqual(minuet);
    expect(readFileSync(store.filePath(wind.id, 'pdf'))).toEqual(pdf);
    expect(readFileSync(store.filePath(store.findByOrigin('vault', 'Route 201').id, 'pdf'))).toEqual(remotePdf);
    expect(store.findByOrigin('vault', 'Foreign').hasPdf).toBe(false);
    expect(store.findByOrigin('vault', 'Blue Bird').hasPdf).toBe(true);

    const urls = fetchImpl.mock.calls.map((c) => (c as unknown as [string, RequestInit])[0]).sort();
    expect(urls).toEqual(['http://paperless.local:8010/api/documents/111/download/', 'http://paperless.local:8010/share/route']);
    const paperless = fetchImpl.mock.calls.find((c) => String((c as unknown[])[0]).includes('/api/documents/')) as unknown as [string, RequestInit];
    expect(paperless[1].headers).toEqual({ Authorization: 'Token tok' });

    expect(await importer.run()).toEqual({ imported: [], updated: [], skipped: ['Blue Bird', 'Foreign', 'Route 201', 'Wind'], failed: [] });
    expect(store.list()).toHaveLength(4);
    expect(snapshot(vaultDir)).toEqual(before);
    store.close();
  });

  it('keeps the piece when a PDF fails and fills it in on the next run', async () => {
    let fail = true;
    const { store, importer } = setup(async () => (fail ? new Response('nope', { status: 502 }) : pdfResponse()), '');
    const first = await importer.run(['Route 201', 'Blue Bird']);
    expect(first.imported.sort()).toEqual(['Blue Bird', 'Route 201']);
    expect(first.failed).toEqual([expect.objectContaining({ id: 'Route 201', error: expect.stringContaining('502') })]);
    expect(store.findByOrigin('vault', 'Route 201').hasPdf).toBe(false);
    expect(store.findByOrigin('vault', 'Blue Bird').hasPdf).toBe(false);
    expect((await importer.plan()).pieces.find((p: { id: string }) => p.id === 'Route 201')).toMatchObject({ state: 'incomplete', missing: ['pdf'] });
    fail = false;
    expect(await importer.run(['Route 201'])).toEqual({ imported: [], updated: ['Route 201'], skipped: [], failed: [] });
    expect(store.findByOrigin('vault', 'Route 201').hasPdf).toBe(true);
    expect(store.list()).toHaveLength(2);
    store.close();
  });
});

describe('import endpoint', () => {
  it('plans with GET and imports with a guarded POST', async () => {
    const server = createApp(loadConfig({ STATIC_DIR: root, VAULT_DIR: vaultDir, DATA_DIR: join(root, 'http-data'), WRITE_TOKEN: 'abc' }));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/import/vault`;
    try {
      expect(await (await fetch(base)).json()).toMatchObject({ total: 4, new: 4 });
      expect((await fetch(base, { method: 'POST' })).status).toBe(401);
      expect((await fetch(base, { method: 'POST', headers: { Origin: 'http://evil.example', Authorization: 'Bearer abc' } })).status).toBe(403);
      const res = await fetch(base, { method: 'POST', headers: { Authorization: 'Bearer abc', 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ['Wind'] }) });
      expect(await res.json()).toMatchObject({ imported: ['Wind'], failed: [] });
      const lib = await (await fetch(base.replace('import/vault', 'library'))).json();
      expect(lib.pieces.filter((p: { title: string }) => p.title === 'Wind')).toEqual([expect.objectContaining({ location: 'store', notePath: 'P/Wind.md' })]);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

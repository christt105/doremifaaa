import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM module without types
import { createApp, loadConfig } from '../server/index.mjs';
// @ts-expect-error plain ESM module without types
import { Omr } from '../server/omr.mjs';
// @ts-expect-error plain ESM module without types
import { Store } from '../server/store.mjs';

const root = mkdtempSync(join(tmpdir(), 'doremifaaa-omr-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const minuet = readFileSync(join(__dirname, '..', 'public', 'samples', 'minuet.musicxml'));
const broken = Buffer.from(minuet.toString('utf8').replace('<duration>4</duration>', '<duration>8</duration>'));
const pdf = Buffer.from('%PDF-1.4\n% fake\n%%EOF\n');
const chunks = (b: Buffer) => (async function* () {
  yield b;
})();

async function pdfPiece(store: InstanceType<typeof Store>) {
  return store.upload(chunks(pdf), { name: 'Route 201.pdf' });
}

describe('omr queue', () => {
  it('queues a PDF, notices the worker and attaches the result with its quality', async () => {
    const store = new Store({ dir: join(root, 'a') });
    const omr = new Omr({ store, dir: join(root, 'a', 'omr') });
    const piece = await pdfPiece(store);
    expect(omr.shouldConvert(piece)).toBe(true);
    expect((await omr.enqueue(piece.id)).omr.state).toBe('queued');
    const queued = join(root, 'a', 'omr', 'queue', `${piece.id}.pdf`);
    expect(readFileSync(queued)).toEqual(pdf);

    renameSync(queued, join(root, 'a', 'omr', 'work', `${piece.id}.pdf`));
    await omr.poll();
    expect(store.get(piece.id).omr.state).toBe('running');

    writeFileSync(join(root, 'a', 'omr', 'done', `${piece.id}.mxl`), broken);
    rmSync(join(root, 'a', 'omr', 'work', `${piece.id}.pdf`));
    await omr.poll();
    const done = store.get(piece.id);
    expect(done).toMatchObject({ scoreFormat: 'musicxml', scoreOrigin: 'omr', hasPdf: true, omr: { state: 'done', error: null } });
    expect(done.quality).toMatchObject({ measures: 16, wrongLength: ['1'], emptyStaff: [] });
    expect(existsSync(join(root, 'a', 'omr', 'done', `${piece.id}.mxl`))).toBe(false);
    expect(omr.shouldConvert(done)).toBe(false);
    store.close();
  });

  it('reports failures and lost jobs, and never overwrites an existing score', async () => {
    const store = new Store({ dir: join(root, 'b') });
    const omr = new Omr({ store, dir: join(root, 'b', 'omr') });
    const failing = await pdfPiece(store);
    await omr.enqueue(failing.id);
    rmSync(join(root, 'b', 'omr', 'queue', `${failing.id}.pdf`));
    writeFileSync(join(root, 'b', 'omr', 'failed', `${failing.id}.log`), 'Audiveris did not recognise a score in this PDF\nlog line\n');
    const lost = await pdfPiece(store);
    await omr.enqueue(lost.id);
    rmSync(join(root, 'b', 'omr', 'queue', `${lost.id}.pdf`));
    const scored = await pdfPiece(store);
    await omr.enqueue(scored.id);
    await store.putFile(scored.id, 'score', await store.stage(chunks(minuet)));
    rmSync(join(root, 'b', 'omr', 'queue', `${scored.id}.pdf`));
    writeFileSync(join(root, 'b', 'omr', 'done', `${scored.id}.mxl`), broken);

    await omr.poll();
    expect(store.get(failing.id).omr).toMatchObject({ state: 'failed', error: 'Audiveris did not recognise a score in this PDF' });
    expect(store.get(lost.id).omr).toMatchObject({ state: 'failed', error: expect.stringContaining('lost') });
    expect(store.get(scored.id)).toMatchObject({ scoreOrigin: 'upload', omr: { state: 'done' } });
    expect(store.get(scored.id).quality.wrongLength).toEqual([]);
    store.close();
  });
});

describe('omr endpoints', () => {
  const servers: Server[] = [];
  afterAll(async () => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));
  async function start(env: Record<string, string>) {
    const server: Server = createApp(loadConfig({ STATIC_DIR: root, ...env }));
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('queues uploads only when OMR is on, and converts on demand behind the guard', async () => {
    const off = await start({ DATA_DIR: join(root, 'off') });
    const plain = await (await fetch(`${off}/api/pieces?name=a.pdf`, { method: 'POST', body: pdf })).json();
    expect(plain.omr).toBeNull();
    expect((await fetch(`${off}/api/pieces/${plain.id}/convert`, { method: 'POST' })).status).toBe(404);

    const on = await start({ DATA_DIR: join(root, 'on'), OMR: '1', WRITE_TOKEN: 'abc' });
    const auth = { Authorization: 'Bearer abc' };
    const queued = await (await fetch(`${on}/api/pieces?name=a.pdf`, { method: 'POST', body: pdf, headers: auth })).json();
    expect(queued.omr.state).toBe('queued');
    expect(existsSync(join(root, 'on', 'omr', 'queue', `${queued.id}.pdf`))).toBe(true);
    const score = await (await fetch(`${on}/api/pieces?name=m.musicxml`, { method: 'POST', body: broken, headers: auth })).json();
    expect(score.omr).toBeNull();
    expect(score.quality.wrongLength).toEqual(['1']);
    expect((await fetch(`${on}/api/pieces/${score.id}/convert`, { method: 'POST', headers: auth })).status).toBe(409);
    expect((await fetch(`${on}/api/pieces/${queued.id}/convert`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${on}/api/pieces/${queued.id}/convert`, { method: 'POST', headers: { ...auth, Origin: 'http://evil.example' } })).status).toBe(403);
    expect((await fetch(`${on}/api/pieces/${queued.id}/convert`, { method: 'POST', headers: auth })).status).toBe(202);
  });
});

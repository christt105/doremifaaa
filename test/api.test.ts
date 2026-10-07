import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM module without types
import { createApp, loadConfig } from '../server/index.mjs';
// @ts-expect-error plain ESM module without types
import { Store } from '../server/store.mjs';

const root = mkdtempSync(join(tmpdir(), 'doremifaaa-api-'));
const vaultDir = join(root, 'vault');
const minuet = readFileSync(join(__dirname, '..', 'public', 'samples', 'minuet.musicxml'));
const pdf = Buffer.from('%PDF-1.4\n% fake\n%%EOF\n');
const github = 'https://christt105.github.io';

function write(path: string, content: string | Buffer) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

write(join(vaultDir, 'Piano/Route 201.md'), '---\ntype: partitura\ntitulo: "Route 201"\n---\n![[Route 201.pdf]]\n');
write(join(vaultDir, 'Piano/_pdf/Route 201.pdf'), pdf);
write(join(vaultDir, 'Piano/Wind.md'), '---\ntype: partitura\ntitulo: Wind\n---\n');
write(join(vaultDir, 'Piano/Wind.musicxml'), minuet);
write(join(root, 'victim', 'keep.txt'), 'keep');
write(join(root, 'not-a-dir'), 'file');

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  json: any;
}

const servers: Server[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  rmSync(root, { recursive: true, force: true });
});

async function start(env: Record<string, string>) {
  const server: Server = createApp(loadConfig({ STATIC_DIR: join(root, 'static'), VAULT_DIR: vaultDir, ...env }));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const call = (method: string, path: string, { body, headers = {} }: { body?: Buffer | string | object; headers?: Record<string, string> } = {}) =>
    new Promise<Reply>((resolve, reject) => {
      const data = body === undefined ? undefined : Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body);
      const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(buf.toString('utf8'));
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: buf, json });
        });
      });
      req.on('error', reject);
      req.end(data);
    });
  return Object.assign(call, { port });
}

describe('store API', () => {
  const dataDir = join(root, 'data');
  let call: Awaited<ReturnType<typeof start>>;
  let scoreId = '';
  let pdfId = '';

  beforeAll(async () => {
    call = await start({ DATA_DIR: dataDir, ALLOWED_ORIGINS: github, MAX_UPLOAD_MB: '0.5' });
  });

  it('reports the store in health and preflight', async () => {
    expect((await call('GET', '/api/health')).json).toEqual({ ok: true, vault: true, pieces: 2, store: true, auth: false, omr: false });
    const pre = await call('OPTIONS', '/api/pieces', { headers: { Origin: github } });
    expect(pre.status).toBe(204);
    expect(pre.headers['access-control-allow-methods']).toBe('GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    expect(pre.headers['access-control-allow-headers']).toBe('Content-Type, Authorization');
  });

  it('uploads a score and a PDF', async () => {
    const score = await call('POST', '/api/pieces?name=Minuet_in_G.musicxml', { body: minuet });
    expect(score.status).toBe(201);
    expect(score.json).toMatchObject({ title: 'Minuet in G', location: 'store', origin: 'upload', editable: true, hasScore: true, hasPdf: false, scoreFormat: 'musicxml' });
    expect(score.json.scoreUrl).toBe(`api/pieces/${score.json.id}/score?v=${score.json.updatedAt}`);
    scoreId = score.json.id;

    const doc = await call('POST', '/api/pieces?name=scan.pdf&title=Route%20201%20(print)', { body: pdf, headers: { Origin: github } });
    expect(doc.status).toBe(201);
    expect(doc.headers['access-control-allow-origin']).toBe(github);
    expect(doc.json).toMatchObject({ title: 'Route 201 (print)', hasPdf: true, hasScore: false });
    pdfId = doc.json.id;
  });

  it('accepts same-origin writes to an IP literal host', async () => {
    const res = await call('DELETE', `/api/pieces/${pdfId}/score`, { headers: { Origin: `http://127.0.0.1:${call.port}` } });
    expect(res.status).toBe(200);
    const spoofed = await call('DELETE', `/api/pieces/${pdfId}/score`, { headers: { Origin: 'http://rebind.example', Host: 'rebind.example' } });
    expect(spoofed.status).toBe(403);
  });

  it('lists store pieces next to vault pieces', async () => {
    const lib = (await call('GET', '/api/library')).json;
    expect(lib.store).toEqual({ enabled: true, auth: false, omr: false });
    expect(lib.pieces.map((p: { title: string; location: string }) => `${p.title}:${p.location}`)).toEqual([
      'Minuet in G:store',
      'Route 201:vault',
      'Route 201 (print):store',
      'Wind:vault'
    ]);
    const route = lib.pieces.find((p: { id: string }) => p.id === 'Route 201');
    expect(route).toMatchObject({ editable: false, origin: null, originRef: null, hasOriginal: false, originalUrl: null, createdAt: null, notePath: 'Piano/Route 201.md' });
  });

  it('patches metadata and validates it', async () => {
    const res = await call('PATCH', `/api/pieces/${scoreId}`, { body: { composer: ' Petzold ', status: 'Learning', tags: ['bach'], notes: 'hands apart' } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ composer: 'Petzold', status: 'Learning', tags: ['bach'], notes: 'hands apart' });
    expect((await call('PATCH', `/api/pieces/${scoreId}`, { body: { nope: 1 } })).status).toBe(400);
    expect((await call('PATCH', `/api/pieces/${scoreId}`, { body: { title: '' } })).status).toBe(400);
    expect((await call('PATCH', `/api/pieces/${scoreId}`, { body: 'not json' })).status).toBe(400);
    expect((await call('GET', `/api/pieces/${scoreId}`)).json.composer).toBe('Petzold');
  });

  it('downloads files and replaces the score keeping the original', async () => {
    const dl = await call('GET', `/api/pieces/${scoreId}/score?v=1`);
    expect(dl.status).toBe(200);
    expect(dl.body.equals(minuet)).toBe(true);
    expect((await call('GET', `/api/pieces/${pdfId}/pdf`)).body.equals(pdf)).toBe(true);
    expect((await call('GET', `/api/pieces/${pdfId}/score`)).status).toBe(404);

    const mxl = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(16)]);
    const put = await call('PUT', `/api/pieces/${scoreId}/score?name=minuet.mxl&keepOriginal=1`, { body: mxl });
    expect(put.json).toMatchObject({ scoreFormat: 'mxl', hasOriginal: true });
    expect((await call('GET', `/api/pieces/${scoreId}/original`)).body.equals(minuet)).toBe(true);
    expect((await call('PUT', `/api/pieces/${scoreId}/pdf`, { body: minuet })).status).toBe(415);
    expect((await call('PUT', `/api/pieces/${scoreId}/pdf`, { body: pdf })).json.hasPdf).toBe(true);
    expect((await call('DELETE', `/api/pieces/${scoreId}/pdf`)).json.hasPdf).toBe(false);
  });

  it('rejects junk and oversized uploads', async () => {
    expect((await call('POST', '/api/pieces?name=x.txt', { body: 'hello' })).status).toBe(415);
    expect((await call('POST', '/api/pieces?name=big.pdf', { body: Buffer.concat([pdf, Buffer.alloc(600 * 1024)]) })).status).toBe(413);
    expect(readdirSync(join(dataDir, 'tmp'))).toEqual([]);
  });

  it('refuses writes from foreign or null origins', async () => {
    for (const origin of ['https://evil.example', 'null']) {
      const res = await call('POST', '/api/pieces?name=x.pdf', { body: pdf, headers: { Origin: origin } });
      expect(res.status).toBe(403);
      expect(res.json).toEqual({ error: 'origin not allowed' });
      expect((await call('DELETE', `/api/pieces/${pdfId}`, { headers: { Origin: origin } })).status).toBe(403);
    }
    expect((await call('GET', `/api/pieces/${pdfId}`)).status).toBe(200);
  });

  it('never resolves traversal-looking ids to paths', async () => {
    expect((await call('GET', '/api/pieces/..%2F..%2Fetc')).status).toBe(404);
    expect((await call('GET', '/api/pieces/..%2F..%2Fetc%2Fpasswd/score')).status).toBe(404);
    expect((await call('PATCH', '/api/pieces/..%2F..%2Fetc', { body: { title: 'x' } })).status).toBe(400);
    expect((await call('DELETE', '/api/pieces/..%2F..%2F..%2Fvictim')).status).toBe(400);
    expect((await call('DELETE', '/api/pieces/..%2Fvictim/score')).status).toBe(400);
    expect((await call('DELETE', '/api/pieces/abcdefghij')).status).toBe(404);
    expect(readFileSync(join(root, 'victim', 'keep.txt'), 'utf8')).toBe('keep');
  });

  it('keeps vault pieces read-only', async () => {
    const id = encodeURIComponent('Route 201');
    expect((await call('PATCH', `/api/pieces/${id}`, { body: { title: 'x' } })).json).toEqual({ error: 'read-only' });
    expect((await call('PUT', `/api/pieces/${id}/score`, { body: minuet })).status).toBe(409);
    expect((await call('DELETE', `/api/pieces/${id}`)).status).toBe(409);
    expect((await call('GET', `/api/pieces/${id}/pdf`)).body.equals(pdf)).toBe(true);
  });

  it('hides vault pieces imported into the store', async () => {
    const store = new Store({ dir: dataDir });
    const imported = store.create({ title: 'Wind', origin: 'vault', originRef: 'Wind' });
    store.close();
    const lib = (await call('GET', '/api/library')).json;
    const winds = lib.pieces.filter((p: { title: string }) => p.title === 'Wind');
    expect(winds).toHaveLength(1);
    expect(winds[0]).toMatchObject({ id: imported.id, location: 'store', origin: 'vault', originRef: 'Wind' });
    expect((await call('GET', '/api/pieces/Wind')).json.id).toBe(imported.id);
  });

  it('deletes pieces and their folder', async () => {
    expect((await call('DELETE', `/api/pieces/${scoreId}`)).status).toBe(204);
    expect((await call('GET', `/api/pieces/${scoreId}`)).status).toBe(404);
    expect(existsSync(join(dataDir, 'files', scoreId))).toBe(false);
  });
});

describe('store API with a write token', () => {
  it('requires the bearer token for writes only', async () => {
    const call = await start({ DATA_DIR: join(root, 'data-token'), WRITE_TOKEN: 's3cret' });
    expect((await call('GET', '/api/health')).json).toMatchObject({ store: true, auth: true });
    expect((await call('POST', '/api/pieces?name=a.pdf', { body: pdf })).status).toBe(401);
    expect((await call('POST', '/api/pieces?name=a.pdf', { body: pdf, headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
    expect((await call('POST', '/api/pieces?name=a.pdf', { body: pdf, headers: { Authorization: 'Bearer s3cret' } })).status).toBe(201);
    expect((await call('GET', '/api/library')).json.pieces).toHaveLength(3);
  });
});

describe('without a working store', () => {
  it('keeps serving the vault when the store is disabled', async () => {
    const call = await start({});
    expect((await call('GET', '/api/health')).json).toEqual({ ok: true, vault: true, pieces: 2, store: false, auth: false, omr: false });
    const lib = (await call('GET', '/api/library')).json;
    expect(lib.store).toEqual({ enabled: false, auth: false, omr: false });
    expect(lib.pieces).toHaveLength(2);
    expect((await call('POST', '/api/pieces?name=a.pdf', { body: pdf })).json).toEqual({ error: 'store disabled' });
  });

  it('reports a broken data directory without crashing', async () => {
    const call = await start({ DATA_DIR: join(root, 'not-a-dir') });
    const health = (await call('GET', '/api/health')).json;
    expect(health).toMatchObject({ ok: true, store: false, pieces: 2 });
    expect(health.storeError).toBeTruthy();
    expect((await call('POST', '/api/pieces?name=a.pdf', { body: pdf })).status).toBe(503);
    expect((await call('GET', '/api/library')).json.pieces).toHaveLength(2);
  });
});

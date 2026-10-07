import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM module without types
import { createApp, loadConfig } from '../server/index.mjs';
import { mergeDecks, mergeSessions, plan, RESET_KEY, setupLink, setupParams, sharedSettings } from '../src/lib/sync';

const root = mkdtempSync(join(tmpdir(), 'doremifaaa-sync-'));
const servers: Server[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  rmSync(root, { recursive: true, force: true });
});

async function start(env: Record<string, string> = {}) {
  const server: Server = createApp(loadConfig({ STATIC_DIR: root, DATA_DIR: join(root, 'data'), ...env }));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}

const stat = (seen: number, last: number) => ({ seen, correct: seen, box: 1, last, avgMs: 900 });

describe('sync endpoints', () => {
  it('keeps the newest value per key and isolates profiles', async () => {
    const call = await start();
    expect((await (await call('GET', '/api/sync/laptop')).json()).entries).toEqual({});
    const first = await call('POST', '/api/sync/laptop', { entries: { 'doremifaaa.settings': { value: { lang: 'es' }, updatedAt: 10 } } });
    expect(first.status).toBe(200);
    await call('POST', '/api/sync/laptop', { entries: { 'doremifaaa.settings': { value: { lang: 'en' }, updatedAt: 5 } } });
    await call('POST', '/api/sync/laptop', { entries: { 'doremifaaa.sessions': { value: [], updatedAt: 1 } } });
    const { entries } = await (await call('GET', '/api/sync/laptop')).json();
    expect(entries['doremifaaa.settings']).toEqual({ value: { lang: 'es' }, updatedAt: 10 });
    expect(Object.keys(entries)).toHaveLength(2);
    expect((await (await call('GET', '/api/sync/deck')).json()).entries).toEqual({});
  });

  it('validates profiles, keys and entries', async () => {
    const call = await start();
    expect((await call('GET', '/api/sync/..%2Fx')).status).toBe(400);
    expect((await call('POST', '/api/sync/a', { entries: { 'other.key': { value: 1, updatedAt: 1 } } })).status).toBe(400);
    expect((await call('POST', '/api/sync/a', { entries: { 'doremifaaa.x': { value: 1 } } })).status).toBe(400);
    expect((await call('POST', '/api/sync/a', [])).status).toBe(400);
    expect((await call('PUT', '/api/sync/a', { entries: {} })).status).toBe(405);
  });

  it('protects writes with the origin check and the token', async () => {
    const call = await start({ DATA_DIR: join(root, 'data2'), WRITE_TOKEN: 'abc' });
    const body = { entries: { 'doremifaaa.x': { value: 1, updatedAt: 1 } } };
    expect((await call('POST', '/api/sync/a', body, { Origin: 'http://evil.example', Authorization: 'Bearer abc' })).status).toBe(403);
    expect((await call('POST', '/api/sync/a', body)).status).toBe(401);
    expect((await call('POST', '/api/sync/a', body, { Authorization: 'Bearer abc' })).status).toBe(200);
    expect((await call('GET', '/api/sync/a')).status).toBe(200);
  });

  it('is unavailable without a store', async () => {
    const call = await start({ DATA_DIR: '' });
    expect((await call('GET', '/api/sync/a')).status).toBe(404);
  });
});

describe('sync merge', () => {
  it('merges decks item by item and sessions by time', () => {
    expect(mergeDecks({ a: stat(3, 30), b: stat(1, 10) }, { a: stat(2, 40), c: stat(1, 50) })).toEqual({ a: stat(3, 30), b: stat(1, 10), c: stat(1, 50) });
    const s = (at: number) => ({ mode: 'notes', at, total: 1, correct: 1, avgMs: 1 });
    expect(mergeSessions([s(3), s(1)], [s(2), s(3)]).map((x) => x.at)).toEqual([1, 2, 3]);
  });

  it('never lets device-local settings travel', () => {
    expect(sharedSettings({ lang: 'es', libraryUrl: 'http://x', serverToken: 't', syncProfile: 'p', midiInput: 'id', micEnabled: true })).toEqual({ lang: 'es' });
  });

  it('lets a new device take the server values without clobbering them', () => {
    const remote = { 'doremifaaa.settings': { value: { lang: 'de', naming: 'german' }, updatedAt: 100 }, 'doremifaaa.deck.notes': { value: { a: stat(5, 9) }, updatedAt: 100 } };
    const p = plan({ 'doremifaaa.settings': { lang: 'es', naming: 'solfege', libraryUrl: 'http://srv' } }, {}, remote, 200);
    expect(p.push).toEqual({});
    expect(p.local['doremifaaa.settings']).toEqual({ lang: 'de', naming: 'german', libraryUrl: 'http://srv' });
    expect(p.local['doremifaaa.deck.notes']).toEqual({ a: stat(5, 9) });
  });

  it('pushes newer local changes and first-time data', () => {
    const remote = { 'doremifaaa.settings': { value: { lang: 'de' }, updatedAt: 100 } };
    const p = plan({ 'doremifaaa.settings': { lang: 'es', serverToken: 't' }, 'doremifaaa.notes.config': { x: 1 } }, { 'doremifaaa.settings': 150 }, remote, 200);
    expect(p.push['doremifaaa.settings']).toEqual({ value: { lang: 'es' }, updatedAt: 150 });
    expect(p.push['doremifaaa.notes.config']).toEqual({ value: { x: 1 }, updatedAt: 200 });
    expect(p.local).toEqual({});
  });

  it('merges progress both ways and drops what a reset cleared', () => {
    const remote = { 'doremifaaa.deck.notes': { value: { a: stat(5, 50), b: stat(1, 10) }, updatedAt: 100 }, [RESET_KEY]: { value: 40, updatedAt: 100 } };
    const p = plan({ 'doremifaaa.deck.notes': { c: stat(2, 60), d: stat(1, 20) } }, { 'doremifaaa.deck.notes': 90 }, remote, 200);
    expect(p.local['doremifaaa.deck.notes']).toEqual({ a: stat(5, 50), c: stat(2, 60) });
    expect(p.push['doremifaaa.deck.notes'].value).toEqual({ a: stat(5, 50), c: stat(2, 60) });
  });
});

describe('setup link', () => {
  it('reads the server and profile from the hash or the query and cleans the URL', () => {
    expect(setupParams('https://a.io/app/#/?server=http://192.168.1.15:8095/&profile=deck')).toEqual({
      params: { server: 'http://192.168.1.15:8095', profile: 'deck' },
      clean: 'https://a.io/app/#/settings'
    });
    expect(setupParams('https://a.io/app/?server=http://h:1#/library')?.clean).toBe('https://a.io/app/#/library');
    expect(setupParams('https://a.io/app/#/library')).toBeNull();
    expect(setupParams('https://a.io/#/?profile=../x')).toBeNull();
  });

  it('builds a link that round trips', () => {
    const link = setupLink('https://a.io/app/#/settings', 'http://192.168.1.15:8095', 'deck');
    expect(setupParams(link)?.params).toEqual({ server: 'http://192.168.1.15:8095', profile: 'deck' });
    expect(setupParams(setupLink('http://192.168.1.15:8095/#/settings', '', 'default'))?.params).toEqual({ server: 'http://192.168.1.15:8095' });
  });
});

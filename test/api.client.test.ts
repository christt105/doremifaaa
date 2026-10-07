import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, diffMeta, parseTags, patchPiece, uploadPiece, type PieceMeta } from '../src/lib/api';
import { settings, updateSettings } from '../src/lib/settings';

const meta: PieceMeta = { title: 'Wind', composer: null, status: 'Learning', difficulty: null, tags: ['anime'], source: null, video: null, startedAt: null, finishedAt: null, notes: null };

beforeEach(() => vi.stubGlobal('location', { href: 'http://lib.local/' }));
afterEach(() => {
  vi.unstubAllGlobals();
  updateSettings({ serverToken: '' });
});

function reply(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('store api client', () => {
  it('uploads the raw file with its name and the token when set', async () => {
    const fetch = reply(201, { id: 'abcdefghij' });
    vi.stubGlobal('fetch', fetch);
    updateSettings({ serverToken: 'sekret' });
    const body = new Blob(['x']);
    await uploadPiece(body, 'Route 201.pdf');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://lib.local/api/pieces?name=Route+201.pdf');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(body);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sekret' });
  });

  it('sends no Authorization header without a token', async () => {
    const fetch = reply(200, {});
    vi.stubGlobal('fetch', fetch);
    expect(settings.get().serverToken).toBe('');
    await patchPiece('abcdefghij', { title: 'x' });
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"title":"x"}');
  });

  it('maps server errors to kinds the UI can explain', async () => {
    for (const [status, kind] of [
      [401, 'token'],
      [403, 'origin'],
      [409, 'readOnly'],
      [413, 'tooLarge'],
      [415, 'unsupported'],
      [500, 'server']
    ] as const) {
      vi.stubGlobal('fetch', reply(status, { error: 'nope' }));
      await expect(patchPiece('abcdefghij', {})).rejects.toMatchObject({ kind, status, message: 'nope' });
    }
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const err = await patchPiece('abcdefghij', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe('network');
  });
});

describe('metadata helpers', () => {
  it('parses comma separated tags without duplicates or hashes', () => {
    expect(parseTags(' anime, #naruto,,anime\npokemon ')).toEqual(['anime', 'naruto', 'pokemon']);
  });

  it('only sends the fields that changed, with blanks as null', () => {
    expect(diffMeta(meta, { ...meta })).toEqual({});
    expect(diffMeta(meta, { ...meta, title: ' Wind ', status: null, source: '  ', tags: ['anime', 'ost'], startedAt: '2026-10-07' })).toEqual({
      status: null,
      tags: ['anime', 'ost'],
      startedAt: '2026-10-07'
    });
  });
});

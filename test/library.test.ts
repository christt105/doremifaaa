import { afterEach, describe, expect, it, vi } from 'vitest';
import { findServerPiece } from '../src/lib/library';

const piece = { title: 'x', status: null, difficulty: null, tags: [], source: null, video: null, startedAt: null, finishedAt: null, notePath: null, obsidianUrl: null };

afterEach(() => vi.unstubAllGlobals());

describe('server library lookup', () => {
  it('finds a store piece by the vault note it was imported from', async () => {
    vi.stubGlobal('location', { href: 'http://lib.local/' });
    const pieces = [
      { ...piece, id: 'abcdefghij', location: 'store', origin: 'vault', originRef: 'Route 201' },
      { ...piece, id: 'Wind', location: 'vault', origin: null, originRef: null }
    ];
    const fetch = vi.fn(async () => new Response(JSON.stringify({ name: '', scannedAt: 0, pieces }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    expect((await findServerPiece('Route 201'))?.id).toBe('abcdefghij');
    expect((await findServerPiece('abcdefghij'))?.id).toBe('abcdefghij');
    expect((await findServerPiece('Wind'))?.location).toBe('vault');
    expect(await findServerPiece('Missing')).toBeNull();
    expect(fetch).toHaveBeenCalledWith('http://lib.local/api/library', expect.anything());
  });
});

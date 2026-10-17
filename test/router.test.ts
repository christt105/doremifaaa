import { describe, expect, it } from 'vitest';
import { buildHref, legacyHashToPath, parsePath } from '../src/router';

describe('router', () => {
  it('parses the path relative to the base', () => {
    expect(parsePath('/', '/')).toEqual({ path: 'home', params: [] });
    expect(parsePath('/app/', '/app/')).toEqual({ path: 'home', params: [] });
    expect(parsePath('/app/score/server/a%20b', '/app/')).toEqual({ path: 'score', params: ['server', 'a b'] });
    expect(parsePath('/library/', '/')).toEqual({ path: 'library', params: [] });
  });

  it('builds hrefs under the base', () => {
    expect(buildHref('/app/', ['edit', 'a b/c'])).toBe('/app/edit/a%20b%2Fc');
    expect(parsePath(buildHref('/app/', ['piece', 'Nota/uno']), '/app/').params).toEqual(['Nota/uno']);
  });

  it('converts old hash links', () => {
    expect(legacyHashToPath('#/piece/Nota', '', '/app/')).toBe('/app/piece/Nota');
    expect(legacyHashToPath('#/?server=http://h:1', '', '/app/')).toBe('/app/?server=http%3A%2F%2Fh%3A1');
    expect(legacyHashToPath('#/library', '?profile=x', '/')).toBe('/library?profile=x');
    expect(legacyHashToPath('', '', '/')).toBeNull();
  });
});

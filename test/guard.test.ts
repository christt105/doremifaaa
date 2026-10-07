import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM module without types
import { isIpHost, originAllowed, tokenMatches, writeDenied } from '../server/guard.mjs';

const allowed = ['https://christt105.github.io', 'https://music.example.com'];

describe('write guard origins', () => {
  it('accepts listed origins and requests without Origin', () => {
    expect(originAllowed('https://christt105.github.io', '192.168.1.15:8095', allowed)).toBe(true);
    expect(originAllowed(undefined, '192.168.1.15:8095', allowed)).toBe(true);
    expect(originAllowed('', 'localhost:8080', allowed)).toBe(true);
  });

  it('accepts same-origin requests to IP literals and localhost', () => {
    expect(originAllowed('http://192.168.1.15:8095', '192.168.1.15:8095', allowed)).toBe(true);
    expect(originAllowed('http://[::1]:8080', '[::1]:8080', allowed)).toBe(true);
    expect(originAllowed('http://localhost:5173', 'localhost:5173', allowed)).toBe(true);
    expect(originAllowed('http://music.example.com', 'music.example.com', allowed)).toBe(true);
  });

  it('rejects same-origin requests to hostnames that are not listed', () => {
    expect(originAllowed('http://evil.example:8095', 'evil.example:8095', allowed)).toBe(false);
    expect(originAllowed('http://192.168.1.15:8095', '192.168.1.15:9000', allowed)).toBe(false);
    expect(originAllowed('https://other.example', '192.168.1.15:8095', allowed)).toBe(false);
  });

  it('rejects the null origin and does not treat * as a write origin', () => {
    expect(originAllowed('null', 'localhost:8080', allowed)).toBe(false);
    expect(originAllowed('https://any.example', '192.168.1.15:8095', ['*'])).toBe(false);
    expect(originAllowed('*', '192.168.1.15:8095', ['*'])).toBe(false);
    expect(originAllowed('file:///etc', 'localhost', allowed)).toBe(false);
  });

  it('recognises IP literals', () => {
    expect(isIpHost('10.0.0.1')).toBe(true);
    expect(isIpHost('[fe80::1]')).toBe(true);
    expect(isIpHost('example.com')).toBe(false);
  });
});

describe('write guard token', () => {
  it('needs no token when none is configured', () => {
    expect(tokenMatches(undefined, '')).toBe(true);
  });

  it('requires the exact bearer token', () => {
    expect(tokenMatches(undefined, 's3cret')).toBe(false);
    expect(tokenMatches('Bearer wrong', 's3cret')).toBe(false);
    expect(tokenMatches('Bearer s3cret-longer', 's3cret')).toBe(false);
    expect(tokenMatches('s3cret', 's3cret')).toBe(false);
    expect(tokenMatches('Bearer s3cret', 's3cret')).toBe(true);
  });

  it('checks the origin before the token', () => {
    const config = { allowedOrigins: allowed, writeToken: 's3cret' };
    expect(writeDenied({ origin: 'null', host: 'localhost' }, config)).toEqual({ status: 403, error: 'origin not allowed' });
    expect(writeDenied({ host: 'localhost' }, config)).toEqual({ status: 401, error: 'token required' });
    expect(writeDenied({ host: 'localhost', authorization: 'Bearer s3cret' }, config)).toBeNull();
  });
});

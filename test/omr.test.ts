import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM module without types
import { check, scoreXml } from '../tools/audiveris/check.mjs';

describe('OMR quality check', () => {
  const xml = readFileSync('public/samples/minuet.musicxml', 'utf8');

  it('finds nothing wrong in a clean score', () => {
    const r = check(xml);
    expect(r).toMatchObject({ keys: [1], times: ['3/4'], staves: 2, measures: 16, wrongLength: [], emptyStaff: [] });
    expect(scoreXml(Buffer.from(xml))).toBe(xml);
  });

  it('flags measures whose voices do not add up', () => {
    expect(check(xml.replace('<duration>4</duration>', '<duration>8</duration>')).wrongLength).toEqual(['1']);
  });

  it('flags staves with no notes in a measure', () => {
    const silent = xml.replace(/(<measure number="3">[\s\S]*?<backup>[\s\S]*?)<note><pitch>[\s\S]*?<\/note>/, '$1');
    expect(check(silent).emptyStaff).toEqual(['3:2']);
  });
});

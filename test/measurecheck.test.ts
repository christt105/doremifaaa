// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkMeasures, measureContext, partMeasures, firstPart, summarize } from '../src/lib/measurecheck';
import { readScoreXml } from '../src/lib/mxl';
// @ts-expect-error plain ESM module without types
import { check } from '../server/omrcheck.mjs';

const REAL_DIR = '/home/bot/scratch/doremi-vault/Piano/Partituras/_musicxml/';
const sample = (name: string) => readFileSync(`public/samples/${name}.musicxml`, 'utf8');
const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const minuet = sample('minuet');
const ode = sample('ode-to-joy');
const twinkle = sample('twinkle');

describe('measure check', () => {
  it('matches the server check on the bundled samples', () => {
    for (const xml of [minuet, ode, twinkle]) expect(summarize(parse(xml))).toEqual(check(xml));
    expect(summarize(parse(minuet))).toEqual({ keys: [1], times: ['3/4'], staves: 2, measures: 16, notes: 87, wrongLength: [], emptyStaff: [] });
    expect(summarize(parse(ode))).toEqual({ keys: [0], times: ['4/4'], staves: 2, measures: 8, notes: 59, wrongLength: [], emptyStaff: [] });
    expect(summarize(parse(twinkle))).toEqual({ keys: [0], times: ['4/4'], staves: 2, measures: 12, notes: 64, wrongLength: [], emptyStaff: [] });
  });

  const mutations: [string, string, number, string[], string[], string[]][] = [
    ['longer note', minuet.replace('<duration>4</duration>', '<duration>8</duration>'), 87, ['1'], [], ['3/4']],
    ['silent staff', minuet.replace(/(<measure number="3">[\s\S]*?<backup>[\s\S]*?)<note><pitch>[\s\S]*?<\/note>/, '$1'), 86, [], ['3:2'], ['3/4']],
    [
      'implicit measure',
      ode
        .replace('<measure number="2">', '<measure number="2" implicit="yes">')
        .replace(/(<measure number="2"[\s\S]*?)<duration>4<\/duration>/, '$1<duration>2</duration>'),
      59,
      [],
      [],
      ['4/4']
    ],
    ['chord member', twinkle.replace(/(<measure number="2">[\s\S]*?<note>)/, '$1<chord/>'), 64, ['2'], [], ['4/4']],
    ['grace note', twinkle.replace(/(<measure number="5">[\s\S]*?<note>)/, '$1<grace/>'), 64, ['5'], [], ['4/4']],
    [
      'divisions carried forward',
      minuet.replace(/(<measure number="5">)/, '$1<attributes><divisions>8</divisions></attributes>'),
      87,
      ['5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16'],
      [],
      ['3/4']
    ],
    [
      'time carried forward',
      twinkle.replace(/(<measure number="7">)/, '$1<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>'),
      64,
      ['7', '8', '9', '10', '11', '12'],
      [],
      ['4/4', '3/4']
    ],
    [
      'rests only',
      ode.replace(/(<measure number="4">[\s\S]*?<\/measure>)/, (m) => m.replace(/<pitch>[\s\S]*?<\/pitch>/g, '<rest/>')),
      54,
      [],
      ['4:1', '4:2'],
      ['4/4']
    ]
  ];

  it.each(mutations)('matches check.mjs on a mutated sample (%s)', (_, xml, notes, wrongLength, emptyStaff, times) => {
    expect(summarize(parse(xml))).toMatchObject({ notes, wrongLength, emptyStaff, times });
  });

  it('explains each voice against the expected length', () => {
    const doc = parse(minuet.replace('<duration>4</duration>', '<duration>8</duration>'));
    const [first, second] = checkMeasures(doc);
    expect(first).toMatchObject({ index: 0, number: '1', divisions: 4, beats: 3, beatType: 4, expected: 12, wrongLength: true, emptyStaves: [] });
    expect(first.voices).toEqual([
      { staff: 1, voice: 1, duration: 16, delta: 4 },
      { staff: 2, voice: 2, duration: 12, delta: 0 }
    ]);
    expect(second.wrongLength).toBe(false);
  });

  it('carries context into a single measure', () => {
    const doc = parse(minuet.replace(/(<measure number="5">)/, '$1<attributes><divisions>8</divisions></attributes>'));
    const measures = partMeasures(firstPart(doc));
    expect(measureContext(measures[3])).toEqual({ divisions: 4, beats: 3, beatType: 4, fifths: 1, expected: 12 });
    expect(measureContext(measures[7])).toMatchObject({ divisions: 8, expected: 24 });
  });

  it('counts forwards with a voice only when asked', () => {
    const xml = twinkle.replace(
      /(<measure number="2">[\s\S]*?<backup><duration>16<\/duration><\/backup>)<note>[\s\S]*?<\/note>/,
      '$1<forward><duration>8</duration><voice>2</voice><staff>2</staff></forward>'
    );
    const doc = parse(xml);
    expect(summarize(doc).wrongLength).toEqual(['2']);
    expect(summarize(doc, checkMeasures(doc, { countForward: true })).wrongLength).toEqual([]);
  });

  const real: [string, number, number, string, string, number][] = [
  ['Blue Bird.mxl', 99, 678, '64', '1:2 97:2 98:2 99:2', 1],
  ['Call of Silence.mxl', 45, 252, '1 2 3 4 5 6 7 8 10 11 13 15 16 17 18 19 20 22 27 28 29 30 31 34 36 37 39 41 43 44', '1:2 2:2 5:2 8:2 9:2 10:2 12:1 14:1 19:2 21:1 23:1 24:1 25:1 28:2 31:2 32:1 33:2 34:1 35:2 40:1 42:1 45:1 45:2', 29],
  ['Despair.mxl', 39, 306, '30', '1:1 2:1 19:1 20:1 37:1 38:1 39:1', 1],
  ['Hokage’s Funeral.mxl', 30, 430, '', '', 0],
  ['Hollow Knight Main Theme.mxl', 26, 198, '7 12 15 17 21 22', '9:1', 6],
  ['Hollow Knight Medley.mxl', 264, 3547, '9 11 16 19 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 60 61 62 64 65 66 67 68 69 70 71 72 74 75 76 77 78 79 80 81 88 97 98 127 152 183 196 204 220 224 225 226 227 228 229 230 231 232 233 234 235 236 237 238 240 241 242 243 244 245 246 269', '50:2 51:2 72:2 100:2 219:1 221:2 222:2 223:2', 89],
  ['More Than Words.mxl', 49, 787, '48', '46:1 47:1 49:2', 1],
  ['Pokémon Diamante Introducción.mxl', 71, 1180, '3 5 6 11 15 17 19 20 23 24 25 26 29 35 36 37 38 40 41 42 44 45 46 48 50 53 54 55 56 59 61 65 67 69 70', '1:2 2:2', 26],
  ['Pokémon League Sinnoh.mxl', 25, 280, '18 19', '9:1 13:1 15:1 24:1 25:2', 2],
  ['Route 201.mxl', 16, 153, '15', '', 1],
  ['Sadness and Sorrow.mxl', 56, 398, '25 36 44', '', 3],
  ['Twinleaf Town.mxl', 54, 898, '14 28 33 35 35 36', '5:1', 4],
  ['Wind.mxl', 99, 1432, '1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95 96 97', '97:1', 97],
  ];
  const split = (s: string) => (s ? s.split(' ') : []);

  it.skipIf(!existsSync(REAL_DIR)).each(real)('matches check.mjs on the Audiveris output %s', async (file, measures, notes, wrong, empty, wrongWithForward) => {
    const xml = await readScoreXml(readFileSync(REAL_DIR + file));
    const doc = parse(xml);
    const results = checkMeasures(doc);
    expect(summarize(doc, results)).toEqual(check(xml));
    expect(summarize(doc, results)).toMatchObject({ staves: 2, measures, notes, wrongLength: split(wrong), emptyStaff: split(empty) });
    expect(checkMeasures(doc, { countForward: true }).filter((r) => r.wrongLength)).toHaveLength(wrongWithForward);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_CONFIG, candidates, isCorrect, makeItem, parseItemId } from '../src/lib/notegen';
import { pick, record, weight, type Deck } from '../src/lib/srs';
import { daily, errorByMidi, noteRows, streak, weakest } from '../src/lib/stats';
import { DEFAULT_KEY_CONFIG, keyCandidates, keyHint, keyLabel, keyQuestion, tonicPitchClass } from '../src/lib/keygen';

describe('note generation', () => {
  it('covers the staff plus the requested ledger lines', () => {
    const ids = candidates({ ...DEFAULT_NOTE_CONFIG, clef: 'treble', below: 0, above: 0 }, 0);
    const midis = ids.map((id) => makeItem(id, 0).midi).sort((a, b) => a - b);
    expect(midis[0]).toBe(62);
    expect(midis[midis.length - 1]).toBe(79);
    const wider = candidates({ ...DEFAULT_NOTE_CONFIG, clef: 'bass', below: 2, above: 2 }, 0).map((id) => makeItem(id, 0).midi);
    expect(Math.min(...wider)).toBe(35);
    expect(Math.max(...wider)).toBe(65);
  });

  it('applies the key signature to the expected pitch', () => {
    const ids = candidates({ ...DEFAULT_NOTE_CONFIG, clef: 'treble' }, 2);
    const f5 = ids.map((id) => makeItem(id, 2)).find((i) => i.note.letter === 3 && i.note.octave === 5);
    expect(f5?.midi).toBe(78);
    const c5 = ids.map((id) => makeItem(id, 2)).find((i) => i.note.letter === 0 && i.note.octave === 5);
    expect(c5?.midi).toBe(73);
  });

  it('adds accidentals only on black keys', () => {
    const ids = candidates({ ...DEFAULT_NOTE_CONFIG, accidentals: true }, 0);
    const parsed = ids.map((id) => parseItemId(id)!.note);
    expect(parsed.some((n) => n.letter === 2 && n.acc === 1)).toBe(false);
    expect(parsed.some((n) => n.letter === 3 && n.acc === 1)).toBe(true);
    expect(parsed.some((n) => n.letter === 0 && n.acc === -1)).toBe(false);
  });

  it('checks answers with or without octave', () => {
    const item = makeItem('treble:28:0', 0);
    expect(item.midi).toBe(60);
    expect(isCorrect(item, 60, true)).toBe(true);
    expect(isCorrect(item, 72, true)).toBe(false);
    expect(isCorrect(item, 72, false)).toBe(true);
    expect(isCorrect(item, 61, false)).toBe(false);
  });
});

describe('spaced repetition', () => {
  it('drops to the first box on a miss and climbs on fast answers', () => {
    let deck: Deck = {};
    deck = record(deck, 'a', true, 800, 2000);
    deck = record(deck, 'a', true, 800, 2000);
    expect(deck.a.box).toBe(2);
    deck = record(deck, 'a', true, 3000, 2000);
    expect(deck.a.box).toBe(2);
    deck = record(deck, 'a', false, 800, 2000);
    expect(deck.a.box).toBe(0);
    expect(deck.a.seen).toBe(4);
    expect(deck.a.correct).toBe(3);
  });

  it('favours weak items', () => {
    let deck: Deck = {};
    for (let i = 0; i < 5; i++) deck = record(deck, 'easy', true, 500, 2000);
    for (let i = 0; i < 3; i++) deck = record(deck, 'hard', false, 500, 2000);
    expect(weight(deck.hard)).toBeGreaterThan(weight(deck.easy) * 5);
    let seq = 0;
    const rng = () => ((seq = (seq * 9301 + 49297) % 233280) / 233280);
    const counts = { easy: 0, hard: 0 };
    for (let i = 0; i < 2000; i++) counts[pick(['easy', 'hard'], deck, [], rng) as 'easy' | 'hard']++;
    expect(counts.hard).toBeGreaterThan(counts.easy * 5);
  });

  it('avoids immediate repeats when possible', () => {
    for (let i = 0; i < 50; i++) expect(pick(['a', 'b', 'c'], {}, ['a', 'b'])).toBe('c');
    expect(pick(['a'], {}, ['a'])).toBe('a');
  });
});

describe('key signature questions', () => {
  it('filters by side and number of accidentals', () => {
    const ids = keyCandidates({ ...DEFAULT_KEY_CONFIG, side: 'sharps', maxAccidentals: 3 });
    expect(ids).toEqual(['0:major', '1:major', '2:major', '3:major']);
    const both = keyCandidates({ ...DEFAULT_KEY_CONFIG, mode: 'both', maxAccidentals: 1 });
    expect(both).toHaveLength(6);
  });

  it('resolves the tonic for major and minor', () => {
    expect(tonicPitchClass(keyQuestion('-3:major'))).toBe(3);
    expect(tonicPitchClass(keyQuestion('-3:minor'))).toBe(0);
    expect(tonicPitchClass(keyQuestion('6:major'))).toBe(6);
    expect(keyLabel(keyQuestion('4:minor').key, 'minor', 'solfege')).toBe('Do♯m');
  });

  it('gives the classic recognition tips', () => {
    expect(keyHint(keyQuestion('3:major').key, 'letters')).toEqual({ rule: 'sharps', note: 'G♯', major: 'A', minor: 'F♯' });
    expect(keyHint(keyQuestion('-4:major').key, 'letters')).toEqual({ rule: 'flats', note: 'A♭', major: 'A♭', minor: 'F' });
    expect(keyHint(keyQuestion('-1:major').key, 'letters')).toEqual({ rule: 'oneFlat', note: 'B♭', major: 'F', minor: 'D' });
    expect(keyHint(keyQuestion('0:major').key, 'solfege')).toEqual({ rule: 'none', note: '', major: 'Do', minor: 'La' });
  });
});

describe('stats aggregation', () => {
  const stat = (seen: number, correct: number, box: number, avgMs = 1000) => ({ seen, correct, box, last: 0, avgMs });

  it('aggregates note misses per pitch and clef', () => {
    const rows = noteRows({ 'treble:28:0': stat(4, 1, 0), 'treble:28:1': stat(2, 2, 2), 'bass:28:0': stat(3, 3, 3), junk: stat(1, 1, 1) });
    expect(rows).toHaveLength(3);
    const treble = errorByMidi(rows, 'treble');
    expect(treble.get(60)).toEqual({ seen: 4, errors: 3 });
    expect(treble.get(61)).toEqual({ seen: 2, errors: 0 });
  });

  it('ranks the weakest items and skips mastered ones', () => {
    const rows = noteRows({ 'treble:30:0': stat(5, 1, 0, 3000), 'treble:31:0': stat(5, 4, 2), 'treble:32:0': stat(8, 8, 5), 'treble:33:0': stat(1, 0, 0) });
    expect(weakest(rows, 5).map((r) => r.id)).toEqual(['treble:30:0', 'treble:31:0']);
  });

  it('buckets sessions per day and counts the streak', () => {
    const now = new Date(2026, 9, 4, 12).getTime();
    const day = 86400000;
    const sessions = [
      { mode: 'notes', at: now - 2 * day, total: 10, correct: 8, avgMs: 1 },
      { mode: 'keys', at: now - day, total: 5, correct: 5, avgMs: 1 },
      { mode: 'notes', at: now, total: 20, correct: 10, avgMs: 1 },
      { mode: 'notes', at: now, total: 1, correct: 1, avgMs: 1 }
    ];
    const buckets = daily(sessions, 3, now);
    expect(buckets.map((b) => b.answers)).toEqual([10, 5, 21]);
    expect(streak(sessions, now)).toBe(3);
    expect(streak(sessions.slice(0, 2), now)).toBe(2);
    expect(streak(sessions.slice(0, 1), now)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_SIGHT_CONFIG, generate, judgeTempo, levelCount, noteAt } from '../src/lib/sightgen';
import { STAFF_LINES, pitchClass } from '../src/lib/music';
import { keyByFifths } from '../src/lib/keys';
import { toMidi } from '../src/lib/music';

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

describe('sight-reading generator', () => {
  it('fills every measure with exactly four beats', () => {
    for (let level = 1; level <= levelCount(); level++)
      for (let seed = 1; seed < 40; seed++) {
        const f = generate({ ...DEFAULT_SIGHT_CONFIG, level, measures: 4 }, seeded(seed));
        for (let m = 0; m < 4; m++) {
          const beats = f.notes.filter((n) => n.measure === m).reduce((a, n) => a + n.beats, 0);
          expect(beats).toBe(4);
        }
      }
  });

  it('stays within the level range and ends on the tonic', () => {
    for (let seed = 1; seed < 60; seed++) {
      const f = generate({ ...DEFAULT_SIGHT_CONFIG, level: 1, keyMax: 4, measures: 4 }, seeded(seed));
      const { bottom, top } = STAFF_LINES.treble;
      f.notes.forEach((n) => {
        const d = n.note.octave * 7 + n.note.letter;
        expect(d).toBeGreaterThanOrEqual(bottom);
        expect(d).toBeLessThanOrEqual(top);
      });
      const tonic = pitchClass(toMidi(keyByFifths(f.fifths).major));
      expect(pitchClass(f.notes[f.notes.length - 1].midi)).toBe(tonic);
      expect(Math.abs(f.fifths)).toBeLessThanOrEqual(4);
    }
  });

  it('only moves by steps and small leaps at level 1', () => {
    for (let seed = 1; seed < 40; seed++) {
      const f = generate({ ...DEFAULT_SIGHT_CONFIG, level: 1 }, seeded(seed));
      for (let i = 1; i < f.notes.length - 1; i++) {
        const a = f.notes[i - 1].note;
        const b = f.notes[i].note;
        expect(Math.abs(a.octave * 7 + a.letter - (b.octave * 7 + b.letter))).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('tempo judging', () => {
  const f = generate({ ...DEFAULT_SIGHT_CONFIG, level: 2, measures: 2 }, seeded(7));

  it('finds the note under the cursor', () => {
    expect(noteAt(f, 0)).toBe(0);
    expect(noteAt(f, 7.9)).toBe(f.notes.length - 1);
  });

  it('matches the nearest unjudged note inside the window', () => {
    const judged = new Set<number>();
    const first = judgeTempo(f, judged, f.notes[0].midi, 0.2);
    expect(first).toEqual({ index: 0, hit: true });
    judged.add(0);
    const second = f.notes[1];
    expect(judgeTempo(f, judged, second.midi + 1, second.onset - 0.1)).toEqual({ index: 1, hit: false });
    expect(judgeTempo(f, new Set(f.notes.map((_, i) => i)), 60, 1)).toBeNull();
  });
});

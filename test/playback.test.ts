import { describe, expect, it } from 'vitest';
import type { Step } from '../src/lib/follower';
import { segment, sounding } from '../src/lib/playback';

const R = (midi: number, length = 0.25) => ({ midi, hand: 'right' as const, length });
const L = (midi: number, length = 0.25) => ({ midi, hand: 'left' as const, length });

const steps: Step[] = [
  { notes: [R(74), L(55, 0.5), L(59, 0.5)], measure: 0, time: 0, bpm: 120 },
  { notes: [R(67, 0.125)], measure: 0, time: 0.25, bpm: 120 },
  { notes: [R(69, 0.125)], measure: 0, time: 0.375, bpm: 120 },
  { notes: [], measure: 0, time: 0.5, bpm: 120 },
  { notes: [R(71), L(57)], measure: 1, time: 0.75, bpm: 60 },
  { notes: [R(72)], measure: 1, time: 1, bpm: 60 }
];

describe('playback timeline', () => {
  it('turns score time into seconds at the step tempo', () => {
    const { cues, end } = segment(steps, 0, steps.length, 'both', 1);
    expect(cues.map((c) => c.at)).toEqual([0, 0.5, 0.75, 1, 1.5, 2.5]);
    expect(cues[0].notes).toEqual([
      { midi: 74, duration: 0.5 },
      { midi: 55, duration: 1 },
      { midi: 59, duration: 1 }
    ]);
    expect(cues[4].notes[0]).toEqual({ midi: 71, duration: 1 });
    expect(end).toBe(3.5);
  });

  it('keeps rests as cues so the cursor moves through them', () => {
    const { cues } = segment(steps, 0, steps.length, 'both', 1);
    expect(cues[3]).toEqual({ index: 3, at: 1, notes: [] });
  });

  it('slows down with the speed factor', () => {
    const half = segment(steps, 0, steps.length, 'both', 0.5);
    expect(half.cues.map((c) => c.at)).toEqual([0, 1, 1.5, 2, 3, 5]);
    expect(half.end).toBe(7);
  });

  it('plays only the chosen hand', () => {
    const { cues } = segment(steps, 0, steps.length, 'right', 1);
    expect(cues[0].notes.map((n) => n.midi)).toEqual([74]);
    expect(cues[4].notes.map((n) => n.midi)).toEqual([71]);
    const left = segment(steps, 0, steps.length, 'left', 1);
    expect(left.cues[1].notes).toEqual([]);
  });

  it('starts from any step and stops before the end bound', () => {
    const { cues, end } = segment(steps, 1, 4, 'both', 1);
    expect(cues.map((c) => [c.index, c.at])).toEqual([
      [1, 0],
      [2, 0.25],
      [3, 0.5]
    ]);
    expect(end).toBe(1);
  });

  it('lasts until the longest note when it outlives the last step', () => {
    const { end } = segment(steps, 0, 1, 'both', 1);
    expect(end).toBe(1);
  });

  it('merges unisons from different voices into the longest note', () => {
    const unison: Step[] = [{ notes: [R(60, 0.25), L(60, 1)], measure: 0, time: 0, bpm: 60 }];
    expect(segment(unison, 0, 1, 'both', 1).cues[0].notes).toEqual([{ midi: 60, duration: 4 }]);
  });

  it('lists the notes still sounding at a given moment', () => {
    const { cues } = segment(steps, 0, steps.length, 'both', 1);
    expect(sounding(cues, 0.1).sort()).toEqual([55, 59, 74]);
    expect(sounding(cues, 0.6).sort()).toEqual([55, 59, 67]);
    expect(sounding(cues, 1.2)).toEqual([]);
  });
});

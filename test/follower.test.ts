import { describe, expect, it } from 'vitest';
import { Follower, type Step } from '../src/lib/follower';

const R = (midi: number) => ({ midi, hand: 'right' as const });
const L = (midi: number) => ({ midi, hand: 'left' as const });

const steps: Step[] = [
  { notes: [R(64), L(48)], measure: 0 },
  { notes: [R(65)], measure: 0 },
  { notes: [], measure: 0 },
  { notes: [R(67), R(72), L(43)], measure: 1 },
  { notes: [L(45)], measure: 1 },
  { notes: [R(60)], measure: 2 }
];

describe('score follower', () => {
  it('waits for every note of a chord before advancing', () => {
    const f = new Follower(steps);
    expect(f.noteOn(64, 0).kind).toBe('partial');
    expect(f.noteOn(48, 10)).toEqual({ kind: 'advance', from: 0, to: 1 });
  });

  it('skips steps with nothing to play', () => {
    const f = new Follower(steps);
    f.noteOn(64, 0);
    f.noteOn(48, 0);
    expect(f.noteOn(65, 1000)).toEqual({ kind: 'advance', from: 1, to: 3 });
  });

  it('counts wrong notes per measure but ignores a rolled chord tail', () => {
    const f = new Follower(steps);
    f.noteOn(64, 0);
    f.noteOn(48, 0);
    expect(f.noteOn(64, 50).kind).toBe('ignored');
    expect(f.noteOn(70, 500)).toEqual({ kind: 'wrong', midi: 70, measure: 0 });
    expect(f.errors.get(0)).toBe(1);
    expect(f.index).toBe(1);
  });

  it('filters by hand', () => {
    const f = new Follower(steps, 'right');
    f.noteOn(64, 0);
    f.noteOn(65, 1000);
    f.noteOn(67, 2000);
    expect(f.noteOn(72, 2010)).toEqual({ kind: 'advance', from: 3, to: 5 });
    const left = new Follower(steps, 'left');
    expect(left.expected).toEqual([48]);
    left.noteOn(48, 0);
    expect(left.index).toBe(3);
  });

  it('loops a measure range', () => {
    const f = new Follower(steps, 'left', { from: 1, to: 1 });
    expect(f.index).toBe(3);
    f.noteOn(43, 0);
    expect(f.noteOn(45, 1000)).toEqual({ kind: 'loop', from: 4, to: 3 });
  });

  it('finishes at the end', () => {
    const f = new Follower(steps, 'right');
    [64, 65, 67, 72].forEach((m, i) => f.noteOn(m, i * 1000));
    expect(f.noteOn(60, 9000)).toEqual({ kind: 'done', from: 5 });
    expect(f.noteOn(60, 10000).kind).toBe('ignored');
    f.restart();
    expect(f.index).toBe(0);
  });

  it('reports the worst measures', () => {
    const f = new Follower(steps);
    f.noteOn(1, 0);
    f.noteOn(64, 0);
    f.noteOn(48, 0);
    f.noteOn(65, 1000);
    f.noteOn(2, 2000);
    f.noteOn(3, 2100);
    expect(f.worstMeasures()).toEqual([
      { measure: 1, errors: 2 },
      { measure: 0, errors: 1 }
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { deltaLabel, newVoiceFor, nextBad, rhythmLabel, stepBy, toSpelled } from '../src/lib/editor';
import type { MeasureCheck } from '../src/lib/measurecheck';

const m = (wrongLength: boolean, emptyStaves: number[] = []) => ({ wrongLength, emptyStaves }) as MeasureCheck;

describe('editor helpers', () => {
  it('labels rhythms and missing durations', () => {
    expect(rhythmLabel('eighth', 1)).toBe('1/8.');
    expect(rhythmLabel(null, 0)).toBe('?');
    expect(deltaLabel(-2, 4)).toBe('1/8');
    expect(deltaLabel(6, 4)).toBe('1/4.');
    expect(deltaLabel(5, 4)).toBe('1.25 × 1/4');
  });

  it('jumps between measures with warnings', () => {
    const checks = [m(false), m(true), m(false), m(false, [2]), m(false)];
    expect(nextBad(checks, -1, 1)).toBe(1);
    expect(nextBad(checks, 1, 1)).toBe(3);
    expect(nextBad(checks, 3, 1)).toBeNull();
    expect(nextBad(checks, 3, -1)).toBe(1);
  });

  it('moves pitches by scale steps across octaves', () => {
    expect(stepBy({ step: 'B', octave: 4 }, 1)).toEqual({ step: 'C', octave: 5 });
    expect(stepBy({ step: 'C', octave: 4 }, -1)).toEqual({ step: 'B', octave: 3 });
    expect(stepBy({ step: 'E', octave: 4 }, 2)).toEqual({ step: 'G', octave: 4 });
    expect(toSpelled({ step: 'B', alter: -1, octave: 3 })).toEqual({ letter: 6, acc: -1, octave: 3 });
  });

  it('picks a free voice number for a staff', () => {
    expect(newVoiceFor(1, [])).toBe(1);
    expect(newVoiceFor(2, [])).toBe(5);
    expect(newVoiceFor(2, [5])).toBe(6);
  });
});

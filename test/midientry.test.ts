import { describe, expect, it } from 'vitest';
import { planEntry, spellMidi, staffFor } from '../src/lib/midientry';
import type { NoteInfo, VoiceNotes } from '../src/lib/scoreedit';

const note = (handle: number, extra: Partial<NoteInfo> = {}) => ({ handle, grace: false, chord: false, rest: false }) as NoteInfo & typeof extra;
const voice = (staff: number, v: number, handles: number[]): VoiceNotes => ({ staff, voice: v, duration: 0, notes: handles.map((h) => note(h)) });

describe('MIDI note entry', () => {
  it('spells black keys with the key signature', () => {
    expect(spellMidi(61, 0)).toEqual({ step: 'C', octave: 4, alter: 1 });
    expect(spellMidi(61, -3)).toEqual({ step: 'D', octave: 4, alter: -1 });
    expect(spellMidi(60, -3)).toEqual({ step: 'C', octave: 4, alter: 0 });
  });

  it('sends low notes to the lower staff', () => {
    expect(staffFor(60, [1, 2])).toBe(1);
    expect(staffFor(59, [1, 2])).toBe(2);
    expect(staffFor(40, [1])).toBe(1);
  });

  it('appends after the selection, the voice end, or starts an empty voice', () => {
    const base = { staves: [1, 2], lastInserted: null, lastAt: 0, now: 1000 };
    expect(planEntry({ ...base, voices: [voice(1, 1, [0, 1])], selected: 0, midi: 72 }).at).toEqual({ after: 0 });
    expect(planEntry({ ...base, voices: [voice(1, 1, [0, 1])], selected: null, midi: 72 }).at).toEqual({ after: 1 });
    expect(planEntry({ ...base, voices: [voice(1, 1, [0, 1])], selected: null, midi: 48 }).at).toEqual({ staff: 2, voice: 5 });
  });

  it('turns notes played together into a chord', () => {
    const base = { voices: [voice(1, 1, [0])], staves: [1, 2], selected: 3, midi: 64 };
    expect(planEntry({ ...base, lastInserted: 3, lastAt: 1000, now: 1050 })).toEqual({ kind: 'chord', target: 3, at: null });
    expect(planEntry({ ...base, lastInserted: 3, lastAt: 1000, now: 1200 }).kind).toBe('insert');
  });
});

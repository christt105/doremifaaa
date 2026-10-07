import { LETTERS, fromMidi } from './music';
import type { InsertAt, Step, VoiceNotes } from './scoreedit';

export const CHORD_WINDOW_MS = 80;

export interface SpelledPitch {
  step: Step;
  octave: number;
  alter: number;
}

export function spellMidi(midi: number, fifths: number): SpelledPitch {
  const s = fromMidi(midi, fifths < 0);
  return { step: LETTERS[s.letter] as Step, octave: s.octave, alter: s.acc };
}

export function staffFor(midi: number, staves: number[]): number {
  if (staves.length < 2) return staves[0] ?? 1;
  return midi >= 60 ? Math.min(...staves) : Math.max(...staves);
}

export interface Entry {
  kind: 'chord' | 'insert';
  target: number | null;
  at: InsertAt | null;
}

export function planEntry(o: { voices: VoiceNotes[]; staves: number[]; selected: number | null; lastInserted: number | null; lastAt: number; now: number; midi: number }): Entry {
  if (o.lastInserted !== null && o.now - o.lastAt <= CHORD_WINDOW_MS) return { kind: 'chord', target: o.lastInserted, at: null };
  if (o.selected !== null) return { kind: 'insert', target: null, at: { after: o.selected } };
  const staff = staffFor(o.midi, o.staves);
  const voice = o.voices.find((v) => v.staff === staff);
  if (voice) {
    const last = [...voice.notes].reverse().find((n) => !n.grace);
    if (last) return { kind: 'insert', target: null, at: { after: last.handle } };
  }
  return { kind: 'insert', target: null, at: { staff, voice: staff >= 2 ? 5 : 1 } };
}

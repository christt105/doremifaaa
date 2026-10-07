import type { MeasureCheck } from './measurecheck';
import { LETTERS, type Accidental, type Spelled } from './music';
import { durationType, type NoteType, type Pitch, type Step } from './scoreedit';

export const EDIT_TYPES: NoteType[] = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd'];
export const TYPE_LABEL: Record<string, string> = { whole: '1', half: '1/2', quarter: '1/4', eighth: '1/8', '16th': '1/16', '32nd': '1/32', '64th': '1/64' };

export function rhythmLabel(type: NoteType | null, dots: number): string {
  return (type ? (TYPE_LABEL[type] ?? type) : '?') + '.'.repeat(dots);
}

export function deltaLabel(delta: number, divisions: number): string {
  const abs = Math.abs(delta);
  const t = durationType(abs, divisions);
  if (t && TYPE_LABEL[t.type]) return rhythmLabel(t.type, t.dots);
  const quarters = abs / divisions;
  return `${Number.isInteger(quarters) ? quarters : quarters.toFixed(2)} × 1/4`;
}

export function isBad(c: MeasureCheck): boolean {
  return c.wrongLength || c.emptyStaves.length > 0;
}

export function nextBad(checks: MeasureCheck[], from: number, dir: 1 | -1): number | null {
  for (let i = from + dir; i >= 0 && i < checks.length; i += dir) if (isBad(checks[i])) return i;
  return null;
}

export function toSpelled(p: Pitch): Spelled {
  return { letter: LETTERS.indexOf(p.step), acc: p.alter as Accidental, octave: p.octave };
}

export function stepBy(p: { step: Step; octave: number }, by: number): { step: Step; octave: number } {
  const index = LETTERS.indexOf(p.step) + p.octave * 7 + by;
  return { step: LETTERS[((index % 7) + 7) % 7] as Step, octave: Math.floor(index / 7) };
}

export function defaultPitch(staff: number): { step: Step; octave: number } {
  return staff >= 2 ? { step: 'C', octave: 3 } : { step: 'C', octave: 5 };
}

export function newVoiceFor(staff: number, used: number[]): number {
  const preferred = staff >= 2 ? 5 : 1;
  if (!used.includes(preferred)) return preferred;
  return Math.max(...used) + 1;
}

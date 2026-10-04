import { KEY_SIGNATURES, keyAccidentalFor } from './keys';
import { type Accidental, type Clef, type Spelled, fromDiatonic, rangeForLedgers, toMidi } from './music';

export type ClefChoice = Clef | 'mixed';
export type KeyChoice = 'none' | 'random' | number;

export interface NoteConfig {
  clef: ClefChoice;
  below: number;
  above: number;
  accidentals: boolean;
  key: KeyChoice;
  strictOctave: boolean;
  length: number;
}

export const DEFAULT_NOTE_CONFIG: NoteConfig = {
  clef: 'treble',
  below: 1,
  above: 1,
  accidentals: false,
  key: 'none',
  strictOctave: true,
  length: 20
};

export interface NoteItem {
  id: string;
  clef: Clef;
  note: Spelled;
  fifths: number;
  midi: number;
}

export function itemId(clef: Clef, note: Spelled): string {
  return `${clef}:${note.octave * 7 + note.letter}:${note.acc}`;
}

export function parseItemId(id: string): { clef: Clef; note: Spelled } | null {
  const [clef, d, acc] = id.split(':');
  if ((clef !== 'treble' && clef !== 'bass') || d === undefined) return null;
  return { clef, note: fromDiatonic(Number(d), Number(acc ?? 0) as Accidental) };
}

export function clefsFor(choice: ClefChoice): Clef[] {
  return choice === 'mixed' ? ['treble', 'bass'] : [choice];
}

export function chooseFifths(choice: KeyChoice, rng: () => number = Math.random): number {
  if (choice === 'none') return 0;
  if (choice === 'random') return KEY_SIGNATURES[Math.floor(rng() * KEY_SIGNATURES.length)].fifths;
  return choice;
}

export function candidates(cfg: NoteConfig, fifths: number): string[] {
  const ids: string[] = [];
  for (const clef of clefsFor(cfg.clef)) {
    const { min, max } = rangeForLedgers(clef, cfg.below, cfg.above);
    for (let d = min; d <= max; d++) {
      const base = fromDiatonic(d);
      const inKey = keyAccidentalFor(base.letter, fifths);
      ids.push(itemId(clef, { ...base, acc: inKey }));
      if (cfg.accidentals && fifths === 0) {
        if (base.letter !== 2 && base.letter !== 6) ids.push(itemId(clef, { ...base, acc: 1 }));
        if (base.letter !== 0 && base.letter !== 3) ids.push(itemId(clef, { ...base, acc: -1 }));
      }
    }
  }
  return ids;
}

export function makeItem(id: string, fifths: number): NoteItem {
  const parsed = parseItemId(id)!;
  return { id, clef: parsed.clef, note: parsed.note, fifths, midi: toMidi(parsed.note) };
}

export function isCorrect(item: NoteItem, played: number, strictOctave: boolean): boolean {
  if (strictOctave) return played === item.midi;
  return (((played - item.midi) % 12) + 12) % 12 === 0;
}

export function keyboardRange(choice: ClefChoice): { low: number; high: number } {
  if (choice === 'treble') return { low: 48, high: 96 };
  if (choice === 'bass') return { low: 24, high: 72 };
  return { low: 24, high: 96 };
}

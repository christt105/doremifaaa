export type Clef = 'treble' | 'bass';
export type Naming = 'solfege' | 'letters';
export type Accidental = -2 | -1 | 0 | 1 | 2;

export interface Spelled {
  letter: number;
  acc: Accidental;
  octave: number;
}

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];

export const STAFF_LINES: Record<Clef, { bottom: number; top: number }> = {
  treble: { bottom: diatonic(2, 4), top: diatonic(3, 5) },
  bass: { bottom: diatonic(4, 2), top: diatonic(5, 3) }
};

export function diatonic(letter: number, octave: number): number {
  return octave * 7 + letter;
}

export function fromDiatonic(index: number, acc: Accidental = 0): Spelled {
  const octave = Math.floor(index / 7);
  return { letter: index - octave * 7, acc, octave };
}

export function diatonicOf(s: Spelled): number {
  return diatonic(s.letter, s.octave);
}

export function toMidi(s: Spelled): number {
  return (s.octave + 1) * 12 + NATURAL_PC[s.letter] + s.acc;
}

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function fromMidi(midi: number, preferFlats = false): Spelled {
  const pc = pitchClass(midi);
  const octave = Math.floor(midi / 12) - 1;
  const natural = NATURAL_PC.indexOf(pc);
  if (natural >= 0) return { letter: natural, acc: 0, octave };
  if (preferFlats) {
    const letter = NATURAL_PC.indexOf(pc + 1);
    return { letter, acc: -1, octave };
  }
  const letter = NATURAL_PC.indexOf(pc - 1);
  return { letter, acc: 1, octave };
}

const ACC_TEXT: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };
const ACC_VEX: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' };

export function accidentalText(acc: number): string {
  return ACC_TEXT[acc] ?? '';
}

export function accidentalVex(acc: number): string {
  return ACC_VEX[acc] ?? '';
}

export function noteName(s: Spelled, naming: Naming, withOctave = false): string {
  const base = naming === 'solfege' ? SOLFEGE[s.letter] : LETTERS[s.letter];
  return base + accidentalText(s.acc) + (withOctave ? String(s.octave) : '');
}

export function midiName(midi: number, naming: Naming, withOctave = true, preferFlats = false): string {
  return noteName(fromMidi(midi, preferFlats), naming, withOctave);
}

export function vexKey(s: Spelled, explicitAccidental = true): string {
  const acc = explicitAccidental ? accidentalVex(s.acc) : '';
  return `${LETTERS[s.letter].toLowerCase()}${acc}/${s.octave}`;
}

export function ledgerLines(s: Spelled, clef: Clef): number {
  const d = diatonicOf(s);
  const { bottom, top } = STAFF_LINES[clef];
  if (d < bottom - 1) return Math.floor((bottom - d) / 2);
  if (d > top + 1) return Math.floor((d - top) / 2);
  return 0;
}

export function rangeForLedgers(clef: Clef, below: number, above: number): { min: number; max: number } {
  const { bottom, top } = STAFF_LINES[clef];
  return { min: bottom - 2 * below - 1, max: top + 2 * above + 1 };
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitchClass(midi));
}

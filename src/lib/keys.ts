import { type Accidental, type Spelled, LETTERS } from './music';

export interface KeySignature {
  id: string;
  fifths: number;
  major: Spelled;
  minor: Spelled;
  vexMajor: string;
  vexMinor: string;
}

const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];

const MAJOR_TONICS: Record<number, [number, Accidental]> = {
  [-7]: [0, -1], [-6]: [4, -1], [-5]: [1, -1], [-4]: [5, -1], [-3]: [2, -1], [-2]: [6, -1], [-1]: [3, 0],
  0: [0, 0], 1: [4, 0], 2: [1, 0], 3: [5, 0], 4: [2, 0], 5: [6, 0], 6: [3, 1], 7: [0, 1]
};

const MINOR_TONICS: Record<number, [number, Accidental]> = {
  [-7]: [5, -1], [-6]: [2, -1], [-5]: [6, -1], [-4]: [3, 0], [-3]: [0, 0], [-2]: [4, 0], [-1]: [1, 0],
  0: [5, 0], 1: [2, 0], 2: [6, 0], 3: [3, 1], 4: [0, 1], 5: [4, 1], 6: [1, 1], 7: [5, 1]
};

function vexName(letter: number, acc: Accidental): string {
  return LETTERS[letter] + (acc === 1 ? '#' : acc === -1 ? 'b' : '');
}

export const KEY_SIGNATURES: KeySignature[] = Array.from({ length: 15 }, (_, i) => {
  const fifths = i - 7;
  const [ml, ma] = MAJOR_TONICS[fifths];
  const [nl, na] = MINOR_TONICS[fifths];
  return {
    id: String(fifths),
    fifths,
    major: { letter: ml, acc: ma, octave: 4 },
    minor: { letter: nl, acc: na, octave: 4 },
    vexMajor: vexName(ml, ma),
    vexMinor: vexName(nl, na) + 'm'
  };
});

export function keyByFifths(fifths: number): KeySignature {
  return KEY_SIGNATURES[fifths + 7];
}

export function alteredLetters(fifths: number): number[] {
  if (fifths > 0) return SHARP_ORDER.slice(0, fifths);
  if (fifths < 0) return FLAT_ORDER.slice(0, -fifths);
  return [];
}

export function keyAccidentalFor(letter: number, fifths: number): Accidental {
  const altered = alteredLetters(fifths);
  if (!altered.includes(letter)) return 0;
  return fifths > 0 ? 1 : -1;
}

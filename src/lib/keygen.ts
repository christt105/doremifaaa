import { KEY_SIGNATURES, alteredLetters, keyByFifths, type KeySignature } from './keys';
import { type Naming, noteName, pitchClass, toMidi } from './music';

export type KeyMode = 'major' | 'minor' | 'both';
export type KeySide = 'sharps' | 'flats' | 'both';

export interface KeyConfig {
  mode: KeyMode;
  side: KeySide;
  maxAccidentals: number;
  clef: 'treble' | 'bass' | 'mixed';
  length: number;
}

export const DEFAULT_KEY_CONFIG: KeyConfig = {
  mode: 'major',
  side: 'both',
  maxAccidentals: 7,
  clef: 'treble',
  length: 20
};

export interface KeyQuestion {
  id: string;
  key: KeySignature;
  quality: 'major' | 'minor';
}

export function keyCandidates(cfg: KeyConfig): string[] {
  const qualities = cfg.mode === 'both' ? ['major', 'minor'] : [cfg.mode];
  return KEY_SIGNATURES.filter((k) => Math.abs(k.fifths) <= cfg.maxAccidentals)
    .filter((k) => cfg.side === 'both' || k.fifths === 0 || (cfg.side === 'sharps' ? k.fifths > 0 : k.fifths < 0))
    .flatMap((k) => qualities.map((q) => `${k.fifths}:${q}`));
}

export function keyQuestion(id: string): KeyQuestion {
  const [f, q] = id.split(':');
  return { id, key: keyByFifths(Number(f)), quality: q === 'minor' ? 'minor' : 'major' };
}

export function tonicPitchClass(q: KeyQuestion): number {
  return pitchClass(toMidi(q.quality === 'major' ? q.key.major : q.key.minor));
}

export function keyLabel(k: KeySignature, quality: 'major' | 'minor', naming: Naming): string {
  return noteName(quality === 'major' ? k.major : k.minor, naming) + (quality === 'minor' ? 'm' : '');
}

export function keyHint(k: KeySignature, naming: Naming): { rule: 'none' | 'sharps' | 'flats' | 'oneFlat'; note: string } {
  if (k.fifths === 0) return { rule: 'none', note: '' };
  const letters = alteredLetters(k.fifths);
  if (k.fifths > 0) {
    const last = letters[letters.length - 1];
    return { rule: 'sharps', note: noteName({ letter: last, acc: 1, octave: 4 }, naming) };
  }
  if (k.fifths === -1) return { rule: 'oneFlat', note: '' };
  return { rule: 'flats', note: noteName({ letter: letters[letters.length - 2], acc: -1, octave: 4 }, naming) };
}

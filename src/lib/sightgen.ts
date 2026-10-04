import { keyAccidentalFor } from './keys';
import { type Clef, type Spelled, STAFF_LINES, fromDiatonic, toMidi } from './music';

export interface SightConfig {
  clef: Clef;
  level: number;
  measures: number;
  keyMax: number;
  mode: 'wait' | 'tempo';
  bpm: number;
}

export const DEFAULT_SIGHT_CONFIG: SightConfig = {
  clef: 'treble',
  level: 1,
  measures: 4,
  keyMax: 0,
  mode: 'wait',
  bpm: 60
};

export interface SightNote {
  note: Spelled;
  midi: number;
  duration: 'w' | 'h' | 'q' | '8';
  beats: number;
  onset: number;
  measure: number;
}

export interface Fragment {
  clef: Clef;
  fifths: number;
  notes: SightNote[];
  measures: number;
}

const BEATS: Record<SightNote['duration'], number> = { w: 4, h: 2, q: 1, '8': 0.5 };

const RHYTHMS: SightNote['duration'][][][] = [
  [['w'], ['h', 'h'], ['q', 'q', 'h'], ['h', 'q', 'q'], ['q', 'q', 'q', 'q']],
  [['h', 'h'], ['q', 'q', 'h'], ['h', 'q', 'q'], ['q', 'q', 'q', 'q'], ['q', 'h', 'q']],
  [['q', 'q', 'q', 'q'], ['8', '8', 'q', 'h'], ['q', '8', '8', 'q', 'q'], ['h', '8', '8', 'q'], ['q', 'h', 'q']],
  [['8', '8', '8', '8', 'q', 'q'], ['q', '8', '8', '8', '8', 'q'], ['8', '8', 'q', '8', '8', 'q'], ['q', 'q', '8', '8', 'q']]
];

const LEAPS: number[][] = [
  [1, 1, 1, 1, 2],
  [1, 1, 1, 2, 2, 3],
  [1, 1, 2, 2, 3, 4],
  [1, 2, 2, 3, 4, 5]
];

const LEDGERS = [0, 0, 1, 2];

export function levelCount(): number {
  return RHYTHMS.length;
}

export function generate(cfg: SightConfig, rng: () => number = Math.random): Fragment {
  const level = Math.max(1, Math.min(levelCount(), cfg.level)) - 1;
  const span = cfg.keyMax;
  const fifths = span === 0 ? 0 : Math.round(rng() * span * 2) - span;
  const { bottom, top } = STAFF_LINES[cfg.clef];
  const ledger = LEDGERS[level];
  const min = bottom - 2 * ledger - (ledger > 0 ? 1 : 0);
  const max = top + 2 * ledger + (ledger > 0 ? 1 : 0);
  const tonicLetter = ((fifths * 4) % 7 + 7) % 7;
  const mid = Math.round((bottom + top) / 2);
  let pos = mid - ((((mid % 7) - tonicLetter) % 7) + 7) % 7;
  if (pos < min + 2) pos += 7;
  const startPos = pos;
  const notes: SightNote[] = [];
  let onset = 0;
  for (let m = 0; m < cfg.measures; m++) {
    const last = m === cfg.measures - 1;
    const pool = RHYTHMS[level];
    const rhythm = last ? (level >= 2 ? ['q', 'q', 'h'] as const : ['w'] as const) : pool[Math.floor(rng() * pool.length)];
    rhythm.forEach((duration, i) => {
      const final = last && i === rhythm.length - 1;
      if (notes.length > 0) {
        if (final) {
          const candidates = [startPos - 7, startPos, startPos + 7].filter((p) => p >= min && p <= max);
          pos = candidates.reduce((a, b) => (Math.abs(b - pos) < Math.abs(a - pos) ? b : a));
        } else {
          const leaps = LEAPS[level];
          let step = leaps[Math.floor(rng() * leaps.length)] * (rng() < 0.5 ? -1 : 1);
          if (pos + step > max || pos + step < min) step = -step;
          if (pos + step > max || pos + step < min) step = 0;
          pos += step;
        }
      }
      const base = fromDiatonic(pos);
      const note = { ...base, acc: keyAccidentalFor(base.letter, fifths) };
      notes.push({ note, midi: toMidi(note), duration, beats: BEATS[duration], onset, measure: m });
      onset += BEATS[duration];
    });
  }
  return { clef: cfg.clef, fifths, notes, measures: cfg.measures };
}

export function noteAt(fragment: Fragment, beat: number): number {
  for (let i = fragment.notes.length - 1; i >= 0; i--) if (beat >= fragment.notes[i].onset) return i;
  return 0;
}

export interface Judgement {
  index: number;
  hit: boolean;
}

export function judgeTempo(fragment: Fragment, judged: Set<number>, midi: number, beat: number, window = 0.5): Judgement | null {
  let best: number | null = null;
  fragment.notes.forEach((n, i) => {
    if (judged.has(i) || Math.abs(n.onset - beat) > window) return;
    if (best === null || Math.abs(n.onset - beat) < Math.abs(fragment.notes[best].onset - beat)) best = i;
  });
  if (best === null) return null;
  return { index: best, hit: fragment.notes[best].midi === midi };
}

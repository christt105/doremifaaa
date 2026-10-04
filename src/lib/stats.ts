import { keyQuestion, type KeyQuestion } from './keygen';
import type { Clef, Spelled } from './music';
import { parseItemId } from './notegen';
import { toMidi } from './music';
import type { Deck, ItemStat, SessionLog } from './srs';

export interface NoteRow {
  id: string;
  clef: Clef;
  note: Spelled;
  midi: number;
  stat: ItemStat;
}

export interface KeyRow {
  id: string;
  q: KeyQuestion;
  stat: ItemStat;
}

export const MASTERED_BOX = 4;

export function noteRows(deck: Deck): NoteRow[] {
  return Object.entries(deck).flatMap(([id, stat]) => {
    const parsed = parseItemId(id);
    return parsed ? [{ id, clef: parsed.clef, note: parsed.note, midi: toMidi(parsed.note), stat }] : [];
  });
}

export function keyRows(deck: Deck): KeyRow[] {
  return Object.entries(deck)
    .filter(([id]) => /^-?\d+:(major|minor)$/.test(id))
    .map(([id, stat]) => ({ id, q: keyQuestion(id), stat }));
}

export function weakness(stat: ItemStat): number {
  const errorRate = 1 - stat.correct / Math.max(1, stat.seen);
  return errorRate * 2 + (MASTERED_BOX - Math.min(stat.box, MASTERED_BOX)) * 0.25 + Math.min(stat.avgMs, 8000) / 8000;
}

export function weakest<T extends { stat: ItemStat }>(rows: T[], n: number, minSeen = 2): T[] {
  return rows
    .filter((r) => r.stat.seen >= minSeen && r.stat.box < MASTERED_BOX)
    .sort((a, b) => weakness(b.stat) - weakness(a.stat))
    .slice(0, n);
}

export function errorByMidi(rows: NoteRow[], clef: Clef): Map<number, { seen: number; errors: number }> {
  const out = new Map<number, { seen: number; errors: number }>();
  rows
    .filter((r) => r.clef === clef)
    .forEach((r) => {
      const prev = out.get(r.midi) ?? { seen: 0, errors: 0 };
      out.set(r.midi, { seen: prev.seen + r.stat.seen, errors: prev.errors + r.stat.seen - r.stat.correct });
    });
  return out;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DayBucket {
  day: string;
  answers: number;
  correct: number;
}

export function daily(sessions: SessionLog[], days: number, now = Date.now()): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(now - i * 86400000);
    map.set(key, { day: key, answers: 0, correct: 0 });
  }
  sessions.forEach((s) => {
    const b = map.get(dayKey(s.at));
    if (!b) return;
    b.answers += s.total;
    b.correct += s.correct;
  });
  return [...map.values()];
}

export function streak(sessions: SessionLog[], now = Date.now()): number {
  const days = new Set(sessions.map((s) => dayKey(s.at)));
  let n = 0;
  let cursor = now;
  if (!days.has(dayKey(cursor))) cursor -= 86400000;
  while (days.has(dayKey(cursor))) {
    n++;
    cursor -= 86400000;
  }
  return n;
}

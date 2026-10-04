import { load, save } from './storage';

export interface ItemStat {
  seen: number;
  correct: number;
  box: number;
  last: number;
  avgMs: number;
}

export type Deck = Record<string, ItemStat>;

export const BOX_WEIGHTS = [8, 5, 3, 2, 1.2, 0.7];
const UNSEEN_WEIGHT = 3;

export function record(deck: Deck, id: string, correct: boolean, ms: number, slowMs: number, now = Date.now()): Deck {
  const prev = deck[id] ?? { seen: 0, correct: 0, box: 0, last: 0, avgMs: 0 };
  const seen = prev.seen + 1;
  const avgMs = prev.seen === 0 ? ms : prev.avgMs * 0.7 + ms * 0.3;
  let box = prev.box;
  if (!correct) box = 0;
  else if (ms <= slowMs) box = Math.min(BOX_WEIGHTS.length - 1, box + 1);
  return { ...deck, [id]: { seen, correct: prev.correct + (correct ? 1 : 0), box, last: now, avgMs } };
}

export function weight(stat: ItemStat | undefined): number {
  if (!stat) return UNSEEN_WEIGHT;
  const base = BOX_WEIGHTS[Math.min(stat.box, BOX_WEIGHTS.length - 1)];
  const errorRate = stat.seen >= 3 ? 1 - stat.correct / stat.seen : 0;
  return base * (1 + 2 * errorRate);
}

export function pick(ids: string[], deck: Deck, avoid: string[] = [], rng: () => number = Math.random): string {
  const filtered = ids.filter((id) => !avoid.includes(id));
  const pool = filtered.length ? filtered : ids;
  const weights = pool.map((id) => weight(deck[id]));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function accuracy(stat: ItemStat | undefined): number | null {
  if (!stat || stat.seen === 0) return null;
  return stat.correct / stat.seen;
}

export function loadDeck(name: string): Deck {
  return load<Deck>(`doremifaaa.deck.${name}`, {});
}

export function saveDeck(name: string, deck: Deck): void {
  save(`doremifaaa.deck.${name}`, deck);
}

export interface SessionLog {
  mode: string;
  at: number;
  total: number;
  correct: number;
  avgMs: number;
}

const SESSIONS = 'doremifaaa.sessions';

export function loadSessions(): SessionLog[] {
  return load<SessionLog[]>(SESSIONS, []);
}

export function logSession(entry: SessionLog): void {
  if (entry.total === 0) return;
  save(SESSIONS, [...loadSessions(), entry].slice(-500));
}

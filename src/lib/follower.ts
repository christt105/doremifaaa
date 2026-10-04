export type Hand = 'both' | 'right' | 'left';

export interface StepNote {
  midi: number;
  hand: 'right' | 'left' | 'any';
}

export interface Step {
  notes: StepNote[];
  measure: number;
}

export type FollowEvent =
  | { kind: 'advance'; from: number; to: number }
  | { kind: 'loop'; from: number; to: number }
  | { kind: 'partial'; got: number[] }
  | { kind: 'wrong'; midi: number; measure: number }
  | { kind: 'done'; from: number }
  | { kind: 'ignored' };

const ROLL_MS = 150;

export function expectedNotes(step: Step | undefined, hand: Hand): number[] {
  if (!step) return [];
  const midis = step.notes.filter((n) => hand === 'both' || n.hand === 'any' || n.hand === hand).map((n) => n.midi);
  return [...new Set(midis)];
}

export class Follower {
  index = 0;
  got = new Set<number>();
  errors = new Map<number, number>();
  wrongTotal = 0;
  done = false;
  private lastAdvance = -Infinity;
  private previous: number[] = [];

  constructor(
    readonly steps: Step[],
    public hand: Hand = 'both',
    public loop: { from: number; to: number } | null = null
  ) {
    this.index = this.firstPlayable(this.startIndex());
  }

  get expected(): number[] {
    return expectedNotes(this.steps[this.index], this.hand);
  }

  get measure(): number {
    return this.steps[this.index]?.measure ?? this.steps[this.steps.length - 1]?.measure ?? 0;
  }

  private startIndex(): number {
    if (!this.loop) return 0;
    const i = this.steps.findIndex((s) => s.measure >= this.loop!.from);
    return i < 0 ? 0 : i;
  }

  private firstPlayable(from: number): number {
    let i = from;
    while (i < this.steps.length && expectedNotes(this.steps[i], this.hand).length === 0) i++;
    return i;
  }

  restart(): number {
    this.index = this.firstPlayable(this.startIndex());
    this.got.clear();
    this.errors.clear();
    this.wrongTotal = 0;
    this.done = false;
    return this.index;
  }

  setHand(hand: Hand): number {
    this.hand = hand;
    this.got.clear();
    this.index = this.firstPlayable(this.index);
    return this.index;
  }

  setLoop(loop: { from: number; to: number } | null): number {
    this.loop = loop;
    return this.restart();
  }

  seek(index: number): number {
    this.index = this.firstPlayable(Math.max(0, Math.min(index, this.steps.length - 1)));
    this.got.clear();
    this.done = this.index >= this.steps.length;
    return this.index;
  }

  noteOn(midi: number, now = performance.now()): FollowEvent {
    if (this.done || this.index >= this.steps.length) return { kind: 'ignored' };
    const expected = this.expected;
    if (!expected.includes(midi)) {
      if (now - this.lastAdvance < ROLL_MS && this.previous.includes(midi)) return { kind: 'ignored' };
      const measure = this.measure;
      this.errors.set(measure, (this.errors.get(measure) ?? 0) + 1);
      this.wrongTotal++;
      return { kind: 'wrong', midi, measure };
    }
    this.got.add(midi);
    if (!expected.every((m) => this.got.has(m))) return { kind: 'partial', got: [...this.got] };
    const from = this.index;
    this.previous = expected;
    this.lastAdvance = now;
    this.got.clear();
    let next = this.firstPlayable(from + 1);
    if (this.loop && (next >= this.steps.length || this.steps[next].measure > this.loop.to)) {
      next = this.firstPlayable(this.startIndex());
      this.index = next;
      return { kind: 'loop', from, to: next };
    }
    this.index = next;
    if (next >= this.steps.length) {
      this.done = true;
      return { kind: 'done', from };
    }
    return { kind: 'advance', from, to: next };
  }

  worstMeasures(n = 5): { measure: number; errors: number }[] {
    return [...this.errors.entries()]
      .map(([measure, errors]) => ({ measure, errors }))
      .sort((a, b) => b.errors - a.errors || a.measure - b.measure)
      .slice(0, n);
  }
}

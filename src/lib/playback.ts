import type { Hand, Step } from './follower';
import * as synth from './synth';

export interface Cue {
  index: number;
  at: number;
  notes: { midi: number; duration: number }[];
}

export interface Segment {
  cues: Cue[];
  end: number;
}

const WHOLE_NOTE_BEATS = 4;

function secondsPerWhole(bpm: number, speed: number): number {
  return (WHOLE_NOTE_BEATS * 60) / (Math.max(1, bpm) * speed);
}

export function segment(steps: Step[], from: number, to: number, hand: Hand, speed: number): Segment {
  const cues: Cue[] = [];
  let at = 0;
  let longest = 0;
  for (let i = from; i < Math.min(to, steps.length); i++) {
    const step = steps[i];
    const perWhole = secondsPerWhole(step.bpm, speed);
    const byMidi = new Map<number, number>();
    for (const n of step.notes) {
      if (hand !== 'both' && n.hand !== 'any' && n.hand !== hand) continue;
      byMidi.set(n.midi, Math.max(byMidi.get(n.midi) ?? 0, n.length * perWhole));
    }
    const notes = [...byMidi].map(([midi, duration]) => ({ midi, duration }));
    cues.push({ index: i, at, notes });
    longest = Math.max(longest, at + Math.max(0, ...notes.map((n) => n.duration)));
    const next = steps[i + 1];
    if (next) at += Math.max(0, next.time - step.time) * perWhole;
  }
  return { cues, end: Math.max(at, longest) };
}

export function sounding(cues: Cue[], elapsed: number): number[] {
  const midis = new Set<number>();
  for (const cue of cues) {
    if (cue.at > elapsed) break;
    for (const n of cue.notes) if (elapsed < cue.at + n.duration) midis.add(n.midi);
  }
  return [...midis];
}

interface Hooks {
  step(index: number, sounding: number[]): void;
  finished(): void;
}

const LOOKAHEAD = 0.15;
const TICK_MS = 25;
const LEAD_IN = 0.08;

interface Queued {
  segment: Segment;
  start: number;
  scheduled: number;
}

export class ScorePlayback {
  playing = false;
  private queue: Queued[] = [];
  private timer = 0;
  private frame = 0;
  private lastIndex = -1;
  private lastKey = '';
  private again: (() => Segment) | null = null;

  constructor(private readonly hooks: Hooks) {}

  play(first: Segment, again: (() => Segment) | null = null): void {
    this.stop();
    if (first.cues.length === 0 || first.end <= 0) return;
    this.playing = true;
    this.again = again;
    this.queue = [{ segment: first, start: synth.audioContext().currentTime + LEAD_IN, scheduled: 0 }];
    this.lastIndex = -1;
    this.lastKey = '';
    this.tick();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.frame = requestAnimationFrame(() => this.draw());
  }

  stop(): number {
    if (!this.playing) return this.lastIndex;
    this.playing = false;
    clearInterval(this.timer);
    cancelAnimationFrame(this.frame);
    synth.silence();
    this.queue = [];
    return this.lastIndex;
  }

  private tick(): void {
    const horizon = synth.audioContext().currentTime + LOOKAHEAD;
    for (let q = 0; q < this.queue.length; q++) {
      const item = this.queue[q];
      const cues = item.segment.cues;
      while (item.scheduled < cues.length && item.start + cues[item.scheduled].at <= horizon) {
        const cue = cues[item.scheduled++];
        for (const n of cue.notes) synth.schedule(n.midi, item.start + cue.at, n.duration);
      }
      const last = q === this.queue.length - 1;
      if (last && this.again && item.scheduled === cues.length && item.start + item.segment.end <= horizon) {
        const next = this.again();
        if (next.end > 0) this.queue.push({ segment: next, start: item.start + item.segment.end, scheduled: 0 });
        else this.again = null;
      }
    }
  }

  private draw(): void {
    if (!this.playing) return;
    const now = synth.audioContext().currentTime;
    while (this.queue.length > 1 && now >= this.queue[1].start) this.queue.shift();
    const item = this.queue[0];
    const elapsed = now - item.start;
    if (this.queue.length === 1 && !this.again && elapsed >= item.segment.end) {
      this.stop();
      this.hooks.finished();
      return;
    }
    let cue: Cue | undefined;
    for (const c of item.segment.cues) {
      if (c.at > elapsed) break;
      cue = c;
    }
    if (cue) {
      const notes = sounding(item.segment.cues, elapsed);
      const key = notes.join(',');
      if (cue.index !== this.lastIndex || key !== this.lastKey) {
        this.lastIndex = cue.index;
        this.lastKey = key;
        this.hooks.step(cue.index, notes);
      }
    }
    this.frame = requestAnimationFrame(() => this.draw());
  }
}

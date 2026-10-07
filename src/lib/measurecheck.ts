export interface VoiceCheck {
  staff: number;
  voice: number;
  duration: number;
  delta: number;
}

export interface MeasureCheck {
  index: number;
  number: string;
  implicit: boolean;
  divisions: number;
  beats: number;
  beatType: number;
  expected: number;
  voices: VoiceCheck[];
  wrongLength: boolean;
  emptyStaves: number[];
}

export interface CheckOptions {
  countForward?: boolean;
}

export interface CheckSummary {
  keys: number[];
  times: string[];
  staves: number;
  measures: number;
  notes: number;
  wrongLength: string[];
  emptyStaff: string[];
}

export interface MeasureContext {
  divisions: number;
  beats: number;
  beatType: number;
  fifths: number;
  expected: number;
}

const DIGITS = /^\d+$/;

export function childEl(el: Element, name: string): Element | null {
  for (const c of el.children) if (c.nodeName === name) return c;
  return null;
}

export function childrenNamed(el: Element, name: string): Element[] {
  return [...el.children].filter((c) => c.nodeName === name);
}

export function intChild(el: Element, name: string, fallback: number): number {
  const text = childEl(el, name)?.textContent ?? '';
  return DIGITS.test(text) ? Number(text) : fallback;
}

export function firstPart(doc: Document): Element | null {
  const root = doc.documentElement;
  return root && root.nodeName === 'score-partwise' ? childEl(root, 'part') : null;
}

export function partMeasures(part: Element | null): Element[] {
  return part ? childrenNamed(part, 'measure') : [];
}

function nextElementSkippingSpace(el: Element): Element | null {
  for (let n = el.nextSibling; n; n = n.nextSibling) {
    if (n.nodeType === 1) return n as Element;
    if (n.nodeType !== 3 || /\S/.test(n.nodeValue ?? '')) return null;
  }
  return null;
}

function timePairs(root: Element | Document): [number, number][] {
  const pairs: [number, number][] = [];
  for (const b of root.getElementsByTagName('beats')) {
    const t = nextElementSkippingSpace(b);
    const beats = b.textContent ?? '';
    const type = t?.nodeName === 'beat-type' ? (t.textContent ?? '') : '';
    if (DIGITS.test(beats) && DIGITS.test(type)) pairs.push([Number(beats), Number(type)]);
  }
  return pairs;
}

function firstInt(root: Element, name: string, pattern = DIGITS): number | null {
  for (const el of root.getElementsByTagName(name)) if (pattern.test(el.textContent ?? '')) return Number(el.textContent);
  return null;
}

interface Carry {
  divisions: number;
  beats: number;
  beatType: number;
  fifths: number;
}

function advance(carry: Carry, measure: Element): Carry {
  const time = timePairs(measure)[0];
  return {
    divisions: firstInt(measure, 'divisions') ?? carry.divisions,
    beats: time ? time[0] : carry.beats,
    beatType: time ? time[1] : carry.beatType,
    fifths: firstInt(measure, 'fifths', /^-?\d+$/) ?? carry.fifths
  };
}

const START: Carry = { divisions: 1, beats: 4, beatType: 4, fifths: 0 };

export function expectedLength(c: { divisions: number; beats: number; beatType: number }): number {
  return (c.beats * c.divisions * 4) / c.beatType;
}

export function measureContext(measure: Element): MeasureContext {
  const siblings = measure.parentElement ? childrenNamed(measure.parentElement, 'measure') : [measure];
  let carry = START;
  for (const m of siblings) {
    carry = advance(carry, m);
    if (m === measure) break;
  }
  return { ...carry, expected: expectedLength(carry) };
}

export function isRest(note: Element): boolean {
  return childEl(note, 'rest') !== null;
}

export function noteStaff(el: Element): number {
  return intChild(el, 'staff', 1);
}

export function noteVoice(el: Element): number {
  return intChild(el, 'voice', 1);
}

export function voiceDurations(measure: Element, options: CheckOptions = {}): Map<string, VoiceCheck> {
  const voices = new Map<string, VoiceCheck>();
  for (const el of measure.children) {
    const isNote = el.nodeName === 'note';
    if (!isNote && !(options.countForward && el.nodeName === 'forward' && childEl(el, 'voice'))) continue;
    if (isNote && (childEl(el, 'chord') || childEl(el, 'grace'))) continue;
    const staff = noteStaff(el);
    const voice = noteVoice(el);
    const key = `${staff}:${voice}`;
    const v = voices.get(key) ?? { staff, voice, duration: 0, delta: 0 };
    v.duration += intChild(el, 'duration', 0);
    voices.set(key, v);
  }
  return voices;
}

function staffCount(part: Element | null): number {
  return part ? (firstInt(part, 'staves') ?? 1) : 1;
}

export function checkMeasures(doc: Document, options: CheckOptions = {}): MeasureCheck[] {
  const part = firstPart(doc);
  const staves = staffCount(part);
  let carry = START;
  return partMeasures(part).map((measure, index) => {
    carry = advance(carry, measure);
    const expected = expectedLength(carry);
    const voices = [...voiceDurations(measure, options).values()].sort((a, b) => a.staff - b.staff || a.voice - b.voice);
    for (const v of voices) v.delta = v.duration - expected;
    const implicit = measure.getAttribute('implicit') === 'yes';
    const sounding = new Set(childrenNamed(measure, 'note').filter((n) => !isRest(n)).map(noteStaff));
    const emptyStaves: number[] = [];
    for (let s = 1; s <= staves; s++) if (!sounding.has(s)) emptyStaves.push(s);
    return {
      index,
      number: measure.getAttribute('number') || '?',
      implicit,
      divisions: carry.divisions,
      beats: carry.beats,
      beatType: carry.beatType,
      expected,
      voices,
      wrongLength: !implicit && voices.some((v) => v.delta !== 0),
      emptyStaves
    };
  });
}

export function summarize(doc: Document, results: MeasureCheck[] = checkMeasures(doc)): CheckSummary {
  const part = firstPart(doc);
  const keys = new Set<number>();
  for (const f of doc.getElementsByTagName('fifths')) if (/^-?\d+$/.test(f.textContent ?? '')) keys.add(Number(f.textContent));
  const notes = partMeasures(part).reduce((n, m) => n + childrenNamed(m, 'note').filter((x) => !isRest(x)).length, 0);
  return {
    keys: [...keys],
    times: [...new Set(timePairs(doc).map(([b, t]) => `${b}/${t}`))],
    staves: staffCount(part),
    measures: results.length,
    notes,
    wrongLength: results.filter((r) => r.wrongLength).map((r) => r.number),
    emptyStaff: results.flatMap((r) => r.emptyStaves.map((s) => `${r.number}:${s}`))
  };
}

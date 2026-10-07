import { type CheckOptions, childEl, childrenNamed, intChild, isRest, measureContext, noteStaff, noteVoice, voiceDurations } from './measurecheck';

export type NoteType = 'maxima' | 'long' | 'breve' | 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd' | '64th' | '128th' | '256th' | '512th' | '1024th';
export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export const NOTE_TYPES: readonly NoteType[] = ['maxima', 'long', 'breve', 'whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th', '128th', '256th', '512th', '1024th'];
const STEPS: readonly Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ACCIDENTALS: Record<number, string> = { [-2]: 'flat-flat', [-1]: 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp' };
const NOTE_ORDER = [
  'grace', 'cue', 'chord', 'pitch', 'unpitched', 'rest', 'duration', 'tie', 'instrument', 'footnote', 'level', 'voice', 'type', 'dot', 'accidental',
  'time-modification', 'stem', 'notehead', 'notehead-text', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen'
];
const PITCH_ORDER = ['step', 'alter', 'octave'];

export interface Pitch {
  step: Step;
  alter: number;
  octave: number;
}

export interface Tuplet {
  actual: number;
  normal: number;
}

export interface Rhythm {
  type: NoteType;
  dots?: number;
}

export interface NoteInfo {
  handle: number;
  staff: number;
  voice: number;
  rest: boolean;
  measureRest: boolean;
  pitch: Pitch | null;
  type: NoteType | null;
  dots: number;
  duration: number;
  chord: boolean;
  grace: boolean;
  tuplet: Tuplet | null;
  onset: number;
}

export interface VoiceNotes {
  staff: number;
  voice: number;
  duration: number;
  notes: NoteInfo[];
}

export interface NewNote extends Rhythm {
  pitch?: { step: Step; octave: number; alter?: number };
}

export type InsertAt = { after: number } | { staff: number; voice: number };

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return Math.abs(a);
}

export function rhythmFraction(type: NoteType, dots = 0, tuplet: Tuplet | null = null): [number, number] {
  const exp = 5 - NOTE_TYPES.indexOf(type);
  let num = (exp >= 0 ? 2 ** exp : 1) * (2 ** (dots + 1) - 1);
  let den = (exp < 0 ? 2 ** -exp : 1) * 2 ** dots;
  if (tuplet) {
    num *= tuplet.normal;
    den *= tuplet.actual;
  }
  const g = gcd(num, den);
  return [num / g, den / g];
}

export function rhythmDuration(divisions: number, type: NoteType, dots = 0, tuplet: Tuplet | null = null): number {
  const [num, den] = rhythmFraction(type, dots, tuplet);
  return (divisions * num) / den;
}

export function durationType(duration: number, divisions: number): { type: NoteType; dots: number } | null {
  for (const type of NOTE_TYPES) for (let dots = 0; dots <= 3; dots++) if (rhythmDuration(divisions, type, dots) === duration) return { type, dots };
  return null;
}

export function durationName(duration: number, divisions: number): string | null {
  const t = durationType(duration, divisions);
  return t && `${['', 'dotted ', 'double-dotted ', 'triple-dotted '][t.dots]}${t.type}`;
}

export function notesOf(measure: Element): Element[] {
  return childrenNamed(measure, 'note');
}

export function noteAt(measure: Element, handle: number): Element {
  const note = notesOf(measure)[handle];
  if (!note) throw new RangeError(`no note ${handle} in measure`);
  return note;
}

function make(doc: Document, name: string, text?: string | number): Element {
  const el = doc.createElementNS(null, name);
  if (text !== undefined) el.textContent = String(text);
  return el;
}

function insertOrdered(parent: Element, el: Element, order: string[]): Element {
  const rank = order.indexOf(el.nodeName);
  const before = [...parent.children].find((c) => order.indexOf(c.nodeName) > rank);
  parent.insertBefore(el, before ?? null);
  return el;
}

function setChild(parent: Element, name: string, text: string | number | null, order = NOTE_ORDER): void {
  const el = childEl(parent, name);
  if (text === null) el?.remove();
  else if (el) el.textContent = String(text);
  else insertOrdered(parent, make(parent.ownerDocument, name, text), order);
}

function removeChildren(parent: Element, ...names: string[]): void {
  for (const c of [...parent.children]) if (names.includes(c.nodeName)) c.remove();
}

function readPitch(note: Element): Pitch | null {
  const p = childEl(note, 'pitch');
  if (!p) return null;
  const step = (childEl(p, 'step')?.textContent ?? '').trim() as Step;
  return { step, alter: Number(childEl(p, 'alter')?.textContent ?? 0) || 0, octave: Number(childEl(p, 'octave')?.textContent ?? 4) };
}

function readTuplet(note: Element): Tuplet | null {
  const tm = childEl(note, 'time-modification');
  if (!tm) return null;
  const actual = intChild(tm, 'actual-notes', 0);
  const normal = intChild(tm, 'normal-notes', 0);
  return actual > 0 && normal > 0 ? { actual, normal } : null;
}

const isChord = (n: Element) => childEl(n, 'chord') !== null;
const isGrace = (n: Element) => childEl(n, 'grace') !== null;
const durationOf = (el: Element) => Number(childEl(el, 'duration')?.textContent ?? 0) || 0;

function chordOf(notes: Element[], handle: number): Element[] {
  if (!notes[handle]) throw new RangeError(`no note ${handle} in measure`);
  let h = handle;
  while (h > 0 && isChord(notes[h])) h--;
  const chord = [notes[h]];
  for (let i = h + 1; i < notes.length && isChord(notes[i]); i++) chord.push(notes[i]);
  return chord;
}

function onsets(measure: Element): Map<Element, number> {
  const map = new Map<Element, number>();
  let cursor = 0;
  let last = 0;
  for (const el of measure.children) {
    if (el.nodeName === 'note') {
      if (isChord(el)) map.set(el, last);
      else {
        last = cursor;
        map.set(el, cursor);
        if (!isGrace(el)) cursor += durationOf(el);
      }
    } else if (el.nodeName === 'backup') cursor -= durationOf(el);
    else if (el.nodeName === 'forward') cursor += durationOf(el);
  }
  return map;
}

function endCursor(measure: Element): number {
  let cursor = 0;
  for (const el of measure.children) {
    if (el.nodeName === 'note' && !isChord(el) && !isGrace(el)) cursor += durationOf(el);
    else if (el.nodeName === 'backup') cursor -= durationOf(el);
    else if (el.nodeName === 'forward') cursor += durationOf(el);
  }
  return cursor;
}

export function listNotes(measure: Element): VoiceNotes[] {
  const at = onsets(measure);
  const voices = new Map<string, VoiceNotes>();
  notesOf(measure).forEach((n, handle) => {
    const staff = noteStaff(n);
    const voice = noteVoice(n);
    const key = `${staff}:${voice}`;
    const v = voices.get(key) ?? { staff, voice, duration: 0, notes: [] };
    const type = (childEl(n, 'type')?.textContent ?? '').trim() as NoteType;
    const info: NoteInfo = {
      handle,
      staff,
      voice,
      rest: isRest(n),
      measureRest: childEl(n, 'rest')?.getAttribute('measure') === 'yes',
      pitch: readPitch(n),
      type: NOTE_TYPES.includes(type) ? type : null,
      dots: childrenNamed(n, 'dot').length,
      duration: durationOf(n),
      chord: isChord(n),
      grace: isGrace(n),
      tuplet: readTuplet(n),
      onset: at.get(n) ?? 0
    };
    if (!info.chord && !info.grace) v.duration += info.duration;
    v.notes.push(info);
    voices.set(key, v);
  });
  return [...voices.values()].sort((a, b) => a.staff - b.staff || a.voice - b.voice);
}

export function voiceDuration(measure: Element, staff: number, voice: number, options: CheckOptions = {}): number {
  return voiceDurations(measure, options).get(`${staff}:${voice}`)?.duration ?? 0;
}

export function scaleDivisions(measure: Element, factor: number): void {
  if (!Number.isInteger(factor) || factor < 1) throw new RangeError('factor must be a positive integer');
  if (factor === 1) return;
  const doc = measure.ownerDocument;
  const divisions = measureContext(measure).divisions * factor;
  const own = [...measure.getElementsByTagName('divisions')].find((d) => /^\d+$/.test(d.textContent ?? ''));
  if (own) own.textContent = String(divisions);
  else {
    let attrs = [...measure.children].find((c) => c.nodeName === 'attributes' || ['note', 'backup', 'forward'].includes(c.nodeName));
    if (attrs?.nodeName !== 'attributes') {
      attrs = make(doc, 'attributes');
      measure.insertBefore(attrs, [...measure.children].find((c) => c.nodeName !== 'print') ?? null);
    }
    insertOrdered(attrs, make(doc, 'divisions', divisions), ['footnote', 'level', 'divisions', 'key', 'time', 'staves', 'part-symbol', 'instruments', 'clef']);
  }
  const scale = (m: Element) => {
    for (const name of ['duration', 'offset'])
      for (const el of m.getElementsByTagName(name)) if (el.textContent?.trim()) el.textContent = String(Number(el.textContent) * factor);
  };
  scale(measure);
  for (let m = measure.nextElementSibling; m; m = m.nextElementSibling) {
    if (m.nodeName !== 'measure') continue;
    if ([...m.getElementsByTagName('divisions')].some((d) => /^\d+$/.test(d.textContent ?? ''))) break;
    scale(m);
  }
}

function integerDuration(measure: Element, [num, den]: [number, number]): number {
  const divisions = measureContext(measure).divisions;
  const factor = den / gcd(divisions * num, den);
  scaleDivisions(measure, factor);
  return (divisions * factor * num) / den;
}

function timing(doc: Document, name: 'backup' | 'forward', duration: number): Element {
  const el = make(doc, name);
  el.append(make(doc, 'duration', duration));
  return el;
}

function shiftFollowing(start: Element | null, delta: number, staff: number, voice: number): void {
  let el = start;
  while (el && delta !== 0) {
    const next: Element | null = el.nextElementSibling;
    if (el.nodeName === 'backup') {
      const d = durationOf(el) + delta;
      if (d > 0) setChild(el, 'duration', d);
      else if (d === 0) el.remove();
      else el.replaceWith(timing(el.ownerDocument, 'forward', -d));
      return;
    }
    if (el.nodeName === 'forward') {
      const d = durationOf(el) - delta;
      if (d > 0) return setChild(el, 'duration', d);
      el.remove();
      delta = -d;
    } else if (el.nodeName === 'note' && (noteStaff(el) !== staff || noteVoice(el) !== voice)) {
      el.before(timing(el.ownerDocument, delta > 0 ? 'backup' : 'forward', Math.abs(delta)));
      return;
    }
    el = next;
  }
}

function keyAlter(fifths: number, step: Step): number {
  if (fifths > 0) return 'FCGDAEB'.indexOf(step) < fifths ? 1 : 0;
  if (fifths < 0) return 'BEADGCF'.indexOf(step) < -fifths ? -1 : 0;
  return 0;
}

function staffPitched(measure: Element, staff: number): { el: Element; onset: number; pitch: Pitch }[] {
  const at = onsets(measure);
  return notesOf(measure)
    .filter((n) => noteStaff(n) === staff && childEl(n, 'pitch'))
    .map((el, i) => ({ el, i, onset: at.get(el) ?? 0, pitch: readPitch(el) as Pitch }))
    .sort((a, b) => a.onset - b.onset || a.i - b.i);
}

function impliedAlter(measure: Element, staff: number, onset: number, step: Step, octave: number, except?: Element): number {
  let alter = keyAlter(measureContext(measure).fifths, step);
  for (const n of staffPitched(measure, staff)) {
    if (n.onset >= onset) break;
    if (n.el !== except && n.pitch.step === step && n.pitch.octave === octave) alter = n.pitch.alter;
  }
  return alter;
}

function refreshAccidentals(measure: Element, staff: number, onset: number, keys: string[], edited: Element | null): void {
  const fifths = measureContext(measure).fifths;
  const state = new Map<string, number>();
  for (const { el, onset: at, pitch } of staffPitched(measure, staff)) {
    const key = `${pitch.step}${pitch.octave}`;
    const implied = state.get(key) ?? keyAlter(fifths, pitch.step);
    state.set(key, pitch.alter);
    if (at < onset || !keys.includes(key)) continue;
    if (pitch.alter !== implied && ACCIDENTALS[pitch.alter]) setChild(el, 'accidental', ACCIDENTALS[pitch.alter]);
    else if (el === edited) setChild(el, 'accidental', null);
  }
}

function writePitch(note: Element, step: Step, octave: number, alter: number): void {
  let p = childEl(note, 'pitch');
  if (!p) {
    removeChildren(note, 'rest', 'unpitched');
    p = insertOrdered(note, make(note.ownerDocument, 'pitch'), NOTE_ORDER);
  }
  setChild(p, 'step', step, PITCH_ORDER);
  setChild(p, 'alter', alter === 0 ? null : alter, PITCH_ORDER);
  setChild(p, 'octave', octave, PITCH_ORDER);
}

function checkPitch(step: Step, octave: number, alter?: number): void {
  if (!STEPS.includes(step)) throw new RangeError(`bad step ${step}`);
  if (!Number.isInteger(octave) || octave < 0 || octave > 9) throw new RangeError(`bad octave ${octave}`);
  if (alter !== undefined && !(Number.isInteger(alter) && alter >= -2 && alter <= 2)) throw new RangeError(`bad alter ${alter}`);
}

export function setRhythm(measure: Element, handle: number, rhythm: Rhythm): void {
  const { type, dots = 0 } = rhythm;
  if (!NOTE_TYPES.includes(type) || !Number.isInteger(dots) || dots < 0 || dots > 3) throw new RangeError('bad rhythm');
  const chord = chordOf(notesOf(measure), handle);
  const head = chord[0];
  for (const n of chord) {
    setChild(n, 'type', type);
    removeChildren(n, 'dot');
    for (let i = 0; i < dots; i++) insertOrdered(n, make(n.ownerDocument, 'dot'), NOTE_ORDER);
    childEl(n, 'rest')?.removeAttribute('measure');
    if (NOTE_TYPES.indexOf(type) <= NOTE_TYPES.indexOf('quarter')) removeChildren(n, 'beam');
  }
  if (isGrace(head)) return;
  const duration = integerDuration(measure, rhythmFraction(type, dots, readTuplet(head)));
  const delta = duration - durationOf(head);
  for (const n of chord) setChild(n, 'duration', duration);
  shiftFollowing(chord[chord.length - 1].nextElementSibling, delta, noteStaff(head), noteVoice(head));
}

export function setAlter(measure: Element, handle: number, alter: number): void {
  const note = noteAt(measure, handle);
  const pitch = readPitch(note);
  if (!pitch) throw new Error('not a pitched note');
  checkPitch(pitch.step, pitch.octave, alter);
  writePitch(note, pitch.step, pitch.octave, alter);
  refreshAccidentals(measure, noteStaff(note), onsets(measure).get(note) ?? 0, [`${pitch.step}${pitch.octave}`], note);
}

export function setPitch(measure: Element, handle: number, pitch: { step: Step; octave: number; alter?: number }): void {
  checkPitch(pitch.step, pitch.octave, pitch.alter);
  const note = noteAt(measure, handle);
  const old = readPitch(note);
  const staff = noteStaff(note);
  const onset = onsets(measure).get(note) ?? 0;
  const alter = pitch.alter ?? impliedAlter(measure, staff, onset, pitch.step, pitch.octave, note);
  const rest = childEl(note, 'rest');
  if (rest) {
    if (rest.getAttribute('measure') === 'yes' && !childEl(note, 'type')) {
      const t = durationType(durationOf(note), measureContext(measure).divisions);
      if (t) {
        setChild(note, 'type', t.type);
        for (let i = 0; i < t.dots; i++) insertOrdered(note, make(note.ownerDocument, 'dot'), NOTE_ORDER);
      }
    }
  }
  writePitch(note, pitch.step, pitch.octave, alter);
  const keys = [`${pitch.step}${pitch.octave}`];
  if (old) keys.push(`${old.step}${old.octave}`);
  refreshAccidentals(measure, staff, onset, keys, note);
}

export function toRest(measure: Element, handle: number): number {
  const notes = notesOf(measure);
  const chord = chordOf(notes, handle);
  const head = chord[0];
  const staff = noteStaff(head);
  const onset = onsets(measure).get(head) ?? 0;
  const keys = chord.map(readPitch).flatMap((p) => (p ? [`${p.step}${p.octave}`] : []));
  for (const n of chord.slice(1)) n.remove();
  if (!isRest(head)) {
    removeChildren(head, 'pitch', 'unpitched', 'tie', 'accidental', 'stem', 'notehead', 'notehead-text', 'beam');
    insertOrdered(head, make(head.ownerDocument, 'rest'), NOTE_ORDER);
    for (const notations of childrenNamed(head, 'notations')) {
      removeChildren(notations, 'tied', 'slur');
      if (!notations.children.length) notations.remove();
    }
  }
  refreshAccidentals(measure, staff, onset, keys, null);
  return notesOf(measure).indexOf(head);
}

function buildNote(doc: Document, o: { staff: number; voice: number; duration: number; type?: NoteType; dots?: number; measureRest?: boolean }): Element {
  const note = make(doc, 'note');
  const rest = make(doc, 'rest');
  if (o.measureRest) rest.setAttribute('measure', 'yes');
  note.append(rest, make(doc, 'duration', o.duration), make(doc, 'voice', o.voice));
  if (o.type) note.append(make(doc, 'type', o.type));
  for (let i = 0; i < (o.dots ?? 0); i++) note.append(make(doc, 'dot'));
  note.append(make(doc, 'staff', o.staff));
  return note;
}

function voiceNotes(measure: Element, staff: number, voice: number): Element[] {
  return notesOf(measure).filter((n) => noteStaff(n) === staff && noteVoice(n) === voice);
}

function placeNote(measure: Element, at: InsertAt, build: (staff: number, voice: number) => Element, duration: number): Element {
  let note: Element;
  if ('after' in at) {
    const chord = chordOf(notesOf(measure), at.after);
    note = build(noteStaff(chord[0]), noteVoice(chord[0]));
    chord[chord.length - 1].after(note);
  } else {
    note = build(at.staff, at.voice);
    const first = voiceNotes(measure, at.staff, at.voice)[0];
    if (first) measure.insertBefore(note, first);
    else {
      const tail = [...measure.children].reverse().find((c) => c.nodeName !== 'barline');
      const ref = tail ? tail.nextElementSibling : measure.firstElementChild;
      const cursor = endCursor(measure);
      if (cursor > 0) measure.insertBefore(timing(measure.ownerDocument, 'backup', cursor), ref);
      measure.insertBefore(note, ref);
    }
  }
  if (!isGrace(note)) shiftFollowing(note.nextElementSibling, duration, noteStaff(note), noteVoice(note));
  return note;
}

export function insertNote(measure: Element, at: InsertAt, spec: NewNote): number {
  const dots = spec.dots ?? 0;
  if (!NOTE_TYPES.includes(spec.type) || !Number.isInteger(dots) || dots < 0 || dots > 3) throw new RangeError('bad rhythm');
  if (spec.pitch) checkPitch(spec.pitch.step, spec.pitch.octave, spec.pitch.alter);
  if ('after' in at) noteAt(measure, at.after);
  const duration = integerDuration(measure, rhythmFraction(spec.type, dots));
  const note = placeNote(measure, at, (staff, voice) => buildNote(measure.ownerDocument, { staff, voice, duration, type: spec.type, dots }), duration);
  if (spec.pitch) {
    const handle = notesOf(measure).indexOf(note);
    removeChildren(note, 'rest');
    const { step, octave } = spec.pitch;
    const staff = noteStaff(note);
    const onset = onsets(measure).get(note) ?? 0;
    writePitch(note, step, octave, spec.pitch.alter ?? impliedAlter(measure, staff, onset, step, octave, note));
    refreshAccidentals(measure, staff, onset, [`${step}${octave}`], note);
    return handle;
  }
  return notesOf(measure).indexOf(note);
}

export function addChordNote(measure: Element, handle: number, pitch: { step: Step; octave: number; alter?: number }): number {
  checkPitch(pitch.step, pitch.octave, pitch.alter);
  const chord = chordOf(notesOf(measure), handle);
  const head = chord[0];
  if (isRest(head)) throw new Error('cannot add a chord note to a rest');
  const doc = measure.ownerDocument;
  const note = make(doc, 'note');
  if (isGrace(head)) note.append(childEl(head, 'grace')!.cloneNode(true));
  note.append(make(doc, 'chord'), make(doc, 'pitch'));
  if (!isGrace(head)) note.append(make(doc, 'duration', durationOf(head)));
  for (const name of ['voice', 'type']) {
    const el = childEl(head, name);
    if (el) note.append(el.cloneNode(true));
  }
  for (const d of childrenNamed(head, 'dot')) note.append(d.cloneNode(true));
  const tm = childEl(head, 'time-modification');
  if (tm) note.append(tm.cloneNode(true));
  const staff = childEl(head, 'staff');
  if (staff) note.append(staff.cloneNode(true));
  chord[chord.length - 1].after(note);
  const onset = onsets(measure).get(note) ?? 0;
  const s = noteStaff(note);
  writePitch(note, pitch.step, pitch.octave, pitch.alter ?? impliedAlter(measure, s, onset, pitch.step, pitch.octave, note));
  refreshAccidentals(measure, s, onset, [`${pitch.step}${pitch.octave}`], note);
  return notesOf(measure).indexOf(note);
}

export function deleteNote(measure: Element, handle: number): void {
  const notes = notesOf(measure);
  const note = noteAt(measure, handle);
  const staff = noteStaff(note);
  const onset = onsets(measure).get(note) ?? 0;
  const pitch = readPitch(note);
  const next = notes[handle + 1];
  if (isChord(note) || isGrace(note)) note.remove();
  else if (next && isChord(next)) {
    childEl(next, 'chord')?.remove();
    note.remove();
  } else {
    const after = note.nextElementSibling;
    note.remove();
    shiftFollowing(after, -durationOf(note), staff, noteVoice(note));
  }
  if (pitch) refreshAccidentals(measure, staff, onset, [`${pitch.step}${pitch.octave}`], null);
}

function splitRests(missing: number, divisions: number): number[] {
  const parts: number[] = [];
  let left = missing;
  for (const type of NOTE_TYPES) {
    const d = rhythmDuration(divisions, type);
    if (!Number.isInteger(d) || d < 1) continue;
    while (d <= left) {
      parts.push(d);
      left -= d;
    }
  }
  if (left > 0) parts.push(left);
  return parts;
}

export function fillWithRest(measure: Element, staff: number, voice: number, options: CheckOptions = {}): number[] {
  let ctx = measureContext(measure);
  if (!Number.isInteger(ctx.expected)) {
    scaleDivisions(measure, ctx.beatType / gcd(ctx.beats * ctx.divisions * 4, ctx.beatType));
    ctx = measureContext(measure);
  }
  const missing = ctx.expected - voiceDuration(measure, staff, voice, options);
  if (missing <= 0) return [];
  const doc = measure.ownerDocument;
  const existing = voiceNotes(measure, staff, voice);
  const whole = !existing.length && missing === ctx.expected;
  let last: Element | null = existing[existing.length - 1] ?? null;
  const added: Element[] = [];
  for (const duration of whole ? [missing] : splitRests(missing, ctx.divisions)) {
    const t = whole ? null : durationType(duration, ctx.divisions);
    const build = () => buildNote(doc, { staff, voice, duration, type: t?.type, dots: t?.dots, measureRest: whole });
    last = placeNote(measure, last ? { after: notesOf(measure).indexOf(last) } : { staff, voice }, build, duration);
    added.push(last);
  }
  const notes = notesOf(measure);
  return added.map((n) => notes.indexOf(n));
}

export function parseScore(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('invalid XML');
  return doc;
}

export function serialize(doc: Document): string {
  const s = new XMLSerializer();
  return ['<?xml version="1.0" encoding="UTF-8"?>', ...[...doc.childNodes].map((n) => s.serializeToString(n))].join('\n') + '\n';
}

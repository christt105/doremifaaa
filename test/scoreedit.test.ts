// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkMeasures, firstPart, partMeasures, summarize } from '../src/lib/measurecheck';
import { readScoreXml } from '../src/lib/mxl';
import {
  addChordNote,
  deleteNote,
  durationName,
  durationType,
  fillWithRest,
  insertNote,
  listNotes,
  noteAt,
  parseScore,
  rhythmDuration,
  scaleDivisions,
  serialize,
  setAlter,
  setPitch,
  setRhythm,
  toRest
} from '../src/lib/scoreedit';

const REAL_DIR = '/home/bot/scratch/doremi-vault/Piano/Partituras/_musicxml/';

const n = (step: string, octave: number, dur: number, type: string, voice: number, staff: number, o: { chord?: boolean; alter?: number } = {}) =>
  `<note>${o.chord ? '<chord/>' : ''}<pitch><step>${step}</step>${o.alter ? `<alter>${o.alter}</alter>` : ''}<octave>${octave}</octave></pitch>` +
  `<duration>${dur}</duration><voice>${voice}</voice><type>${type}</type><staff>${staff}</staff></note>`;
const r = (dur: number, type: string, voice: number, staff: number) =>
  `<note><rest/><duration>${dur}</duration><voice>${voice}</voice><type>${type}</type><staff>${staff}</staff></note>`;
const back = (d: number) => `<backup><duration>${d}</duration></backup>`;

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>2</divisions><key><fifths>1</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>${n('C', 5, 2, 'quarter', 1, 1)}${n('E', 4, 2, 'quarter', 1, 1)}${n('G', 4, 2, 'quarter', 1, 1, { chord: true })}${n('F', 4, 2, 'quarter', 1, 1, { alter: 1 })}${back(6)}${n('C', 3, 4, 'half', 2, 2)}${r(2, 'quarter', 2, 2)}</measure>
<measure number="2">${n('A', 4, 4, 'half', 1, 1)}${n('B', 4, 2, 'quarter', 1, 1)}${back(6)}<note><pitch><step>G</step><octave>2</octave></pitch><duration>6</duration><voice>2</voice><type>half</type><dot/><staff>2</staff></note><direction><direction-type><words>x</words></direction-type><offset>1</offset></direction></measure>
<measure number="3"><attributes><divisions>4</divisions></attributes>${n('D', 5, 12, 'half', 1, 1)}${back(12)}<note><rest measure="yes"/><duration>12</duration><voice>2</voice><staff>2</staff></note></measure>
</part></score-partwise>
`;

function setup() {
  const doc = parseScore(FIXTURE);
  return { doc, measures: partMeasures(firstPart(doc)) };
}

const wrong = (doc: Document) => summarize(doc).wrongLength;
const voice = (m: Element, staff: number, v: number) => listNotes(m).find((x) => x.staff === staff && x.voice === v)!;
const children = (m: Element) => [...m.children].map((c) => (c.nodeName === 'note' ? 'n' : c.nodeName === 'backup' || c.nodeName === 'forward' ? `${c.nodeName}:${c.textContent}` : c.nodeName));

describe('rhythm helpers', () => {
  it('computes durations and names', () => {
    expect(rhythmDuration(4, 'eighth', 1)).toBe(3);
    expect(rhythmDuration(4, 'eighth', 0, { actual: 3, normal: 2 })).toBe(4 / 3);
    expect(durationType(3, 4)).toEqual({ type: 'eighth', dots: 1 });
    expect(durationType(5, 4)).toBeNull();
    expect(durationName(2, 4)).toBe('eighth');
    expect(durationName(14, 4)).toBe('double-dotted half');
    expect(durationName(16, 4)).toBe('whole');
  });
});

describe('score editing', () => {
  it('starts from a consistent fixture', () => {
    const { doc } = setup();
    expect(wrong(doc)).toEqual([]);
  });

  it('lists notes by staff and voice with stable handles', () => {
    const { measures } = setup();
    const voices = listNotes(measures[0]);
    expect(voices.map((v) => [v.staff, v.voice, v.duration, v.notes.map((x) => x.handle)])).toEqual([
      [1, 1, 6, [0, 1, 2, 3]],
      [2, 2, 6, [4, 5]]
    ]);
    expect(voices[0].notes[2]).toMatchObject({ chord: true, onset: 2, pitch: { step: 'G', alter: 0, octave: 4 }, type: 'quarter', duration: 2 });
    expect(voices[0].notes[3]).toMatchObject({ pitch: { step: 'F', alter: 1, octave: 4 }, onset: 4 });
    expect(voices[1].notes[1]).toMatchObject({ rest: true, pitch: null, onset: 4 });
    expect(voice(measures[2], 2, 2).notes[0]).toMatchObject({ rest: true, measureRest: true, type: null, duration: 12 });
  });

  it('changes a rhythm and keeps later voices in place', () => {
    const { doc, measures } = setup();
    setRhythm(measures[0], 0, { type: 'eighth' });
    expect(noteAt(measures[0], 0).getElementsByTagName('duration')[0].textContent).toBe('1');
    expect(children(measures[0])).toEqual(['attributes', 'n', 'n', 'n', 'n', 'backup:5', 'n', 'n']);
    expect(voice(measures[0], 2, 2).notes.map((x) => x.onset)).toEqual([0, 4]);
    expect(checkMeasures(doc)[0].voices).toEqual([
      { staff: 1, voice: 1, duration: 5, delta: -1 },
      { staff: 2, voice: 2, duration: 6, delta: 0 }
    ]);
    setRhythm(measures[0], 0, { type: 'quarter' });
    expect(wrong(doc)).toEqual([]);
    expect(children(measures[0])).toContain('backup:6');
    setRhythm(measures[1], 0, { type: 'quarter', dots: 1 });
    setRhythm(measures[1], 1, { type: 'quarter', dots: 1 });
    expect(noteAt(measures[1], 0).getElementsByTagName('dot')).toHaveLength(1);
    expect(voice(measures[1], 1, 1).notes.map((x) => [x.duration, x.onset])).toEqual([
      [3, 0],
      [3, 3]
    ]);
    expect(wrong(doc)).toEqual([]);
  });

  it('changes the rhythm of a whole chord from any member', () => {
    const { doc, measures } = setup();
    setRhythm(measures[0], 2, { type: 'eighth' });
    expect(voice(measures[0], 1, 1).notes.slice(1, 3).map((x) => [x.type, x.duration])).toEqual([
      ['eighth', 1],
      ['eighth', 1]
    ]);
    expect(children(measures[0])).toContain('backup:5');
    expect(voice(measures[0], 2, 2).notes[0].onset).toBe(0);
    expect(wrong(doc)).toEqual(['1']);
  });

  it('raises divisions when the new value is too short', () => {
    const { doc, measures } = setup();
    setRhythm(measures[0], 0, { type: '16th' });
    const durations = (m: Element) => [...m.getElementsByTagName('duration')].map((d) => Number(d.textContent));
    expect(measures[0].getElementsByTagName('divisions')[0].textContent).toBe('4');
    expect(durations(measures[0])).toEqual([1, 4, 4, 4, 9, 8, 4]);
    expect(measures[1].getElementsByTagName('divisions')).toHaveLength(0);
    expect(durations(measures[1])).toEqual([8, 4, 12, 12]);
    expect(measures[1].getElementsByTagName('offset')[0].textContent).toBe('2');
    expect(durations(measures[2])).toEqual([12, 12, 12]);
    expect(checkMeasures(doc).map((m) => [m.divisions, m.wrongLength])).toEqual([
      [4, true],
      [4, false],
      [4, false]
    ]);
  });

  it('inserts divisions into a measure that inherits them', () => {
    const { measures } = setup();
    scaleDivisions(measures[1], 3);
    expect(measures[0].getElementsByTagName('divisions')[0].textContent).toBe('2');
    expect(measures[1].firstElementChild?.outerHTML).toBe('<attributes><divisions>6</divisions></attributes>');
  });

  it('keeps tuplets when changing a rhythm', () => {
    const { doc, measures } = setup();
    const tm = doc.createElementNS(null, 'time-modification');
    tm.innerHTML = '<actual-notes>3</actual-notes><normal-notes>2</normal-notes>';
    noteAt(measures[1], 1).insertBefore(tm, noteAt(measures[1], 1).getElementsByTagName('staff')[0]);
    setRhythm(measures[1], 1, { type: 'eighth' });
    expect(measures[1].getElementsByTagName('divisions')[0].textContent).toBe('6');
    expect(voice(measures[1], 1, 1).notes.map((x) => x.duration)).toEqual([12, 2]);
    expect(voice(measures[1], 1, 1).notes[1].tuplet).toEqual({ actual: 3, normal: 2 });
    expect(voice(measures[1], 2, 2).notes[0].onset).toBe(0);
  });

  it('sets alterations and keeps accidentals consistent with the key', () => {
    const { measures } = setup();
    const m = measures[0];
    const acc = (h: number) => noteAt(m, h).getElementsByTagName('accidental')[0]?.textContent ?? null;
    insertNote(m, { after: 3 }, { type: 'eighth', pitch: { step: 'F', octave: 4 } });
    expect(voice(m, 1, 1).notes[4].pitch).toEqual({ step: 'F', alter: 1, octave: 4 });
    expect(acc(4)).toBeNull();
    setAlter(m, 3, 0);
    expect(noteAt(m, 3).getElementsByTagName('alter')).toHaveLength(0);
    expect(acc(3)).toBe('natural');
    expect(acc(4)).toBe('sharp');
    setAlter(m, 3, 1);
    expect(acc(3)).toBeNull();
    setAlter(m, 0, -1);
    expect(voice(m, 1, 1).notes[0].pitch).toEqual({ step: 'C', alter: -1, octave: 5 });
    expect(acc(0)).toBe('flat');
    expect([...noteAt(m, 0).children].map((c) => c.nodeName)).toEqual(['pitch', 'duration', 'voice', 'type', 'accidental', 'staff']);
    expect(() => setAlter(m, 0, 3)).toThrow(RangeError);
    expect(() => setAlter(m, 6, 1)).toThrow('not a pitched note');
  });

  it('changes pitch and converts between notes and rests', () => {
    const { doc, measures } = setup();
    const m = measures[0];
    setPitch(m, 0, { step: 'F', octave: 5 });
    expect(voice(m, 1, 1).notes[0].pitch).toEqual({ step: 'F', alter: 1, octave: 5 });
    setPitch(m, 0, { step: 'D', octave: 5, alter: 1 });
    expect(noteAt(m, 0).getElementsByTagName('accidental')[0].textContent).toBe('sharp');
    setPitch(m, 5, { step: 'G', octave: 2 });
    expect(voice(m, 2, 2).notes[1]).toMatchObject({ rest: false, pitch: { step: 'G', alter: 0, octave: 2 }, duration: 2 });
    const head = toRest(m, 2);
    expect(head).toBe(1);
    expect(voice(m, 1, 1).notes.map((x) => [x.handle, x.rest, x.chord])).toEqual([
      [0, false, false],
      [1, true, false],
      [2, false, false]
    ]);
    setPitch(measures[2], 1, { step: 'B', octave: 2 });
    expect(voice(measures[2], 2, 2).notes[0]).toMatchObject({ rest: false, type: 'half', dots: 1, duration: 12 });
    expect(wrong(doc)).toEqual([]);
  });

  it('inserts notes after a note and at the start of a new voice', () => {
    const { doc, measures } = setup();
    const m = measures[1];
    expect(insertNote(m, { after: 0 }, { type: 'quarter', pitch: { step: 'G', octave: 4 } })).toBe(1);
    expect(children(m)).toEqual(['n', 'n', 'n', 'backup:8', 'n', 'direction']);
    expect(voice(m, 2, 2).notes[0].onset).toBe(0);
    deleteNote(m, 2);
    expect(children(m)).toEqual(['n', 'n', 'backup:6', 'n', 'direction']);
    const h = insertNote(m, { staff: 2, voice: 3 }, { type: 'half', pitch: { step: 'D', octave: 3 } });
    expect(h).toBe(3);
    expect(children(m)).toEqual(['n', 'n', 'backup:6', 'n', 'direction', 'backup:6', 'n']);
    expect(voice(m, 2, 3).notes[0]).toMatchObject({ onset: 0, duration: 4, pitch: { step: 'D', alter: 0, octave: 3 } });
    expect(insertNote(m, { staff: 2, voice: 3 }, { type: 'quarter' })).toBe(3);
    expect(voice(m, 2, 3).notes.map((x) => [x.rest, x.onset])).toEqual([
      [true, 0],
      [false, 2]
    ]);
    expect(wrong(doc)).toEqual([]);
  });

  it('deletes notes and keeps chords alive', () => {
    const { doc, measures } = setup();
    const m = measures[0];
    deleteNote(m, 1);
    expect(voice(m, 1, 1).notes.map((x) => [x.pitch?.step, x.chord, x.duration, x.onset])).toEqual([
      ['C', false, 2, 0],
      ['G', false, 2, 2],
      ['F', false, 2, 4]
    ]);
    expect(wrong(doc)).toEqual([]);
    expect(addChordNote(m, 1, { step: 'B', octave: 4 })).toBe(2);
    expect(voice(m, 1, 1).notes[2]).toMatchObject({ chord: true, duration: 2, onset: 2, type: 'quarter' });
    deleteNote(m, 2);
    deleteNote(m, 0);
    expect(children(m)).toEqual(['attributes', 'n', 'n', 'backup:4', 'n', 'n']);
    expect(voice(m, 2, 2).notes.map((x) => x.onset)).toEqual([0, 4]);
  });

  it('turns backups into forwards or inserts them when a voice boundary has none', () => {
    const { measures } = setup();
    const m = measures[1];
    m.querySelector('backup')!.innerHTML = '<duration>2</duration>';
    deleteNote(m, 0);
    expect(children(m)).toEqual(['n', 'forward:2', 'n', 'direction']);
    expect(voice(m, 2, 2).notes[0].onset).toBe(4);
    deleteNote(m, 0);
    expect(children(m)).toEqual(['forward:4', 'n', 'direction']);
    expect(voice(m, 2, 2).notes[0].onset).toBe(4);
    const { measures: fresh } = setup();
    fresh[1].querySelector('backup')!.remove();
    insertNote(fresh[1], { after: 1 }, { type: 'quarter' });
    expect(children(fresh[1])).toEqual(['n', 'n', 'n', 'backup:2', 'n', 'direction']);
  });

  it('fills short voices with standard rests', () => {
    const { doc, measures } = setup();
    deleteNote(measures[0], 0);
    setRhythm(measures[0], 0, { type: 'eighth' });
    expect(checkMeasures(doc)[0].voices[0]).toMatchObject({ duration: 3, delta: -3 });
    expect(fillWithRest(measures[0], 1, 1)).toEqual([3, 4]);
    expect(voice(measures[0], 1, 1).notes.slice(3).map((x) => [x.rest, x.type, x.duration])).toEqual([
      [true, 'quarter', 2],
      [true, 'eighth', 1]
    ]);
    expect(voice(measures[0], 2, 2).notes[0].onset).toBe(0);
    expect(fillWithRest(measures[0], 1, 1)).toEqual([]);
    expect(fillWithRest(measures[1], 1, 2)).toEqual([3]);
    expect(voice(measures[1], 1, 2).notes[0]).toMatchObject({ rest: true, measureRest: true, duration: 6, onset: 0 });
    expect(wrong(doc)).toEqual([]);
  });

  it('raises divisions for a measure length that is not a whole number of divisions', () => {
    const doc = parseScore(
      `<score-partwise><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>7</beats><beat-type>8</beat-type></time></attributes>${n('C', 4, 2, 'half', 1, 1)}</measure></part></score-partwise>`
    );
    const [m] = partMeasures(firstPart(doc));
    expect(fillWithRest(m, 1, 1)).toEqual([1, 2]);
    expect(listNotes(m)[0].notes.map((x) => [x.type, x.duration])).toEqual([
      ['half', 4],
      ['quarter', 2],
      ['eighth', 1]
    ]);
    expect(wrong(doc)).toEqual([]);
  });

  it('serializes with the declaration and doctype and parses back', () => {
    const { doc, measures } = setup();
    setRhythm(measures[0], 0, { type: '16th' });
    const xml = serialize(doc);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC')).toBe(true);
    expect(serialize(parseScore(xml))).toBe(xml);
    expect(summarize(parseScore(xml))).toEqual(summarize(doc));
    expect(() => parseScore('<score-partwise>')).toThrow('invalid XML');
  });
});

const theme = REAL_DIR + 'Hollow Knight Main Theme.mxl';

describe.skipIf(!existsSync(theme))('fixing a real Audiveris score', () => {
  async function load() {
    const doc = parseScore(await readScoreXml(readFileSync(theme)));
    return { doc, measures: partMeasures(firstPart(doc)) };
  }

  function repair(doc: Document, measures: Element[], countForward: boolean) {
    for (let pass = 0; pass < 3; pass++)
      for (const res of checkMeasures(doc, { countForward }).filter((x) => x.wrongLength))
        for (const v of res.voices) {
          const m = measures[res.index];
          const notes = voice(m, v.staff, v.voice)?.notes.filter((x) => !x.chord && !x.grace) ?? [];
          const last = notes[notes.length - 1];
          const fixed = last && durationType(last.duration - v.delta, res.divisions);
          if (v.delta < 0 && fixed && !last.rest && !last.tuplet && notes.length === 1) setRhythm(m, last.handle, fixed);
          else if (v.delta < 0) fillWithRest(m, v.staff, v.voice, { countForward });
        }
  }

  function voicesEndOnTheBar(doc: Document, measures: Element[]) {
    return checkMeasures(doc).every((res) =>
      listNotes(measures[res.index]).every((v) => {
        const end = Math.max(...v.notes.filter((x) => !x.grace).map((x) => x.onset + x.duration));
        return end === res.expected;
      })
    );
  }

  it('brings wrongLength to zero with check.mjs semantics and round trips', async () => {
    const { doc, measures } = await load();
    expect(summarize(doc).wrongLength).toEqual(['7', '12', '15', '17', '21', '22']);
    repair(doc, measures, false);
    expect(summarize(doc)).toMatchObject({ measures: 26, notes: 198, wrongLength: [] });
    expect(voicesEndOnTheBar(doc, measures)).toBe(false);
    const again = parseScore(serialize(doc));
    expect(summarize(again)).toEqual(summarize(doc));
    expect(serialize(again)).toBe(serialize(doc));
  });

  it('leaves every voice ending on the bar line when forwards are counted', async () => {
    const { doc, measures } = await load();
    repair(doc, measures, true);
    expect(checkMeasures(doc, { countForward: true }).filter((x) => x.wrongLength)).toEqual([]);
    expect(voicesEndOnTheBar(doc, measures)).toBe(true);
  });
});

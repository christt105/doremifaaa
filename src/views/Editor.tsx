import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useT } from '../i18n';
import { getPiece, putFile } from '../lib/api';
import { EDIT_TYPES, deltaLabel, defaultPitch, isBad, newVoiceFor, nextBad, rhythmLabel, stepBy, toSpelled } from '../lib/editor';
import { fetchLibrary, libraryUrl, type ServerPiece } from '../lib/library';
import { bus } from '../lib/input/bus';
import { checkMeasures, firstPart, measureContext, partMeasures } from '../lib/measurecheck';
import { planEntry, spellMidi } from '../lib/midientry';
import { noteName } from '../lib/music';
import { readScoreXml } from '../lib/mxl';
import { createOsmd, type Osmd } from '../lib/osmd';
import { addChordNote, deleteNote, fillWithRest, insertNote, listNotes, parseScore, serialize, setAlter, setPitch, setRhythm, toRest, type NoteInfo, type NoteType } from '../lib/scoreedit';
import { settings } from '../lib/settings';
import { useStore } from '../lib/store';
import { href, type ViewProps } from '../router';
import { errorText } from './Manage';

const ALTERS: [number, string][] = [
  [-2, '♭♭'],
  [-1, '♭'],
  [0, '♮'],
  [1, '♯'],
  [2, '♯♯']
];

export function Editor({ route }: ViewProps) {
  const t = useT();
  const { naming } = useStore(settings);
  const id = route.params.join('/');
  const [piece, setPiece] = useState<ServerPiece | null>(null);
  const [failed, setFailed] = useState('');
  const doc = useRef<Document | null>(null);
  const history = useRef<string[]>([]);
  const [tick, setTick] = useState(0);
  const [index, setIndex] = useState(0);
  const [handle, setHandle] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const osmd = useRef<Osmd | null>(null);
  const [entry, setEntry] = useState(false);
  const [entryRhythm, setEntryRhythm] = useState<{ type: NoteType; dots: number }>({ type: 'quarter', dots: 0 });
  const live = useRef<{ enter: (midi: number | null) => void } | null>(null);
  const last = useRef<{ handle: number | null; at: number }>({ handle: null, at: 0 });

  useEffect(() => {
    if (!entry) return;
    return bus.onNote((e) => {
      if (e.type === 'on') live.current?.enter(e.midi);
    });
  }, [entry]);

  useEffect(() => {
    void (async () => {
      try {
        const p = await getPiece(id);
        if (!p.editable || !p.scoreUrl) throw new Error(t('editor.notEditable'));
        const res = await fetch(libraryUrl(p.scoreUrl));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        doc.current = parseScore(await readScoreXml(await res.arrayBuffer()));
        setPiece(p);
        const first = nextBad(checkMeasures(doc.current), -1, 1);
        setIndex(first ?? 0);
        setTick((n) => n + 1);
      } catch (e) {
        setFailed(errorText(t, e));
      }
    })();
  }, [id]);

  const measures = useMemo(() => (doc.current ? partMeasures(firstPart(doc.current)) : []), [tick]);
  const checks = useMemo(() => (doc.current ? checkMeasures(doc.current) : []), [tick]);
  const bad = checks.filter(isBad).length;
  const measure = measures[index];
  const check = checks[index];
  const voices = useMemo(() => (measure ? listNotes(measure) : []), [measure, tick]);
  const selected: NoteInfo | null = voices.flatMap((v) => v.notes).find((n) => n.handle === handle) ?? null;

  useEffect(() => {
    if (!doc.current || !host.current || !measure) return;
    const timer = setTimeout(async () => {
      try {
        osmd.current ??= await createOsmd(host.current!);
        const o = osmd.current;
        o.setOptions({ drawFromMeasureNumber: Math.max(1, index), drawUpToMeasureNumber: Math.min(measures.length, index + 2), drawTitle: false, drawComposer: false, autoResize: false });
        await o.load(serialize(doc.current!));
        o.render();
      } catch {
        if (host.current) host.current.textContent = t('editor.previewError');
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [tick, index, measures.length]);

  if (failed)
    return (
      <div class="card empty">
        <p>{failed}</p>
        <a class="button" href={href('library')}>
          {t('nav.library')}
        </a>
      </div>
    );
  if (!piece || !doc.current || !measure || !check) return <div class="empty">{t('common.loading')}</div>;

  const apply = (fn: () => number | void) => {
    history.current.push(serialize(doc.current!));
    if (history.current.length > 100) history.current.shift();
    try {
      const h = fn();
      if (typeof h === 'number') setHandle(h);
      setDirty(true);
      setMessage(null);
    } catch (e) {
      doc.current = parseScore(history.current.pop()!);
      setMessage({ ok: false, text: `${t('common.error')}: ${e instanceof Error ? e.message : String(e)}` });
    }
    setTick((n) => n + 1);
  };

  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    doc.current = parseScore(prev);
    setHandle(null);
    setDirty(history.current.length > 0);
    setTick((n) => n + 1);
  };

  const go = (i: number | null) => {
    if (i === null || i < 0 || i >= measures.length) return;
    setIndex(i);
    setHandle(null);
    last.current = { handle: null, at: 0 };
  };

  live.current = {
    enter(midi) {
      const now = performance.now();
      const staves = [...new Set([...voices.map((v) => v.staff), ...check.emptyStaves])];
      const plan = planEntry({ voices, staves: staves.length ? staves : [1], selected: handle, lastInserted: midi === null ? null : last.current.handle, lastAt: last.current.at, now, midi: midi ?? 60 });
      const pitch = midi === null ? undefined : spellMidi(midi, measureContext(measure).fifths);
      apply(() => {
        const h = plan.kind === 'chord' && pitch ? addChordNote(measure, plan.target!, pitch) : insertNote(measure, plan.at!, { ...entryRhythm, pitch });
        last.current = { handle: h, at: now };
        return h;
      });
    }
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const blob = new Blob([serialize(doc.current!)], { type: 'application/vnd.recordare.musicxml+xml' });
      const p = await putFile(piece.id, 'score', blob, `${piece.title}.musicxml`, true);
      setPiece(p);
      history.current = [];
      setDirty(false);
      void fetchLibrary(true);
      setMessage({ ok: true, text: t('editor.saved') });
    } catch (e) {
      setMessage({ ok: false, text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  };

  const divisions = measureContext(measure).divisions;
  const staves = [...new Set([...voices.map((v) => v.staff), ...check.emptyStaves])].sort();
  const noteLabel = (n: NoteInfo) => (n.rest ? t('editor.rest') : n.pitch ? noteName(toSpelled(n.pitch), naming, true) : '?');
  const sel = selected;
  const rhythmOf = (n: NoteInfo) => ({ type: n.type ?? 'quarter', dots: n.dots });

  return (
    <div class="stack editor">
      <div class="row spread wrap">
        <div>
          <a href={href('manage', piece.id)} class="small">
            ← {piece.title}
          </a>
          <h1 style={{ margin: 0 }}>{t('editor.title')}</h1>
          <p class={`small ${bad ? 'bad' : 'ok'}`} style={{ margin: 0 }}>
            {bad ? t('editor.remaining', { n: bad, total: checks.length }) : t('editor.clean')}
          </p>
        </div>
        <div class="row wrap">
          {piece.pdfUrl && (
            <a class="button ghost" href={href('pdf', 'server', piece.id)} target="_blank" rel="noreferrer">
              {t('library.pdf')}
            </a>
          )}
          <button disabled={!history.current.length} onClick={undo}>
            ↶ {t('editor.undo')}
          </button>
          <button class="primary" disabled={!dirty || busy} onClick={() => void save()}>
            {t('editor.save')}
          </button>
        </div>
      </div>
      {message && <p class={`small ${message.ok ? 'ok' : 'bad'}`}>{message.text}</p>}

      <div class="card row wrap editor-nav">
        <button onClick={() => go(nextBad(checks, index, -1))} disabled={nextBad(checks, index, -1) === null} title={t('editor.prevBad')}>
          ⇤
        </button>
        <button onClick={() => go(index - 1)} disabled={index === 0}>
          ←
        </button>
        <label class="row">
          <span>{t('editor.measure')}</span>
          <select value={index} onChange={(e) => go(Number(e.currentTarget.value))}>
            {checks.map((c, i) => (
              <option key={i} value={i}>
                {c.number}
                {isBad(c) ? ' ⚠' : ''}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => go(index + 1)} disabled={index >= measures.length - 1}>
          →
        </button>
        <button onClick={() => go(nextBad(checks, index, 1))} disabled={nextBad(checks, index, 1) === null} title={t('editor.nextBad')}>
          ⇥
        </button>
      </div>

      <div class="card editor-preview" ref={host} />

      <section class="card stack editor-entry">
        <div class="row spread wrap">
          <strong>{t('editor.entry')}</strong>
          <button class={entry ? 'primary' : ''} onClick={() => setEntry(!entry)}>
            {entry ? t('editor.entryOn') : t('editor.entryOff')}
          </button>
        </div>
        {entry && (
          <>
            <div class="row wrap">
              {EDIT_TYPES.map((type) => (
                <button key={type} class={entryRhythm.type === type ? 'selected' : ''} onClick={() => setEntryRhythm({ ...entryRhythm, type })}>
                  {rhythmLabel(type, 0)}
                </button>
              ))}
              <button class={entryRhythm.dots ? 'selected' : ''} onClick={() => setEntryRhythm({ ...entryRhythm, dots: entryRhythm.dots ? 0 : 1 })}>
                {t('editor.dot')}
              </button>
              <button onClick={() => live.current?.enter(null)}>+ {t('editor.rest')}</button>
            </div>
            <p class="muted small" style={{ margin: 0 }}>
              {t('editor.entryHint')}
            </p>
          </>
        )}
      </section>

      <section class="card stack">
        <p class="small" style={{ margin: 0 }}>
          {t('editor.expected', { n: check.number, beats: check.beats, type: check.beatType })}
        </p>
        {staves.map((staff) => {
          const inStaff = voices.filter((v) => v.staff === staff);
          return (
            <div key={staff} class="stack editor-staff">
              <strong class="small">{t(staff === 1 ? 'editor.staffUpper' : staff === 2 ? 'editor.staffLower' : 'editor.staff', { n: staff })}</strong>
              {check.emptyStaves.includes(staff) && <span class="bad small">{t('editor.emptyStaff')}</span>}
              {inStaff.map((v) => {
                const vc = check.voices.find((x) => x.staff === v.staff && x.voice === v.voice);
                const delta = vc?.delta ?? 0;
                return (
                  <div key={v.voice} class="editor-voice">
                    <span class={`small ${delta ? 'bad' : 'muted'}`}>
                      {t('editor.voice', { n: v.voice })}
                      {check.implicit ? '' : delta < 0 ? ` · ${t('editor.short', { d: deltaLabel(delta, divisions) })}` : delta > 0 ? ` · ${t('editor.long', { d: deltaLabel(delta, divisions) })}` : ' ✓'}
                    </span>
                    <div class="row wrap editor-notes">
                      {v.notes.map((n) => (
                        <button key={n.handle} class={`editor-note ${n.handle === handle ? 'selected' : ''} ${n.rest ? 'rest' : ''}`} onClick={() => setHandle(n.handle === handle ? null : n.handle)}>
                          {n.chord ? '+' : ''}
                          {noteLabel(n)} <small>{n.grace ? t('editor.grace') : rhythmLabel(n.type, n.dots)}</small>
                        </button>
                      ))}
                      {delta < 0 && !check.implicit && (
                        <button class="ghost small" onClick={() => apply(() => void fillWithRest(measure, v.staff, v.voice))}>
                          + {t('editor.fill')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div class="row wrap">
                <button
                  class="ghost small"
                  onClick={() =>
                    apply(() =>
                      insertNote(measure, { staff, voice: newVoiceFor(staff, inStaff.map((v) => v.voice)) }, { type: 'quarter', pitch: defaultPitch(staff) })
                    )
                  }
                >
                  + {t('editor.newVoice')}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {sel && (
        <section class="card stack editor-tools">
          <strong>
            {noteLabel(sel)} · {rhythmLabel(sel.type, sel.dots)}
          </strong>
          {!sel.grace && (
            <div class="row wrap">
              {EDIT_TYPES.map((type) => (
                <button key={type} class={sel.type === type ? 'selected' : ''} onClick={() => apply(() => setRhythm(measure, sel.handle, { type, dots: sel.dots }))}>
                  {rhythmLabel(type, 0)}
                </button>
              ))}
              <button class={sel.dots ? 'selected' : ''} onClick={() => apply(() => setRhythm(measure, sel.handle, { type: sel.type ?? 'quarter', dots: sel.dots ? 0 : 1 }))}>
                {t('editor.dot')}
              </button>
            </div>
          )}
          {sel.pitch && (
            <div class="row wrap">
              {ALTERS.map(([alter, sign]) => (
                <button key={alter} class={sel.pitch!.alter === alter ? 'selected' : ''} onClick={() => apply(() => setAlter(measure, sel.handle, alter))}>
                  {sign}
                </button>
              ))}
              <button onClick={() => apply(() => setPitch(measure, sel.handle, stepBy(sel.pitch!, 1)))} title={t('editor.up')}>
                ↑
              </button>
              <button onClick={() => apply(() => setPitch(measure, sel.handle, stepBy(sel.pitch!, -1)))} title={t('editor.down')}>
                ↓
              </button>
            </div>
          )}
          <div class="row wrap">
            {sel.rest ? (
              <button onClick={() => apply(() => setPitch(measure, sel.handle, defaultPitch(sel.staff)))}>{t('editor.toNote')}</button>
            ) : (
              <button onClick={() => apply(() => toRest(measure, sel.handle))}>{t('editor.toRest')}</button>
            )}
            <button onClick={() => apply(() => insertNote(measure, { after: sel.handle }, { ...rhythmOf(sel), pitch: sel.pitch ?? defaultPitch(sel.staff) }))}>
              + {t('editor.noteAfter')}
            </button>
            <button onClick={() => apply(() => insertNote(measure, { after: sel.handle }, rhythmOf(sel)))}>+ {t('editor.restAfter')}</button>
            {sel.pitch && !sel.grace && (
              <button onClick={() => apply(() => addChordNote(measure, sel.handle, stepBy(sel.pitch!, 2)))}>+ {t('editor.chordNote')}</button>
            )}
            <button
              class="danger"
              onClick={() =>
                apply(() => {
                  deleteNote(measure, sel.handle);
                  setHandle(null);
                })
              }
            >
              {t('editor.delete')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

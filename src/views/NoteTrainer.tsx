import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PianoKeyboard, type KeyMark } from '../components/PianoKeyboard';
import { Segmented } from '../components/Segmented';
import { Staff } from '../components/Staff';
import { useI18n } from '../i18n';
import { bus } from '../lib/input/bus';
import { KEY_SIGNATURES } from '../lib/keys';
import { midiName, noteName } from '../lib/music';
import {
  DEFAULT_NOTE_CONFIG,
  candidates,
  chooseFifths,
  isCorrect,
  keyboardRange,
  makeItem,
  type ClefChoice,
  type KeyChoice,
  type NoteConfig,
  type NoteItem
} from '../lib/notegen';
import { settings } from '../lib/settings';
import { loadDeck, logSession, pick, record, saveDeck, type Deck } from '../lib/srs';
import { load, save } from '../lib/storage';
import { useStore } from '../lib/store';
import * as synth from '../lib/synth';

const CONFIG_KEY = 'doremifaaa.notes.config';
const SLOW_MS = 2500;

interface Result {
  item: NoteItem;
  ok: boolean;
  ms: number;
}

type Phase = 'idle' | 'play' | 'summary';

export function NoteTrainer() {
  const { t, percent, seconds } = useI18n();
  const { naming, feedbackSounds } = useStore(settings);
  const [cfg, setCfg] = useState<NoteConfig>({ ...DEFAULT_NOTE_CONFIG, ...load<Partial<NoteConfig>>(CONFIG_KEY, {}) });
  const [phase, setPhase] = useState<Phase>('idle');
  const [item, setItem] = useState<NoteItem | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [misses, setMisses] = useState(0);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'bad'; played?: number } | null>(null);
  const deck = useRef<Deck>(loadDeck('notes'));
  const started = useRef(0);
  const recent = useRef<string[]>([]);
  const answered = useRef(false);
  const state = useRef({ phase, item, misses, cfg, results });
  state.current = { phase, item, misses, cfg, results };

  const update = (patch: Partial<NoteConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    save(CONFIG_KEY, next);
    if (phase !== 'idle') setPhase('idle');
  };

  const next = (c: NoteConfig = state.current.cfg) => {
    const fifths = chooseFifths(c.key);
    const id = pick(candidates(c, fifths), deck.current, recent.current);
    recent.current = [id, ...recent.current].slice(0, 2);
    setItem(makeItem(id, fifths));
    setMisses(0);
    setFlash(null);
    answered.current = false;
    started.current = performance.now();
  };

  const start = () => {
    setResults([]);
    setPhase('play');
    next();
  };

  const finish = (all: Result[]) => {
    setPhase('summary');
    logSession({
      mode: 'notes',
      at: Date.now(),
      total: all.length,
      correct: all.filter((r) => r.ok).length,
      avgMs: all.length ? all.reduce((a, r) => a + r.ms, 0) / all.length : 0
    });
  };

  useEffect(
    () =>
      bus.onNote((e) => {
        const s = state.current;
        if (e.type !== 'on') return;
        if (s.phase !== 'play' || !s.item) {
          if (s.phase === 'idle' && e.source === 'midi') start();
          return;
        }
        if (answered.current) return;
        const item = s.item;
        if (isCorrect(item, e.midi, s.cfg.strictOctave)) {
          answered.current = true;
          const ms = performance.now() - started.current;
          const ok = s.misses === 0;
          if (ok) deck.current = record(deck.current, item.id, true, ms, SLOW_MS);
          saveDeck('notes', deck.current);
          const all = [...s.results, { item, ok, ms }];
          setResults(all);
          setFlash({ kind: 'ok' });
          if (feedbackSounds) synth.cue('ok');
          setTimeout(() => {
            if (state.current.phase !== 'play') return;
            if (s.cfg.length > 0 && all.length >= s.cfg.length) finish(all);
            else next(s.cfg);
          }, 280);
        } else {
          if (s.misses === 0) {
            deck.current = record(deck.current, item.id, false, performance.now() - started.current, SLOW_MS);
            saveDeck('notes', deck.current);
          }
          setMisses((m) => m + 1);
          setFlash({ kind: 'bad', played: e.midi });
          if (feedbackSounds) synth.cue('bad');
        }
      }),
    [feedbackSounds]
  );

  const marks = useMemo(() => {
    const m = new Map<number, KeyMark>();
    if (!item) return m;
    if (flash?.kind === 'bad' && flash.played !== undefined) m.set(flash.played, 'bad');
    if (misses > 0) m.set(item.midi, 'hint');
    if (flash?.kind === 'ok') m.set(item.midi, 'ok');
    return m;
  }, [item, flash, misses]);

  const correct = results.filter((r) => r.ok).length;
  const avg = results.length ? results.reduce((a, r) => a + r.ms, 0) / results.length : 0;
  const range = keyboardRange(cfg.clef);
  const missed = results.filter((r) => !r.ok);

  const color = flash?.kind === 'ok' ? '#1f8a4c' : misses > 0 ? '#c2372f' : undefined;

  return (
    <div class="stack">
      <div>
        <h1>{t('notes.title')}</h1>
        <p class="muted">{t('notes.lead')}</p>
      </div>
      <div class="trainer">
        <div class="trainer-main">
          <div class="card stack">
            {phase === 'summary' ? (
              <div class="stack">
                <h2>{t('notes.summary')}</h2>
                <div class="stat-row">
                  <div class="stat">
                    <strong>{percent(results.length ? correct / results.length : 0)}</strong>
                    <span>{t('common.accuracy')}</span>
                  </div>
                  <div class="stat">
                    <strong>{seconds(avg)}</strong>
                    <span>{t('common.time')}</span>
                  </div>
                </div>
                <h3>{t('notes.missed')}</h3>
                {missed.length ? (
                  <div class="note-log">
                    {missed.map((r, i) => (
                      <span key={i} class="note-pill">
                        {noteName(r.item.note, naming, true)}
                        <small>{r.item.clef === 'treble' ? '𝄞' : '𝄢'}</small>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p class="muted">{t('notes.noMisses')}</p>
                )}
                <div class="row">
                  <button class="primary" onClick={start}>
                    {t('notes.again')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Staff
                  clef={item?.clef ?? (cfg.clef === 'bass' ? 'bass' : 'treble')}
                  fifths={item?.fifths ?? 0}
                  notes={item ? [{ keys: [item.note], duration: 'w', color }] : []}
                  minHeight={220}
                  scale={2.2}
                />
                <div class={`feedback ${flash?.kind ?? ''}`} aria-live="polite">
                  {phase === 'idle' && (
                    <button class="primary" onClick={start}>
                      {t('common.start')}
                    </button>
                  )}
                  {phase === 'play' && !flash && t('notes.play')}
                  {phase === 'play' && flash?.kind === 'ok' && `✓ ${item ? noteName(item.note, naming, true) : ''}`}
                  {phase === 'play' && flash?.kind === 'bad' && item && (
                    <span>
                      {t('notes.played', { note: midiName(flash.played ?? 0, naming) })} · {t('notes.was', { note: noteName(item.note, naming, true) })}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          <PianoKeyboard low={range.low} high={range.high} marks={marks} />
        </div>
        <aside class="trainer-side">
          <div class="card">
            <div class="stat-row">
              <div class="stat">
                <strong>{cfg.length > 0 ? t('notes.progress', { n: results.length, total: cfg.length }) : results.length}</strong>
                <span>&nbsp;</span>
              </div>
              <div class="stat">
                <strong>{percent(results.length ? correct / results.length : 0)}</strong>
                <span>{t('common.accuracy')}</span>
              </div>
            </div>
          </div>
          <details class="card" open={phase !== 'play'}>
            <summary>{t('notes.settings')}</summary>
            <div class="form" style={{ marginTop: '0.8rem' }}>
              <label>
                <span>{t('notes.clef')}</span>
                <Segmented<ClefChoice>
                  value={cfg.clef}
                  onChange={(clef) => update({ clef })}
                  options={[
                    { value: 'treble', label: '𝄞 ' + t('common.treble') },
                    { value: 'bass', label: '𝄢 ' + t('common.bass') },
                    { value: 'mixed', label: t('notes.mixed') }
                  ]}
                />
              </label>
              <label>
                <span>
                  {t('notes.below')}: {cfg.below}
                </span>
                <input type="range" min={0} max={4} value={cfg.below} onInput={(e) => update({ below: Number(e.currentTarget.value) })} />
              </label>
              <label>
                <span>
                  {t('notes.above')}: {cfg.above}
                </span>
                <input type="range" min={0} max={4} value={cfg.above} onInput={(e) => update({ above: Number(e.currentTarget.value) })} />
              </label>
              <label>
                <span>{t('notes.key')}</span>
                <select
                  value={String(cfg.key)}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    update({ key: (v === 'none' || v === 'random' ? v : Number(v)) as KeyChoice });
                  }}
                >
                  <option value="none">{t('notes.keyNone')}</option>
                  <option value="random">{t('notes.keyRandom')}</option>
                  {KEY_SIGNATURES.filter((k) => k.fifths !== 0).map((k) => (
                    <option key={k.id} value={k.fifths}>
                      {noteName(k.major, naming)} / {noteName(k.minor, naming)}m ({Math.abs(k.fifths)}
                      {k.fifths > 0 ? '♯' : '♭'})
                    </option>
                  ))}
                </select>
              </label>
              <label class="check">
                <input
                  type="checkbox"
                  checked={cfg.accidentals}
                  disabled={cfg.key !== 'none'}
                  onChange={(e) => update({ accidentals: e.currentTarget.checked })}
                />
                <span>{t('notes.accidentals')}</span>
              </label>
              <label class="check">
                <input type="checkbox" checked={cfg.strictOctave} onChange={(e) => update({ strictOctave: e.currentTarget.checked })} />
                <span>{t('notes.strict')}</span>
              </label>
              <label>
                <span>{t('notes.length')}</span>
                <Segmented<number>
                  value={cfg.length}
                  onChange={(length) => update({ length })}
                  options={[
                    { value: 10, label: '10' },
                    { value: 20, label: '20' },
                    { value: 50, label: '50' },
                    { value: 0, label: t('notes.endless') }
                  ]}
                />
              </label>
              {phase === 'play' && (
                <button onClick={() => finish(results)}>{t('common.stop')}</button>
              )}
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { Segmented } from '../components/Segmented';
import { Staff } from '../components/Staff';
import { useI18n } from '../i18n';
import { bus } from '../lib/input/bus';
import {
  DEFAULT_KEY_CONFIG,
  keyCandidates,
  keyHint,
  keyLabel,
  keyQuestion,
  tonicPitchClass,
  type KeyConfig,
  type KeyMode,
  type KeyQuestion,
  type KeySide
} from '../lib/keygen';
import { KEY_SIGNATURES } from '../lib/keys';
import { pitchClass } from '../lib/music';
import { settings } from '../lib/settings';
import { loadDeck, logSession, pick, record, saveDeck, type Deck } from '../lib/srs';
import { load, save } from '../lib/storage';
import { useStore } from '../lib/store';
import * as synth from '../lib/synth';

const CONFIG_KEY = 'doremifaaa.keys.config';
const SLOW_MS = 3000;

type Phase = 'idle' | 'play' | 'summary';

interface Result {
  q: KeyQuestion;
  ok: boolean;
  ms: number;
}

export function KeyTrainer() {
  const { t, percent, seconds } = useI18n();
  const { naming, feedbackSounds } = useStore(settings);
  const [cfg, setCfg] = useState<KeyConfig>({ ...DEFAULT_KEY_CONFIG, ...load<Partial<KeyConfig>>(CONFIG_KEY, {}) });
  const [phase, setPhase] = useState<Phase>('idle');
  const [q, setQ] = useState<KeyQuestion | null>(null);
  const [clef, setClef] = useState<'treble' | 'bass'>('treble');
  const [answer, setAnswer] = useState<{ ok: boolean; chosen?: string } | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const deck = useRef<Deck>(loadDeck('keys'));
  const started = useRef(0);
  const recent = useRef<string[]>([]);
  const state = useRef({ phase, q, answer, cfg, results });
  state.current = { phase, q, answer, cfg, results };

  const update = (patch: Partial<KeyConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    save(CONFIG_KEY, next);
    if (phase !== 'idle') setPhase('idle');
  };

  const next = () => {
    const c = state.current.cfg;
    const ids = keyCandidates(c);
    if (!ids.length) return;
    const id = pick(ids, deck.current, recent.current);
    recent.current = [id, ...recent.current].slice(0, Math.min(3, ids.length - 1));
    setQ(keyQuestion(id));
    setClef(c.clef === 'mixed' ? (Math.random() < 0.5 ? 'treble' : 'bass') : c.clef);
    setAnswer(null);
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
      mode: 'keys',
      at: Date.now(),
      total: all.length,
      correct: all.filter((r) => r.ok).length,
      avgMs: all.length ? all.reduce((a, r) => a + r.ms, 0) / all.length : 0
    });
  };

  const respond = (ok: boolean, chosen?: string) => {
    const s = state.current;
    if (s.phase !== 'play' || !s.q || s.answer) return;
    const ms = performance.now() - started.current;
    deck.current = record(deck.current, s.q.id, ok, ms, SLOW_MS);
    saveDeck('keys', deck.current);
    const all = [...s.results, { q: s.q, ok, ms }];
    setResults(all);
    setAnswer({ ok, chosen });
    if (feedbackSounds) synth.cue(ok ? 'ok' : 'bad');
    if (ok)
      setTimeout(() => {
        if (state.current.phase !== 'play') return;
        if (s.cfg.length > 0 && all.length >= s.cfg.length) finish(all);
        else next();
      }, 700);
  };

  const advance = () => {
    const s = state.current;
    if (s.cfg.length > 0 && s.results.length >= s.cfg.length) finish(s.results);
    else next();
  };

  useEffect(
    () =>
      bus.onNote((e) => {
        if (e.type !== 'on') return;
        const s = state.current;
        if (s.phase === 'idle' && e.source === 'midi') return start();
        if (s.phase !== 'play' || !s.q) return;
        if (s.answer && !s.answer.ok) return advance();
        respond(pitchClass(e.midi) === tonicPitchClass(s.q), `pc:${pitchClass(e.midi)}`);
      }),
    [feedbackSounds]
  );

  const quality = q?.quality ?? (cfg.mode === 'minor' ? 'minor' : 'major');
  const options = KEY_SIGNATURES.filter((k) => keyCandidates({ ...cfg, mode: quality }).includes(`${k.fifths}:${quality}`));
  const hint = q ? keyHint(q.key, naming) : null;
  const correct = results.filter((r) => r.ok).length;
  const weak = [...new Set(results.filter((r) => !r.ok).map((r) => r.q.id))].map(keyQuestion);

  return (
    <div class="stack">
      <div>
        <h1>{t('keys.title')}</h1>
        <p class="muted">{t('keys.lead')}</p>
      </div>
      <div class="trainer">
        <div class="trainer-main">
          <div class="card stack">
            {phase === 'summary' ? (
              <div class="stack">
                <h2>{t('keys.summary')}</h2>
                <div class="stat-row">
                  <div class="stat">
                    <strong>{percent(results.length ? correct / results.length : 0)}</strong>
                    <span>{t('common.accuracy')}</span>
                  </div>
                  <div class="stat">
                    <strong>{seconds(results.reduce((a, r) => a + r.ms, 0) / Math.max(1, results.length))}</strong>
                    <span>{t('common.time')}</span>
                  </div>
                </div>
                {weak.length > 0 && (
                  <>
                    <h3>{t('keys.weak')}</h3>
                    <div class="note-log">
                      {weak.map((w) => (
                        <span key={w.id} class="note-pill">
                          {keyLabel(w.key, w.quality, naming)}
                          <small>
                            {Math.abs(w.key.fifths)}
                            {w.key.fifths >= 0 ? '♯' : '♭'}
                          </small>
                        </span>
                      ))}
                    </div>
                  </>
                )}
                <div class="row">
                  <button class="primary" onClick={start}>
                    {t('notes.again')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Staff clef={clef} fifths={q?.key.fifths ?? 0} minHeight={200} scale={2.4} />
                {phase === 'idle' ? (
                  <div class="feedback">
                    <button class="primary" onClick={start}>
                      {t('common.start')}
                    </button>
                  </div>
                ) : (
                  <>
                    <div class={`feedback ${answer ? (answer.ok ? 'ok' : 'bad') : ''}`} aria-live="polite">
                      {!answer && t(`keys.ask.${quality}`)}
                      {answer?.ok && q && `✓ ${keyLabel(q.key, q.quality, naming)}`}
                      {answer && !answer.ok && q && t('keys.wrongWas', { key: keyLabel(q.key, q.quality, naming) })}
                    </div>
                    {answer && !answer.ok && hint && (
                      <p class="small muted" style={{ margin: 0 }}>
                        {t(`keys.hint.${hint.rule}`, { note: hint.note, major: hint.major, minor: hint.minor })}
                        {q?.quality === 'minor' && ' ' + t('keys.hint.minor')}
                      </p>
                    )}
                    <div class="answer-grid">
                      {options.map((k) => {
                        const id = `${k.fifths}:${quality}`;
                        const isRight = answer && q?.id === id;
                        const isWrong = answer && !answer.ok && answer.chosen === id;
                        return (
                          <button
                            key={id}
                            class={isRight ? 'right' : isWrong ? 'wrong' : ''}
                            onClick={() => (answer && !answer.ok ? advance() : respond(q?.id === id, id))}
                          >
                            {keyLabel(k, quality, naming)}
                          </button>
                        );
                      })}
                    </div>
                    {answer && !answer.ok && (
                      <div class="row">
                        <button class="primary" onClick={advance}>
                          {t('common.next')}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          <PianoKeyboard low={48} high={84} />
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
                <span>{t('keys.mode')}</span>
                <Segmented<KeyMode>
                  value={cfg.mode}
                  onChange={(mode) => update({ mode })}
                  options={[
                    { value: 'major', label: t('keys.major') },
                    { value: 'minor', label: t('keys.minor') },
                    { value: 'both', label: t('keys.both') }
                  ]}
                />
              </label>
              <label>
                <span>{t('keys.side')}</span>
                <Segmented<KeySide>
                  value={cfg.side}
                  onChange={(side) => update({ side })}
                  options={[
                    { value: 'sharps', label: '♯ ' + t('keys.sharps') },
                    { value: 'flats', label: '♭ ' + t('keys.flats') },
                    { value: 'both', label: t('keys.both') }
                  ]}
                />
              </label>
              <label>
                <span>
                  {t('keys.max')}: {cfg.maxAccidentals}
                </span>
                <input
                  type="range"
                  min={1}
                  max={7}
                  value={cfg.maxAccidentals}
                  onInput={(e) => update({ maxAccidentals: Number(e.currentTarget.value) })}
                />
              </label>
              <label>
                <span>{t('notes.clef')}</span>
                <Segmented<KeyConfig['clef']>
                  value={cfg.clef}
                  onChange={(c) => update({ clef: c })}
                  options={[
                    { value: 'treble', label: '𝄞' },
                    { value: 'bass', label: '𝄢' },
                    { value: 'mixed', label: t('notes.mixed') }
                  ]}
                />
              </label>
              <label>
                <span>{t('notes.length')}</span>
                <Segmented<number>
                  value={cfg.length}
                  onChange={(length) => update({ length })}
                  options={[
                    { value: 10, label: '10' },
                    { value: 20, label: '20' },
                    { value: 0, label: t('notes.endless') }
                  ]}
                />
              </label>
              {phase === 'play' && <button onClick={() => finish(results)}>{t('common.stop')}</button>}
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}

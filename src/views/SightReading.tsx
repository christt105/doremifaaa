import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PianoKeyboard, type KeyMark } from '../components/PianoKeyboard';
import { Segmented } from '../components/Segmented';
import { Staff, type StaffNote } from '../components/Staff';
import { addStrings, useT } from '../i18n';
import { bus } from '../lib/input/bus';
import type { Clef } from '../lib/music';
import { midiName } from '../lib/music';
import { settings } from '../lib/settings';
import { DEFAULT_SIGHT_CONFIG, generate, judgeTempo, levelCount, noteAt, type Fragment, type SightConfig } from '../lib/sightgen';
import { logSession } from '../lib/srs';
import { load, save } from '../lib/storage';
import { useStore } from '../lib/store';
import * as synth from '../lib/synth';

addStrings('es', {
  'sight.title': 'Lectura a primera vista',
  'sight.lead': 'Un fragmento nuevo cada vez, imposible de memorizar. En modo espera el cursor avanza cuando aciertas; a tempo, sigue al metrónomo y no te espera.',
  'sight.level': 'Nivel',
  'sight.level.1': 'Pasos y saltos pequeños, blancas y negras',
  'sight.level.2': 'Terceras y cuartas',
  'sight.level.3': 'Corcheas, quintas y una línea adicional',
  'sight.level.4': 'Saltos de sexta y dos líneas adicionales',
  'sight.measures': 'Compases',
  'sight.keyMax': 'Armadura de hasta {n} alteraciones',
  'sight.keyNone': 'Sin armadura',
  'sight.mode': 'Modo',
  'sight.wait': 'Espera',
  'sight.tempo': 'A tempo',
  'sight.bpm': 'Tempo: {n} ppm',
  'sight.new': 'Nuevo fragmento',
  'sight.retry': 'Repetir',
  'sight.countIn': 'Preparados… {n}',
  'sight.playing': 'Toca siguiendo el cursor',
  'sight.result': '{ok} de {total} notas a la primera',
  'sight.resultTempo': '{ok} de {total} notas a tiempo',
  'sight.wrongs': '{n} notas equivocadas',
  'sight.played': 'Has tocado {note}'
});

addStrings('en', {
  'sight.title': 'Sight-reading',
  'sight.lead': 'A new fragment every time, impossible to memorise. In wait mode the cursor moves on when you are right; in tempo mode it follows the metronome and does not wait.',
  'sight.level': 'Level',
  'sight.level.1': 'Steps and small leaps, halves and quarters',
  'sight.level.2': 'Thirds and fourths',
  'sight.level.3': 'Eighths, fifths and one ledger line',
  'sight.level.4': 'Leaps of a sixth and two ledger lines',
  'sight.measures': 'Measures',
  'sight.keyMax': 'Key signature up to {n} accidentals',
  'sight.keyNone': 'No key signature',
  'sight.mode': 'Mode',
  'sight.wait': 'Wait',
  'sight.tempo': 'In tempo',
  'sight.bpm': 'Tempo: {n} bpm',
  'sight.new': 'New fragment',
  'sight.retry': 'Retry',
  'sight.countIn': 'Ready… {n}',
  'sight.playing': 'Play along with the cursor',
  'sight.result': '{ok} of {total} notes right first time',
  'sight.resultTempo': '{ok} of {total} notes in time',
  'sight.wrongs': '{n} wrong notes',
  'sight.played': 'You played {note}'
});

const CONFIG_KEY = 'doremifaaa.sight.config';
const COLORS = { current: '#3c5bd6', ok: '#1f8a4c', late: '#c27a00', miss: '#c2372f' };

type NoteState = keyof typeof COLORS;
type Phase = 'ready' | 'countin' | 'play' | 'done';

function useWidth(): number {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

export function SightReading() {
  const t = useT();
  const { naming, feedbackSounds } = useStore(settings);
  const [cfg, setCfg] = useState<SightConfig>({ ...DEFAULT_SIGHT_CONFIG, ...load<Partial<SightConfig>>(CONFIG_KEY, {}) });
  const [fragment, setFragment] = useState<Fragment>(() => generate(cfg));
  const [phase, setPhase] = useState<Phase>('ready');
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState<Map<number, NoteState>>(new Map());
  const [wrongs, setWrongs] = useState(0);
  const [lastWrong, setLastWrong] = useState<number | null>(null);
  const [countIn, setCountIn] = useState(0);
  const width = useWidth();
  const raf = useRef(0);
  const tempo = useRef({ t0: 0, judged: new Set<number>(), scheduled: -1 });
  const state = useRef({ phase, index, fragment, cfg, states });
  state.current = { phase, index, fragment, cfg, states };

  const stopLoop = () => clearTimeout(raf.current);
  useEffect(() => stopLoop, []);

  const reset = (f: Fragment) => {
    stopLoop();
    setFragment(f);
    setPhase('ready');
    setIndex(0);
    setStates(new Map());
    setWrongs(0);
    setLastWrong(null);
  };

  const update = (patch: Partial<SightConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    save(CONFIG_KEY, next);
    reset(generate(next));
  };

  const finish = (finalStates: Map<number, NoteState>) => {
    stopLoop();
    setPhase('done');
    const f = state.current.fragment;
    const ok = [...finalStates.values()].filter((s) => s === 'ok').length;
    logSession({ mode: 'sight', at: Date.now(), total: f.notes.length, correct: ok, avgMs: 0 });
  };

  const loop = () => {
    const s = state.current;
    const beatMs = 60000 / s.cfg.bpm;
    const now = performance.now();
    const beat = (now - tempo.current.t0) / beatMs;
    const total = s.fragment.measures * 4;
    const nextBeat = Math.floor(beat) + 1;
    if (nextBeat > tempo.current.scheduled && nextBeat < total) {
      tempo.current.scheduled = nextBeat;
      const ctx = synth.audioContext();
      synth.click(((nextBeat % 4) + 4) % 4 === 0, ctx.currentTime + Math.max(0, (tempo.current.t0 + nextBeat * beatMs - now) / 1000));
    }
    if (beat < 0) {
      setCountIn(Math.ceil(-beat));
    } else {
      if (s.phase !== 'play') setPhase('play');
      setIndex(noteAt(s.fragment, beat));
      const missed = new Map(s.states);
      let changed = false;
      s.fragment.notes.forEach((n, i) => {
        if (!tempo.current.judged.has(i) && n.onset + 0.5 < beat) {
          tempo.current.judged.add(i);
          missed.set(i, 'miss');
          changed = true;
        }
      });
      if (changed) setStates(missed);
      if (beat > total + 0.2) return finish(changed ? missed : s.states);
    }
    raf.current = window.setTimeout(loop, 15);
  };

  const start = () => {
    setStates(new Map());
    setIndex(0);
    setWrongs(0);
    setLastWrong(null);
    if (state.current.cfg.mode === 'wait') {
      setPhase('play');
      return;
    }
    const beatMs = 60000 / state.current.cfg.bpm;
    tempo.current = { t0: performance.now() + 4 * beatMs + 150, judged: new Set(), scheduled: -5 };
    setPhase('countin');
    setCountIn(4);
    raf.current = window.setTimeout(loop, 15);
  };

  useEffect(
    () =>
      bus.onNote((e) => {
        if (e.type !== 'on') return;
        const s = state.current;
        if (s.phase === 'ready' && s.cfg.mode === 'wait') {
          setPhase('play');
          s.phase = 'play';
        }
        const early = s.phase === 'countin' && s.cfg.mode === 'tempo';
        if (s.phase !== 'play' && !early) return;
        if (s.cfg.mode === 'wait') {
          const target = s.fragment.notes[s.index];
          if (!target) return;
          const next = new Map(s.states);
          if (e.midi === target.midi) {
            next.set(s.index, s.states.get(s.index) === 'late' ? 'late' : 'ok');
            setStates(next);
            setLastWrong(null);
            if (feedbackSounds) synth.cue('ok');
            if (s.index + 1 >= s.fragment.notes.length) finish(next);
            else setIndex(s.index + 1);
          } else {
            next.set(s.index, 'late');
            setStates(next);
            setWrongs((w) => w + 1);
            setLastWrong(e.midi);
            if (feedbackSounds) synth.cue('bad');
          }
          return;
        }
        const beat = (performance.now() - tempo.current.t0) / (60000 / s.cfg.bpm);
        const j = judgeTempo(s.fragment, tempo.current.judged, e.midi, beat);
        if (!j) {
          if (!early) setWrongs((w) => w + 1);
          return;
        }
        tempo.current.judged.add(j.index);
        const next = new Map(s.states);
        next.set(j.index, j.hit ? 'ok' : 'miss');
        setStates(next);
        if (!j.hit) {
          setWrongs((w) => w + 1);
          setLastWrong(e.midi);
        }
      }),
    [feedbackSounds]
  );

  const perLine = width > 900 ? 4 : width > 560 ? 3 : 2;
  const lines = useMemo(() => {
    const out: { from: number; notes: StaffNote[] }[] = [];
    for (let m = 0; m < fragment.measures; m += perLine) {
      const notes: StaffNote[] = [];
      fragment.notes.forEach((n, i) => {
        if (n.measure < m || n.measure >= m + perLine) return;
        const st = states.get(i);
        const isCurrent = phase === 'play' && i === index && st !== 'miss';
        const color = isCurrent && (cfg.mode === 'tempo' || !st || st === 'late') ? COLORS.current : st ? COLORS[st] : undefined;
        const lastInMeasure = fragment.notes[i + 1]?.measure !== n.measure;
        notes.push({ keys: [n.note], duration: n.duration, color, barAfter: lastInMeasure && n.measure < Math.min(fragment.measures, m + perLine) - 1 });
      });
      out.push({ from: m, notes });
    }
    return out;
  }, [fragment, states, index, phase, perLine, cfg.mode]);

  const okCount = [...states.values()].filter((s) => s === 'ok').length;
  const target = fragment.notes[index];
  const marks = new Map<number, KeyMark>();
  if (lastWrong !== null) marks.set(lastWrong, 'bad');
  if (phase === 'play' && cfg.mode === 'wait' && target && states.get(index) === 'late') marks.set(target.midi, 'hint');

  const range = cfg.clef === 'treble' ? { low: 48, high: 91 } : { low: 28, high: 72 };

  return (
    <div class="stack">
      <div>
        <h1>{t('sight.title')}</h1>
        <p class="muted">{t('sight.lead')}</p>
      </div>
      <div class="card stack">
        <div class="sight-lines">
          {lines.map((l) => (
            <Staff
              key={l.from}
              clef={fragment.clef}
              fifths={fragment.fifths}
              timeSig={l.from === 0 ? '4/4' : undefined}
              notes={l.notes}
              final={l.from + perLine >= fragment.measures}
              scale={1.5}
              minHeight={150}
            />
          ))}
        </div>
        <div class={`feedback ${phase === 'done' ? (okCount === fragment.notes.length ? 'ok' : '') : ''}`} aria-live="polite">
          {phase === 'ready' && (
            <button class="primary" onClick={start}>
              {t('common.start')}
            </button>
          )}
          {phase === 'countin' && t('sight.countIn', { n: countIn })}
          {phase === 'play' && (lastWrong !== null ? t('sight.played', { note: midiName(lastWrong, naming) }) : t('sight.playing'))}
          {phase === 'done' && (
            <span>
              {t(cfg.mode === 'tempo' ? 'sight.resultTempo' : 'sight.result', { ok: okCount, total: fragment.notes.length })}
              {wrongs > 0 && ` · ${t('sight.wrongs', { n: wrongs })}`}
            </span>
          )}
        </div>
        <div class="row wrap" style={{ justifyContent: 'center' }}>
          <button class={phase === 'done' ? 'primary' : ''} onClick={() => reset(generate(cfg))}>
            {t('sight.new')}
          </button>
          {phase !== 'ready' && (
            <button
              onClick={() => {
                reset(fragment);
                if (cfg.mode === 'tempo') setTimeout(start, 0);
              }}
            >
              {t('sight.retry')}
            </button>
          )}
        </div>
      </div>
      <PianoKeyboard low={range.low} high={range.high} marks={marks} />
      <details class="card" open>
        <summary>{t('notes.settings')}</summary>
        <div class="form settings-grid" style={{ marginTop: '0.8rem' }}>
          <label>
            <span>{t('notes.clef')}</span>
            <Segmented<Clef>
              value={cfg.clef}
              onChange={(clef) => update({ clef })}
              options={[
                { value: 'treble', label: '𝄞 ' + t('common.treble') },
                { value: 'bass', label: '𝄢 ' + t('common.bass') }
              ]}
            />
          </label>
          <label>
            <span>
              {t('sight.level')} {cfg.level}: {t(`sight.level.${cfg.level}`)}
            </span>
            <input type="range" min={1} max={levelCount()} value={cfg.level} onInput={(e) => update({ level: Number(e.currentTarget.value) })} />
          </label>
          <label>
            <span>{cfg.keyMax === 0 ? t('sight.keyNone') : t('sight.keyMax', { n: cfg.keyMax })}</span>
            <input type="range" min={0} max={7} value={cfg.keyMax} onInput={(e) => update({ keyMax: Number(e.currentTarget.value) })} />
          </label>
          <label>
            <span>{t('sight.measures')}</span>
            <Segmented<number>
              value={cfg.measures}
              onChange={(measures) => update({ measures })}
              options={[2, 4, 8].map((n) => ({ value: n, label: String(n) }))}
            />
          </label>
          <label>
            <span>{t('sight.mode')}</span>
            <Segmented<SightConfig['mode']>
              value={cfg.mode}
              onChange={(mode) => update({ mode })}
              options={[
                { value: 'wait', label: t('sight.wait') },
                { value: 'tempo', label: t('sight.tempo') }
              ]}
            />
          </label>
          {cfg.mode === 'tempo' && (
            <label>
              <span>{t('sight.bpm', { n: cfg.bpm })}</span>
              <input type="range" min={30} max={140} step={5} value={cfg.bpm} onInput={(e) => update({ bpm: Number(e.currentTarget.value) })} />
            </label>
          )}
        </div>
      </details>
    </div>
  );
}

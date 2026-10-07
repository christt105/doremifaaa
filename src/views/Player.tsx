import { useEffect, useRef, useState } from 'preact/hooks';
import { PianoKeyboard, type KeyMark } from '../components/PianoKeyboard';
import { Segmented } from '../components/Segmented';
import { useT } from '../i18n';
import { Follower, expectedNotes, type Hand } from '../lib/follower';
import { bus } from '../lib/input/bus';
import { colorUnderCursor, createOsmd, extractSteps, moveCursor, type Osmd } from '../lib/osmd';
import { settings } from '../lib/settings';
import { loadScore } from '../lib/sources';
import { logSession } from '../lib/srs';
import { load, save } from '../lib/storage';
import { useStore } from '../lib/store';
import * as synth from '../lib/synth';
import { href, type ViewProps } from '../router';
import { issueMeasures } from '../components/QualityBadge';
import { findServerPiece, type ServerPiece } from '../lib/library';

const PREFS = 'doremifaaa.player';

interface Prefs {
  hand: Hand;
  zoom: number;
  hint: boolean;
}

function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Player({ route }: ViewProps) {
  const t = useT();
  const { feedbackSounds } = useStore(settings);
  const [source, id] = route.params;
  const [prefs, setPrefs] = useState<Prefs>({ hand: 'both', zoom: 1, hint: false, ...load<Partial<Prefs>>(PREFS, {}) });
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [, setTick] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const [loop, setLoop] = useState<{ from: number; to: number } | null>(null);
  const [loopInput, setLoopInput] = useState({ from: 1, to: 1 });
  const [lastWrong, setLastWrong] = useState<number | null>(null);
  const [server, setServer] = useState<ServerPiece | null>(null);
  const [hideQuality, setHideQuality] = useState(false);

  useEffect(() => {
    setServer(null);
    setHideQuality(false);
    if (source === 'server') void findServerPiece(id).then(setServer);
  }, [source, id]);
  const issues = server ? issueMeasures(server) : [];
  const host = useRef<HTMLDivElement>(null);
  const osmd = useRef<Osmd | null>(null);
  const follower = useRef<Follower | null>(null);
  const cursorAt = useRef(0);
  const startedAt = useRef(0);
  const finishedIn = useRef(0);
  const totalMeasures = useRef(1);
  const rerender = () => setTick((n) => n + 1);

  const updatePrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    save(PREFS, next);
    return next;
  };

  const syncCursor = (target: number) => {
    const o = osmd.current;
    if (!o) return;
    moveCursor(o.cursor, cursorAt.current, target);
    cursorAt.current = target;
  };

  const redraw = (zoom = prefs.zoom) => {
    const o = osmd.current;
    if (!o) return;
    o.zoom = zoom;
    o.render();
    o.cursor.show();
    o.cursor.reset();
    cursorAt.current = 0;
    syncCursor(follower.current?.index ?? 0);
  };

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const score = await loadScore(source, id);
        if (cancelled || !host.current) return;
        setTitle(score.title);
        host.current.innerHTML = '';
        const o = await createOsmd(host.current);
        await o.load(score.content, score.title);
        if (cancelled) return;
        o.zoom = prefs.zoom;
        o.render();
        o.cursor.show();
        osmd.current = o;
        const steps = extractSteps(o.cursor);
        totalMeasures.current = Math.max(1, ...steps.map((s) => s.measure + 1));
        setLoopInput({ from: 1, to: Math.min(4, totalMeasures.current) });
        follower.current = new Follower(steps, prefs.hand);
        cursorAt.current = 0;
        syncCursor(follower.current.index);
        startedAt.current = 0;
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setError(String((e as Error).message ?? e));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      osmd.current?.clear();
      osmd.current = null;
      follower.current = null;
    };
  }, [source, id]);

  useEffect(
    () =>
      bus.onNote((e) => {
        const f = follower.current;
        const o = osmd.current;
        if (e.type !== 'on' || !f || !o) return;
        if (startedAt.current === 0) startedAt.current = performance.now();
        const ev = f.noteOn(e.midi);
        if (ev.kind === 'advance' || ev.kind === 'loop' || ev.kind === 'done') {
          colorUnderCursor(o.cursor, '#1f8a4c');
          setLastWrong(null);
          setFlash('ok');
          if (ev.kind === 'done') {
            finishedIn.current = performance.now() - startedAt.current;
            o.cursor.hide();
            const playable = f.steps.filter((s) => expectedNotes(s, f.hand).length > 0).length;
            logSession({ mode: 'score', at: Date.now(), total: playable, correct: Math.max(0, playable - f.wrongTotal), avgMs: 0 });
          } else syncCursor(ev.to);
        } else if (ev.kind === 'wrong') {
          setLastWrong(ev.midi);
          setFlash('bad');
          if (feedbackSounds) synth.cue('bad');
        }
        rerender();
      }),
    [feedbackSounds]
  );

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 220);
    return () => clearTimeout(timer);
  }, [flash]);

  const f = follower.current;
  const restart = () => {
    if (!f) return;
    f.restart();
    startedAt.current = 0;
    setLastWrong(null);
    redraw();
    rerender();
  };

  const applyLoop = (next: { from: number; to: number } | null) => {
    if (!f) return;
    setLoop(next);
    f.setLoop(next ? { from: next.from - 1, to: next.to - 1 } : null);
    startedAt.current = 0;
    setLastWrong(null);
    redraw();
    rerender();
  };

  const marks = new Map<number, KeyMark>();
  if (f) {
    if (prefs.hint) f.expected.forEach((m) => marks.set(m, 'hint'));
    f.got.forEach((m) => marks.set(m, 'ok'));
  }
  if (lastWrong !== null) marks.set(lastWrong, 'bad');

  return (
    <div class="stack player">
      <div class="row spread wrap">
        <div>
          <a href={href('library')} class="small">
            ← {t('nav.library')}
          </a>
          <h1 style={{ margin: 0 }}>{title || t('nav.score')}</h1>
        </div>
        {f && status === 'ready' && (
          <div class="row wrap">
            <span class="badge">{t('player.measure', { n: f.measure + 1, total: totalMeasures.current })}</span>
            <span class="badge">{t('player.wrongs', { n: f.wrongTotal })}</span>
          </div>
        )}
      </div>

      {issues.length > 0 && !hideQuality && server?.quality && (
        <div class="card notice row spread wrap">
          <span class="small">
            {t(server.scoreOrigin === 'omr' ? 'omr.noticeConverted' : 'omr.notice', { n: issues.length, total: server.quality.measures, list: issues.slice(0, 8).join(', ') })}
          </span>
          <button class="ghost small" onClick={() => setHideQuality(true)}>
            {t('omr.dismiss')}
          </button>
        </div>
      )}

      <div class="card toolbar row wrap">
        <Segmented<Hand>
          label={t('player.hands')}
          value={prefs.hand}
          onChange={(hand) => {
            updatePrefs({ hand });
            if (f) syncCursor(f.setHand(hand));
            rerender();
          }}
          options={[
            { value: 'both', label: t('player.both') },
            { value: 'right', label: t('player.right') },
            { value: 'left', label: t('player.left') }
          ]}
        />
        <div class="row" role="group" aria-label={t('player.zoom')}>
          <button class="ghost" onClick={() => redraw(updatePrefs({ zoom: Math.max(0.5, +(prefs.zoom - 0.1).toFixed(2)) }).zoom)}>
            A−
          </button>
          <button class="ghost" onClick={() => redraw(updatePrefs({ zoom: Math.min(2, +(prefs.zoom + 0.1).toFixed(2)) }).zoom)}>
            A+
          </button>
        </div>
        <button onClick={restart}>⏮ {t('player.restart')}</button>
        <label class="row small">
          <input type="checkbox" checked={prefs.hint} onChange={(e) => updatePrefs({ hint: e.currentTarget.checked })} />
          {t('player.hint')}
        </label>
        <div class="row small wrap">
          <span>{t('player.loop')}:</span>
          <input
            type="number"
            min={1}
            max={totalMeasures.current}
            value={loopInput.from}
            style={{ width: '4.5rem' }}
            onChange={(e) => setLoopInput({ ...loopInput, from: Number(e.currentTarget.value) })}
          />
          <span>{t('player.loopTo')}</span>
          <input
            type="number"
            min={loopInput.from}
            max={totalMeasures.current}
            value={loopInput.to}
            style={{ width: '4.5rem' }}
            onChange={(e) => setLoopInput({ ...loopInput, to: Number(e.currentTarget.value) })}
          />
          <button onClick={() => applyLoop({ from: Math.max(1, loopInput.from), to: Math.max(loopInput.from, loopInput.to) })}>↻</button>
          {loop && <button onClick={() => applyLoop(null)}>{t('player.loopOff')}</button>}
        </div>
      </div>

      {status === 'loading' && <div class="card empty">{t('player.loading')}</div>}
      {status === 'error' && (
        <div class="card empty">
          <p>{error === 'not-found' ? t('player.notFound') : t('player.error')}</p>
          {error !== 'not-found' && <p class="small muted">{error}</p>}
        </div>
      )}
      {f?.done && (
        <div class="card stack">
          <div class="feedback ok">{t('player.done', { n: f.wrongTotal, time: formatTime(finishedIn.current) })}</div>
          {f.worstMeasures().length > 0 && (
            <div>
              <h3>{t('player.worst')}</h3>
              <div class="row wrap">
                {f.worstMeasures().map((w) => (
                  <button key={w.measure} onClick={() => applyLoop({ from: w.measure + 1, to: w.measure + 1 })}>
                    {t('player.practise', { n: w.measure + 1 })} · {w.errors}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div class={`score paper ${flash ? `flash-${flash}` : ''}`} hidden={status === 'error'}>
        <div ref={host} />
      </div>
      <div class="player-keys">
        <PianoKeyboard low={36} high={96} marks={marks} />
      </div>
    </div>
  );
}

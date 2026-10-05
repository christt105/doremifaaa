import { useMemo, useState } from 'preact/hooks';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { useI18n } from '../i18n';
import { keyLabel } from '../lib/keygen';
import { KEY_SIGNATURES } from '../lib/keys';
import { midiName, noteName } from '../lib/music';
import { settings } from '../lib/settings';
import { accuracy, loadDeck, loadSessions } from '../lib/srs';
import { MASTERED_BOX, daily, errorByMidi, keyRows, noteRows, streak, weakest } from '../lib/stats';
import { useStore } from '../lib/store';
import { href } from '../router';

function heat(rate: number): string {
  return `color-mix(in oklab, #c2372f ${Math.round(12 + rate * 78)}%, #fdfcf9)`;
}

function ActivityChart({ data }: { data: ReturnType<typeof daily> }) {
  const { t, number, percent, date } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(10, ...data.map((d) => d.answers));
  const w = 560;
  const h = 140;
  const pad = { l: 28, r: 4, t: 8, b: 20 };
  const bw = (w - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max];
  const hovered = hover !== null ? data[hover] : null;
  return (
    <div class="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={t('stats.activity')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} class="grid" />
            <text x={pad.l - 6} y={y(v) + 4} class="axis" text-anchor="end">
              {number(v)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * bw;
          const top = y(d.answers);
          const bh = h - pad.b - top;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={x} y={pad.t} width={bw} height={h - pad.t - pad.b} fill="transparent" />
              {d.answers > 0 && (
                <path
                  class={`bar ${hover === i ? 'hot' : ''}`}
                  d={`M${x + 2},${h - pad.b} V${top + Math.min(4, bh)} q0,-4 4,-4 H${x + bw - 6} q4,0 4,4 V${h - pad.b} Z`}
                />
              )}
              {i % 7 === data.length % 7 && (
                <text x={x + bw / 2} y={h - 5} class="axis" text-anchor="middle">
                  {date(d.day, { day: 'numeric', month: 'numeric' })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div class="chart-tip small" aria-live="polite">
        {hovered
          ? t('stats.activityTip', {
              day: date(hovered.day, { weekday: 'short', day: 'numeric', month: 'short' }),
              n: hovered.answers,
              acc: percent(hovered.answers ? hovered.correct / hovered.answers : null)
            })
          : ' '}
      </div>
    </div>
  );
}

export function Stats() {
  const { t, number, percent, seconds, date } = useI18n();
  const { naming } = useStore(settings);
  const data = useMemo(() => {
    const notes = noteRows(loadDeck('notes'));
    const keys = keyRows(loadDeck('keys'));
    const sessions = loadSessions();
    return { notes, keys, sessions };
  }, []);

  const { notes, keys, sessions } = data;
  const week = sessions.filter((s) => s.at > Date.now() - 7 * 86400000);
  const weekTotal = week.reduce((a, s) => a + s.total, 0);
  const weekAcc = weekTotal ? week.reduce((a, s) => a + s.correct, 0) / weekTotal : null;
  const answers = sessions.reduce((a, s) => a + s.total, 0);

  const heatFor = (clef: 'treble' | 'bass') => {
    const colors = new Map<number, string>();
    const titles = new Map<number, string>();
    errorByMidi(notes, clef).forEach((v, midi) => {
      const rate = v.errors / Math.max(1, v.seen);
      colors.set(midi, heat(rate));
      titles.set(midi, `${midiName(midi, naming)} · ${number(v.seen - v.errors)}/${number(v.seen)}`);
    });
    return { colors, titles };
  };

  if (sessions.length === 0 && notes.length === 0 && keys.length === 0)
    return (
      <div class="stack">
        <h1>{t('stats.title')}</h1>
        <div class="card empty">
          <p>{t('stats.empty')}</p>
          <div class="row" style={{ justifyContent: 'center' }}>
            <a class="button primary" href={href('notes')}>
              {t('nav.notes')}
            </a>
            <a class="button" href={href('keys')}>
              {t('nav.keys')}
            </a>
          </div>
        </div>
      </div>
    );

  const weakNotes = weakest(notes, 10);
  const treble = heatFor('treble');
  const bass = heatFor('bass');
  const keyStat = new Map(keys.map((k) => [k.id, k.stat]));

  return (
    <div class="stack">
      <div>
        <h1>{t('stats.title')}</h1>
        <p class="muted">{t('stats.lead')}</p>
      </div>
      <div class="stat-row">
        <div class="stat card">
          <strong>{number(sessions.length)}</strong>
          <span>{t('stats.sessions')}</span>
        </div>
        <div class="stat card">
          <strong>{number(answers)}</strong>
          <span>{t('stats.answers')}</span>
        </div>
        <div class="stat card">
          <strong>{number(streak(sessions))}</strong>
          <span>{t('stats.streak')}</span>
        </div>
        <div class="stat card">
          <strong>{percent(weekAcc)}</strong>
          <span>{t('stats.week')}</span>
        </div>
      </div>

      <section class="card">
        <h2>{t('stats.activity')}</h2>
        <ActivityChart data={daily(sessions, 28)} />
      </section>

      <section class="card stack">
        <div>
          <h2>{t('stats.heat')}</h2>
          <p class="muted small">{t('stats.heatLegend')}</p>
        </div>
        <div class="heat-legend small muted" aria-hidden="true">
          <span>{percent(0)}</span>
          <span class="heat-ramp" />
          <span>{percent(1)}</span>
        </div>
        <h3>𝄞 {t('common.treble')}</h3>
        <PianoKeyboard low={48} high={96} interactive={false} labels={false} colors={treble.colors} titles={treble.titles} />
        <h3>𝄢 {t('common.bass')}</h3>
        <PianoKeyboard low={24} high={72} interactive={false} labels={false} colors={bass.colors} titles={bass.titles} />
      </section>

      <section class="card">
        <div class="row spread wrap">
          <h2>{t('stats.weakNotes')}</h2>
          <a class="button" href={href('notes')}>
            {t('stats.practise')}
          </a>
        </div>
        {weakNotes.length === 0 ? (
          <p class="muted">{t('stats.noWeak')}</p>
        ) : (
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('stats.note')}</th>
                  <th>{t('stats.clef')}</th>
                  <th class="num">{t('stats.seen')}</th>
                  <th class="num">{t('common.accuracy')}</th>
                  <th class="num">{t('stats.time')}</th>
                  <th class="num">{t('stats.level')}</th>
                </tr>
              </thead>
              <tbody>
                {weakNotes.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{noteName(r.note, naming, true)}</strong>
                    </td>
                    <td>{r.clef === 'treble' ? '𝄞' : '𝄢'}</td>
                    <td class="num">{number(r.stat.seen)}</td>
                    <td class="num">{percent(accuracy(r.stat))}</td>
                    <td class="num">{seconds(r.stat.avgMs)}</td>
                    <td class="num">
                      {r.stat.box}/{MASTERED_BOX}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section class="card stack">
        <div class="row spread wrap">
          <div>
            <h2>{t('stats.keysTitle')}</h2>
            <p class="muted small">{t('stats.keysLegend')}</p>
          </div>
          <a class="button" href={href('keys')}>
            {t('stats.practise')}
          </a>
        </div>
        <div class="key-grid">
          {KEY_SIGNATURES.map((k) =>
            (['major', 'minor'] as const).map((quality) => {
              const s = keyStat.get(`${k.fifths}:${quality}`);
              const state = !s ? 'none' : s.box >= MASTERED_BOX ? 'good' : (accuracy(s) ?? 1) < 0.7 ? 'bad' : 'mid';
              return (
                <div
                  key={`${k.fifths}:${quality}`}
                  class={`key-cell k-${state}`}
                  title={s ? `${number(s.correct)}/${number(s.seen)} · ${seconds(s.avgMs)}` : ''}
                >
                  <strong>{keyLabel(k, quality, naming)}</strong>
                  <span>
                    {Math.abs(k.fifths)}
                    {k.fifths >= 0 ? '♯' : '♭'} · {s ? percent(accuracy(s)) : '–'}
                    {state === 'good' && ' ✓'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {sessions.length > 0 && (
        <section class="card">
          <h2>{t('stats.recent')}</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('stats.date')}</th>
                  <th>{t('stats.mode')}</th>
                  <th class="num">{t('stats.answers')}</th>
                  <th class="num">{t('common.accuracy')}</th>
                  <th class="num">{t('stats.time')}</th>
                </tr>
              </thead>
              <tbody>
                {sessions
                  .slice(-15)
                  .reverse()
                  .map((s) => (
                    <tr key={s.at}>
                      <td>{date(s.at, { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>{t(`nav.${s.mode}`)}</td>
                      <td class="num">{number(s.total)}</td>
                      <td class="num">{percent(s.correct / s.total)}</td>
                      <td class="num">{seconds(s.avgMs)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

import { useEffect, useState } from 'preact/hooks';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { useT } from '../i18n';
import { bus, type NoteEvent } from '../lib/input/bus';
import { midiName } from '../lib/music';
import { settings } from '../lib/settings';
import { useStore } from '../lib/store';
import { href } from '../router';

export const MODES = [
  { path: 'notes', icon: '𝅝', key: 'notes' },
  { path: 'keys', icon: '♯', key: 'keys' },
  { path: 'sight', icon: '𝄞', key: 'sight' },
  { path: 'library', icon: '📖', key: 'library' },
  { path: 'stats', icon: '📈', key: 'stats' }
];

export function Home({ available }: { available: Set<string> }) {
  const t = useT();
  const { naming } = useStore(settings);
  const [log, setLog] = useState<NoteEvent[]>([]);
  const modes = MODES.filter((m) => available.has(m.path));

  useEffect(
    () =>
      bus.onNote((e) => {
        if (e.type === 'on') setLog((l) => [e, ...l].slice(0, 12));
      }),
    []
  );

  return (
    <div class="stack">
      <section class="hero">
        <h1>{t('home.title')}</h1>
        <p class="lead">{t('home.lead')}</p>
      </section>

      <section class="card">
        <h2>{t('home.test')}</h2>
        <p class="muted">{t('home.testHint')}</p>
        <div class="note-log" aria-live="polite">
          {log.length === 0 ? (
            <span class="muted">{t('home.noNotes')}</span>
          ) : (
            log.map((e, i) => (
              <span key={e.time + ':' + i} class={`note-pill ${i === 0 ? 'fresh' : ''}`}>
                {midiName(e.midi, naming)}
                <small>{e.source === 'midi' ? `v${e.velocity}` : e.source}</small>
              </span>
            ))
          )}
        </div>
        <PianoKeyboard low={36} high={96} />
        <p class="muted small">{t('home.kbdHint')}</p>
      </section>

      {modes.length > 0 && (
        <section>
          <h2>{t('home.modes')}</h2>
          <div class="mode-grid">
            {modes.map((m) => (
              <a key={m.path} class="mode-card" href={href(m.path)}>
                <span class="mode-icon" aria-hidden="true">
                  {m.icon}
                </span>
                <strong>{t(`nav.${m.key}`)}</strong>
                <span class="muted">{t(`home.${m.key}.desc`)}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <p class="muted small">{t('home.browserNote')}</p>
    </div>
  );
}

import { useRef, useState } from 'preact/hooks';
import { useT } from '../i18n';
import { micStatus, startMic, stopMic } from '../lib/input/mic';
import { midiStatus } from '../lib/input/midi';
import { LANGUAGES } from '../lib/locales';
import type { Naming } from '../lib/music';
import { settings, updateSettings } from '../lib/settings';
import { useStore } from '../lib/store';

const PREFIX = 'doremifaaa.';
const SETTINGS_KEY = 'doremifaaa.settings';

function progressKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX) && k !== SETTINGS_KEY);
  } catch {
    return [];
  }
}

export function SettingsView() {
  const t = useT();
  const s = useStore(settings);
  const midi = useStore(midiStatus);
  const mic = useStore(micStatus);
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const exportData = () => {
    const data: Record<string, unknown> = {};
    progressKeys().forEach((k) => (data[k] = JSON.parse(localStorage.getItem(k) ?? 'null')));
    const blob = new Blob([JSON.stringify({ app: 'doremifaaa', version: 1, data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `doremifaaa-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      Object.entries(parsed.data ?? {}).forEach(([k, v]) => {
        if (k.startsWith(PREFIX)) localStorage.setItem(k, JSON.stringify(v));
      });
      setMessage(t('settings.imported'));
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      setMessage(`${t('common.error')}: ${String(e)}`);
    }
  };

  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    progressKeys().forEach((k) => localStorage.removeItem(k));
    location.reload();
  };

  const check = (key: keyof typeof s, label: string) => (
    <label class="check">
      <input type="checkbox" checked={Boolean(s[key])} onChange={(e) => updateSettings({ [key]: e.currentTarget.checked })} />
      <span>{t(label)}</span>
    </label>
  );

  return (
    <div class="stack narrow">
      <h1>{t('settings.title')}</h1>
      <section class="card form">
        <label>
          <span>{t('settings.lang')}</span>
          <select value={s.lang} onChange={(e) => updateSettings({ lang: e.currentTarget.value })}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>
                {l.meta.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('settings.naming')}</span>
          <select value={s.naming} onChange={(e) => updateSettings({ naming: e.currentTarget.value as Naming })}>
            <option value="solfege">{t('settings.naming.solfege')}</option>
            <option value="letters">{t('settings.naming.letters')}</option>
            <option value="german">{t('settings.naming.german')}</option>
          </select>
          {s.naming === 'german' && <small class="muted">{t('settings.namingHint')}</small>}
        </label>
        <label>
          <span>{t('settings.midiInput')}</span>
          <select value={s.midiInput} onChange={(e) => updateSettings({ midiInput: e.currentTarget.value })}>
            <option value="all">{t('settings.midiAll')}</option>
            {midi.devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {check('soundOnScreen', 'settings.soundOnScreen')}
        {check('soundOnMidi', 'settings.soundOnMidi')}
        {check('feedbackSounds', 'settings.feedbackSounds')}
        {check('showNoteNames', 'settings.showNoteNames')}
        <label class="check">
          <input
            type="checkbox"
            checked={s.micEnabled}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              updateSettings({ micEnabled: on });
              if (on) void startMic();
              else stopMic();
            }}
          />
          <span>{t('settings.mic')}</span>
        </label>
        {mic.state === 'on' && (
          <div class="meter" aria-label={t('settings.micLevel')}>
            <div style={{ width: `${Math.min(100, mic.level * 600)}%` }} />
          </div>
        )}
        {mic.state === 'error' && <p class="bad small">{mic.error}</p>}
        <label>
          <span>{t('settings.library')}</span>
          <input
            type="url"
            placeholder="https://"
            value={s.libraryUrl}
            onChange={(e) => updateSettings({ libraryUrl: e.currentTarget.value.trim().replace(/\/+$/, '') })}
          />
          <small class="muted">{t('settings.libraryHint')}</small>
        </label>
      </section>
      <section class="card">
        <h2>{t('settings.data')}</h2>
        <div class="row wrap">
          <button onClick={exportData}>{t('settings.export')}</button>
          <button onClick={() => fileInput.current?.click()}>{t('settings.import')}</button>
          <button class={confirmReset ? 'danger' : ''} onClick={reset}>
            {confirmReset ? t('settings.resetConfirm') : t('settings.reset')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void importData(f);
            }}
          />
        </div>
        {message && <p class="small">{message}</p>}
      </section>
      <p class="muted small">
        doremifaaa · MIT · <a href="https://github.com/christt105/doremifaaa">GitHub</a>
      </p>
    </div>
  );
}

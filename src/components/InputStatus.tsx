import { useEffect, useState } from 'preact/hooks';
import { useT } from '../i18n';
import { bus } from '../lib/input/bus';
import { connectMidi, midiStatus } from '../lib/input/midi';
import { micStatus } from '../lib/input/mic';
import { useStore } from '../lib/store';

export function InputStatus() {
  const t = useT();
  const midi = useStore(midiStatus);
  const mic = useStore(micStatus);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    let timer = 0;
    return bus.onNote((e) => {
      if (e.type !== 'on') return;
      setPulse(true);
      clearTimeout(timer);
      timer = window.setTimeout(() => setPulse(false), 160);
    });
  }, []);

  let label: string;
  let tone = 'warn';
  switch (midi.state) {
    case 'ready':
      label = midi.devices.length ? midi.devices.map((d) => d.name).join(', ') : t('input.none');
      tone = midi.devices.length ? 'ok' : 'warn';
      break;
    case 'requesting':
      label = t('input.connecting');
      break;
    case 'denied':
      label = t('input.denied');
      tone = 'bad';
      break;
    case 'unsupported':
      label = t('input.unsupported');
      tone = 'bad';
      break;
    case 'insecure':
      label = t('input.insecure');
      tone = 'bad';
      break;
    default:
      label = t('input.connect');
  }

  const clickable = midi.state === 'idle' || midi.state === 'denied' || (midi.state === 'ready' && !midi.devices.length);
  return (
    <div class="input-status">
      {clickable ? (
        <button class={`chip ${tone}`} onClick={() => void connectMidi()}>
          <span class={`dot ${pulse ? 'pulse' : ''}`} />
          {label}
        </button>
      ) : (
        <span class={`chip ${tone}`} title={label}>
          <span class={`dot ${pulse ? 'pulse' : ''}`} />
          <span class="chip-text">{label}</span>
        </span>
      )}
      {mic.state === 'on' && (
        <span class="chip ok" title={t('input.mic')}>
          🎤
        </span>
      )}
    </div>
  );
}

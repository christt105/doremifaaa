import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { bus } from './lib/input/bus';
import { installComputerKeyboard } from './lib/input/keyboard';
import { startMic } from './lib/input/mic';
import { autoConnectMidi } from './lib/input/midi';
import { settings } from './lib/settings';
import * as synth from './lib/synth';
import './styles.css';

bus.onNote((e) => {
  const s = settings.get();
  const audible = e.source === 'midi' ? s.soundOnMidi : e.source === 'mic' ? false : s.soundOnScreen;
  if (!audible) return;
  if (e.type === 'on') synth.noteOn(e.midi, e.velocity);
  else synth.noteOff(e.midi);
});

installComputerKeyboard();
void autoConnectMidi();
if (settings.get().micEnabled) void startMic();
document.documentElement.lang = settings.get().lang;
settings.subscribe((s) => (document.documentElement.lang = s.lang));

if (location.protocol === 'https:' || location.hostname === 'localhost') registerSW({ immediate: true });

render(<App />, document.getElementById('app')!);

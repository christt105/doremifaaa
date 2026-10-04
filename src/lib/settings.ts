import type { Naming } from './music';
import { load, save } from './storage';
import { createStore } from './store';

export type Lang = 'es' | 'en';

export interface Settings {
  lang: Lang;
  naming: Naming;
  midiInput: string;
  soundOnScreen: boolean;
  soundOnMidi: boolean;
  feedbackSounds: boolean;
  keyboardOctave: number;
  micEnabled: boolean;
  libraryUrl: string;
  showNoteNames: boolean;
}

const KEY = 'doremifaaa.settings';

function defaults(): Settings {
  const lang: Lang = typeof navigator !== 'undefined' && !navigator.language.startsWith('es') ? 'en' : 'es';
  return {
    lang,
    naming: lang === 'es' ? 'solfege' : 'letters',
    midiInput: 'all',
    soundOnScreen: true,
    soundOnMidi: false,
    feedbackSounds: false,
    keyboardOctave: 4,
    micEnabled: false,
    libraryUrl: '',
    showNoteNames: false
  };
}

export const settings = createStore<Settings>({ ...defaults(), ...load<Partial<Settings>>(KEY, {}) }, (v) => save(KEY, v));

export function updateSettings(patch: Partial<Settings>): void {
  settings.set((prev) => ({ ...prev, ...patch }));
}

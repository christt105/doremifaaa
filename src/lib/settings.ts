import { defaultNaming, detectLang, isAvailable } from './locales';
import { NAMINGS, type Naming } from './music';
import { load, save } from './storage';
import { createStore } from './store';

export type Lang = string;

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
  serverToken: string;
  showNoteNames: boolean;
}

const KEY = 'doremifaaa.settings';

function defaults(): Settings {
  const lang = detectLang();
  return {
    lang,
    naming: defaultNaming(lang),
    midiInput: 'all',
    soundOnScreen: true,
    soundOnMidi: false,
    feedbackSounds: false,
    keyboardOctave: 4,
    micEnabled: false,
    libraryUrl: '',
    serverToken: '',
    showNoteNames: false
  };
}

function stored(): Partial<Settings> {
  const s = load<Partial<Settings>>(KEY, {});
  if (s.lang !== undefined && !isAvailable(s.lang)) delete s.lang;
  if (s.naming !== undefined && !NAMINGS.includes(s.naming)) delete s.naming;
  return s;
}

export const settings = createStore<Settings>({ ...defaults(), ...stored() }, (v) => save(KEY, v));

export function updateSettings(patch: Partial<Settings>): void {
  settings.set((prev) => ({ ...prev, ...patch }));
}

import { settings } from '../settings';
import { bus } from './bus';

const MAP: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16
};

const active = new Map<string, number>();

function editable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function installComputerKeyboard(): () => void {
  const down = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || editable(e.target)) return;
    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      const octave = settings.get().keyboardOctave + (e.code === 'KeyZ' ? -1 : 1);
      settings.set((s) => ({ ...s, keyboardOctave: Math.max(1, Math.min(7, octave)) }));
      return;
    }
    const offset = MAP[e.code];
    if (offset === undefined) return;
    e.preventDefault();
    const midi = (settings.get().keyboardOctave + 1) * 12 + offset;
    active.set(e.code, midi);
    bus.noteOn(midi, 90, 'keyboard');
  };
  const up = (e: KeyboardEvent) => {
    const midi = active.get(e.code);
    if (midi === undefined) return;
    active.delete(e.code);
    bus.noteOff(midi, 'keyboard');
  };
  const blur = () => {
    active.clear();
    bus.releaseAll('keyboard');
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}

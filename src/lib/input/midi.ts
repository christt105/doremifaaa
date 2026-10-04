import { createStore } from '../store';
import { settings } from '../settings';
import { bus } from './bus';

export type MidiState = 'unsupported' | 'insecure' | 'idle' | 'requesting' | 'denied' | 'ready';

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
}

export const midiStatus = createStore<{ state: MidiState; devices: MidiDevice[]; lastNoteAt: number }>({
  state: 'idle',
  devices: [],
  lastNoteAt: 0
});

let access: MIDIAccess | null = null;

export function midiSupport(): MidiState {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (!('requestMIDIAccess' in navigator)) return 'unsupported';
  return 'idle';
}

function handleMessage(input: MIDIInput, event: MIDIMessageEvent): void {
  const selected = settings.get().midiInput;
  if (selected !== 'all' && selected !== input.id) return;
  const data = event.data;
  if (!data || data.length < 2) return;
  const status = data[0] & 0xf0;
  const d1 = data[1];
  const d2 = data.length > 2 ? data[2] : 0;
  if (status === 0x90 && d2 > 0) {
    bus.noteOn(d1, d2, 'midi');
    midiStatus.set((s) => ({ ...s, lastNoteAt: Date.now() }));
  } else if (status === 0x80 || (status === 0x90 && d2 === 0)) {
    bus.noteOff(d1, 'midi');
  } else if (status === 0xb0) {
    bus.pedal(d1, d2);
  }
}

function refresh(): void {
  if (!access) return;
  const devices: MidiDevice[] = [];
  access.inputs.forEach((input) => {
    input.onmidimessage = (e) => handleMessage(input, e as MIDIMessageEvent);
    devices.push({ id: input.id, name: input.name ?? 'MIDI', manufacturer: input.manufacturer ?? '' });
  });
  midiStatus.set((s) => ({ ...s, state: 'ready', devices }));
}

export async function connectMidi(): Promise<void> {
  const support = midiSupport();
  if (support !== 'idle') {
    midiStatus.set((s) => ({ ...s, state: support }));
    return;
  }
  if (access) return refresh();
  midiStatus.set((s) => ({ ...s, state: 'requesting' }));
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    access.onstatechange = () => refresh();
    refresh();
  } catch {
    midiStatus.set((s) => ({ ...s, state: 'denied' }));
  }
}

export async function autoConnectMidi(): Promise<void> {
  const support = midiSupport();
  if (support !== 'idle') {
    midiStatus.set((s) => ({ ...s, state: support }));
    return;
  }
  try {
    const perm = await navigator.permissions?.query({ name: 'midi' as PermissionName });
    if (perm?.state === 'granted') await connectMidi();
    if (perm?.state === 'denied') midiStatus.set((s) => ({ ...s, state: 'denied' }));
  } catch {
    return;
  }
}

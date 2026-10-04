export type InputSource = 'midi' | 'keyboard' | 'screen' | 'mic';

export interface NoteEvent {
  type: 'on' | 'off';
  midi: number;
  velocity: number;
  source: InputSource;
  time: number;
}

export interface PedalEvent {
  controller: number;
  value: number;
  time: number;
}

type NoteListener = (event: NoteEvent) => void;
type PedalListener = (event: PedalEvent) => void;

class InputBus {
  readonly held = new Set<number>();
  private noteListeners = new Set<NoteListener>();
  private pedalListeners = new Set<PedalListener>();
  private heldListeners = new Set<(held: ReadonlySet<number>) => void>();

  noteOn(midi: number, velocity: number, source: InputSource): void {
    this.held.add(midi);
    this.emit({ type: 'on', midi, velocity, source, time: performance.now() });
  }

  noteOff(midi: number, source: InputSource): void {
    if (!this.held.delete(midi)) return;
    this.emit({ type: 'off', midi, velocity: 0, source, time: performance.now() });
  }

  pedal(controller: number, value: number): void {
    const event = { controller, value, time: performance.now() };
    this.pedalListeners.forEach((l) => l(event));
  }

  releaseAll(source: InputSource): void {
    [...this.held].forEach((m) => this.noteOff(m, source));
  }

  onNote(listener: NoteListener): () => void {
    this.noteListeners.add(listener);
    return () => this.noteListeners.delete(listener);
  }

  onPedal(listener: PedalListener): () => void {
    this.pedalListeners.add(listener);
    return () => this.pedalListeners.delete(listener);
  }

  onHeld(listener: (held: ReadonlySet<number>) => void): () => void {
    this.heldListeners.add(listener);
    return () => this.heldListeners.delete(listener);
  }

  private emit(event: NoteEvent): void {
    this.noteListeners.forEach((l) => l(event));
    this.heldListeners.forEach((l) => l(this.held));
  }
}

export const bus = new InputBus();

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const voices = new Map<number, { gain: GainNode; oscs: OscillatorNode[] }>();

function audio(): { ctx: AudioContext; master: GainNode } {
  if (!ctx || !master) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, master };
}

export function audioContext(): AudioContext {
  return audio().ctx;
}

function freq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteOn(midi: number, velocity = 90): void {
  noteOff(midi, 0.02);
  const { ctx, master } = audio();
  const t = ctx.currentTime;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(9000, freq(midi) * 6), t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(400, freq(midi) * 2), t + 1.2);
  const peak = 0.12 + (velocity / 127) * 0.3;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.5);
  gain.gain.exponentialRampToValueAtTime(0.0008, t + 3.5);
  const oscs = [
    { type: 'triangle' as OscillatorType, mult: 1, level: 1 },
    { type: 'sine' as OscillatorType, mult: 2, level: 0.25 },
    { type: 'sine' as OscillatorType, mult: 0.5, level: 0.15 }
  ].map(({ type, mult, level }) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq(midi) * mult;
    g.gain.value = level;
    osc.connect(g).connect(filter);
    osc.start(t);
    osc.stop(t + 3.6);
    return osc;
  });
  filter.connect(gain).connect(master);
  voices.set(midi, { gain, oscs });
}

export function noteOff(midi: number, release = 0.25): void {
  const voice = voices.get(midi);
  if (!voice || !ctx) return;
  voices.delete(midi);
  const t = ctx.currentTime;
  voice.gain.gain.cancelScheduledValues(t);
  voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0008), t);
  voice.gain.gain.exponentialRampToValueAtTime(0.0008, t + release);
  voice.oscs.forEach((o) => o.stop(t + release + 0.05));
}

export function click(accent = false, at?: number): void {
  const { ctx, master } = audio();
  const t = at ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1760 : 1175;
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + 0.07);
}

export function cue(kind: 'ok' | 'bad'): void {
  const { ctx, master } = audio();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = kind === 'ok' ? 'sine' : 'square';
  osc.frequency.setValueAtTime(kind === 'ok' ? 1320 : 180, t);
  gain.gain.setValueAtTime(kind === 'ok' ? 0.08 : 0.05, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + 0.16);
}

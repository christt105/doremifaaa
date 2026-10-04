import { createStore } from '../store';
import { audioContext } from '../synth';
import { bus } from './bus';

export const micStatus = createStore<{ state: 'off' | 'starting' | 'on' | 'error'; level: number; error?: string }>({
  state: 'off',
  level: 0
});

let stream: MediaStream | null = null;
let raf = 0;
let current: number | null = null;
let candidate: number | null = null;
let candidateFrames = 0;
let silentFrames = 0;
let prevRms = 0;

export function yin(buffer: Float32Array, sampleRate: number, threshold = 0.12): { freq: number; clarity: number } | null {
  const half = Math.floor(buffer.length / 2);
  const minTau = Math.floor(sampleRate / 2200);
  const maxTau = Math.min(half, Math.floor(sampleRate / 60));
  const diff = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const d = buffer[i] - buffer[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += diff[tau];
    cmnd[tau] = running === 0 ? 1 : (diff[tau] * tau) / running;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  const x0 = tau > 1 ? cmnd[tau - 1] : cmnd[tau];
  const x2 = tau < maxTau ? cmnd[tau + 1] : cmnd[tau];
  const denom = 2 * (2 * cmnd[tau] - x2 - x0);
  const better = denom !== 0 ? tau + (x2 - x0) / denom : tau;
  return { freq: sampleRate / better, clarity: 1 - cmnd[tau] };
}

export function freqToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

function release(): void {
  if (current !== null) bus.noteOff(current, 'mic');
  current = null;
}

function tick(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>, sampleRate: number): void {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  micStatus.set((s) => (Math.abs(s.level - rms) > 0.005 ? { ...s, level: rms } : s));
  const result = rms > 0.012 ? yin(buf, sampleRate) : null;
  if (!result || result.clarity < 0.8) {
    silentFrames++;
    if (silentFrames > 5) release();
    candidate = null;
  } else {
    silentFrames = 0;
    const midi = freqToMidi(result.freq);
    const restrike = current === midi && rms > prevRms * 2.2 && rms > 0.03;
    if (midi === candidate) candidateFrames++;
    else {
      candidate = midi;
      candidateFrames = 1;
    }
    if ((candidateFrames >= 2 && midi !== current) || restrike) {
      release();
      current = midi;
      bus.noteOn(midi, 80, 'mic');
    }
  }
  prevRms = rms;
  raf = requestAnimationFrame(() => tick(analyser, buf, sampleRate));
}

export async function startMic(): Promise<void> {
  if (stream) return;
  micStatus.set({ state: 'starting', level: 0 });
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    const ctx = audioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    micStatus.set({ state: 'on', level: 0 });
    tick(analyser, new Float32Array(analyser.fftSize), ctx.sampleRate);
  } catch (e) {
    stream = null;
    micStatus.set({ state: 'error', level: 0, error: String(e) });
  }
}

export function stopMic(): void {
  cancelAnimationFrame(raf);
  release();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  micStatus.set({ state: 'off', level: 0 });
}

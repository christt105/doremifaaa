import { useEffect, useRef, useState } from 'preact/hooks';
import { Accidental, BarNote, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow/bravura';
import { keyAccidentalFor } from '../lib/keys';
import { type Clef, type Spelled, accidentalVex, vexKey } from '../lib/music';

export interface StaffNote {
  keys: Spelled[];
  duration: string;
  color?: string;
  rest?: boolean;
  barAfter?: boolean;
}

interface Props {
  clef: Clef;
  fifths?: number;
  keySpec?: string;
  timeSig?: string;
  notes?: StaffNote[];
  width?: number;
  scale?: number;
  minHeight?: number;
}

let fontsReady: Promise<unknown> | null = null;

function waitFonts(): Promise<unknown> {
  fontsReady ??= Promise.all([document.fonts.load('30px Bravura'), document.fonts.load('12px Academico')]).catch(() => null);
  return fontsReady;
}

export function displayAccidental(s: Spelled, fifths: number): string | null {
  const inKey = keyAccidentalFor(s.letter, fifths);
  if (s.acc === inKey) return null;
  return s.acc === 0 ? 'n' : accidentalVex(s.acc);
}

const FIFTHS_SPEC: Record<number, string> = {
  [-7]: 'Cb', [-6]: 'Gb', [-5]: 'Db', [-4]: 'Ab', [-3]: 'Eb', [-2]: 'Bb', [-1]: 'F',
  0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#'
};

export function Staff({ clef, fifths = 0, keySpec, timeSig, notes = [], width, scale = 1.6, minHeight = 150 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [hostWidth, setHostWidth] = useState(0);

  useEffect(() => {
    void waitFonts().then(() => setReady(true));
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHostWidth(el.clientWidth));
    ro.observe(el);
    setHostWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el || !ready || hostWidth === 0) return;
    el.innerHTML = '';
    const fullWidth = width ?? hostWidth;
    const s = Math.min(scale, fullWidth / 260);
    const logicalWidth = fullWidth / s;
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    const tall = notes.some((n) => n.keys.some((k) => Math.abs(k.octave - (clef === 'treble' ? 4.5 : 2.5)) > 1.5));
    const logicalHeight = Math.max(minHeight / s, tall ? 190 : 150);
    renderer.resize(fullWidth, logicalHeight * s);
    const ctx = renderer.getContext();
    ctx.scale(s, s);
    const top = (logicalHeight - 40) / 2 - 20;
    const stave = new Stave(6, top, logicalWidth - 12);
    stave.addClef(clef);
    stave.addKeySignature(keySpec ?? FIFTHS_SPEC[fifths]);
    if (timeSig) stave.addTimeSignature(timeSig);
    stave.setContext(ctx).draw();
    if (notes.length === 0) return;
    const tickables: (StaveNote | BarNote)[] = [];
    notes.forEach((n) => {
      const keys = n.rest ? [clef === 'treble' ? 'b/4' : 'd/3'] : n.keys.map((k) => vexKey(k, false));
      const sn = new StaveNote({ keys, duration: n.rest ? `${n.duration}r` : n.duration, clef, autoStem: true });
      if (!n.rest)
        n.keys.forEach((k, i) => {
          const acc = displayAccidental(k, fifths);
          if (acc) sn.addModifier(new Accidental(acc), i);
        });
      if (n.color) sn.setStyle({ fillStyle: n.color, strokeStyle: n.color });
      tickables.push(sn);
      if (n.barAfter) tickables.push(new BarNote());
    });
    const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT);
    voice.addTickables(tickables);
    const available = stave.getNoteEndX() - stave.getNoteStartX() - 16;
    new Formatter().joinVoices([voice]).format([voice], Math.max(available, 40));
    if (tickables.length === 1) tickables[0].setXShift(Math.max(0, available / 2 - 20));
    voice.draw(ctx, stave);
  }, [ready, hostWidth, clef, fifths, keySpec, timeSig, notes, width, scale, minHeight]);

  return <div class="staff paper" ref={host} />;
}

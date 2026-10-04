import { useEffect, useRef, useState } from 'preact/hooks';
import { bus } from '../lib/input/bus';
import { isBlackKey, midiName } from '../lib/music';
import { settings } from '../lib/settings';
import { useStore } from '../lib/store';

export type KeyMark = 'ok' | 'bad' | 'hint';

interface Props {
  low?: number;
  high?: number;
  marks?: Map<number, KeyMark>;
  interactive?: boolean;
  labels?: boolean;
  colors?: Map<number, string>;
  titles?: Map<number, string>;
}

const BLACK_OFFSET: Record<number, number> = { 1: -0.12, 3: 0.12, 6: -0.15, 8: 0, 10: 0.15 };

export function useHeldNotes(): ReadonlySet<number> {
  const [held, setHeld] = useState<ReadonlySet<number>>(new Set(bus.held));
  useEffect(() => bus.onHeld((h) => setHeld(new Set(h))), []);
  return held;
}

export function PianoKeyboard({ low = 36, high = 96, marks, interactive = true, labels, colors, titles }: Props) {
  const held = useHeldNotes();
  const { naming, showNoteNames } = useStore(settings);
  const showLabels = labels ?? showNoteNames;
  const scroller = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, number>());

  const whites: number[] = [];
  for (let m = low; m <= high; m++) if (!isBlackKey(m)) whites.push(m);
  const whiteWidth = 100 / whites.length;

  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const c4 = whites.indexOf(60);
    if (c4 >= 0) el.scrollLeft = (c4 / whites.length) * el.scrollWidth - el.clientWidth / 2;
  }, [low, high]);

  const press = (midi: number, pointerId: number) => {
    if (!interactive) return;
    const prev = pointers.current.get(pointerId);
    if (prev === midi) return;
    if (prev !== undefined) bus.noteOff(prev, 'screen');
    pointers.current.set(pointerId, midi);
    bus.noteOn(midi, 90, 'screen');
  };

  const lift = (pointerId: number) => {
    const prev = pointers.current.get(pointerId);
    if (prev === undefined) return;
    pointers.current.delete(pointerId);
    bus.noteOff(prev, 'screen');
  };

  const keyFromEvent = (e: PointerEvent): number | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const v = el?.dataset.midi;
    return v ? Number(v) : null;
  };

  const handlers = interactive
    ? {
        onPointerDown: (e: PointerEvent) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const m = keyFromEvent(e);
          if (m !== null) press(m, e.pointerId);
        },
        onPointerMove: (e: PointerEvent) => {
          if (!pointers.current.has(e.pointerId)) return;
          const m = keyFromEvent(e);
          if (m !== null) press(m, e.pointerId);
        },
        onPointerUp: (e: PointerEvent) => lift(e.pointerId),
        onPointerCancel: (e: PointerEvent) => lift(e.pointerId)
      }
    : {};

  const cls = (midi: number) => {
    const mark = marks?.get(midi);
    return [held.has(midi) ? 'held' : '', mark ? `mark-${mark}` : ''].join(' ');
  };

  return (
    <div class="piano-scroll" ref={scroller}>
      <div class="piano" style={{ minWidth: `${whites.length * 1.9}rem` }} {...handlers}>
        {whites.map((m) => (
          <div key={m} data-midi={m} class={`key white ${cls(m)}`} title={titles?.get(m)} style={{ width: `${whiteWidth}%`, background: colors?.get(m) }}>
            {(showLabels || m % 12 === 0) && <span class="key-label">{midiName(m, naming, m % 12 === 0)}</span>}
          </div>
        ))}
        {whites.map((m, i) =>
          m + 1 <= high && isBlackKey(m + 1) ? (
            <div
              key={m + 1}
              data-midi={m + 1}
              class={`key black ${cls(m + 1)}`}
              title={titles?.get(m + 1)}
              style={{ left: `${(i + 1 - 0.3 + (BLACK_OFFSET[(m + 1) % 12] ?? 0) * 0.6) * whiteWidth}%`, width: `${whiteWidth * 0.6}%`, background: colors?.get(m + 1) }}
            />
          ) : null
        )}
      </div>
    </div>
  );
}

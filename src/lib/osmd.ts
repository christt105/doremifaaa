import type { Cursor, OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { Step, StepNote } from './follower';

export type Osmd = OpenSheetMusicDisplay;

export async function createOsmd(container: HTMLElement): Promise<Osmd> {
  const mod = await import('opensheetmusicdisplay');
  return new mod.OpenSheetMusicDisplay(container, {
    autoResize: true,
    backend: 'svg',
    drawTitle: true,
    drawComposer: true,
    drawPartNames: false,
    followCursor: true,
    pageFormat: 'Endless',
    cursorsOptions: [{ type: 0, color: '#3c5bd6', alpha: 0.35, follow: true }]
  });
}

export function scoreContent(buffer: ArrayBuffer): string | Blob {
  const bytes = new Uint8Array(buffer.slice(0, 2));
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return new Blob([buffer]);
  return new TextDecoder().decode(buffer);
}

export function extractSteps(cursor: Cursor): Step[] {
  const steps: Step[] = [];
  cursor.reset();
  const it = cursor.iterator;
  let guard = 0;
  while (!it.EndReached && guard++ < 100000) {
    const notes: StepNote[] = [];
    for (const ve of it.CurrentVoiceEntries) {
      if (ve.IsGrace) continue;
      for (const n of ve.Notes) {
        if (n.isRest() || !n.Pitch) continue;
        if (n.NoteTie && n.NoteTie.StartNote !== n) continue;
        const staff = n.ParentStaff;
        const staves = staff.ParentInstrument.Staves;
        const hand = staves.length < 2 ? 'any' : staves.indexOf(staff) === 0 ? 'right' : 'left';
        notes.push({ midi: n.halfTone + 12, hand });
      }
    }
    steps.push({ notes, measure: it.CurrentMeasureIndex });
    cursor.next();
  }
  cursor.reset();
  return steps;
}

export function moveCursor(cursor: Cursor, from: number, to: number): void {
  if (to < from) {
    cursor.reset();
    from = 0;
  }
  for (let i = from; i < to && !cursor.iterator.EndReached; i++) cursor.next();
}

export function colorUnderCursor(cursor: Cursor, color: string): void {
  for (const g of cursor.GNotesUnderCursor()) {
    const vf = g as unknown as { setColor?: (c: string, o: Record<string, boolean>) => void };
    vf.setColor?.(color, { applyToNoteheads: true, applyToStem: true, applyToBeams: false, applyToFlag: true, applyToLedgerLines: true });
  }
}

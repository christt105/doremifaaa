import { isBlackKey } from './music';

export interface ScrollBox {
  left: number;
  width: number;
  total: number;
}

function whiteIndex(low: number, midi: number): number {
  let i = 0;
  for (let m = low; m < midi; m++) if (!isBlackKey(m)) i++;
  return isBlackKey(midi) ? i - 0.5 : i;
}

export function followScroll(low: number, high: number, notes: number[], box: ScrollBox, margin = 0.5): number | null {
  const inRange = notes.filter((m) => m >= low && m <= high);
  if (inRange.length === 0 || box.total <= box.width) return null;
  const key = box.total / whiteIndex(low, high + 1);
  const start = Math.min(...inRange.map((m) => whiteIndex(low, m))) * key;
  const end = (Math.max(...inRange.map((m) => whiteIndex(low, m))) + 1) * key;
  if (start - margin * key >= box.left && end + margin * key <= box.left + box.width) return null;
  const target = Math.round(Math.max(0, Math.min(box.total - box.width, (start + end) / 2 - box.width / 2)));
  return Math.abs(target - box.left) < 1 ? null : target;
}

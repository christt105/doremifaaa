import { describe, expect, it } from 'vitest';
import { followScroll } from '../src/lib/keyscroll';

const LOW = 36;
const HIGH = 96;
const KEY = 30;
const box = (left: number, width = 330) => ({ left, width, total: 36 * KEY });

describe('keyboard follow scroll', () => {
  it('leaves the keyboard alone when the notes are already visible', () => {
    const c4 = 14 * KEY;
    expect(followScroll(LOW, HIGH, [60, 64, 67], box(c4 - 2 * KEY))).toBeNull();
  });

  it('centres notes that are out of view', () => {
    const target = followScroll(LOW, HIGH, [84], box(0));
    expect(target).not.toBeNull();
    const c6 = 28 * KEY;
    expect(c6).toBeGreaterThanOrEqual(target!);
    expect(c6 + KEY).toBeLessThanOrEqual(target! + 330);
    expect(Math.abs(target! + 165 - (c6 + KEY / 2))).toBeLessThan(KEY);
  });

  it('scrolls when a note sits right at the edge', () => {
    const left = 14 * KEY;
    expect(followScroll(LOW, HIGH, [60], box(left))).not.toBeNull();
  });

  it('places black keys between their white neighbours', () => {
    const target = followScroll(LOW, HIGH, [61], box(0));
    const centre = target! + 165;
    expect(centre).toBeGreaterThan(14 * KEY);
    expect(centre).toBeLessThan(15 * KEY + KEY / 2);
  });

  it('clamps to the ends of the keyboard', () => {
    expect(followScroll(LOW, HIGH, [36], box(600))).toBe(0);
    expect(followScroll(LOW, HIGH, [96], box(0))).toBe(36 * KEY - 330);
  });

  it('ignores notes outside the keyboard and keyboards that fit', () => {
    expect(followScroll(LOW, HIGH, [20, 110], box(0))).toBeNull();
    expect(followScroll(LOW, HIGH, [84], { left: 0, width: 2000, total: 1080 })).toBeNull();
    expect(followScroll(LOW, HIGH, [], box(0))).toBeNull();
  });
});

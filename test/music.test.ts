import { describe, expect, it } from 'vitest';
import { KEY_SIGNATURES, alteredLetters, keyAccidentalFor, keyByFifths } from '../src/lib/keys';
import { fromMidi, ledgerLines, midiName, noteName, rangeForLedgers, toMidi, fromDiatonic } from '../src/lib/music';

describe('pitch math', () => {
  it('maps middle C to 60', () => {
    expect(toMidi({ letter: 0, acc: 0, octave: 4 })).toBe(60);
    expect(toMidi({ letter: 5, acc: 0, octave: 4 })).toBe(69);
    expect(toMidi({ letter: 6, acc: 1, octave: 3 })).toBe(60);
    expect(toMidi({ letter: 0, acc: -1, octave: 4 })).toBe(59);
  });

  it('spells midi numbers with sharps or flats', () => {
    expect(fromMidi(61)).toEqual({ letter: 0, acc: 1, octave: 4 });
    expect(fromMidi(61, true)).toEqual({ letter: 1, acc: -1, octave: 4 });
    expect(fromMidi(21)).toEqual({ letter: 5, acc: 0, octave: 0 });
  });

  it('names notes in both systems', () => {
    expect(midiName(60, 'solfege')).toBe('Do4');
    expect(midiName(70, 'letters', false, true)).toBe('B♭');
    expect(noteName({ letter: 4, acc: 1, octave: 5 }, 'solfege', true)).toBe('Sol♯5');
  });

  it('names B natural H and B flat B in the German system', () => {
    expect(midiName(71, 'german')).toBe('H4');
    expect(midiName(70, 'german', false, true)).toBe('B');
    expect(midiName(70, 'german', false)).toBe('A♯');
    expect(noteName({ letter: 6, acc: 1, octave: 3 }, 'german')).toBe('H♯');
    expect(noteName({ letter: 6, acc: -2, octave: 3 }, 'german')).toBe('B♭');
    expect(noteName({ letter: 2, acc: -1, octave: 4 }, 'german', true)).toBe('E♭4');
  });

  it('counts ledger lines', () => {
    expect(ledgerLines({ letter: 0, acc: 0, octave: 4 }, 'treble')).toBe(1);
    expect(ledgerLines({ letter: 5, acc: 0, octave: 5 }, 'treble')).toBe(1);
    expect(ledgerLines({ letter: 0, acc: 0, octave: 6 }, 'treble')).toBe(2);
    expect(ledgerLines({ letter: 3, acc: 0, octave: 5 }, 'treble')).toBe(0);
    expect(ledgerLines({ letter: 0, acc: 0, octave: 4 }, 'bass')).toBe(1);
    expect(ledgerLines({ letter: 2, acc: 0, octave: 2 }, 'bass')).toBe(1);
  });

  it('builds ranges from ledger counts', () => {
    const r = rangeForLedgers('treble', 2, 3);
    expect(fromDiatonic(r.min)).toEqual({ letter: 4, acc: 0, octave: 3 });
    expect(fromDiatonic(r.max)).toEqual({ letter: 3, acc: 0, octave: 6 });
  });
});

describe('key signatures', () => {
  it('has the fifteen standard keys', () => {
    expect(KEY_SIGNATURES).toHaveLength(15);
    expect(keyByFifths(0).vexMajor).toBe('C');
    expect(keyByFifths(3).vexMajor).toBe('A');
    expect(keyByFifths(3).vexMinor).toBe('F#m');
    expect(keyByFifths(-4).vexMajor).toBe('Ab');
    expect(keyByFifths(-4).vexMinor).toBe('Fm');
    expect(keyByFifths(-7).vexMajor).toBe('Cb');
    expect(keyByFifths(7).vexMinor).toBe('A#m');
  });

  it('lists altered letters in order', () => {
    expect(alteredLetters(2)).toEqual([3, 0]);
    expect(alteredLetters(-3)).toEqual([6, 2, 5]);
    expect(keyAccidentalFor(3, 1)).toBe(1);
    expect(keyAccidentalFor(6, -1)).toBe(-1);
    expect(keyAccidentalFor(0, -1)).toBe(0);
  });

  it('relative minor sits a minor third below the major', () => {
    for (const k of KEY_SIGNATURES) {
      const diff = (toMidi(k.major) - toMidi(k.minor) + 12) % 12;
      expect(diff).toBe(3);
    }
  });
});

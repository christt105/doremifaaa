import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatPercent, hasKey, translate } from '../src/i18n';
import { LANGUAGES, LOCALES, detectLang } from '../src/lib/locales';
import { NAMINGS } from '../src/lib/music';

const DIR = new URL('../src/locales/', import.meta.url);
const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];

type Strings = Record<string, string>;

function read(file: string): { _meta?: { name?: unknown; noteNames?: unknown } } & Strings {
  return JSON.parse(readFileSync(new URL(file, DIR), 'utf8'));
}

function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}

function pluralBase(key: string, reference: Strings): string | null {
  const dot = key.lastIndexOf('.');
  if (dot < 0 || !PLURAL_FORMS.includes(key.slice(dot + 1))) return null;
  const base = key.slice(0, dot);
  return `${base}.other` in reference ? base : null;
}

const { _meta: _, ...en } = read('en.json');
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));

describe('locale files', () => {
  it.each(files)('%s has a native name and default note names', (file) => {
    const { _meta } = read(file);
    expect(typeof _meta?.name).toBe('string');
    expect(NAMINGS).toContain(_meta?.noteNames);
  });

  it.each(files.filter((f) => f !== 'en.json'))('%s matches en.json', (file) => {
    const { _meta: __, ...strings } = read(file);
    const extra: string[] = [];
    const mismatched: string[] = [];
    for (const [key, text] of Object.entries(strings)) {
      expect(typeof text, key).toBe('string');
      const base = pluralBase(key, en);
      const reference = key in en ? en[key] : base ? en[`${base}.other`] : undefined;
      if (reference === undefined) {
        extra.push(key);
        continue;
      }
      const mine = placeholders(text);
      const theirs = placeholders(reference);
      const ok = base ? mine.every((p) => theirs.includes(p)) : mine.join() === theirs.join();
      if (!ok) mismatched.push(`${key}: {${mine.join('}, {')}} vs {${theirs.join('}, {')}}`);
    }
    expect(extra, 'keys that do not exist in en.json').toEqual([]);
    expect(mismatched, 'placeholders that differ from en.json').toEqual([]);
    const missing = Object.keys(en).filter((key) => !(key in strings) && !(pluralBase(key, en) && Object.keys(strings).some((k) => pluralBase(k, en) === pluralBase(key, en))));
    if (missing.length) console.warn(`${file}: ${missing.length} keys missing, English is shown instead:\n  ${missing.join('\n  ')}`);
  });
});

describe('translation', () => {
  it('discovers every locale file', () => {
    expect(Object.keys(LOCALES).sort()).toEqual(files.map((f) => f.replace('.json', '')).sort());
    expect(LANGUAGES.map((l) => l.meta.name)).toContain('Español');
  });

  it('falls back to English for missing keys and never shows a raw key that English has', () => {
    expect(translate('xx', 'nav.home')).toBe('Home');
    expect(translate('es', 'nav.home')).toBe('Inicio');
    expect(hasKey('nav.home')).toBe(true);
    expect(hasKey('status.Unknown')).toBe(false);
  });

  it('picks plural forms with Intl.PluralRules', () => {
    expect(translate('en', 'pdf.pages', { n: 1 })).toBe('1 page');
    expect(translate('en', 'pdf.pages', { n: 3 })).toBe('3 pages');
    expect(translate('es', 'player.wrongs', { n: 1 })).toBe('1 fallo');
    expect(translate('es', 'player.wrongs', { n: 0 })).toBe('0 fallos');
  });

  it('formats numbers with the language conventions', () => {
    expect(translate('en', 'library.serverHint', { n: 1234, name: 'x' })).toMatch(/^1,234 pieces/);
    expect(formatPercent('es', 0.5)).toBe('50 %');
    expect(formatPercent('en', null)).toBe('–');
  });

  it('detects the browser language and defaults to English', () => {
    expect(detectLang(['es-ES', 'en'])).toBe('es');
    expect(detectLang(['ja-JP'])).toBe('en');
    expect(detectLang([])).toBe('en');
  });
});

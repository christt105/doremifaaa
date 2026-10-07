import type { Naming } from './music';

export interface LocaleMeta {
  name: string;
  noteNames: Naming;
}

export type LocaleFile = { _meta: LocaleMeta } & Record<string, string | LocaleMeta>;

export interface Locale {
  code: string;
  meta: LocaleMeta;
  strings: Record<string, string>;
}

export const REFERENCE_LANG = 'en';

const files = import.meta.glob<LocaleFile>('../locales/*.json', { eager: true, import: 'default' });

export const LOCALES: Record<string, Locale> = Object.fromEntries(
  Object.entries(files).map(([path, file]) => {
    const code = path.replace(/^.*\/(.+)\.json$/, '$1');
    const { _meta, ...strings } = file;
    return [code, { code, meta: _meta, strings: strings as Record<string, string> }];
  })
);

export const LANGUAGES: Locale[] = Object.values(LOCALES).sort((a, b) => a.meta.name.localeCompare(b.meta.name));

export function isAvailable(code: string | undefined): boolean {
  return Boolean(code && LOCALES[code]);
}

export function detectLang(preferred: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): string {
  for (const tag of preferred) {
    if (isAvailable(tag)) return tag;
    const base = tag.split('-')[0].toLowerCase();
    if (isAvailable(base)) return base;
  }
  return REFERENCE_LANG;
}

export function defaultNaming(code: string): Naming {
  return LOCALES[code]?.meta.noteNames ?? 'letters';
}

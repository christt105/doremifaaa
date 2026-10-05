import { LOCALES, REFERENCE_LANG } from './lib/locales';
import { settings, type Lang } from './lib/settings';
import { useStore } from './lib/store';

export type Params = Record<string, string | number>;
export type Translate = (key: string, params?: Params) => string;

const pluralRules = new Map<string, Intl.PluralRules>();
const numberFormats = new Map<string, Intl.NumberFormat>();

function plurals(lang: Lang): Intl.PluralRules {
  let rules = pluralRules.get(lang);
  if (!rules) pluralRules.set(lang, (rules = new Intl.PluralRules(lang)));
  return rules;
}

function lookup(lang: Lang, key: string, count: number | undefined): string | undefined {
  const strings = LOCALES[lang]?.strings;
  if (!strings) return undefined;
  if (count !== undefined) {
    const form = strings[`${key}.${plurals(lang).select(count)}`] ?? strings[`${key}.other`];
    if (form !== undefined) return form;
  }
  return strings[key];
}

export function hasKey(key: string): boolean {
  return lookup(REFERENCE_LANG, key, undefined) !== undefined || lookup(REFERENCE_LANG, `${key}.other`, undefined) !== undefined;
}

export function formatNumber(lang: Lang, value: number, options?: Intl.NumberFormatOptions): string {
  if (options) return new Intl.NumberFormat(lang, options).format(value);
  let format = numberFormats.get(lang);
  if (!format) numberFormats.set(lang, (format = new Intl.NumberFormat(lang)));
  return format.format(value);
}

export function formatPercent(lang: Lang, ratio: number | null): string {
  return ratio === null ? '–' : formatNumber(lang, ratio, { style: 'percent', maximumFractionDigits: 0 });
}

export function formatDate(lang: Lang, date: Date | number | string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(lang, options).format(typeof date === 'string' ? new Date(`${date}T00:00:00`) : date);
}

export function translate(lang: Lang, key: string, params?: Params): string {
  const count = typeof params?.n === 'number' ? params.n : undefined;
  let text = lookup(lang, key, count) ?? lookup(REFERENCE_LANG, key, count) ?? key;
  if (params)
    for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, typeof v === 'number' ? formatNumber(lang, v) : v);
  return text;
}

export interface I18n {
  lang: Lang;
  t: Translate;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  percent: (ratio: number | null) => string;
  seconds: (ms: number) => string;
  date: (date: Date | number | string, options: Intl.DateTimeFormatOptions) => string;
}

export function useI18n(): I18n {
  const { lang } = useStore(settings);
  const tr: Translate = (key, params) => translate(lang, key, params);
  return {
    lang,
    t: tr,
    number: (value, options) => formatNumber(lang, value, options),
    percent: (ratio) => formatPercent(lang, ratio),
    seconds: (ms) => tr('common.seconds', { n: formatNumber(lang, ms / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }),
    date: (date, options) => formatDate(lang, date, options)
  };
}

export function useT(): Translate {
  return useI18n().t;
}

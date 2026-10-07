import { libraryUrl } from './library';
import { authHeaders } from './api';
import { readSettings, settings, SETTINGS_KEY, type Settings } from './settings';
import { onSave } from './storage';
import { createStore } from './store';
import type { Deck, SessionLog } from './srs';

export interface Entry {
  value: unknown;
  updatedAt: number;
}

export type Entries = Record<string, Entry>;

export interface SyncStatus {
  state: 'off' | 'idle' | 'syncing' | 'error';
  lastSync: number | null;
  error: string | null;
}

interface Meta {
  times: Record<string, number>;
  settings?: string;
  lastSync?: number;
}

const META = 'doremifaaa:sync';
const PREFIX = 'doremifaaa.';
const SESSIONS = 'doremifaaa.sessions';
export const RESET_KEY = 'doremifaaa.resetAt';
const MAX_SESSIONS = 500;
export const LOCAL_FIELDS: (keyof Settings)[] = ['libraryUrl', 'serverToken', 'syncProfile', 'midiInput', 'micEnabled'];
export const SYNC_EVENT = 'doremifaaa-sync';

export const syncStatus = createStore<SyncStatus>({ state: 'off', lastSync: null, error: null });

export function syncable(key: string): boolean {
  return key.startsWith(PREFIX);
}

export function sharedSettings(value: unknown): Record<string, unknown> {
  const out = { ...(value as Record<string, unknown>) };
  LOCAL_FIELDS.forEach((k) => delete out[k]);
  return out;
}

export function mergeDecks(a: Deck, b: Deck): Deck {
  const out: Deck = { ...a };
  for (const [id, stat] of Object.entries(b)) {
    const mine = out[id];
    if (!mine || stat.seen > mine.seen || (stat.seen === mine.seen && stat.last > mine.last)) out[id] = stat;
  }
  return out;
}

export function mergeSessions(a: SessionLog[], b: SessionLog[]): SessionLog[] {
  const seen = new Set<string>();
  return [...a, ...b]
    .filter((s) => {
      const id = `${s.at}:${s.mode}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((x, y) => x.at - y.at)
    .slice(-MAX_SESSIONS);
}

export interface Plan {
  local: Record<string, unknown>;
  push: Entries;
  times: Record<string, number>;
}

function since(value: unknown, resetAt: number, key: string): unknown {
  if (!resetAt || value === undefined) return value;
  if (key.startsWith('doremifaaa.deck.')) return Object.fromEntries(Object.entries(value as Deck).filter(([, s]) => s.last >= resetAt));
  if (key === SESSIONS) return (value as SessionLog[]).filter((s) => s.at >= resetAt);
  return value;
}

export function plan(localValues: Record<string, unknown>, localTimes: Record<string, number>, remoteEntries: Entries, now: number): Plan {
  const out: Plan = { local: {}, push: {}, times: {} };
  const resetAt = Math.max(Number(localValues[RESET_KEY] ?? 0), Number(remoteEntries[RESET_KEY]?.value ?? 0));
  const remote: Entries = Object.fromEntries(Object.entries(remoteEntries).map(([k, e]) => [k, { ...e, value: since(e.value, resetAt, k) }]));
  const keys = new Set([...Object.keys(localValues), ...Object.keys(remote)].filter(syncable));
  for (const key of keys) {
    const original = localValues[key];
    const mine = since(original, resetAt, key);
    const theirs = remote[key];
    const mineAt = localTimes[key] ?? 0;
    const send = key === SETTINGS_KEY ? sharedSettings(mine) : mine;
    if (theirs === undefined) {
      if (mine !== undefined) out.push[key] = { value: send, updatedAt: mineAt || now };
      continue;
    }
    if (mine === undefined) {
      out.local[key] = theirs.value;
      out.times[key] = theirs.updatedAt;
      continue;
    }
    let merged: unknown;
    if (key.startsWith('doremifaaa.deck.')) merged = mergeDecks(theirs.value as Deck, mine as Deck);
    else if (key === SESSIONS) merged = mergeSessions(theirs.value as SessionLog[], mine as SessionLog[]);
    if (merged !== undefined) {
      const same = JSON.stringify(merged) === JSON.stringify(theirs.value);
      if (JSON.stringify(merged) !== JSON.stringify(original)) out.local[key] = merged;
      if (!same) out.push[key] = { value: merged, updatedAt: Math.max(now, theirs.updatedAt + 1) };
      out.times[key] = same ? theirs.updatedAt : Math.max(now, theirs.updatedAt + 1);
    } else if (theirs.updatedAt >= mineAt) {
      const value = key === SETTINGS_KEY ? { ...(mine as object), ...sharedSettings(theirs.value) } : theirs.value;
      if (JSON.stringify(value) !== JSON.stringify(original)) out.local[key] = value;
      out.times[key] = theirs.updatedAt;
    } else {
      out.push[key] = { value: send, updatedAt: mineAt };
    }
  }
  return out;
}

export interface SetupParams {
  server?: string;
  profile?: string;
}

export function setupParams(href: string): { params: SetupParams; clean: string } | null {
  const url = new URL(href);
  const hashQuery = url.hash.indexOf('?');
  const sources = [url.searchParams, new URLSearchParams(hashQuery >= 0 ? url.hash.slice(hashQuery + 1) : '')];
  const params: SetupParams = {};
  for (const q of sources) {
    const server = q.get('server');
    const profile = q.get('profile');
    if (server !== null) params.server = server.trim().replace(/\/+$/, '');
    if (profile !== null && /^[A-Za-z0-9_-]{1,40}$/.test(profile)) params.profile = profile;
  }
  if (params.server === undefined && params.profile === undefined) return null;
  url.searchParams.delete('server');
  url.searchParams.delete('profile');
  url.hash = hashQuery >= 0 ? url.hash.slice(0, hashQuery) : url.hash;
  if (url.hash === '#/' || url.hash === '#') url.hash = '#/settings';
  return { params, clean: url.href };
}

export function setupLink(appHref: string, server: string, profile: string): string {
  const url = new URL(appHref);
  url.hash = `#/?${new URLSearchParams({ server: server || new URL('.', appHref).href.replace(/\/+$/, ''), ...(profile !== 'default' ? { profile } : {}) })}`;
  return url.href;
}

function readMeta(): Meta {
  try {
    return { times: {}, ...JSON.parse(localStorage.getItem(META) ?? '{}') };
  } catch {
    return { times: {} };
  }
}

function writeMeta(meta: Meta): void {
  try {
    localStorage.setItem(META, JSON.stringify(meta));
  } catch {
    return;
  }
}

function localValues(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !syncable(key)) continue;
    try {
      out[key] = JSON.parse(localStorage.getItem(key) ?? 'null');
    } catch {
      continue;
    }
  }
  return out;
}

const settingsFingerprint = (s: unknown) => JSON.stringify(sharedSettings(s));

let applying = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;
let again = false;
let available: { base: string; ok: boolean } | null = null;

async function storeAvailable(): Promise<boolean> {
  const base = libraryUrl('api/');
  if (available?.base === base) return available.ok;
  let ok = false;
  try {
    const res = await fetch(libraryUrl('api/health'), { headers: { Accept: 'application/json' } });
    ok = res.ok && Boolean((await res.json()).store);
  } catch {
    ok = false;
  }
  available = { base, ok };
  return ok;
}

function profilePath(): string {
  return `api/sync/${encodeURIComponent(settings.get().syncProfile || 'default')}`;
}

async function runSync(): Promise<void> {
  if (!(await storeAvailable())) {
    syncStatus.set({ state: 'off', lastSync: null, error: null });
    return;
  }
  syncStatus.set((s) => ({ ...s, state: 'syncing' }));
  try {
    const res = await fetch(libraryUrl(profilePath()), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const remote = (await res.json()).entries as Entries;
    const meta = readMeta();
    const now = Date.now();
    const p = plan(localValues(), meta.times, remote, now);
    if (Object.keys(p.push).length) {
      const post = await fetch(libraryUrl(profilePath()), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ entries: p.push })
      });
      if (!post.ok) throw new Error(post.status === 401 ? 'token' : post.status === 403 ? 'origin' : `HTTP ${post.status}`);
    }
    applying = true;
    try {
      for (const [key, value] of Object.entries(p.local)) localStorage.setItem(key, JSON.stringify(value));
      Object.assign(meta.times, p.times);
      for (const [key, e] of Object.entries(p.push)) meta.times[key] = e.updatedAt;
      if (SETTINGS_KEY in p.local) settings.set(readSettings());
      meta.settings = settingsFingerprint(settings.get());
    } finally {
      applying = false;
    }
    meta.lastSync = now;
    writeMeta(meta);
    syncStatus.set({ state: 'idle', lastSync: now, error: null });
    if (Object.keys(p.local).length) window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: Object.keys(p.local) }));
  } catch (e) {
    syncStatus.set((s) => ({ ...s, state: 'error', error: e instanceof Error ? e.message : String(e) }));
  }
}

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = runSync().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

function stamp(key: string): void {
  if (applying || !syncable(key)) return;
  const meta = readMeta();
  if (key === SETTINGS_KEY) {
    const print = settingsFingerprint(settings.get());
    if (print === meta.settings) return;
    meta.settings = print;
  }
  meta.times[key] = Date.now();
  writeMeta(meta);
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), 2000);
}

export function resetAvailability(): void {
  available = null;
}

export function startSync(): void {
  const setup = setupParams(location.href);
  if (setup) {
    const patch: Partial<Settings> = {};
    if (setup.params.server !== undefined) patch.libraryUrl = setup.params.server;
    if (setup.params.profile !== undefined) patch.syncProfile = setup.params.profile;
    settings.set((s) => ({ ...s, ...patch }));
    history.replaceState(null, '', setup.clean);
  }
  const meta = readMeta();
  if (meta.settings === undefined) {
    meta.settings = settingsFingerprint(settings.get());
    writeMeta(meta);
  }
  onSave(stamp);
  let last = settings.get();
  settings.subscribe((s) => {
    if (s.libraryUrl !== last.libraryUrl || s.syncProfile !== last.syncProfile) {
      resetAvailability();
      void syncNow();
    }
    last = s;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  window.addEventListener('focus', () => void syncNow());
  void syncNow();
}

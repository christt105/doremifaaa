import { settings } from './settings';

export interface ServerPiece {
  id: string;
  title: string;
  status: string | null;
  difficulty: string | null;
  tags: string[];
  source: string | null;
  video: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  notePath: string;
  hasScore: boolean;
  hasPdf: boolean;
  scoreUrl: string | null;
  scoreFormat: string | null;
  pdfUrl: string | null;
  obsidianUrl: string | null;
}

export interface ServerLibrary {
  name: string;
  scannedAt: number;
  pieces: ServerPiece[];
}

export function libraryBase(): string {
  const custom = settings.get().libraryUrl.trim().replace(/\/+$/, '');
  if (custom) return custom + '/';
  return new URL('.', location.href).href;
}

export function libraryUrl(path: string): string {
  return new URL(path, libraryBase()).href;
}

let cached: { at: number; base: string; data: ServerLibrary | null } | null = null;

export async function fetchLibrary(refresh = false): Promise<ServerLibrary | null> {
  const base = libraryBase();
  if (!refresh && cached && cached.base === base && Date.now() - cached.at < 30000) return cached.data;
  let data: ServerLibrary | null = null;
  try {
    const res = await fetch(libraryUrl(`api/library${refresh ? '?refresh' : ''}`), { headers: { Accept: 'application/json' } });
    if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) data = await res.json();
  } catch {
    data = null;
  }
  cached = { at: Date.now(), base, data };
  return data;
}

export async function findServerPiece(id: string): Promise<ServerPiece | null> {
  const lib = await fetchLibrary();
  return lib?.pieces.find((p) => p.id === id) ?? null;
}

export const STATUS_ORDER = ['Learning', 'Not started', 'Mastered'];

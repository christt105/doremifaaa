import { libraryUrl, type ServerPiece } from './library';
import { settings } from './settings';

export type ApiErrorKind = 'token' | 'origin' | 'tooLarge' | 'unsupported' | 'readOnly' | 'notFound' | 'network' | 'server';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status = 0
  ) {
    super(message);
  }
}

export interface PieceMeta {
  title: string;
  composer: string | null;
  status: string | null;
  difficulty: string | null;
  tags: string[];
  source: string | null;
  video: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  notes: string | null;
}

export const META_FIELDS: (keyof PieceMeta)[] = ['title', 'composer', 'status', 'difficulty', 'tags', 'source', 'video', 'startedAt', 'finishedAt', 'notes'];

const KINDS: Record<number, ApiErrorKind> = { 401: 'token', 403: 'origin', 404: 'notFound', 409: 'readOnly', 413: 'tooLarge', 415: 'unsupported' };

export function authHeaders(): Record<string, string> {
  const token = settings.get().serverToken.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(libraryUrl(path), { ...init, headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) } });
  } catch (e) {
    throw new ApiError('network', String(e));
  }
  if (res.ok) return res;
  let message = `HTTP ${res.status}`;
  try {
    message = (await res.json()).error ?? message;
  } catch {
    message = `HTTP ${res.status}`;
  }
  throw new ApiError(KINDS[res.status] ?? 'server', message, res.status);
}

const piecePath = (id: string, slot?: string) => `api/pieces/${encodeURIComponent(id)}${slot ? `/${slot}` : ''}`;

async function pieceJson(res: Response): Promise<ServerPiece> {
  return res.json();
}

export async function getPiece(id: string): Promise<ServerPiece> {
  return pieceJson(await request(piecePath(id)));
}

export async function uploadPiece(file: Blob, name: string, title?: string): Promise<ServerPiece> {
  const q = new URLSearchParams({ name });
  if (title) q.set('title', title);
  return pieceJson(await request(`api/pieces?${q}`, { method: 'POST', body: file }));
}

export async function patchPiece(id: string, patch: Partial<PieceMeta>): Promise<ServerPiece> {
  return pieceJson(await request(piecePath(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }));
}

export async function putFile(id: string, slot: 'score' | 'pdf', file: Blob, name: string, keepOriginal = false): Promise<ServerPiece> {
  const q = new URLSearchParams({ name });
  if (keepOriginal) q.set('keepOriginal', '1');
  return pieceJson(await request(`${piecePath(id, slot)}?${q}`, { method: 'PUT', body: file }));
}

export async function deleteFile(id: string, slot: 'score' | 'pdf' | 'original'): Promise<ServerPiece> {
  return pieceJson(await request(piecePath(id, slot), { method: 'DELETE' }));
}

export async function deletePiece(id: string): Promise<void> {
  await request(piecePath(id), { method: 'DELETE' });
}

export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const tag = raw.trim().replace(/^#/, '');
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

export function metaOf(p: ServerPiece): PieceMeta {
  return {
    title: p.title,
    composer: p.composer ?? null,
    status: p.status,
    difficulty: p.difficulty,
    tags: p.tags,
    source: p.source,
    video: p.video,
    startedAt: p.startedAt,
    finishedAt: p.finishedAt,
    notes: p.notes ?? null
  };
}

export function diffMeta(before: PieceMeta, after: PieceMeta): Partial<PieceMeta> {
  const norm = (v: unknown) => (typeof v === 'string' ? v.trim() || null : v);
  const patch: Record<string, unknown> = {};
  for (const k of META_FIELDS) {
    const a = norm(before[k]);
    const b = norm(after[k]);
    if (JSON.stringify(a) !== JSON.stringify(b)) patch[k] = b;
  }
  return patch as Partial<PieceMeta>;
}

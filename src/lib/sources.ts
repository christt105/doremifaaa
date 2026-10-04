import { findServerPiece, libraryUrl } from './library';
import { getLocal, putLocal } from './localdb';
import { scoreContent } from './osmd';

export type SourceKind = 'sample' | 'local' | 'server';

export interface Sample {
  id: string;
  title: string;
  composer: string;
  file: string;
}

export interface LoadedScore {
  title: string;
  content: string | Blob;
}

export interface LoadedPdf {
  title: string;
  data: ArrayBuffer;
}

export const FILE_ACCEPT = '.musicxml,.xml,.mxl,.pdf,application/pdf,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml';

export function fileKind(name: string): 'score' | 'pdf' | null {
  if (/\.(musicxml|xml|mxl)$/i.test(name)) return 'score';
  if (/\.pdf$/i.test(name)) return 'pdf';
  return null;
}

export function titleFromFile(name: string): string {
  return name.replace(/\.(musicxml|xml|mxl|pdf)$/i, '').replace(/[_]+/g, ' ').trim();
}

export async function importFile(file: File): Promise<{ id: string; kind: 'score' | 'pdf' } | null> {
  const kind = fileKind(file.name);
  if (!kind) return null;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await putLocal({ id, kind, title: titleFromFile(file.name), fileName: file.name, addedAt: Date.now(), data: await file.arrayBuffer() });
  return { id, kind };
}

export async function listSamples(): Promise<Sample[]> {
  try {
    const res = await fetch('./samples/index.json');
    return res.ok ? res.json() : [];
  } catch {
    return [];
  }
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

export async function loadScore(source: string, id: string): Promise<LoadedScore> {
  if (source === 'sample') {
    const s = (await listSamples()).find((x) => x.id === id);
    if (!s) throw new Error('not-found');
    return { title: s.title, content: scoreContent(await fetchBuffer(`./samples/${s.file}`)) };
  }
  if (source === 'local') {
    const p = await getLocal(id);
    if (!p || p.kind !== 'score') throw new Error('not-found');
    return { title: p.title, content: scoreContent(p.data) };
  }
  if (source === 'server') {
    const p = await findServerPiece(id);
    if (!p?.scoreUrl) throw new Error('not-found');
    return { title: p.title, content: scoreContent(await fetchBuffer(libraryUrl(p.scoreUrl))) };
  }
  throw new Error('not-found');
}

export async function loadPdf(source: string, id: string): Promise<LoadedPdf> {
  if (source === 'local') {
    const p = await getLocal(id);
    if (!p || p.kind !== 'pdf') throw new Error('not-found');
    return { title: p.title, data: p.data };
  }
  if (source === 'server') {
    const p = await findServerPiece(id);
    if (!p?.pdfUrl) throw new Error('not-found');
    return { title: p.title, data: await fetchBuffer(libraryUrl(p.pdfUrl)) };
  }
  throw new Error('not-found');
}

import { scoreContent } from './osmd';

export type SourceKind = 'sample' | 'file';

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

const files = new Map<string, { title: string; buffer: ArrayBuffer }>();

export const SCORE_ACCEPT = '.musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml';

export function isScoreFile(name: string): boolean {
  return /\.(musicxml|xml|mxl)$/i.test(name);
}

export function titleFromFile(name: string): string {
  return name.replace(/\.(musicxml|xml|mxl|pdf)$/i, '').replace(/[_-]+/g, ' ').trim();
}

export async function registerFile(file: File): Promise<string> {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  files.set(id, { title: titleFromFile(file.name), buffer: await file.arrayBuffer() });
  return id;
}

export async function listSamples(): Promise<Sample[]> {
  const res = await fetch('./samples/index.json');
  if (!res.ok) return [];
  return res.json();
}

export async function loadScore(source: string, id: string): Promise<LoadedScore> {
  if (source === 'sample') {
    const samples = await listSamples();
    const s = samples.find((x) => x.id === id);
    if (!s) throw new Error(`sample ${id} not found`);
    const res = await fetch(`./samples/${s.file}`);
    return { title: s.title, content: scoreContent(await res.arrayBuffer()) };
  }
  if (source === 'file') {
    const f = files.get(id);
    if (!f) throw new Error('file-gone');
    return { title: f.title, content: scoreContent(f.buffer) };
  }
  throw new Error(`unknown source ${source}`);
}

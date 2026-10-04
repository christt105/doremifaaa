export interface LocalPiece {
  id: string;
  title: string;
  kind: 'score' | 'pdf';
  fileName: string;
  addedAt: number;
  data: ArrayBuffer;
}

const DB = 'doremifaaa';
const STORE = 'pieces';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listLocal(): Promise<Omit<LocalPiece, 'data'>[]> {
  try {
    const all = await tx<LocalPiece[]>('readonly', (s) => s.getAll());
    return all.map(({ data: _data, ...rest }) => rest).sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

export function getLocal(id: string): Promise<LocalPiece | undefined> {
  return tx<LocalPiece | undefined>('readonly', (s) => s.get(id));
}

export function putLocal(piece: LocalPiece): Promise<IDBValidKey> {
  return tx('readwrite', (s) => s.put(piece));
}

export function deleteLocal(id: string): Promise<undefined> {
  return tx('readwrite', (s) => s.delete(id));
}

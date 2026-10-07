export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const saveListeners = new Set<(key: string) => void>();

export function onSave(listener: (key: string) => void): () => void {
  saveListeners.add(listener);
  return () => saveListeners.delete(listener);
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
  saveListeners.forEach((l) => l(key));
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
}

import { StoreError } from './store.mjs';

const PROFILE = /^[A-Za-z0-9_-]{1,40}$/;
const KEY = /^doremifaaa\.[A-Za-z0-9._-]{1,80}$/;
export const MAX_VALUE_BYTES = 1024 * 1024;
export const MAX_ENTRIES = 200;

export function isProfile(profile) {
  return typeof profile === 'string' && PROFILE.test(profile);
}

export function readSync(db, profile) {
  if (!isProfile(profile)) throw new StoreError(400, 'invalid profile');
  const entries = {};
  for (const row of db.prepare('SELECT key, value, updated_at FROM sync WHERE profile = ?').all(profile))
    entries[row.key] = { value: JSON.parse(row.value), updatedAt: row.updated_at };
  return { profile, now: Date.now(), entries };
}

export function validateEntries(body) {
  const entries = body?.entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new StoreError(400, 'expected { entries }');
  const keys = Object.keys(entries);
  if (keys.length > MAX_ENTRIES) throw new StoreError(400, `at most ${MAX_ENTRIES} entries`);
  return keys.map((key) => {
    const entry = entries[key];
    if (!KEY.test(key)) throw new StoreError(400, `invalid key ${key}`);
    if (!entry || typeof entry !== 'object' || !Number.isFinite(entry.updatedAt) || entry.updatedAt < 0) throw new StoreError(400, `invalid entry ${key}`);
    if (entry.value === undefined) throw new StoreError(400, `missing value for ${key}`);
    const value = JSON.stringify(entry.value);
    if (Buffer.byteLength(value) > MAX_VALUE_BYTES) throw new StoreError(413, `value too large for ${key}`);
    return { key, value, updatedAt: Math.floor(entry.updatedAt) };
  });
}

export function mergeSync(db, profile, body) {
  if (!isProfile(profile)) throw new StoreError(400, 'invalid profile');
  const entries = validateEntries(body);
  const get = db.prepare('SELECT updated_at FROM sync WHERE profile = ? AND key = ?');
  const put = db.prepare('INSERT OR REPLACE INTO sync (profile, key, value, updated_at) VALUES (?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    for (const e of entries) {
      const current = get.get(profile, e.key);
      if (!current || e.updatedAt > current.updated_at) put.run(profile, e.key, e.value, e.updatedAt);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return readSync(db, profile);
}

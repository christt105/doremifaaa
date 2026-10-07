import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { hasKey, useT } from '../i18n';
import { STATUS_ORDER, fetchLibrary, type ServerLibrary, type ServerPiece } from '../lib/library';
import { uploadPiece } from '../lib/api';
import { deleteLocal, getLocal, listLocal, type LocalPiece } from '../lib/localdb';
import { FILE_ACCEPT, fileKind, importFile, listSamples, type Sample } from '../lib/sources';
import { QualityBadge } from '../components/QualityBadge';
import { VaultImport } from '../components/VaultImport';
import { href } from '../router';
import { errorText } from './Manage';

type LocalMeta = Omit<LocalPiece, 'data'>;

interface Upload {
  name: string;
  state: 'sending' | 'done' | 'error';
  text?: string;
}

function ServerUpload({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const send = async (files: FileList | null | undefined) => {
    if (!files?.length) return;
    const list = [...files];
    const state: Upload[] = list.map((f) => ({ name: f.name, state: 'sending' }));
    setUploads([...state]);
    for (const [i, f] of list.entries()) {
      if (!fileKind(f.name)) state[i] = { name: f.name, state: 'error', text: t('library.notSupported', { name: f.name }) };
      else
        try {
          await uploadPiece(f, f.name);
          state[i] = { name: f.name, state: 'done' };
        } catch (e) {
          state[i] = { name: f.name, state: 'error', text: errorText(t, e) };
        }
      setUploads([...state]);
    }
    onDone();
  };

  return (
    <div
      class={`card dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void send(e.dataTransfer?.files);
      }}
    >
      <button class="primary" onClick={() => input.current?.click()}>
        ⇪ {t('manage.upload')}
      </button>
      <span class="muted small">{t('manage.uploadHint')}</span>
      <input ref={input} type="file" multiple accept={FILE_ACCEPT} hidden onChange={(e) => (void send(e.currentTarget.files), (e.currentTarget.value = ''))} />
      {uploads.length > 0 && (
        <ul class="upload-list small">
          {uploads.map((u, i) => (
            <li key={i} class={u.state === 'error' ? 'bad' : u.state === 'done' ? 'ok' : 'muted'}>
              {u.name}: {u.state === 'error' ? u.text : t(`manage.upload.${u.state}`)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ServerSection({ lib, onRefresh }: { lib: ServerLibrary; onRefresh: () => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const statuses = useMemo(() => {
    const set = new Set(lib.pieces.map((p) => p.status).filter((s): s is string => Boolean(s)));
    return [...set].sort((a, b) => (STATUS_ORDER.indexOf(a) + 99) % 100 - (STATUS_ORDER.indexOf(b) + 99) % 100);
  }, [lib]);
  const q = query.trim().toLowerCase();
  const pieces = lib.pieces
    .filter((p) => status === 'all' || p.status === status)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || p.tags.some((tag) => tag.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.hasScore) - Number(a.hasScore) || a.title.localeCompare(b.title));
  const label = (prefix: string, v: string | null) => (v ? (hasKey(`${prefix}.${v}`) ? t(`${prefix}.${v}`) : v) : '');

  return (
    <section class="stack">
      <div class="row spread wrap">
        <div>
          <h2 style={{ margin: 0 }}>{t('library.server')}</h2>
          <p class="muted small" style={{ margin: 0 }}>
            {t('library.serverHint', { n: lib.pieces.length, name: lib.name || location.host })}
          </p>
        </div>
        <button onClick={onRefresh}>↻ {t('library.refresh')}</button>
      </div>
      {lib.store?.enabled && <ServerUpload onDone={onRefresh} />}
      {lib.store?.enabled && <VaultImport onDone={onRefresh} />}
      <div class="row wrap">
        <input type="search" class="grow" placeholder={t('library.search')} value={query} onInput={(e) => setQuery(e.currentTarget.value)} style={{ maxWidth: '22rem' }} />
        <div class="segmented">
          {['all', ...statuses].map((s) => (
            <button key={s} class={status === s ? 'selected' : ''} onClick={() => setStatus(s)}>
              {s === 'all' ? t('library.all') : label('status', s)}
            </button>
          ))}
        </div>
      </div>
      {pieces.length === 0 && <p class="muted">{t('library.empty')}</p>}
      <div class="piece-list">
        {pieces.map((p: ServerPiece) => (
          <div key={p.id} class="piece">
            <span class="piece-icon" aria-hidden="true">
              {p.hasScore ? '𝄞' : '📄'}
            </span>
            <span class="piece-main">
              <strong>{p.title}</strong>
              <span class="row wrap small" style={{ gap: '0.3rem' }}>
                {p.status && <span class={`badge status-${p.status.replace(/\s+/g, '-').toLowerCase()}`}>{label('status', p.status)}</span>}
                {p.difficulty && <span class="badge">{label('difficulty', p.difficulty)}</span>}
                <QualityBadge piece={p} onChange={onRefresh} />
                {p.tags.map((tag) => (
                  <span key={tag} class="muted">
                    #{tag}
                  </span>
                ))}
              </span>
            </span>
            <span class="piece-actions row wrap">
              {p.hasScore ? (
                <a class="button primary" href={href('score', 'server', p.id)}>
                  ▶ {t('library.play')}
                </a>
              ) : (
                <span class="muted small">{t('library.noScore')}</span>
              )}
              {p.hasPdf && (
                <a class="button" href={href('pdf', 'server', p.id)}>
                  {t('library.pdf')}
                </a>
              )}
              {p.obsidianUrl && (
                <a class="button ghost" href={p.obsidianUrl} title={p.notePath ?? undefined}>
                  {t('library.note')}
                </a>
              )}
              {p.source && (
                <a class="button ghost" href={p.source} target="_blank" rel="noreferrer">
                  {t('library.sourceLink')}
                </a>
              )}
              {p.editable ? (
                <a class="button ghost" href={href('manage', p.id)}>
                  ✎ {t('manage.edit')}
                </a>
              ) : (
                lib.store?.enabled && <span class="muted small" title={t('manage.vaultHint')}>{t('manage.fromVault')}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Library() {
  const t = useT();
  const [lib, setLib] = useState<ServerLibrary | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [local, setLocal] = useState<LocalMeta[]>([]);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [moved, setMoved] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const reloadLocal = () => void listLocal().then(setLocal);

  useEffect(() => {
    void fetchLibrary().then(setLib);
    void listSamples().then(setSamples);
    reloadLocal();
  }, []);

  const add = async (files: FileList | File[] | undefined | null) => {
    if (!files) return;
    const list = [...files];
    let last: { id: string; kind: 'score' | 'pdf' } | null = null;
    const rejected: string[] = [];
    for (const f of list) {
      const r = await importFile(f);
      if (r) last = r;
      else rejected.push(f.name);
    }
    setMessage(rejected.map((name) => t('library.notSupported', { name })).join(' '));
    reloadLocal();
    if (last && list.length === 1) location.hash = href(last.kind === 'score' ? 'score' : 'pdf', 'local', last.id);
  };

  const toServer = async (p: LocalMeta) => {
    setMessage('');
    try {
      const full = await getLocal(p.id);
      if (!full) return;
      await uploadPiece(new Blob([full.data]), p.fileName, p.title);
      setMoved((m) => [...m, p.id]);
      setLib(await fetchLibrary(true));
    } catch (e) {
      setMessage(errorText(t, e));
    }
  };

  return (
    <div class="stack">
      <div>
        <h1>{t('library.title')}</h1>
        <p class="muted">{t('library.lead')}</p>
      </div>

      {lib && <ServerSection lib={lib} onRefresh={() => void fetchLibrary(true).then(setLib)} />}

      <section class="stack">
        <div>
          <h2 style={{ margin: 0 }}>{t('library.local')}</h2>
          <p class="muted small" style={{ margin: 0 }}>
            {t('library.localHint')}
          </p>
        </div>
        <div
          class={`card dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void add(e.dataTransfer?.files);
          }}
        >
          <button class="primary" onClick={() => input.current?.click()}>
            + {t('library.open')}
          </button>
          <span class="muted small">{t('library.drop')}</span>
          <input ref={input} type="file" multiple accept={FILE_ACCEPT} hidden onChange={(e) => void add(e.currentTarget.files)} />
          {message && <p class="bad small">{message}</p>}
        </div>
        {local.length === 0 ? (
          <p class="muted small">{t('library.noLocal')}</p>
        ) : (
          <div class="piece-list">
            {local.map((p) => (
              <div key={p.id} class="piece">
                <span class="piece-icon" aria-hidden="true">
                  {p.kind === 'score' ? '𝄞' : '📄'}
                </span>
                <span class="piece-main">
                  <strong>{p.title}</strong>
                  <span class="muted small">{p.fileName}</span>
                </span>
                <span class="piece-actions row wrap">
                  <a class={`button ${p.kind === 'score' ? 'primary' : ''}`} href={href(p.kind === 'score' ? 'score' : 'pdf', 'local', p.id)}>
                    {p.kind === 'score' ? `▶ ${t('library.play')}` : t('library.pdf')}
                  </a>
                  {lib?.store?.enabled &&
                    (moved.includes(p.id) ? (
                      <span class="ok small">{t('manage.uploaded')}</span>
                    ) : (
                      <button class="ghost" onClick={() => void toServer(p)}>
                        ⇪ {t('manage.toServer')}
                      </button>
                    ))}
                  <button
                    class={confirm === p.id ? 'danger' : 'ghost'}
                    onClick={() => {
                      if (confirm !== p.id) return setConfirm(p.id);
                      setConfirm(null);
                      void deleteLocal(p.id).then(reloadLocal);
                    }}
                  >
                    {confirm === p.id ? t('library.confirmDelete') : moved.includes(p.id) ? t('manage.deleteLocalCopy') : t('library.delete')}
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section class="stack">
        <div>
          <h2 style={{ margin: 0 }}>{t('library.samples')}</h2>
          <p class="muted small" style={{ margin: 0 }}>
            {t('library.samplesHint')}
          </p>
        </div>
        <div class="piece-list">
          {samples.map((s) => (
            <a key={s.id} class="piece" href={href('score', 'sample', s.id)}>
              <span class="piece-icon" aria-hidden="true">
                𝄞
              </span>
              <span class="piece-main">
                <strong>{s.title}</strong>
                <span class="muted small">{s.composer}</span>
              </span>
              <span class="badge">MusicXML</span>
            </a>
          ))}
        </div>
      </section>
      <p class="muted small">{t('library.where')}</p>
      {!lib && <p class="muted small">{t('library.selfhost')}</p>}
    </div>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { hasKey, useT } from '../i18n';
import { ApiError, deleteFile, deletePiece, diffMeta, getPiece, metaOf, parseTags, patchPiece, putFile, type PieceMeta } from '../lib/api';
import { fetchLibrary, libraryUrl, type ServerPiece } from '../lib/library';
import { FILE_ACCEPT, fileKind } from '../lib/sources';
import { href, type ViewProps } from '../router';

const STATUSES = ['Not started', 'Learning', 'Mastered'];
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];

export function errorText(t: (k: string, p?: Record<string, string | number>) => string, e: unknown): string {
  if (e instanceof ApiError) return t(`manage.error.${e.kind}`, { message: e.message });
  return `${t('common.error')}: ${String(e)}`;
}

function Choice({ label, value, options, prefix, onChange }: { label: string; value: string | null; options: string[]; prefix: string; onChange: (v: string | null) => void }) {
  const t = useT();
  const all = value && !options.includes(value) ? [...options, value] : options;
  return (
    <label>
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.currentTarget.value || null)}>
        <option value="">{t('manage.none')}</option>
        {all.map((o) => (
          <option key={o} value={o}>
            {hasKey(`${prefix}.${o}`) ? t(`${prefix}.${o}`) : o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Manage({ route }: ViewProps) {
  const t = useT();
  const id = route.params.join('/');
  const [piece, setPiece] = useState<ServerPiece | null>(null);
  const [form, setForm] = useState<PieceMeta | null>(null);
  const [tagText, setTagText] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const slotRef = useRef<'score' | 'pdf'>('score');

  const load = (p: ServerPiece) => {
    setPiece(p);
    setForm(metaOf(p));
    setTagText(p.tags.join(', '));
  };

  useEffect(() => {
    getPiece(id)
      .then(load)
      .catch(() => setMissing(true));
  }, [id]);

  if (missing)
    return (
      <div class="card empty">
        <p>{t('piece.notFound', { id })}</p>
        <a class="button" href={href('library')}>
          {t('nav.library')}
        </a>
      </div>
    );
  if (!piece || !form) return <div class="empty">{t('common.loading')}</div>;

  const run = async (action: () => Promise<ServerPiece | void>, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const p = await action();
      if (p) load(p);
      setMessage({ ok: true, text: t(ok) });
      void fetchLibrary(true);
    } catch (e) {
      setMessage({ ok: false, text: errorText(t, e) });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const current = { ...form, tags: parseTags(tagText) };
  const patch = diffMeta(metaOf(piece), current);
  const dirty = Object.keys(patch).length > 0;
  const set = (k: keyof PieceMeta) => (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => setForm({ ...form, [k]: e.currentTarget.value });

  const save = (e: Event) => {
    e.preventDefault();
    if (!current.title.trim()) return setMessage({ ok: false, text: t('manage.titleRequired') });
    void run(() => patchPiece(piece.id, patch), 'manage.saved');
  };

  const pick = (slot: 'score' | 'pdf') => {
    slotRef.current = slot;
    fileInput.current?.click();
  };

  const replace = (file: File | undefined) => {
    if (!file) return;
    const slot = slotRef.current;
    if (fileKind(file.name) !== slot) return setMessage({ ok: false, text: t('manage.wrongKind', { name: file.name }) });
    void run(() => putFile(piece.id, slot, file, file.name), 'manage.fileSaved');
  };

  const removeFile = (slot: 'score' | 'pdf' | 'original') => {
    if (confirm !== slot) return setConfirm(slot);
    void run(() => deleteFile(piece.id, slot), 'manage.fileRemoved');
  };

  const remove = () => {
    if (confirm !== 'piece') return setConfirm('piece');
    setBusy(true);
    deletePiece(piece.id)
      .then(() => {
        void fetchLibrary(true);
        location.hash = href('library');
      })
      .catch((e) => {
        setBusy(false);
        setConfirm(null);
        setMessage({ ok: false, text: errorText(t, e) });
      });
  };

  const danger = (slot: string, label: string) => (
    <button type="button" class={confirm === slot ? 'danger' : 'ghost'} disabled={busy} onClick={() => (slot === 'piece' ? remove() : removeFile(slot as 'score' | 'pdf' | 'original'))}>
      {confirm === slot ? t('library.confirmDelete') : t(label)}
    </button>
  );

  return (
    <div class="stack narrow">
      <a href={href('library')} class="muted small">
        ← {t('nav.library')}
      </a>
      <h1>{piece.title}</h1>
      <form class="card form" onSubmit={save}>
        <label>
          <span>{t('manage.title')}</span>
          <input value={form.title} required maxLength={500} onInput={set('title')} />
        </label>
        <label>
          <span>{t('manage.composer')}</span>
          <input value={form.composer ?? ''} maxLength={500} onInput={set('composer')} />
        </label>
        <div class="form-pair">
          <Choice label={t('manage.status')} value={form.status} options={STATUSES} prefix="status" onChange={(v) => setForm({ ...form, status: v })} />
          <Choice label={t('manage.difficulty')} value={form.difficulty} options={DIFFICULTIES} prefix="difficulty" onChange={(v) => setForm({ ...form, difficulty: v })} />
        </div>
        <label>
          <span>{t('manage.tags')}</span>
          <input value={tagText} placeholder="anime, naruto" onInput={(e) => setTagText(e.currentTarget.value)} />
          <small class="muted">{t('manage.tagsHint')}</small>
        </label>
        <label>
          <span>{t('manage.source')}</span>
          <input type="url" value={form.source ?? ''} placeholder="https://" onInput={set('source')} />
        </label>
        <label>
          <span>{t('manage.video')}</span>
          <input type="url" value={form.video ?? ''} placeholder="https://" onInput={set('video')} />
        </label>
        <div class="form-pair">
          <label>
            <span>{t('manage.startedAt')}</span>
            <input type="date" value={form.startedAt ?? ''} onInput={set('startedAt')} />
          </label>
          <label>
            <span>{t('manage.finishedAt')}</span>
            <input type="date" value={form.finishedAt ?? ''} onInput={set('finishedAt')} />
          </label>
        </div>
        <label>
          <span>{t('manage.notes')}</span>
          <textarea rows={3} maxLength={5000} value={form.notes ?? ''} onInput={set('notes')} />
        </label>
        <div class="row wrap">
          <button type="submit" class="primary" disabled={busy || !dirty}>
            {t('manage.save')}
          </button>
          {dirty && <span class="muted small">{t('manage.unsaved')}</span>}
        </div>
      </form>

      <section class="card stack">
        <h2>{t('manage.files')}</h2>
        <div class="piece">
          <span class="piece-icon" aria-hidden="true">
            𝄞
          </span>
          <span class="piece-main">
            <strong>MusicXML</strong>
            <span class="muted small">{piece.hasScore ? (piece.scoreFormat ?? '').toUpperCase() : t('library.noScore')}</span>
          </span>
          <span class="piece-actions row wrap">
            {piece.hasScore && piece.scoreUrl && (
              <>
                <a class="button primary" href={href('score', 'server', piece.id)}>
                  ▶ {t('library.play')}
                </a>
                <a class="button ghost" href={libraryUrl(piece.scoreUrl)} download={`${piece.title}.${piece.scoreFormat}`}>
                  {t('manage.download')}
                </a>
              </>
            )}
            <button type="button" disabled={busy} onClick={() => pick('score')}>
              {piece.hasScore ? t('manage.replace') : t('manage.add')}
            </button>
            {piece.hasScore && danger('score', 'manage.remove')}
          </span>
        </div>
        {piece.hasOriginal && piece.originalUrl && (
          <div class="piece">
            <span class="piece-icon" aria-hidden="true">
              𝄞
            </span>
            <span class="piece-main">
              <strong>{t('manage.original')}</strong>
              <span class="muted small">{t('manage.originalHint')}</span>
            </span>
            <span class="piece-actions row wrap">
              <a class="button ghost" href={libraryUrl(piece.originalUrl)} download={`${piece.title} (original)`}>
                {t('manage.download')}
              </a>
              {danger('original', 'manage.remove')}
            </span>
          </div>
        )}
        <div class="piece">
          <span class="piece-icon" aria-hidden="true">
            📄
          </span>
          <span class="piece-main">
            <strong>PDF</strong>
            <span class="muted small">{piece.hasPdf ? 'PDF' : t('manage.noPdf')}</span>
          </span>
          <span class="piece-actions row wrap">
            {piece.hasPdf && piece.pdfUrl && (
              <>
                <a class="button" href={href('pdf', 'server', piece.id)}>
                  {t('library.pdf')}
                </a>
                <a class="button ghost" href={libraryUrl(piece.pdfUrl)} download={`${piece.title}.pdf`}>
                  {t('manage.download')}
                </a>
              </>
            )}
            <button type="button" disabled={busy} onClick={() => pick('pdf')}>
              {piece.hasPdf ? t('manage.replace') : t('manage.add')}
            </button>
            {piece.hasPdf && danger('pdf', 'manage.remove')}
          </span>
        </div>
        <input ref={fileInput} type="file" accept={FILE_ACCEPT} hidden onChange={(e) => (replace(e.currentTarget.files?.[0]), (e.currentTarget.value = ''))} />
      </section>

      {message && <p class={message.ok ? 'ok small' : 'bad small'}>{message.text}</p>}

      <section class="card stack">
        <h2>{t('manage.dangerZone')}</h2>
        <p class="muted small">{t('manage.deleteHint')}</p>
        <div>{danger('piece', 'manage.deletePiece')}</div>
      </section>
    </div>
  );
}

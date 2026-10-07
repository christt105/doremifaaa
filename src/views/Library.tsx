import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { addStrings, useT } from '../i18n';
import { STATUS_ORDER, fetchLibrary, type ServerLibrary, type ServerPiece } from '../lib/library';
import { deleteLocal, listLocal, type LocalPiece } from '../lib/localdb';
import { FILE_ACCEPT, importFile, listSamples, type Sample } from '../lib/sources';
import { href } from '../router';

addStrings('es', {
  'library.title': 'Repertorio',
  'library.lead': 'Partituras en MusicXML (.musicxml, .xml o .mxl) para tocar con seguimiento: el cursor avanza cuando aciertas. Los PDF se pueden leer y pasar de página con el pedal.',
  'library.server': 'Mi repertorio',
  'library.serverHint': '{n} piezas desde {name}. Se actualiza solo al cambiar las notas del vault.',
  'library.refresh': 'Actualizar',
  'library.search': 'Buscar por título o etiqueta',
  'library.all': 'Todas',
  'library.play': 'Tocar',
  'library.pdf': 'PDF',
  'library.note': 'Nota',
  'library.sourceLink': 'Fuente',
  'library.video': 'Vídeo',
  'library.noScore': 'Sin MusicXML',
  'library.empty': 'Ninguna pieza coincide.',
  'library.local': 'Mis partituras',
  'library.localHint': 'Se guardan solo en este navegador.',
  'library.open': 'Añadir MusicXML o PDF',
  'library.drop': 'o arrastra aquí los archivos',
  'library.notSupported': '{name} no es MusicXML ni PDF.',
  'library.delete': 'Borrar',
  'library.confirmDelete': '¿Seguro?',
  'library.noLocal': 'Todavía no has añadido ninguna.',
  'library.samples': 'Piezas de ejemplo',
  'library.samplesHint': 'Melodías de dominio público con un arreglo sencillo para las dos manos.',
  'library.where': '¿De dónde saco MusicXML? MuseScore exporta a MusicXML (Archivo › Exportar). Hay partituras de dominio público en MuseScore.com, OpenScore o IMSLP, y Audiveris convierte PDFs escaneados.',
  'library.selfhost': '¿Tienes tus partituras en Obsidian o en un servidor? doremifaaa trae un pequeño servidor (Docker) que lee tus notas y PDFs: mira el README del proyecto.',
  'status.Not started': 'Sin empezar',
  'status.Learning': 'Aprendiendo',
  'status.Mastered': 'Dominada',
  'difficulty.Beginner': 'Principiante',
  'difficulty.Intermediate': 'Intermedio',
  'difficulty.Advanced': 'Avanzado'
});

addStrings('en', {
  'library.title': 'Repertoire',
  'library.lead': 'MusicXML scores (.musicxml, .xml or .mxl) to play with following: the cursor moves on when you are right. PDFs can be read and turned with the pedal.',
  'library.server': 'My repertoire',
  'library.serverHint': '{n} pieces from {name}. It updates by itself when the vault notes change.',
  'library.refresh': 'Refresh',
  'library.search': 'Search title or tag',
  'library.all': 'All',
  'library.play': 'Play',
  'library.pdf': 'PDF',
  'library.note': 'Note',
  'library.sourceLink': 'Source',
  'library.video': 'Video',
  'library.noScore': 'No MusicXML',
  'library.empty': 'No piece matches.',
  'library.local': 'My scores',
  'library.localHint': 'Stored in this browser only.',
  'library.open': 'Add MusicXML or PDF',
  'library.drop': 'or drop files here',
  'library.notSupported': '{name} is neither MusicXML nor PDF.',
  'library.delete': 'Delete',
  'library.confirmDelete': 'Sure?',
  'library.noLocal': 'You have not added any yet.',
  'library.samples': 'Sample pieces',
  'library.samplesHint': 'Public domain melodies with a simple two-hand arrangement.',
  'library.where': 'Where do I get MusicXML? MuseScore exports it (File › Export). There are public domain scores on MuseScore.com, OpenScore or IMSLP, and Audiveris converts scanned PDFs.',
  'library.selfhost': 'Keep your scores in Obsidian or on a server? doremifaaa ships a small Docker server that reads your notes and PDFs: see the project README.',
  'status.Not started': 'Not started',
  'status.Learning': 'Learning',
  'status.Mastered': 'Mastered',
  'difficulty.Beginner': 'Beginner',
  'difficulty.Intermediate': 'Intermediate',
  'difficulty.Advanced': 'Advanced'
});

type LocalMeta = Omit<LocalPiece, 'data'>;

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
  const label = (prefix: string, v: string | null) => (v ? (t(`${prefix}.${v}`) === `${prefix}.${v}` ? v : t(`${prefix}.${v}`)) : '');

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
                  <button
                    class={confirm === p.id ? 'danger' : 'ghost'}
                    onClick={() => {
                      if (confirm !== p.id) return setConfirm(p.id);
                      setConfirm(null);
                      void deleteLocal(p.id).then(reloadLocal);
                    }}
                  >
                    {confirm === p.id ? t('library.confirmDelete') : t('library.delete')}
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

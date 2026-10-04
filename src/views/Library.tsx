import { useEffect, useRef, useState } from 'preact/hooks';
import { addStrings, useT } from '../i18n';
import { SCORE_ACCEPT, isScoreFile, listSamples, registerFile, type Sample } from '../lib/sources';
import { href } from '../router';

addStrings('es', {
  'library.title': 'Repertorio',
  'library.lead': 'Abre una partitura en MusicXML (.musicxml, .xml o .mxl): el cursor avanza cuando tocas las notas correctas y se para si fallas.',
  'library.open': 'Abrir archivo MusicXML',
  'library.drop': 'o arrastra aquí un archivo',
  'library.samples': 'Piezas de ejemplo',
  'library.samplesHint': 'Melodías de dominio público con un arreglo sencillo para las dos manos.',
  'library.notScore': 'Ese archivo no parece MusicXML.',
  'library.where': '¿De dónde saco MusicXML? MuseScore exporta a MusicXML (Archivo › Exportar). Muchas partituras de dominio público están en MuseScore.com, OpenScore o IMSLP, y Audiveris convierte PDFs escaneados.'
});

addStrings('en', {
  'library.title': 'Repertoire',
  'library.lead': 'Open a MusicXML score (.musicxml, .xml or .mxl): the cursor moves on when you play the right notes and stops when you miss.',
  'library.open': 'Open MusicXML file',
  'library.drop': 'or drop a file here',
  'library.samples': 'Sample pieces',
  'library.samplesHint': 'Public domain melodies with a simple two-hand arrangement.',
  'library.notScore': 'That file does not look like MusicXML.',
  'library.where': 'Where do I get MusicXML? MuseScore exports it (File › Export). Many public domain scores are on MuseScore.com, OpenScore or IMSLP, and Audiveris converts scanned PDFs.'
});

export function Library() {
  const t = useT();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listSamples().then(setSamples);
  }, []);

  const open = async (file: File | undefined) => {
    if (!file) return;
    if (!isScoreFile(file.name)) {
      setMessage(t('library.notScore'));
      return;
    }
    const id = await registerFile(file);
    location.hash = href('score', 'file', id);
  };

  return (
    <div class="stack">
      <div>
        <h1>{t('library.title')}</h1>
        <p class="muted">{t('library.lead')}</p>
      </div>
      <section
        class={`card dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void open(e.dataTransfer?.files[0]);
        }}
      >
        <button class="primary" onClick={() => input.current?.click()}>
          {t('library.open')}
        </button>
        <span class="muted small">{t('library.drop')}</span>
        <input ref={input} type="file" accept={SCORE_ACCEPT} hidden onChange={(e) => void open(e.currentTarget.files?.[0])} />
        {message && <p class="bad small">{message}</p>}
      </section>
      <section>
        <h2>{t('library.samples')}</h2>
        <p class="muted small">{t('library.samplesHint')}</p>
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
    </div>
  );
}

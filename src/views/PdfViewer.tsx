import { useEffect, useRef, useState } from 'preact/hooks';
import { useT } from '../i18n';
import { bus } from '../lib/input/bus';
import { loadPdf } from '../lib/sources';
import { load, save } from '../lib/storage';
import { href, type ViewProps } from '../router';

const PREFS = 'doremifaaa.pdf';

export function PdfViewer({ route }: ViewProps) {
  const t = useT();
  const [source, id] = route.params;
  const [title, setTitle] = useState('');
  const [pages, setPages] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [pedal, setPedal] = useState(load<{ pedal: boolean }>(PREFS, { pedal: true }).pedal);
  const host = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const full = document.fullscreenElement;
    const el = full ?? document.scrollingElement ?? document.documentElement;
    el.scrollBy({ top: dir * (full ? full.clientHeight : window.innerHeight) * 0.85, behavior: 'smooth' });
  };

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    setStatus('loading');
    (async () => {
      try {
        const [{ getDocument, GlobalWorkerOptions }, worker, file] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
          loadPdf(source, id)
        ]);
        if (cancelled || !host.current) return;
        GlobalWorkerOptions.workerSrc = worker.default;
        setTitle(file.title);
        const task = getDocument({ data: new Uint8Array(file.data) });
        const pdf = await task.promise;
        if (cancelled) return;
        setPages(pdf.numPages);
        const container = host.current;
        container.innerHTML = '';
        const canvases: HTMLCanvasElement[] = [];
        const rendered = new Set<number>();
        const width = () => Math.min(container.clientWidth, 1400);
        const first = await pdf.getPage(1);
        const ratio = first.getViewport({ scale: 1 }).height / first.getViewport({ scale: 1 }).width;
        for (let n = 1; n <= pdf.numPages; n++) {
          const c = document.createElement('canvas');
          c.className = 'pdf-page';
          c.dataset.page = String(n);
          c.style.aspectRatio = `1 / ${ratio}`;
          container.appendChild(c);
          canvases.push(c);
        }
        const render = async (n: number) => {
          if (rendered.has(n)) return;
          rendered.add(n);
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = (width() / base.width) * Math.min(2, window.devicePixelRatio || 1);
          const viewport = page.getViewport({ scale });
          const canvas = canvases[n - 1];
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
          await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
        };
        const io = new IntersectionObserver(
          (entries) => entries.forEach((e) => e.isIntersecting && void render(Number((e.target as HTMLElement).dataset.page))),
          { rootMargin: '600px 0px' }
        );
        canvases.forEach((c) => io.observe(c));
        destroy = () => {
          io.disconnect();
          void task.destroy();
        };
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setError(String((e as Error).message ?? e));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [source, id]);

  useEffect(() => {
    let down = false;
    const offPedal = bus.onPedal((e) => {
      if (!pedal || (e.controller !== 64 && e.controller !== 67)) return;
      const pressed = e.value >= 64;
      if (pressed && !down) scrollBy(e.controller === 67 ? -1 : 1);
      down = pressed;
    });
    const key = (e: KeyboardEvent) => {
      if (['PageDown', 'ArrowDown', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
        scrollBy(1);
      } else if (['PageUp', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
        e.preventDefault();
        scrollBy(-1);
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      offPedal();
      window.removeEventListener('keydown', key);
    };
  }, [pedal]);

  return (
    <div class="stack" ref={shell}>
      <div class="row spread wrap">
        <div>
          <a href={href('library')} class="small">
            ← {t('nav.library')}
          </a>
          <h1 style={{ margin: 0 }}>{title || 'PDF'}</h1>
        </div>
        {pages > 0 && <span class="badge">{t('pdf.pages', { n: pages })}</span>}
      </div>
      <div class="card toolbar row wrap">
        <label class="row small">
          <input
            type="checkbox"
            checked={pedal}
            onChange={(e) => {
              setPedal(e.currentTarget.checked);
              save(PREFS, { pedal: e.currentTarget.checked });
            }}
          />
          {t('pdf.pedal')}
        </label>
        <button onClick={() => void shell.current?.requestFullscreen?.()}>⛶ {t('pdf.fullscreen')}</button>
        <span class="muted small">{t('pdf.pedalHint')}</span>
      </div>
      <p class="muted small" style={{ margin: 0 }}>
        {t('pdf.noFollow')}
      </p>
      {status === 'loading' && <div class="card empty">{t('pdf.loading')}</div>}
      {status === 'error' && (
        <div class="card empty">
          <p>{t('pdf.error')}</p>
          <p class="small muted">{error}</p>
        </div>
      )}
      <div class="pdf-pages" ref={host} />
    </div>
  );
}

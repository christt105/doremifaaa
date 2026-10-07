import { useState } from 'preact/hooks';
import { useT } from '../i18n';
import { request } from '../lib/api';
import type { ServerPiece } from '../lib/library';

export function issueMeasures(piece: Pick<ServerPiece, 'quality'>): string[] {
  const q = piece.quality;
  if (!q) return [];
  return [...new Set([...q.wrongLength, ...q.emptyStaff.map((s) => s.split(':')[0])])].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
}

export function QualityBadge({ piece, onChange }: { piece: ServerPiece; onChange?: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const omr = piece.omr;
  if (omr && (omr.state === 'queued' || omr.state === 'running')) return <span class="badge">⏳ {t(`omr.${omr.state}`)}</span>;
  if (omr?.state === 'failed')
    return (
      <span class="row wrap" style={{ gap: '0.3rem' }}>
        <span class="badge quality-bad" title={omr.error ?? ''}>
          {t('omr.failed')}
        </span>
        {piece.editable && (
          <button
            class="ghost small"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void request(`api/pieces/${encodeURIComponent(piece.id)}/convert`, { method: 'POST' })
                .then(() => onChange?.())
                .finally(() => setBusy(false));
            }}
          >
            ↻ {t('omr.retry')}
          </button>
        )}
      </span>
    );
  const bad = issueMeasures(piece);
  if (!piece.hasScore || !piece.quality || bad.length === 0) return null;
  return (
    <span class="badge quality-bad" title={t('omr.badgeHint', { list: bad.slice(0, 12).join(', ') })}>
      ⚠ {t('omr.badge', { n: bad.length, total: piece.quality.measures })}
    </span>
  );
}

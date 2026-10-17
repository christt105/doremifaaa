import { useEffect, useState } from 'preact/hooks';
import { useT } from '../i18n';
import { findServerPiece } from '../lib/library';
import { href, navigate, type ViewProps } from '../router';

export function PieceLink({ route }: ViewProps) {
  const t = useT();
  const id = route.params.join('/');
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    void findServerPiece(id).then((p) => {
      if (p?.hasScore) navigate(href('score', 'server', p.id), true);
      else if (p?.hasPdf) navigate(href('pdf', 'server', p.id), true);
      else setMissing(true);
    });
  }, [id]);
  if (!missing) return <div class="empty">{t('common.loading')}</div>;
  return (
    <div class="card empty">
      <p>{t('piece.notFound', { id })}</p>
      <a class="button" href={href('library')}>
        {t('nav.library')}
      </a>
    </div>
  );
}

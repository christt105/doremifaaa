import { useEffect, useState } from 'preact/hooks';
import { addStrings, useT } from '../i18n';
import { findServerPiece } from '../lib/library';
import { href, type ViewProps } from '../router';

addStrings('es', { 'piece.notFound': 'No encuentro «{id}» en tu repertorio.' });
addStrings('en', { 'piece.notFound': 'Could not find “{id}” in your repertoire.' });

export function PieceLink({ route }: ViewProps) {
  const t = useT();
  const id = route.params.join('/');
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    void findServerPiece(id).then((p) => {
      if (p?.hasScore) location.replace(href('score', 'server', p.id));
      else if (p?.hasPdf) location.replace(href('pdf', 'server', p.id));
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

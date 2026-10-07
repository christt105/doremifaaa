import { useEffect, useState } from 'preact/hooks';
import { useT } from '../i18n';
import { request } from '../lib/api';
import { errorText } from '../views/Manage';

interface Plan {
  total: number;
  new: number;
  incomplete: number;
  imported: number;
}

interface Result {
  imported: string[];
  updated: string[];
  skipped: string[];
  failed: { id: string; error: string }[];
}

export function VaultImport({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  const load = () =>
    request('api/import/vault')
      .then((r) => r.json())
      .then(setPlan)
      .catch(() => setPlan(null));

  useEffect(() => void load(), []);

  if (!plan || (!result && plan.new + plan.incomplete === 0)) return null;

  const run = async () => {
    if (!confirm) return setConfirm(true);
    setBusy(true);
    setError('');
    try {
      setResult(await (await request('api/import/vault', { method: 'POST' })).json());
      onDone();
      void load();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div class="card stack">
      <div>
        <h3 style={{ margin: 0 }}>{t('import.title')}</h3>
        <p class="muted small" style={{ margin: 0 }}>
          {t('import.plan', { n: plan.new, total: plan.total, done: plan.imported + plan.incomplete })}
          {plan.incomplete > 0 && ` ${t('import.incomplete', { n: plan.incomplete })}`}
        </p>
      </div>
      {plan.new + plan.incomplete > 0 && (
        <div class="row wrap">
          <button class={confirm ? 'primary' : ''} disabled={busy} onClick={() => void run()}>
            {busy ? t('import.running') : confirm ? t('import.confirm') : t('import.start')}
          </button>
          {confirm && <span class="muted small">{t('import.readOnly')}</span>}
        </div>
      )}
      {error && <p class="bad small">{error}</p>}
      {result && (
        <div class="small">
          <p class="ok" style={{ margin: 0 }}>
            {t('import.result', { imported: result.imported.length, updated: result.updated.length, failed: result.failed.length })}
          </p>
          {result.failed.length > 0 && (
            <ul class="upload-list bad">
              {result.failed.map((f) => (
                <li key={f.id}>
                  {f.id}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

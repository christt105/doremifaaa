import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useT } from './i18n';
import type { ViewProps } from './router';

export function lazyView(load: () => Promise<ComponentType<ViewProps>>): ComponentType<ViewProps> {
  let cached: ComponentType<ViewProps> | null = null;
  return function LazyView(props: ViewProps) {
    const t = useT();
    const [View, setView] = useState<ComponentType<ViewProps> | null>(() => cached);
    useEffect(() => {
      if (cached) return;
      void load().then((v) => {
        cached = v;
        setView(() => v);
      });
    }, []);
    return View ? <View {...props} /> : <div class="empty">{t('common.loading')}</div>;
  };
}

import type { ComponentType } from 'preact';
import { InputStatus } from './components/InputStatus';
import { useT } from './i18n';
import { href, useRoute, type ViewProps } from './router';
import { Home } from './views/Home';
import { SettingsView } from './views/Settings';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  view: ComponentType<ViewProps>;
  hidden?: boolean;
}

const NAV: NavItem[] = [
  { path: 'settings', label: 'nav.settings', icon: '⚙', view: SettingsView }
];

export function App() {
  const t = useT();
  const route = useRoute();
  const current = NAV.find((n) => n.path === route.path);
  const View = current?.view;
  return (
    <div class="shell">
      <header class="topbar">
        <a class="brand" href={href('home')}>
          <img src="./icon.svg" alt="" width={28} height={28} />
          <span>doremifaaa</span>
        </a>
        <nav class="nav">
          {NAV.filter((n) => !n.hidden).map((n) => (
            <a key={n.path} href={href(n.path)} class={n.path === current?.path ? 'active' : ''}>
              <span class="nav-icon" aria-hidden="true">
                {n.icon}
              </span>
              <span class="nav-label">{t(n.label)}</span>
            </a>
          ))}
        </nav>
        <InputStatus />
      </header>
      <main class="content">{View ? <View route={route} /> : <Home available={new Set(NAV.map((n) => n.path))} />}</main>
    </div>
  );
}

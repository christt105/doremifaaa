import type { ComponentType } from 'preact';
import { InputStatus } from './components/InputStatus';
import { useT } from './i18n';
import { lazyView } from './lazy';
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

const NoteTrainer = lazyView(() => import('./views/NoteTrainer').then((m) => m.NoteTrainer));
const KeyTrainer = lazyView(() => import('./views/KeyTrainer').then((m) => m.KeyTrainer));
const SightReading = lazyView(() => import('./views/SightReading').then((m) => m.SightReading));
const Library = lazyView(() => import('./views/Library').then((m) => m.Library));
const Player = lazyView(() => import('./views/Player').then((m) => m.Player));
const Stats = lazyView(() => import('./views/Stats').then((m) => m.Stats));

const NAV: NavItem[] = [
  { path: 'notes', label: 'nav.notes', icon: '♩', view: NoteTrainer },
  { path: 'keys', label: 'nav.keys', icon: '♯', view: KeyTrainer },
  { path: 'sight', label: 'nav.sight', icon: '𝄞', view: SightReading },
  { path: 'library', label: 'nav.library', icon: '❏', view: Library },
  { path: 'score', label: 'nav.score', icon: '❏', view: Player, hidden: true },
  { path: 'stats', label: 'nav.stats', icon: '▤', view: Stats },
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
            <a key={n.path} href={href(n.path)} class={n.path === current?.path || (n.path === 'library' && current?.path === 'score') ? 'active' : ''}>
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

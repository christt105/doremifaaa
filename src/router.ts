import { useEffect, useState } from 'preact/hooks';

export interface Route {
  path: string;
  params: string[];
}

export interface ViewProps {
  route: Route;
}

const base = import.meta.env.BASE_URL;

export function parsePath(pathname: string, appBase: string = base): Route {
  const rel = pathname.startsWith(appBase) ? pathname.slice(appBase.length) : pathname.replace(/^\/+/, '');
  const [path, ...params] = rel
    .split('/')
    .filter((p, i, all) => p !== '' || i < all.length - 1)
    .map((p) => decodeURIComponent(p));
  return { path: path || 'home', params: params.filter((p) => p !== '') };
}

export function buildHref(appBase: string, parts: string[]): string {
  return appBase + parts.map((p) => encodeURIComponent(p)).join('/');
}

export function legacyHashToPath(hash: string, search: string, appBase: string = base): string | null {
  if (!hash.startsWith('#/')) return null;
  const [path, query = ''] = hash.slice(1).split('?', 2);
  const params = new URLSearchParams(search);
  new URLSearchParams(query).forEach((v, k) => params.set(k, v));
  const qs = params.toString();
  return appBase + path.replace(/^\/+/, '') + (qs ? `?${qs}` : '');
}

export function href(...parts: string[]): string {
  return buildHref(base, parts);
}

const listeners = new Set<() => void>();

export function navigate(to: string, replace = false): void {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  listeners.forEach((fn) => fn());
}

export function installRouter(): void {
  const legacy = legacyHashToPath(location.hash, location.search);
  if (legacy !== null) history.replaceState(null, '', legacy);
  window.addEventListener('popstate', () => listeners.forEach((fn) => fn()));
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a');
    if (!a || a.target || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith(base)) return;
    e.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  });
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parsePath(location.pathname));
  useEffect(() => {
    const on = () => setRoute(parsePath(location.pathname));
    listeners.add(on);
    on();
    return () => void listeners.delete(on);
  }, []);
  return route;
}

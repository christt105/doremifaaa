import { useEffect, useState } from 'preact/hooks';

export interface Route {
  path: string;
  params: string[];
}

function parse(): Route {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, ...params] = hash.split('/').map((p) => decodeURIComponent(p));
  return { path: path || 'home', params };
}

export interface ViewProps {
  route: Route;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse());
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function href(...parts: string[]): string {
  return '#/' + parts.map((p) => encodeURIComponent(p)).join('/');
}

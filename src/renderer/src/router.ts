import { useEffect, useState } from 'react';

/**
 * URL Hash 路由（交互稿 §4 路由即状态）：
 *   #/home | #/category | #/rank | #/search | #/library
 *   #/detail/:id
 *   #/player/:id/:ep
 * 刷新/返回不丢上下文；单窗口单路由。
 */

export type RouteName = 'home' | 'category' | 'rank' | 'search' | 'detail' | 'player' | 'library';

export interface Route {
  name: RouteName;
  id?: string;
  ep?: number;
}

export function parseHash(hash: string): Route {
  const segs = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (segs[0]) {
    case 'category':
      return { name: 'category' };
    case 'rank':
      return { name: 'rank' };
    case 'search':
      return { name: 'search' };
    case 'library':
      return { name: 'library' };
    case 'detail':
      return segs[1] ? { name: 'detail', id: decodeURIComponent(segs[1]) } : { name: 'home' };
    case 'player': {
      if (!segs[1]) return { name: 'home' };
      const ep = Number.parseInt(segs[2] ?? '1', 10);
      return {
        name: 'player',
        id: decodeURIComponent(segs[1]),
        ep: Number.isFinite(ep) && ep >= 1 ? ep : 1,
      };
    }
    default:
      return { name: 'home' };
  }
}

export function navigate(hash: string): void {
  window.location.hash = hash.startsWith('#') ? hash : `#${hash}`;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

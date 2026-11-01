import { useSyncExternalStore } from 'react';
function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb);
  return () => window.removeEventListener('popstate', cb);
}
export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => '/');
}

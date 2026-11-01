import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider, useStore } from '../components/store-context';
import { Shell } from '../components/shell';
import { Home } from '../components/home';
import { Catalog, ProductDetails } from '../components/products';
import { Services } from '../components/services';
import { Contact } from '../components/contact';
import { Cart } from '../components/cart';
import { Admin } from '../components/admin';
import '../app/globals.css';
function AdminGate() {
  const { settings } = useStore();
  const [state, setState] = useState('loading'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => setState(r.ok ? 'ready' : 'login'))
      .catch(() => setState('login'));
  }, []);
  if (state === 'loading') return <p className="loading">جارٍ التحقق…</p>;
  if (state === 'ready') return <Admin />;
  return (
    <div className="container page">
      <form
        className="lock-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const r = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password }),
            });
            if (!r.ok) {
              const d = (await r.json().catch(() => ({}))) as { error?: string };
              throw new Error(
                r.status === 429
                  ? 'محاولات كثيرة. انتظر ١٥ دقيقة ثم حاول مرة أخرى.'
                  : r.status === 403 && d.error
                    ? d.error
                    : r.status === 401
                      ? 'البريد أو كلمة المرور غير صحيحين.'
                      : 'تعذر الاتصال بالخادم الآن. حاول مرة أخرى.',
              );
            }
            setPassword('');
            setState('ready');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>دخول إدارة {settings.name}</h1>
        <label>
          البريد الإلكتروني
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          كلمة المرور
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy ? 'جارٍ التحقق…' : 'تسجيل الدخول'}
        </button>
      </form>
    </div>
  );
}
// One address per page: "/products/" is treated as "/products".
function currentPath() {
  const raw = window.location.pathname;
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') || '/' : raw;
  if (path !== raw) window.history.replaceState(null, '', path + window.location.search + window.location.hash);
  return path;
}
// In-app navigation: internal links switch pages without reloading the whole site.
function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb);
  return () => window.removeEventListener('popstate', cb);
}
const getLocation = () => window.location.pathname + window.location.search;
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.('a');
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin || /^\/(api|media|assets)\//.test(url.pathname)) return;
  if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
  e.preventDefault();
  if (url.pathname + url.search + url.hash !== window.location.pathname + window.location.search + window.location.hash)
    window.history.pushState(null, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(new PopStateEvent('popstate'));
  if (!url.hash) window.scrollTo(0, 0);
});
function Page() {
  const { settings } = useStore();
  useSyncExternalStore(subscribe, getLocation, getLocation);
  const path = currentPath();
  useEffect(() => {
    const name = settings.name;
    const titles: Record<string, string> = {
      '/': `${name} | موبايلات وإكسسوارات وخدمات المحافظ وInstaPay`,
      '/products': `المنتجات | ${name}`,
      '/services': `الخدمات والحاسبة | ${name}`,
      '/contact': `تواصل معنا | ${name}`,
      '/cart': `السلة | ${name}`,
      '/admin': `لوحة الإدارة | ${name}`,
    };
    const known = titles[path];
    if (known) document.title = known;
    else if (!path.startsWith('/products/')) document.title = `الصفحة غير موجودة | ${name}`;
  }, [path, settings.name]);
  if (path === '/') return <Home />;
  if (path === '/products') return <Catalog />;
  if (path.startsWith('/products/')) {
    let id = '';
    try {
      id = decodeURIComponent(path.slice(10));
    } catch {}
    return <ProductDetails id={id} />;
  }
  if (path === '/services') return <Services />;
  if (path === '/contact') return <Contact />;
  if (path === '/cart') return <Cart />;
  if (path === '/admin') return <AdminGate />;
  return (
    <div className="container page empty">
      <h1>الصفحة غير موجودة</h1>
      <a href="/">العودة للرئيسية</a>
    </div>
  );
}
function RoutedPage() {
  const loc = useSyncExternalStore(subscribe, getLocation, getLocation);
  return <Page key={loc} />;
}
createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <Shell>
      <RoutedPage />
    </Shell>
  </StoreProvider>,
);

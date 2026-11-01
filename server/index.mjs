import http from 'node:http';
import path from 'node:path';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { storage } from './storage.mjs';
import { login, logout, userFor } from './auth.mjs';
import { requestContext } from './context.mjs';
import { createStatic } from './static.mjs';
export async function createServer({
  dataDir = path.resolve(process.env.DATA_DIR ?? 'data'),
  origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000',
  seedDemo = false,
  trustProxy = process.env.TRUST_PROXY ?? 0,
} = {}) {
  const base = new URL(origin);
  if (base.pathname !== '/' || base.search || base.hash || base.username || base.password)
    throw new Error('APP_ORIGIN must be an origin');
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
    throw new Error('HTTPS is required outside localhost');
  const store = storage(dataDir);
  const staticFiles = createStatic({ origin: base.origin, store });
  const trust = Math.max(0, Math.min(5, Number.parseInt(trustProxy, 10) || 0));
  // Client address for login limits. Forwarded headers are used only when TRUST_PROXY says how many proxies sit in front of Node.
  const clientIp = (req) => {
    const remote = req.socket.remoteAddress ?? 'unknown';
    if (!trust) return remote;
    const hops = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return hops[hops.length - trust] || remote;
  };
  // www.example.com <-> example.com: the "other" spelling is redirected to APP_ORIGIN so logins and cookies always work.
  const twinHost = base.hostname.startsWith('www.') ? base.hostname.slice(4) : 'www.' + base.hostname;
  let warnedProxy = false;
  globalThis.__cashtechEnv = { DB: store.DB, BUCKET: store.BUCKET };
  const api = await import('../dist/api/api.mjs');
  const { defaults, sampleProducts } = await import('../dist/shared/domain.mjs');
  if (seedDemo && store.db.prepare('SELECT COUNT(*) as n FROM products').get().n === 0) {
    for (const p of sampleProducts)
      store.db
        .prepare(
          'INSERT INTO products(id,name,brand,category,description,specs,images,price,old_price,available,hidden,sample,featured,version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          p.id,
          p.name,
          p.brand,
          p.category,
          p.description,
          p.specs,
          JSON.stringify(p.images),
          p.price,
          p.oldPrice,
          +p.available,
          +p.hidden,
          +p.sample,
          +p.featured,
          p.version,
          new Date().toISOString(),
        );
  }
  // On https the __Host- prefix makes browsers require Secure + Path=/ and forbid a Domain attribute,
  // so a sibling subdomain can't plant or overwrite the session cookie. Browsers reject __Host- on plain http,
  // so local http testing keeps the plain name.
  const cookieName = base.protocol === 'https:' ? '__Host-cashtech_session' : 'cashtech_session';
  const cookie = (token, age = 28800) =>
    `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${base.protocol === 'https:' ? '; Secure' : ''}`;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, base);
      if (url.origin !== base.origin) {
        res.writeHead(400);
        res.end();
        return;
      }
      const forwardedHost = trust ? String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim() : '';
      const host = (forwardedHost || String(req.headers.host ?? '')).toLowerCase().replace(/:\d+$/, '');
      const forwardedProto = trust ? String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() : '';
      const ipOrLocal = !host || host === 'localhost' || /^[\d.]+$/.test(host) || host.startsWith('[');
      const foreignHost = process.env.NODE_ENV === 'production' && base.protocol === 'https:' && host !== base.hostname && !ipOrLocal && url.pathname !== '/healthz';
      if (host === twinHost || foreignHost || (base.protocol === 'https:' && forwardedProto === 'http')) {
        res.writeHead(301, { Location: base.origin + url.pathname + url.search, 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      if (!trust && !warnedProxy && req.headers['x-forwarded-for']) {
        warnedProxy = true;
        console.warn(
          new Date().toISOString(),
          'WARNING: requests arrive through a proxy (X-Forwarded-For) but TRUST_PROXY=0. All visitors share one address for login limits; set TRUST_PROXY=1 (or the number of proxies).',
        );
      }
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > 6 * 1024 * 1024) {
          res.writeHead(413);
          res.end();
          return;
        }
        chunks.push(c);
      }
      const bytes = Buffer.concat(chunks);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers))
        if (typeof v === 'string' && !k.startsWith('oai-')) headers.set(k, v);
      const method = req.method ?? 'GET';
      const request = new Request(url, {
        method,
        headers,
        ...(!['GET', 'HEAD'].includes(method) ? { body: bytes } : {}),
      });
      let response;
      const json = (d, status = 200) =>
        Response.json(d, { status, headers: { 'Cache-Control': 'no-store' } });
      if (url.pathname.startsWith('/api/auth/')) {
        if (method === 'GET' && url.pathname === '/api/auth/session') {
          const u = userFor(store.db, req.headers.cookie, cookieName);
          response = u ? json({ email: u.email }) : json({ error: 'يلزم تسجيل الدخول' }, 401);
        } else if (method !== 'POST') response = json({ error: 'غير مسموح' }, 405);
        else if (headers.get('origin') !== base.origin)
          response = json(
            { error: `افتح لوحة الإدارة من العنوان الرسمي للموقع: ${base.origin}/admin`, code: 'origin' },
            403,
          );
        else if (url.pathname === '/api/auth/login') {
          let input;
          try {
            if (bytes.length > 4000) throw Error();
            input = JSON.parse(bytes);
          } catch {
            response = json({ error: 'طلب غير صالح' }, 400);
          }
          if (!response && (input === null || typeof input !== 'object'))
            response = json({ error: 'طلب غير صالح' }, 400);
          else if (input) {
            const r = await login(store.db, input.email, input.password, clientIp(req));
            response = json(r.status === 200 ? { ok: true } : { error: 'تعذر تسجيل الدخول' }, r.status);
            if (r.token) response.headers.set('Set-Cookie', cookie(r.token));
          }
        } else if (url.pathname === '/api/auth/logout') {
          logout(store.db, req.headers.cookie, cookieName);
          response = json({ ok: true });
          response.headers.set('Set-Cookie', cookie('', 0));
        } else response = json({ error: 'غير موجود' }, 404);
      } else if (url.pathname === '/healthz') {
        try {
          store.db.prepare('SELECT 1').get();
          response = json({ ok: true });
        } catch (e) {
          console.error(new Date().toISOString(), 'health check failed', e);
          response = json({ ok: false }, 503);
        }
      } else if (url.pathname.startsWith('/api/')) {
        const routes = {
          '/api/catalog': api.catalog,
          '/api/quote': api.quote,
          '/api/checkout': api.checkout,
          '/api/admin/products': api.products,
          '/api/admin/settings': api.settings,
          '/api/admin/upload': api.upload,
        };
        let route = routes[url.pathname];
        let context;
        if (url.pathname.startsWith('/api/media/')) {
          route = api.media;
          context = { params: Promise.resolve({ key: url.pathname.slice(11) }) };
        }
        const handler = route?.[method] ?? (method === 'HEAD' ? route?.GET : undefined);
        response = handler
          ? await requestContext.run({ user: userFor(store.db, req.headers.cookie, cookieName) }, () =>
              handler(request, context),
            )
          : json({ error: 'غير موجود' }, 404);
      } else {
        response = staticFiles.serve(url);
      }
      if (base.protocol === 'https:') response.headers.set('Strict-Transport-Security', 'max-age=31536000');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      response.headers.set('Permissions-Policy', 'camera=(),microphone=(),geolocation=(),payment=()');
      response.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-src https://maps.google.com https://www.google.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      );
      if (url.pathname.startsWith('/api/admin/')) response.headers.set('Cache-Control', 'no-store');
      const encoded = await staticFiles.encode(req, response);
      res.writeHead(response.status, encoded.headers);
      res.end(method === 'HEAD' ? undefined : encoded.body);
    } catch (e) {
      console.error(new Date().toISOString(), 'request failed', req.method, String(req.url).split('?')[0], e);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'تعذر إتمام الطلب الآن' }));
    }
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 20000;
  return { server, store };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const production = process.env.NODE_ENV === 'production';
  if (production && !process.env.APP_ORIGIN) {
    console.error(
      'APP_ORIGIN is not set. Set it to the public address of the site, e.g. APP_ORIGIN=https://cashtech.example\n' +
        'لم يتم ضبط APP_ORIGIN. اضبطه على عنوان الموقع الحقيقي، مثال: APP_ORIGIN=https://cashtech.example',
    );
    process.exit(1);
  }
  const app = await createServer({ seedDemo: process.env.SEED_DEMO === '1' });
  const origin = new URL(process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000');
  console.log(
    `Cash Tech: origin=${origin.origin} data=${path.resolve(process.env.DATA_DIR ?? 'data')} trustProxy=${process.env.TRUST_PROXY ?? 0}`,
  );
  if (production && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
    console.warn('WARNING: APP_ORIGIN points to localhost. Links, sitemap and admin login only work on that address.');
  if (production && app.store.created)
    console.warn(
      'NOTICE: a new empty database was created in DATA_DIR. If this is not the first start, your host is NOT keeping DATA_DIR between restarts — attach a persistent disk/volume or products and images will be lost.',
    );
  const sweep = () => {
    try {
      const n = app.store.sweepUploads();
      if (n) console.log(new Date().toISOString(), 'removed unused uploads:', n);
    } catch (e) {
      console.error(new Date().toISOString(), 'upload cleanup failed', e);
    }
  };
  sweep();
  setInterval(sweep, 6 * 3600 * 1000).unref();
  // A crash must be logged and end the process so Docker/PM2/systemd can restart it cleanly.
  for (const event of ['uncaughtException', 'unhandledRejection'])
    process.on(event, (e) => {
      console.error(new Date().toISOString(), event, e);
      process.exit(1);
    });
  app.server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1', () =>
    console.log('Cash Tech ready'),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () =>
      app.server.close(() => {
        app.store.close();
        process.exit(0);
      }),
    );
}

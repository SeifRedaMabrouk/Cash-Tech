import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};
// RFC 9110: "gzip;q=0" (or "*;q=0" without gzip listed) means the client refuses gzip.
export function acceptsGzip(header) {
  let gzip = null, star = null;
  for (const part of String(header ?? '').toLowerCase().split(',')) {
    const [name, ...params] = part.trim().split(';');
    const qp = params.map((x) => x.trim()).find((x) => x.startsWith('q='));
    const q = qp ? Number(qp.slice(2)) : 1;
    if (name === 'gzip' || name === 'x-gzip') gzip = q;
    else if (name === '*') star = q;
  }
  return gzip !== null ? gzip > 0 : star !== null ? star > 0 : false;
}
const COMPRESSIBLE = /^(text\/|application\/(json|xml|javascript)|image\/svg)/;
const PAGES = new Set(['/', '/products', '/services', '/contact', '/cart', '/admin']);

export function createStatic({ origin, store }) {
  const distRoot = fileURLToPath(new URL('../dist/client', import.meta.url));
  const cache = new Map();
  const entries = new WeakMap();

  function load(target) {
    const st = statSync(target);
    const hit = cache.get(target);
    if (hit && hit.mtime === st.mtimeMs) return hit;
    const entry = { mtime: st.mtimeMs, raw: readFileSync(target), gz: null };
    cache.set(target, entry);
    return entry;
  }

  const esc = (v) =>
    String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const price = (cents) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(cents / 100) + ' ج.م';
  function shopName() {
    try {
      const row = store.db.prepare("SELECT data FROM settings WHERE id='store'").get();
      const name = row && JSON.parse(row.data).name;
      if (typeof name === 'string' && name.trim()) return name.trim();
    } catch {}
    return 'كاش تيك';
  }
  // Status + title/description/image for each URL, written into the HTML so link previews
  // (WhatsApp, Facebook) and search engines see the right page, and unknown URLs are real 404s.
  function pageInfo(pathname) {
    const name = shopName();
    const description = `${name} — موبايلات وإكسسوارات وخدمات المحافظ الإلكترونية وInstaPay.`;
    const pages = {
      '/': { title: `${name} | موبايلات وإكسسوارات وخدمات المحافظ وInstaPay`, description },
      '/products': { title: `المنتجات | ${name}`, description: `تصفح موبايلات وإكسسوارات ${name} بالأسعار والتوفر.` },
      '/services': {
        title: `الخدمات والحاسبة | ${name}`,
        description: `احسب رسوم سحب وإيداع المحافظ الإلكترونية وInstaPay في ${name} قبل ما تيجي.`,
      },
      '/contact': { title: `تواصل معنا | ${name}`, description: `عنوان ${name} ومواعيد العمل وطرق التواصل.` },
      '/cart': { title: `السلة | ${name}`, description, robots: 'noindex,nofollow' },
      '/admin': { title: `لوحة الإدارة | ${name}`, description, robots: 'noindex,nofollow' },
    };
    if (pages[pathname]) return { status: 200, image: '/assets/hero.webp', robots: 'index,follow', ...pages[pathname] };
    const notFound = { status: 404, title: `الصفحة غير موجودة | ${name}`, description, image: '/assets/hero.webp', robots: 'noindex' };
    const m = pathname.match(/^\/products\/([^/]+)$/);
    if (!m) return notFound;
    let id;
    try {
      id = decodeURIComponent(m[1]);
    } catch {
      return notFound;
    }
    const row = store.db.prepare('SELECT name, description, images, price FROM products WHERE id=? AND hidden=0').get(id);
    if (!row) return notFound;
    let image = '/assets/hero.webp';
    try {
      const first = JSON.parse(row.images)[0];
      if (typeof first === 'string' && first.startsWith('/'))
        image = /^\/assets\/(phone|headphones|charger|case)\.png$/.test(first) ? '/assets/demo-products.webp' : first;
    } catch {}
    const summary = String(row.description || '').replace(/\s+/g, ' ').trim().slice(0, 150);
    const priceText = row.price === null ? 'السعر عند الاستفسار' : price(row.price);
    return {
      status: 200,
      title: `${row.name} | ${name}`,
      description: `${priceText}${summary ? ' — ' + summary : ''}`,
      image,
      robots: 'index,follow',
    };
  }

  function sitemap() {
    const rows = store.db.prepare('SELECT id, updated_at FROM products WHERE hidden=0 ORDER BY id').all();
    const urls = [
      ['/'],
      ['/products'],
      ['/services'],
      ['/contact'],
      ...rows.map((r) => ['/products/' + encodeURIComponent(r.id), r.updated_at]),
    ];
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      urls
        .map(
          ([u, m]) =>
            `<url><loc>${origin}${u}</loc>${m ? `<lastmod>${String(m).slice(0, 10)}</lastmod>` : ''}</url>`,
        )
        .join('') +
      '</urlset>'
    );
  }

  function text(body, type, extra = {}) {
    return new Response(body, {
      headers: { 'Content-Type': type, 'Cache-Control': 'public,max-age=3600', ...extra },
    });
  }

  function serve(url) {
    // "/products/" -> "/products": one address per page (the app and search engines treat them as the same page).
    if (url.pathname.length > 1 && url.pathname.endsWith('/'))
      return new Response(null, {
        status: 301,
        headers: { Location: (url.pathname.replace(/\/+$/, '') || '/') + url.search },
      });
    const pathname = url.pathname;
    if (pathname === '/robots.txt')
      return text(
        `User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /cart\nSitemap: ${origin}/sitemap.xml\n`,
        TYPES['.txt'],
      );
    if (pathname === '/sitemap.xml')
      return text(sitemap(), TYPES['.xml'], { 'Cache-Control': 'public,max-age=600' });
    if (pathname === '/calculator')
      return new Response(null, { status: 302, headers: { Location: '/services' } });
    let target;
    try {
      target = path.resolve(distRoot, '.' + decodeURIComponent(pathname));
    } catch {
      return new Response('Bad path', { status: 400 });
    }
    if (target !== distRoot && !target.startsWith(distRoot + path.sep))
      return new Response('Not found', { status: 404 });
    let isFile = false;
    try {
      isFile = statSync(target).isFile();
    } catch {}
    if (isFile && path.basename(target) !== 'index.html') {
      const ext = path.extname(target);
      const hashed = /^\/assets\/index-[\w-]+\.(js|css)$/.test(pathname);
      const response = new Response(null, {
        headers: {
          'Content-Type': TYPES[ext] ?? 'application/octet-stream',
          'Cache-Control': hashed ? 'public,max-age=31536000,immutable' : 'public,max-age=3600',
        },
      });
      const entry = load(target);
      entries.set(response, entry);
      return response;
    }
    // A missing file with an extension must not be answered with the app shell (it would break scripts and images).
    if (path.extname(pathname) && path.basename(target) !== 'index.html')
      return new Response('Not found', { status: 404 });
    const info = pageInfo(pathname);
    const status = info.status;
    const canonical = origin + (status === 200 ? encodeURI(pathname === '/' ? '/' : pathname) : '/');
    const html = load(path.join(distRoot, 'index.html'))
      .raw.toString('utf8')
      .replaceAll('__CANONICAL__', esc(canonical))
      .replaceAll('__TITLE__', esc(info.title))
      .replaceAll('__DESCRIPTION__', esc(info.description))
      .replaceAll('__OG_IMAGE__', esc(origin + info.image))
      .replaceAll('__ROBOTS__', esc(info.robots))
      .replaceAll('__SITE_NAME__', esc(shopName()))
      .replaceAll('__APP_ORIGIN__', origin);
    return new Response(html, {
      status,
      headers: { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' },
    });
  }

  // Applies gzip when the client accepts it. Cached files are compressed once.
  async function encode(req, response) {
    const type = response.headers.get('content-type') ?? '';
    const entry = entries.get(response);
    let body = entry ? entry.raw : Buffer.from(await response.arrayBuffer());
    const headers = Object.fromEntries(response.headers);
    if (COMPRESSIBLE.test(type)) {
      headers.vary = 'Accept-Encoding';
      if (body.length > 1024 && acceptsGzip(req.headers['accept-encoding'])) {
        headers['content-encoding'] = 'gzip';
        if (entry) {
          entry.gz ??= gzipSync(body);
          body = entry.gz;
        } else body = gzipSync(body);
      }
    }
    headers['content-length'] = String(body.length);
    return { headers, body };
  }

  return { serve, encode };
}

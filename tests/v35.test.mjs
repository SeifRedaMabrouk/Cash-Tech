import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createAdmin } from '../server/auth.mjs';
import { createServer } from '../server/index.mjs';
import { acceptsGzip } from '../server/static.mjs';

const EMAIL = 'owner@example.com', PASSWORD = 'test-only-passphrase-123!';
async function boot(port) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cashtech-v35-'));
  const base = `http://127.0.0.1:${port}`;
  const app = await createServer({ dataDir: dir, origin: base, seedDemo: true });
  await createAdmin(app.store.db, EMAIL, PASSWORD);
  await new Promise((r) => app.server.listen(port, '127.0.0.1', r));
  let cookie = '';
  const call = (url, { method = 'GET', body, raw, headers = {} } = {}) =>
    fetch(base + url, {
      method, redirect: 'manual',
      headers: { Origin: base, Cookie: cookie, ...(body === undefined && raw === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  const r = await call('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  cookie = r.headers.get('set-cookie').split(';')[0];
  const stop = async () => { await new Promise((r) => app.server.close(r)); try { app.store.close(); } catch {} rmSync(dir, { recursive: true, force: true }); };
  return { call, stop };
}

test('Docker does not trust proxy headers by default', () => {
  assert.match(readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8'), /^ENV .*TRUST_PROXY=0/m);
});

test('cart error never reveals the name of a hidden product', async () => {
  const s = await boot(4451);
  try {
    const p = (await (await s.call('/api/admin/products')).json()).find((x) => x.id === 'demo-phone');
    assert.equal((await s.call('/api/admin/products', { method: 'PUT', body: { ...p, hidden: true } })).status, 200);
    const r = await s.call('/api/checkout', { method: 'POST', body: [{ id: 'demo-phone', quantity: 1 }] });
    const text = await r.text();
    assert.equal(r.status, 409);
    assert.ok(!text.includes(p.name), text);
  } finally { await s.stop(); }
});

test('saving a product with an image that does not exist is refused', async () => {
  const s = await boot(4452);
  try {
    const p = (await (await s.call('/api/admin/products')).json())[0];
    const bad = await s.call('/api/admin/products', { method: 'PUT', body: { ...p, images: ['/api/media/0000aaaa-bbbb.png'] } });
    assert.equal(bad.status, 400);
    const bad2 = await s.call('/api/admin/products', { method: 'POST', body: { ...p, id: 'new-x', images: ['/assets/nothing.png'] } });
    assert.equal(bad2.status, 400);
  } finally { await s.stop(); }
});

test('empty or null settings data gets 400, not 503', async () => {
  const s = await boot(4453);
  try {
    for (const raw of ['null', '{"data":null,"version":1}', '{}']) {
      assert.equal((await s.call('/api/admin/settings', { method: 'PUT', raw })).status, 400, raw);
    }
    assert.equal((await s.call('/api/quote', { method: 'POST', raw: 'null' })).status, 400);
  } finally { await s.stop(); }
});

test('gzip is skipped when the client refuses it', async () => {
  assert.equal(acceptsGzip('gzip'), true);
  assert.equal(acceptsGzip('gzip, deflate, br'), true);
  assert.equal(acceptsGzip('gzip;q=0'), false);
  assert.equal(acceptsGzip('identity'), false);
  assert.equal(acceptsGzip('*;q=0'), false);
  assert.equal(acceptsGzip('*'), true);
  const s = await boot(4454);
  try {
    const off = await s.call('/', { headers: { 'Accept-Encoding': 'gzip;q=0' } });
    assert.equal(off.headers.get('content-encoding'), null);
    const on = await s.call('/sitemap.xml', { headers: { 'Accept-Encoding': 'gzip' } });
    assert.ok(on.status === 200);
  } finally { await s.stop(); }
});

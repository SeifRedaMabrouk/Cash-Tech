import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAdmin } from '../server/auth.mjs';
import { createServer } from '../server/index.mjs';
import {
  calculate,
  defaults,
  normalizeDigits,
  normalizePhone,
  settingsSchema,
  cairoLocalToIso,
  isoToCairoLocal,
  quoteText,
} from '../dist/shared/domain.mjs';

const EMAIL = 'owner@example.com';
const PASSWORD = 'test-only-passphrase-123!';

async function boot(port) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cashtech-prod-'));
  const base = `http://localhost:${port}`;
  const app = await createServer({ dataDir: dir, origin: base, seedDemo: true });
  await createAdmin(app.store.db, EMAIL, PASSWORD);
  await new Promise((r) => app.server.listen(port, '127.0.0.1', r));
  let cookie = '';
  const call = async (url, { method = 'GET', body, headers = {} } = {}) => {
    const r = await fetch(base + url, {
      method,
      redirect: 'manual',
      headers: {
        Origin: base,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return r;
  };
  // Raw request so the Host header can be chosen (fetch does not allow overriding it).
  const raw = (url, host) =>
    new Promise((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path: url, headers: { Host: host } }, (res) => {
          res.resume();
          resolve(res);
        })
        .on('error', reject);
    });
  const stop = async () => {
    await new Promise((r) => app.server.close(r));
    try {
      app.store.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  };
  return { base, call, raw, stop };
}

test('Arabic digits are accepted for amounts', () => {
  assert.equal(normalizeDigits('١٬٠٠٠٫٥'), '1000.5');
  assert.equal(normalizeDigits('۲۵۰۰'), '2500');
  const now = Date.parse('2026-11-01T12:00:00+02:00');
  const q = calculate(defaults, 'wallet-withdraw', '١٠٠٠', now);
  assert.equal(q.amountCents, 100000);
  assert.equal(q.feeCents, 900);
  assert.equal(q.netCents, 99100);
});

test('opening offer rates apply from 6 Nov 00:00 until (not including) 9 Nov 00:00 Cairo time', () => {
  const fee = (iso) => calculate(defaults, 'wallet-withdraw', '1000', Date.parse(iso)).feeCents;
  assert.equal(fee('2026-11-05T23:59:59+02:00'), 900);
  assert.equal(fee('2026-11-06T00:00:00+02:00'), 800);
  assert.equal(fee('2026-11-08T23:59:59+02:00'), 800);
  assert.equal(fee('2026-11-09T00:00:00+02:00'), 900);
  assert.equal(calculate(defaults, 'wallet-deposit', '1000', Date.parse('2026-11-07T12:00:00+02:00')).feeCents, 0);
});

test('Egyptian phone numbers are normalized to the international format', () => {
  assert.equal(normalizePhone('01551943676'), '201551943676');
  assert.equal(normalizePhone('+20 155 194 3676'), '201551943676');
  assert.equal(normalizePhone('00201551943676'), '201551943676');
  assert.equal(normalizePhone('٠١٥٥١٩٤٣٦٧٦'), '201551943676');
  assert.equal(settingsSchema.parse({ ...defaults, phone: '01551943676' }).phone, '201551943676');
});

test('mobile and short social links are accepted, other sites are not', () => {
  const ok = (k, v) => settingsSchema.safeParse({ ...defaults, [k]: v }).success;
  assert.ok(ok('facebook', 'https://m.facebook.com/profile.php?id=1000000000000'));
  assert.ok(ok('facebook', 'facebook.com/cashtech'));
  assert.ok(ok('tiktok', 'https://vm.tiktok.com/abc'));
  assert.ok(!ok('facebook', 'https://evil.example/facebook.com'));
  assert.ok(!ok('instagram', 'https://facebook.com/x'));
});

test('offer dates typed in Cairo time get the right offset, including Egyptian summer time', () => {
  assert.equal(cairoLocalToIso('2026-11-06T00:00'), '2026-11-06T00:00:00+02:00');
  assert.equal(cairoLocalToIso('2026-07-01T12:00'), '2026-07-01T12:00:00+03:00');
  assert.equal(isoToCairoLocal('2026-11-09T00:00:00+02:00'), '2026-11-09T00:00');
  assert.equal(isoToCairoLocal('2026-11-08T22:00:00Z'), '2026-11-09T00:00');
});

test('WhatsApp quote uses the shop name and readable Cairo time', () => {
  const q = calculate(defaults, 'wallet-withdraw', '1000', Date.parse('2026-11-01T12:30:00Z'));
  const text = quoteText(q, 'متجر تجريبي');
  assert.match(text, /^مرحبًا متجر تجريبي،/);
  assert.match(text, /بتوقيت مصر/);
  assert.ok(!text.includes('2026-11-01T'), 'no raw ISO timestamp');
});

test('production server: redirects, page metadata, clear errors and shop name', async () => {
  const s = await boot(4421);
  try {
    // www <-> non-www twin goes to APP_ORIGIN
    const twin = await s.raw('/products?x=1', 'www.localhost:4421');
    assert.equal(twin.statusCode, 301);
    assert.equal(twin.headers.location, s.base + '/products?x=1');
    // a trailing slash goes to the single page address
    const slash = await s.call('/products/');
    assert.equal(slash.status, 301);
    assert.equal(slash.headers.get('location'), '/products');
    // product pages carry their own title/preview in the HTML
    const page = await (await s.call('/products/demo-phone')).text();
    assert.match(page, /<title>هاتف أزرق — نموذج تجريبي \| كاش تيك<\/title>/);
    assert.match(page, /og:image" content="http:\/\/localhost:4421\/assets\/demo-products\.webp"/);
    const missing = await s.call('/products/nope');
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /name="robots" content="noindex"/);
    // HEAD works on API reads
    assert.equal((await s.call('/api/catalog', { method: 'HEAD' })).status, 200);
    // login from the wrong address explains what to do instead of blaming the password
    const wrong = await s.call('/api/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
      headers: { Origin: 'https://www.example.com' },
    });
    assert.equal(wrong.status, 403);
    assert.match((await wrong.json()).error, /http:\/\/localhost:4421\/admin/);
    // unavailable cart items are named
    const sold = await s.call('/api/checkout', { method: 'POST', body: [{ id: 'demo-case', quantity: 1 }] });
    assert.equal(sold.status, 409);
    assert.match((await sold.json()).error, /جراب حماية/);
    // validation errors name the field
    assert.equal((await s.call('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })).status, 200);
    const { data, version } = await (await s.call('/api/admin/settings')).json();
    const badPhone = await s.call('/api/admin/settings', { method: 'PUT', body: { data: { ...data, phone: '12' }, version } });
    assert.equal(badPhone.status, 400);
    assert.match((await badPhone.json()).error, /رقم واتساب/);
    // renaming the shop changes the page title and WhatsApp messages
    const saved = await s.call('/api/admin/settings', {
      method: 'PUT',
      body: { data: { ...data, name: 'محل الاختبار', phone: '01551943676' }, version },
    });
    assert.equal(saved.status, 200);
    assert.match(await (await s.call('/')).text(), /<title>محل الاختبار \|/);
    const quote = await (
      await s.call('/api/quote', { method: 'POST', body: { service: 'wallet-deposit', amount: '١٠٠' } })
    ).json();
    assert.equal(new URL(quote.url).pathname, '/201551943676');
    assert.match(decodeURIComponent(quote.url), /مرحبًا محل الاختبار،/);
  } finally {
    await s.stop();
  }
});

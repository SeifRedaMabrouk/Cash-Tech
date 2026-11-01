import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync, existsSync, utimesSync, readdirSync} from 'node:fs';
import {execFileSync, execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run = promisify(execFile);
import {gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createAdmin} from '../server/auth.mjs';
import {createServer} from '../server/index.mjs';

const EMAIL = 'owner@example.com';
const PASSWORD = 'test-only-passphrase-123!';

async function boot(port, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cashtech-hard-'));
  const base = `http://127.0.0.1:${port}`;
  const app = await createServer({dataDir: dir, origin: base, seedDemo: true, ...options});
  await createAdmin(app.store.db, EMAIL, PASSWORD);
  await new Promise(r => app.server.listen(port, '127.0.0.1', r));
  const call = (url, {method = 'GET', body, headers = {}} = {}) => fetch(base + url, {
    method, redirect: 'manual',
    headers: {Origin: base, ...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...headers},
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const stop = async () => { await new Promise(r => app.server.close(r)); try { app.store.close(); } catch {} rmSync(dir, {recursive: true, force: true}); };
  return {app, dir, base, call, stop};
}
const login = (call, ip, email = EMAIL, password = PASSWORD) => call('/api/auth/login', {method: 'POST', body: {email, password}, headers: ip ? {'X-Forwarded-For': ip} : {}});

test('login lockout cannot be used to lock the owner out, and successes are not counted', async () => {
  const s = await boot(4411, {trustProxy: 1});
  try {
    for (let i = 0; i < 10; i++) assert.equal((await login(s.call, '203.0.113.9', EMAIL, 'wrong-wrong-wrong')).status, 401);
    assert.equal((await login(s.call, '203.0.113.9', EMAIL, PASSWORD)).status, 429, 'the attacker address is blocked');
    assert.equal((await login(s.call, '198.51.100.7')).status, 200, 'the owner from another address still logs in');
    for (let i = 0; i < 35; i++) assert.equal((await login(s.call, '198.51.100.8')).status, 200, 'successful logins never lock the owner');
  } finally { await s.stop(); }
});

test('forwarded headers are ignored unless TRUST_PROXY is set', async () => {
  const s = await boot(4412, {trustProxy: 0});
  try {
    for (let i = 0; i < 10; i++) await login(s.call, `10.0.0.${i}`, EMAIL, 'wrong-wrong-wrong');
    assert.equal((await login(s.call, '10.9.9.9')).status, 429, 'spoofed X-Forwarded-For does not reset the counter');
  } finally { await s.stop(); }
});

test('malformed login bodies get clean client errors', async () => {
  const s = await boot(4413);
  try {
    for (const body of ['null', '5', '"x"']) {
      const r = await fetch(s.base + '/api/auth/login', {method: 'POST', headers: {Origin: s.base, 'Content-Type': 'application/json'}, body});
      assert.equal(r.status, 400, body);
    }
    assert.equal((await fetch(s.base + '/api/auth/login', {method: 'POST', headers: {Origin: s.base, 'Content-Type': 'application/json'}, body: '{bad'})).status, 400);
  } finally { await s.stop(); }
});

test('health check, real 404s, redirects, robots, sitemap and compression', async () => {
  const s = await boot(4414);
  try {
    assert.deepEqual(await (await s.call('/healthz')).json(), {ok: true});

    const home = await s.call('/');
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:4414\/">/);
    assert.ok(!html.includes('__CANONICAL__') && !html.includes('__APP_ORIGIN__'));

    assert.equal((await s.call('/products')).status, 200);
    assert.equal((await s.call('/products/demo-phone')).status, 200);
    assert.equal((await s.call('/products/does-not-exist')).status, 404);
    assert.equal((await s.call('/nope')).status, 404);
    assert.equal((await s.call('/.env')).status, 404);
    assert.equal((await s.call('/assets/missing.js')).status, 404);
    assert.match(await (await s.call('/nope')).text(), /<div id="root">/, '404 pages still render the app so the visitor sees a friendly message');
    const redirect = await s.call('/calculator');
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/services');

    const robots = await (await s.call('/robots.txt')).text();
    assert.match(robots, /Disallow: \/admin/);
    assert.match(robots, /Sitemap: http:\/\/127\.0\.0\.1:4414\/sitemap\.xml/);
    const sitemap = await (await s.call('/sitemap.xml')).text();
    assert.match(sitemap, /<loc>http:\/\/127\.0\.0\.1:4414\/products\/demo-phone<\/loc>/);

    const js = (html.match(/\/assets\/index-[\w-]+\.js/) ?? [])[0];
    assert.ok(js, 'bundle path found in index.html');
    const plain = await s.call(js, {headers: {'Accept-Encoding': 'identity'}});
    assert.equal(plain.headers.get('content-encoding'), null);
    const plainBody = Buffer.from(await plain.arrayBuffer());
    const zipped = await fetch(s.base + js, {headers: {'Accept-Encoding': 'gzip'}});
    assert.equal(zipped.headers.get('content-encoding'), 'gzip');
    assert.ok(zipped.headers.get('cache-control').includes('immutable'));
    // fetch() transparently decompresses, so compare against the raw bytes sent on the wire instead.
    const {stdout: raw} = await run('curl', ['-s', '-H', 'Accept-Encoding: gzip', s.base + js], {maxBuffer: 20e6, encoding: 'buffer'});
    assert.ok(raw.length < plainBody.length / 2, 'gzip body is much smaller');
    assert.equal(gunzipSync(raw).length, plainBody.length);
  } finally { await s.stop(); }
});

test('unused uploads are swept, referenced ones are kept', async () => {
  const s = await boot(4415);
  try {
    const uploads = path.join(s.dir, 'uploads');
    const used = 'aaaaaaaa-0000-0000-0000-000000000001.png';
    const orphan = 'aaaaaaaa-0000-0000-0000-000000000002.png';
    const fresh = 'aaaaaaaa-0000-0000-0000-000000000003.png';
    for (const f of [used, orphan, fresh]) writeFileSync(path.join(uploads, f), 'x');
    const old = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    for (const f of [used, orphan]) utimesSync(path.join(uploads, f), old, old);
    s.app.store.db.prepare('UPDATE products SET images=? WHERE id=?').run(JSON.stringify([`/api/media/${used}`]), 'demo-phone');
    assert.equal(s.app.store.sweepUploads(), 1);
    assert.deepEqual(readdirSync(uploads).sort(), [used, fresh].sort());
  } finally { await s.stop(); }
});

test('backup script makes a consistent copy of the database and uploads', async () => {
  const s = await boot(4416);
  const out = mkdtempSync(path.join(tmpdir(), 'cashtech-backup-'));
  try {
    writeFileSync(path.join(s.dir, 'uploads', 'bbbbbbbb-0000-0000-0000-000000000001.png'), 'img');
    const msg = (await run('node', ['scripts/backup.mjs', `--out=${out}`], {env: {...process.env, DATA_DIR: s.dir}})).stdout;
    assert.match(msg, /cashtech-/);
    const [name] = readdirSync(out);
    const copy = new DatabaseSync(path.join(out, name, 'cashtech.sqlite'));
    assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM products').get().n, 4);
    copy.close();
    assert.ok(existsSync(path.join(out, name, 'uploads', 'bbbbbbbb-0000-0000-0000-000000000001.png')));
  } finally { await s.stop(); rmSync(out, {recursive: true, force: true}); }
});

test('server errors are logged instead of swallowed', async t => {
  const s = await boot(4417);
  const errors = t.mock.method(console, 'error', () => {});
  try {
    s.app.store.close();
    const r = await s.call('/api/catalog');
    assert.equal(r.status, 503);
    assert.ok(errors.mock.callCount() >= 1, 'the failure was written to the log');
  } finally { errors.mock.restore(); await new Promise(r => s.app.server.close(r)); rmSync(s.dir, {recursive: true, force: true}); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAdmin } from '../server/auth.mjs';
import { createServer } from '../server/index.mjs';
import { defaults } from '../lib/domain.ts';

test('https origin uses a __Host- session cookie that authenticates and logs out', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cashtech-v37-'));
  const origin = 'https://shop.example';
  const app = await createServer({ dataDir: dir, origin });
  try {
    await createAdmin(app.store.db, 'owner@example.com', 'test-only-passphrase-123!');
    await new Promise((r) => app.server.listen(4417, '127.0.0.1', r));
    const call = (url, init = {}) =>
      fetch('http://127.0.0.1:4417' + url, { ...init, headers: { Host: 'shop.example', Origin: origin, 'X-Forwarded-Proto': 'https', ...(init.headers ?? {}) } });
    const res = await call('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', password: 'test-only-passphrase-123!' }) });
    assert.equal(res.status, 200);
    const set = res.headers.get('set-cookie');
    assert.match(set, /^__Host-cashtech_session=[a-f0-9]{64}; /);
    assert.match(set, /; Secure/);
    assert.doesNotMatch(set, /Domain=/i);
    const cookie = set.split(';')[0];
    assert.equal((await call('/api/auth/session', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await call('/api/auth/session', { headers: { Cookie: cookie.replace('__Host-', '') } })).status, 401);
    await call('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
    assert.equal((await call('/api/auth/session', { headers: { Cookie: cookie } })).status, 401);
  } finally {
    await new Promise((r) => app.server.close(r));
    app.store.close?.();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('default settings carry no personal email or social links', () => {
  assert.equal(defaults.email, 'info@example.com');
  assert.equal(defaults.facebook, '');
  assert.equal(defaults.instagram, '');
  assert.equal(defaults.tiktok, '');
});

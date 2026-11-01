import { scrypt, randomBytes, createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256)
    throw new Error('كلمة المرور يجب أن تكون من ١٢ إلى ٢٥٦ حرفًا');
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return salt + ':' + key.toString('hex');
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [salt, hex] = encoded.split(':');
  const expected = Buffer.from(hex, 'hex');
  const actual = await derive(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function createAdmin(db, email, password, reset = false) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('بريد غير صالح');
  email = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM admins WHERE email=?').get(email);
  if (existing && !reset) throw new Error('الحساب موجود بالفعل؛ استخدم --reset لتغيير كلمة مروره');
  const hash = await hashPassword(password);
  if (existing) {
    db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(hash, existing.id);
    db.prepare('DELETE FROM sessions WHERE admin_id=?').run(existing.id);
  } else db.prepare('INSERT INTO admins VALUES(?,?,?)').run(randomUUID(), email, hash);
}
const digest = (s) => createHash('sha256').update(s).digest('hex');
export function userFor(db, cookie = '', name = 'cashtech_session') {
  const token = cookie
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + '='))
    ?.slice(name.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db
    .prepare(
      'SELECT admins.id,admins.email FROM sessions JOIN admins ON admins.id=sessions.admin_id WHERE hash=? AND expires>?',
    )
    .get(digest(token), Date.now());
  return row ? { userId: row.id, email: row.email } : null;
}
export async function login(db, email, password, ip) {
  email = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : '';
  const now = Date.now();
  // Limits are per client IP and per IP+account pair only. There is deliberately no global
  // per-account cap: it let an attacker spread guesses over many addresses and lock the real owner out.
  // Brute force stays impractical (10 tries / 15 min per address + scrypt hashing).
  const keys = [
    ['ip:' + ip, 30],
    ['pair:' + digest(ip + '|' + email), 10],
  ];
  db.prepare('DELETE FROM login_limits WHERE expires<=?').run(now);
  for (const [key, max] of keys)
    if ((db.prepare('SELECT attempts FROM login_limits WHERE key=?').get(key)?.attempts ?? 0) >= max)
      return { status: 429 };
  // Reserve the attempt before the slow password check so parallel guesses cannot bypass the limit.
  for (const [key] of keys)
    db.prepare(
      'INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1, expires=excluded.expires',
    ).run(key, now + 15 * 60000);
  const admin = db.prepare('SELECT * FROM admins WHERE email=?').get(email);
  const valid = await verifyPassword(
    password,
    admin?.password_hash ?? '0'.repeat(32) + ':' + '0'.repeat(128),
  );
  if (!admin || !valid) return { status: 401 };
  db.prepare('DELETE FROM login_limits WHERE key=?').run(keys[1][0]);
  for (const [key] of [keys[0]])
    db.prepare('UPDATE login_limits SET attempts=MAX(attempts-1,0) WHERE key=?').run(key);
  db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), admin.id, now + 8 * 3600000);
  return { status: 200, token };
}
export function logout(db, cookie = '', name = 'cashtech_session') {
  const token = cookie
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + '='))
    ?.slice(name.length + 1);
  if (token) db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token));
}

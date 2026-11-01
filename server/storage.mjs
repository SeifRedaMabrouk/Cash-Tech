// Loaded dynamically so an old Node.js version gets a clear message instead of a cryptic import error.
let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  console.error(
    `Node.js ${process.versions.node} is too old: Cash Tech needs Node.js 24 or newer (built-in SQLite).\n` +
      `نسخة Node.js ${process.versions.node} قديمة: الموقع يحتاج Node.js 24 أو أحدث.`,
  );
  process.exit(1);
}
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
export function storage(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, 'cashtech.sqlite');
  const created = !existsSync(filename);
  const db = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  db.exec('CREATE TABLE IF NOT EXISTS schema_versions(version INTEGER PRIMARY KEY)');
  if (!db.prepare('SELECT version FROM schema_versions WHERE version=1').get()) {
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(new URL('../drizzle/0000_clammy_gressill.sql', import.meta.url), 'utf8'));
      db.exec('INSERT INTO schema_versions VALUES(1)');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  db.exec(
    `CREATE TABLE IF NOT EXISTS admins(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL);CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,admin_id TEXT NOT NULL REFERENCES admins(id),expires INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS login_limits(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires INTEGER NOT NULL);`,
  );
  function prepare(sql) {
    let args = [];
    const handle = {
      bind(...values) {
        args = values;
        return handle;
      },
      async first() {
        return db.prepare(sql).get(...args) ?? null;
      },
      async all() {
        return { results: db.prepare(sql).all(...args) };
      },
      runSync() {
        return { meta: { changes: Number(db.prepare(sql).run(...args).changes) }, success: true };
      },
      async run() {
        return handle.runSync();
      },
    };
    return handle;
  }
  const DB = {
    prepare,
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const r = [];
        for (const s of statements) r.push(s.runSync());
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  const uploads = path.join(directory, 'uploads');
  mkdirSync(uploads, { recursive: true, mode: 0o700 });
  const BUCKET = {
    async put(key, bytes) {
      if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(key)) throw new Error('Invalid key');
      writeFileSync(path.join(uploads, key), bytes, { mode: 0o600 });
    },
    async get(key) {
      if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(key)) return null;
      const p = path.join(uploads, key);
      if (!existsSync(p)) return null;
      return {
        body: new Uint8Array(readFileSync(p)),
        httpMetadata: {
          contentType: key.endsWith('.png')
            ? 'image/png'
            : key.endsWith('.jpg')
              ? 'image/jpeg'
              : 'image/webp',
        },
      };
    },
  };
  // Deletes uploaded images that no product references and that are older than maxAgeMs (abandoned or replaced uploads).
  function sweepUploads(maxAgeMs = 24 * 3600 * 1000) {
    const used = new Set();
    for (const row of db.prepare('SELECT images FROM products').all()) {
      try {
        for (const src of JSON.parse(row.images)) {
          const m = /^\/api\/media\/(.+)$/.exec(src);
          if (m) used.add(m[1]);
        }
      } catch {}
    }
    let removed = 0;
    const now = Date.now();
    for (const name of readdirSync(uploads)) {
      if (used.has(name) || !/^[a-f0-9-]+\.(png|jpg|webp)$/.test(name)) continue;
      const file = path.join(uploads, name);
      if (now - statSync(file).mtimeMs < maxAgeMs) continue;
      unlinkSync(file);
      removed++;
    }
    return removed;
  }
  return { db, DB, BUCKET, sweepUploads, created, close: () => db.close() };
}

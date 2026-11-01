// Consistent online backup: copies the SQLite database (safe while the server runs) and the uploads folder.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, cpSync, existsSync, readdirSync, rmSync, chmodSync } from 'node:fs';
import path from 'node:path';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const data = path.resolve(process.env.DATA_DIR ?? 'data');
const source = path.join(data, 'cashtech.sqlite');
if (!existsSync(source)) {
  console.error(`لا توجد قاعدة بيانات في ${data}`);
  process.exit(1);
}
const root = path.resolve(arg('out') ?? process.env.BACKUP_DIR ?? path.join(data, 'backups'));
const keep = Math.max(1, Number(arg('keep') ?? 14));
const dir = path.join(root, 'cashtech-' + new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(dir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(source);
try {
  db.exec('PRAGMA busy_timeout=5000');
  db.exec(`VACUUM INTO '${path.join(dir, 'cashtech.sqlite').replaceAll("'", "''")}'`);
} finally {
  db.close();
}
chmodSync(path.join(dir, 'cashtech.sqlite'), 0o600);
const uploads = path.join(data, 'uploads');
if (existsSync(uploads)) cpSync(uploads, path.join(dir, 'uploads'), { recursive: true });
const old = readdirSync(root)
  .filter((n) => /^cashtech-\d{4}-/.test(n))
  .sort()
  .slice(0, -keep);
for (const name of old) rmSync(path.join(root, name), { recursive: true, force: true });
console.log(`تم إنشاء النسخة الاحتياطية: ${dir}${old.length ? ` (حُذفت ${old.length} نسخة قديمة)` : ''}`);

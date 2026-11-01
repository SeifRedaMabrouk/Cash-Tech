// Clears login lockouts (e.g. after someone typed wrong passwords many times). Run on the server: npm run admin:unlock
import path from 'node:path';
import { storage } from './storage.mjs';
const store = storage(path.resolve(process.env.DATA_DIR ?? 'data'));
try {
  const n = Number(store.db.prepare('DELETE FROM login_limits').run().changes);
  console.log(`تم فك قفل الدخول (${n} سجل). Login lockouts cleared.`);
} finally {
  store.close();
}

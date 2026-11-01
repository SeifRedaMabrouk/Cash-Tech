import { storage } from './storage.mjs';
import { createAdmin } from './auth.mjs';
import path from 'node:path';
const email = process.argv.find((a) => a.startsWith('--email='))?.slice(8) ?? process.env.ADMIN_EMAIL;
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('اكتب بريد دخول الإدارة: npm run admin:create -- --email=admin-xxxx@example.com\nاستخدم بريدًا مختلفًا عن بريد التواصل الظاهر في الموقع.');
  process.exit(1);
}
const contact = process.env.CONTACT_EMAIL?.toLowerCase();
if (contact && email.toLowerCase() === contact)
  console.warn('تنبيه: هذا البريد ظاهر للعامة في صفحة التواصل. الأفضل استخدام بريد دخول مختلف.');
async function readPassword() {
  if (!process.stdin.isTTY) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    return input.replace(/\r?\n$/, '');
  }
  process.stdout.write('كلمة مرور الإدارة (يُنصح بـ ١٦ حرفًا أو أكثر وغير مستخدمة في أي مكان آخر، لن تظهر): ');
  return new Promise((resolve, reject) => {
    let result = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    function done() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', handler);
      process.stdout.write('\n');
    }
    function handler(chunk) {
      for (const char of chunk) {
        if (char === '\u0003') {
          done();
          reject(new Error('أُلغي'));
          return;
        }
        if (char === '\r' || char === '\n') {
          done();
          resolve(result);
          return;
        }
        if (char === '\u007f') {
          result = result.slice(0, -1);
        } else if (char >= ' ') result += char;
      }
    }
    process.stdin.on('data', handler);
  });
}
const store = storage(path.resolve(process.env.DATA_DIR ?? 'data'));
try {
  await createAdmin(store.db, email, await readPassword(), process.argv.includes('--reset'));
  console.log('تم حفظ حساب الإدارة بأمان.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  store.close();
}

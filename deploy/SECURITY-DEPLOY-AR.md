# دليل النشر الآمن (v3.8)

## الجديد في 3.8
- `docker-run.sh` بيجهّز فولدر الباكاب بصلاحيات المستخدم node (كان الباكاب هيفشل بـ permission denied). وبياخد إيميل التواصل كمعامل تاني اختياري.
- `harden-server.sh` بقى بيكتب ملف SSH باسم `00-...` عشان يتقرأ قبل `50-cloud-init.conf`، وبيتحقق بـ `sshd -T` ويفشل لو الدخول بالباسورد لسه شغال.
- `backup-cron.sh` بقى بيفشل بوضوح لو مفيش وجهة خارجية (`RCLONE_REMOTE` أو `RSYNC_TARGET`)، بدل ما يسكت. للنسخ المحلي بس عن قصد: `ALLOW_LOCAL_ONLY=1`.
- اتشالت بيانات شخصية من ملفات الاختبارات.

## (v3.7) 

## التعديلات اللي اتعملت في الكود
- الكوكي بقى اسمه `__Host-cashtech_session` لما الموقع شغال على https (على http المحلي بيفضل الاسم القديم لأن المتصفحات بترفض البادئة دي من غير https). **هيتطلب منك تسجيل دخول تاني مرة واحدة بعد التحديث.**
- اتشالت بياناتك الشخصية من القيم الافتراضية في `lib/domain.ts` (الإيميل بقى `info@example.com` وروابط السوشيال فاضية). الإعدادات المحفوظة عندك في قاعدة البيانات **ماتأثرتش**. لو قاعدة جديدة، اكتب بياناتك من لوحة الإدارة.
- `admin:create` بقى بيحذّر لو إيميل الإدارة هو نفس `CONTACT_EMAIL`، وبينصح بباسورد ١٦ حرف أو أكتر.
- أمثلة Docker في README بقت على `127.0.0.1:3000` مع `TRUST_PROXY=1` و`SEED_DEMO=0`.

## ملفات النشر الجديدة (فولدر deploy)
| الملف | بيعمل إيه |
|---|---|
| `env.production.example` | انسخه لـ `.env` وعدّل الدومين والمسارات |
| `docker-run.sh` | تشغيل الحاوية بالإعدادات الصح |
| `Caddyfile` | https + تحويل الـ IP للدومين + basicauth على الإدارة + rate limit |
| `harden-server.sh` | Firewall + SSH بمفتاح بس + unattended-upgrades + fail2ban |
| `backup-cron.sh` | باكاب يومي ونسخه لمكان تاني |

## الخطوات بالترتيب
1. ضيف مفتاح SSH (`ssh-copy-id user@server`) وجرّب تدخل بيه، وبعدين `sudo ./deploy/harden-server.sh`.
2. `./deploy/docker-run.sh https://your-domain.com`
3. `docker exec -it cashtech npm run admin:create -- --email=إيميل-مختلف-عن-التواصل` بباسورد ١٦+ حرف.
4. `caddy hash-password` وحط الناتج في `Caddyfile` مكان `REPLACE...`، وغيّر `your-domain.com`. لو هتستخدم rate_limit ابني Caddy بـ xcaddy (مكتوب في أول الملف)، أو بدلها استخدم Cloudflare Rate Limiting + Cloudflare Access.
5. لو قاعدة قديمة فيها منتجات تجريبية: امسحها من لوحة الإدارة.
6. ضيف `backup-cron.sh` في crontab واضبط نسخة بره السيرفر.
7. **جرّب الاستعادة مرة:** وقّف الحاوية، انسخ `cashtech.sqlite` وفولدر `uploads` من أحدث باكاب لفولدر data تجريبي، شغّل عليه نسخة على منفذ تاني (`DATA_DIR=/tmp/restore-test PORT=3001 npm start`) واتأكد إن المنتجات موجودة.

## قبل ما تفتح للناس
- `npm test` و`npm run typecheck` و`npm audit --omit=dev`.
- ادخل بباسورد غلط ١١ مرة → لازم يتقفل، و`npm run admin:unlock` يفكه.
- افتح `http://IP-السيرفر` → لازم يتحول لـ `https://your-domain.com`.
- سجّل خروج وارجع لـ `/admin` → لازم يطلب دخول.
- اتأكد إن `.env` وفولدر `data` مش مرفوعين على GitHub (`git status` / `.gitignore`).

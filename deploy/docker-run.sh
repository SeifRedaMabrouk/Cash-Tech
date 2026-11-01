#!/usr/bin/env bash
# تشغيل الحاوية: المنفذ 3000 مربوط على 127.0.0.1 بس (Caddy قدامه)، والثقة في البروكسي مفعّلة.
set -euo pipefail
DOMAIN="${1:?اكتب الدومين: ./docker-run.sh https://your-domain.com [info@your-domain.com]}"
CONTACT="${2:-}"   # إيميل التواصل الظاهر للزوار (اختياري): للتحذير لو استخدمته كإيميل إدارة
# الحاوية بتشتغل بمستخدم node (uid 1000)، فلازم فولدر الباكاب يكون ملكه، وإلا الباكاب هيفشل بـ permission denied.
SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"
$SUDO mkdir -p /srv/cashtech/backups
$SUDO chown 1000:1000 /srv/cashtech/backups
$SUDO chmod 700 /srv/cashtech/backups
docker build -t cashtech .
docker rm -f cashtech 2>/dev/null || true
docker run -d --name cashtech --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e APP_ORIGIN="$DOMAIN" -e TRUST_PROXY=1 -e SEED_DEMO=0 -e CONTACT_EMAIL="$CONTACT" \
  -v cashtech-data:/app/data -v /srv/cashtech/backups:/app/backups -e BACKUP_DIR=/app/backups \
  cashtech
echo "اعمل حساب الإدارة: docker exec -it cashtech npm run admin:create -- --email=admin-xxxx@example.com"

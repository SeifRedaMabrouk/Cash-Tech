#!/usr/bin/env bash
# باكاب يومي + نسخة بره السيرفر. ضيفه في crontab (حط المتغيرات في أول crontab):
#   RCLONE_REMOTE=remote:cashtech-backups      # أو: RSYNC_TARGET=user@backup-host:/path/cashtech-backups/
#   15 3 * * * /srv/cashtech/app/deploy/backup-cron.sh >> /var/log/cashtech-backup.log 2>&1
# لو مفيش وجهة خارجية السكربت بيفشل بصوت عالي (exit 1) عشان ماتفتكرش إن عندك نسخة بره السيرفر.
# لو عايز نسخة محلية بس عن قصد: ALLOW_LOCAL_ONLY=1
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUPS="${BACKUP_DIR:-/srv/cashtech/backups}"
if docker ps --format '{{.Names}}' | grep -qx cashtech; then
  docker exec cashtech npm run backup
else
  npm run backup
fi
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null; then
  rclone sync "$BACKUPS" "$RCLONE_REMOTE"
  echo "تم نسخ الباكاب إلى $RCLONE_REMOTE"
elif [ -n "${RSYNC_TARGET:-}" ] && command -v rsync >/dev/null; then
  rsync -a --delete "$BACKUPS"/ "$RSYNC_TARGET"
  echo "تم نسخ الباكاب إلى $RSYNC_TARGET"
elif [ "${ALLOW_LOCAL_ONLY:-0}" = "1" ]; then
  echo "تحذير: النسخة محلية فقط (ALLOW_LOCAL_ONLY=1)." >&2
else
  echo "خطأ: الباكاب اتعمل محليًا بس، ومفيش وجهة خارج السيرفر. اضبط RCLONE_REMOTE أو RSYNC_TARGET (وتأكد إن rclone/rsync متسطّب)." >&2
  exit 1
fi

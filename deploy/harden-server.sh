#!/usr/bin/env bash
# تقوية سيرفر Ubuntu/Debian. شغّله بـ sudo **بعد** ما تتأكد إن دخولك بمفتاح SSH شغال، وإلا هتقفل نفسك بره.
set -euo pipefail
if [ ! -s "${SUDO_USER:+/home/$SUDO_USER}/.ssh/authorized_keys" ] && [ ! -s /root/.ssh/authorized_keys ]; then
  echo "مفيش مفتاح SSH متضاف. ضيف مفتاحك الأول (ssh-copy-id) وبعدين شغّل السكربت." >&2; exit 1
fi
apt-get update
apt-get install -y ufw fail2ban unattended-upgrades
# Firewall: 22 و80 و443 بس
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
# SSH بمفتاح بس، ومن غير root
cat > /etc/ssh/sshd_config.d/00-cashtech-hardening.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
CONF
sshd -t && (systemctl reload ssh || systemctl reload sshd)
# تأكيد إن الإعدادات الفعلية اشتغلت (ملفات تانية زي 50-cloud-init.conf ممكن تكون بتعارضها)
EFFECTIVE="$(sshd -T)"
echo "$EFFECTIVE" | grep -E '^(passwordauthentication|permitrootlogin|kbdinteractiveauthentication) ' || true
if echo "$EFFECTIVE" | grep -qE '^(passwordauthentication|permitrootlogin|kbdinteractiveauthentication) (yes|without-password|prohibit-password)'; then
  echo "تحذير: SSH لسه بيقبل دخول بالباسورد أو root. راجع الملفات في /etc/ssh/sshd_config.d/ وعدّلها يدويًا." >&2
  exit 1
fi
# تحديثات أمنية أوتوماتيك
dpkg-reconfigure -f noninteractive unattended-upgrades
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
# fail2ban لـ SSH
cat > /etc/fail2ban/jail.d/sshd.local <<'CONF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
CONF
systemctl enable --now fail2ban
systemctl restart fail2ban
echo "على Oracle Cloud: لازم كمان تفتح 80 و443 من Security List في لوحة Oracle، وممكن تحتاج تعدّل قواعد iptables الافتراضية في الصورة (/etc/iptables/rules.v4)."
echo "تم. تنبيه: Docker بيتخطى ufw للمنافذ المنشورة، عشان كده لازم -p 127.0.0.1:3000:3000."

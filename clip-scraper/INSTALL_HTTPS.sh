#!/bin/bash
# ============================================================================
# ClipScraper - Etape 2 : HTTPS via Caddy
# A coller dans le BROWSER TERMINAL Hostinger APRES INSTALL_VPS.sh
# Utilise le hostname Hostinger srv1619447.hstgr.cloud (pas de DNS a configurer)
# ============================================================================

set -e

DOMAIN="srv1619447.hstgr.cloud"

echo "[..] Installation Caddy pour HTTPS..."
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl > /dev/null 2>&1
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
apt update > /dev/null 2>&1
apt install -y caddy > /dev/null 2>&1

cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
    reverse_proxy localhost:8001
}
EOF

systemctl reload caddy
echo "[..] Attente certificat HTTPS (30s)..."
sleep 30

HEALTH=$(curl -s https://${DOMAIN}/health || echo "FAIL")
if [[ "$HEALTH" == *"\"status\":\"ok\""* ]]; then
    echo ""
    echo "============================================================"
    echo "  [OK] HTTPS configure et fonctionnel !"
    echo "============================================================"
    echo ""
    echo "  URL publique : https://${DOMAIN}"
    echo "  Cle API : cd-prod-ac29858a696cf2c1a642dd1c9f607628fcd8b0878cc3c704"
    echo ""
    echo "  Etape suivante : Railway"
    echo "    - CLIP_SCRAPER_URL = https://${DOMAIN}"
    echo "    - CLIP_SCRAPER_KEY = cd-prod-ac29858a696cf2c1a642dd1c9f607628fcd8b0878cc3c704"
    echo ""
else
    echo ""
    echo "[ERREUR] HTTPS ne repond pas. Logs Caddy :"
    journalctl -u caddy --no-pager -n 30
fi

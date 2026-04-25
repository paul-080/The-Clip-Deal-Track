#!/bin/bash
# Script de déploiement automatique du clip-scraper sur un VPS Ubuntu 22.04 / 24.04.
# À lancer en root sur un VPS fraichement créé.
# Usage : curl -fsSL https://raw.githubusercontent.com/paul-080/The-Clip-Deal-Track/main/clip-scraper/deploy-vps.sh | bash

set -e
echo "🚀 ClipScraper — Déploiement automatique"
echo ""

# ── 1. Installer Docker ──────────────────────────────────────
echo "📦 Installation Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
fi

# ── 2. Cloner le repo ────────────────────────────────────────
echo "📥 Clone du repo..."
cd /opt
if [ ! -d "The-Clip-Deal-Track" ]; then
    git clone https://github.com/paul-080/The-Clip-Deal-Track.git
fi
cd /opt/The-Clip-Deal-Track
git pull
cd clip-scraper

# ── 3. Configurer .env ───────────────────────────────────────
if [ ! -f ".env" ]; then
    echo ""
    echo "🔑 Configuration .env"
    echo "Copie depuis .env.example et configure :"
    cp .env.example .env

    # Génère une API key aléatoire si pas déjà fournie
    RAND_KEY="cd-$(openssl rand -hex 16)"
    sed -i "s|API_KEYS=demo-key-change-me|API_KEYS=$RAND_KEY|" .env

    echo ""
    echo "  ⚠️  Edite le fichier maintenant pour ajouter :"
    echo "     - YOUTUBE_API_KEY=...   (optionnel)"
    echo "     - INSTAGRAM_SESSION_ID=...   (optionnel mais recommandé)"
    echo ""
    echo "  Ta clé API GENEREE pour ce serveur :"
    echo "     ${RAND_KEY}"
    echo ""
    echo "  Note-la : tu en auras besoin pour configurer Railway"
    echo ""
    read -p "Appuie sur Entrée quand prêt à continuer (ou Ctrl-C pour éditer .env d'abord)..."
fi

# ── 4. Build et démarrer ─────────────────────────────────────
echo ""
echo "🐳 Build Docker..."
docker compose up -d --build

echo ""
echo "⏳ Attente démarrage (Playwright a besoin de quelques sec)..."
sleep 15

# ── 5. Test santé ────────────────────────────────────────────
echo ""
echo "🩺 Test santé du service..."
HEALTH=$(curl -s http://localhost:8001/health || echo "")
if [[ "$HEALTH" == *"ok"* ]]; then
    echo "✅ Service UP : $HEALTH"
else
    echo "❌ Service ne répond pas. Logs :"
    docker logs clip-scraper --tail 50
    exit 1
fi

# ── 6. Installer Caddy pour HTTPS ────────────────────────────
echo ""
read -p "🌐 Veux-tu configurer HTTPS avec un domaine ? (laisse vide pour sauter, ou tape ton domaine ex: scraper.theclipdealtrack.com) : " DOMAIN

if [ -n "$DOMAIN" ]; then
    echo "📦 Installation Caddy (HTTPS auto)..."
    apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt update
    apt install -y caddy

    cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
    reverse_proxy localhost:8001
}
EOF
    systemctl reload caddy
    echo "✅ HTTPS configuré sur https://${DOMAIN}"
    echo "   ⚠️  Vérifie que ${DOMAIN} pointe vers cette IP dans ton DNS (OVH/Cloudflare)"
fi

# ── 7. Récap ─────────────────────────────────────────────────
echo ""
echo "🎉 ============================================"
echo "🎉 Déploiement terminé !"
echo "🎉 ============================================"
echo ""
echo "🔑 Ta clé API (à ajouter dans Railway) :"
grep "^API_KEYS=" .env | head -1 | cut -d'=' -f2
echo ""
echo "🌐 URL du service :"
if [ -n "$DOMAIN" ]; then
    echo "   https://${DOMAIN}"
else
    PUBLIC_IP=$(curl -s ifconfig.me)
    echo "   http://${PUBLIC_IP}:8001 (HTTP, pas HTTPS — exposé directement)"
fi
echo ""
echo "📋 Prochaines étapes :"
echo "  1. Va sur Railway → ton service backend → Variables"
echo "  2. Ajoute :"
echo "       CLIP_SCRAPER_URL = (URL ci-dessus)"
echo "       CLIP_SCRAPER_KEY = (clé ci-dessus)"
echo "  3. Railway va redéployer auto"
echo "  4. Va sur theclipdealtrack.com → Admin → API Status pour vérifier"
echo ""
echo "🛠  Commandes utiles :"
echo "  docker logs clip-scraper -f         # Voir les logs"
echo "  docker compose restart              # Redémarrer"
echo "  cd /opt/The-Clip-Deal-Track && git pull && cd clip-scraper && docker compose up -d --build   # Update"
echo ""

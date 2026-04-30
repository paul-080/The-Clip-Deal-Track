#!/bin/bash
# Script de redéploiement du ClipScraper sur le VPS Hostinger
# Usage : sur le VPS, lance ce script pour avoir la derniere version (avec Instagram + TikTok + YouTube)
#
# 1. SSH sur le VPS : ssh root@TON_IP_VPS
# 2. cd /root/clip-scraper (ou le chemin où le code est)
# 3. bash REDEPLOY_VPS.sh

set -e

echo "🔄 ClipScraper VPS — Redéploiement"
echo "===================================="

# 1. Pull la derniere version du code
if [ -d ".git" ]; then
  echo "📥 Pull du code GitHub..."
  git pull origin main || { echo "❌ git pull a échoué — vérifie ton accès"; exit 1; }
else
  echo "⚠️  Pas de .git — copier manuellement les fichiers depuis GitHub :"
  echo "   curl -L https://github.com/paul-080/The-Clip-Deal-Track/raw/main/clip-scraper/scrapers/instagram.py -o scrapers/instagram.py"
  echo "   curl -L https://github.com/paul-080/The-Clip-Deal-Track/raw/main/clip-scraper/scrapers/tiktok.py -o scrapers/tiktok.py"
  echo "   curl -L https://github.com/paul-080/The-Clip-Deal-Track/raw/main/clip-scraper/scrapers/youtube.py -o scrapers/youtube.py"
  echo "   curl -L https://github.com/paul-080/The-Clip-Deal-Track/raw/main/clip-scraper/main.py -o main.py"
  echo ""
  read -p "Faire les curl maintenant ? (y/n) : " do_curl
  if [ "$do_curl" = "y" ]; then
    BASE="https://github.com/paul-080/The-Clip-Deal-Track/raw/main/clip-scraper"
    mkdir -p scrapers
    curl -fsSL "$BASE/main.py" -o main.py
    curl -fsSL "$BASE/cache.py" -o cache.py
    curl -fsSL "$BASE/requirements.txt" -o requirements.txt
    curl -fsSL "$BASE/scrapers/__init__.py" -o scrapers/__init__.py
    curl -fsSL "$BASE/scrapers/tiktok.py" -o scrapers/tiktok.py
    curl -fsSL "$BASE/scrapers/instagram.py" -o scrapers/instagram.py
    curl -fsSL "$BASE/scrapers/youtube.py" -o scrapers/youtube.py
    echo "✅ Fichiers téléchargés"
  fi
fi

# 2. Restart Docker (si docker-compose) ou restart service
if [ -f "docker-compose.yml" ]; then
  echo "🐳 Restart Docker container..."
  docker compose down || docker-compose down
  docker compose up -d --build || docker-compose up -d --build
  echo "✅ Container redémarré"
elif systemctl list-units --full -all | grep -q "clipscraper.service"; then
  echo "🔄 Restart systemd service..."
  systemctl restart clipscraper
  echo "✅ Service redémarré"
else
  echo "⚠️  Pas de docker-compose ni systemd détecté."
  echo "   Tue le process en cours et relance manuellement :"
  echo "   pkill -f 'uvicorn main:app'"
  echo "   nohup uvicorn main:app --host 0.0.0.0 --port 8001 &"
fi

# 3. Test rapide
sleep 3
echo ""
echo "🧪 Test rapide :"
curl -fsS http://localhost:8001/health 2>&1 | head -10 || echo "⚠️  Service pas encore up — réessaie dans 10s"

echo ""
echo "✅ Redéploiement terminé."
echo "💡 Vérifie les logs : docker compose logs -f  (ou journalctl -u clipscraper -f)"
echo "💡 Test Instagram : curl -X POST 'http://localhost:8001/v1/instagram/cristiano' -H 'X-API-Key: TA_CLE'"

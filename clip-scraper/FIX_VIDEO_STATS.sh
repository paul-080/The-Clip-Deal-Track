#!/bin/bash
# Patch scraper VPS pour ajouter endpoint /v1/video-stats (utilise yt-dlp + proxy webshare)
# Telecharge directement depuis GitHub (commit ed6c535 deja push)
set -e
cd /opt/clip-scraper

echo "============================================================"
echo "  FIX VIDEO-STATS - patch scraper pour single video"
echo "============================================================"

# 1. Telecharger nouveau main.py depuis GitHub raw
echo "[1/5] Telechargement nouveau main.py..."
wget -q -O /tmp/main_new.py "https://raw.githubusercontent.com/paul-080/The-Clip-Deal-Track/main/clip-scraper/main.py"
SIZE=$(wc -c < /tmp/main_new.py)
if [ "$SIZE" -lt 5000 ]; then
    echo "[ERREUR] main.py telecharge trop petit ($SIZE octets) — abort"
    head -5 /tmp/main_new.py
    exit 1
fi
echo "[OK] main.py telecharge ($SIZE octets)"

# 2. Sauvegarde + remplacement
cp /opt/clip-scraper/main.py /opt/clip-scraper/main.py.bak
cp /tmp/main_new.py /opt/clip-scraper/main.py
echo "[2/5] main.py remplace sur l'hote"

# 3. Verifier que yt-dlp est installe (sinon l'installer)
echo "[3/5] Verification yt-dlp dans container..."
if ! docker exec clip-scraper python -c "import yt_dlp" 2>/dev/null; then
    echo "  yt-dlp absent, installation..."
    docker exec clip-scraper pip install --quiet yt-dlp
fi
echo "[OK] yt-dlp present"

# 4. Copier dans container + restart
echo "[4/5] docker cp + restart..."
docker cp /opt/clip-scraper/main.py clip-scraper:/app/main.py
docker compose restart
sleep 20

# 5. Tester /v1/video-stats avec une vidéo Insta publique
echo ""
echo "[5/5] TEST endpoint /v1/video-stats..."
curl -s -X POST "http://localhost:8001/v1/video-stats" \
  -H "X-API-Key: cd-prod-ac29858a696cf2c1a642dd1c9f607628fcd8b0878cc3c704" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.instagram.com/p/C8x9MZ4N6mF/"}' \
  --max-time 90 | head -c 800
echo ""
echo ""
echo "[LOGS]"
docker logs clip-scraper --tail 10 2>&1 | tail -10

echo ""
echo "============================================================"
echo "Si test final renvoie views: > 0 = OK !"
echo "Sinon Insta a peut-etre change l'URL exemple — testez avec une URL Insta a vous"
echo "============================================================"

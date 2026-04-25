# 🚀 ClipScraper — Démarrage en 10 minutes

## Ce que tu vas faire

Lancer ton propre service de scraping TikTok+Insta+YouTube qui remplace Apify. Économie : ~70-80% sur ta facture Apify.

---

## ÉTAPE 1 — Lancement local sur ton PC (5 min, gratuit)

### Prérequis Windows
- Python 3.11+ (https://python.org)
- ~5 GB RAM libre

### Commandes
Ouvre **PowerShell** :
```powershell
cd "C:\Users\paula\OneDrive\Attachments\Clipping\The-Clip-Deal-main\clip-scraper"
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m playwright install chromium
copy .env.example .env
notepad .env
```

Dans `.env`, remplace :
- `API_KEYS=demo-key-change-me` → mets une clé secrète à toi (32 chars random, ex: `clip-deal-prod-XYZ123abc456...`)
- `YOUTUBE_API_KEY=` → mets ta clé YouTube (la même que dans ton backend)
- `INSTAGRAM_SESSION_ID=` → optionnel, à mettre si tu veux scraper Insta sans Apify (cookie Chrome)

Sauvegarde, puis :
```powershell
python main.py
```

→ Service tourne sur `http://localhost:8001`. Test : ouvre http://localhost:8001/health dans ton navigateur.

---

## ÉTAPE 2 — Test direct
```powershell
# Dans une autre PowerShell
$key = "ta-cle-api-secrete"
Invoke-RestMethod -Method Post -Uri "http://localhost:8001/v1/tiktok/khaby.lame?max_videos=5" -Headers @{"X-API-Key"=$key}
```

Tu dois voir un JSON avec profile + 5 vidéos.

---

## ÉTAPE 3 — Connecter à ton backend Railway

Va sur Railway → ton service backend → Variables → ajoute :

| Variable | Valeur |
|---|---|
| `CLIP_SCRAPER_URL` | `http://TON_IP_PUBLIQUE:8001` (ou via tunnel ngrok pour test) |
| `CLIP_SCRAPER_KEY` | la même clé que dans `.env` du scraper |

⚠️ Pour utiliser ton PC local depuis Railway, il te faut soit :
- **ngrok** (gratuit pour tester) : `ngrok http 8001` → te donne une URL publique HTTPS temporaire
- **Cloudflare Tunnel** (gratuit, plus stable)
- **Un VPS** (recommandé pour la prod, voir Étape 4)

---

## ÉTAPE 4 — Passage en production : VPS Hetzner (10 min, €4/mois)

### Création du VPS
1. Crée un compte sur https://hetzner.cloud (carte bancaire requise)
2. New Project → Add Server :
   - Location : **Falkenstein** (Allemagne, IP propre, marche bien pour TikTok FR/EU)
   - Image : Ubuntu 22.04
   - Type : **CX22** (€4.51/mois — 2 vCPU, 4 GB RAM)
   - SSH key : ajoute ta clé OU utilise un mot de passe (envoyé par mail)
3. Clique "Create & Buy now"

### Déploiement (sur le VPS via SSH)
```bash
ssh root@<IP_DU_VPS>

# Installer Docker
curl -fsSL https://get.docker.com | sh

# Cloner ton repo
git clone https://github.com/paul-080/The-Clip-Deal-Track.git
cd The-Clip-Deal-Track/clip-scraper

# Configurer .env
cp .env.example .env
nano .env  # remplir API_KEYS, YOUTUBE_API_KEY, INSTAGRAM_SESSION_ID

# Lancer
docker compose up -d --build

# Vérifier
docker logs clip-scraper -f
curl http://localhost:8001/health
```

### Exposer sur internet avec HTTPS (Caddy)
```bash
# Installer Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# Config Caddy → reverse proxy avec HTTPS auto
cat > /etc/caddy/Caddyfile <<EOF
scraper.theclipdealtrack.com {
    reverse_proxy localhost:8001
}
EOF

systemctl reload caddy
```

⚠️ Avant ça, dans OVH (ton DNS) : ajouter un enregistrement A pour `scraper.theclipdealtrack.com` → IP du VPS.

### Mettre à jour Railway
Variables Railway :
- `CLIP_SCRAPER_URL` = `https://scraper.theclipdealtrack.com`
- `CLIP_SCRAPER_KEY` = ta clé secrète

→ Ton backend Railway appelle maintenant ton scraper avant Apify. Économie immédiate.

---

## Capacité actuelle (sans proxy)

| Configuration | Clippeurs trackés en parallèle (6h) | Coût |
|---|---|---|
| **PC local** | ~50-100 | 0€ (mais PC allumé) |
| **VPS Hetzner CX22** | ~150-300 | **€5/mois** |
| **VPS Hetzner CX32 (8 GB)** | ~400-700 | **€8/mois** |
| **3 VPS load-balancés + proxy résidentiel** | ~2000-3000 | **~€500/mois** |

---

## Quand TikTok/Insta commencent à bloquer ton IP

Symptôme : erreurs 429 ou 403 dans les logs `docker logs clip-scraper`.

Solution : ajouter un proxy résidentiel.

1. Crée un compte sur https://iproyal.com (le moins cher pour démarrer)
2. Achète **Residential Proxies** : ~$7/GB pay-as-you-go
3. Récupère l'URL : `http://login:pass@residential.iproyal.com:port`
4. Sur ton VPS, édite `.env` :
   ```
   PROXY_URL=http://login:pass@residential.iproyal.com:port
   ```
5. `docker compose restart`

Ça te coûtera ~$50-150/mois selon le volume.

---

## Coûts récap pour 100-200 clippeurs

| Item | Coût/mois |
|---|---|
| VPS Hetzner CX22 | **€5** |
| Domaine (déjà acheté) | 0 |
| YouTube API | 0 (gratuit) |
| Pas de proxy au démarrage | 0 |
| **TOTAL** | **€5/mois** |

Vs Apify pour 200 clippeurs : ~$80/mois. **Économie : €70/mois**.

À 1000 clippeurs : économie ~€450/mois. À 3000 : économie ~€1500/mois.

---

## Si tu veux le revendre comme API publique plus tard

Phase 2 (~1 semaine de dev) :
- Inscription publique + génération clé API auto
- Stripe billing par abonnement
- Page de pricing publique
- Documentation OpenAPI/Swagger (déjà générée auto par FastAPI : `/docs`)
- Limites par plan (free 100 req/jour, pro 10k req/jour, etc.)

Quand tu seras prêt, dis-le-moi.

---

## Aide / Bugs

- Logs : `docker logs clip-scraper -f`
- Restart : `docker compose restart`
- Update code : `git pull && docker compose up -d --build`
- Healthcheck : `curl http://localhost:8001/health`

🟢 **Tout est prêt. Tu peux lancer maintenant.**

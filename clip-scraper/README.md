# ClipScraper API

Scraping TikTok / Instagram / YouTube — alternative économique à Apify, taillée pour theclipdealtrack.com mais utilisable comme API standalone (potentiellement revendable).

## Endpoints

| Méthode | URL | Réponse |
|---|---|---|
| GET  | `/health` | Status du service |
| POST | `/v1/tiktok/{username}?max_videos=30` | Profil + vidéos TikTok |
| POST | `/v1/instagram/{username}?max_videos=30` | Profil + reels Insta |
| POST | `/v1/youtube/{username}?max_videos=30` | Profil + vidéos YouTube |
| GET  | `/v1/usage` | Stats d'utilisation de TA clé API |

**Auth** : Header `X-API-Key: <ta-clé>` obligatoire (sauf `/health`).

### Exemple d'appel
```bash
curl -X POST "http://localhost:8001/v1/tiktok/khaby.lame?max_videos=10" \
  -H "X-API-Key: demo-key-change-me"
```

### Exemple de réponse
```json
{
  "username": "khaby.lame",
  "platform": "tiktok",
  "profile": {
    "nickname": "Khaby Lame",
    "follower_count": 162000000,
    "video_count": 1234,
    "verified": true
  },
  "videos": [
    {
      "platform_video_id": "7234...",
      "url": "https://www.tiktok.com/@khaby.lame/video/7234...",
      "title": "...",
      "views": 6100000,
      "likes": 540000,
      "comments": 12000,
      "published_at": "2026-04-20T..."
    }
  ],
  "_cached": false
}
```

---

## Déploiement (3 options selon ton stade)

### 🏠 Option 1 — Local sur ton PC (gratuit, démarrage immédiat)

**Prérequis** : Python 3.11+, ~5 GB RAM libre.

```bash
cd clip-scraper
cp .env.example .env
# Édite .env : remplace API_KEYS par tes vraies clés, ajoute YOUTUBE_API_KEY
pip install -r requirements.txt
playwright install chromium
python main.py
```

Service dispo sur `http://localhost:8001`. Marche tant que ton PC est allumé.

**Capacité** : ~50-100 clippeurs trackés toutes les 6h.

---

### 🐳 Option 2 — VPS avec Docker (recommandé, ~$5-20/mois)

**Recommandation VPS** : **Hetzner CX22** (€4/mois, 2 vCPU, 4 GB RAM, Allemagne) — IP propre, marche très bien pour TikTok/Insta.

```bash
# Sur le VPS
git clone <ton-repo>
cd clip-scraper
cp .env.example .env
nano .env  # configurer
docker compose up -d
```

Reverse proxy avec Caddy/Nginx pour HTTPS. Domaine recommandé : `scraper-api.theclipdealtrack.com`.

**Capacité** : ~200-500 clippeurs toutes les 6h (1 VPS).

---

### 🚀 Option 3 — Scaling 1000-3000 clippeurs (production)

**Architecture distribuée** :

```
[Load Balancer Caddy/Nginx]
        |
   ┌────┼────┐
   v    v    v
 [VPS1][VPS2][VPS3]   ← 3-5 VPS Hetzner (€20/mois total)
   chacun = clip-scraper
        |
   [Redis cache]      ← partagé entre VPS, $5/mois (Upstash gratuit aussi)
        |
   [Proxy résidentiel rotatif]  ← Bright Data / Soax (~$300-500/mois)
```

**Étapes** :
1. Remplacer `cache.py` par un client Redis (10 lignes à changer)
2. Mettre toutes les VPS derrière Caddy load balancer (round-robin)
3. Activer `PROXY_URL` avec endpoint rotatif Bright Data

**Coût estimé** : $400-800/mois pour 3000 clippeurs (vs $24 000/mois Apify).

---

## Connecter à theclipdealtrack.com

Dans `backend/server.py`, remplacer les appels Apify par ton API :

```python
CLIP_SCRAPER_URL = os.environ.get("CLIP_SCRAPER_URL", "http://localhost:8001")
CLIP_SCRAPER_KEY = os.environ.get("CLIP_SCRAPER_KEY", "...")

async def _fetch_tiktok_videos_clipscraper(username: str, max_posts: int = 30) -> list:
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            f"{CLIP_SCRAPER_URL}/v1/tiktok/{username}?max_videos={max_posts}",
            headers={"X-API-Key": CLIP_SCRAPER_KEY},
        )
        if r.status_code != 200:
            raise RuntimeError(f"ClipScraper TikTok HTTP {r.status_code}: {r.text[:200]}")
        return r.json().get("videos", [])
```

Puis priorité dans `_fetch_tiktok_videos` : `clipscraper → apify (fallback) → tikwm/playwright`.

---

## Vendre comme API publique

Phase 2 (~1 semaine de dev en plus) :
- Page de pricing sur scraper-api.theclipdealtrack.com
- Inscription utilisateur + génération de clés API
- Paiement Stripe par abonnement (49€/mois pour 10k req/mois, 199€ pour 50k, etc.)
- Documentation publique
- Dashboard utilisateur

⚠️ **Note légale** : TikTok/Instagram interdisent le scraping dans leurs CGU. Risque mineur pour usage personnel, plus élevé si tu vends. Recommandé : avocat 1h pour valider tes CGU.

---

## Anti-blocage TikTok/Insta

| Symptôme | Solution |
|---|---|
| HTTP 429 (rate limit) | Augmenter cache TTL, baisser RATE_LIMIT_PER_HOUR |
| HTTP 403 / vide | Activer un proxy résidentiel (PROXY_URL) |
| Playwright timeout | Augmenter le délai dans tiktok.py / instagram.py |
| IP bannie complètement | Changer de VPS OU activer proxy rotatif |

**Proxy résidentiel recommandé** :
- **IPRoyal** : pay-as-you-go, $0.80/GB, idéal pour démarrer
- **Bright Data** : $300/mois pour 50 GB, le plus fiable
- **Soax** : $99/mois pour 8 GB, moyen de gamme

---

## Maintenance

- **TikTok change son API** ~1x/mois → adapter `tiktok.py`
- **Instagram change ses cookies** ~1x/2 mois → renouveler `INSTAGRAM_SESSION_ID`
- **Playwright se met à jour** → `pip install -U playwright && playwright install chromium`

Logs : `docker logs clip-scraper -f` ou stdout en local.

---

## Tarif comparé à Apify (pour mémoire)

| Volume | Apify pay-per-use | ClipScraper VPS+proxy |
|---|---|---|
| 100 clippeurs | $35/mois | $5 (VPS seul) |
| 500 clippeurs | $200/mois | $25 (VPS+petit proxy) |
| 1500 clippeurs | $620/mois | $400 (VPS+proxy pro) |
| 3000 clippeurs | $1240/mois | $700 (3 VPS+proxy pro) |
| 10000 clippeurs | $4140/mois | $1500 (5 VPS+proxy entreprise) |

**Économie : 60-80% à grande échelle.**

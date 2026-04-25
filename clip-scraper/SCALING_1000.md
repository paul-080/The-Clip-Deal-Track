# 🚀 Scaling — 1000 clippeurs / 3 posts/jour

## Architecture cible

```
                  [Backend Railway]
                         |
                         v
              ┌─────────────────────┐
              │  Caddy Load Balancer │  ← VPS principal CX22 (€5/mois)
              │  scraper.theclipdealtrack.com
              └──────────┬──────────┘
                         │ round-robin
        ┌────────┬───────┼───────┬────────┐
        v        v       v       v        v
     [VPS1]  [VPS2]  [VPS3]  [VPS4]   ← 4 workers CX32 8GB (4 × €8 = €32)
                         │
                         v
                ┌────────────────┐
                │  Redis cache   │  ← Upstash gratuit OU DO Managed €15
                └────────────────┘
                         │
                         v
              ┌──────────────────────┐
              │ Proxy résidentiel     │  ← IPRoyal pay-as-you-go ~€80
              │ (rotatif global)      │
              └──────────────────────┘
```

**Coût total : €5 (LB) + €32 (4 workers) + €15 (Redis) + €80 (proxy) = ~€132/mois**

vs Apify pour 1000 clippeurs × 3 posts/jour : ~$620/mois = **€570/mois**

→ **Économie €438/mois.**

---

## Étapes de déploiement

### 1. Créer le compte Hetzner
- Compte sur https://hetzner.cloud (CB requise)
- Crée un projet "ClipScraper"

### 2. Créer 5 VPS d'un coup

Dans Hetzner → New Server → quantité = 5 :
- **1 LB** : CX22 (€4.51/mois) — Falkenstein
- **4 workers** : CX32 (€8.21/mois × 4) — répartis sur Falkenstein, Nuremberg, Hillsboro pour avoir des IPs variées

Total = €37 environ.

### 3. Configurer Redis (Upstash, gratuit)

- Compte sur https://upstash.com
- Create Database → Redis → Region Frankfurt
- Copie l'URL `redis://default:xxx@xxx.upstash.io:port`

### 4. Acheter du proxy résidentiel (optionnel au début)

- https://iproyal.com → Residential Proxies
- Pack pay-as-you-go : ~$80 pour 10 GB
- Récupère l'URL `http://login:pass@residential.iproyal.com:12321`

### 5. Déployer sur les 4 workers

Sur chacun des 4 VPS workers :
```bash
ssh root@<IP_WORKER>
curl -fsSL https://raw.githubusercontent.com/paul-080/The-Clip-Deal-Track/main/clip-scraper/deploy-vps.sh | bash
```

Édite `.env` sur chaque worker avec :
```
API_KEYS=<même clé partout>
REDIS_URL=redis://default:xxx@xxx.upstash.io:port
PROXY_URL=http://login:pass@residential.iproyal.com:12321
MAX_CONCURRENT_SCRAPES=8
YOUTUBE_API_KEY=<ta clé>
```

Puis `docker compose restart`.

### 6. Configurer le LB sur le VPS principal

```bash
ssh root@<IP_LB>
apt install -y caddy

cat > /etc/caddy/Caddyfile <<EOF
scraper.theclipdealtrack.com {
    reverse_proxy {
        to <IP_WORKER1>:8001 <IP_WORKER2>:8001 <IP_WORKER3>:8001 <IP_WORKER4>:8001
        lb_policy round_robin
        lb_try_duration 5s
        health_uri /health
        health_interval 30s
    }
}
EOF
systemctl reload caddy
```

### 7. DNS : pointer scraper.theclipdealtrack.com → IP_LB

Dans OVH : zone DNS → Add A record → `scraper.theclipdealtrack.com` → IP du LB.

### 8. Configurer Railway

Variables backend :
- `CLIP_SCRAPER_URL` = `https://scraper.theclipdealtrack.com`
- `CLIP_SCRAPER_KEY` = ta clé API

Railway redéploie. Test sur Admin → API Status.

---

## Capacité réelle par config

| Config | Clippeurs (6h tracking) | Coût/mois |
|---|---|---|
| 1 VPS CX22 (4 GB) | ~150-300 | €5 |
| 1 VPS CX32 (8 GB) | ~400-700 | €8 |
| 4 VPS CX32 + Redis | ~1500-2500 | €47 |
| 4 VPS CX32 + Redis + proxy résidentiel | ~3000-5000 | €127 |

---

## Monitoring

### Endpoints à surveiller

```bash
curl https://scraper.theclipdealtrack.com/health
curl https://scraper.theclipdealtrack.com/metrics
```

### Sur le dashboard Admin theclipdealtrack
- Va sur Admin → API Status
- ClipScraper apparaîtra avec sa version, latence, état du cache

### Alertes recommandées (Uptime Robot, gratuit)
- Healthcheck `https://scraper.theclipdealtrack.com/health` toutes les 5 min
- Alerte mail si status ≠ "ok"

---

## Quand monter à 3000 clippeurs

À partir de ~2000 clippeurs réels (pas juste inscrits), upgrade :
- Workers : passe de 4 à 8 VPS CX32 (+€32/mois)
- Proxy : pack 50 GB IPRoyal (+€100/mois)
- Redis : Upstash Pay-as-you-go (€10/mois)
- **Total : ~€280/mois pour 3000 clippeurs**

vs Apify : ~$1240/mois = €1140 → économie €860/mois ✅

---

## Plan de bascule progressive depuis Apify

**Semaine 1** : Lance 1 VPS, configure CLIP_SCRAPER_URL/KEY. Backend essaie ClipScraper en priorité, fallback Apify auto. Si ClipScraper échoue, Apify prend le relais.

**Semaine 2-3** : Surveille les métriques (`/metrics`), ajuste cache TTL, debug erreurs.

**Semaine 4** : Si tout marche, ajoute 3 workers de plus. Tu peux laisser Apify configuré comme "secours d'urgence" (presque jamais utilisé).

**Mois 2** : Si stable, vire Apify entièrement → €0 sur Apify.

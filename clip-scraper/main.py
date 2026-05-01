"""
ClipScraper API — Service de scraping TikTok + Instagram + YouTube.
Multi-instance ready (Redis cache, semaphore concurrency, métriques).
"""
import os
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from scrapers.tiktok import scrape_tiktok
from scrapers.instagram import scrape_instagram
from scrapers.youtube import scrape_youtube
from cache import Cache

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("clip-scraper")

# ── Config ──────────────────────────────────────────────────────────────
API_KEYS = set(filter(None, os.environ.get("API_KEYS", "demo-key-change-me").split(",")))
CACHE_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "1800"))   # 30 min
RATE_LIMIT_PER_HOUR = int(os.environ.get("RATE_LIMIT_PER_HOUR", "5000"))
PROXY_URL = os.environ.get("PROXY_URL", "").strip() or None
# Concurrency : max scrapes Playwright en parallèle. Ajuste selon RAM VPS.
# 4 GB RAM → 4 max. 8 GB RAM → 8 max.
MAX_CONCURRENT_SCRAPES = int(os.environ.get("MAX_CONCURRENT_SCRAPES", "4"))

# ── State ───────────────────────────────────────────────────────────────
cache = Cache(default_ttl=CACHE_TTL_SECONDS)
rate_limits: dict = {}
metrics = {
    "scrapes_total": 0,
    "scrapes_ok": 0,
    "scrapes_failed": 0,
    "scrapes_cached": 0,
    "by_platform": {"tiktok": 0, "instagram": 0, "youtube": 0},
    "started_at": None,
}
scrape_semaphore = asyncio.Semaphore(MAX_CONCURRENT_SCRAPES)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("=" * 60)
    log.info(f"ClipScraper v0.2.0 starting…")
    log.info(f"  API keys: {len(API_KEYS)}")
    log.info(f"  Cache TTL: {CACHE_TTL_SECONDS}s ({'Redis' if cache._redis else 'in-memory'})")
    log.info(f"  Rate limit: {RATE_LIMIT_PER_HOUR}/h per key")
    log.info(f"  Concurrent scrapes max: {MAX_CONCURRENT_SCRAPES}")
    log.info(f"  Proxy: {'enabled' if PROXY_URL else 'DIRECT IP'}")
    log.info("=" * 60)
    metrics["started_at"] = datetime.now(timezone.utc).isoformat()
    yield
    log.info("ClipScraper shutting down…")


app = FastAPI(
    title="ClipScraper API",
    description="Scraping TikTok / Instagram / YouTube — alternative économique à Apify",
    version="0.2.0",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ── Auth + rate limit ───────────────────────────────────────────────────
async def check_auth(x_api_key: Optional[str]) -> str:
    if not x_api_key or x_api_key not in API_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")
    now = datetime.now(timezone.utc)
    one_hour_ago = now - timedelta(hours=1)
    timestamps = rate_limits.get(x_api_key, [])
    timestamps = [t for t in timestamps if t > one_hour_ago]
    if len(timestamps) >= RATE_LIMIT_PER_HOUR:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded: {RATE_LIMIT_PER_HOUR}/h")
    timestamps.append(now)
    rate_limits[x_api_key] = timestamps
    return x_api_key


async def _do_scrape(platform: str, fn, *args, **kwargs):
    """Wrapper qui : check cache, semaphore, exécute, met à jour métriques."""
    metrics["scrapes_total"] += 1
    metrics["by_platform"][platform] += 1
    async with scrape_semaphore:
        try:
            result = await fn(*args, **kwargs)
            metrics["scrapes_ok"] += 1
            return result
        except Exception:
            metrics["scrapes_failed"] += 1
            raise


# ── Endpoints ───────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    uptime_s = 0
    if metrics["started_at"]:
        uptime_s = int((datetime.now(timezone.utc) - datetime.fromisoformat(metrics["started_at"])).total_seconds())
    return {
        "status": "ok",
        "service": "clip-scraper",
        "version": "0.2.0",
        "uptime_seconds": uptime_s,
        "cache_backend": "redis" if cache._redis else "memory",
        "cache_size": len(cache._store) if not cache._redis else "(redis)",
        "concurrent_max": MAX_CONCURRENT_SCRAPES,
        "concurrent_active": MAX_CONCURRENT_SCRAPES - scrape_semaphore._value,
        "proxy": "configured" if PROXY_URL else "direct",
    }


@app.get("/metrics")
async def metrics_endpoint():
    """Prometheus-compatible metrics. Public (lecture seule)."""
    lines = [
        f"# HELP clipscraper_scrapes_total Total number of scrape requests",
        f"# TYPE clipscraper_scrapes_total counter",
        f"clipscraper_scrapes_total {metrics['scrapes_total']}",
        f"clipscraper_scrapes_ok {metrics['scrapes_ok']}",
        f"clipscraper_scrapes_failed {metrics['scrapes_failed']}",
        f"clipscraper_scrapes_cached {metrics['scrapes_cached']}",
        f"clipscraper_concurrent_active {MAX_CONCURRENT_SCRAPES - scrape_semaphore._value}",
        f"clipscraper_concurrent_max {MAX_CONCURRENT_SCRAPES}",
    ]
    for plat, count in metrics["by_platform"].items():
        lines.append(f'clipscraper_scrapes_by_platform{{platform="{plat}"}} {count}')
    return PlainTextResponse("\n".join(lines))


@app.post("/v1/tiktok/{username}")
async def tiktok(username: str, x_api_key: Optional[str] = Header(None), max_videos: int = 30):
    await check_auth(x_api_key)
    username = username.lstrip("@")
    cache_key = f"tt:{username}:{max_videos}"
    cached = await cache.aget(cache_key)
    if cached:
        metrics["scrapes_cached"] += 1
        return {**cached, "_cached": True}
    try:
        result = await _do_scrape("tiktok", scrape_tiktok, username, max_videos=max_videos, proxy=PROXY_URL)
        await cache.aset(cache_key, result)
        return {**result, "_cached": False}
    except Exception as e:
        log.warning(f"TikTok scrape failed for @{username}: {e}")
        raise HTTPException(status_code=502, detail=f"Scrape failed: {e}")


@app.post("/v1/instagram/{username}")
async def instagram(username: str, x_api_key: Optional[str] = Header(None), max_videos: int = 30):
    await check_auth(x_api_key)
    username = username.lstrip("@")
    cache_key = f"ig:{username}:{max_videos}"
    cached = await cache.aget(cache_key)
    if cached:
        metrics["scrapes_cached"] += 1
        return {**cached, "_cached": True}
    try:
        result = await _do_scrape("instagram", scrape_instagram, username, max_videos=max_videos, proxy=PROXY_URL)
        await cache.aset(cache_key, result)
        return {**result, "_cached": False}
    except Exception as e:
        log.warning(f"Instagram scrape failed for @{username}: {e}")
        raise HTTPException(status_code=502, detail=f"Scrape failed: {e}")


@app.post("/v1/youtube/{username}")
async def youtube(username: str, x_api_key: Optional[str] = Header(None), max_videos: int = 30):
    await check_auth(x_api_key)
    username = username.lstrip("@")
    cache_key = f"yt:{username}:{max_videos}"
    cached = await cache.aget(cache_key)
    if cached:
        metrics["scrapes_cached"] += 1
        return {**cached, "_cached": True}
    try:
        result = await _do_scrape("youtube", scrape_youtube, username, max_videos=max_videos)
        await cache.aset(cache_key, result)
        return {**result, "_cached": False}
    except Exception as e:
        log.warning(f"YouTube scrape failed for @{username}: {e}")
        raise HTTPException(status_code=502, detail=f"Scrape failed: {e}")


def _detect_platform_from_url(url: str) -> str:
    import re as _re
    if _re.search(r'tiktok\.com', url):
        return "tiktok"
    if _re.search(r'instagram\.com', url):
        return "instagram"
    if _re.search(r'(?:youtube\.com|youtu\.be)', url):
        return "youtube"
    return "unknown"


async def _video_stats_via_ytdlp(url: str) -> Optional[dict]:
    """Try yt-dlp with multiple UA strategies. Returns dict if success, None if all failed."""
    try:
        import yt_dlp
    except ImportError:
        return None
    loop = asyncio.get_event_loop()
    strategies = [
        {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
         "Referer": "https://www.tiktok.com/", "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"},
        {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
         "Referer": "https://www.tiktok.com/", "Accept-Language": "en-US,en;q=0.9"},
        {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
         "Accept-Language": "fr-FR,fr;q=0.9"},
    ]
    last_err = None
    for headers in strategies:
        opts = {"quiet": True, "skip_download": True, "no_warnings": True, "http_headers": headers}
        if PROXY_URL:
            opts["proxy"] = PROXY_URL
        def _extract():
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    return ydl.extract_info(url, download=False)
            except Exception as e:
                return {"_error": f"{type(e).__name__}: {e}"}
        try:
            info = await loop.run_in_executor(None, _extract)
            if info and not info.get("_error") and (info.get("view_count") is not None or info.get("like_count") is not None or info.get("id")):
                return info
            if info and info.get("_error"):
                last_err = info.get("_error")
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            continue
    log.info(f"yt-dlp all strategies failed for {url[-40:]}: {last_err}")
    return None


async def _video_stats_via_tikwm(url: str) -> Optional[dict]:
    """TikTok fallback via TikWm API. Returns dict if success, None otherwise."""
    import re as _re
    headers = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
               "Origin": "https://www.tikwm.com", "Referer": "https://www.tikwm.com/"}
    proxies = {"http://": PROXY_URL, "https://": PROXY_URL} if PROXY_URL else None
    try:
        import httpx
        async with httpx.AsyncClient(timeout=20, headers=headers, proxies=proxies) as c:
            r = await c.get("https://www.tikwm.com/api/", params={"url": url, "hd": 1})
            data = r.json()
        if data.get("code") != 0:
            log.info(f"TikWm fallback code={data.get('code')} for {url[-40:]}")
            return None
        vid = data.get("data") or {}
        from datetime import datetime as dt, timezone as tz
        published = None
        if vid.get("create_time"):
            try:
                published = dt.fromtimestamp(int(vid["create_time"]), tz=tz.utc).isoformat()
            except Exception:
                pass
        return {
            "id": str(vid.get("id") or vid.get("video_id") or vid.get("aweme_id") or ""),
            "title": (vid.get("title") or "")[:200] or None,
            "thumbnail": vid.get("cover") or vid.get("origin_cover"),
            "view_count": int(vid.get("play_count") or 0),
            "like_count": int(vid.get("digg_count") or 0),
            "comment_count": int(vid.get("comment_count") or 0),
            "repost_count": int(vid.get("share_count") or 0),
            "duration": int(vid.get("duration") or 0),
            "uploader": (vid.get("author") or {}).get("unique_id"),
            "_published_iso": published,
        }
    except Exception as e:
        log.info(f"TikWm fallback failed for {url[-40:]}: {type(e).__name__}: {e}")
        return None


def _walk_dict_find(obj, target_id: str, max_depth: int = 8):
    """Walk recursively dans un dict pour trouver le node qui matche {"id": target_id, ...}
    avec stats playCount/diggCount. Retourne le node ou None."""
    if max_depth <= 0:
        return None
    if isinstance(obj, dict):
        if str(obj.get("id", "")) == target_id and (
            obj.get("stats") or obj.get("statistics") or obj.get("playCount") is not None
        ):
            return obj
        for v in obj.values():
            r = _walk_dict_find(v, target_id, max_depth - 1)
            if r:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = _walk_dict_find(v, target_id, max_depth - 1)
            if r:
                return r
    return None


async def _video_stats_via_tiktok_html(url: str) -> Optional[dict]:
    """TikTok fallback ROBUSTE : parse direct la page HTML via proxy résidentiel.
    Multi-stratégies de parsing : JSON-LD, SIGI, walk recursif, regex ancré."""
    import re as _re
    import json as _json
    from datetime import datetime as dt, timezone as tz

    m = _re.search(r'/video/(\d+)', url)
    if not m:
        return None
    target_vid_id = m.group(1)
    # Tente plusieurs UA / headers
    UA_LIST = [
        ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", "fr-FR,fr;q=0.9,en;q=0.8"),
        ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "en-US,en;q=0.9"),
        ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", "en-US,en;q=0.9,fr;q=0.8"),
    ]
    proxies = {"http://": PROXY_URL, "https://": PROXY_URL} if PROXY_URL else None
    html = None
    last_status = None
    try:
        import httpx
        for ua, lang in UA_LIST:
            headers = {
                "User-Agent": ua,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": lang,
                "Accept-Encoding": "gzip, deflate, br",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Upgrade-Insecure-Requests": "1",
            }
            try:
                async with httpx.AsyncClient(timeout=25, headers=headers, proxies=proxies, follow_redirects=True) as c:
                    r = await c.get(url)
                last_status = r.status_code
                if r.status_code == 200 and len(r.text) > 1000:
                    html = r.text
                    log.info(f"TikTok HTML fallback : got {len(html)} bytes via UA={ua[:30]}")
                    break
            except Exception as e:
                log.info(f"TikTok HTML GET failed UA={ua[:30]}: {type(e).__name__}: {e}")
                continue
        if not html:
            log.info(f"TikTok HTML fallback no html (last_status={last_status}) for {url[-40:]}")
            return None
    except Exception as e:
        log.info(f"TikTok HTML setup failed: {type(e).__name__}: {e}")
        return None

    item = None
    # Stratégie 1 : JSON-LD (structured data) — TikTok inclut souvent des @type: "VideoObject"
    for jm in _re.finditer(r'<script[^>]+type="application/ld\+json"[^>]*>(.+?)</script>', html, _re.DOTALL):
        try:
            ld = _json.loads(jm.group(1))
            if isinstance(ld, list):
                cands = ld
            else:
                cands = [ld]
            for c in cands:
                if isinstance(c, dict) and (c.get("@type") in ("VideoObject", "SocialMediaPosting")):
                    interaction = c.get("interactionStatistic") or []
                    stats = {}
                    if isinstance(interaction, list):
                        for s in interaction:
                            t = (s.get("interactionType") or {})
                            t_name = t.get("@type") if isinstance(t, dict) else str(t)
                            if "Watch" in str(t_name):
                                stats["views"] = int(s.get("userInteractionCount") or 0)
                            elif "Like" in str(t_name):
                                stats["likes"] = int(s.get("userInteractionCount") or 0)
                            elif "Comment" in str(t_name):
                                stats["comments"] = int(s.get("userInteractionCount") or 0)
                            elif "Share" in str(t_name):
                                stats["shares"] = int(s.get("userInteractionCount") or 0)
                    if stats.get("views") or stats.get("likes"):
                        log.info(f"TikTok HTML : JSON-LD parse OK views={stats.get('views')} likes={stats.get('likes')}")
                        return {
                            "id": target_vid_id,
                            "title": (c.get("name") or c.get("description") or "")[:200] or None,
                            "thumbnail": c.get("thumbnailUrl") if isinstance(c.get("thumbnailUrl"), str) else (c.get("thumbnailUrl") or [None])[0] if c.get("thumbnailUrl") else None,
                            "view_count": int(stats.get("views") or 0),
                            "like_count": int(stats.get("likes") or 0),
                            "comment_count": int(stats.get("comments") or 0),
                            "repost_count": int(stats.get("shares") or 0),
                            "_published_iso": c.get("uploadDate"),
                        }
        except Exception:
            continue

    # Stratégie 2 : __UNIVERSAL_DATA_FOR_REHYDRATION__ ou SIGI_STATE
    sigi = None
    for sid in ("__UNIVERSAL_DATA_FOR_REHYDRATION__", "SIGI_STATE", "__NEXT_DATA__"):
        m2 = _re.search(rf'<script[^>]+id="{sid}"[^>]*>(.+?)</script>', html, _re.DOTALL)
        if m2:
            try:
                sigi = _json.loads(m2.group(1))
                log.info(f"TikTok HTML : found {sid}, walking for vid_id={target_vid_id}")
                break
            except Exception as e:
                log.info(f"TikTok HTML : {sid} JSON parse error: {e}")
                continue
    if sigi:
        item = _walk_dict_find(sigi, target_vid_id)
        if item:
            log.info(f"TikTok HTML : walk_dict found item with stats")

    if item:
        stats = item.get("stats") or item.get("statistics") or {}
        published = None
        if item.get("createTime"):
            try:
                published = dt.fromtimestamp(int(item["createTime"]), tz=tz.utc).isoformat()
            except Exception:
                pass
        author = item.get("author")
        return {
            "id": str(item.get("id") or target_vid_id),
            "title": (item.get("desc") or "")[:200] or None,
            "thumbnail": (item.get("video") or {}).get("cover"),
            "view_count": int(stats.get("playCount") or stats.get("play_count") or 0),
            "like_count": int(stats.get("diggCount") or stats.get("digg_count") or 0),
            "comment_count": int(stats.get("commentCount") or stats.get("comment_count") or 0),
            "repost_count": int(stats.get("shareCount") or stats.get("share_count") or 0),
            "uploader": (author.get("uniqueId") if isinstance(author, dict) else author),
            "_published_iso": published,
        }

    # Stratégie 3 : regex ancré sur le vid_id — cherche la fenêtre qui contient l'ID + playCount
    esc_id = _re.escape(target_vid_id)
    # On cherche dans les 8000 chars APRÈS le vid_id ou les 8000 AVANT
    for direction in ("after", "before"):
        if direction == "after":
            pat = rf'"id":"{esc_id}"([\s\S]{{0,8000}})'
        else:
            pat = rf'([\s\S]{{0,8000}})"id":"{esc_id}"'
        m3 = _re.search(pat, html)
        if not m3:
            continue
        window = m3.group(1)
        play_m = _re.search(r'"playCount":(\d+)', window)
        if not play_m:
            continue
        views = int(play_m.group(1))
        likes_m = _re.search(r'"diggCount":(\d+)', window)
        comm_m = _re.search(r'"commentCount":(\d+)', window)
        share_m = _re.search(r'"shareCount":(\d+)', window)
        title_m = _re.search(r'"desc":"([^"\\]*)"', window)
        cover_m = _re.search(r'"cover":"([^"]+)"', window)
        created_m = _re.search(r'"createTime":(\d+)', window)
        published = None
        if created_m:
            try:
                published = dt.fromtimestamp(int(created_m.group(1)), tz=tz.utc).isoformat()
            except Exception:
                pass
        log.info(f"TikTok HTML : regex {direction} matched, views={views}")
        return {
            "id": target_vid_id,
            "title": (title_m.group(1)[:200] if title_m else None),
            "thumbnail": (cover_m.group(1).replace("\\u002F", "/").replace("\\/", "/") if cover_m else None),
            "view_count": views,
            "like_count": int(likes_m.group(1)) if likes_m else 0,
            "comment_count": int(comm_m.group(1)) if comm_m else 0,
            "repost_count": int(share_m.group(1)) if share_m else 0,
            "_published_iso": published,
        }

    # Diagnostic : la page contient-elle au moins playCount quelque part ?
    has_play = bool(_re.search(r'"playCount":\d+', html))
    has_id = target_vid_id in html
    log.warning(f"TikTok HTML : ALL strategies failed for vid={target_vid_id}. has_playCount={has_play} has_vid_id_in_html={has_id} html_size={len(html)}")
    return None


async def _video_stats_via_instagram_html(url: str) -> Optional[dict]:
    """Scrape la page HTML publique Insta via proxy résidentiel.
    Parse TOUS les JSON injectés dans le HTML pour trouver le compteur 'Views' UI (le vrai 92k).
    Cette méthode contourne l'API privée qui ne renvoie que play_count (54k)."""
    import re as _re
    import json as _json
    m = _re.search(r'/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)', url)
    if not m:
        return None
    shortcode = m.group(1)
    INSTAGRAM_SESSION_ID = (os.environ.get("INSTAGRAM_SESSION_ID") or "").strip() or None
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
    }
    cookies = {"sessionid": INSTAGRAM_SESSION_ID} if INSTAGRAM_SESSION_ID else {}
    proxies = {"http://": PROXY_URL, "https://": PROXY_URL} if PROXY_URL else None
    canonical_url = f"https://www.instagram.com/reel/{shortcode}/"
    try:
        import httpx
        async with httpx.AsyncClient(timeout=25, headers=headers, cookies=cookies, proxies=proxies, follow_redirects=True) as c:
            r = await c.get(canonical_url)
        if r.status_code != 200:
            log.info(f"IG HTML scrape HTTP {r.status_code} for {shortcode}")
            return None
        html = r.text
    except Exception as e:
        log.info(f"IG HTML scrape network failed for {shortcode}: {type(e).__name__}: {e}")
        return None

    # Diagnostic : log la taille et un extrait du HTML pour voir ce qu'Insta a renvoyé
    has_login = "loginForm" in html or "id=\"loginForm\"" in html or "Log in to Instagram" in html
    has_error_page = "may be broken" in html or "Page Not Found" in html
    log.info(f"IG HTML scrape: size={len(html)} login_page={has_login} error_page={has_error_page} for {shortcode}")
    if len(html) < 3000:
        log.info(f"IG HTML scrape: page too small for {shortcode}")
        return None
    if has_error_page:
        log.info(f"IG HTML scrape: error page (video deleted?) for {shortcode}")
        return None
    # Si page login : on peut quand meme tenter — l'embed peut marcher
    if has_login:
        # Tente l'URL embed publique qui ne demande pas login
        try:
            embed_url = f"https://www.instagram.com/p/{shortcode}/embed/captioned/"
            async with httpx.AsyncClient(timeout=20, headers=headers, proxies=proxies, follow_redirects=True) as c:
                r2 = await c.get(embed_url)
            if r2.status_code == 200 and len(r2.text) > 2000:
                html = r2.text
                log.info(f"IG HTML scrape: switched to embed URL, size={len(html)}")
        except Exception as e:
            log.debug(f"IG embed fallback failed: {e}")

    # Stratégie A : extraire les Open Graph + meta tags (souvent présents même sans cookie)
    og_views_m = _re.search(r'<meta[^>]+(?:name|property)="(?:og:title|og:description|description)"[^>]+content="([^"]+)"', html)
    og_text = og_views_m.group(1) if og_views_m else ""
    # Insta og:description ressemble à : "X likes, Y comments - username on Date: \"caption\""
    # mais peut aussi inclure "X views" pour les Reels
    likes_meta = _re.search(r'([\d,\.\sKMkm]+)\s*(?:likes?|J\'aime)', og_text, _re.IGNORECASE)
    views_meta = _re.search(r'([\d,\.\sKMkm]+)\s*(?:views?|vues|plays?|reproductions?|reproducciones?)', og_text, _re.IGNORECASE)

    # Stratégie B : parse TOUS les <script type="application/json"> (Insta y injecte les données)
    best_views = 0
    best_likes = 0
    best_comments = 0
    best_published = None
    best_caption = None
    best_thumb = None
    best_field = None
    candidate_fields = ("ig_play_count", "fb_play_count", "play_count", "video_play_count",
                        "view_count", "video_view_count", "metadata.original_play_count")

    def _walk(obj, depth=0):
        nonlocal best_views, best_likes, best_comments, best_published, best_caption, best_thumb, best_field
        if depth > 12:
            return
        if isinstance(obj, dict):
            # Si on trouve un objet qui matche le shortcode, on extrait
            if str(obj.get("code") or obj.get("shortcode") or "") == shortcode or str(obj.get("id") or "")[:20] == shortcode:
                for f in candidate_fields:
                    v = obj.get(f)
                    if isinstance(v, (int, float)) and v > best_views:
                        best_views = int(v)
                        best_field = f
                lc = obj.get("like_count") or (obj.get("edge_liked_by") or {}).get("count") or (obj.get("edge_media_preview_like") or {}).get("count")
                if isinstance(lc, (int, float)) and lc > best_likes:
                    best_likes = int(lc)
                cc = obj.get("comment_count") or (obj.get("edge_media_to_comment") or {}).get("count")
                if isinstance(cc, (int, float)) and cc > best_comments:
                    best_comments = int(cc)
                if not best_caption:
                    cap = obj.get("caption")
                    if isinstance(cap, dict):
                        best_caption = cap.get("text")
                    elif isinstance(cap, str):
                        best_caption = cap
                if not best_thumb:
                    iv = obj.get("image_versions2") or {}
                    if isinstance(iv, dict):
                        cand = iv.get("candidates")
                        if isinstance(cand, list) and cand:
                            best_thumb = cand[0].get("url")
                    if not best_thumb:
                        best_thumb = obj.get("display_url") or obj.get("thumbnail_src")
                if not best_published and obj.get("taken_at"):
                    try:
                        from datetime import datetime as dt, timezone as tz
                        best_published = dt.fromtimestamp(int(obj["taken_at"]), tz=tz.utc).isoformat()
                    except Exception:
                        pass
            # Quelque soit le shortcode on cherche aussi au cas où le JSON ne contient pas notre shortcode mais a quand même les stats
            for f in candidate_fields:
                v = obj.get(f)
                if isinstance(v, (int, float)) and v > best_views and v < 10_000_000_000:  # sanity
                    # Vérifie qu'on est dans un contexte qui semble être notre vidéo
                    pass  # désactivé pour pas matcher des stats d'autres vidéos
            for v in obj.values():
                _walk(v, depth + 1)
        elif isinstance(obj, list):
            for v in obj:
                _walk(v, depth + 1)

    # Cherche tous les blocs JSON dans le HTML (multiple patterns, structure Insta change souvent)
    json_blocks = []
    for jm in _re.finditer(r'<script[^>]+type="application/json"[^>]*>(.+?)</script>', html, _re.DOTALL):
        json_blocks.append(jm.group(1))
    for jm in _re.finditer(r'<script[^>]+type="application/ld\+json"[^>]*>(.+?)</script>', html, _re.DOTALL):
        json_blocks.append(jm.group(1))
    for jm in _re.finditer(r'window\._sharedData\s*=\s*(\{.+?\});\s*</script>', html, _re.DOTALL):
        json_blocks.append(jm.group(1))
    for jm in _re.finditer(r'window\.__additionalDataLoaded\s*\([^,]+,\s*(\{.+?\})\)\s*;', html, _re.DOTALL):
        json_blocks.append(jm.group(1))
    # Inline scripts qui contiennent du JSON brut (pattern récent Insta 2025)
    for jm in _re.finditer(r'<script[^>]*>(\{[\s\S]+?\})</script>', html):
        candidate = jm.group(1)
        # On ne prend que ceux qui contiennent un mot-clé pertinent pour Insta
        if any(kw in candidate for kw in ('"shortcode"', '"play_count"', '"video_view_count"', '"PolarisPostRoot"', '"PostPageDirectQuery"')):
            json_blocks.append(candidate)

    log.info(f"IG HTML scrape: found {len(json_blocks)} JSON blocks for {shortcode}")
    for blk in json_blocks:
        try:
            obj = _json.loads(blk)
            _walk(obj)
        except Exception:
            continue

    # Stratégie B-bis : JSON-LD (très fiable, Insta met les stats SEO ici)
    # <script type="application/ld+json"> contient {"@type":"VideoObject","interactionStatistic":[{"interactionType":"WatchAction","userInteractionCount":92000}]}
    for jm in _re.finditer(r'<script[^>]+type="application/ld\+json"[^>]*>(.+?)</script>', html, _re.DOTALL):
        try:
            ld = _json.loads(jm.group(1))
            cands = ld if isinstance(ld, list) else [ld]
            for c_ld in cands:
                if not isinstance(c_ld, dict):
                    continue
                interaction = c_ld.get("interactionStatistic") or []
                if isinstance(interaction, list):
                    for s in interaction:
                        t = s.get("interactionType") if isinstance(s, dict) else None
                        t_str = (t.get("@type") if isinstance(t, dict) else str(t)) or ""
                        v = s.get("userInteractionCount")
                        if isinstance(v, (int, float)):
                            if "Watch" in t_str and v > best_views:
                                best_views = int(v)
                                best_field = "ld+json:WatchAction"
                            elif "Like" in t_str and v > best_likes:
                                best_likes = int(v)
                            elif "Comment" in t_str and v > best_comments:
                                best_comments = int(v)
                if not best_caption and c_ld.get("description"):
                    best_caption = c_ld.get("description")
                if not best_thumb and c_ld.get("thumbnailUrl"):
                    best_thumb = c_ld.get("thumbnailUrl") if isinstance(c_ld.get("thumbnailUrl"), str) else (c_ld.get("thumbnailUrl") or [None])[0]
                if not best_published and c_ld.get("uploadDate"):
                    best_published = c_ld.get("uploadDate")
        except Exception:
            continue

    # Stratégie C (regex pure) : cherche tous les "play_count":N et "ig_play_count":N proches du shortcode
    # On cherche le shortcode dans le HTML puis on regarde les stats à proximité
    if shortcode in html and best_views == 0:
        idx = html.find(shortcode)
        # Fenêtre 8000 chars autour
        window = html[max(0, idx - 1000):idx + 8000]
        for f in candidate_fields:
            for vm in _re.finditer(rf'"{f}"\s*:\s*(\d+)', window):
                val = int(vm.group(1))
                if val > best_views and val < 10_000_000_000:
                    best_views = val
                    best_field = f + " (regex)"

    if best_views == 0 and best_likes == 0:
        log.info(f"IG HTML scrape: no stats found for {shortcode} (json_blocks={len(json_blocks)})")
        return None

    log.info(f"IG HTML scrape SUCCESS for {shortcode}: views={best_views} (field={best_field}) likes={best_likes}")
    return {
        "id": shortcode,
        "title": (best_caption or "")[:200] or None,
        "thumbnail": best_thumb,
        "view_count": best_views,
        "like_count": best_likes,
        "comment_count": best_comments,
        "_published_iso": best_published,
        "_field_used": best_field,
    }


@app.post("/v1/instagram-html-stats")
async def instagram_html_stats(payload: dict, x_api_key: Optional[str] = Header(None)):
    """Endpoint dédié : scrape la page HTML publique Insta via proxy résidentiel.
    Parse tous les JSON injectés pour trouver le compteur 'Views' UI maximum.
    Plus précis que l'API privée qui ne renvoie que play_count (vues > 1s)."""
    await check_auth(x_api_key)
    url = (payload.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    cache_key = f"ightml:{url}"
    cached = await cache.aget(cache_key)
    if cached:
        return {**cached, "_cached": True}
    result = await _video_stats_via_instagram_html(url)
    if not result:
        raise HTTPException(status_code=502, detail="HTML scrape returned no stats")
    # Format compatible avec /v1/video-stats
    out = {
        "url": url,
        "platform_video_id": result.get("id"),
        "title": result.get("title"),
        "thumbnail_url": result.get("thumbnail"),
        "views": result.get("view_count", 0),
        "likes": result.get("like_count", 0),
        "comments": result.get("comment_count", 0),
        "published_at": result.get("_published_iso"),
        "_field_used": result.get("_field_used"),
    }
    await cache.aset(cache_key, out, ttl=60)
    return {**out, "_cached": False}


async def _video_stats_via_instagram_web(url: str) -> Optional[dict]:
    """Instagram fallback via web API media/info."""
    import re as _re
    m = _re.search(r'/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)', url)
    if not m:
        return None
    shortcode = m.group(1)
    INSTAGRAM_SESSION_ID = (os.environ.get("INSTAGRAM_SESSION_ID") or "").strip() or None
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 295.0.0.32.119",
        "X-IG-App-ID": "936619743392459",
        "Accept": "*/*",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Referer": "https://www.instagram.com/",
    }
    cookies = {"sessionid": INSTAGRAM_SESSION_ID} if INSTAGRAM_SESSION_ID else {}
    proxies = {"http://": PROXY_URL, "https://": PROXY_URL} if PROXY_URL else None
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15, headers=headers, cookies=cookies, proxies=proxies, follow_redirects=True) as c:
            r = await c.get(f"https://www.instagram.com/api/v1/media/{shortcode}/info/")
        if r.status_code != 200:
            return None
        data = r.json()
        items = data.get("items") or []
        if not items:
            return None
        item = items[0]
        from datetime import datetime as dt, timezone as tz
        published = None
        if item.get("taken_at"):
            try:
                published = dt.fromtimestamp(int(item["taken_at"]), tz=tz.utc).isoformat()
            except Exception:
                pass
        return {
            "id": shortcode,
            "title": ((item.get("caption") or {}).get("text") or "")[:200] or None,
            "thumbnail": ((item.get("image_versions2") or {}).get("candidates") or [{}])[0].get("url"),
            # play_count = nouveau compteur Insta (total replays inclus, ce qu'affiche l'UI Insta) > video_view_count (ancien, plus bas)
            "view_count": int(item.get("play_count") or item.get("ig_play_count") or item.get("video_play_count") or item.get("video_view_count") or 0),
            "like_count": int(item.get("like_count") or 0),
            "comment_count": int(item.get("comment_count") or 0),
            "duration": int(item.get("video_duration") or 0),
            "uploader": (item.get("user") or {}).get("username"),
            "_published_iso": published,
        }
    except Exception as e:
        log.info(f"Instagram web fallback failed for {url[-40:]}: {type(e).__name__}: {e}")
        return None


@app.post("/v1/video-stats")
async def video_stats(payload: dict, x_api_key: Optional[str] = Header(None)):
    """Fetch stats for a single video URL avec cascade : yt-dlp(3 UAs) -> TikWm(TikTok) -> InstaWeb(IG)."""
    await check_auth(x_api_key)
    url = (payload.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    # Validate URL is a single-video URL, not a profile
    import re as _re
    is_video_url = bool(
        _re.search(r'/video/\d+', url) or            # TikTok video
        _re.search(r'/(?:p|reel|reels|tv)/[A-Za-z0-9_-]+', url) or  # Instagram post/reel
        _re.search(r'(?:v=|youtu\.be/|/shorts/|/embed/)', url) or  # YouTube
        _re.search(r'/@[\w.-]+/video/\d+', url)      # TikTok with username
    )
    if not is_video_url:
        raise HTTPException(status_code=400, detail="URL doit pointer vers une vidéo spécifique (pas un profil)")

    cache_key = f"vstats:{url}"
    cached = await cache.aget(cache_key)
    if cached:
        return {**cached, "_cached": True}

    platform = _detect_platform_from_url(url)
    info: Optional[dict] = None
    source_used = None
    errors = []

    # Stratégie 1 : yt-dlp avec rotation UA
    info = await _video_stats_via_ytdlp(url)
    if info:
        source_used = "ytdlp"

    # Stratégie 2 : fallback TikWm pour TikTok
    if (not info or (not info.get("view_count") and not info.get("like_count"))) and platform == "tiktok":
        tikwm = await _video_stats_via_tikwm(url)
        if tikwm and (tikwm.get("view_count") or tikwm.get("like_count")):
            info = tikwm
            source_used = "tikwm"

    # Stratégie 2b : fallback HTTP direct sur la page TikTok (parse SIGI/regex) — utilise le proxy résidentiel
    if (not info or (not info.get("view_count") and not info.get("like_count"))) and platform == "tiktok":
        tk_html = await _video_stats_via_tiktok_html(url)
        if tk_html and (tk_html.get("view_count") or tk_html.get("like_count")):
            info = tk_html
            source_used = "tiktok_html"

    # Stratégie 3 : Instagram — page HTML publique via proxy résidentiel (le PLUS précis pour Reels)
    if platform == "instagram":
        ig_html = await _video_stats_via_instagram_html(url)
        if ig_html and (ig_html.get("view_count") or ig_html.get("like_count")):
            # Si la version HTML donne plus de vues que ce qu'on a, on prend
            current_views = (info.get("view_count", 0) if info else 0)
            if ig_html.get("view_count", 0) > current_views:
                info = ig_html
                source_used = "instagram_html"

    # Stratégie 4 : fallback web API pour Instagram
    if (not info or (not info.get("view_count") and not info.get("like_count"))) and platform == "instagram":
        ig = await _video_stats_via_instagram_web(url)
        if ig and (ig.get("view_count") or ig.get("like_count")):
            info = ig
            source_used = "instagram_web"

    if not info:
        raise HTTPException(status_code=502, detail=f"Toutes les sources ont échoué pour cette vidéo ({platform}). Vidéo privée/supprimée ou bloquée par anti-bot.")

    # Format normalisé
    from datetime import datetime as dt, timezone as tz
    published = info.get("_published_iso")
    if not published and info.get("timestamp"):
        try:
            published = dt.fromtimestamp(int(info["timestamp"]), tz=tz.utc).isoformat()
        except Exception:
            pass

    views = int(info.get("view_count") or 0)
    likes = int(info.get("like_count") or 0)
    if views == 0 and likes == 0:
        raise HTTPException(status_code=502, detail=f"Stats trouvées mais views=0 et likes=0 — possiblement compte privé ou vidéo supprimée")

    result = {
        "url": url,
        "platform_video_id": str(info.get("id", "")),
        "title": (info.get("title") or "")[:200] or None,
        "thumbnail_url": info.get("thumbnail"),
        "views": views,
        "likes": likes,
        "comments": int(info.get("comment_count") or 0),
        "shares": int(info.get("repost_count") or 0),
        "duration": int(info.get("duration") or 0),
        "published_at": published,
        "uploader": info.get("uploader") or info.get("channel"),
        "_source": source_used,
    }
    # Cache court (60s) car les stats vidéo bougent vite
    await cache.aset(cache_key, result, ttl=60)
    log.info(f"video-stats OK via {source_used} for {url[-40:]}: views={views} likes={likes}")
    return {**result, "_cached": False}


@app.get("/v1/usage")
async def usage(x_api_key: Optional[str] = Header(None)):
    await check_auth(x_api_key)
    now = datetime.now(timezone.utc)
    one_hour_ago = now - timedelta(hours=1)
    timestamps = rate_limits.get(x_api_key, [])
    recent = [t for t in timestamps if t > one_hour_ago]
    return {
        "api_key_prefix": x_api_key[:8] + "…",
        "requests_last_hour": len(recent),
        "rate_limit_per_hour": RATE_LIMIT_PER_HOUR,
        "remaining": max(0, RATE_LIMIT_PER_HOUR - len(recent)),
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8001"))
    workers = int(os.environ.get("WORKERS", "1"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info", workers=workers)

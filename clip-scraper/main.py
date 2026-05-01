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


async def _video_stats_via_tiktok_html(url: str) -> Optional[dict]:
    """TikTok fallback : parse direct la page HTML TikTok et cherche les stats de la vidéo cible.
    Utilise le proxy si configuré (l'IP du VPS est souvent ban par TikTok)."""
    import re as _re
    import json as _json
    m = _re.search(r'/video/(\d+)', url)
    if not m:
        return None
    target_vid_id = m.group(1)
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
    }
    proxies = {"http://": PROXY_URL, "https://": PROXY_URL} if PROXY_URL else None
    try:
        import httpx
        async with httpx.AsyncClient(timeout=25, headers=headers, proxies=proxies, follow_redirects=True) as c:
            r = await c.get(url)
        if r.status_code != 200:
            log.info(f"TikTok HTML fallback HTTP {r.status_code} for {url[-40:]}")
            return None
        html = r.text
        # Cherche le bloc UNIVERSAL_DATA puis ItemModule
        sigi = None
        m2 = _re.search(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.+?)</script>', html, _re.DOTALL)
        if m2:
            try:
                sigi = _json.loads(m2.group(1))
            except Exception:
                pass
        if not sigi:
            m2 = _re.search(r'<script id="SIGI_STATE"[^>]*>(.+?)</script>', html, _re.DOTALL)
            if m2:
                try:
                    sigi = _json.loads(m2.group(1))
                except Exception:
                    pass
        item = None
        if sigi:
            # Format moderne : __DEFAULT_SCOPE__.webapp.video-detail.itemInfo.itemStruct
            try:
                vd = (sigi.get("__DEFAULT_SCOPE__") or {}).get("webapp.video-detail", {})
                item = (vd.get("itemInfo") or {}).get("itemStruct") or vd.get("itemStruct")
            except Exception:
                pass
            if not item:
                # Format ancien : ItemModule[vid_id]
                im = sigi.get("ItemModule", {})
                if isinstance(im, dict):
                    item = im.get(target_vid_id) or (next(iter(im.values())) if im else None)
        # Fallback regex si SIGI absent : cherche les stats DANS la page autour du vid_id
        if not item:
            # Match brut "playCount":N près de l'ID demandé
            esc_id = _re.escape(target_vid_id)
            ctx_match = _re.search(rf'"id":"{esc_id}"[\s\S]{{0,4000}}?"playCount":(\d+)', html)
            if ctx_match:
                # Extrait stats dans la fenêtre
                window_start = ctx_match.start()
                window = html[window_start:window_start + 5000]
                views = int(ctx_match.group(1))
                likes = int(_re.search(r'"diggCount":(\d+)', window).group(1)) if _re.search(r'"diggCount":(\d+)', window) else 0
                comments = int(_re.search(r'"commentCount":(\d+)', window).group(1)) if _re.search(r'"commentCount":(\d+)', window) else 0
                shares = int(_re.search(r'"shareCount":(\d+)', window).group(1)) if _re.search(r'"shareCount":(\d+)', window) else 0
                title_m = _re.search(r'"desc":"([^"\\]*)"', window)
                created_m = _re.search(r'"createTime":(\d+)', window)
                cover_m = _re.search(r'"cover":"([^"]+)"', window)
                from datetime import datetime as dt, timezone as tz
                published = None
                if created_m:
                    try:
                        published = dt.fromtimestamp(int(created_m.group(1)), tz=tz.utc).isoformat()
                    except Exception:
                        pass
                return {
                    "id": target_vid_id,
                    "title": (title_m.group(1)[:200] if title_m else None),
                    "thumbnail": (cover_m.group(1).replace("\\u002F", "/").replace("\\/", "/") if cover_m else None),
                    "view_count": views,
                    "like_count": likes,
                    "comment_count": comments,
                    "repost_count": shares,
                    "_published_iso": published,
                }
            return None
        # Item trouvé via SIGI : extrait stats
        stats = item.get("stats") or item.get("statistics") or {}
        from datetime import datetime as dt, timezone as tz
        published = None
        if item.get("createTime"):
            try:
                published = dt.fromtimestamp(int(item["createTime"]), tz=tz.utc).isoformat()
            except Exception:
                pass
        return {
            "id": str(item.get("id") or target_vid_id),
            "title": (item.get("desc") or "")[:200] or None,
            "thumbnail": (item.get("video") or {}).get("cover"),
            "view_count": int(stats.get("playCount") or stats.get("play_count") or 0),
            "like_count": int(stats.get("diggCount") or stats.get("digg_count") or 0),
            "comment_count": int(stats.get("commentCount") or stats.get("comment_count") or 0),
            "repost_count": int(stats.get("shareCount") or stats.get("share_count") or 0),
            "uploader": (item.get("author") or {}).get("uniqueId") if isinstance(item.get("author"), dict) else item.get("author"),
            "_published_iso": published,
        }
    except Exception as e:
        log.info(f"TikTok HTML fallback failed for {url[-40:]}: {type(e).__name__}: {e}")
        return None


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
            "view_count": int(item.get("play_count") or item.get("video_view_count") or item.get("ig_play_count") or 0),
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

    # Stratégie 3 : fallback web API pour Instagram
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

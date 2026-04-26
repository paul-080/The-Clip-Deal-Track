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


@app.post("/v1/video-stats")
async def video_stats(payload: dict, x_api_key: Optional[str] = Header(None)):
    """Fetch stats for a single video URL via yt-dlp + proxy. Bypass blocages Railway."""
    await check_auth(x_api_key)
    url = (payload.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    try:
        import yt_dlp
    except ImportError:
        raise HTTPException(status_code=500, detail="yt-dlp not installed in scraper")

    cache_key = f"vstats:{url}"
    cached = await cache.aget(cache_key)
    if cached:
        return {**cached, "_cached": True}

    loop = asyncio.get_event_loop()
    def _extract():
        opts = {"quiet": True, "skip_download": True, "no_warnings": True, "ignoreerrors": True}
        if PROXY_URL:
            opts["proxy"] = PROXY_URL
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=False)
        except Exception as e:
            return {"_error": str(e)}

    try:
        info = await loop.run_in_executor(None, _extract)
        if not info or info.get("_error"):
            raise HTTPException(status_code=502, detail=f"yt-dlp failed: {info.get('_error') if info else 'no data'}")

        from datetime import datetime as dt, timezone as tz
        published = None
        if info.get("timestamp"):
            try:
                published = dt.fromtimestamp(int(info["timestamp"]), tz=tz.utc).isoformat()
            except Exception:
                pass

        result = {
            "url": url,
            "platform_video_id": str(info.get("id", "")),
            "title": (info.get("title") or info.get("description") or "")[:200] or None,
            "thumbnail_url": info.get("thumbnail"),
            "views": int(info.get("view_count") or 0),
            "likes": int(info.get("like_count") or 0),
            "comments": int(info.get("comment_count") or 0),
            "shares": int(info.get("repost_count") or 0),
            "duration": int(info.get("duration") or 0),
            "published_at": published,
            "uploader": info.get("uploader") or info.get("channel"),
        }
        await cache.aset(cache_key, result, ttl=600)  # 10min cache
        return {**result, "_cached": False}
    except HTTPException:
        raise
    except Exception as e:
        log.warning(f"video-stats failed for {url}: {e}")
        raise HTTPException(status_code=502, detail=f"Fetch failed: {e}")


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

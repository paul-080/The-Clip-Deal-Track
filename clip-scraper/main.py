"""
ClipScraper API — Service de scraping TikTok + Instagram.
Adapté pour theclipdealtrack.com mais utilisable comme API publique standalone.

Endpoints :
  GET  /health
  POST /v1/tiktok/{username}        — Profil + vidéos récentes
  POST /v1/instagram/{username}     — Profil + reels récents
  POST /v1/youtube/{username}       — Profil + vidéos récentes (via YouTube Data API)

Auth : header X-API-Key obligatoire (sauf /health).
Rate limit : configurable par clé.
Cache : résultats cachés 30 minutes par défaut.

Déploiement : voir README.md
"""
import os
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import JSONResponse
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
RATE_LIMIT_PER_HOUR = int(os.environ.get("RATE_LIMIT_PER_HOUR", "1000"))
PROXY_URL = os.environ.get("PROXY_URL", "").strip() or None  # "http://user:pass@host:port"

# ── State ───────────────────────────────────────────────────────────────
cache = Cache(default_ttl=CACHE_TTL_SECONDS)
rate_limits: dict = {}  # {api_key: [timestamps]}


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("ClipScraper starting…")
    log.info(f"  API keys configured: {len(API_KEYS)}")
    log.info(f"  Cache TTL: {CACHE_TTL_SECONDS}s")
    log.info(f"  Rate limit: {RATE_LIMIT_PER_HOUR}/h per key")
    log.info(f"  Proxy: {'enabled' if PROXY_URL else 'disabled (direct IP)'}")
    yield
    log.info("ClipScraper shutting down…")


app = FastAPI(
    title="ClipScraper API",
    description="Scraping TikTok / Instagram / YouTube — alternative économique à Apify",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ── Auth + rate limit middleware ────────────────────────────────────────
async def check_auth(x_api_key: Optional[str]) -> str:
    if not x_api_key or x_api_key not in API_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")
    # Rate limit
    now = datetime.now(timezone.utc)
    one_hour_ago = now - timedelta(hours=1)
    timestamps = rate_limits.get(x_api_key, [])
    timestamps = [t for t in timestamps if t > one_hour_ago]
    if len(timestamps) >= RATE_LIMIT_PER_HOUR:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded: {RATE_LIMIT_PER_HOUR}/h")
    timestamps.append(now)
    rate_limits[x_api_key] = timestamps
    return x_api_key


# ── Endpoints ──────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "clip-scraper",
        "version": "0.1.0",
        "cache_size": len(cache._store),
        "uptime": "ok",
    }


@app.post("/v1/tiktok/{username}")
async def tiktok(username: str, x_api_key: Optional[str] = Header(None), max_videos: int = 30):
    await check_auth(x_api_key)
    username = username.lstrip("@")
    cache_key = f"tt:{username}:{max_videos}"
    cached = cache.get(cache_key)
    if cached:
        return {**cached, "_cached": True}
    try:
        result = await scrape_tiktok(username, max_videos=max_videos, proxy=PROXY_URL)
        cache.set(cache_key, result)
        return {**result, "_cached": False}
    except Exception as e:
        log.warning(f"TikTok scrape failed for @{username}: {e}")
        raise HTTPException(status_code=502, detail=f"Scrape failed: {e}")


@app.post("/v1/instagram/{username}")
async def instagram(username: str, x_api_key: Optional[str] = Header(None), max_videos: int = 30):
    await check_auth(x_api_key)
    username = username.lstrip("@")
    cache_key = f"ig:{username}:{max_videos}"
    cached = cache.get(cache_key)
    if cached:
        return {**cached, "_cached": True}
    try:
        result = await scrape_instagram(username, max_videos=max_videos, proxy=PROXY_URL)
        cache.set(cache_key, result)
        return {**result, "_cached": False}
    except Exception as e:
        log.warning(f"Instagram scrape failed for @{username}: {e}")
        raise HTTPException(status_code=502, detail=f"Scrape failed: {e}")


@app.post("/v1/youtube/{username}")
async def youtube(username: str, x_api_key: Optional[str] = Header(None), max_videos: int = 30):
    await check_auth(x_api_key)
    username = username.lstrip("@")
    cache_key = f"yt:{username}:{max_videos}"
    cached = cache.get(cache_key)
    if cached:
        return {**cached, "_cached": True}
    try:
        result = await scrape_youtube(username, max_videos=max_videos)
        cache.set(cache_key, result)
        return {**result, "_cached": False}
    except Exception as e:
        log.warning(f"YouTube scrape failed for @{username}: {e}")
        raise HTTPException(status_code=502, detail=f"Scrape failed: {e}")


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
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")

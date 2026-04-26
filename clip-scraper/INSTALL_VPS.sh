#!/bin/bash
# ============================================================================
# ClipScraper — Installation TOUT-EN-UN sur VPS Hostinger
# A coller integralement dans le BROWSER TERMINAL Hostinger
# ============================================================================

set -e

echo ""
echo "============================================================"
echo "  ClipScraper - installation automatique"
echo "============================================================"
echo ""

mkdir -p /opt/clip-scraper/scrapers
cd /opt/clip-scraper

# ── requirements.txt ─────────────────────────────────────────────
cat > requirements.txt <<'REQEOF'
fastapi==0.110.1
uvicorn[standard]==0.25.0
httpx==0.26.0
playwright>=1.40.0
python-dotenv==1.0.1
pydantic==2.5.3
redis>=5.0.0
REQEOF

# ── Dockerfile ───────────────────────────────────────────────────
cat > Dockerfile <<'DOCKEOF'
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    wget curl gnupg ca-certificates \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxcb1 libxkbcommon0 \
    libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    libatspi2.0-0 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium --with-deps

COPY . .

EXPOSE 8001

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}
DOCKEOF

# ── docker-compose.yml ───────────────────────────────────────────
cat > docker-compose.yml <<'COMPEOF'
version: "3.9"
services:
  clip-scraper:
    build: .
    container_name: clip-scraper
    restart: unless-stopped
    env_file: .env
    ports:
      - "8001:8001"
    deploy:
      resources:
        limits:
          memory: 4G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
COMPEOF

# ── .env ─────────────────────────────────────────────────────────
cat > .env <<'ENVEOF'
API_KEYS=cd-prod-ac29858a696cf2c1a642dd1c9f607628fcd8b0878cc3c704
CACHE_TTL_SECONDS=1800
RATE_LIMIT_PER_HOUR=5000
PROXY_URL=
YOUTUBE_API_KEY=
INSTAGRAM_SESSION_ID=
PORT=8001
MAX_CONCURRENT_SCRAPES=4
ENVEOF

# ── cache.py ─────────────────────────────────────────────────────
cat > cache.py <<'CACHEEOF'
"""Cache pluggable : in-memory ou Redis."""
import os
import json
import time
import logging
from typing import Any, Optional

log = logging.getLogger("cache")
REDIS_URL = (os.environ.get("REDIS_URL") or "").strip() or None


class Cache:
    def __init__(self, default_ttl: int = 1800):
        self._default_ttl = default_ttl
        self._store: dict = {}
        self._redis = None
        if REDIS_URL:
            try:
                import redis.asyncio as aioredis
                self._redis = aioredis.from_url(REDIS_URL, decode_responses=True)
                log.info("Cache: Redis active")
            except Exception as e:
                log.warning(f"Cache: Redis init failed ({e}), fallback in-memory")

    def get(self, key: str):
        if self._redis:
            return None
        entry = self._store.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if time.time() > expires_at:
            self._store.pop(key, None)
            return None
        return value

    async def aget(self, key: str):
        if self._redis:
            try:
                raw = await self._redis.get(key)
                return json.loads(raw) if raw else None
            except Exception as e:
                log.warning(f"Cache aget error: {e}")
                return None
        return self.get(key)

    def set(self, key: str, value, ttl=None):
        ttl = ttl or self._default_ttl
        if not self._redis:
            self._store[key] = (time.time() + ttl, value)

    async def aset(self, key: str, value, ttl=None):
        ttl = ttl or self._default_ttl
        if self._redis:
            try:
                await self._redis.setex(key, ttl, json.dumps(value, default=str))
                return
            except Exception as e:
                log.warning(f"Cache aset error: {e}")
        self._store[key] = (time.time() + ttl, value)

    def clear(self):
        self._store.clear()
CACHEEOF

# ── main.py ──────────────────────────────────────────────────────
cat > main.py <<'MAINEOF'
"""ClipScraper API."""
import os
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from scrapers.tiktok import scrape_tiktok
from scrapers.instagram import scrape_instagram
from scrapers.youtube import scrape_youtube
from cache import Cache

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("clip-scraper")

API_KEYS = set(filter(None, os.environ.get("API_KEYS", "demo-key-change-me").split(",")))
CACHE_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "1800"))
RATE_LIMIT_PER_HOUR = int(os.environ.get("RATE_LIMIT_PER_HOUR", "5000"))
PROXY_URL = os.environ.get("PROXY_URL", "").strip() or None
MAX_CONCURRENT_SCRAPES = int(os.environ.get("MAX_CONCURRENT_SCRAPES", "4"))

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
    log.info("ClipScraper v0.2.0 starting")
    metrics["started_at"] = datetime.now(timezone.utc).isoformat()
    yield


app = FastAPI(title="ClipScraper API", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


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


async def _do_scrape(platform, fn, *args, **kwargs):
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
        "concurrent_max": MAX_CONCURRENT_SCRAPES,
        "concurrent_active": MAX_CONCURRENT_SCRAPES - scrape_semaphore._value,
        "proxy": "configured" if PROXY_URL else "direct",
    }


@app.get("/metrics")
async def metrics_endpoint():
    lines = [
        f"clipscraper_scrapes_total {metrics['scrapes_total']}",
        f"clipscraper_scrapes_ok {metrics['scrapes_ok']}",
        f"clipscraper_scrapes_failed {metrics['scrapes_failed']}",
        f"clipscraper_scrapes_cached {metrics['scrapes_cached']}",
    ]
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


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")
MAINEOF

# ── scrapers/__init__.py ─────────────────────────────────────────
touch scrapers/__init__.py

# ── scrapers/youtube.py ──────────────────────────────────────────
cat > scrapers/youtube.py <<'YTEOF'
"""YouTube scraper - YouTube Data API v3."""
import os
import logging
from typing import Optional
import httpx

log = logging.getLogger("scrapers.youtube")
YOUTUBE_API_KEY = (os.environ.get("YOUTUBE_API_KEY") or "").strip() or None


async def scrape_youtube(username: str, max_videos: int = 30) -> dict:
    if not YOUTUBE_API_KEY:
        raise RuntimeError("YOUTUBE_API_KEY non configure")
    username = username.lstrip("@")
    async with httpx.AsyncClient(timeout=15) as c:
        channel_id = await _resolve_channel(c, username)
        if not channel_id:
            raise RuntimeError(f"Channel YouTube @{username} introuvable")
        profile = await _fetch_channel(c, channel_id)
        videos = await _fetch_recent_videos(c, channel_id, max_videos)
        return {"username": username, "platform": "youtube", "profile": profile, "videos": videos}


async def _resolve_channel(c, username):
    r = await c.get("https://www.googleapis.com/youtube/v3/search",
        params={"part": "snippet", "q": username, "type": "channel", "maxResults": 5, "key": YOUTUBE_API_KEY})
    items = (r.json() or {}).get("items", [])
    if items:
        return items[0].get("snippet", {}).get("channelId") or items[0].get("id", {}).get("channelId")
    return None


async def _fetch_channel(c, channel_id):
    r = await c.get("https://www.googleapis.com/youtube/v3/channels",
        params={"id": channel_id, "part": "snippet,statistics,contentDetails", "key": YOUTUBE_API_KEY})
    items = (r.json() or {}).get("items", [])
    if not items:
        return {"nickname": channel_id, "follower_count": 0, "video_count": 0}
    item = items[0]
    snippet = item.get("snippet", {})
    stats = item.get("statistics", {})
    return {
        "nickname": snippet.get("title", ""),
        "avatar": ((snippet.get("thumbnails") or {}).get("high") or {}).get("url"),
        "follower_count": int(stats.get("subscriberCount", 0)),
        "video_count": int(stats.get("videoCount", 0)),
        "view_count": int(stats.get("viewCount", 0)),
        "user_id": channel_id,
        "uploads_playlist_id": (item.get("contentDetails") or {}).get("relatedPlaylists", {}).get("uploads"),
        "signature": snippet.get("description", "")[:500],
    }


async def _fetch_recent_videos(c, channel_id, max_videos):
    r = await c.get("https://www.googleapis.com/youtube/v3/channels",
        params={"id": channel_id, "part": "contentDetails", "key": YOUTUBE_API_KEY})
    items = (r.json() or {}).get("items", [])
    if not items:
        return []
    uploads_id = ((items[0].get("contentDetails") or {}).get("relatedPlaylists") or {}).get("uploads")
    if not uploads_id:
        return []
    r = await c.get("https://www.googleapis.com/youtube/v3/playlistItems",
        params={"playlistId": uploads_id, "part": "snippet,contentDetails", "maxResults": min(max_videos, 50), "key": YOUTUBE_API_KEY})
    p_items = (r.json() or {}).get("items", [])
    if not p_items:
        return []
    video_ids = [(item.get("contentDetails") or {}).get("videoId") for item in p_items if item.get("contentDetails")]
    video_ids = [v for v in video_ids if v]
    r = await c.get("https://www.googleapis.com/youtube/v3/videos",
        params={"id": ",".join(video_ids), "part": "snippet,statistics", "key": YOUTUBE_API_KEY})
    v_items = (r.json() or {}).get("items", [])
    videos = []
    for v in v_items:
        snip = v.get("snippet", {})
        stats = v.get("statistics", {})
        videos.append({
            "platform_video_id": v.get("id"),
            "url": f"https://www.youtube.com/watch?v={v.get('id')}",
            "title": (snip.get("title") or "")[:200] or None,
            "thumbnail_url": ((snip.get("thumbnails") or {}).get("medium") or {}).get("url"),
            "views": int(stats.get("viewCount", 0)),
            "likes": int(stats.get("likeCount", 0)),
            "comments": int(stats.get("commentCount", 0)),
            "published_at": snip.get("publishedAt"),
        })
    return videos
YTEOF

# ── scrapers/tiktok.py ───────────────────────────────────────────
cat > scrapers/tiktok.py <<'TTEOF'
"""TikTok scraper avec fallbacks TikWm + Playwright."""
import logging
import json
from typing import Optional
import httpx

log = logging.getLogger("scrapers.tiktok")


async def scrape_tiktok(username: str, max_videos: int = 30, proxy: Optional[str] = None) -> dict:
    username = username.lstrip("@")
    last_err = None
    try:
        result = await _scrape_via_tikwm(username, max_videos, proxy)
        if result and result.get("videos"):
            log.info(f"TikTok @{username} via TikWm: {len(result['videos'])} videos")
            return result
    except Exception as e:
        last_err = f"TikWm: {e}"
    try:
        result = await _scrape_via_playwright(username, max_videos, proxy)
        if result and result.get("videos"):
            log.info(f"TikTok @{username} via Playwright: {len(result['videos'])} videos")
            return result
    except Exception as e:
        last_err = f"Playwright: {e}"
    raise RuntimeError(f"All TikTok strategies failed. Last: {last_err}")


async def _scrape_via_tikwm(username, max_videos, proxy):
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        "Origin": "https://www.tikwm.com",
        "Referer": "https://www.tikwm.com/",
    }
    proxies = {"http://": proxy, "https://": proxy} if proxy else None
    async with httpx.AsyncClient(timeout=20, headers=headers, proxies=proxies) as c:
        info_r = await c.get("https://www.tikwm.com/api/user/info", params={"unique_id": username, "hd": 1})
        info = info_r.json()
        if info.get("code") != 0:
            raise RuntimeError(f"TikWm code={info.get('code')}")
        user_data = (info.get("data") or {}).get("user", {})
        stats = (info.get("data") or {}).get("stats", {})
        profile = {
            "nickname": user_data.get("nickname") or user_data.get("nickName") or username,
            "avatar": user_data.get("avatarLarger") or user_data.get("avatarMedium"),
            "follower_count": int(stats.get("followerCount", 0)),
            "following_count": int(stats.get("followingCount", 0)),
            "video_count": int(stats.get("videoCount", 0)),
            "heart_count": int(stats.get("heartCount", 0)),
            "user_id": user_data.get("id"),
            "sec_uid": user_data.get("secUid"),
            "verified": bool(user_data.get("verified", False)),
            "signature": user_data.get("signature", ""),
        }
        posts_r = await c.get("https://www.tikwm.com/api/user/posts",
            params={"unique_id": username, "count": min(max_videos, 35), "cursor": 0, "hd": 1})
        posts = posts_r.json()
        if posts.get("code") != 0:
            return {"username": username, "platform": "tiktok", "profile": profile, "videos": []}
        items = (posts.get("data") or {}).get("videos") or (posts.get("data") or {}).get("data") or []
        videos = []
        for item in items[:max_videos]:
            vid_id = str(item.get("video_id") or item.get("aweme_id") or item.get("id") or "")
            if not vid_id:
                continue
            videos.append({
                "platform_video_id": vid_id,
                "url": f"https://www.tiktok.com/@{username}/video/{vid_id}",
                "title": (item.get("title") or "")[:200] or None,
                "thumbnail_url": item.get("cover") or item.get("origin_cover"),
                "views": int(item.get("play_count") or 0),
                "likes": int(item.get("digg_count") or 0),
                "comments": int(item.get("comment_count") or 0),
                "shares": int(item.get("share_count") or 0),
                "duration": int(item.get("duration") or 0),
                "published_at": _ts_to_iso(item.get("create_time")),
            })
        return {"username": username, "platform": "tiktok", "profile": profile, "videos": videos}


async def _scrape_via_playwright(username, max_videos, proxy):
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise RuntimeError("playwright not installed")
    intercepted = {"items": [], "user_info": None, "sigi_state": None}
    launch_args = {"headless": True, "args": ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"]}
    if proxy:
        launch_args["proxy"] = {"server": proxy}
    async with async_playwright() as p:
        browser = await p.chromium.launch(**launch_args)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}, locale="fr-FR")
        await ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', { get: () => undefined });")
        page = await ctx.new_page()

        async def on_response(response):
            url = response.url
            if "/item_list/" in url or "/api/post/item_list" in url:
                try:
                    data = await response.json()
                    items = data.get("itemList") or data.get("aweme_list") or []
                    intercepted["items"].extend(items)
                except Exception:
                    pass

        page.on("response", on_response)
        try:
            await page.goto(f"https://www.tiktok.com/@{username}", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(3000)
            for _ in range(3):
                await page.evaluate("window.scrollBy(0, document.body.scrollHeight)")
                await page.wait_for_timeout(1500)
            sigi = await page.evaluate("""() => {
                const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__') || document.getElementById('SIGI_STATE');
                return el ? el.textContent : null;
            }""")
            if sigi:
                try:
                    intercepted["sigi_state"] = json.loads(sigi)
                except Exception:
                    pass
        finally:
            await browser.close()
    return _parse_playwright_result(username, intercepted, max_videos)


def _parse_playwright_result(username, intercepted, max_videos):
    profile = {"nickname": username, "avatar": None, "follower_count": 0, "following_count": 0,
        "video_count": 0, "heart_count": 0, "user_id": None, "sec_uid": None, "verified": False, "signature": ""}
    sigi = intercepted.get("sigi_state") or {}
    user_module = (sigi.get("__DEFAULT_SCOPE__") or {}).get("webapp.user-detail", {}) or sigi.get("UserModule", {})
    if user_module:
        users = user_module.get("userInfo", {})
        user = users.get("user", {}) if isinstance(users, dict) else {}
        stats = users.get("stats", {}) if isinstance(users, dict) else {}
        if user:
            profile.update({
                "nickname": user.get("nickname", username),
                "avatar": user.get("avatarLarger") or user.get("avatarMedium"),
                "follower_count": int(stats.get("followerCount", 0)),
                "following_count": int(stats.get("followingCount", 0)),
                "video_count": int(stats.get("videoCount", 0)),
                "heart_count": int(stats.get("heartCount", 0)),
                "user_id": user.get("id"),
                "sec_uid": user.get("secUid"),
                "verified": bool(user.get("verified", False)),
                "signature": user.get("signature", ""),
            })
    raw_items = intercepted.get("items", [])
    seen_ids = set()
    videos = []
    for item in raw_items:
        vid_id = str(item.get("id") or item.get("aweme_id") or "")
        if not vid_id or vid_id in seen_ids:
            continue
        seen_ids.add(vid_id)
        stats = item.get("stats") or item.get("statistics") or {}
        videos.append({
            "platform_video_id": vid_id,
            "url": f"https://www.tiktok.com/@{username}/video/{vid_id}",
            "title": (item.get("desc") or item.get("title") or "")[:200] or None,
            "thumbnail_url": (item.get("video", {}) or {}).get("cover"),
            "views": int(stats.get("playCount") or stats.get("play_count") or 0),
            "likes": int(stats.get("diggCount") or stats.get("digg_count") or 0),
            "comments": int(stats.get("commentCount") or stats.get("comment_count") or 0),
            "shares": int(stats.get("shareCount") or stats.get("share_count") or 0),
            "published_at": _ts_to_iso(item.get("createTime") or item.get("create_time")),
        })
        if len(videos) >= max_videos:
            break
    return {"username": username, "platform": "tiktok", "profile": profile, "videos": videos}


def _ts_to_iso(ts):
    if ts is None:
        return None
    try:
        from datetime import datetime, timezone as tz
        return datetime.fromtimestamp(int(ts), tz=tz.utc).isoformat()
    except Exception:
        return None
TTEOF

# ── scrapers/instagram.py ────────────────────────────────────────
cat > scrapers/instagram.py <<'IGEOF'
"""Instagram scraper - WebAPI + Playwright fallback."""
import os
import logging
from typing import Optional
import httpx

log = logging.getLogger("scrapers.instagram")
INSTAGRAM_SESSION_ID = (os.environ.get("INSTAGRAM_SESSION_ID") or "").strip() or None


async def scrape_instagram(username: str, max_videos: int = 30, proxy: Optional[str] = None) -> dict:
    username = username.lstrip("@")
    last_err = None
    try:
        result = await _scrape_via_web_api(username, max_videos, proxy)
        if result and result.get("profile"):
            log.info(f"Instagram @{username} via web API: {len(result.get('videos', []))} videos")
            return result
    except Exception as e:
        last_err = f"WebAPI: {e}"
    try:
        result = await _scrape_via_playwright(username, max_videos, proxy)
        if result and result.get("profile"):
            log.info(f"Instagram @{username} via Playwright: {len(result.get('videos', []))} videos")
            return result
    except Exception as e:
        last_err = f"Playwright: {e}"
    raise RuntimeError(f"All Instagram strategies failed. Last: {last_err}")


async def _scrape_via_web_api(username, max_videos, proxy):
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 295.0.0.32.119",
        "X-IG-App-ID": "936619743392459",
        "Accept": "*/*",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": f"https://www.instagram.com/{username}/",
    }
    cookies = {}
    if INSTAGRAM_SESSION_ID:
        cookies["sessionid"] = INSTAGRAM_SESSION_ID
    proxies = {"http://": proxy, "https://": proxy} if proxy else None
    async with httpx.AsyncClient(timeout=20, headers=headers, cookies=cookies, proxies=proxies) as c:
        r = await c.get(f"https://www.instagram.com/api/v1/users/web_profile_info/?username={username}")
        if r.status_code == 401:
            raise RuntimeError("401 Unauthorized")
        if r.status_code == 429:
            raise RuntimeError("429 Rate limited")
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}")
        data = r.json()
        user = (data.get("data") or {}).get("user") or {}
        if not user:
            raise RuntimeError("User not found")
        profile = {
            "nickname": user.get("full_name") or username,
            "avatar": user.get("profile_pic_url_hd") or user.get("profile_pic_url"),
            "follower_count": int((user.get("edge_followed_by") or {}).get("count", 0)),
            "following_count": int((user.get("edge_follow") or {}).get("count", 0)),
            "video_count": int((user.get("edge_owner_to_timeline_media") or {}).get("count", 0)),
            "user_id": user.get("id") or user.get("pk"),
            "verified": bool(user.get("is_verified", False)),
            "signature": user.get("biography", ""),
            "private": bool(user.get("is_private", False)),
        }
        videos = []
        edges = ((user.get("edge_owner_to_timeline_media") or {}).get("edges") or [])
        for edge in edges[:max_videos]:
            node = edge.get("node") or {}
            shortcode = node.get("shortcode")
            if not shortcode:
                continue
            videos.append({
                "platform_video_id": shortcode,
                "url": f"https://www.instagram.com/p/{shortcode}/",
                "title": _extract_caption(node)[:200] or None,
                "thumbnail_url": node.get("thumbnail_src") or node.get("display_url"),
                "views": int(node.get("video_view_count") or node.get("video_play_count") or 0),
                "likes": int((node.get("edge_liked_by") or {}).get("count")
                             or (node.get("edge_media_preview_like") or {}).get("count", 0)),
                "comments": int((node.get("edge_media_to_comment") or {}).get("count", 0)),
                "is_video": bool(node.get("is_video", False)),
                "published_at": _ts_to_iso(node.get("taken_at_timestamp")),
            })
        return {"username": username, "platform": "instagram", "profile": profile, "videos": videos}


async def _scrape_via_playwright(username, max_videos, proxy):
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise RuntimeError("playwright not installed")
    intercepted = {"profile_data": None}
    launch_args = {"headless": True, "args": ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"]}
    if proxy:
        launch_args["proxy"] = {"server": proxy}
    async with async_playwright() as p:
        browser = await p.chromium.launch(**launch_args)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}, locale="fr-FR")
        if INSTAGRAM_SESSION_ID:
            await ctx.add_cookies([{"name": "sessionid", "value": INSTAGRAM_SESSION_ID,
                "domain": ".instagram.com", "path": "/", "secure": True, "httpOnly": True}])
        await ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', { get: () => undefined });")
        page = await ctx.new_page()

        async def on_response(response):
            if "/web_profile_info/" in response.url:
                try:
                    intercepted["profile_data"] = await response.json()
                except Exception:
                    pass

        page.on("response", on_response)
        try:
            await page.goto(f"https://www.instagram.com/{username}/", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(3000)
        finally:
            await browser.close()
    data = intercepted.get("profile_data") or {}
    user = (data.get("data") or {}).get("user") or {}
    if not user:
        raise RuntimeError("Profile not loaded")
    profile = {
        "nickname": user.get("full_name") or username,
        "avatar": user.get("profile_pic_url_hd") or user.get("profile_pic_url"),
        "follower_count": int((user.get("edge_followed_by") or {}).get("count", 0)),
        "video_count": int((user.get("edge_owner_to_timeline_media") or {}).get("count", 0)),
        "user_id": user.get("id"),
        "verified": bool(user.get("is_verified", False)),
        "signature": user.get("biography", ""),
        "private": bool(user.get("is_private", False)),
    }
    videos = []
    edges = ((user.get("edge_owner_to_timeline_media") or {}).get("edges") or [])
    for edge in edges[:max_videos]:
        node = edge.get("node") or {}
        shortcode = node.get("shortcode")
        if not shortcode:
            continue
        videos.append({
            "platform_video_id": shortcode,
            "url": f"https://www.instagram.com/p/{shortcode}/",
            "title": _extract_caption(node)[:200] or None,
            "thumbnail_url": node.get("thumbnail_src") or node.get("display_url"),
            "views": int(node.get("video_view_count") or 0),
            "likes": int((node.get("edge_liked_by") or {}).get("count", 0)),
            "comments": int((node.get("edge_media_to_comment") or {}).get("count", 0)),
            "is_video": bool(node.get("is_video", False)),
            "published_at": _ts_to_iso(node.get("taken_at_timestamp")),
        })
    return {"username": username, "platform": "instagram", "profile": profile, "videos": videos}


def _extract_caption(node):
    edges = (node.get("edge_media_to_caption") or {}).get("edges") or []
    if not edges:
        return ""
    return (edges[0].get("node") or {}).get("text", "")


def _ts_to_iso(ts):
    if ts is None:
        return None
    try:
        from datetime import datetime, timezone as tz
        return datetime.fromtimestamp(int(ts), tz=tz.utc).isoformat()
    except Exception:
        return None
IGEOF

echo "[OK] Tous les fichiers sont crees."

# ── Installer Docker ─────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo "[..] Installation Docker (1-2 min)..."
    curl -fsSL https://get.docker.com | sh > /tmp/docker-install.log 2>&1
    echo "[OK] Docker installe."
else
    echo "[OK] Docker deja installe."
fi

# ── Build et lancement ───────────────────────────────────────────
echo "[..] Build de l'image Docker (5-10 min - Playwright Chromium est gros)..."
cd /opt/clip-scraper
docker compose build > /tmp/docker-build.log 2>&1

echo "[..] Demarrage du service..."
docker compose up -d

echo "[..] Attente demarrage (60s)..."
sleep 60

# ── Test sante ───────────────────────────────────────────────────
HEALTH=$(curl -s http://localhost:8001/health || echo "FAIL")
if [[ "$HEALTH" == *"\"status\":\"ok\""* ]]; then
    echo ""
    echo "============================================================"
    echo "  [OK] ClipScraper TOURNE !"
    echo "============================================================"
    echo ""
    echo "  Reponse healthcheck :"
    echo "  $HEALTH"
    echo ""
    echo "  IP publique : 187.124.222.186"
    echo "  Port : 8001"
    echo "  Cle API : cd-prod-ac29858a696cf2c1a642dd1c9f607628fcd8b0878cc3c704"
    echo ""
    echo "  Etape suivante : configurer DNS + HTTPS (voir INSTRUCTIONS_DEMAIN.md)"
    echo ""
else
    echo ""
    echo "[ERREUR] Service ne repond pas. Logs :"
    docker logs clip-scraper --tail 50
fi

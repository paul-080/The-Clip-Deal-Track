"""TikTok scraper — strategy stack avec fallbacks pour résilience.

Ordre de tentatives (du plus rapide/léger au plus lourd) :
1. TikWm public API (HTTP, ~200ms, marche depuis IP résidentielle/Europe)
2. TikTok web API avec cookies du navigateur (Playwright cookies puis HTTP)
3. Playwright fallback (browser headless complet, plus lent mais le plus fiable)

Renvoie format unifié :
{
  "username": "...",
  "platform": "tiktok",
  "profile": {nickname, avatar, follower_count, video_count, ...},
  "videos": [{platform_video_id, url, title, views, likes, comments, ...}]
}
"""
import asyncio
import logging
import re
import json
from typing import Optional
import httpx

log = logging.getLogger("scrapers.tiktok")


async def scrape_tiktok(username: str, max_videos: int = 30, proxy: Optional[str] = None) -> dict:
    """Scrape un profil TikTok complet. Tente 3 stratégies en cascade."""
    username = username.lstrip("@")
    last_err = None

    # Stratégie 1 : TikWm
    try:
        result = await _scrape_via_tikwm(username, max_videos, proxy)
        if result and result.get("videos"):
            log.info(f"TikTok @{username} via TikWm: {len(result['videos'])} videos")
            return result
    except Exception as e:
        last_err = f"TikWm: {e}"
        log.debug(f"TikWm failed for @{username}: {e}")

    # Stratégie 2 : Playwright (le plus fiable)
    try:
        result = await _scrape_via_playwright(username, max_videos, proxy)
        if result and result.get("videos"):
            log.info(f"TikTok @{username} via Playwright: {len(result['videos'])} videos")
            return result
    except Exception as e:
        last_err = f"Playwright: {e}"
        log.warning(f"Playwright failed for @{username}: {e}")

    raise RuntimeError(f"All TikTok strategies failed. Last error: {last_err}")


async def _scrape_via_tikwm(username: str, max_videos: int, proxy: Optional[str]) -> Optional[dict]:
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        "Origin": "https://www.tikwm.com",
        "Referer": "https://www.tikwm.com/",
    }
    proxies = {"http://": proxy, "https://": proxy} if proxy else None
    async with httpx.AsyncClient(timeout=20, headers=headers, proxies=proxies) as c:
        # 1. Profil
        info_r = await c.get(
            "https://www.tikwm.com/api/user/info",
            params={"unique_id": username, "hd": 1},
        )
        info = info_r.json()
        if info.get("code") != 0:
            raise RuntimeError(f"TikWm user/info code={info.get('code')} msg={info.get('msg')}")
        user_data = (info.get("data") or {}).get("user", {})
        stats = (info.get("data") or {}).get("stats", {})
        profile = {
            "nickname": user_data.get("nickname") or user_data.get("nickName") or username,
            "avatar": user_data.get("avatarLarger") or user_data.get("avatarMedium") or user_data.get("avatarThumb"),
            "follower_count": int(stats.get("followerCount", 0)),
            "following_count": int(stats.get("followingCount", 0)),
            "video_count": int(stats.get("videoCount", 0)),
            "heart_count": int(stats.get("heartCount", 0)),
            "user_id": user_data.get("id"),
            "sec_uid": user_data.get("secUid"),
            "verified": bool(user_data.get("verified", False)),
            "signature": user_data.get("signature", ""),
        }

        # 2. Posts
        posts_r = await c.get(
            "https://www.tikwm.com/api/user/posts",
            params={"unique_id": username, "count": min(max_videos, 35), "cursor": 0, "hd": 1},
        )
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


async def _scrape_via_playwright(username: str, max_videos: int, proxy: Optional[str]) -> Optional[dict]:
    """Fallback Playwright : ouvre le profil TikTok dans Chrome headless et intercepte les API calls."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise RuntimeError("playwright not installed")

    intercepted: dict = {"items": [], "user_info": None, "sigi_state": None}

    launch_args = {
        "headless": True,
        "args": ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
    }
    if proxy:
        launch_args["proxy"] = {"server": proxy}

    async with async_playwright() as p:
        browser = await p.chromium.launch(**launch_args)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
            locale="fr-FR",
        )
        # Stealth patches basiques
        await ctx.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr', 'en'] });
        """)
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
            if "/user/detail/" in url:
                try:
                    data = await response.json()
                    intercepted["user_info"] = data
                except Exception:
                    pass

        page.on("response", on_response)

        try:
            await page.goto(f"https://www.tiktok.com/@{username}", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(3000)  # let lazy loads fire
            # Scroll to trigger more loads
            for _ in range(3):
                await page.evaluate("window.scrollBy(0, document.body.scrollHeight)")
                await page.wait_for_timeout(1500)
            # Extract SIGI state from page
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

    # Parse intercepted data
    return _parse_playwright_result(username, intercepted, max_videos)


def _parse_playwright_result(username: str, intercepted: dict, max_videos: int) -> dict:
    profile = {
        "nickname": username, "avatar": None, "follower_count": 0, "following_count": 0,
        "video_count": 0, "heart_count": 0, "user_id": None, "sec_uid": None,
        "verified": False, "signature": "",
    }
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

    # Videos from intercepted item_list responses
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


def _ts_to_iso(ts) -> Optional[str]:
    if ts is None:
        return None
    try:
        from datetime import datetime, timezone as tz
        return datetime.fromtimestamp(int(ts), tz=tz.utc).isoformat()
    except Exception:
        return None

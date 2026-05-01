"""Instagram scraper — strategy stack avec fallbacks.

Stratégies (ordre) :
1. Instagram Web Profile API (HTTP) avec ou sans session cookie
2. Playwright (browser headless) — fallback si l'API web bloque

Cookie sessionid : variable d'env INSTAGRAM_SESSION_ID (recommandé pour bypass anti-bot).
"""
import os
import asyncio
import logging
import json
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
        log.debug(f"Instagram WebAPI failed for @{username}: {e}")

    try:
        result = await _scrape_via_playwright(username, max_videos, proxy)
        if result and result.get("profile"):
            log.info(f"Instagram @{username} via Playwright: {len(result.get('videos', []))} videos")
            return result
    except Exception as e:
        last_err = f"Playwright: {e}"
        log.warning(f"Instagram Playwright failed for @{username}: {e}")

    raise RuntimeError(f"All Instagram strategies failed. Last: {last_err}")


async def _scrape_via_web_api(username: str, max_videos: int, proxy: Optional[str]) -> Optional[dict]:
    """Appelle https://www.instagram.com/api/v1/users/web_profile_info/?username=X"""
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
        r = await c.get(
            f"https://www.instagram.com/api/v1/users/web_profile_info/?username={username}"
        )
        if r.status_code == 401:
            raise RuntimeError("401 Unauthorized — session cookie required or invalid")
        if r.status_code == 429:
            raise RuntimeError("429 Rate limited by Instagram")
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

        # Videos from edge_owner_to_timeline_media
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
                # CASCADE 2026 : Insta a unifie Plays+Impressions en "Views" gonflé en avril 2025
                "views": int(
                    node.get("ig_play_count")
                    or node.get("fb_play_count")
                    or node.get("view_count")
                    or node.get("play_count")
                    or node.get("video_play_count")
                    or node.get("video_view_count")
                    or 0
                ),
                "likes": int((node.get("edge_liked_by") or {}).get("count")
                             or (node.get("edge_media_preview_like") or {}).get("count", 0)),
                "comments": int((node.get("edge_media_to_comment") or {}).get("count", 0)),
                "is_video": bool(node.get("is_video", False)),
                "published_at": _ts_to_iso(node.get("taken_at_timestamp")),
            })

        return {"username": username, "platform": "instagram", "profile": profile, "videos": videos}


async def _scrape_via_playwright(username: str, max_videos: int, proxy: Optional[str]) -> Optional[dict]:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise RuntimeError("playwright not installed")

    intercepted: dict = {"profile_data": None, "media_items": []}

    launch_args = {
        "headless": True,
        "args": ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
    }
    if proxy:
        launch_args["proxy"] = {"server": proxy}

    async with async_playwright() as p:
        browser = await p.chromium.launch(**launch_args)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
            locale="fr-FR",
        )
        if INSTAGRAM_SESSION_ID:
            await ctx.add_cookies([{
                "name": "sessionid", "value": INSTAGRAM_SESSION_ID,
                "domain": ".instagram.com", "path": "/", "secure": True, "httpOnly": True,
            }])
        await ctx.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        """)
        page = await ctx.new_page()

        async def on_response(response):
            url = response.url
            if "/web_profile_info/" in url:
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
            # play_count (nouveau, ce que Insta affiche) > video_view_count (ancien, plus bas)
            "views": int(node.get("play_count") or node.get("video_play_count") or node.get("video_view_count") or 0),
            "likes": int((node.get("edge_liked_by") or {}).get("count", 0)),
            "comments": int((node.get("edge_media_to_comment") or {}).get("count", 0)),
            "is_video": bool(node.get("is_video", False)),
            "published_at": _ts_to_iso(node.get("taken_at_timestamp")),
        })

    return {"username": username, "platform": "instagram", "profile": profile, "videos": videos}


def _extract_caption(node: dict) -> str:
    edges = (node.get("edge_media_to_caption") or {}).get("edges") or []
    if not edges:
        return ""
    return (edges[0].get("node") or {}).get("text", "")


def _ts_to_iso(ts) -> Optional[str]:
    if ts is None:
        return None
    try:
        from datetime import datetime, timezone as tz
        return datetime.fromtimestamp(int(ts), tz=tz.utc).isoformat()
    except Exception:
        return None

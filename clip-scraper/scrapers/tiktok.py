"""TikTok scraper avec stratégie HTTP directe + fallbacks."""
import asyncio
import logging
import json
import re
from typing import Optional
from urllib.parse import urlparse
import httpx

log = logging.getLogger("scrapers.tiktok")


def _parse_proxy_for_playwright(proxy_url):
    if not proxy_url:
        return None
    p = urlparse(proxy_url)
    if not p.hostname or not p.port:
        return None
    cfg = {"server": f"{p.scheme or 'http'}://{p.hostname}:{p.port}"}
    if p.username:
        cfg["username"] = p.username
    if p.password:
        cfg["password"] = p.password
    return cfg


async def scrape_tiktok(username: str, max_videos: int = 30, proxy: Optional[str] = None) -> dict:
    username = username.lstrip("@")
    last_err = None
    log.info(f"TikTok scrape @{username} (proxy={'YES' if proxy else 'NO'})")

    # Strategy 0a: yt-dlp (best for small accounts that block HTML scraping)
    try:
        result = await _scrape_via_ytdlp(username, max_videos, proxy)
        if result and result.get("videos"):
            log.info(f"TikTok @{username} via yt-dlp: {len(result['videos'])} videos")
            return result
    except Exception as e:
        last_err = f"ytdlp: {e}"
        log.warning(f"yt-dlp failed for @{username}: {e}")

    # Strategy 0b: HTTP direct (fastest, works for medium/large accounts via proxy)
    try:
        result = await _scrape_via_http_direct(username, max_videos, proxy)
        if result and result.get("videos"):
            log.info(f"TikTok @{username} via HTTP direct: {len(result['videos'])} videos")
            return result
        elif result:
            log.info(f"TikTok @{username} via HTTP direct: profile OK but 0 videos")
    except Exception as e:
        last_err = f"HTTPdirect: {e}"
        log.warning(f"HTTP direct failed for @{username}: {e}")

    # Strategy 1: TikWm
    try:
        result = await _scrape_via_tikwm(username, max_videos, proxy)
        if result and result.get("videos"):
            log.info(f"TikTok @{username} via TikWm: {len(result['videos'])} videos")
            return result
    except Exception as e:
        last_err = f"TikWm: {e}"
        log.warning(f"TikWm failed for @{username}: {e}")

    # Strategy 2: Playwright (long fallback)
    try:
        result = await _scrape_via_playwright(username, max_videos, proxy)
        if result and result.get("videos"):
            log.info(f"TikTok @{username} via Playwright: {len(result['videos'])} videos")
            return result
    except Exception as e:
        last_err = f"Playwright: {e}"
        log.warning(f"Playwright failed for @{username}: {e}")

    raise RuntimeError(f"All TikTok strategies failed. Last: {last_err}")


async def _scrape_via_ytdlp(username: str, max_videos: int, proxy: Optional[str]) -> Optional[dict]:
    """yt-dlp strategy: works well for small accounts where HTML is empty."""
    try:
        import yt_dlp
    except ImportError:
        raise RuntimeError("yt-dlp not installed")

    loop = asyncio.get_event_loop()

    def _extract():
        strategies = [
            {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                "Referer": "https://www.tiktok.com/",
            },
            {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": "https://www.tiktok.com/",
                "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
            },
        ]
        for headers in strategies:
            opts = {
                "quiet": True,
                "skip_download": True,
                "extract_flat": True,
                "playlistend": max_videos,
                "ignoreerrors": True,
                "no_warnings": True,
                "http_headers": headers,
            }
            if proxy:
                opts["proxy"] = proxy
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(f"https://www.tiktok.com/@{username}", download=False)
                if not info:
                    continue
                entries = info.get("entries") or []
                if not entries:
                    continue
                videos = []
                for e in entries:
                    if not e:
                        continue
                    vid_id = str(e.get("id", ""))
                    if not vid_id:
                        continue
                    videos.append({
                        "platform_video_id": vid_id,
                        "url": e.get("webpage_url") or e.get("url") or f"https://www.tiktok.com/@{username}/video/{vid_id}",
                        "title": (e.get("title") or "")[:200] or None,
                        "thumbnail_url": e.get("thumbnail"),
                        "views": int(e.get("view_count") or 0),
                        "likes": int(e.get("like_count") or 0),
                        "comments": int(e.get("comment_count") or 0),
                        "shares": int(e.get("repost_count") or 0),
                        "duration": int(e.get("duration") or 0),
                        "published_at": _ts_to_iso(e.get("timestamp")),
                    })
                if not videos:
                    continue
                profile = {
                    "nickname": info.get("uploader") or info.get("channel") or username,
                    "avatar": info.get("thumbnail"),
                    "follower_count": int(info.get("channel_follower_count") or 0),
                    "following_count": 0,
                    "video_count": len(entries),
                    "heart_count": 0,
                    "user_id": info.get("uploader_id"),
                    "sec_uid": None,
                    "verified": False,
                    "signature": (info.get("description") or "")[:500],
                }
                return {"username": username, "platform": "tiktok", "profile": profile, "videos": videos}
            except Exception as e:
                log.debug(f"yt-dlp strategy failed for @{username}: {e}")
                continue
        return None

    return await loop.run_in_executor(None, _extract)


async def _scrape_via_http_direct(username: str, max_videos: int, proxy: Optional[str]) -> Optional[dict]:
    """Fastest: HTTP GET tiktok.com profile, parse SIGI_STATE from HTML."""
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
    client_kwargs = {"timeout": 30, "headers": headers, "follow_redirects": True}
    if proxy:
        client_kwargs["proxies"] = {"http://": proxy, "https://": proxy}

    async with httpx.AsyncClient(**client_kwargs) as c:
        r = await c.get(f"https://www.tiktok.com/@{username}")
        if r.status_code != 200:
            raise RuntimeError(f"TikTok HTTP {r.status_code}")
        html = r.text

    sigi = None
    m = re.search(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.+?)</script>', html, re.DOTALL)
    if m:
        try:
            sigi = json.loads(m.group(1))
        except Exception as e:
            log.debug(f"UNIVERSAL_DATA parse error: {e}")
    if not sigi:
        m = re.search(r'<script id="SIGI_STATE"[^>]*>(.+?)</script>', html, re.DOTALL)
        if m:
            try:
                sigi = json.loads(m.group(1))
            except Exception as e:
                log.debug(f"SIGI_STATE parse error: {e}")
    if not sigi:
        log.info(f"SIGI_STATE not found, fallback regex extraction for @{username}")
        return _extract_videos_from_raw_html(username, html, max_videos)

    intercepted = {"items": [], "user_info": None, "sigi_state": sigi}

    item_module = (sigi.get("__DEFAULT_SCOPE__") or {}).get("webapp.video-detail", {}) or sigi.get("ItemModule", {})
    item_list = (sigi.get("__DEFAULT_SCOPE__") or {}).get("webapp.user-detail", {})
    if isinstance(item_module, dict) and item_module:
        intercepted["items"] = list(item_module.values())

    if not intercepted["items"] and isinstance(item_list, dict):
        ul = item_list.get("itemList") or []
        if isinstance(ul, list):
            intercepted["items"] = ul

    result = _parse_playwright_result(username, intercepted, max_videos)
    if not result.get("videos"):
        log.info(f"SIGI parsed but 0 videos, fallback regex for @{username}")
        return _extract_videos_from_raw_html(username, html, max_videos)
    return result


def _extract_videos_from_raw_html(username: str, html: str, max_videos: int) -> dict:
    """Fallback: extract videos via regex on raw HTML (when SIGI_STATE not found or empty)."""
    profile = {
        "nickname": username, "avatar": None, "follower_count": 0, "following_count": 0,
        "video_count": 0, "heart_count": 0, "user_id": None, "sec_uid": None,
        "verified": False, "signature": "",
    }
    m = re.search(r'"nickname":"([^"\\]+)"', html)
    if m:
        profile["nickname"] = m.group(1)
    m = re.search(r'"followerCount":(\d+)', html)
    if m:
        profile["follower_count"] = int(m.group(1))
    m = re.search(r'"followingCount":(\d+)', html)
    if m:
        profile["following_count"] = int(m.group(1))
    m = re.search(r'"videoCount":(\d+)', html)
    if m:
        profile["video_count"] = int(m.group(1))
    m = re.search(r'"heartCount":(\d+)', html)
    if m:
        profile["heart_count"] = int(m.group(1))
    m = re.search(r'"avatarLarger":"([^"]+)"', html)
    if m:
        profile["avatar"] = m.group(1).replace("\\u002F", "/").replace("\\/", "/")
    m = re.search(r'"secUid":"([^"]+)"', html)
    if m:
        profile["sec_uid"] = m.group(1)
    m = re.search(r'"signature":"([^"]+)"', html)
    if m:
        profile["signature"] = m.group(1).replace("\\u002F", "/").replace("\\/", "/")
    m = re.search(r'"verified":(true|false)', html)
    if m:
        profile["verified"] = m.group(1) == "true"

    # SAFETY : ne matche que les blocs qui ressemblent à un VRAI item video
    # On exige que le bloc contienne TOUS les marqueurs spécifiques video : "playCount" + "createTime" + "desc" ou "video":{
    # Ça évite de matcher l'objet user-stats du profil (qui contient followerCount + heartCount mais pas createTime/desc).
    videos = []
    seen = set()
    # Cherche les blocs qui ont la structure d'un item video : "id":"<digits>" suivi de près par playCount + createTime
    for m in re.finditer(r'"(?:id|aweme_id|video_id|item_id)":"(\d{15,25})"', html):
        vid_id = m.group(1)
        if vid_id in seen:
            continue
        start = max(0, m.start() - 200)
        end = min(len(html), m.end() + 3000)
        context = html[start:end]
        # Validation stricte : c'est un video item SEULEMENT si on voit createTime ET playCount ET desc/video markers
        if not re.search(r'"createTime":\d+', context):
            continue  # account-level stats n'ont pas de createTime
        m2 = re.search(r'"playCount":(\d+)', context)
        if not m2:
            continue
        # Sanity : un video doit avoir un "desc" ou "video":{ ou "music":{ proche
        if not re.search(r'"(?:desc|video|music|imagePost|cover)"\s*:', context):
            continue
        seen.add(vid_id)
        views = int(m2.group(1))
        likes = 0
        comments = 0
        shares = 0
        title = None
        thumb = None
        published = None
        m3 = re.search(r'"diggCount":(\d+)', context)
        if m3:
            likes = int(m3.group(1))
        m3 = re.search(r'"commentCount":(\d+)', context)
        if m3:
            comments = int(m3.group(1))
        m3 = re.search(r'"shareCount":(\d+)', context)
        if m3:
            shares = int(m3.group(1))
        m3 = re.search(r'"desc":"([^"\\]*)"', context)
        if m3:
            title = m3.group(1)[:200] or None
        m3 = re.search(r'"cover":"([^"]+)"', context)
        if m3:
            thumb = m3.group(1).replace("\\u002F", "/").replace("\\/", "/")
        m3 = re.search(r'"createTime":(\d+)', context)
        if m3:
            try:
                from datetime import datetime, timezone as tz
                published = datetime.fromtimestamp(int(m3.group(1)), tz=tz.utc).isoformat()
            except Exception:
                pass
        # Sanity stat : likes ne devrait jamais être 100x supérieur aux views (signe de match account-level)
        if likes > 0 and views > 0 and likes > views * 100:
            log.warning(f"Skipping suspicious match for vid {vid_id}: views={views} likes={likes} (likely account heartCount)")
            continue
        videos.append({
            "platform_video_id": vid_id,
            "url": f"https://www.tiktok.com/@{username}/video/{vid_id}",
            "title": title,
            "thumbnail_url": thumb,
            "views": views,
            "likes": likes,
            "comments": comments,
            "shares": shares,
            "published_at": published,
        })
        if len(videos) >= max_videos:
            break

    log.info(f"Regex fallback extracted {len(videos)} videos for @{username}")
    return {"username": username, "platform": "tiktok", "profile": profile, "videos": videos}


async def _scrape_via_tikwm(username: str, max_videos: int, proxy: Optional[str]) -> Optional[dict]:
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        "Origin": "https://www.tikwm.com",
        "Referer": "https://www.tikwm.com/",
    }
    client_kwargs = {"timeout": 30, "headers": headers}
    if proxy:
        client_kwargs["proxies"] = {"http://": proxy, "https://": proxy}

    async with httpx.AsyncClient(**client_kwargs) as c:
        info_r = await c.get(
            "https://www.tikwm.com/api/user/info",
            params={"unique_id": username, "hd": 1},
        )
        try:
            info = info_r.json()
        except Exception:
            raise RuntimeError(f"TikWm user/info HTTP {info_r.status_code} not JSON")
        if info.get("code") != 0:
            raise RuntimeError(f"TikWm user/info code={info.get('code')}")
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

        posts_r = await c.get(
            "https://www.tikwm.com/api/user/posts",
            params={"unique_id": username, "count": min(max_videos, 35), "cursor": 0, "hd": 1},
        )
        try:
            posts = posts_r.json()
        except Exception:
            return {"username": username, "platform": "tiktok", "profile": profile, "videos": []}
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
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise RuntimeError("playwright not installed")

    intercepted = {"items": [], "user_info": None, "sigi_state": None}

    launch_args = {
        "headless": True,
        "args": ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
    }
    proxy_cfg = _parse_proxy_for_playwright(proxy)
    if proxy_cfg:
        launch_args["proxy"] = proxy_cfg
        log.info(f"Playwright proxy server={proxy_cfg.get('server')}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(**launch_args)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
            locale="fr-FR",
        )
        await ctx.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr', 'en'] });
        """)
        page = await ctx.new_page()
        page.set_default_timeout(90000)
        page.set_default_navigation_timeout(90000)

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
            await page.goto(f"https://www.tiktok.com/@{username}", wait_until="commit", timeout=90000)
            await page.wait_for_timeout(5000)
            for _ in range(3):
                try:
                    await page.evaluate("window.scrollBy(0, document.body.scrollHeight)")
                except Exception:
                    pass
                await page.wait_for_timeout(2000)
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

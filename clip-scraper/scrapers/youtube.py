"""YouTube scraper — utilise la YouTube Data API v3 (gratuit jusqu'à 10k requêtes/jour).
Pas de scraping browser nécessaire (API officielle).
"""
import os
import logging
from typing import Optional
import httpx

log = logging.getLogger("scrapers.youtube")

YOUTUBE_API_KEY = (os.environ.get("YOUTUBE_API_KEY") or "").strip() or None


async def scrape_youtube(username: str, max_videos: int = 30) -> dict:
    if not YOUTUBE_API_KEY:
        raise RuntimeError("YOUTUBE_API_KEY non configuré (gratuit sur console.cloud.google.com)")
    username = username.lstrip("@")

    async with httpx.AsyncClient(timeout=15) as c:
        # 1. Résoudre le handle/username en channel_id
        channel_id = await _resolve_channel(c, username)
        if not channel_id:
            raise RuntimeError(f"Channel YouTube @{username} introuvable")

        # 2. Profil
        profile = await _fetch_channel(c, channel_id)

        # 3. Vidéos récentes (uploads playlist)
        videos = await _fetch_recent_videos(c, channel_id, max_videos)

        return {
            "username": username,
            "platform": "youtube",
            "profile": profile,
            "videos": videos,
        }


async def _resolve_channel(c: httpx.AsyncClient, username: str) -> Optional[str]:
    # Via search (1 quota point)
    r = await c.get(
        "https://www.googleapis.com/youtube/v3/search",
        params={
            "part": "snippet",
            "q": username,
            "type": "channel",
            "maxResults": 5,
            "key": YOUTUBE_API_KEY,
        },
    )
    items = (r.json() or {}).get("items", [])
    if items:
        return items[0].get("snippet", {}).get("channelId") or items[0].get("id", {}).get("channelId")
    return None


async def _fetch_channel(c: httpx.AsyncClient, channel_id: str) -> dict:
    r = await c.get(
        "https://www.googleapis.com/youtube/v3/channels",
        params={
            "id": channel_id,
            "part": "snippet,statistics,contentDetails",
            "key": YOUTUBE_API_KEY,
        },
    )
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


async def _fetch_recent_videos(c: httpx.AsyncClient, channel_id: str, max_videos: int) -> list:
    # 1. Get uploads playlist via channels endpoint (already cached above ideally)
    # But we'll do it once more for simplicity
    r = await c.get(
        "https://www.googleapis.com/youtube/v3/channels",
        params={"id": channel_id, "part": "contentDetails", "key": YOUTUBE_API_KEY},
    )
    items = (r.json() or {}).get("items", [])
    if not items:
        return []
    uploads_id = ((items[0].get("contentDetails") or {}).get("relatedPlaylists") or {}).get("uploads")
    if not uploads_id:
        return []

    # 2. Get playlist items
    r = await c.get(
        "https://www.googleapis.com/youtube/v3/playlistItems",
        params={
            "playlistId": uploads_id,
            "part": "snippet,contentDetails",
            "maxResults": min(max_videos, 50),
            "key": YOUTUBE_API_KEY,
        },
    )
    p_items = (r.json() or {}).get("items", [])
    if not p_items:
        return []

    video_ids = [(item.get("contentDetails") or {}).get("videoId") for item in p_items if item.get("contentDetails")]
    video_ids = [v for v in video_ids if v]

    # 3. Get stats per video (batch)
    r = await c.get(
        "https://www.googleapis.com/youtube/v3/videos",
        params={
            "id": ",".join(video_ids),
            "part": "snippet,statistics",
            "key": YOUTUBE_API_KEY,
        },
    )
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

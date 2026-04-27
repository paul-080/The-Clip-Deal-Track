from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
import httpx
from datetime import datetime, timezone, timedelta
import json
import asyncio
import concurrent.futures
import stripe
import hashlib
import hmac
import secrets
import random
import time
from collections import defaultdict
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
try:
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False

try:
    import yt_dlp
    YT_DLP_AVAILABLE = True
except ImportError:
    YT_DLP_AVAILABLE = False

try:
    import instaloader
    INSTALOADER_AVAILABLE = True
except ImportError:
    INSTALOADER_AVAILABLE = False

PLAYWRIGHT_AVAILABLE = False
try:
    from playwright.async_api import async_playwright as _playwright_api
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    pass

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
if not mongo_url and os.environ.get("RAILWAY_ENVIRONMENT") == "production":
    raise RuntimeError("MONGO_URL est requis en production")
db_name = os.environ.get('DB_NAME', 'clipdeal_dev')

if mongo_url:
    client = AsyncIOMotorClient(mongo_url)
else:
    # Local dev fallback when MongoDB is not configured.
    from mongomock_motor import AsyncMongoMockClient
    client = AsyncMongoMockClient()

db = client[db_name]

# Config
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
YOUTUBE_API_KEY = os.environ.get('YOUTUBE_API_KEY', '')
TIKWM_API_KEY = os.environ.get('TIKWM_API_KEY', '')
RAPIDAPI_KEY = os.environ.get('RAPIDAPI_KEY', '').strip()
APIFY_TOKEN = os.environ.get('APIFY_TOKEN', '').strip()
CLIP_SCRAPER_URL = os.environ.get('CLIP_SCRAPER_URL', '').strip().rstrip('/')
CLIP_SCRAPER_KEY = os.environ.get('CLIP_SCRAPER_KEY', '').strip()
# Proxy outbound pour bypasser blocages Insta/TikTok depuis Railway (format: http://user:pass@host:port)
BACKEND_PROXY_URL = os.environ.get('BACKEND_PROXY_URL', '').strip() or None


async def _fetch_via_clipscraper(platform: str, username: str, max_videos: int = 30) -> list:
    """Appelle le service ClipScraper standalone (alternative à Apify, économique)."""
    if not CLIP_SCRAPER_URL or not CLIP_SCRAPER_KEY:
        raise ValueError("CLIP_SCRAPER_URL/KEY non configuré")
    if platform not in ("tiktok", "instagram", "youtube"):
        raise ValueError(f"Platform non supportée: {platform}")
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            f"{CLIP_SCRAPER_URL}/v1/{platform}/{username.lstrip('@')}",
            params={"max_videos": max_videos},
            headers={"X-API-Key": CLIP_SCRAPER_KEY},
        )
    if r.status_code != 200:
        raise ValueError(f"ClipScraper {platform} HTTP {r.status_code}: {r.text[:200]}")
    return (r.json() or {}).get("videos", [])


async def _fetch_video_stats_via_clipscraper(url: str) -> Optional[dict]:
    """Appelle le ClipScraper VPS pour fetch UNE vidéo via son URL (yt-dlp + proxy résidentiel).
    Bypasse les blocages Railway (Insta/TikTok). Retourne None si scraper non configuré ou échec."""
    if not CLIP_SCRAPER_URL or not CLIP_SCRAPER_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=90) as c:
            r = await c.post(
                f"{CLIP_SCRAPER_URL}/v1/video-stats",
                json={"url": url},
                headers={"X-API-Key": CLIP_SCRAPER_KEY},
            )
        if r.status_code != 200:
            logger.debug(f"ClipScraper video-stats HTTP {r.status_code} for {url}: {r.text[:150]}")
            return None
        return r.json() or None
    except Exception as e:
        logger.debug(f"ClipScraper video-stats error for {url}: {type(e).__name__}: {e}")
        return None

# Instagram session cookie rotation
# Supports multiple cookies: INSTAGRAM_SESSION_IDS=cookie1,cookie2,cookie3
# Also supports single: INSTAGRAM_SESSION_ID=cookie (legacy)
_raw_sessions = os.environ.get('INSTAGRAM_SESSION_IDS', '') or os.environ.get('INSTAGRAM_SESSION_ID', '')
INSTAGRAM_SESSIONS: list[str] = [s.strip() for s in _raw_sessions.split(',') if s.strip()]
# Single alias for backward compat
INSTAGRAM_SESSION_ID = INSTAGRAM_SESSIONS[0] if INSTAGRAM_SESSIONS else ''
_instagram_session_index = 0

def _get_instagram_session() -> str:
    """Round-robin rotation entre les cookies Instagram configurés."""
    global _instagram_session_index
    if not INSTAGRAM_SESSIONS:
        return ''
    cookie = INSTAGRAM_SESSIONS[_instagram_session_index % len(INSTAGRAM_SESSIONS)]
    _instagram_session_index += 1
    return cookie
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_placeholder')
ADMIN_SECRET_CODE = os.environ.get('ADMIN_SECRET_CODE', 'clipdeal-admin-2025')

# ─── Rate limiting (in-memory) ───────────────────────────────────────────────
_rate_store: dict = defaultdict(list)
_rate_cleanup_counter = 0

def _check_rate_limit(key: str, max_calls: int, window_seconds: int) -> bool:
    """Returns True if rate limit is exceeded for this key. Periodic cleanup prevents OOM."""
    global _rate_cleanup_counter
    now = time.time()
    calls = [t for t in _rate_store[key] if now - t < window_seconds]
    if calls:
        _rate_store[key] = calls
    elif key in _rate_store:
        del _rate_store[key]

    # Periodic cleanup every 1000 calls to evict stale keys (prevent memory leak)
    _rate_cleanup_counter += 1
    if _rate_cleanup_counter >= 1000:
        _rate_cleanup_counter = 0
        cutoff = now - 3600  # any entry older than 1h is stale (max window)
        stale = [k for k, v in _rate_store.items() if not v or all(t < cutoff for t in v)]
        for k in stale:
            _rate_store.pop(k, None)

    if len(calls) >= max_calls:
        return True
    _rate_store[key].append(now)
    return False
CLICK_SALT = os.environ.get('CLICK_SALT', 'clipdeal-default-salt-change-in-prod')
stripe.api_key = STRIPE_API_KEY
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
# Email via Resend API (HTTP — works on Railway)
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '').strip()
RESEND_FROM = os.environ.get('RESEND_FROM', 'The Clip Deal Track <onboarding@resend.dev>').strip()
# Legacy SMTP (kept for reference but not used — Railway blocks SMTP ports)
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
SMTP_USER = os.environ.get('SMTP_USER', '').strip()
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '').strip()

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ─── Security headers middleware ─────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        # Prevent clickjacking & limit framing
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "frame-ancestors 'self'; "
            "img-src 'self' data: https:; "
            "connect-src 'self' https:; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com;"
        )
        return response

app.add_middleware(SecurityHeadersMiddleware)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ================= MODELS =================

class UserBase(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: Optional[str] = None  # clipper, agency, manager, client
    display_name: Optional[str] = None  # pseudo for clipper, agency name for agency
    created_at: datetime
    settings: Optional[Dict[str, Any]] = None

class RoleSelection(BaseModel):
    role: str
    display_name: str

class GoogleLoginRequest(BaseModel):
    id_token: str
    role: str
    display_name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    agency_name: Optional[str] = None
    profile_picture: Optional[str] = None
    password: Optional[str] = None  # app password chosen by user

class EmailRegisterRequest(BaseModel):
    email: str
    password: str
    role: str
    display_name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    agency_name: Optional[str] = None

class VerifyEmailRequest(BaseModel):
    email: str
    code: str

class Campaign(BaseModel):
    campaign_id: str
    agency_id: str
    name: str
    image_url: Optional[str] = None
    rpm: float  # Revenue per 1000 views
    budget_total: Optional[float] = None
    budget_unlimited: bool = False
    budget_used: float = 0
    min_view_payout: int = 0
    max_view_payout: Optional[int] = None
    pay_for_post: bool = False
    platforms: List[str] = []  # tiktok, youtube, instagram
    strike_days: int = 3
    cadence: int = 1  # posts per day minimum
    application_form_enabled: bool = False
    application_questions: List[str] = []
    token_clipper: str
    token_manager: str
    token_client: str
    created_at: datetime
    status: str = "active"
    # Modèle de rémunération
    payment_model: str = "views"  # "views" | "clicks"
    rate_per_click: float = 0.0   # Prix par clic en euros
    destination_url: Optional[str] = None  # URL de redirection pour liens bio
    unique_clicks_only: bool = True        # Ne compter qu'un clic par IP/24h (dérivé de click_billing_mode)
    # Mode de déduplication des clics :
    #   "all"              = tous les clics facturés (pas de dédup)
    #   "unique_24h"       = 1 clic unique par IP / 24h (rolling — re-engagement possible le lendemain)
    #   "unique_lifetime"  = 1 clic unique par IP pour toute la durée de la campagne (anti-fraude strict)
    click_billing_mode: str = "unique_24h"

class CampaignCreate(BaseModel):
    name: str
    image_url: Optional[str] = None
    rpm: float = 0.0
    budget_total: Optional[float] = None
    budget_unlimited: bool = False
    min_view_payout: int = 0
    max_view_payout: Optional[int] = None
    pay_for_post: bool = False
    platforms: List[str] = []
    strike_days: int = 3
    max_strikes: int = 3
    cadence: int = 1
    application_form_enabled: bool = False
    application_questions: List[str] = []
    # Modèle de rémunération
    payment_model: str = "views"
    rate_per_click: float = 0.0
    destination_url: Optional[str] = None
    unique_clicks_only: bool = True
    click_billing_mode: str = "unique_24h"

class CampaignMember(BaseModel):
    member_id: str
    campaign_id: str
    user_id: str
    role: str  # clipper, manager, client
    status: str = "active"  # active, suspended, pending
    joined_at: datetime
    strikes: int = 0
    last_post_at: Optional[datetime] = None

class SocialAccount(BaseModel):
    account_id: str
    user_id: str
    platform: str  # tiktok, youtube, instagram
    username: str
    status: str = "pending"  # pending, verified, error
    created_at: datetime
    follower_count: Optional[int] = None
    avatar_url: Optional[str] = None
    display_name: Optional[str] = None
    verified_at: Optional[str] = None
    error_message: Optional[str] = None
    last_tracked_at: Optional[str] = None
    platform_channel_id: Optional[str] = None  # YouTube channel ID

class SocialAccountCreate(BaseModel):
    platform: str
    username: Optional[str] = None
    account_url: Optional[str] = None

class CampaignSocialAccount(BaseModel):
    id: str
    campaign_id: str
    user_id: str
    account_id: str
    assigned_at: datetime

class Message(BaseModel):
    message_id: str
    campaign_id: str
    sender_id: str
    sender_name: str
    sender_role: str
    recipient_id: Optional[str] = None  # None = broadcast to campaign
    content: str
    message_type: str = "chat"  # chat, advice, access
    created_at: datetime

class MessageCreate(BaseModel):
    campaign_id: str
    recipient_id: Optional[str] = None
    content: str
    message_type: str = "chat"
    image_data: Optional[str] = None

class Announcement(BaseModel):
    announcement_id: str
    agency_id: str
    campaign_id: Optional[str] = None
    title: str
    content: str
    image_url: Optional[str] = None
    link_url: Optional[str] = None
    created_at: datetime

class AnnouncementCreate(BaseModel):
    campaign_id: Optional[str] = None
    title: str
    content: str
    image_url: Optional[str] = None
    link_url: Optional[str] = None

class Advice(BaseModel):
    advice_id: str
    manager_id: str
    campaign_id: str
    recipient_ids: List[str]
    content: str
    created_at: datetime

class AdviceCreate(BaseModel):
    campaign_id: str
    recipient_ids: List[str]
    content: str

class Application(BaseModel):
    application_id: str
    campaign_id: str
    user_id: str
    answers: Dict[str, str]
    status: str = "pending"  # pending, accepted, rejected
    created_at: datetime

class ApplicationCreate(BaseModel):
    campaign_id: str
    answers: Dict[str, str]

class Post(BaseModel):
    post_id: str
    campaign_id: str
    user_id: str
    platform: str  # tiktok, youtube, instagram
    url: str
    views: int = 0
    created_at: datetime

class PostCreate(BaseModel):
    campaign_id: str
    platform: str
    url: str
    views: int = 0

class PayoutRequest(BaseModel):
    amount: float  # euros
    campaign_id: Optional[str] = None

# ================= WEBSOCKET MANAGER =================

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id] = [
                ws for ws in self.active_connections[user_id] if ws != websocket
            ]
            # Clean up empty lists to prevent unbounded memory growth
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_to_user(self, user_id: str, message: dict):
        if user_id not in self.active_connections:
            return
        dead = []
        for ws in self.active_connections[user_id]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        # Remove dead connections detected during send
        for ws in dead:
            self.disconnect(ws, user_id)

    async def broadcast_to_campaign(self, campaign_id: str, message: dict):
        members = await db.campaign_members.find(
            {"campaign_id": campaign_id, "status": "active"},
            {"_id": 0, "user_id": 1}
        ).to_list(1000)
        # Inclure aussi l'agence (pas dans campaign_members)
        campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0, "agency_id": 1, "manager_id": 1})
        recipient_ids = {m["user_id"] for m in members}
        if campaign:
            if campaign.get("agency_id"):
                recipient_ids.add(campaign["agency_id"])
            if campaign.get("manager_id"):
                recipient_ids.add(campaign["manager_id"])
        # Send in parallel — un WS lent ne bloque plus le broadcast (audit 200 clippeurs)
        await asyncio.gather(
            *[self.send_to_user(uid, message) for uid in recipient_ids],
            return_exceptions=True
        )

manager = ConnectionManager()

# ================= AUTH HELPERS =================

async def get_current_user(request: Request) -> dict:
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    user = await db.users.find_one(
        {"user_id": session["user_id"]},
        {"_id": 0}
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Block access until email is verified
    # Exceptions: Google OAuth users (have google_sub), demo users, or users created before this feature
    is_google_user = bool(user.get("google_sub"))
    is_demo_user = "demo" in user.get("user_id", "") or user.get("email", "").endswith("@demo.clipdeal.local")
    email_verified = user.get("email_verified")
    # Only block if email_verified is explicitly False (not None/missing = old accounts)
    if email_verified is False and not is_google_user and not is_demo_user:
        raise HTTPException(status_code=403, detail="email_not_verified")

    return user

# ================= AUTH ROUTES =================

@api_router.post("/auth/session")
async def create_session(request: Request):
    """Exchange session_id for session_token"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    # Timeout 15s pour eviter de bloquer le worker FastAPI si demobackend hang (audit 200 clippeurs)
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="OAuth provider timeout, retry")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"OAuth provider error: {type(e).__name__}")
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        auth_data = response.json()
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    email = auth_data.get("email")
    name = auth_data.get("name")
    picture = auth_data.get("picture")
    session_token = auth_data.get("session_token")
    
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "role": None,
            "display_name": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "settings": {}
        })
    
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    response = Response(
        content=json.dumps({"user": user, "session_token": session_token}),
        media_type="application/json"
    )
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7*24*60*60
    )
    return response

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return user

@api_router.post("/auth/select-role")
async def select_role(role_data: RoleSelection, user: dict = Depends(get_current_user)):
    if role_data.role not in ["clipper", "agency", "manager", "client"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    if user.get("role"):
        raise HTTPException(status_code=400, detail="Role already selected")
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"role": role_data.role, "display_name": role_data.display_name}}
    )
    
    updated_user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return updated_user

@api_router.post("/auth/logout")
async def logout(request: Request, user: dict = Depends(get_current_user)):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})

    response = Response(content=json.dumps({"message": "Logged out"}), media_type="application/json")
    response.delete_cookie(key="session_token", path="/")
    return response

@api_router.post("/auth/demo-login")
async def demo_login(request: Request):
    """Demo login — create a local session without external OAuth"""
    body = await request.json()
    role = body.get("role")
    display_name = body.get("display_name", "Utilisateur Demo")

    if role not in ["clipper", "agency", "manager", "client"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    demo_emails = {
        "clipper": "clipper@demo.clipdeal.local",
        "agency": "agency@demo.clipdeal.local",
        "manager": "manager@demo.clipdeal.local",
        "client": "client@demo.clipdeal.local",
    }
    email = demo_emails[role]

    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"display_name": display_name, "name": display_name, "role": role}}
        )
    else:
        user_id = f"demo_{role}_{uuid.uuid4().hex[:8]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": display_name,
            "picture": None,
            "role": role,
            "display_name": display_name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "settings": {}
        })

    session_token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})

    response = Response(
        content=json.dumps({"user": user, "session_token": session_token}),
        media_type="application/json"
    )
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    return response

def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return f"{salt}:{h}"

def _validate_password(password: str) -> str | None:
    """Returns an error message if the password doesn't meet requirements, else None."""
    import re
    if len(password) < 6:
        return "Mot de passe trop court (6 caractères minimum)"
    if not re.search(r"[A-Z]", password):
        return "Le mot de passe doit contenir au moins 1 majuscule"
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Le mot de passe doit contenir au moins 1 caractère spécial (!@#$%...)"
    return None

def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, h = stored.split(":", 1)
        return hmac.compare_digest(hashlib.sha256(f"{salt}{password}".encode()).hexdigest(), h)
    except Exception:
        return False

def _make_session_response(user: dict, session_token: str) -> Response:
    resp = Response(
        content=json.dumps({"user": user, "session_token": session_token}),
        media_type="application/json"
    )
    resp.set_cookie(key="session_token", value=session_token, httponly=True,
                    secure=os.environ.get("RAILWAY_ENVIRONMENT") == "production", samesite="lax", path="/", max_age=7*24*60*60)
    return resp

async def _send_verification_email(to_email: str, code: str):
    """Send verification code. Priority: Resend API → SMTP → log fallback."""

    html = f"""
    <div style="font-family:Inter,Arial,sans-serif;background:#0A0A0A;padding:40px;max-width:480px;margin:0 auto;border-radius:12px;">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:linear-gradient(135deg,#00E5FF,#FF007F);border-radius:10px;padding:12px 20px;">
          <span style="color:#000;font-weight:bold;font-size:18px;">&#9654; The Clip Deal Track</span>
        </div>
      </div>
      <h2 style="color:#fff;font-size:22px;font-weight:600;margin-bottom:8px;">Vérification de votre email</h2>
      <p style="color:rgba(255,255,255,0.6);font-size:15px;margin-bottom:32px;">Entrez ce code dans l'application pour confirmer votre adresse email :</p>
      <div style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <span style="color:#00E5FF;font-size:42px;font-weight:700;letter-spacing:12px;">{code}</span>
      </div>
      <p style="color:rgba(255,255,255,0.4);font-size:13px;">Ce code expire dans 15 minutes. Si vous n'avez pas demandé ce code, ignorez cet email.</p>
    </div>
    """

    # ── Priorité 1 : Resend API ───────────────────────────────────────────────
    if RESEND_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {RESEND_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": RESEND_FROM,
                        "to": [to_email],
                        "subject": f"{code} — Votre code de vérification The Clip Deal Track",
                        "html": html,
                    },
                )
            if resp.status_code in (200, 201):
                logger.info(f"Email sent via Resend to {to_email} — id={resp.json().get('id')}")
                asyncio.create_task(_track_api_call("resend", success=True))
                return
            else:
                logger.warning(f"Resend API error {resp.status_code}: {resp.text} — falling back to SMTP")
                asyncio.create_task(_track_api_call("resend", success=False))
        except Exception as resend_err:
            logger.warning(f"Resend exception: {resend_err} — falling back to SMTP")

    # ── Priorité 2 : SMTP (Gmail ou autre) ────────────────────────────────────
    if SMTP_USER and SMTP_PASSWORD:
        import asyncio as _asyncio
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        smtp_from = os.environ.get('SMTP_FROM', f'The Clip Deal Track <{SMTP_USER}>')

        def _send_smtp():
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"{code} — Votre code de vérification The Clip Deal Track"
            msg["From"] = smtp_from
            msg["To"] = to_email
            msg.attach(MIMEText(f"Votre code de vérification est : {code}\nIl expire dans 15 minutes.", "plain"))
            msg.attach(MIMEText(html, "html"))
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
                s.ehlo()
                s.starttls()
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.sendmail(smtp_from, [to_email], msg.as_string())

        loop = _asyncio.get_event_loop()
        await loop.run_in_executor(None, _send_smtp)
        logger.info(f"Email sent via SMTP to {to_email}")
        return

    # ── Fallback : log seulement (dev sans config email) ─────────────────────
    logger.warning(
        f"⚠️  Aucun service email configuré (RESEND_API_KEY ou SMTP_USER manquant). "
        f"Code de vérification pour {to_email} : {code}"
    )

@api_router.post("/auth/register")
async def email_register(req: EmailRegisterRequest, request: Request):
    """Register with email + password — sends a 6-digit verification code by email."""
    ip = (request.client.host if request.client else None) or "unknown"
    if _check_rate_limit(f"register:{ip}", 8, 300):
        raise HTTPException(status_code=429, detail="Trop de tentatives d'inscription. Réessayez plus tard.")
    if req.role not in ["clipper", "agency", "manager", "client"]:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    pwd_error = _validate_password(req.password)
    if pwd_error:
        raise HTTPException(status_code=400, detail=pwd_error)
    if "@" not in req.email or "." not in req.email:
        raise HTTPException(status_code=400, detail="Adresse email invalide")

    email_lc = req.email.lower().strip()
    existing = await db.users.find_one({"email": email_lc}, {"_id": 0})
    # Block if a fully verified account already exists with this email
    if existing and existing.get("email_verified") is True:
        raise HTTPException(status_code=409, detail="Un compte existe déjà avec cet email")

    # Generate 6-digit code and store pending verification
    import random
    code = str(random.randint(100000, 999999))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)

    await db.email_verifications.update_one(
        {"email": email_lc},
        {"$set": {
            "email": email_lc,
            "code": code,
            "password_hash": _hash_password(req.password),
            "role": req.role,
            "display_name": req.display_name,
            "first_name": req.first_name,
            "last_name": req.last_name,
            "agency_name": req.agency_name,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )

    # Create or update the user account with email_verified=False
    if existing:
        await db.users.update_one({"email": email_lc}, {"$set": {
            "email_verified": False,
            "password_hash": _hash_password(req.password),
            "role": req.role,
            "display_name": req.display_name,
            "first_name": req.first_name,
            "last_name": req.last_name,
            "agency_name": req.agency_name,
        }})
    else:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": email_lc,
            "name": req.display_name,
            "picture": None,
            "role": req.role,
            "display_name": req.display_name,
            "first_name": req.first_name,
            "last_name": req.last_name,
            "agency_name": req.agency_name,
            "password_hash": _hash_password(req.password),
            "email_verified": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "settings": {}
        })

    # Envoi email en tâche de fond → réponse immédiate au frontend
    asyncio.create_task(_send_verification_email(email_lc, code))

    logger.info(f"Verification code queued for {email_lc} (role: {req.role})")
    return {"email_pending": True, "email": email_lc}


@api_router.post("/auth/resend-code")
async def resend_verification_code(request: Request):
    """Resend a fresh 6-digit verification code to the given email."""
    body = await request.json()
    email_lc = (body.get("email") or "").lower().strip()
    if not email_lc:
        raise HTTPException(status_code=400, detail="Email manquant")

    pending = await db.email_verifications.find_one({"email": email_lc}, {"_id": 0})
    if not pending:
        raise HTTPException(status_code=404, detail="Aucune inscription en attente pour cet email. Recommencez l'inscription.")

    import random
    code = str(random.randint(100000, 999999))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)

    await db.email_verifications.update_one(
        {"email": email_lc},
        {"$set": {"code": code, "expires_at": expires_at.isoformat()}}
    )

    asyncio.create_task(_send_verification_email(email_lc, code))
    return {"sent": True}

@api_router.post("/auth/verify-email")
async def verify_email(req: VerifyEmailRequest):
    """Verify the 6-digit code and create the user account + session."""
    pending = await db.email_verifications.find_one({"email": req.email.lower()}, {"_id": 0})
    if not pending:
        raise HTTPException(status_code=404, detail="Aucune vérification en attente pour cet email")

    expires_at = pending.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Code expiré — relancez l'inscription")

    if not hmac.compare_digest(str(pending.get("code", "")), str(req.code).strip()):
        raise HTTPException(status_code=401, detail="Code incorrect")

    # Create or reactivate user
    existing_user = await db.users.find_one({"email": req.email.lower()}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "email_verified": True,
            "password_hash": pending["password_hash"],
            "role": pending["role"],
            "display_name": pending["display_name"],
        }})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": req.email.lower(),
            "name": pending["display_name"],
            "picture": None,
            "role": pending["role"],
            "display_name": pending["display_name"],
            "first_name": pending.get("first_name"),
            "last_name": pending.get("last_name"),
            "agency_name": pending.get("agency_name"),
            "password_hash": pending["password_hash"],
            "email_verified": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "settings": {}
        })

    # Clean up pending code
    await db.email_verifications.delete_one({"email": req.email.lower()})

    session_token = uuid.uuid4().hex
    expires_at_session = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({"user_id": user_id, "session_token": session_token,
        "expires_at": expires_at_session.isoformat(), "created_at": datetime.now(timezone.utc).isoformat()})

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return _make_session_response(user, session_token)


@api_router.post("/auth/join-register")
async def join_register(request: Request):
    """
    Inscription instantanée SANS vérification email — utilisée depuis les liens de join.
    Crée le compte immédiatement et retourne une session.
    Si le compte existe déjà avec ce mot de passe → connexion directe.
    """
    body = await request.json()
    email    = (body.get("email") or "").lower().strip()
    password = (body.get("password") or "").strip()
    name     = (body.get("display_name") or body.get("name") or "").strip()
    role     = (body.get("role") or "clipper").strip()

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Email invalide")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Mot de passe trop court (6 caractères min.)")
    if not name:
        raise HTTPException(status_code=400, detail="Nom requis")
    if role not in ["clipper", "manager", "client"]:
        role = "clipper"

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        # Compte déjà existant → vérifier le mot de passe
        if existing.get("password_hash") and not _check_password(password, existing["password_hash"]):
            raise HTTPException(status_code=401, detail="Email déjà utilisé — mot de passe incorrect")
        user_id = existing["user_id"]
        # Mettre à jour email_verified si nécessaire
        await db.users.update_one({"user_id": user_id}, {"$set": {"email_verified": True}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "display_name": name,
            "picture": None,
            "role": role,
            "password_hash": _hash_password(password),
            "email_verified": True,   # pas de vérif pour le flow join
            "created_at": datetime.now(timezone.utc).isoformat(),
            "settings": {},
        })

    session_token = uuid.uuid4().hex
    expires_at_session = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": expires_at_session.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return _make_session_response(user, session_token)


async def _send_reset_email(to_email: str, reset_url: str):
    """Send password-reset link. Priority: Resend API → SMTP → log fallback."""

    html = f"""
    <div style="font-family:Inter,Arial,sans-serif;background:#0A0A0A;padding:40px;max-width:480px;margin:0 auto;border-radius:12px;">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:linear-gradient(135deg,#00E5FF,#FF007F);border-radius:10px;padding:12px 20px;">
          <span style="color:#000;font-weight:bold;font-size:18px;">&#9654; The Clip Deal Track</span>
        </div>
      </div>
      <h2 style="color:#fff;font-size:22px;font-weight:600;margin-bottom:8px;">Réinitialisation de votre mot de passe</h2>
      <p style="color:rgba(255,255,255,0.6);font-size:15px;margin-bottom:32px;">Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable <strong style="color:#fff;">1 heure</strong>.</p>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="{reset_url}" style="display:inline-block;background:linear-gradient(135deg,#00E5FF,#FF007F);color:#000;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;">Réinitialiser mon mot de passe</a>
      </div>
      <p style="color:rgba(255,255,255,0.4);font-size:13px;">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email — votre mot de passe reste inchangé.</p>
    </div>
    """

    subject = "Réinitialisation de votre mot de passe — The Clip Deal Track"

    # ── Priorité 1 : Resend API ───────────────────────────────────────────────
    if RESEND_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {RESEND_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": RESEND_FROM,
                        "to": [to_email],
                        "subject": subject,
                        "html": html,
                    },
                )
            if resp.status_code in (200, 201):
                logger.info(f"Reset email sent via Resend to {to_email} — id={resp.json().get('id')}")
                return
            else:
                logger.warning(f"Resend API error {resp.status_code}: {resp.text} — falling back to SMTP")
        except Exception as resend_err:
            logger.warning(f"Resend exception: {resend_err} — falling back to SMTP")

    # ── Priorité 2 : SMTP (Gmail ou autre) ────────────────────────────────────
    if SMTP_USER and SMTP_PASSWORD:
        import asyncio as _asyncio
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        smtp_from = os.environ.get('SMTP_FROM', f'The Clip Deal Track <{SMTP_USER}>')

        def _send_smtp():
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = smtp_from
            msg["To"] = to_email
            msg.attach(MIMEText(f"Réinitialisez votre mot de passe en visitant ce lien (valable 1 heure) :\n{reset_url}", "plain"))
            msg.attach(MIMEText(html, "html"))
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
                s.ehlo()
                s.starttls()
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.sendmail(smtp_from, [to_email], msg.as_string())

        loop = _asyncio.get_event_loop()
        await loop.run_in_executor(None, _send_smtp)
        logger.info(f"Reset email sent via SMTP to {to_email}")
        return

    # ── Fallback : log seulement (dev sans config email) ─────────────────────
    logger.warning(
        f"⚠️  Aucun service email configuré (RESEND_API_KEY ou SMTP_USER manquant). "
        f"Lien de réinitialisation pour {to_email} : {reset_url}"
    )


@api_router.post("/auth/forgot-password")
async def forgot_password(request: Request):
    """Request a password-reset link. Always returns {sent: true} regardless of whether the email exists."""
    body = await request.json()
    email_lc = (body.get("email") or "").lower().strip()
    if not email_lc:
        raise HTTPException(status_code=400, detail="Email manquant")

    user = await db.users.find_one({"email": email_lc}, {"_id": 0, "user_id": 1})
    if user:
        token = uuid.uuid4().hex
        now = datetime.now(timezone.utc)
        await db.password_resets.insert_one({
            "token": token,
            "user_id": user["user_id"],
            "email": email_lc,
            "expires_at": (now + timedelta(hours=1)).isoformat(),
            "created_at": now.isoformat(),
        })
        reset_url = f"{FRONTEND_URL}/reset-password?token={token}"
        try:
            await _send_reset_email(email_lc, reset_url)
        except Exception as e:
            logger.warning(f"Reset email failed for {email_lc}: {e}")

    return {"sent": True}


@api_router.post("/auth/reset-password")
async def reset_password(request: Request):
    """Consume a password-reset token and update the user's password."""
    body = await request.json()
    token = (body.get("token") or "").strip()
    new_password = body.get("new_password") or ""

    if not token:
        raise HTTPException(status_code=400, detail="Token manquant")

    pending = await db.password_resets.find_one({"token": token}, {"_id": 0})
    if not pending:
        raise HTTPException(status_code=404, detail="Lien invalide ou déjà utilisé")

    expires_at = pending.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Lien expiré — demandez un nouveau")

    pwd_error = _validate_password(new_password)
    if pwd_error:
        raise HTTPException(status_code=400, detail=pwd_error)

    await db.users.update_one(
        {"user_id": pending["user_id"]},
        {"$set": {"password_hash": _hash_password(new_password)}}
    )
    await db.password_resets.delete_one({"token": token})

    return {"success": True, "message": "Mot de passe mis à jour"}


@api_router.get("/auth/debug-env")
async def debug_env():
    """Debug: show all env var names containing RESEND, SMTP, or RAILWAY."""
    import os
    keys = {k: (v[:4] + "..." if v else "VIDE") for k, v in os.environ.items()
            if any(x in k.upper() for x in ["RESEND", "SMTP", "RAILWAY", "FRONTEND", "GOOGLE"])}
    return {"env_keys": keys, "resend_api_key_at_runtime": os.environ.get("RESEND_API_KEY", "NOT_FOUND")}

@api_router.get("/auth/test-send-email")
async def test_send_email(to: str = "paulangloy@gmail.com"):
    """Actually send a test email via Resend and return raw response."""
    if not RESEND_API_KEY:
        return {"status": "error", "error": "RESEND_API_KEY manquant"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": RESEND_FROM,
                "to": [to],
                "subject": "Test email The Clip Deal Track",
                "html": "<p>Test email envoyé depuis Railway ✅</p>",
            },
        )
    return {"status_code": resp.status_code, "response": resp.json()}

@api_router.get("/auth/test-smtp")
async def test_smtp():
    """Test Resend API config."""
    result = {
        "resend_api_key_set": bool(RESEND_API_KEY),
        "resend_api_key_length": len(RESEND_API_KEY),
        "resend_from": RESEND_FROM,
    }
    if not RESEND_API_KEY:
        result["status"] = "error"
        result["error"] = "RESEND_API_KEY manquant — créez un compte sur resend.com et ajoutez la clé dans Railway"
        return result
    try:
        # A restricted key (send-only) returns 401 on /domains but works for sending
        # Just verify the key format is correct
        if RESEND_API_KEY.startswith("re_") and len(RESEND_API_KEY) > 10:
            result["status"] = "ok"
            result["message"] = "Clé Resend configurée ✅ (clé restreinte envoi — c'est normal)"
        else:
            result["status"] = "error"
            result["error"] = "La clé ne semble pas valide (doit commencer par re_)"
    except Exception as e:
        result["status"] = "error"
        result["error"] = f"{type(e).__name__}: {e}"
    return result

@api_router.post("/auth/login")
async def email_login(request: Request):
    """Login with email + password."""
    ip = (request.client.host if request.client else None) or "unknown"
    if _check_rate_limit(f"login:{ip}", 15, 60):
        raise HTTPException(status_code=429, detail="Trop de tentatives de connexion. Réessayez dans une minute.")
    body = await request.json()
    email = body.get("email", "").lower()
    password = body.get("password", "")

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    if not _verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    # Email verification required (main registration flow)
    if not user.get("email_verified", False):
        import random as _r
        code = str(_r.randint(100000, 999999))
        expires_at_code = datetime.now(timezone.utc) + timedelta(minutes=15)
        pw_hash = user.get("password_hash") or _hash_password(password)
        await db.email_verifications.update_one(
            {"email": email},
            {"$set": {
                "email": email, "code": code, "password_hash": pw_hash,
                "role": user.get("role", ""), "display_name": user.get("display_name", user.get("name", "")),
                "first_name": user.get("first_name"), "last_name": user.get("last_name"),
                "agency_name": user.get("agency_name"), "expires_at": expires_at_code.isoformat(),
            }},
            upsert=True
        )
        asyncio.create_task(_send_verification_email(email, code))
        raise HTTPException(status_code=403, detail="email_not_verified")

    session_token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({"user_id": user["user_id"], "session_token": session_token,
        "expires_at": expires_at.isoformat(), "created_at": datetime.now(timezone.utc).isoformat()})

    user_clean = {k: v for k, v in user.items() if k != "password_hash"}
    return _make_session_response(user_clean, session_token)

@api_router.post("/auth/google")
async def google_login(login_req: GoogleLoginRequest):
    """Authenticate with a real Google id_token from Google Identity Services."""
    if login_req.role not in ["clipper", "agency", "manager", "client"]:
        raise HTTPException(status_code=400, detail="Rôle invalide")

    # Verify the Google id_token via Google's tokeninfo endpoint (async-safe)
    idinfo = None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": login_req.id_token},
            )
        logger.info(f"Google tokeninfo status={resp.status_code} body={resp.text[:300]}")
        if resp.status_code != 200:
            raise ValueError(f"tokeninfo returned {resp.status_code}: {resp.text}")
        idinfo = resp.json()
        if "error" in idinfo:
            raise ValueError(f"Google error: {idinfo['error']}")
        if not idinfo.get("email"):
            raise ValueError("No email in token")
        # Warn if aud doesn't match but don't block — Railway var may lag
        token_aud = idinfo.get("aud", "")
        token_azp = idinfo.get("azp", "")
        if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID not in (token_aud, token_azp):
            logger.warning(f"Google aud mismatch (non-blocking). Expected={GOOGLE_CLIENT_ID}, aud={token_aud}, azp={token_azp}")
    except Exception as e:
        logger.warning(f"Google token validation failed: {e}")
        raise HTTPException(status_code=401, detail=f"Token Google invalide ou expiré ({e})")

    email = idinfo.get("email", "")
    name = idinfo.get("name", login_req.display_name)
    # prefer custom profile picture over Google's
    picture = login_req.profile_picture or idinfo.get("picture")
    google_sub = idinfo["sub"]

    existing = await db.users.find_one(
        {"$or": [{"google_sub": google_sub}, {"email": email}]},
        {"_id": 0}
    )
    if existing:
        user_id = existing["user_id"]
        upd = {"name": name, "google_sub": google_sub, "email_verified": True}
        if picture:
            upd["picture"] = picture
        if not existing.get("role"):
            upd["role"] = login_req.role
            upd["display_name"] = login_req.display_name
        # Save app password if provided and not already set
        if login_req.password and len(login_req.password) >= 6 and not existing.get("password_hash"):
            upd["password_hash"] = _hash_password(login_req.password)
        await db.users.update_one({"user_id": user_id}, {"$set": upd})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "google_sub": google_sub,
            "role": login_req.role,
            "display_name": login_req.display_name,
            "email_verified": True,  # Google already verified the email
            "created_at": datetime.now(timezone.utc).isoformat(),
            "settings": {}
        }
        if login_req.password and len(login_req.password) >= 6:
            new_user["password_hash"] = _hash_password(login_req.password)
        await db.users.insert_one(new_user)

    session_token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    resp = Response(
        content=json.dumps({"user": user, "session_token": session_token}),
        media_type="application/json"
    )
    resp.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    return resp

# ================= CAMPAIGN ROUTES =================

def _check_agency_subscription(user: dict):
    """Raise 403 if agency's trial has expired and they have no active subscription."""
    if user.get("role") != "agency":
        return
    sub_status = user.get("subscription_status", "none")
    if sub_status == "active":
        return  # paid — OK
    if sub_status == "trial":
        trial_started_at = user.get("trial_started_at")
        if trial_started_at:
            trial_start = datetime.fromisoformat(trial_started_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) < trial_start + timedelta(days=14):
                return  # trial still active
    if sub_status in (None, "none"):
        return  # brand new account — allow (trial not yet started)
    raise HTTPException(
        status_code=403,
        detail="subscription_required"
    )

@api_router.post("/campaigns", response_model=dict)
async def create_campaign(campaign_data: CampaignCreate, user: dict = Depends(get_current_user)):
    if user.get("role") != "agency":
        raise HTTPException(status_code=403, detail="Only agencies can create campaigns")
    _check_agency_subscription(user)
    # Check campaign limit for current plan
    limits = _get_plan_limits(user)
    if limits["campaigns"] is not None:
        active_count = await db.campaigns.count_documents({"agency_id": user["user_id"], "status": "active"})
        if active_count >= limits["campaigns"]:
            raise HTTPException(
                status_code=403,
                detail=f"Limite atteinte : votre plan Starter autorise {limits['campaigns']} campagne(s) active(s). Passez au plan Full pour continuer."
            )
    campaign_id = f"camp_{uuid.uuid4().hex[:12]}"
    
    campaign = {
        "campaign_id": campaign_id,
        "agency_id": user["user_id"],
        "name": campaign_data.name,
        "image_url": campaign_data.image_url,
        "rpm": campaign_data.rpm,
        "budget_total": campaign_data.budget_total,
        "budget_unlimited": campaign_data.budget_unlimited,
        "budget_used": 0,
        "min_view_payout": campaign_data.min_view_payout,
        "max_view_payout": campaign_data.max_view_payout,
        "pay_for_post": campaign_data.pay_for_post,
        "platforms": campaign_data.platforms,
        "strike_days": campaign_data.strike_days,
        "max_strikes": campaign_data.max_strikes,
        "cadence": campaign_data.cadence,
        "application_form_enabled": campaign_data.application_form_enabled,
        "application_questions": campaign_data.application_questions,
        "token_clipper": uuid.uuid4().hex,
        "token_manager": uuid.uuid4().hex,
        "token_client": uuid.uuid4().hex,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "active",
        # Rémunération au clic
        "payment_model": campaign_data.payment_model,
        "rate_per_click": campaign_data.rate_per_click,
        "destination_url": campaign_data.destination_url,
        # click_billing_mode = "all" | "unique_24h" | "unique_lifetime"
        # unique_clicks_only est dérivé : True si mode != "all"
        "click_billing_mode": campaign_data.click_billing_mode,
        "unique_clicks_only": campaign_data.click_billing_mode != "all",
    }
    
    await db.campaigns.insert_one(campaign)
    campaign.pop("_id", None)
    
    await manager.send_to_user(user["user_id"], {
        "type": "campaign_created",
        "campaign": campaign
    })
    
    return campaign

@api_router.get("/campaigns")
async def get_campaigns(user: dict = Depends(get_current_user)):
    """Get campaigns based on user role"""
    role = user.get("role")
    
    if role == "agency":
        campaigns = await db.campaigns.find(
            {"agency_id": user["user_id"]},
            {"_id": 0}
        ).to_list(100)
    else:
        memberships = await db.campaign_members.find(
            {"user_id": user["user_id"], "status": {"$ne": "suspended"}},
            {"_id": 0}
        ).to_list(100)
        campaign_ids = [m["campaign_id"] for m in memberships]
        campaigns = await db.campaigns.find(
            {"campaign_id": {"$in": campaign_ids}},
            {"_id": 0}
        ).to_list(100)
    
    return {"campaigns": campaigns}

@api_router.get("/campaigns/discover")
async def discover_campaigns(
    user: dict = Depends(get_current_user),
    search: Optional[str] = None,
    sort: str = "recent",
):
    """Get all active campaigns for discovery — with search & sort."""
    query: dict = {"status": "active"}
    campaigns = await db.campaigns.find(
        query,
        {"_id": 0, "token_clipper": 0, "token_manager": 0, "token_client": 0}
    ).to_list(200)

    if not campaigns:
        return {"campaigns": []}

    user_id = user.get("user_id")

    # Batch 1: fetch all agency users at once
    agency_ids = list(set(c["agency_id"] for c in campaigns))
    agency_docs = await db.users.find(
        {"user_id": {"$in": agency_ids}},
        {"_id": 0, "user_id": 1, "display_name": 1, "picture": 1}
    ).to_list(len(agency_ids))
    agency_map = {a["user_id"]: a for a in agency_docs}

    campaign_ids = [c["campaign_id"] for c in campaigns]

    # Batch 2: user's memberships for all campaigns
    membership_map: dict = {}
    if user_id:
        my_members = await db.campaign_members.find(
            {"user_id": user_id, "campaign_id": {"$in": campaign_ids}},
            {"_id": 0, "campaign_id": 1, "status": 1}
        ).to_list(200)
        membership_map = {m["campaign_id"]: m["status"] for m in my_members}

    # Batch 3: clipper_count per campaign (only active clippers)
    all_members = await db.campaign_members.find(
        {"campaign_id": {"$in": campaign_ids}, "role": "clipper", "status": "active"},
        {"_id": 0, "campaign_id": 1}
    ).to_list(5000)
    clipper_count_map: dict = {}
    for m in all_members:
        cid = m["campaign_id"]
        clipper_count_map[cid] = clipper_count_map.get(cid, 0) + 1

    # Batch 4: total_views per campaign — Mongo aggregation au lieu de charger 50k docs en RAM
    pipeline = [
        {"$match": {"campaign_id": {"$in": campaign_ids}}},
        {"$group": {"_id": "$campaign_id", "total_views": {"$sum": {"$ifNull": ["$views", 0]}}}}
    ]
    try:
        agg_result = await db.tracked_videos.aggregate(pipeline).to_list(len(campaign_ids))
        views_map = {r["_id"]: r["total_views"] for r in agg_result}
    except Exception as e:
        logger.warning(f"discover views aggregation error: {e}")
        views_map = {}

    for campaign in campaigns:
        cid = campaign["campaign_id"]
        agency = agency_map.get(campaign["agency_id"], {})
        campaign["agency_name"] = agency.get("display_name", "Unknown")
        campaign["user_status"] = membership_map.get(cid)
        campaign["clipper_count"] = clipper_count_map.get(cid, 0)
        campaign["total_views"] = views_map.get(cid, 0)

    # Search filter (after enrichment so we can search agency_name too)
    if search:
        q = search.strip().lower()
        campaigns = [
            c for c in campaigns
            if q in (c.get("name") or "").lower()
            or q in (c.get("description") or "").lower()
            or q in (c.get("agency_name") or "").lower()
        ]

    # Sort
    if sort == "rpm":
        campaigns.sort(key=lambda c: c.get("rpm") or 0, reverse=True)
    elif sort == "budget":
        campaigns.sort(key=lambda c: (c.get("budget_total") or 0) - (c.get("budget_used") or 0), reverse=True)
    elif sort == "views":
        campaigns.sort(key=lambda c: c.get("total_views") or 0, reverse=True)
    elif sort == "clippers":
        campaigns.sort(key=lambda c: c.get("clipper_count") or 0, reverse=True)
    else:  # "recent" default
        campaigns.sort(key=lambda c: c.get("created_at") or "", reverse=True)

    return {"campaigns": campaigns}

@api_router.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if user.get("role") == "agency" and campaign["agency_id"] == user["user_id"]:
        members = await db.campaign_members.find(
            {"campaign_id": campaign_id},
            {"_id": 0}
        ).to_list(100)

        # Batch fetch: users + global stats + social accounts (4 queries total, not N×4)
        member_ids = [m["user_id"] for m in members]
        stats_map = await get_clippers_global_stats_batch(member_ids)

        user_docs_gc = await db.users.find(
            {"user_id": {"$in": member_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "display_name": 1, "picture": 1}
        ).to_list(200)
        users_map_gc = {u["user_id"]: u for u in user_docs_gc}

        # Batch campaign_social_accounts + social_accounts
        csa_docs = await db.campaign_social_accounts.find(
            {"campaign_id": campaign_id, "user_id": {"$in": member_ids}},
            {"_id": 0}
        ).to_list(1000)
        csa_account_ids = [a["account_id"] for a in csa_docs]
        sa_docs = await db.social_accounts.find(
            {"account_id": {"$in": csa_account_ids}},
            {"_id": 0}
        ).to_list(1000)
        sa_map = {s["account_id"]: s for s in sa_docs}
        # Group social accounts by user_id
        socials_by_user: dict = {}
        for csa in csa_docs:
            sa = sa_map.get(csa["account_id"])
            if sa:
                socials_by_user.setdefault(csa["user_id"], []).append(sa)

        for member in members:
            uid = member["user_id"]
            member["user_info"] = users_map_gc.get(uid)
            member["global_stats"] = stats_map.get(uid, {"total_views": 0, "video_count": 0})
            member["social_accounts"] = socials_by_user.get(uid, [])
        
        campaign["members"] = members
        return campaign
    
    is_member = await db.campaign_members.find_one({
        "campaign_id": campaign_id,
        "user_id": user["user_id"]
    })
    
    if not is_member and user.get("role") != "agency":
        campaign.pop("token_clipper", None)
        campaign.pop("token_manager", None)
        campaign.pop("token_client", None)
    
    return campaign

@api_router.get("/campaigns/{campaign_id}/links")
async def get_campaign_links(campaign_id: str, user: dict = Depends(get_current_user)):
    """Get invitation links for a campaign (agency only)"""
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if campaign["agency_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return {
        "campaign_id": campaign_id,
        "name": campaign["name"],
        "token_clipper": campaign["token_clipper"],
        "token_manager": campaign["token_manager"],
        "token_client": campaign["token_client"]
    }

@api_router.get("/campaigns/all-links/agency")
async def get_all_campaign_links(user: dict = Depends(get_current_user)):
    """Get all invitation links for agency's campaigns"""
    if user.get("role") != "agency":
        raise HTTPException(status_code=403, detail="Only agencies can access this")
    
    campaigns = await db.campaigns.find(
        {"agency_id": user["user_id"]},
        {"_id": 0, "campaign_id": 1, "name": 1, "token_clipper": 1, "token_manager": 1, "token_client": 1}
    ).to_list(100)
    
    return {"campaigns": campaigns}

@api_router.post("/campaigns/{campaign_id}/join")
async def apply_to_campaign(campaign_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Apply to a campaign by ID (clipper marketplace flow)"""
    if user.get("role") != "clipper":
        raise HTTPException(status_code=403, detail="Seuls les clippers peuvent postuler")

    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    if campaign.get("status") != "active":
        raise HTTPException(status_code=400, detail="Campagne non active")

    existing = await db.campaign_members.find_one({
        "campaign_id": campaign_id,
        "user_id": user["user_id"]
    })
    if existing:
        raise HTTPException(status_code=400, detail="Tu as déjà postulé à cette campagne")

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    # Réponses du formulaire de candidature : zip questions ↔ réponses
    raw_responses = body.get("responses") or []
    questions = campaign.get("application_questions") or []
    responses_map = []
    for i, q in enumerate(questions):
        ans = raw_responses[i] if i < len(raw_responses) else ""
        responses_map.append({"question": q, "answer": (ans or "").strip()})

    member = {
        "member_id": f"mem_{uuid.uuid4().hex[:12]}",
        "campaign_id": campaign_id,
        "user_id": user["user_id"],
        "role": "clipper",
        "status": "pending",  # toujours en attente de validation agence
        "joined_at": datetime.now(timezone.utc).isoformat(),
        "strikes": 0,
        "last_post_at": None,
        "responses": responses_map,
        # Legacy fields (retro-compat)
        "tiktok": body.get("tiktok", ""),
        "instagram": body.get("instagram", ""),
        "youtube": body.get("youtube", ""),
        "example_url": body.get("example_url", ""),
    }
    await db.campaign_members.insert_one(member)
    member.pop("_id", None)

    await manager.send_to_user(campaign["agency_id"], {
        "type": "new_application",
        "campaign_id": campaign_id,
        "user_id": user["user_id"],
        "display_name": user.get("display_name") or user.get("name"),
    })

    return {"message": "Candidature envoyée !", "member": member}

@api_router.post("/campaigns/{campaign_id}/join-as-client")
async def join_as_client(campaign_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Clients uniquement")
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    existing = await db.campaign_members.find_one({"campaign_id": campaign_id, "user_id": user["user_id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Demande déjà envoyée")
    member = {
        "member_id": f"mem_{uuid.uuid4().hex[:12]}",
        "campaign_id": campaign_id,
        "user_id": user["user_id"],
        "role": "client",
        "status": "pending",
        "joined_at": datetime.now(timezone.utc).isoformat(),
        "strikes": 0,
        "last_post_at": None,
    }
    await db.campaign_members.insert_one(member)
    member.pop("_id", None)
    try:
        agency_id = campaign.get("agency_id")
        if agency_id:
            await manager.send_to_user(agency_id, {"type": "new_client_request", "campaign_id": campaign_id, "user_id": user["user_id"], "display_name": user.get("display_name") or user.get("name")})
    except Exception:
        pass
    return {"message": "Demande envoyée à l'agence", "member": member}

@api_router.post("/campaigns/{campaign_id}/join-as-manager")
async def join_as_manager(campaign_id: str, request: Request, user: dict = Depends(get_current_user)):
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Managers uniquement")
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    existing = await db.campaign_members.find_one({"campaign_id": campaign_id, "user_id": user["user_id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Demande déjà envoyée")
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    member = {
        "member_id": f"mem_{uuid.uuid4().hex[:12]}",
        "campaign_id": campaign_id,
        "user_id": user["user_id"],
        "role": "manager",
        "status": "pending",
        "joined_at": datetime.now(timezone.utc).isoformat(),
        "strikes": 0,
        "last_post_at": None,
        "first_name": body.get("first_name", ""),
        "last_name": body.get("last_name", ""),
        "motivation": body.get("motivation", ""),
    }
    await db.campaign_members.insert_one(member)
    member.pop("_id", None)
    try:
        agency_id = campaign.get("agency_id")
        if agency_id:
            await manager.send_to_user(agency_id, {
                "type": "new_manager_request",
                "campaign_id": campaign_id,
                "campaign_name": campaign.get("name", ""),
                "user_id": user["user_id"],
                "display_name": user.get("display_name") or user.get("name"),
                "first_name": body.get("first_name", ""),
                "last_name": body.get("last_name", ""),
                "motivation": body.get("motivation", ""),
            })
    except Exception:
        pass
    return {"message": "Demande envoyée à l'agence", "member": member}


@api_router.post("/campaigns/{campaign_id}/generate-my-link")
async def generate_my_click_link(campaign_id: str, user: dict = Depends(get_current_user)):
    """Clipper: create their tracking link if it doesn't exist yet (fallback for clippers accepted before auto-gen)."""
    if user.get("role") != "clipper":
        raise HTTPException(status_code=403, detail="Clippers uniquement")
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    if campaign.get("payment_model") != "clicks":
        raise HTTPException(status_code=400, detail="Cette campagne n'est pas au clic")
    # Must be an active member
    membership = await db.campaign_members.find_one({
        "campaign_id": campaign_id,
        "user_id": user["user_id"],
        "status": "active"
    })
    if not membership:
        raise HTTPException(status_code=403, detail="Tu dois être accepté dans cette campagne")
    # Return existing link if any
    existing = await db.click_links.find_one(
        {"campaign_id": campaign_id, "clipper_id": user["user_id"], "is_active": True},
        {"_id": 0}
    )
    if existing:
        backend_url = os.environ.get("BACKEND_URL", "https://api.theclipdealtrack.com")
        if not existing.get("tracking_url"):
            existing["tracking_url"] = f"{backend_url}/track/{existing['short_code']}"
        return existing
    # Generate new link
    for _ in range(10):
        short_code = _gen_short_code()
        if not await db.click_links.find_one({"short_code": short_code}):
            break
    backend_url = os.environ.get("BACKEND_URL", "https://api.theclipdealtrack.com")
    link_id = f"lnk_{uuid.uuid4().hex[:12]}"
    link_doc = {
        "link_id": link_id,
        "short_code": short_code,
        "campaign_id": campaign_id,
        "clipper_id": user["user_id"],
        "clipper_name": user.get("display_name") or user.get("name", "?"),
        "destination_url": campaign.get("destination_url", ""),
        "is_active": True,
        "click_count": 0,
        "unique_click_count": 0,
        "earnings": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_clicked_at": None,
        "tracking_url": f"{backend_url}/track/{short_code}",
    }
    await db.click_links.insert_one(link_doc)
    link_doc.pop("_id", None)
    return link_doc

async def get_clipper_global_stats(user_id: str) -> dict:
    """Get total views and video count for a clipper across all campaigns (tracked_videos)."""
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": None,
            "total_views": {"$sum": "$views"},
            "video_count": {"$sum": 1}
        }}
    ]
    result = await db.tracked_videos.aggregate(pipeline).to_list(1)
    if result:
        return {"total_views": result[0]["total_views"], "video_count": result[0]["video_count"]}
    return {"total_views": 0, "video_count": 0}

async def get_clippers_global_stats_batch(user_ids: list) -> dict:
    """Batch version — 1 DB query for all user_ids at once. Returns {user_id: {total_views, video_count}}."""
    if not user_ids:
        return {}
    pipeline = [
        {"$match": {"user_id": {"$in": user_ids}}},
        {"$group": {
            "_id": "$user_id",
            "total_views": {"$sum": "$views"},
            "video_count": {"$sum": 1}
        }}
    ]
    results = await db.tracked_videos.aggregate(pipeline).to_list(len(user_ids))
    out = {r["_id"]: {"total_views": r["total_views"], "video_count": r["video_count"]} for r in results}
    # Ensure all requested user_ids have an entry (even zero)
    for uid in user_ids:
        if uid not in out:
            out[uid] = {"total_views": 0, "video_count": 0}
    return out

@api_router.get("/campaigns/{campaign_id}/pending-members")
async def get_pending_members(campaign_id: str, user: dict = Depends(get_current_user)):
    """Get pending clippers who applied to this campaign (agency/manager only)"""
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    await _assert_campaign_authority(user, campaign)

    members = await db.campaign_members.find(
        {"campaign_id": campaign_id, "status": "pending"},
        {"_id": 0}
    ).to_list(100)

    # Batch stats — 1 DB query for all pending members at once
    member_ids = [m["user_id"] for m in members]
    stats_map = await get_clippers_global_stats_batch(member_ids)

    # Batch user fetch — 1 query for all users at once
    user_docs = await db.users.find(
        {"user_id": {"$in": member_ids}},
        {"_id": 0, "password_hash": 0}
    ).to_list(200)
    users_map = {u["user_id"]: u for u in user_docs}

    for member in members:
        member["user_info"] = users_map.get(member["user_id"])
        member["global_stats"] = stats_map.get(member["user_id"], {"total_views": 0, "video_count": 0})

    return {"members": members}

async def _assert_campaign_authority(user: dict, campaign: dict) -> None:
    """Vérifie que l'utilisateur a autorité sur cette campagne :
    - Soit il est le propriétaire (agence créatrice)
    - Soit il est un manager ACTIF dans CETTE campagne
    Lève 403 sinon. Empêche IDOR cross-campagne.
    """
    if campaign.get("agency_id") == user["user_id"]:
        return  # propriétaire de la campagne
    if user.get("role") == "manager":
        is_active_manager = await db.campaign_members.find_one({
            "campaign_id": campaign["campaign_id"],
            "user_id": user["user_id"],
            "role": "manager",
            "status": "active"
        })
        if is_active_manager:
            return
    raise HTTPException(status_code=403, detail="Non autorisé sur cette campagne")


@api_router.post("/campaigns/{campaign_id}/members/{member_id}/accept")
async def accept_campaign_member(campaign_id: str, member_id: str, user: dict = Depends(get_current_user)):
    """Accept a pending campaign member (agency/manager only)"""
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    await _assert_campaign_authority(user, campaign)

    member = await db.campaign_members.find_one({"member_id": member_id, "campaign_id": campaign_id})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # Check clipper limit for agency's plan
    agency_id = campaign.get("agency_id")
    if agency_id:
        agency_user = await db.users.find_one({"user_id": agency_id}, {"_id": 0})
        if agency_user:
            limits = _get_plan_limits(agency_user)
            if limits["clippers"] is not None:
                current_clippers = await db.campaign_members.count_documents({
                    "campaign_id": campaign_id, "status": "active", "role": "clipper"
                })
                if current_clippers >= limits["clippers"]:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Limite atteinte : votre plan autorise {limits['clippers']} clippeurs par campagne. Passez au plan Full pour en ajouter davantage."
                    )

    await db.campaign_members.update_one(
        {"member_id": member_id},
        {"$set": {"status": "active", "accepted_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Auto-generate a click tracking link if this is a click-based campaign
    if campaign.get("payment_model") == "clicks":
        existing_link = await db.click_links.find_one({
            "campaign_id": campaign_id,
            "clipper_id": member["user_id"],
            "is_active": True
        })
        if not existing_link:
            clipper_user = await db.users.find_one(
                {"user_id": member["user_id"]},
                {"_id": 0, "display_name": 1, "name": 1}
            )
            for _ in range(10):
                short_code = _gen_short_code()
                if not await db.click_links.find_one({"short_code": short_code}):
                    break
            link_id = f"lnk_{uuid.uuid4().hex[:12]}"
            backend_url = os.environ.get("BACKEND_URL", "https://api.theclipdealtrack.com")
            link_doc = {
                "link_id": link_id,
                "short_code": short_code,
                "campaign_id": campaign_id,
                "clipper_id": member["user_id"],
                "clipper_name": (clipper_user or {}).get("display_name") or (clipper_user or {}).get("name", "?"),
                "destination_url": campaign.get("destination_url", ""),
                "is_active": True,
                "click_count": 0,
                "unique_click_count": 0,
                "earnings": 0.0,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_clicked_at": None,
                "tracking_url": f"{backend_url}/track/{short_code}",
            }
            await db.click_links.insert_one(link_doc)
            # Notify clipper with their tracking link
            await manager.send_to_user(member["user_id"], {
                "type": "click_link_ready",
                "campaign_id": campaign_id,
                "campaign_name": campaign.get("name", ""),
                "tracking_url": link_doc["tracking_url"],
            })

    # Notify the clipper
    await manager.send_to_user(member["user_id"], {
        "type": "application_accepted",
        "campaign_id": campaign_id,
        "campaign_name": campaign.get("name", "")
    })

    return {"message": "Candidature acceptée"}

@api_router.post("/campaigns/{campaign_id}/members/{member_id}/reject")
async def reject_campaign_member(campaign_id: str, member_id: str, user: dict = Depends(get_current_user)):
    """Reject a pending campaign member (agency/manager only)"""
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    await _assert_campaign_authority(user, campaign)

    member = await db.campaign_members.find_one({"member_id": member_id, "campaign_id": campaign_id})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.campaign_members.update_one(
        {"member_id": member_id},
        {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Notify the clipper
    await manager.send_to_user(member["user_id"], {
        "type": "application_rejected",
        "campaign_id": campaign_id,
        "campaign_name": campaign.get("name", "")
    })

    return {"message": "Candidature refusée"}

# ── Endpoints publics (sans authentification) ─────────────────────────────

@api_router.get("/campaigns/join-info/{token}")
async def get_join_info(token: str):
    """Info publique d'une campagne depuis un token d'invitation (sans auth)."""
    campaign = await db.campaigns.find_one({
        "$or": [
            {"token_clipper": token},
            {"token_manager": token},
            {"token_client": token},
        ]
    }, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Lien invalide ou expiré")
    # Déterminer le rôle selon le token
    if campaign.get("token_clipper") == token:
        role = "clipper"
    elif campaign.get("token_manager") == token:
        role = "manager"
    else:
        role = "client"
    # Compter les membres actifs
    member_count = await db.campaign_members.count_documents(
        {"campaign_id": campaign["campaign_id"], "role": "clipper", "status": "active"}
    )
    return {
        "campaign_id": campaign["campaign_id"],
        "name": campaign.get("name"),
        "rpm": campaign.get("rpm", 0),
        "budget": campaign.get("budget", 0),
        "role": role,
        "clipper_count": member_count,
        "agency_name": campaign.get("agency_name"),
    }

@api_router.get("/campaigns/public-stats/{token}")
async def get_public_stats(token: str):
    """Stats publiques pour le client — SANS authentification requise."""
    campaign = await db.campaigns.find_one({"token_client": token}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Lien client invalide")
    campaign_id = campaign["campaign_id"]

    # Totaux depuis tracked_videos
    pipeline = [
        {"$match": {"campaign_id": campaign_id}},
        {"$group": {
            "_id": None,
            "total_views":    {"$sum": "$views"},
            "total_likes":    {"$sum": "$likes"},
            "total_comments": {"$sum": "$comments"},
            "total_videos":   {"$sum": 1},
        }}
    ]
    agg = await db.tracked_videos.aggregate(pipeline).to_list(1)
    total_views    = agg[0]["total_views"]    if agg else 0
    total_likes    = agg[0]["total_likes"]    if agg else 0
    total_comments = agg[0]["total_comments"] if agg else 0
    total_videos   = agg[0]["total_videos"]   if agg else 0
    engagement     = round((total_likes + total_comments) / total_views * 100, 1) if total_views > 0 else 0.0
    avg_views      = round(total_views / total_videos) if total_videos > 0 else 0

    # Top vidéos
    top_videos = await db.tracked_videos.find(
        {"campaign_id": campaign_id},
        {"_id": 0, "url": 1, "title": 1, "views": 1, "likes": 1, "comments": 1,
         "platform": 1, "thumbnail_url": 1, "published_at": 1}
    ).sort("views", -1).to_list(50)

    # Timeline vues sur 30 derniers jours (pour la courbe)
    from collections import defaultdict
    views_by_day: dict = defaultdict(int)
    all_vids = await db.tracked_videos.find(
        {"campaign_id": campaign_id},
        {"_id": 0, "fetched_at": 1, "views": 1}
    ).to_list(1000)
    for v in all_vids:
        day = (v.get("fetched_at") or "")[:10]
        if day:
            views_by_day[day] += v.get("views", 0)
    timeline = [{"date": d, "views": views_by_day[d]} for d in sorted(views_by_day)[-30:]]

    # Stats par plateforme
    platform_agg = await db.tracked_videos.aggregate([
        {"$match": {"campaign_id": campaign_id}},
        {"$group": {"_id": "$platform", "views": {"$sum": "$views"}, "count": {"$sum": 1}}}
    ]).to_list(10)

    return {
        "campaign_name":  campaign.get("name"),
        "total_views":    total_views,
        "total_likes":    total_likes,
        "total_comments": total_comments,
        "total_videos":   total_videos,
        "engagement":     engagement,
        "avg_views":      avg_views,
        "timeline":       timeline,
        "top_videos":     top_videos,
        "platforms":      {p["_id"]: {"views": p["views"], "count": p["count"]} for p in platform_agg},
    }

@api_router.post("/campaigns/join/{token}")
async def join_campaign(token: str, user: dict = Depends(get_current_user)):
    """
    Rejoindre une campagne via token.
    - CLIPPER  → membre actif immédiatement
    - MANAGER  → candidature en attente (l'agence doit accepter)
    - CLIENT   → accès stats publiques (pas de membership nécessaire)
    """
    campaign = await db.campaigns.find_one({
        "$or": [
            {"token_clipper": token},
            {"token_manager": token},
            {"token_client": token}
        ]
    }, {"_id": 0})

    if not campaign:
        raise HTTPException(status_code=404, detail="Lien invalide ou expiré")

    if campaign.get("token_clipper") == token:
        expected_role = "clipper"
    elif campaign.get("token_manager") == token:
        expected_role = "manager"
    else:
        expected_role = "client"

    now = datetime.now(timezone.utc).isoformat()

    # ── MANAGER → candidature en attente ────────────────────────────────
    if expected_role == "manager":
        existing_app = await db.campaign_members.find_one({
            "campaign_id": campaign["campaign_id"], "user_id": user["user_id"]
        })
        if existing_app:
            return {"message": "Candidature déjà soumise", "status": existing_app.get("status"), "campaign": campaign}

        member = {
            "member_id": f"mem_{uuid.uuid4().hex[:12]}",
            "campaign_id": campaign["campaign_id"],
            "user_id": user["user_id"],
            "role": "manager",
            "status": "pending",          # ← en attente d'approbation
            "applied_via_link": True,
            "joined_at": now,
            "strikes": 0,
            "last_post_at": None,
        }
        await db.campaign_members.insert_one(member)
        # Notifier l'agence
        await manager.send_to_user(campaign["agency_id"], {
            "type": "manager_application",
            "campaign_id": campaign["campaign_id"],
            "user_id": user["user_id"],
        })
        return {"message": "Candidature envoyée — en attente d'approbation", "status": "pending", "campaign": campaign}

    # ── CLIENT → juste stocker l'accès pour les stats ───────────────────
    if expected_role == "client":
        return {"message": "Accès stats accordé", "status": "active", "campaign": campaign}

    # ── CLIPPER → candidature en attente (l'agence doit accepter) ──────
    existing = await db.campaign_members.find_one({
        "campaign_id": campaign["campaign_id"], "user_id": user["user_id"]
    })
    if existing:
        return {"message": "Candidature déjà soumise", "status": existing.get("status"), "campaign": campaign}

    member = {
        "member_id": f"mem_{uuid.uuid4().hex[:12]}",
        "campaign_id": campaign["campaign_id"],
        "user_id": user["user_id"],
        "role": "clipper",
        "status": "pending",   # toujours en attente de validation agence
        "applied_via_link": True,
        "joined_at": now,
        "strikes": 0,
        "last_post_at": None,
    }
    await db.campaign_members.insert_one(member)

    await manager.send_to_user(campaign["agency_id"], {
        "type": "new_application",
        "campaign_id": campaign["campaign_id"],
        "user_id": user["user_id"],
        "display_name": user.get("display_name") or user.get("name"),
    })
    return {"message": "Candidature envoyée ! L'agence doit valider ta demande.", "status": "pending", "campaign": campaign}

@api_router.post("/campaigns/{campaign_id}/apply")
async def apply_to_campaign(campaign_id: str, application: ApplicationCreate, user: dict = Depends(get_current_user)):
    """Apply to a campaign with application form"""
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if not campaign.get("application_form_enabled"):
        raise HTTPException(status_code=400, detail="Campaign does not accept applications")
    
    existing = await db.applications.find_one({
        "campaign_id": campaign_id,
        "user_id": user["user_id"]
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already applied")
    
    app_doc = {
        "application_id": f"app_{uuid.uuid4().hex[:12]}",
        "campaign_id": campaign_id,
        "user_id": user["user_id"],
        "answers": application.answers,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.applications.insert_one(app_doc)
    return {"message": "Application submitted"}

@api_router.get("/campaigns/{campaign_id}/applications")
async def get_applications(campaign_id: str, user: dict = Depends(get_current_user)):
    """Get applications for a campaign (agency only)"""
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign or campaign["agency_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    applications = await db.applications.find(
        {"campaign_id": campaign_id},
        {"_id": 0}
    ).to_list(100)
    
    for app in applications:
        applicant = await db.users.find_one(
            {"user_id": app["user_id"]},
            {"_id": 0, "name": 1, "email": 1, "picture": 1, "display_name": 1}
        )
        app["applicant"] = applicant
    
    return {"applications": applications}

@api_router.post("/campaigns/{campaign_id}/applications/{application_id}/accept")
async def accept_application(campaign_id: str, application_id: str, user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign or campaign["agency_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    application = await db.applications.find_one({"application_id": application_id}, {"_id": 0})
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    await db.applications.update_one(
        {"application_id": application_id},
        {"$set": {"status": "accepted"}}
    )

    existing_member = await db.campaign_members.find_one({
        "campaign_id": campaign_id,
        "user_id": application["user_id"]
    })
    if not existing_member:
        member = {
            "member_id": f"mem_{uuid.uuid4().hex[:12]}",
            "campaign_id": campaign_id,
            "user_id": application["user_id"],
            "role": "clipper",
            "status": "active",
            "joined_at": datetime.now(timezone.utc).isoformat(),
            "strikes": 0,
            "last_post_at": None
        }
        await db.campaign_members.insert_one(member)

    await manager.send_to_user(application["user_id"], {
        "type": "application_accepted",
        "campaign": campaign
    })

    return {"message": "Application accepted"}

@api_router.post("/campaigns/{campaign_id}/applications/{application_id}/reject")
async def reject_application(campaign_id: str, application_id: str, user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign or campaign["agency_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    application = await db.applications.find_one({"application_id": application_id}, {"_id": 0})
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    await db.applications.update_one(
        {"application_id": application_id},
        {"$set": {"status": "rejected"}}
    )

    await manager.send_to_user(application["user_id"], {
        "type": "application_rejected",
        "campaign_id": campaign_id,
        "campaign_name": campaign.get("name")
    })

    return {"message": "Application rejected"}

# ================= POSTS (clippers submit their videos) =================

@api_router.post("/posts")
async def submit_post(post_data: PostCreate, user: dict = Depends(get_current_user)):
    if user.get("role") != "clipper":
        raise HTTPException(status_code=403, detail="Clippers only")

    # Verify membership
    member = await db.campaign_members.find_one({
        "campaign_id": post_data.campaign_id,
        "user_id": user["user_id"],
        "status": "active"
    })
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this campaign")

    # Check duplicate URL
    existing = await db.posts.find_one({"url": post_data.url, "campaign_id": post_data.campaign_id})
    if existing:
        raise HTTPException(status_code=400, detail="Post already submitted")

    post = {
        "post_id": f"post_{uuid.uuid4().hex[:12]}",
        "campaign_id": post_data.campaign_id,
        "user_id": user["user_id"],
        "platform": post_data.platform,
        "url": post_data.url,
        "views": post_data.views,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.posts.insert_one(post)
    post.pop("_id", None)

    # Update last_post_at on membership
    await db.campaign_members.update_one(
        {"member_id": member["member_id"]},
        {"$set": {"last_post_at": post["created_at"]}}
    )

    # Update budget_used on campaign based on new total views
    all_posts = await db.posts.find({"campaign_id": post_data.campaign_id}, {"_id": 0, "views": 1}).to_list(10000)
    total_views = sum(p.get("views", 0) for p in all_posts)
    campaign = await db.campaigns.find_one({"campaign_id": post_data.campaign_id}, {"_id": 0})
    if campaign:
        budget_used = (total_views / 1000) * campaign["rpm"]
        await db.campaigns.update_one(
            {"campaign_id": post_data.campaign_id},
            {"$set": {"budget_used": round(budget_used, 2)}}
        )

    return post

@api_router.get("/campaigns/{campaign_id}/posts")
async def get_campaign_posts(campaign_id: str, user: dict = Depends(get_current_user)):
    query = {"campaign_id": campaign_id}
    # Clippers only see their own posts
    if user.get("role") == "clipper":
        query["user_id"] = user["user_id"]

    posts = await db.posts.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"posts": posts}

@api_router.put("/posts/{post_id}/views")
async def update_post_views(post_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Update view count for a post (clipper updates their own post)"""
    post = await db.posts.find_one({"post_id": post_id, "user_id": user["user_id"]}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    new_views = body.get("views", post["views"])
    await db.posts.update_one({"post_id": post_id}, {"$set": {"views": new_views}})

    # Recalculate budget_used
    all_posts = await db.posts.find({"campaign_id": post["campaign_id"]}, {"_id": 0, "views": 1}).to_list(10000)
    total_views = sum(p.get("views", 0) for p in all_posts)
    campaign = await db.campaigns.find_one({"campaign_id": post["campaign_id"]}, {"_id": 0})
    if campaign:
        budget_used = (total_views / 1000) * campaign["rpm"]
        await db.campaigns.update_one(
            {"campaign_id": post["campaign_id"]},
            {"$set": {"budget_used": round(budget_used, 2)}}
        )

    return {"message": "Views updated", "views": new_views}

@api_router.get("/campaigns/{campaign_id}/strikes")
async def get_campaign_strikes(campaign_id: str, user: dict = Depends(get_current_user)):
    """Get strikes for a campaign (agency/manager only)"""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    await _assert_campaign_authority(user, campaign)

    strikes = await db.strikes.find({"campaign_id": campaign_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"strikes": strikes}

@api_router.post("/campaigns/{campaign_id}/members/{member_user_id}/strike")
async def issue_manual_strike(campaign_id: str, member_user_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Issue a manual strike to a clipper (agency/manager only)"""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    await _assert_campaign_authority(user, campaign)

    member = await db.campaign_members.find_one({
        "campaign_id": campaign_id,
        "user_id": member_user_id
    }, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    max_strikes = campaign.get("max_strikes", 3) if campaign else 3

    strike = {
        "strike_id": f"str_{uuid.uuid4().hex[:12]}",
        "campaign_id": campaign_id,
        "user_id": member_user_id,
        "reason": body.get("reason", "Strike manuel"),
        "auto": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.strikes.insert_one(strike)

    new_strikes = member.get("strikes", 0) + 1
    update = {"strikes": new_strikes}
    if new_strikes >= max_strikes:
        update["status"] = "suspended"

    await db.campaign_members.update_one(
        {"campaign_id": campaign_id, "user_id": member_user_id},
        {"$set": update}
    )

    await manager.send_to_user(member_user_id, {
        "type": "strike_issued",
        "campaign_id": campaign_id,
        "strikes": new_strikes,
        "suspended": new_strikes >= max_strikes
    })

    return {"message": "Strike issued", "strikes": new_strikes, "suspended": new_strikes >= max_strikes}

@api_router.delete("/campaigns/{campaign_id}/members/{member_user_id}/strike")
async def remove_manual_strike(campaign_id: str, member_user_id: str, user: dict = Depends(get_current_user)):
    """Remove one strike from a clipper (agency/manager only)"""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    campaign_check = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign_check:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    await _assert_campaign_authority(user, campaign_check)

    member = await db.campaign_members.find_one({
        "campaign_id": campaign_id,
        "user_id": member_user_id
    }, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    current_strikes = member.get("strikes", 0)
    new_strikes = max(0, current_strikes - 1)

    update: dict = {"strikes": new_strikes}
    # If was suspended due to strikes and now below max, reactivate
    if member.get("status") == "suspended" and new_strikes < member.get("strikes", 0):
        campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
        max_strikes = campaign.get("max_strikes", 3) if campaign else 3
        if new_strikes < max_strikes:
            update["status"] = "active"

    await db.campaign_members.update_one(
        {"campaign_id": campaign_id, "user_id": member_user_id},
        {"$set": update}
    )

    await manager.send_to_user(member_user_id, {
        "type": "strike_removed",
        "campaign_id": campaign_id,
        "strikes": new_strikes,
    })

    return {"message": "Strike removed", "strikes": new_strikes}

# ================= SOCIAL ACCOUNT VERIFICATION & TRACKING =================

_thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)

def extract_handle_from_url(url: str, platform: str) -> str:
    """Extract @handle from a social media URL"""
    import re
    url = url.strip()
    if platform == "tiktok":
        # https://www.tiktok.com/@username or https://tiktok.com/@username
        m = re.search(r'tiktok\.com/@([^/?&\s]+)', url)
        if m:
            return m.group(1)
        # If no URL pattern, treat as raw handle
        return url.lstrip("@")
    elif platform == "instagram":
        # https://www.instagram.com/username/
        m = re.search(r'instagram\.com/([^/?&\s]+)', url)
        if m:
            handle = m.group(1).strip("/")
            if handle not in ("p", "reel", "explore", "accounts", "stories"):
                return handle
        return url.lstrip("@")
    elif platform == "youtube":
        # https://www.youtube.com/@handle or /c/name or /channel/UCxxx
        m = re.search(r'youtube\.com/@([^/?&\s]+)', url)
        if m:
            return m.group(1)
        m = re.search(r'youtube\.com/c/([^/?&\s]+)', url)
        if m:
            return m.group(1)
        m = re.search(r'youtube\.com/channel/([^/?&\s]+)', url)
        if m:
            return m.group(1)
        return url.lstrip("@")
    return url.lstrip("@")

async def _verify_youtube(username: str) -> dict:
    if not YOUTUBE_API_KEY:
        raise ValueError("YOUTUBE_API_KEY non configurée")
    async with httpx.AsyncClient(timeout=15) as c:
        for param in ("forHandle", "forUsername"):
            r = await c.get(
                "https://www.googleapis.com/youtube/v3/channels",
                params={"part": "snippet,statistics", param: username.lstrip("@"), "key": YOUTUBE_API_KEY}
            )
            data = r.json()
            items = data.get("items", [])
            if items:
                item = items[0]
                snip = item.get("snippet", {})
                stats = item.get("statistics", {})
                return {
                    "display_name": snip.get("title"),
                    "avatar_url": snip.get("thumbnails", {}).get("default", {}).get("url"),
                    "follower_count": int(stats.get("subscriberCount", 0)),
                    "platform_channel_id": item["id"],
                }
    raise ValueError(f"Chaîne YouTube '{username}' introuvable")

_STEALTH_SCRIPT = """
    () => {
        // 1. Hide webdriver flag — most critical check
        Object.defineProperty(navigator, 'webdriver', { get: () => false });

        // 2. Add chrome object (headless browsers lack this)
        if (!window.chrome) {
            window.chrome = {
                app: { InstallState: {}, RunningState: {}, isInstalled: false },
                csi: () => {},
                loadTimes: () => {},
                runtime: {
                    OnInstalledReason: {},
                    OnRestartRequiredReason: {},
                    PlatformArch: {},
                    PlatformNaclArch: {},
                    PlatformOs: {},
                    RequestUpdateCheckStatus: {},
                },
            };
        }

        // 3. Mock plugins list (headless has 0 plugins)
        Object.defineProperty(navigator, 'plugins', {
            get: () => {
                const arr = [
                    Object.assign(Object.create(Plugin.prototype), {
                        name: 'Chrome PDF Plugin',
                        description: 'Portable Document Format',
                        filename: 'internal-pdf-viewer',
                        length: 1,
                    }),
                    Object.assign(Object.create(Plugin.prototype), {
                        name: 'Chrome PDF Viewer',
                        filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                        description: '',
                        length: 1,
                    }),
                    Object.assign(Object.create(Plugin.prototype), {
                        name: 'Native Client',
                        filename: 'internal-nacl-plugin',
                        description: '',
                        length: 2,
                    }),
                ];
                arr.__proto__ = PluginArray.prototype;
                return arr;
            },
        });

        // 4. Languages
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'fr'] });

        // 5. Platform
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });

        // 6. Hardware concurrency
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

        // 7. Permissions API — avoid 'denied' state that bots trigger
        const origPermissions = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = (p) => {
            if (p.name === 'notifications') {
                return Promise.resolve({ state: 'prompt', onchange: null });
            }
            return origPermissions(p);
        };

        // 8. WebGL vendor/renderer — real GPU strings
        const origGetParam = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(param) {
            if (param === 37445) return 'Intel Inc.';
            if (param === 37446) return 'Intel Iris OpenGL Engine';
            return origGetParam.apply(this, arguments);
        };
        const origGetParam2 = WebGL2RenderingContext.prototype.getParameter;
        if (origGetParam2) {
            WebGL2RenderingContext.prototype.getParameter = function(param) {
                if (param === 37445) return 'Intel Inc.';
                if (param === 37446) return 'Intel Iris OpenGL Engine';
                return origGetParam2.apply(this, arguments);
            };
        }

        // 9. Hide automation in toString checks
        const originalFunction = Function.prototype.toString;
        Function.prototype.toString = function() {
            if (this === navigator.permissions.query) return 'function query() { [native code] }';
            return originalFunction.apply(this, arguments);
        };
    }
"""

async def _scrape_tiktok_playwright(username: str) -> dict:
    """
    Scrape TikTok profile using Playwright with full stealth patches.
    Intercepts TikTok's internal API calls (item_list) AND extracts
    __UNIVERSAL_DATA_FOR_REHYDRATION__ from the page HTML.
    Also calls TikTok's web API with cookies obtained from the page visit.
    """
    if not PLAYWRIGHT_AVAILABLE:
        raise ImportError("playwright non installé")
    username = username.lstrip("@")
    user_info_data: dict = {}
    video_list_data: list = []
    sigi_state: dict = {}
    page_cookies: list = []
    page_debug_info: dict = {}
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox", "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--ignore-certificate-errors",
                "--disable-extensions",
                "--disable-web-security",
                "--allow-running-insecure-content",
                "--window-size=1366,768",
                "--start-maximized",
            ]
        )
        try:
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                locale="en-US",
                timezone_id="America/New_York",
                viewport={"width": 1366, "height": 768},
                screen={"width": 1920, "height": 1080},
                extra_http_headers={
                    "Accept-Language": "en-US,en;q=0.9",
                    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": '"Windows"',
                },
            )
            # Inject stealth patches BEFORE any page navigation
            await context.add_init_script(_STEALTH_SCRIPT)
            page = await context.new_page()

            # Only block fonts/media — allow JS, CSS, images for realistic fingerprint
            async def _route(route):
                rtype = route.request.resource_type
                url = route.request.url
                # Block video/audio streams (heavy bandwidth, not needed)
                if rtype in ("media",) or ".mp4" in url or ".webm" in url:
                    await route.abort()
                else:
                    await route.continue_()
            await page.route("**/*", _route)

            # Intercept TikTok internal API responses
            async def _handle_response(response):
                url = response.url
                try:
                    if "api/user/detail" in url or "web/api/v2/user/info" in url:
                        body = await response.json()
                        ui = body.get("userInfo") or body.get("data", {}).get("user", {})
                        if ui:
                            user_info_data.update(ui if "user" in ui else {"user": ui})
                    elif ("api/post/item_list" in url or "api/creator/item_list" in url
                          or "api/user/post" in url):
                        body = await response.json()
                        items = body.get("itemList") or body.get("aweme_list") or []
                        if items:
                            video_list_data.extend(items)
                            logger.info(f"Intercepted {len(items)} videos from {url}")
                except Exception:
                    pass
            page.on("response", _handle_response)

            # Navigate to TikTok profile
            logger.info(f"Playwright: navigating to tiktok.com/@{username}")
            try:
                await page.goto(
                    f"https://www.tiktok.com/@{username}",
                    wait_until="domcontentloaded",
                    timeout=40000,
                )
            except Exception as nav_e:
                logger.warning(f"Playwright nav timeout (continuing): {nav_e}")

            # Wait for page to settle + TikTok API calls to fire
            await page.wait_for_timeout(5000)

            # Extract page debug info
            page_debug_info = await page.evaluate("""
                () => ({
                    title: document.title,
                    url: window.location.href,
                    hasChallenge: document.title.toLowerCase().includes('challenge')
                        || document.body?.innerText?.includes('challenge') || false,
                    bodyLength: document.body?.innerText?.length || 0,
                })
            """)
            logger.info(f"Playwright page: {page_debug_info}")

            # If bot challenge detected, stop early
            if page_debug_info.get("hasChallenge") or page_debug_info.get("bodyLength", 0) < 500:
                logger.warning(f"Playwright: bot challenge detected for @{username}")
                return {"api_user": {}, "api_videos": [], "sigi": {}, "username": username,
                        "debug": page_debug_info}

            # Try to scroll to load more videos (triggers more item_list API calls)
            if not video_list_data:
                for _ in range(3):
                    await page.mouse.wheel(0, 2000)
                    await page.wait_for_timeout(1500)

            # Extract embedded JSON data from page
            raw = await page.evaluate("""
                () => {
                    // Method 1: __UNIVERSAL_DATA_FOR_REHYDRATION__ (TikTok 2024+)
                    const uel = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
                    if (uel && uel.textContent && uel.textContent.length > 100) {
                        try {
                            const d = JSON.parse(uel.textContent);
                            return { id: '__UNIVERSAL_DATA_FOR_REHYDRATION__', data: d };
                        } catch(e) {}
                    }
                    // Method 2: SIGI_STATE (TikTok 2022-2023)
                    const sel = document.getElementById('SIGI_STATE');
                    if (sel && sel.textContent && sel.textContent.length > 100) {
                        try {
                            const d = JSON.parse(sel.textContent);
                            return { id: 'SIGI_STATE', data: d };
                        } catch(e) {}
                    }
                    // Method 3: any large JSON script tag with user data
                    const scripts = document.querySelectorAll('script[type="application/json"]');
                    for (const s of scripts) {
                        const t = s.textContent || '';
                        if (t.length > 500 && (
                            t.includes('"UserModule"') ||
                            t.includes('"webapp.user-detail"') ||
                            t.includes('"userInfo"') ||
                            t.includes('"uniqueId"')
                        )) {
                            try {
                                return { id: s.id || 'json-script', data: JSON.parse(t) };
                            } catch(e) {}
                        }
                    }
                    // Method 4: window.__INIT_PROPS__
                    try {
                        if (window.__INIT_PROPS__) return { id: '__INIT_PROPS__', data: window.__INIT_PROPS__ };
                    } catch(e) {}
                    return null;
                }
            """)
            if raw:
                sigi_state.update({"id": raw["id"], "data": raw["data"]})
                logger.info(f"Playwright: extracted embedded JSON ({raw['id']}, {len(str(raw['data']))} chars)")

            # Get cookies for subsequent API calls
            page_cookies = await context.cookies()

        except Exception as e:
            logger.warning(f"Playwright TikTok error for @{username}: {e}")
        finally:
            await browser.close()

    scraped = {
        "api_user": user_info_data,
        "api_videos": video_list_data,
        "sigi": sigi_state,
        "username": username,
        "debug": page_debug_info,
    }

    # If we got videos from interception, great. If not but we have cookies,
    # try calling TikTok's item_list API directly with those cookies.
    if not video_list_data and page_cookies and sigi_state:
        try:
            extra_videos = await _fetch_tiktok_with_cookies(username, page_cookies, sigi_state)
            scraped["api_videos"] = extra_videos
            logger.info(f"Playwright cookie API: {len(extra_videos)} videos for @{username}")
        except Exception as e:
            logger.warning(f"Playwright cookie API failed for @{username}: {e}")

    return scraped


async def _fetch_tiktok_with_cookies(username: str, cookies: list, sigi_data: dict) -> list:
    """
    Use cookies obtained from Playwright page visit to call TikTok's item_list API.
    TikTok requires valid browser cookies (ttwid, tt_chain_token) for API access.
    """
    # Build cookie string
    cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies
                           if c.get("domain", "").endswith("tiktok.com"))
    if not cookie_str:
        return []

    # Extract user info from sigi_state
    sec_uid = ""
    user_id = ""
    data = sigi_data.get("data", {})
    # Try UNIVERSAL_DATA format
    scope = data.get("__DEFAULT_SCOPE__", {})
    ud = scope.get("webapp.user-detail", {}).get("userInfo", {})
    if ud:
        user = ud.get("user", {})
        sec_uid = user.get("secUid", "")
        user_id = user.get("id", "")
    # Try SIGI_STATE format
    if not sec_uid:
        user_module = data.get("UserModule", {})
        users = user_module.get("users", {})
        for u in users.values():
            sec_uid = u.get("secUid", "")
            user_id = u.get("id", "")
            if sec_uid:
                break
    if not sec_uid:
        return []

    all_videos = []
    cursor = 0
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": f"https://www.tiktok.com/@{username}",
        "Cookie": cookie_str,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
    }

    for page in range(10):
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
                r = await c.get(
                    "https://www.tiktok.com/api/post/item_list/",
                    params={
                        "aid": "1988",
                        "app_language": "en",
                        "app_name": "tiktok_web",
                        "browser_language": "en-US",
                        "browser_name": "Mozilla",
                        "browser_online": "true",
                        "browser_platform": "Win32",
                        "browser_version": "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        "channel": "tiktok_web",
                        "cookie_enabled": "true",
                        "count": "35",
                        "cursor": str(cursor),
                        "device_platform": "web_pc",
                        "focus_state": "true",
                        "from_page": "user",
                        "history_len": "2",
                        "is_fullscreen": "false",
                        "is_page_visible": "true",
                        "language": "en",
                        "os": "windows",
                        "priority_region": "",
                        "region": "US",
                        "screen_height": "768",
                        "screen_width": "1366",
                        "secUid": sec_uid,
                        "timezone_name": "America/New_York",
                        "userId": user_id,
                        "webcast_language": "en",
                    },
                    headers=headers,
                )
            logger.info(f"TikTok item_list API page {page} @{username}: HTTP {r.status_code}")
            if r.status_code != 200:
                break
            body = r.json()
            items = body.get("itemList") or []
            has_more = body.get("hasMore", False)
            next_cursor = body.get("cursor") or (cursor + 35)
            for item in items:
                vid_id = str(item.get("id") or "")
                if not vid_id:
                    continue
                vid = item.get("video") or {}
                stats = item.get("stats") or item.get("statsV2") or {}
                create_time = item.get("createTime") or 0
                author = item.get("author") or {}
                uname = author.get("uniqueId") or username
                def _i(v):
                    try: return int(v or 0)
                    except: return 0
                all_videos.append({
                    "platform_video_id": vid_id,
                    "url": f"https://www.tiktok.com/@{uname}/video/{vid_id}",
                    "title": (item.get("desc") or "")[:150] or None,
                    "thumbnail_url": vid.get("cover") or vid.get("originCover") or vid.get("dynamicCover"),
                    "views": _i(stats.get("playCount") or stats.get("play_count")),
                    "likes": _i(stats.get("diggCount") or stats.get("digg_count")),
                    "comments": _i(stats.get("commentCount") or stats.get("comment_count")),
                    "published_at": datetime.fromtimestamp(int(create_time), tz=timezone.utc).isoformat() if create_time else None,
                })
            logger.info(f"TikTok item_list page {page}: {len(items)} items (total={len(all_videos)})")
            if not has_more or not items:
                break
            cursor = next_cursor
            await asyncio.sleep(1)
        except Exception as e:
            logger.warning(f"TikTok item_list page {page} error: {e}")
            break
    return all_videos


def _parse_tiktok_scraped(scraped: dict) -> dict:
    """Parse user info from TikTok scraped data (API interception or SIGI_STATE)."""
    username = scraped.get("username", "")
    api_user = scraped.get("api_user", {})
    sigi = scraped.get("sigi", {})
    # From API interception: user + stats dicts
    if api_user:
        user = api_user.get("user", {})
        stats = api_user.get("stats", {})
        return {
            "display_name": user.get("nickname") or user.get("uniqueId") or username,
            "avatar_url": user.get("avatarThumb") or user.get("avatarMedium"),
            "follower_count": stats.get("followerCount"),
            "platform_channel_id": user.get("id") or user.get("secUid"),
        }
    # From SIGI_STATE / UNIVERSAL_DATA
    if sigi:
        data = sigi.get("data", {})
        # SIGI_STATE format
        user_module = data.get("UserModule", {})
        users = user_module.get("users", {})
        stats_map = user_module.get("stats", {})
        u = users.get(username) or users.get(username.lower()) or (list(users.values())[0] if users else None)
        s = stats_map.get(username) or stats_map.get(username.lower()) or (list(stats_map.values())[0] if stats_map else {})
        if u:
            return {
                "display_name": u.get("nickname") or u.get("uniqueId") or username,
                "avatar_url": u.get("avatarThumb") or u.get("avatarMedium"),
                "follower_count": (s or {}).get("followerCount"),
                "platform_channel_id": u.get("id") or u.get("secUid"),
            }
        # UNIVERSAL_DATA format
        scope = data.get("__DEFAULT_SCOPE__", {})
        ud = scope.get("webapp.user-detail", {}).get("userInfo", {})
        if ud:
            user = ud.get("user", {})
            stats = ud.get("stats", {})
            return {
                "display_name": user.get("nickname") or username,
                "avatar_url": user.get("avatarThumb"),
                "follower_count": stats.get("followerCount"),
                "platform_channel_id": user.get("id"),
            }
    raise ValueError(f"Impossible d'extraire les informations du compte TikTok @{username}")


def _parse_tiktok_videos(scraped: dict) -> list:
    """Parse video list from TikTok scraped data."""
    username = scraped.get("username", "")
    api_videos = scraped.get("api_videos", [])
    sigi = scraped.get("sigi", {})
    items = list(api_videos)
    # Also extract from SIGI_STATE ItemModule
    if not items and sigi:
        data = sigi.get("data", {})
        item_module = data.get("ItemModule", {})
        if item_module:
            items = list(item_module.values())
    result = []
    for item in items:
        vid = item.get("video", {})
        stats_raw = item.get("stats", item.get("statsV2", {}))
        desc = item.get("desc") or item.get("title") or ""
        create_time = item.get("createTime") or item.get("create_time") or 0
        vid_id = str(item.get("id") or item.get("aweme_id") or "")
        if not vid_id:
            continue
        author = item.get("author", {})
        uname = author.get("uniqueId") or username
        def _int(v):
            try:
                return int(v or 0)
            except Exception:
                return 0
        result.append({
            "platform_video_id": vid_id,
            "url": f"https://www.tiktok.com/@{uname}/video/{vid_id}",
            "title": desc[:100] if desc else None,
            "thumbnail_url": vid.get("cover") or vid.get("originCover") or item.get("thumbnail_url"),
            "views": _int(stats_raw.get("playCount") or stats_raw.get("play_count") or item.get("view_count")),
            "likes": _int(stats_raw.get("diggCount") or stats_raw.get("digg_count") or item.get("like_count")),
            "comments": _int(stats_raw.get("commentCount") or stats_raw.get("comment_count") or item.get("comment_count")),
            "published_at": datetime.fromtimestamp(int(create_time), tz=timezone.utc).isoformat() if create_time else None,
        })
    return result


async def _verify_tiktok_tikwm(username: str) -> dict:
    """
    Verify TikTok account via TikWm public API.
    TikWm uses residential IPs so it bypasses TikTok's cloud server blocking.
    Free, no API key required.
    """
    username = username.lstrip("@")
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
        r = await c.get(
            "https://www.tikwm.com/api/user/info",
            params={"unique_id": username},
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json",
                "Referer": "https://www.tikwm.com/",
            }
        )
    if r.status_code != 200:
        raise ValueError(f"TikWm API inaccessible (HTTP {r.status_code})")
    try:
        data = r.json()
    except Exception:
        raise ValueError("TikWm API: réponse invalide")

    code = data.get("code")
    if code != 0:
        # code -1 = user not found, other codes = API error
        if code == -1 or "not found" in str(data.get("msg", "")).lower():
            raise ValueError(f"Compte TikTok @{username} introuvable. Vérifiez que le nom d'utilisateur est correct et que le compte est public.")
        raise ValueError(f"TikWm API erreur (code {code}): {data.get('msg', 'inconnue')}")

    user_data = data.get("data", {})
    user = user_data.get("user", {})
    stats = user_data.get("stats", {})

    if not user:
        raise ValueError(f"Compte TikTok @{username} introuvable ou privé.")

    # Prefer numeric id for mobile API; secUid starts with "MS4" and is needed for web API
    numeric_id = user.get("id", "")
    sec_uid = user.get("secUid") or user.get("sec_uid", "")

    return {
        "display_name": user.get("nickname") or username,
        "avatar_url": user.get("avatarLarger") or user.get("avatarMedium") or user.get("avatarThumb"),
        "follower_count": stats.get("followerCount"),
        # Store "numericId|secUid" so we have both for different API strategies
        "platform_channel_id": f"{numeric_id}|{sec_uid}" if (numeric_id and sec_uid) else (numeric_id or sec_uid),
    }


def _parse_tikwm_video_item(item: dict, username: str) -> dict | None:
    """Parse a single TikWm video item into our internal format."""
    vid_id = str(item.get("video_id") or item.get("aweme_id") or item.get("id") or "")
    if not vid_id:
        return None
    create_time = item.get("create_time") or 0
    return {
        "platform_video_id": vid_id,
        "url": f"https://www.tiktok.com/@{username}/video/{vid_id}",
        "title": (item.get("title") or item.get("desc") or "")[:200] or None,
        "thumbnail_url": item.get("cover") or item.get("origin_cover") or item.get("ai_dynamic_cover"),
        "views": int(item.get("play_count") or item.get("views") or 0),
        "likes": int(item.get("digg_count") or item.get("likes") or 0),
        "comments": int(item.get("comment_count") or item.get("comments") or 0),
        "published_at": datetime.fromtimestamp(int(create_time), tz=timezone.utc).isoformat() if create_time else None,
    }


async def _fetch_tiktok_tikwm(username: str) -> list:
    """
    Fetch all TikTok videos for a user via TikWm API.
    Paginates automatically. Works from cloud servers (TikWm uses residential proxies).

    TikWm /api/user/posts may return 403 without an API key from cloud IPs.
    Solutions tried in order:
      A. GET with TIKWM_API_KEY (env var) — works if you registered at tikwm.com (free)
      B. POST form-encoded — some TikWm server configs accept this without auth
      C. GET with web=1 parameter — unlocks the web endpoint
      D. @username format variant
      E. Feed search as last resort (returns videos matching username)
    """
    username = username.lstrip("@")
    all_videos = []

    TIKWM_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8",
        "Origin": "https://www.tikwm.com",
        "Referer": "https://www.tikwm.com/",
    }

    def _parse_page(data: dict) -> tuple[list, bool, int]:
        """Returns (items, has_more, next_cursor)."""
        if data.get("code") != 0:
            return [], False, 0
        page_data = data.get("data") or {}
        if not isinstance(page_data, dict):
            return [], False, 0
        items = page_data.get("videos") or page_data.get("aweme_list") or page_data.get("items") or []
        has_more = bool(page_data.get("hasMore") or page_data.get("has_more"))
        cursor = int(page_data.get("cursor") or 0)
        return items, has_more, cursor

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:

        # ── Strategy A: GET with API key (registered key from tikwm.com) ─────
        if TIKWM_API_KEY:
            cursor = 0
            for page_num in range(10):
                try:
                    r = await c.get(
                        "https://www.tikwm.com/api/user/posts",
                        params={"unique_id": username, "count": 35, "cursor": cursor, "key": TIKWM_API_KEY},
                        headers=TIKWM_HEADERS,
                    )
                    logger.info(f"TikWm A (key) page {page_num} @{username}: HTTP {r.status_code}")
                    if r.status_code != 200:
                        break
                    items, has_more, next_cursor = _parse_page(r.json())
                    logger.info(f"TikWm A page {page_num}: {len(items)} items, has_more={has_more}")
                    for item in items:
                        parsed = _parse_tikwm_video_item(item, username)
                        if parsed:
                            all_videos.append(parsed)
                    if not has_more or not items:
                        break
                    cursor = next_cursor or (cursor + 35)
                    await asyncio.sleep(0.4)
                except Exception as e:
                    logger.warning(f"TikWm A page {page_num} error: {e}")
                    break
            if all_videos:
                logger.info(f"TikWm strategy A (key): {len(all_videos)} videos for @{username}")
                return all_videos

        # ── Strategy B: POST form-encoded (bypasses some server-side GET blocks) ──
        cursor = 0
        for page_num in range(10):
            try:
                post_data = {"unique_id": username, "count": "35", "cursor": str(cursor)}
                if TIKWM_API_KEY:
                    post_data["key"] = TIKWM_API_KEY
                r = await c.post(
                    "https://www.tikwm.com/api/user/posts",
                    data=post_data,
                    headers={**TIKWM_HEADERS, "Content-Type": "application/x-www-form-urlencoded"},
                )
                logger.info(f"TikWm B (POST) page {page_num} @{username}: HTTP {r.status_code}")
                if r.status_code != 200:
                    break
                items, has_more, next_cursor = _parse_page(r.json())
                logger.info(f"TikWm B page {page_num}: {len(items)} items, has_more={has_more}")
                for item in items:
                    parsed = _parse_tikwm_video_item(item, username)
                    if parsed:
                        all_videos.append(parsed)
                if not has_more or not items:
                    break
                cursor = next_cursor or (cursor + 35)
                await asyncio.sleep(0.4)
            except Exception as e:
                logger.warning(f"TikWm B page {page_num} error: {e}")
                break
        if all_videos:
            logger.info(f"TikWm strategy B (POST): {len(all_videos)} videos for @{username}")
            return all_videos

        # ── Strategy C: GET with web=1 parameter ─────────────────────────────
        try:
            r = await c.get(
                "https://www.tikwm.com/api/user/posts",
                params={"unique_id": username, "count": 35, "cursor": 0, "web": 1, "hd": 1},
                headers=TIKWM_HEADERS,
            )
            logger.info(f"TikWm C (web=1) @{username}: HTTP {r.status_code}")
            if r.status_code == 200:
                items, _, _ = _parse_page(r.json())
                logger.info(f"TikWm C: {len(items)} items")
                for item in items:
                    parsed = _parse_tikwm_video_item(item, username)
                    if parsed:
                        all_videos.append(parsed)
        except Exception as e:
            logger.warning(f"TikWm C error: {e}")
        if all_videos:
            logger.info(f"TikWm strategy C (web=1): {len(all_videos)} videos for @{username}")
            return all_videos

        # ── Strategy D: @username prefix variant ─────────────────────────────
        try:
            r = await c.get(
                "https://www.tikwm.com/api/user/posts",
                params={"unique_id": f"@{username}", "count": 35, "cursor": 0},
                headers=TIKWM_HEADERS,
            )
            logger.info(f"TikWm D (@prefix) @{username}: HTTP {r.status_code}")
            if r.status_code == 200:
                items, _, _ = _parse_page(r.json())
                logger.info(f"TikWm D: {len(items)} items")
                for item in items:
                    parsed = _parse_tikwm_video_item(item, username)
                    if parsed:
                        all_videos.append(parsed)
        except Exception as e:
            logger.warning(f"TikWm D error: {e}")
        if all_videos:
            logger.info(f"TikWm strategy D (@prefix): {len(all_videos)} videos for @{username}")
            return all_videos

        # ── Strategy E: feed/search — paginated search for user's videos ────────
        # The search endpoint is not blocked by Cloudflare (returns 200).
        # Paginate through ALL results across BOTH types and filter by author.
        # type=0: all videos, type=1: user-oriented search (may return different results)
        seen_ids: set = set()
        for search_type in [0, 1]:
            search_cursor = 0
            consecutive_empty = 0
            for search_page in range(15):  # up to 15 pages = 300 results per type
                try:
                    r = await c.get(
                        "https://www.tikwm.com/api/feed/search",
                        params={"keywords": username, "count": 20, "cursor": search_cursor,
                                "region": "FR", "type": search_type},
                        headers=TIKWM_HEADERS,
                    )
                    logger.info(f"TikWm E (search type={search_type} page={search_page}) @{username}: HTTP {r.status_code}")
                    if r.status_code != 200:
                        break
                    data = r.json()
                    if data.get("code") != 0:
                        break
                    page_data = data.get("data") or {}
                    items = []
                    if isinstance(page_data, list):
                        items = page_data
                    elif isinstance(page_data, dict):
                        items = page_data.get("videos") or page_data.get("data") or []
                    next_cursor = page_data.get("cursor") if isinstance(page_data, dict) else 0
                    has_more = page_data.get("hasMore", False) if isinstance(page_data, dict) else False
                    found_this_page = 0
                    for item in (items or []):
                        author = item.get("author") or {}
                        uid = (author.get("unique_id") or "").lower() if isinstance(author, dict) else str(author).lower()
                        # Skip if we can confirm it's a different user
                        if uid and uid != username.lower():
                            continue
                        parsed = _parse_tikwm_video_item(item, username)
                        if parsed and parsed["platform_video_id"] not in seen_ids:
                            all_videos.append(parsed)
                            seen_ids.add(parsed["platform_video_id"])
                            found_this_page += 1
                    logger.info(f"TikWm E type={search_type} page={search_page}: +{found_this_page} new (total={len(all_videos)})")
                    if found_this_page == 0:
                        consecutive_empty += 1
                        if consecutive_empty >= 3:
                            break  # 3 consecutive pages with no user's videos — stop
                    else:
                        consecutive_empty = 0
                    if not has_more or not items or not next_cursor:
                        break
                    search_cursor = next_cursor
                    await asyncio.sleep(0.25)
                except Exception as e:
                    logger.warning(f"TikWm E search error (type={search_type} page={search_page}): {e}")
                    break
        # No early break — always try both types to maximize video count

    if all_videos:
        logger.info(f"TikWm strategy E (search): {len(all_videos)} videos for @{username}")
    else:
        logger.warning(f"TikWm: 0 videos found for @{username} after all strategies. "
                       f"Set TIKWM_API_KEY env var (free at tikwm.com) to unlock /api/user/posts.")
    return all_videos


async def _verify_tiktok_apify(username: str) -> dict:
    """Verify TikTok account via Apify — uses residential proxies, cloud-safe."""
    if not APIFY_TOKEN:
        raise ValueError("APIFY_TOKEN non configuré")
    username = username.lstrip("@")

    attempts = [
        ("clockworks~tiktok-scraper", {
            "profiles": [username],
            "resultsPerPage": 1,
            "shouldDownloadVideos": False,
            "shouldDownloadCovers": False,
        }),
        ("clockworks~tiktok-scraper", {
            "startUrls": [{"url": f"https://www.tiktok.com/@{username}"}],
            "resultsPerPage": 1,
            "shouldDownloadVideos": False,
        }),
        ("apify~tiktok-scraper", {
            "startUrls": [{"url": f"https://www.tiktok.com/@{username}"}],
            "maxPostsPerProfile": 1,
        }),
    ]

    last_err = "Apify TikTok verify: tous les acteurs ont échoué"
    for actor_id, payload in attempts:
        try:
            async with httpx.AsyncClient(timeout=35) as c:
                r = await c.post(
                    f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items",
                    params={"token": APIFY_TOKEN, "timeout": 25, "memory": 256},
                    json=payload,
                )
            logger.info(f"Apify TikTok verify {actor_id} @{username}: HTTP {r.status_code}")
            if r.status_code not in (200, 201):
                last_err = f"Apify {actor_id}: HTTP {r.status_code} — {r.text[:200]}"
                continue
            items = r.json()
            if isinstance(items, dict):
                items = items.get("data") or items.get("items") or []
            if not isinstance(items, list) or not items:
                last_err = f"Apify {actor_id}: 0 items"
                continue

            # Extract author info — try authorMeta (video items) then top-level (profile items)
            first = items[0]
            author = first.get("authorMeta") or first.get("author") or {}
            if not author and ("nickName" in first or "fans" in first or "uniqueId" in first):
                author = first

            display_name = (author.get("nickName") or author.get("name") or
                            author.get("uniqueId") or username)
            avatar = (author.get("avatar") or author.get("avatarLarger") or
                      author.get("avatarMedium") or author.get("avatarThumb"))
            followers = int(author.get("fans") or author.get("followerCount") or 0)
            channel_id = str(author.get("id") or author.get("secUid") or "")

            return {
                "display_name": display_name,
                "avatar_url": avatar,
                "follower_count": followers,
                "platform_channel_id": channel_id,
            }
        except Exception as e:
            last_err = f"Apify TikTok {actor_id} exception: {e}"
            logger.warning(last_err)
            continue

    raise ValueError(last_err)


async def _verify_tiktok(username: str) -> dict:
    """Verify TikTok account. Primary: Apify (residential proxies). Fallbacks: TikWm, Playwright, yt-dlp."""
    username = username.lstrip("@")
    # Primary: Apify — most reliable from cloud
    if APIFY_TOKEN:
        try:
            return await _verify_tiktok_apify(username)
        except ValueError as e:
            msg = str(e).lower()
            if "introuvable" in msg or "not found" in msg:
                raise
            logger.warning(f"Apify TikTok verify failed for @{username}: {e}")
        except Exception as e:
            logger.warning(f"Apify TikTok verify exception for @{username}: {e}")
    # Fallback 1: TikWm API
    try:
        return await _verify_tiktok_tikwm(username)
    except ValueError as e:
        # If TikWm says "not found", don't try other methods — account genuinely doesn't exist
        msg = str(e).lower()
        if "introuvable" in msg or "not found" in msg or "public" in msg:
            raise
        logger.warning(f"TikWm verify failed for @{username}: {e}")
    except Exception as e:
        logger.warning(f"TikWm verify failed for @{username}: {e}")
    # Fallback: Playwright headless browser
    if PLAYWRIGHT_AVAILABLE:
        try:
            scraped = await _scrape_tiktok_playwright(username)
            return _parse_tiktok_scraped(scraped)
        except Exception as e:
            logger.warning(f"Playwright TikTok verify failed for @{username}: {e}")
    # Last resort: yt-dlp
    if YT_DLP_AVAILABLE:
        loop = asyncio.get_event_loop()
        def _ytdlp_verify():
            opts = {"quiet": True, "skip_download": True, "extract_flat": True, "playlistend": 1}
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(f"https://www.tiktok.com/@{username}", download=False)
            if not info:
                raise ValueError(f"Compte TikTok @{username} introuvable")
            return {
                "display_name": info.get("uploader") or info.get("channel") or username,
                "avatar_url": info.get("thumbnail"),
                "follower_count": info.get("channel_follower_count"),
                "platform_channel_id": None,
            }
        return await loop.run_in_executor(_thread_pool, _ytdlp_verify)
    raise ValueError(f"Impossible de vérifier TikTok @{username}")


async def _scrape_instagram_api(username: str) -> dict:
    """
    Call Instagram's internal web API to fetch profile info.
    When INSTAGRAM_SESSION_ID is set, uses authenticated session (works from cloud IPs).
    Without session, only works from residential IPs (blocked on Railway).
    """
    username = username.lstrip("@")
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "X-IG-App-ID": "936619743392459",
        "X-ASBD-ID": "198387",
        "X-IG-WWW-Claim": "0",
        "Origin": "https://www.instagram.com",
        "Referer": f"https://www.instagram.com/{username}/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
    }
    # Inject session cookie — required from cloud/datacenter IPs (rotation)
    session = _get_instagram_session()
    if session:
        headers["Cookie"] = f"sessionid={session}; ds_user_id=0"
    url = f"https://i.instagram.com/api/v1/users/web_profile_info/?username={username}"
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
        r = await c.get(url, headers=headers)
    if r.status_code == 200:
        data = r.json()
        # Instagram returns 200 with empty user when not found (when authenticated)
        if not data.get("data", {}).get("user"):
            raise ValueError(f"Compte Instagram @{username} introuvable ou privé")
        return data
    elif r.status_code in (404, 400):
        raise ValueError(f"Compte Instagram @{username} introuvable ou privé")
    elif r.status_code == 401:
        raise ValueError(f"Instagram session expirée — mettre à jour INSTAGRAM_SESSION_ID")
    else:
        raise ValueError(f"Instagram API erreur {r.status_code} pour @{username}")


def _parse_apify_item(item: dict, username: str) -> dict | None:
    """Parse un item Apify Instagram en dict standardisé."""
    media_type = item.get("type", "")
    # Garder Video et Sidecar (carousel avec vidéo), ignorer Image pure
    if media_type == "Image":
        return None

    video_id = str(item.get("id") or item.get("shortCode") or "")
    if not video_id:
        return None
    short_code = item.get("shortCode") or ""
    caption = item.get("caption") or ""
    timestamp = item.get("timestamp") or ""

    views = int(
        item.get("videoPlayCount")
        or item.get("videoViewCount")
        or item.get("playsCount")
        or 0
    )
    likes = int(item.get("likesCount") or 0)
    comments = int(item.get("commentsCount") or 0)
    thumb = item.get("displayUrl") or item.get("thumbnailUrl") or ""

    published_at = None
    if timestamp:
        try:
            from dateutil import parser as dateparser
            published_at = dateparser.parse(timestamp).isoformat()
        except Exception:
            published_at = timestamp

    return {
        "platform_video_id": video_id,
        "url": f"https://www.instagram.com/reel/{short_code}/" if short_code else f"https://www.instagram.com/{username}/",
        "title": caption[:150] if caption else None,
        "thumbnail_url": thumb,
        "views": views,
        "likes": likes,
        "comments": comments,
        "published_at": published_at,
    }


async def _apify_get_dataset(dataset_id: str) -> list:
    """Récupère les items d'un dataset Apify."""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"https://api.apify.com/v2/datasets/{dataset_id}/items",
            params={"token": APIFY_TOKEN, "clean": "true", "limit": 100},
        )
    if r.status_code != 200:
        raise ValueError(f"Dataset HTTP {r.status_code}")
    return r.json() if isinstance(r.json(), list) else []


async def _fetch_instagram_videos_apify(username: str, max_posts: int = 10) -> list:
    """
    Fetch Instagram Reels via Apify — run-sync (1 seule requête, pas de polling).
    Économique : 128 MB, max 10 posts par défaut.
    """
    if not APIFY_TOKEN:
        raise ValueError("APIFY_TOKEN non configuré")
    username = username.lstrip("@")

    attempts = [
        ("apify~instagram-scraper", {
            "directUrls": [f"https://www.instagram.com/{username}/"],
            "resultsType": "posts",
            "resultsLimit": max_posts,
        }),
        ("apify~instagram-reel-scraper", {
            "directUrls": [f"https://www.instagram.com/{username}/reels/"],
            "resultsType": "posts",
            "resultsLimit": max_posts,
        }),
    ]

    last_err = "Apify Instagram: tous les acteurs ont échoué"
    for actor_id, payload in attempts:
        try:
            logger.info(f"Apify Instagram run-sync {actor_id} pour @{username}")
            async with httpx.AsyncClient(timeout=120) as c:
                r = await c.post(
                    f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items",
                    params={"token": APIFY_TOKEN, "timeout": 90, "memory": 128},
                    json=payload,
                )
            logger.info(f"Apify Instagram {actor_id} sync @{username}: HTTP {r.status_code}")
            if r.status_code not in (200, 201):
                last_err = f"Apify {actor_id}: HTTP {r.status_code} — {r.text[:300]}"
                logger.warning(last_err)
                continue

            items = r.json()
            if isinstance(items, dict):
                items = items.get("data") or items.get("items") or []
            if not isinstance(items, list):
                items = []
            logger.info(f"Apify Instagram {actor_id}: {len(items)} items pour @{username}")
            if not items:
                last_err = f"Apify Instagram {actor_id}: 0 items returned"
                continue

            results = []
            for item in items:
                parsed = _parse_apify_item(item, username)
                if parsed:
                    results.append(parsed)

            views_ok = sum(1 for v in results if v["views"] > 0)
            logger.info(f"Apify Instagram @{username}: {len(results)} vidéos, {views_ok} avec vues > 0")
            if results:
                return results

        except Exception as e:
            last_err = f"Apify Instagram {actor_id} exception: {e}"
            logger.warning(last_err)
            continue

    raise ValueError(last_err)


def _parse_ig_views(item: dict) -> int:
    """
    Extraire le nombre de vues d'un item Instagram privé.
    Instagram utilise des noms de champs différents selon le type de média :
    - Reels : play_count
    - Vidéos classiques : video_view_count
    - IGTV : view_count
    Certains champs sont dans des métadonnées imbriquées.
    """
    # Champs directs
    v = (
        item.get("play_count")
        or item.get("video_view_count")
        or item.get("view_count")
        or item.get("ig_play_count")
    )
    if v:
        return int(v)
    # Reels metadata imbriqué
    clips_meta = item.get("clips_metadata") or {}
    v = clips_meta.get("play_count") or clips_meta.get("original_sound_info", {}).get("play_count")
    if v:
        return int(v)
    # Carousel — chercher dans le premier élément
    carousel = item.get("carousel_media") or []
    if carousel:
        v = (
            carousel[0].get("play_count")
            or carousel[0].get("video_view_count")
            or carousel[0].get("view_count")
        )
        if v:
            return int(v)
    return 0


def _parse_ig_likes(item: dict) -> int:
    """Extraire les likes — masqués sur certains comptes."""
    v = item.get("like_count")
    if v:
        return int(v)
    fb = item.get("fb_like_count") or item.get("facepile_top_likers_count")
    return int(fb) if fb else 0


def _parse_ig_thumb(item: dict) -> str | None:
    """Extraire la miniature."""
    _img = item.get("image_versions2") or {}
    _cands = _img.get("candidates") or []
    if _cands:
        return _cands[0].get("url")
    return item.get("thumbnail_url") or item.get("cover_frame_url")


def _parse_ig_item(item: dict) -> dict | None:
    """Parser un item de feed Instagram en dict vidéo standardisé."""
    media_type = item.get("media_type")
    # 1=photo, 2=video/reel, 8=carousel — on garde video+carousel
    if media_type not in (2, 8):
        return None
    pk = str(item.get("pk") or item.get("id") or "")
    if not pk:
        return None
    code = item.get("code") or ""
    caption_obj = item.get("caption")
    caption = (caption_obj.get("text", "") if isinstance(caption_obj, dict) else "") or ""
    ts = item.get("taken_at") or 0
    views = _parse_ig_views(item)
    likes = _parse_ig_likes(item)
    comments = int(item.get("comment_count") or 0)
    thumb = _parse_ig_thumb(item)
    # Log de debug si toutes les stats sont à 0 (aide au diagnostic)
    if views == 0 and likes == 0:
        avail = {k: item[k] for k in item if "count" in k.lower() or "play" in k.lower() or "view" in k.lower() or "like" in k.lower()}
        logger.debug(f"IG item {pk} stats=0 — champs disponibles: {avail}")
    return {
        "platform_video_id": pk,
        "url": f"https://www.instagram.com/reel/{code}/" if code else f"https://www.instagram.com/p/{code or pk}/",
        "title": caption[:150] if caption else None,
        "thumbnail_url": thumb,
        "views": views,
        "likes": likes,
        "comments": comments,
        "published_at": datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat() if ts else None,
    }


def _ig_headers_android(session: str) -> dict:
    return {
        "User-Agent": "Instagram 289.0.0.77.109 Android (29/10; 420dpi; 1080x2094; OnePlus; GM1913; OnePlus7Pro; qcom; en_US; 458009024)",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "X-IG-App-ID": "567067343352427",
        "X-IG-Bandwidth-Speed-KBPS": "-1.000",
        "X-IG-Bandwidth-TotalBytes-B": "0",
        "X-IG-Bandwidth-TotalTime-MS": "0",
        "Cookie": f"sessionid={session}",
    }


async def _fetch_instagram_feed_videos(user_id: str) -> list:
    """
    Fetch videos from a user's feed via /api/v1/feed/user/{user_id}/.
    Returns video items with views/likes parsed from multiple possible field names.
    """
    session = _get_instagram_session()
    if not session:
        return []
    headers = _ig_headers_android(session)
    results = []
    next_max_id = None
    pages_fetched = 0
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
        while pages_fetched < 3:
            params = {"count": 12}
            if next_max_id:
                params["max_id"] = next_max_id
            try:
                r = await c.get(
                    f"https://i.instagram.com/api/v1/feed/user/{user_id}/",
                    headers=headers, params=params
                )
            except Exception as e:
                logger.warning(f"Instagram feed fetch error user {user_id}: {e}")
                break
            if r.status_code != 200:
                logger.warning(f"Instagram feed HTTP {r.status_code} user {user_id} — body: {r.text[:300]}")
                break
            data = r.json()
            # Log premier item pour debug (une fois)
            if pages_fetched == 0 and data.get("items"):
                first = data["items"][0]
                logger.info(f"IG feed sample keys for user {user_id}: { {k: first.get(k) for k in ['media_type','play_count','video_view_count','view_count','like_count','comment_count','clips_metadata']} }")
            for item in data.get("items", []):
                parsed = _parse_ig_item(item)
                if parsed:
                    results.append(parsed)
            pages_fetched += 1
            next_max_id = data.get("next_max_id")
            if not next_max_id or not data.get("more_available"):
                break
    logger.info(f"Instagram feed: {len(results)} vidéos pour user_id={user_id} (views_nonzero={sum(1 for v in results if v['views'] > 0)})")
    return results


async def _fetch_instagram_reels(user_id: str) -> list:
    """
    Fetch Reels specifically via POST /api/v1/clips/user/.
    This endpoint returns Reels with accurate play_count.
    """
    session = _get_instagram_session()
    if not session:
        return []
    headers = _ig_headers_android(session)
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
    results = []
    max_id = None
    pages = 0
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
        while pages < 3:
            body = f"target_user_id={user_id}&page_size=12&include_feed_video=true"
            if max_id:
                body += f"&max_id={max_id}"
            try:
                r = await c.post(
                    "https://i.instagram.com/api/v1/clips/user/",
                    headers=headers, content=body.encode()
                )
            except Exception as e:
                logger.warning(f"Instagram clips fetch error user {user_id}: {e}")
                break
            if r.status_code != 200:
                logger.warning(f"Instagram clips HTTP {r.status_code} user {user_id}")
                break
            data = r.json()
            # Log premier item
            if pages == 0 and data.get("items"):
                first_media = data["items"][0].get("media", data["items"][0])
                logger.info(f"IG clips sample for user {user_id}: { {k: first_media.get(k) for k in ['play_count','video_view_count','like_count','comment_count']} }")
            for entry in data.get("items", []):
                # Clips endpoint wraps media in "media" key
                item = entry.get("media") or entry
                parsed = _parse_ig_item(item)
                if parsed:
                    results.append(parsed)
            pages += 1
            max_id = data.get("paging_info", {}).get("max_id") or data.get("next_max_id")
            if not max_id or not data.get("paging_info", {}).get("more_available", data.get("more_available", False)):
                break
    logger.info(f"Instagram clips/reels: {len(results)} pour user_id={user_id} (views_nonzero={sum(1 for v in results if v['views'] > 0)})")
    return results


async def _scrape_instagram_rapidapi(username: str) -> dict:
    """
    Fetch Instagram profile via RapidAPI instagram-scraper-api2.
    Free tier: 100 req/month. Requires RAPIDAPI_KEY env var.
    """
    if not RAPIDAPI_KEY:
        raise ValueError("RAPIDAPI_KEY non configuré")
    username = username.lstrip("@")
    headers = {
        "x-rapidapi-host": "instagram-scraper-api2.p.rapidapi.com",
        "x-rapidapi-key": RAPIDAPI_KEY,
    }
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"https://instagram-scraper-api2.p.rapidapi.com/v1/info",
            params={"username_or_id_or_url": username},
            headers=headers,
        )
    if r.status_code != 200:
        raise ValueError(f"RapidAPI Instagram erreur {r.status_code}")
    data = r.json().get("data", {})
    if not data:
        raise ValueError(f"Compte Instagram @{username} introuvable via RapidAPI")
    return {
        "display_name": data.get("full_name") or username,
        "avatar_url": data.get("profile_pic_url_hd") or data.get("profile_pic_url"),
        "follower_count": data.get("follower_count") or data.get("edge_followed_by", {}).get("count"),
        "platform_channel_id": str(data.get("id") or data.get("pk") or ""),
    }


async def _fetch_instagram_videos_rapidapi(username: str) -> list:
    """Fetch Instagram videos/reels via RapidAPI."""
    if not RAPIDAPI_KEY:
        raise ValueError("RAPIDAPI_KEY non configuré")
    username = username.lstrip("@")
    headers = {
        "x-rapidapi-host": "instagram-scraper-api2.p.rapidapi.com",
        "x-rapidapi-key": RAPIDAPI_KEY,
    }
    result = []
    pagination_token = None
    async with httpx.AsyncClient(timeout=20) as c:
        for _ in range(5):  # max 5 pages
            params = {"username_or_id_or_url": username}
            if pagination_token:
                params["pagination_token"] = pagination_token
            r = await c.get(
                "https://instagram-scraper-api2.p.rapidapi.com/v1/posts",
                params=params,
                headers=headers,
            )
            if r.status_code != 200:
                break
            body = r.json()
            items = body.get("data", {}).get("items", [])
            for item in items:
                media_type = item.get("media_type")
                # 2 = video, 8 = carousel (may contain videos) — skip photos (1)
                if media_type not in (2, 8):
                    continue
                # For carousels, check resources
                if media_type == 8:
                    resources = item.get("resources", [])
                    has_video = any(r.get("media_type") == 2 for r in resources)
                    if not has_video:
                        continue
                pk = str(item.get("id") or item.get("pk") or "")
                code = item.get("code") or item.get("shortcode") or ""
                ts = item.get("taken_at") or 0
                caption_data = item.get("caption") or {}
                caption = caption_data.get("text", "") if isinstance(caption_data, dict) else str(caption_data or "")
                # Thumbnail — plusieurs champs possibles selon le type de media
                _img_vers = item.get("image_versions2", {})
                _candidates = _img_vers.get("candidates", []) if _img_vers else []
                _thumb = (
                    item.get("thumbnail_url")
                    or (_candidates[0].get("url") if _candidates else None)
                    or item.get("carousel_media", [{}])[0].get("image_versions2", {}).get("candidates", [{}])[0].get("url") if item.get("carousel_media") else None
                )
                result.append({
                    "platform_video_id": pk,
                    "url": f"https://www.instagram.com/p/{code}/" if code else "",
                    "title": caption[:150] if caption else None,
                    "thumbnail_url": _thumb,
                    "views": int(item.get("play_count") or item.get("view_count") or item.get("video_view_count") or 0),
                    "likes": int((item.get("like_count") or 0)),
                    "comments": int((item.get("comment_count") or 0)),
                    "published_at": datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat() if ts else None,
                })
            pagination_token = body.get("pagination_token")
            if not pagination_token or len(result) >= 100:
                break
    return result


async def _scrape_instagram_playwright(username: str) -> dict:
    """Fallback: use Playwright to intercept Instagram API call."""
    if not PLAYWRIGHT_AVAILABLE:
        raise ImportError("playwright non installé")
    username = username.lstrip("@")
    captured: dict = {}
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        try:
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
                viewport={"width": 390, "height": 844},
            )
            page = await context.new_page()
            async def _handle(response):
                if "web_profile_info" in response.url:
                    try:
                        body = await response.json()
                        captured.update(body)
                    except Exception:
                        pass
            page.on("response", _handle)
            await page.goto(f"https://www.instagram.com/{username}/",
                           wait_until="networkidle", timeout=35000)
            await page.wait_for_timeout(2000)
        except Exception as e:
            logger.warning(f"Playwright Instagram error: {e}")
        finally:
            await browser.close()
    if not captured:
        raise ValueError(f"Impossible d'accéder au profil Instagram @{username}")
    return captured


def _parse_instagram_profile(data: dict) -> dict:
    """Parse Instagram profile from web_profile_info API response."""
    user = data.get("data", {}).get("user", {})
    if not user:
        raise ValueError("Profil Instagram introuvable ou privé")
    return {
        "display_name": user.get("full_name") or user.get("username"),
        "avatar_url": user.get("profile_pic_url_hd") or user.get("profile_pic_url"),
        "follower_count": user.get("edge_followed_by", {}).get("count"),
        "platform_channel_id": user.get("id"),
    }


def _parse_instagram_videos(data: dict) -> list:
    """Parse video list from Instagram web_profile_info response."""
    user = data.get("data", {}).get("user", {})
    if not user:
        return []
    edges = user.get("edge_owner_to_timeline_media", {}).get("edges", [])
    result = []
    for edge in edges:
        node = edge.get("node", {})
        is_video = node.get("is_video") or node.get("__typename") in ("GraphVideo", "XDTMediaDict")
        if not is_video:
            continue
        caption_edges = node.get("edge_media_to_caption", {}).get("edges", [])
        caption = caption_edges[0].get("node", {}).get("text", "") if caption_edges else ""
        ts = node.get("taken_at_timestamp") or node.get("taken_at") or 0
        result.append({
            "platform_video_id": str(node.get("id") or node.get("pk") or ""),
            "url": f"https://www.instagram.com/p/{node.get('shortcode', '')}/",
            "title": caption[:100] if caption else None,
            "thumbnail_url": node.get("thumbnail_src") or node.get("display_url") or node.get("thumbnail_resources", [{}])[-1].get("src") if node.get("thumbnail_resources") else node.get("thumbnail_src") or node.get("display_url"),
            "views": int(node.get("play_count") or node.get("video_view_count") or node.get("clips_metadata", {}).get("reels_media", {}).get("play_count") or 0),
            "likes": int((node.get("edge_media_preview_like") or {}).get("count") or node.get("like_count") or 0),
            "comments": int((node.get("edge_media_to_comment") or {}).get("count") or node.get("comment_count") or 0),
            "published_at": datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat() if ts else None,
        })
    return result


async def _verify_instagram_apify(username: str) -> dict:
    """Verify Instagram account via Apify — uses residential proxies, cloud-safe."""
    if not APIFY_TOKEN:
        raise ValueError("APIFY_TOKEN non configuré")
    username = username.lstrip("@")

    attempts = [
        ("apify~instagram-profile-scraper", {
            "usernames": [username],
        }),
        ("apify~instagram-scraper", {
            "directUrls": [f"https://www.instagram.com/{username}/"],
            "resultsType": "details",
            "resultsLimit": 1,
        }),
        ("apify~instagram-scraper", {
            "directUrls": [f"https://www.instagram.com/{username}/"],
            "resultsType": "posts",
            "resultsLimit": 1,
        }),
    ]

    last_err = "Apify Instagram verify: tous les acteurs ont échoué"
    for actor_id, payload in attempts:
        try:
            async with httpx.AsyncClient(timeout=35) as c:
                r = await c.post(
                    f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items",
                    params={"token": APIFY_TOKEN, "timeout": 25, "memory": 256},
                    json=payload,
                )
            logger.info(f"Apify Instagram verify {actor_id} @{username}: HTTP {r.status_code}")
            if r.status_code not in (200, 201):
                last_err = f"Apify {actor_id}: HTTP {r.status_code} — {r.text[:200]}"
                continue
            items = r.json()
            if isinstance(items, dict):
                items = items.get("data") or items.get("items") or []
            if not isinstance(items, list) or not items:
                last_err = f"Apify {actor_id}: 0 items"
                continue

            first = items[0]
            # Profile-scraper output has direct fields: username, fullName, followersCount, profilePicUrl
            # Post-scraper output has nested owner info: ownerUsername, ownerFullName, ownerProfilePicUrl
            display_name = (first.get("fullName") or first.get("ownerFullName") or
                            first.get("full_name") or username)
            avatar = (first.get("profilePicUrl") or first.get("profilePicUrlHD") or
                      first.get("ownerProfilePicUrl") or first.get("profile_pic_url"))
            edge_fb = first.get("edge_followed_by")
            edge_fb_count = edge_fb.get("count") if isinstance(edge_fb, dict) else 0
            followers = int(first.get("followersCount") or first.get("followers") or edge_fb_count or 0)
            channel_id = str(first.get("id") or first.get("ownerId") or
                             first.get("user_id") or first.get("pk") or "")

            # Sanity check: if we got nothing meaningful, try next actor
            if not display_name or display_name == username and not avatar and not followers:
                last_err = f"Apify {actor_id}: data vide ou non parsable"
                continue

            return {
                "display_name": display_name,
                "avatar_url": avatar,
                "follower_count": followers,
                "platform_channel_id": channel_id,
            }
        except Exception as e:
            last_err = f"Apify Instagram {actor_id} exception: {e}"
            logger.warning(last_err)
            continue

    raise ValueError(last_err)


async def _verify_instagram(username: str) -> dict:
    """Verify Instagram account.
    Priority:
      0. Apify (residential proxies, cloud-safe)
      1. httpx API with INSTAGRAM_SESSION_ID (works from cloud)
      2. RapidAPI instagram-scraper-api2 (works from cloud, free 100/month)
      3. Playwright browser interception (blocked from cloud)
      4. instaloader (blocked from cloud)
    """
    username = username.lstrip("@")
    # Priority 0: Apify — most reliable from cloud, residential proxies
    if APIFY_TOKEN:
        try:
            return await _verify_instagram_apify(username)
        except ValueError as e:
            msg = str(e).lower()
            if "introuvable" in msg or "not found" in msg or "private" in msg:
                raise
            logger.warning(f"Apify Instagram verify failed for @{username}: {e}")
        except Exception as e:
            logger.warning(f"Apify Instagram verify exception for @{username}: {e}")
    # Priority 1: httpx with session cookie (works from Railway when session is set)
    try:
        data = await _scrape_instagram_api(username)
        return _parse_instagram_profile(data)
    except Exception as e:
        logger.warning(f"Instagram httpx API failed for @{username}: {e}")
    # Priority 2: RapidAPI (works from cloud, no session needed)
    if RAPIDAPI_KEY:
        try:
            return await _scrape_instagram_rapidapi(username)
        except Exception as e:
            logger.warning(f"RapidAPI Instagram failed for @{username}: {e}")
    # Priority 3: Playwright (only works from residential IPs)
    if PLAYWRIGHT_AVAILABLE:
        try:
            data = await _scrape_instagram_playwright(username)
            return _parse_instagram_profile(data)
        except Exception as e:
            logger.warning(f"Playwright Instagram failed for @{username}: {e}")
    # Priority 4: instaloader (only works from residential IPs)
    if INSTALOADER_AVAILABLE:
        loop = asyncio.get_event_loop()
        def _il_verify():
            L = instaloader.Instaloader()
            _s = _get_instagram_session()
            if _s:
                try:
                    L.context._session.cookies.set("sessionid", _s, domain=".instagram.com")
                except Exception:
                    pass
            profile = instaloader.Profile.from_username(L.context, username)
            return {
                "display_name": profile.full_name or username,
                "avatar_url": profile.profile_pic_url,
                "follower_count": profile.followers,
                "platform_channel_id": str(profile.userid),
            }
        try:
            return await loop.run_in_executor(_thread_pool, _il_verify)
        except Exception as e:
            logger.warning(f"instaloader verify failed for @{username}: {e}")
    raise ValueError(
        f"Impossible de vérifier Instagram @{username}. "
        "Configurez INSTAGRAM_SESSION_ID ou RAPIDAPI_KEY dans les variables d'environnement Railway."
    )


async def _track_api_call(service: str, success: bool = True):
    """Log one API call into hourly usage buckets (non-blocking)."""
    try:
        now = datetime.now(timezone.utc)
        await db.api_usage.update_one(
            {"service": service, "date": now.strftime("%Y-%m-%d"), "hour": now.hour},
            {"$inc": {"calls": 1, "errors": (0 if success else 1)},
             "$set": {"service": service}},
            upsert=True
        )
    except Exception:
        pass


async def verify_account(platform: str, username: str) -> dict:
    service_map = {"youtube": "youtube", "tiktok": "apify", "instagram": "apify"}
    success = True
    try:
        if platform == "youtube":
            result = await _verify_youtube(username)
        elif platform == "tiktok":
            result = await _verify_tiktok(username)
        elif platform == "instagram":
            result = await _verify_instagram(username)
        else:
            raise ValueError(f"Plateforme inconnue: {platform}")
        return result
    except Exception:
        success = False
        raise
    finally:
        asyncio.create_task(_track_api_call(service_map.get(platform, platform), success))

async def _verify_and_update_account(account_id: str, platform: str, username: str, via_url: bool = False):
    verified_ok = False
    channel_id = None
    try:
        info = await verify_account(platform, username)
        channel_id = info.get("platform_channel_id")
        await db.social_accounts.update_one(
            {"account_id": account_id},
            {"$set": {
                "status": "verified",
                "display_name": info.get("display_name"),
                "avatar_url": info.get("avatar_url"),
                "follower_count": info.get("follower_count"),
                "platform_channel_id": channel_id,
                "verified_at": datetime.now(timezone.utc).isoformat(),
                "error_message": None,
            }}
        )
        verified_ok = True
    except Exception as e:
        logger.warning(f"Verification failed for {platform}/@{username}: {e}")

        # TikTok: NEVER use HTTP fallback — cloud IPs are blocked by TikTok/Cloudflare
        # and the response (200 + JS challenge) cannot reliably confirm account existence.
        if platform == "tiktok":
            await db.social_accounts.update_one(
                {"account_id": account_id},
                {"$set": {
                    "status": "error",
                    "error_message": (
                        f"Compte TikTok @{username} introuvable ou inaccessible. "
                        "TikTok bloque la vérification automatique depuis les serveurs cloud. "
                        "Vérifiez que le pseudo est exact et que le compte est public, puis réessayez."
                    )
                }}
            )
            return

        if via_url or platform in ("instagram", "youtube"):
            # Fallback via URL : GET request + parse body to confirm account existence
            # For instagram/youtube we always try this (we can construct the URL from the username)
            profile_urls = {
                "instagram": f"https://www.instagram.com/{username}/",
                "youtube": f"https://www.youtube.com/@{username}",
            }
            url_to_check = profile_urls.get(platform, "")
            http_ok = False
            error_reason = f"Compte @{username} introuvable sur {platform}. Vérifiez que le compte existe et est public."

            if url_to_check:
                try:
                    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
                        resp = await c.get(url_to_check, headers={
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                            "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8",
                        })
                        body = resp.text

                        if platform == "instagram":
                            # Instagram returns 404 for non-existent accounts; 200 for existing ones
                            if resp.status_code == 404:
                                http_ok = False
                                error_reason = f"Compte Instagram @{username} introuvable. Vérifiez le nom d'utilisateur."
                            elif resp.status_code == 200:
                                # Check for "not found" / private indicators in page
                                not_found_markers = ["Page introuvable", "Désolé, cette page", "Sorry, this page"]
                                if any(m in body for m in not_found_markers):
                                    http_ok = False
                                    error_reason = f"Compte Instagram @{username} introuvable ou privé."
                                else:
                                    http_ok = True
                            else:
                                http_ok = False

                        elif platform == "youtube":
                            # YouTube: check if channel page has meaningful content
                            if resp.status_code == 404:
                                http_ok = False
                                error_reason = f"Chaîne YouTube @{username} introuvable."
                            elif resp.status_code == 200:
                                # ytInitialData must be present on a valid page
                                if "ytInitialData" in body:
                                    http_ok = True
                                    # Extract channelId from page HTML so we can fetch videos later
                                    import re as _re
                                    cid_match = _re.search(r'"channelId"\s*:\s*"(UC[a-zA-Z0-9_-]{20,24})"', body)
                                    if cid_match:
                                        channel_id = cid_match.group(1)
                                else:
                                    http_ok = False
                                    error_reason = f"Chaîne YouTube @{username} introuvable ou inaccessible."
                            else:
                                http_ok = False
                        else:
                            http_ok = resp.status_code in (200, 301, 302)

                except Exception as http_e:
                    logger.warning(f"HTTP fallback check failed for {platform}/@{username}: {http_e}")
                    http_ok = False

            if http_ok:
                fallback_set = {
                    "status": "verified",
                    "verified_at": datetime.now(timezone.utc).isoformat(),
                    "error_message": None,
                    "display_name": username,
                    "follower_count": None,
                    "avatar_url": None,
                }
                # For YouTube: store the channelId extracted from page so video fetching works
                if channel_id:
                    fallback_set["platform_channel_id"] = channel_id
                await db.social_accounts.update_one(
                    {"account_id": account_id},
                    {"$set": fallback_set}
                )
            elif platform == "instagram":
                # Instagram IPs are blocked from cloud — accept account without stats
                await db.social_accounts.update_one(
                    {"account_id": account_id},
                    {"$set": {
                        "status": "verified",
                        "verified_at": datetime.now(timezone.utc).isoformat(),
                        "error_message": None,
                        "display_name": username,
                        "follower_count": None,
                        "avatar_url": None,
                    }}
                )
            else:
                await db.social_accounts.update_one(
                    {"account_id": account_id},
                    {"$set": {"status": "error", "error_message": error_reason}}
                )
        else:
            await db.social_accounts.update_one(
                {"account_id": account_id},
                {"$set": {"status": "error", "error_message": f"Compte @{username} introuvable sur {platform}"}}
            )
        return  # failed — no tracking

    # After successful verification, trigger immediate video tracking for all campaigns
    # where this account is already assigned (handles the re-verify case)
    if verified_ok:
        try:
            acc = await db.social_accounts.find_one({"account_id": account_id}, {"_id": 0})
            if acc:
                assignments = await db.campaign_social_accounts.find(
                    {"account_id": account_id}, {"_id": 0}
                ).to_list(50)
                for asn in assignments:
                    cid = asn["campaign_id"]
                    uid = asn["user_id"]
                    campaign = await db.campaigns.find_one({"campaign_id": cid}, {"_id": 0})
                    rpm = (campaign or {}).get("rpm", 0)
                    try:
                        videos = await fetch_videos(platform, username, acc, since_days=90)
                    except Exception as _fe:
                        logger.warning(f"Initial fetch_videos failed for {platform}/@{username}: {_fe}")
                        videos = []
                    now_iso = datetime.now(timezone.utc).isoformat()
                    for vid in videos:
                        if not vid.get("platform_video_id"):
                            continue
                        earnings = (vid["views"] / 1000) * rpm
                        doc = {
                            "video_id": f"vid_{uuid.uuid4().hex[:12]}",
                            "platform_video_id": vid["platform_video_id"],
                            "account_id": account_id,
                            "user_id": uid,
                            "campaign_id": cid,
                            "platform": platform,
                            "url": vid.get("url", ""),
                            "title": vid.get("title"),
                            "thumbnail_url": vid.get("thumbnail_url"),
                            "views": vid["views"],
                            "likes": vid.get("likes", 0),
                            "comments": vid.get("comments", 0),
                            "published_at": vid.get("published_at"),
                            "fetched_at": now_iso,
                            "earnings": round(earnings, 4),
                            "manually_added": False,
                            "simulated": False,
                        }
                        try:
                            await db.tracked_videos.update_one(
                                {"account_id": account_id, "platform_video_id": vid["platform_video_id"]},
                                {"$set": doc, "$setOnInsert": {"created_at": now_iso}},
                                upsert=True
                            )
                        except Exception:
                            pass
                    await db.social_accounts.update_one(
                        {"account_id": account_id}, {"$set": {"last_tracked_at": now_iso}}
                    )
        except Exception as e:
            logger.debug(f"Post-verify tracking failed for {account_id}: {e}")

# ---------- Video fetching ----------

async def _fetch_tiktok_mobile_api(user_id: str, username: str) -> list:
    """
    Fetch TikTok videos via TikTok's own mobile app API using the numeric user_id.
    This bypasses Cloudflare since it targets TikTok's internal CDN endpoints.
    user_id is the numeric ID stored in platform_channel_id after account verification.
    """
    username = username.lstrip("@")
    all_videos = []
    mobile_headers = {
        "User-Agent": "TikTok 26.2.0 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet",
        "Accept": "application/json",
        "Accept-Language": "en-US",
        "sdk-version": "2",
    }
    api_hosts = [
        "api16-normal-c-useast1a.tiktokv.com",
        "api19-normal-c-useast1a.tiktokv.com",
        "api2-19-h2.musical.ly",
    ]
    for api_host in api_hosts:
        cursor = 0
        for page in range(8):
            try:
                async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
                    r = await c.get(
                        f"https://{api_host}/aweme/v1/aweme/post/",
                        params={
                            "user_id": user_id,
                            "count": 35,
                            "max_cursor": cursor,
                            "aid": 1233,
                            "device_type": "iPhone11",
                            "os_version": "14.0",
                            "version_code": "200103",
                            "app_name": "musical_ly",
                            "channel": "App Store",
                        },
                        headers=mobile_headers,
                    )
                logger.info(f"TikTok mobile API {api_host} page {page} @{username}: HTTP {r.status_code}")
                if r.status_code != 200:
                    break
                data = r.json()
                aweme_list = data.get("aweme_list") or []
                has_more = data.get("has_more", 0)
                max_cursor = data.get("max_cursor") or cursor
                for item in aweme_list:
                    vid_id = str(item.get("aweme_id") or "")
                    if not vid_id:
                        continue
                    stats = item.get("statistics") or {}
                    video_info = item.get("video") or {}
                    cover_list = (video_info.get("cover") or {}).get("url_list") or []
                    cover = cover_list[0] if cover_list else None
                    create_time = item.get("create_time") or 0
                    all_videos.append({
                        "platform_video_id": vid_id,
                        "url": f"https://www.tiktok.com/@{username}/video/{vid_id}",
                        "title": (item.get("desc") or "")[:200] or None,
                        "thumbnail_url": cover,
                        "views": int(stats.get("play_count") or 0),
                        "likes": int(stats.get("digg_count") or 0),
                        "comments": int(stats.get("comment_count") or 0),
                        "published_at": datetime.fromtimestamp(int(create_time), tz=timezone.utc).isoformat() if create_time else None,
                    })
                if not has_more or not aweme_list:
                    break
                cursor = max_cursor
                await asyncio.sleep(0.5)
            except Exception as e:
                logger.warning(f"TikTok mobile API {api_host} page {page} error: {e}")
                break
        if all_videos:
            logger.info(f"TikTok mobile API ({api_host}): {len(all_videos)} videos for @{username}")
            return all_videos
    return all_videos


async def _fetch_tiktok_single_video_tikwm(video_url: str) -> dict | None:
    """
    Fetch stats for a single TikTok video using TikWm's download API.
    This endpoint works without authentication even from cloud servers.
    Returns a video dict or None.
    """
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
        r = await c.post(
            "https://www.tikwm.com/api/",
            data={"url": video_url, "hd": "1"},
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://www.tikwm.com/",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
    if r.status_code != 200:
        return None
    data = r.json()
    if data.get("code") != 0:
        return None
    v = data.get("data") or {}
    vid_id = str(v.get("id") or "")
    if not vid_id:
        return None
    author = v.get("author") or {}
    username = author.get("unique_id") or "unknown"
    create_time = v.get("create_time") or 0
    return {
        "platform_video_id": vid_id,
        "url": f"https://www.tiktok.com/@{username}/video/{vid_id}",
        "title": (v.get("title") or "")[:200] or None,
        "thumbnail_url": v.get("cover") or v.get("origin_cover"),
        "views": int(v.get("play_count") or 0),
        "likes": int(v.get("digg_count") or 0),
        "comments": int(v.get("comment_count") or 0),
        "published_at": datetime.fromtimestamp(int(create_time), tz=timezone.utc).isoformat() if create_time else None,
        "_author_username": username,
    }


async def _fetch_tiktok_videos_apify(username: str, max_posts: int = 10) -> list:
    """
    Fetch TikTok videos via Apify — uses run-sync endpoint (no polling).
    Tries multiple actors and input formats for reliability.
    """
    if not APIFY_TOKEN:
        raise ValueError("APIFY_TOKEN non configuré")
    username = username.lstrip("@")

    # Actors + payloads à essayer dans l'ordre
    attempts = [
        ("clockworks~tiktok-scraper", {
            "startUrls": [{"url": f"https://www.tiktok.com/@{username}"}],
            "resultsType": "posts",
            "maxPostsPerProfile": max_posts,
            "shouldDownloadVideos": False,
            "shouldDownloadCovers": False,
        }),
        ("clockworks~tiktok-scraper", {
            "profiles": [f"https://www.tiktok.com/@{username}"],
            "resultsType": "posts",
            "maxPostsPerProfile": max_posts,
            "shouldDownloadVideos": False,
        }),
        ("apify~tiktok-scraper", {
            "startUrls": [{"url": f"https://www.tiktok.com/@{username}"}],
            "resultsType": "posts",
            "maxPostsPerProfile": max_posts,
        }),
    ]

    last_err = "Apify: tous les acteurs ont échoué"
    for actor_id, payload in attempts:
        try:
            # run-sync-get-dataset-items : démarre + attend + retourne les items en 1 requête
            async with httpx.AsyncClient(timeout=120) as c:
                r = await c.post(
                    f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items",
                    params={"token": APIFY_TOKEN, "timeout": 90, "memory": 128},
                    json=payload,
                )
            logger.info(f"Apify {actor_id} sync @{username}: HTTP {r.status_code}")
            if r.status_code not in (200, 201):
                last_err = f"Apify {actor_id}: HTTP {r.status_code} — {r.text[:300]}"
                logger.warning(last_err)
                continue
            items = r.json()
            if isinstance(items, dict):
                items = items.get("data") or items.get("items") or []
            if not isinstance(items, list):
                items = []
            logger.info(f"Apify {actor_id}: {len(items)} items for @{username}")
            if not items:
                last_err = f"Apify {actor_id}: 0 items returned"
                continue

            result = []
            for item in items:
                vid_id = str(item.get("id") or "")
                if not vid_id:
                    continue
                create_time = item.get("createTimeISO") or item.get("createTime")
                if isinstance(create_time, (int, float)):
                    create_time = datetime.fromtimestamp(create_time, tz=timezone.utc).isoformat()
                thumb = item.get("coverUrl") or item.get("videoUrl") or None
                result.append({
                    "platform_video_id": vid_id,
                    "url": item.get("webVideoUrl") or f"https://www.tiktok.com/@{username}/video/{vid_id}",
                    "title": (item.get("text") or "")[:200] or None,
                    "thumbnail_url": thumb,
                    "views":    int(item.get("playCount") or item.get("play_count") or 0),
                    "likes":    int(item.get("diggCount") or item.get("digg_count") or 0),
                    "comments": int(item.get("commentCount") or item.get("comment_count") or 0),
                    "published_at": create_time,
                })
            if result:
                return result
        except Exception as e:
            last_err = f"Apify {actor_id} exception: {e}"
            logger.warning(last_err)
            continue

    raise ValueError(last_err)


async def _fetch_tiktok_videos_rapidapi(username: str) -> list:
    """
    Fetch TikTok videos via RapidAPI tiktok-scraper7.
    Uses the same RAPIDAPI_KEY as Instagram. Free tier: 100 req/month.
    Subscribe at: https://rapidapi.com/Lundehund/api/tiktok-scraper7
    """
    if not RAPIDAPI_KEY:
        raise ValueError("RAPIDAPI_KEY non configuré")
    username = username.lstrip("@")
    headers = {
        "x-rapidapi-host": "tiktok-scraper7.p.rapidapi.com",
        "x-rapidapi-key": RAPIDAPI_KEY,
    }
    result = []
    async with httpx.AsyncClient(timeout=25) as c:
        r = await c.get(
            "https://tiktok-scraper7.p.rapidapi.com/user/posts",
            headers=headers,
            params={"unique_id": username, "count": "35", "cursor": "0"},
        )
    if r.status_code != 200:
        raise ValueError(f"RapidAPI TikTok HTTP {r.status_code}: {r.text[:200]}")
    data = r.json()
    code = data.get("code", -1)
    if code != 0:
        raise ValueError(f"RapidAPI TikTok error code {code}: {data.get('msg', '')}")
    videos_raw = (data.get("data") or {}).get("videos") or data.get("data") or []
    if isinstance(videos_raw, dict):
        videos_raw = videos_raw.get("videos") or []
    for item in (videos_raw or []):
        # Handle nested video_id
        vid_id = str(item.get("video_id") or item.get("aweme_id") or item.get("id") or "")
        if not vid_id:
            continue
        stats = item.get("statistics") or item.get("stats") or {}
        create_time = item.get("create_time") or item.get("createTime") or 0
        views = int(stats.get("play_count") or stats.get("playCount") or
                    item.get("play_count") or item.get("views") or 0)
        likes = int(stats.get("digg_count") or stats.get("diggCount") or
                    item.get("digg_count") or item.get("likes") or 0)
        comments = int(stats.get("comment_count") or stats.get("commentCount") or
                       item.get("comment_count") or item.get("comments") or 0)
        thumb = (item.get("cover") or item.get("origin_cover") or
                 (item.get("video") or {}).get("cover") or None)
        result.append({
            "platform_video_id": vid_id,
            "url": f"https://www.tiktok.com/@{username}/video/{vid_id}",
            "title": (item.get("title") or item.get("desc") or "")[:200] or None,
            "thumbnail_url": thumb,
            "views": views,
            "likes": likes,
            "comments": comments,
            "published_at": datetime.fromtimestamp(int(create_time), tz=timezone.utc).isoformat() if create_time else None,
        })
    logger.info(f"RapidAPI TikTok: {len(result)} videos for @{username}")
    return result


async def _fetch_tiktok_videos_async(username: str, since_days: int = 30, user_id: str = None) -> list:
    """
    Fetch TikTok videos. Priority:
    0. Apify clockworks/tiktok-scraper (most reliable from cloud — residential proxies)
    1. TikWm API with key (reliable if key is valid)
    2. TikTok Mobile API (requires numeric user_id)
    3. RapidAPI tiktok-scraper7 (requires RapidAPI subscription)
    4. Playwright (not available on Railway)
    5. yt-dlp (often blocked from cloud)
    """
    username = username.lstrip("@")
    # Parse user_id: may be "numericId|secUid" format from updated TikWm verify
    numeric_id = user_id or ""
    sec_uid = ""
    if user_id and "|" in user_id:
        parts = user_id.split("|", 1)
        numeric_id = parts[0]
        sec_uid = parts[1]
    elif user_id and user_id.startswith("MS4"):
        sec_uid = user_id
        numeric_id = ""

    # Priority 0a: ClipScraper standalone (économique, contrôlé par nous)
    if CLIP_SCRAPER_URL and CLIP_SCRAPER_KEY:
        try:
            cs_videos = await _fetch_via_clipscraper("tiktok", username)
            if cs_videos:
                logger.info(f"ClipScraper TikTok: {len(cs_videos)} videos for @{username}")
                return cs_videos
        except Exception as e:
            logger.warning(f"ClipScraper TikTok failed for @{username}: {e}")

    # Priority 0b: Apify (fallback — proxies résidentiels)
    if APIFY_TOKEN:
        try:
            apify_videos = await _fetch_tiktok_videos_apify(username)
            if apify_videos:
                logger.info(f"Apify TikTok: {len(apify_videos)} videos for @{username}")
                return apify_videos
        except Exception as e:
            logger.warning(f"Apify TikTok failed for @{username}: {e}")

    tikwm_videos = []
    # Primary: TikWm API — all strategies A-E (search is always available)
    try:
        tikwm_videos = await _fetch_tiktok_tikwm(username)
        logger.info(f"TikWm fetched {len(tikwm_videos)} videos for @{username}")
    except Exception as e:
        logger.warning(f"TikWm fetch failed for @{username}: {e}")
    # If TikWm found many videos (API key worked), return immediately
    if len(tikwm_videos) >= 10:
        return tikwm_videos
    # Strategy 2: TikTok mobile API (requires numeric user_id)
    mobile_videos = []
    if numeric_id and not numeric_id.startswith("MS4"):
        try:
            mobile_videos = await _fetch_tiktok_mobile_api(numeric_id, username)
            if mobile_videos:
                logger.info(f"TikTok mobile API fetched {len(mobile_videos)} videos for @{username}")
        except Exception as e:
            logger.warning(f"TikTok mobile API failed for @{username}: {e}")
    # Merge TikWm + mobile results (deduplicate by platform_video_id)
    merged: dict = {}
    for v in (tikwm_videos + mobile_videos):
        merged[v["platform_video_id"]] = v
    combined = list(merged.values())
    if len(combined) >= 10:
        return combined
    # Fallback: Playwright (pas de filtre de date — toutes les vidéos)
    if PLAYWRIGHT_AVAILABLE:
        try:
            scraped = await _scrape_tiktok_playwright(username)
            playwright_videos = _parse_tiktok_videos(scraped)
            if playwright_videos:
                logger.info(f"Playwright fetched {len(playwright_videos)} videos for @{username}")
                # Merge with any TikWm videos already found
                pw_merged = {v["platform_video_id"]: v for v in combined}
                for v in playwright_videos:
                    pw_merged[v["platform_video_id"]] = v
                return list(pw_merged.values())
            else:
                logger.warning(f"Playwright returned 0 videos for @{username}")
        except Exception as e:
            logger.warning(f"Playwright TikTok video fetch failed for @{username}: {e}")
    # Fallback 3: RapidAPI tiktok-scraper7 (works from cloud — free 100 req/month)
    if RAPIDAPI_KEY:
        try:
            rapid_videos = await _fetch_tiktok_videos_rapidapi(username)
            if rapid_videos:
                logger.info(f"RapidAPI TikTok fallback: {len(rapid_videos)} videos for @{username}")
                # Merge with any partial TikWm results (deduplicate)
                merged_all = {v["platform_video_id"]: v for v in combined}
                for v in rapid_videos:
                    merged_all[v["platform_video_id"]] = v
                return list(merged_all.values())
        except Exception as e:
            logger.warning(f"RapidAPI TikTok failed for @{username}: {e}")

    # If we have TikWm partial results, return them rather than failing completely
    if combined:
        logger.info(f"Returning {len(combined)} partial TikWm videos for @{username} (full scraping blocked)")
        return combined
    # Fallback: yt-dlp (try multiple strategies for cloud-blocked environments)
    if YT_DLP_AVAILABLE:
        loop = asyncio.get_event_loop()
        def _ytdlp_videos():
            # Strategy 1: standard with mobile-like headers
            base_opts = {
                "quiet": True,
                "skip_download": True,
                "extract_flat": True,
                "playlistend": 200,
                "ignoreerrors": True,
                "no_warnings": True,
            }
            strategies = [
                # Strategy A: desktop UA + referer
                {**base_opts, "http_headers": {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Referer": "https://www.tiktok.com/",
                    "Accept-Language": "en-US,en;q=0.9",
                }},
                # Strategy B: mobile UA
                {**base_opts, "http_headers": {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                    "Referer": "https://www.tiktok.com/",
                }},
                # Strategy C: use TikTok mobile API hostname via extractor-args
                {**base_opts, "extractor_args": {"tiktok": {"api_hostname": ["api16-normal-c-useast1a.tiktokv.com"]}},
                 "http_headers": {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                }},
            ]
            for opts in strategies:
                try:
                    with yt_dlp.YoutubeDL(opts) as ydl:
                        info = ydl.extract_info(f"https://www.tiktok.com/@{username}", download=False)
                    if not info:
                        continue
                    entries = info.get("entries") or []
                    if not entries:
                        continue
                    result = []
                    for e in (entries or []):
                        if not e:
                            continue
                        vid_id = str(e.get("id", ""))
                        if not vid_id:
                            continue
                        result.append({
                            "platform_video_id": vid_id,
                            "url": e.get("webpage_url") or e.get("url") or f"https://www.tiktok.com/@{username}/video/{vid_id}",
                            "title": e.get("title"),
                            "thumbnail_url": e.get("thumbnail"),
                            "views": int(e.get("view_count") or 0),
                            "likes": int(e.get("like_count") or 0),
                            "comments": int(e.get("comment_count") or 0),
                            "published_at": datetime.fromtimestamp(e["timestamp"], tz=timezone.utc).isoformat() if e.get("timestamp") else None,
                        })
                    if result:
                        logger.info(f"yt-dlp TikTok: got {len(result)} videos for @{username}")
                        return result
                except Exception as strat_e:
                    logger.warning(f"yt-dlp TikTok strategy failed for @{username}: {strat_e}")
                    continue
            raise ValueError(f"TikTok bloque les requêtes depuis ce serveur pour @{username}. Le scraping TikTok est inaccessible depuis les serveurs cloud en raison des protections anti-bot de TikTok.")
        try:
            return await loop.run_in_executor(_thread_pool, _ytdlp_videos)
        except Exception as e:
            logger.warning(f"yt-dlp TikTok failed for @{username}: {e}")
            if combined:
                return combined
            raise
    if combined:
        return combined
    raise ValueError("yt-dlp non installé — scraping TikTok impossible")


async def _fetch_instagram_videos_async(username: str, platform_channel_id: str = None, since_days: int = 3650) -> list:
    """
    Fetch Instagram videos/reels.
    Ordre de priorité (cloud Railway compatible) :
    1. Feed privé Instagram /api/v1/feed/user/{id}/ — vraies vues Reels (nécessite session cookie)
    2. RapidAPI instagram-scraper-api2 (fonctionne depuis datacenter, nécessite RAPIDAPI_KEY)
    3. httpx web_profile_info + session (vues moins précises pour Reels)
    4. instaloader avec session cookie
    5. instaloader sans session (résidentiel seulement)
    6. Playwright (dernière chance)
    """
    username = username.lstrip("@")

    # Priorité 0 : ClipScraper standalone (économique, contrôlé)
    if CLIP_SCRAPER_URL and CLIP_SCRAPER_KEY:
        try:
            cs_videos = await _fetch_via_clipscraper("instagram", username)
            if cs_videos:
                logger.info(f"ClipScraper Instagram: {len(cs_videos)} videos for @{username}")
                return cs_videos
        except Exception as e:
            logger.warning(f"ClipScraper Instagram failed for @{username}: {e}")

    # Priorité 1 : Apify Instagram Reel Scraper — fallback résidentiel
    if APIFY_TOKEN:
        try:
            videos = await _fetch_instagram_videos_apify(username)
            if videos:
                return videos
        except Exception as e:
            logger.warning(f"Apify Instagram failed for @{username}: {e}")

    # Priorité 2 : Feed + Reels via API privée Instagram (cookie requis)
    if INSTAGRAM_SESSIONS:
        try:
            # Récupérer le user_id numérique depuis web_profile_info
            _profile_data = await _scrape_instagram_api(username)
            _uid = (
                _profile_data.get("data", {}).get("user", {}).get("id")
                or _profile_data.get("data", {}).get("user", {}).get("pk")
            )
            if _uid:
                _uid = str(_uid)
                # Lancer les deux endpoints en parallèle
                feed_videos, reels_videos = await asyncio.gather(
                    _fetch_instagram_feed_videos(_uid),
                    _fetch_instagram_reels(_uid),
                    return_exceptions=True
                )
                if isinstance(feed_videos, Exception):
                    logger.warning(f"Feed error for @{username}: {feed_videos}")
                    feed_videos = []
                if isinstance(reels_videos, Exception):
                    logger.warning(f"Reels error for @{username}: {reels_videos}")
                    reels_videos = []

                # Fusionner : Reels en priorité (plus précis), feed pour les vidéos classiques
                seen_ids = set()
                merged = []
                for v in reels_videos:
                    seen_ids.add(v["platform_video_id"])
                    merged.append(v)
                for v in feed_videos:
                    if v["platform_video_id"] not in seen_ids:
                        merged.append(v)

                views_nonzero = sum(1 for v in merged if v.get("views", 0) > 0)
                logger.info(f"Instagram privé: {len(merged)} vidéos (@{username}), {views_nonzero} avec vues > 0")
                if merged:
                    return merged
        except Exception as e:
            logger.warning(f"Instagram private API failed for @{username}: {e}")

    # Priorité 2 : RapidAPI — fonctionne depuis Railway sans session
    if RAPIDAPI_KEY:
        try:
            videos = await _fetch_instagram_videos_rapidapi(username)
            if videos:
                logger.info(f"Instagram RapidAPI: {len(videos)} vidéos pour @{username}")
                return videos
        except Exception as e:
            logger.warning(f"RapidAPI Instagram videos failed for @{username}: {e}")

    # Priorité 3 : httpx web_profile_info + session (play_count souvent 0 pour Reels)
    if INSTAGRAM_SESSIONS:
        try:
            data = await _scrape_instagram_api(username)
            videos = _parse_instagram_videos(data)
            if videos:
                logger.info(f"Instagram httpx+session (web_profile_info): {len(videos)} vidéos pour @{username}")
                return videos
        except Exception as e:
            logger.warning(f"Instagram httpx+session videos failed for @{username}: {e}")

    # Priorité 4 : instaloader avec session cookie
    if INSTALOADER_AVAILABLE and INSTAGRAM_SESSIONS:
        loop = asyncio.get_event_loop()
        def _il_videos_with_session():
            L = instaloader.Instaloader(
                download_videos=False,
                download_video_thumbnails=False,
                download_geotags=False,
                download_comments=False,
                save_metadata=False,
                quiet=True,
            )
            try:
                L.context._session.cookies.set("sessionid", _get_instagram_session(), domain=".instagram.com")
            except Exception:
                pass
            profile = instaloader.Profile.from_username(L.context, username)
            result = []
            for post in profile.get_posts():
                if not post.is_video:
                    continue
                result.append({
                    "platform_video_id": str(post.mediaid),
                    "url": f"https://www.instagram.com/p/{post.shortcode}/",
                    "title": (post.caption or "")[:150],
                    "thumbnail_url": post.url,
                    "views": post.video_view_count or post._node.get("play_count") or post._node.get("view_count") or 0,
                    "likes": post.likes,
                    "comments": post.comments,
                    "published_at": post.date_utc.replace(tzinfo=timezone.utc).isoformat(),
                })
                if len(result) >= 200:
                    break
            return result
        try:
            videos = await loop.run_in_executor(_thread_pool, _il_videos_with_session)
            if videos:
                logger.info(f"Instagram instaloader+session: {len(videos)} vidéos pour @{username}")
                return videos
        except Exception as e:
            logger.warning(f"instaloader+session failed for @{username}: {e}")

    # Priorité 5 : instaloader sans session (IP résidentielle seulement)
    if INSTALOADER_AVAILABLE:
        loop = asyncio.get_event_loop()
        def _il_videos():
            L = instaloader.Instaloader(
                download_videos=False,
                download_video_thumbnails=False,
                download_geotags=False,
                download_comments=False,
                save_metadata=False,
                quiet=True,
            )
            profile = instaloader.Profile.from_username(L.context, username)
            result = []
            for post in profile.get_posts():
                if not post.is_video:
                    continue
                result.append({
                    "platform_video_id": str(post.mediaid),
                    "url": f"https://www.instagram.com/p/{post.shortcode}/",
                    "title": (post.caption or "")[:150],
                    "thumbnail_url": post.url,
                    "views": post.video_view_count or post._node.get("play_count") or post._node.get("view_count") or 0,
                    "likes": post.likes,
                    "comments": post.comments,
                    "published_at": post.date_utc.replace(tzinfo=timezone.utc).isoformat(),
                })
                if len(result) >= 200:
                    break
            return result
        try:
            return await loop.run_in_executor(_thread_pool, _il_videos)
        except Exception as e:
            logger.warning(f"instaloader failed for @{username}: {e}")

    # Priorité 6 : Playwright
    if PLAYWRIGHT_AVAILABLE:
        try:
            data = await _scrape_instagram_playwright(username)
            videos = _parse_instagram_videos(data)
            if videos:
                return videos
        except Exception as e:
            logger.warning(f"Playwright Instagram video fetch failed for @{username}: {e}")

    logger.error(f"Impossible de récupérer les vidéos Instagram @{username} — configurez RAPIDAPI_KEY ou INSTAGRAM_SESSION_ID")
    return []

async def _fetch_youtube_videos(channel_id: str, since_days: int = 30) -> list:
    if not YOUTUBE_API_KEY or not channel_id:
        return []
    # Get uploads playlist id
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            "https://www.googleapis.com/youtube/v3/channels",
            params={"part": "contentDetails", "id": channel_id, "key": YOUTUBE_API_KEY}
        )
        items = r.json().get("items", [])
        if not items:
            return []
        uploads_playlist = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]

        r2 = await c.get(
            "https://www.googleapis.com/youtube/v3/playlistItems",
            params={"part": "snippet,contentDetails", "playlistId": uploads_playlist,
                    "maxResults": 200, "key": YOUTUBE_API_KEY}
        )
        playlist_items = r2.json().get("items", [])

    # Pas de filtre de date — on récupère toutes les vidéos
    video_ids = [item["contentDetails"]["videoId"] for item in playlist_items if item.get("contentDetails", {}).get("videoId")]

    if not video_ids:
        return []

    async with httpx.AsyncClient(timeout=15) as c:
        r3 = await c.get(
            "https://www.googleapis.com/youtube/v3/videos",
            params={"part": "snippet,statistics", "id": ",".join(video_ids), "key": YOUTUBE_API_KEY}
        )
        vid_items = r3.json().get("items", [])

    result = []
    for v in vid_items:
        snip = v.get("snippet", {})
        stats = v.get("statistics", {})
        result.append({
            "platform_video_id": v["id"],
            "url": f"https://www.youtube.com/watch?v={v['id']}",
            "title": snip.get("title"),
            "thumbnail_url": snip.get("thumbnails", {}).get("medium", {}).get("url"),
            "views": int(stats.get("viewCount", 0)),
            "likes": int(stats.get("likeCount", 0)),
            "comments": int(stats.get("commentCount", 0)),
            "published_at": snip.get("publishedAt"),
        })
    return result

def _parse_utc(s) -> "datetime | None":
    """Parse an ISO datetime string and return UTC-aware datetime, or None on failure."""
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None

async def _fetch_single_tiktok_video(url: str) -> dict:
    """Fetch stats for a single TikTok video URL via TikWm API."""
    params = {"url": url, "count": 1}
    if TIKWM_API_KEY:
        params["key"] = TIKWM_API_KEY
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get("https://www.tikwm.com/api/", params=params)
        data = r.json()
    if data.get("code") != 0:
        raise ValueError(f"TikWm: {data.get('msg', 'Erreur inconnue')}")
    vid = data.get("data", {})
    create_time = vid.get("create_time")
    return {
        "platform_video_id": str(vid.get("id", f"tk_{uuid.uuid4().hex[:8]}")),
        "url": url,
        "title": (vid.get("title") or "")[:200] or None,
        "thumbnail_url": vid.get("cover") or vid.get("origin_cover"),
        "views": int(vid.get("play_count", 0)),
        "likes": int(vid.get("digg_count", 0)),
        "comments": int(vid.get("comment_count", 0)),
        "published_at": datetime.fromtimestamp(int(create_time), tz=timezone.utc).isoformat() if create_time else None,
    }

async def _fetch_single_youtube_video(url: str) -> dict:
    """Fetch stats for a single YouTube video URL via YouTube Data API. Never raises — always returns a valid dict."""
    # Supporte tous les formats : watch?v= / youtu.be/ / shorts/ / embed/ / v/ / live/
    m = re.search(r'(?:v=|vi=|youtu\.be/|/shorts/|/embed/|/v/|/live/)([a-zA-Z0-9_-]{11})', url)
    video_id = m.group(1) if m else None
    fallback = {
        "platform_video_id": video_id or f"yt_{uuid.uuid4().hex[:8]}",
        "url": url, "title": None,
        "thumbnail_url": f"https://img.youtube.com/vi/{video_id}/mqdefault.jpg" if video_id else None,
        "views": 0, "likes": 0, "comments": 0, "published_at": None,
    }
    if not YOUTUBE_API_KEY or not video_id:
        return fallback
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={"id": video_id, "part": "statistics,snippet", "key": YOUTUBE_API_KEY}
            )
            data = r.json()
        items = data.get("items", [])
        if not items:
            return fallback
        item = items[0]
        stats = item.get("statistics", {})
        snip = item.get("snippet", {})
        return {
            "platform_video_id": video_id,
            "url": url,
            "title": snip.get("title", "")[:200] or None,
            "thumbnail_url": snip.get("thumbnails", {}).get("medium", {}).get("url"),
            "views": int(stats.get("viewCount", 0)),
            "likes": int(stats.get("likeCount", 0)),
            "comments": int(stats.get("commentCount", 0)),
            "published_at": snip.get("publishedAt"),
        }
    except Exception as e:
        logger.warning(f"_fetch_single_youtube_video error for {url}: {type(e).__name__}: {e}")
        return fallback

async def _fetch_single_instagram_video(url: str) -> dict:
    """Fetch real stats for a single Instagram video via web API + yt-dlp fallback. Never raises."""
    try:
        m = re.search(r'/(?:p|reel|reels)/([A-Za-z0-9_-]+)', url)
        shortcode = m.group(1) if m else None
    except Exception:
        shortcode = None
    fallback = {
        "platform_video_id": shortcode or f"ig_{uuid.uuid4().hex[:8]}",
        "url": url,
        "title": None,
        "thumbnail_url": None,
        "views": 0,
        "likes": 0,
        "comments": 0,
        "published_at": None,
    }
    if not shortcode:
        return fallback

    # Strategy 1 (PRIORITAIRE - gratuit) : ClipScraper VPS (yt-dlp + proxy résidentiel webshare)
    # Bypasse les blocages Railway, gratuit illimite (proxy webshare deja paye 11€/mois fixe)
    logger.info(f"_fetch_single_instagram_video: trying ClipScraper VPS for {shortcode}")
    cs_result = await _fetch_video_stats_via_clipscraper(url)
    if cs_result:
        views_cs = int(cs_result.get("views") or 0)
        likes_cs = int(cs_result.get("likes") or 0)
        if views_cs > 0 or likes_cs > 0:
            logger.info(f"ClipScraper VPS SUCCESS for {shortcode}: views={views_cs} likes={likes_cs}")
            return {
                "platform_video_id": cs_result.get("platform_video_id") or shortcode,
                "url": url,
                "title": cs_result.get("title"),
                "thumbnail_url": cs_result.get("thumbnail_url"),
                "views": views_cs,
                "likes": likes_cs,
                "comments": int(cs_result.get("comments") or 0),
                "published_at": cs_result.get("published_at"),
            }
        logger.warning(f"ClipScraper VPS returned 0 views/likes for {shortcode}")

    # Strategy 1: Instagram public web endpoint (avec proxy si configuré, sinon direct)
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 Instagram 295.0.0.32.119",
            "X-IG-App-ID": "936619743392459",
            "Accept": "*/*",
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
            "Referer": "https://www.instagram.com/",
        }
        cookies = {}
        session = _get_instagram_session()
        if session:
            cookies["sessionid"] = session
        client_kwargs = {"timeout": 15, "headers": headers, "cookies": cookies, "follow_redirects": True}
        if BACKEND_PROXY_URL:
            client_kwargs["proxies"] = {"http://": BACKEND_PROXY_URL, "https://": BACKEND_PROXY_URL}
        async with httpx.AsyncClient(**client_kwargs) as c:
            r = await c.get(f"https://www.instagram.com/api/v1/media/{shortcode}/info/")
            if r.status_code == 200:
                data = r.json()
                items = data.get("items") or []
                if items:
                    item = items[0]
                    return {
                        "platform_video_id": shortcode,
                        "url": url,
                        "title": (item.get("caption") or {}).get("text", "")[:200] or None,
                        "thumbnail_url": (item.get("image_versions2") or {}).get("candidates", [{}])[0].get("url"),
                        "views": int(item.get("play_count") or item.get("video_view_count") or item.get("ig_play_count") or 0),
                        "likes": int(item.get("like_count") or 0),
                        "comments": int(item.get("comment_count") or 0),
                        "published_at": datetime.fromtimestamp(item.get("taken_at", 0), tz=timezone.utc).isoformat() if item.get("taken_at") else None,
                    }
    except Exception as e:
        logger.debug(f"Instagram web API failed for {shortcode}: {e}")

    # Strategy 3: yt-dlp local Railway (avec proxy backend si configuré, sinon direct)
    if YT_DLP_AVAILABLE:
        try:
            loop = asyncio.get_event_loop()
            def _ytdlp_extract():
                opts = {"quiet": True, "skip_download": True, "no_warnings": True, "ignoreerrors": True}
                if BACKEND_PROXY_URL:
                    opts["proxy"] = BACKEND_PROXY_URL
                with yt_dlp.YoutubeDL(opts) as ydl:
                    return ydl.extract_info(url, download=False)
            info = await loop.run_in_executor(_thread_pool, _ytdlp_extract)
            if info:
                vws = int(info.get("view_count") or 0)
                lks = int(info.get("like_count") or 0)
                if vws > 0 or lks > 0:
                    logger.info(f"yt-dlp local SUCCESS for {shortcode}: views={vws} likes={lks}")
                    return {
                        "platform_video_id": shortcode,
                        "url": url,
                        "title": (info.get("title") or info.get("description") or "")[:200] or None,
                        "thumbnail_url": info.get("thumbnail"),
                        "views": vws,
                        "likes": lks,
                        "comments": int(info.get("comment_count") or 0),
                        "published_at": datetime.fromtimestamp(info["timestamp"], tz=timezone.utc).isoformat() if info.get("timestamp") else None,
                    }
        except Exception as e:
            logger.warning(f"_fetch_single_instagram_video yt-dlp failed for {url}: {type(e).__name__}: {e}")

    # Strategy 4 (DERNIER RECOURS) : Apify Instagram Scraper
    # SEULEMENT si toutes les autres ont echoue. Coût ~$0.30/1000 = quasi rien sur 100 video/mois mais on evite quand meme.
    if APIFY_TOKEN:
        logger.info(f"_fetch_single_instagram_video: ALL FREE METHODS FAILED, trying Apify (paid backup) for {shortcode}")
        for actor_id in ("apify~instagram-scraper", "apify~instagram-post-scraper"):
            try:
                async with httpx.AsyncClient(timeout=180) as c:
                    ar = await c.post(
                        f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items",
                        params={"token": APIFY_TOKEN},
                        json={"directUrls": [url], "resultsType": "details", "resultsLimit": 1, "addParentData": False},
                    )
                if ar.status_code != 200:
                    continue
                items = ar.json() or []
                if not items:
                    continue
                item = items[0] if isinstance(items[0], dict) else {}
                views_val = (item.get("videoViewCount") or item.get("videoPlayCount")
                             or item.get("playCount") or item.get("viewsCount") or 0)
                likes_val = item.get("likesCount") or 0
                if not views_val and not likes_val:
                    continue
                logger.info(f"Apify {actor_id} BACKUP SUCCESS for {shortcode}: views={views_val} likes={likes_val}")
                return {
                    "platform_video_id": item.get("shortCode") or item.get("id") or shortcode,
                    "url": url,
                    "title": (item.get("caption") or "")[:200] or None,
                    "thumbnail_url": item.get("displayUrl") or item.get("thumbnailUrl"),
                    "views": int(views_val),
                    "likes": int(likes_val),
                    "comments": int(item.get("commentsCount") or 0),
                    "published_at": item.get("timestamp"),
                }
            except Exception as e:
                logger.warning(f"Apify backup {actor_id} failed for {shortcode}: {type(e).__name__}: {e}")
                continue

    return fallback

async def fetch_single_video_by_url(url: str, platform: str) -> dict:
    """Dispatcher: fetch video stats from a URL by platform."""
    platform = platform.lower()
    if platform == "tiktok":
        return await _fetch_single_tiktok_video(url)
    elif platform == "youtube":
        return await _fetch_single_youtube_video(url)
    elif platform == "instagram":
        return await _fetch_single_instagram_video(url)
    raise ValueError(f"Plateforme non supportée: {platform}")

async def fetch_videos(platform: str, username: str, account: dict, since_days: int = 30) -> list:
    service_map = {"youtube": "youtube", "tiktok": "apify", "instagram": "apify"}
    success = True
    try:
        if platform == "youtube":
            channel_id = account.get("platform_channel_id")
            return await _fetch_youtube_videos(channel_id, since_days)
        elif platform == "tiktok":
            return await _fetch_tiktok_videos_async(username, since_days, account.get("platform_channel_id"))
        elif platform == "instagram":
            platform_channel_id = account.get("platform_channel_id")
            return await _fetch_instagram_videos_async(username, platform_channel_id, since_days)
        return []
    except Exception:
        success = False
        raise
    finally:
        asyncio.create_task(_track_api_call(service_map.get(platform, platform), success))

async def run_video_tracking():
    logger.info("Starting video tracking run...")
    campaigns = await db.campaigns.find({"status": "active"}, {"_id": 0}).to_list(500)
    for campaign in campaigns:
        campaign_id = campaign["campaign_id"]
        rpm = campaign.get("rpm", 0)
        # Get all assignments for this campaign
        assignments = await db.campaign_social_accounts.find(
            {"campaign_id": campaign_id}, {"_id": 0}
        ).to_list(500)
        for assignment in assignments:
            account_id = assignment["account_id"]
            user_id = assignment["user_id"]
            # Cutoff: only videos published AFTER the account was assigned to this campaign
            assigned_cutoff = _parse_utc(assignment.get("assigned_at"))
            account = await db.social_accounts.find_one(
                {"account_id": account_id, "status": "verified"}, {"_id": 0}
            )
            if not account:
                continue
            platform = account["platform"]
            username = account["username"]

            # ── Smart cache COMPTE : skip Apify si pas de growth récent ──
            # Seuls les comptes "actifs" (avec growth) gardent un tracking 6h.
            # Comptes "stagnants" (no growth depuis 1 scan) → tracking 12h.
            # Comptes "morts" (no growth depuis 3 scans + total < 1000 vues) → tracking 24h.
            # YouTube est gratuit (API officielle), on ne skip jamais.
            try:
                last_tracked = account.get("last_tracked_at")
                last_growth = account.get("last_growth", None)
                last_total = account.get("last_total_views", 0) or 0
                if platform != "youtube" and last_tracked and last_growth is not None:
                    last_dt = _parse_utc(last_tracked) or datetime.now(timezone.utc)
                    elapsed_hours = (datetime.now(timezone.utc) - last_dt).total_seconds() / 3600
                    # Comptes très inactifs : 24h
                    if last_growth == 0 and last_total < 1000 and elapsed_hours < 24:
                        logger.info(f"Skip {platform}/@{username} — cold (no growth, low views) — wait 24h")
                        continue
                    # Comptes stagnants : 12h
                    if last_growth == 0 and elapsed_hours < 12:
                        logger.info(f"Skip {platform}/@{username} — stagnant (no growth) — wait 12h")
                        continue
            except Exception:
                pass  # En cas de doute, on scrape
            # YouTube: if channel_id is missing (verified via HTTP fallback), try to re-verify
            if platform == "youtube" and not account.get("platform_channel_id") and YOUTUBE_API_KEY:
                try:
                    info = await _verify_youtube(username)
                    new_cid = info.get("platform_channel_id")
                    if new_cid:
                        await db.social_accounts.update_one(
                            {"account_id": account_id},
                            {"$set": {"platform_channel_id": new_cid,
                                      "display_name": info.get("display_name", username),
                                      "follower_count": info.get("follower_count"),
                                      "avatar_url": info.get("avatar_url")}}
                        )
                        account["platform_channel_id"] = new_cid
                        logger.info(f"YouTube channel_id recovered for @{username}: {new_cid}")
                except Exception as yt_e:
                    logger.warning(f"YouTube re-verify failed for @{username}: {yt_e}")
            try:
                # Compute since_days dynamically from last_tracked_at
                last_tracked = account.get("last_tracked_at")
                if last_tracked:
                    try:
                        lt_dt = _parse_utc(last_tracked) or datetime.now(timezone.utc)
                        delta_days = (datetime.now(timezone.utc) - lt_dt).total_seconds() / 86400
                        since_days = max(2, int(delta_days) + 2)
                    except Exception:
                        since_days = 7
                else:
                    # First tracking for this account — only look back 7 days max
                    # (the assigned_at filter will drop pre-campaign videos anyway)
                    since_days = 7
                try:
                    videos = await fetch_videos(platform, username, account, since_days)
                except Exception as fetch_err:
                    logger.warning(f"fetch_videos failed for {platform}/@{username}: {fetch_err}")
                    videos = []
                now_iso = datetime.now(timezone.utc).isoformat()
                if not videos:
                    await db.social_accounts.update_one(
                        {"account_id": account_id},
                        {"$set": {"last_tracked_at": now_iso}}
                    )
                    await asyncio.sleep(0.5)
                    continue

                # ── Smart cache : récupère les vidéos existantes pour comparer growth ──
                existing_map = {}
                try:
                    existing_docs = await db.tracked_videos.find(
                        {"account_id": account_id},
                        {"_id": 0, "platform_video_id": 1, "views": 1}
                    ).to_list(500)
                    existing_map = {d["platform_video_id"]: d.get("views", 0) for d in existing_docs}
                except Exception:
                    pass

                saved_count = 0
                skipped_cold = 0
                for vid in videos:
                    if not vid.get("platform_video_id"):
                        continue
                    # Skip videos published before the account was assigned to this campaign
                    pub_dt = _parse_utc(vid.get("published_at"))
                    if assigned_cutoff and pub_dt and pub_dt < assigned_cutoff:
                        continue

                    # ── Smart cache : skip update si video froide (< 100 vues ET pas de growth) ──
                    new_views = int(vid.get("views", 0) or 0)
                    old_views = int(existing_map.get(vid["platform_video_id"], 0) or 0)
                    has_growth = new_views > old_views
                    is_cold = (not has_growth) and new_views < 100 and old_views > 0
                    if is_cold:
                        skipped_cold += 1
                        continue

                    earnings = (new_views / 1000) * rpm
                    set_fields = {
                        "platform_video_id": vid["platform_video_id"],
                        "account_id": account_id,
                        "user_id": user_id,
                        "campaign_id": campaign_id,
                        "platform": platform,
                        "url": vid.get("url", ""),
                        "title": vid.get("title"),
                        "thumbnail_url": vid.get("thumbnail_url"),
                        "views": new_views,
                        "likes": vid["likes"],
                        "comments": vid["comments"],
                        "published_at": vid.get("published_at"),
                        "fetched_at": now_iso,
                        "earnings": round(earnings, 4),
                    }
                    try:
                        await db.tracked_videos.update_one(
                            {"account_id": account_id, "platform_video_id": vid["platform_video_id"]},
                            {"$set": set_fields,
                             "$setOnInsert": {"video_id": f"vid_{uuid.uuid4().hex[:12]}", "created_at": now_iso}},
                            upsert=True
                        )
                        saved_count += 1
                    except Exception as upsert_err:
                        logger.warning(f"Failed to upsert video {vid.get('platform_video_id')} for {platform}/@{username}: {upsert_err}")
                logger.info(f"Tracked {saved_count} videos for {platform}/@{username} ({skipped_cold} skipped as cold)")

                # ── Smart cache compte : track total_views pour ajuster fréquence future ──
                new_account_total = sum(int(v.get("views", 0) or 0) for v in videos)
                old_account_total = account.get("last_total_views", 0) or 0
                account_growth = new_account_total - old_account_total
                await db.social_accounts.update_one(
                    {"account_id": account_id},
                    {"$set": {
                        "last_tracked_at": now_iso,
                        "last_total_views": new_account_total,
                        "last_growth": account_growth,
                    }}
                )
                # jitter to reduce rate-limit risk
                await asyncio.sleep(1)
            except Exception as e:
                logger.warning(f"Tracking failed for {platform}/@{username}: {e}")
        # Re-fetch manually added videos to keep views updated
        try:
            manual_vids = await db.tracked_videos.find(
                {"campaign_id": campaign_id, "manually_added": True, "url": {"$ne": None}},
                {"_id": 0, "video_id": 1, "url": 1, "platform": 1, "user_id": 1}
            ).to_list(50)
            for mv in manual_vids:
                try:
                    mv_url = mv.get("url", "")
                    mv_platform = mv.get("platform", "")
                    if not mv_url or not mv_platform:
                        continue
                    fresh = await fetch_single_video_by_url(mv_url, mv_platform)
                    mv_earnings = round((fresh["views"] / 1000) * rpm, 2) if mv.get("user_id") else 0
                    await db.tracked_videos.update_one(
                        {"video_id": mv["video_id"]},
                        {"$set": {
                            "views": fresh["views"],
                            "likes": fresh.get("likes", 0),
                            "comments": fresh.get("comments", 0),
                            "earnings": mv_earnings,
                            "fetched_at": datetime.now(timezone.utc).isoformat(),
                        }}
                    )
                except Exception as e:
                    logger.debug(f"Manual video re-fetch skipped: {e}")
                await asyncio.sleep(0.3)
        except Exception as e:
            logger.warning(f"Manual videos re-fetch error for {campaign_id}: {e}")
        # Update budget_used and store daily snapshot
        try:
            agg = await db.tracked_videos.aggregate([
                {"$match": {"campaign_id": campaign_id}},
                {"$group": {"_id": None, "total_views": {"$sum": "$views"}}}
            ]).to_list(1)
            total_campaign_views = agg[0]["total_views"] if agg else 0
            budget_used = round((total_campaign_views / 1000) * rpm, 2)
            # Build update : si budget épuisé et campagne pas illimitée, auto-pause
            update_set: dict = {"budget_used": budget_used}
            budget_total = campaign.get("budget_total") or 0
            budget_unlimited = campaign.get("budget_unlimited", False)
            current_status = campaign.get("status")
            if (not budget_unlimited and budget_total > 0 and budget_used >= budget_total
                    and current_status == "active"):
                update_set["status"] = "paused"
                update_set["paused_reason"] = "budget_exhausted"
                logger.info(f"Auto-pause campaign {campaign_id}: budget exhausted ({budget_used}€ >= {budget_total}€)")
            await db.campaigns.update_one(
                {"campaign_id": campaign_id},
                {"$set": update_set}
            )
            # Daily snapshot for chart
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            await db.views_snapshots.update_one(
                {"campaign_id": campaign_id, "date": today_str},
                {"$set": {
                    "campaign_id": campaign_id,
                    "date": today_str,
                    "total_views": total_campaign_views,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }},
                upsert=True
            )
            # Per-user daily snapshot (for clipper personal chart)
            user_ids_in_campaign = list({a["user_id"] for a in assignments if a.get("user_id")})
            for uid in user_ids_in_campaign:
                try:
                    u_agg = await db.tracked_videos.aggregate([
                        {"$match": {"campaign_id": campaign_id, "user_id": uid}},
                        {"$group": {"_id": None, "total_views": {"$sum": "$views"}}}
                    ]).to_list(1)
                    u_total = u_agg[0]["total_views"] if u_agg else 0
                    await db.user_views_snapshots.update_one(
                        {"campaign_id": campaign_id, "user_id": uid, "date": today_str},
                        {"$set": {"campaign_id": campaign_id, "user_id": uid,
                                  "date": today_str, "total_views": u_total,
                                  "updated_at": datetime.now(timezone.utc).isoformat()}},
                        upsert=True
                    )
                except Exception as ue:
                    logger.debug(f"User snapshot failed for {uid}: {ue}")
        except Exception as e:
            logger.warning(f"Failed to update budget/snapshot for {campaign_id}: {e}")
    # Global daily snapshot (all campaigns)
    try:
        agg_all = await db.tracked_videos.aggregate([
            {"$group": {"_id": None, "total_views": {"$sum": "$views"}, "total_videos": {"$sum": 1}}}
        ]).to_list(1)
        total_global_views = agg_all[0]["total_views"] if agg_all else 0
        total_global_videos = agg_all[0]["total_videos"] if agg_all else 0
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        await db.views_snapshots.update_one(
            {"campaign_id": "__global__", "date": today_str},
            {"$set": {
                "campaign_id": "__global__",
                "date": today_str,
                "total_views": total_global_views,
                "total_videos": total_global_videos,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )
    except Exception as e:
        logger.warning(f"Failed to store global snapshot: {e}")
    logger.info("Video tracking run complete.")

async def track_videos_loop():
    while True:
        try:
            await run_video_tracking()
        except Exception as e:
            logger.error(f"Video tracking loop error: {e}")
        await asyncio.sleep(6 * 3600)  # toutes les 6h — économise les crédits Apify

# ================= SOCIAL ACCOUNTS =================

@api_router.get("/social-accounts")
async def get_social_accounts(user: dict = Depends(get_current_user)):
    accounts = await db.social_accounts.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).to_list(50)
    return {"accounts": accounts}

@api_router.post("/social-accounts")
async def add_social_account(account_data: SocialAccountCreate, user: dict = Depends(get_current_user)):
    if user.get("role") != "clipper":
        raise HTTPException(status_code=403, detail="Only clippers can add social accounts")

    # Determine username: from URL or direct handle
    username = account_data.username or ""
    via_url = False
    if account_data.account_url:
        username = extract_handle_from_url(account_data.account_url, account_data.platform)
        via_url = True
    elif username.startswith("http"):
        username = extract_handle_from_url(username, account_data.platform)
        via_url = True
    username = username.strip().lstrip("@")
    if not username:
        raise HTTPException(status_code=400, detail="Veuillez fournir un nom d'utilisateur ou une URL")

    existing = await db.social_accounts.find_one({
        "user_id": user["user_id"],
        "platform": account_data.platform,
        "username": username
    })
    if existing:
        raise HTTPException(status_code=400, detail="Account already exists")

    account_id = f"acc_{uuid.uuid4().hex[:12]}"
    account = {
        "account_id": account_id,
        "user_id": user["user_id"],
        "platform": account_data.platform,
        "username": username,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "follower_count": None,
        "avatar_url": None,
        "display_name": None,
        "verified_at": None,
        "error_message": None,
        "last_tracked_at": None,
        "platform_channel_id": None,
    }

    await db.social_accounts.insert_one(account)
    account.pop("_id", None)
    asyncio.create_task(_verify_and_update_account(account_id, account_data.platform, username, via_url=via_url))
    return account

@api_router.delete("/social-accounts/{account_id}")
async def delete_social_account(account_id: str, user: dict = Depends(get_current_user)):
    account = await db.social_accounts.find_one({
        "account_id": account_id,
        "user_id": user["user_id"]
    })
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    await db.social_accounts.delete_one({"account_id": account_id})
    await db.campaign_social_accounts.delete_many({"account_id": account_id})
    
    return {"message": "Account deleted"}

@api_router.get("/campaigns/{campaign_id}/social-accounts")
async def get_campaign_social_accounts(campaign_id: str, user: dict = Depends(get_current_user)):
    """Get social accounts assigned to a campaign for current user"""
    assignments = await db.campaign_social_accounts.find(
        {"campaign_id": campaign_id, "user_id": user["user_id"]},
        {"_id": 0}
    ).to_list(50)
    
    account_ids = [a["account_id"] for a in assignments]
    accounts = await db.social_accounts.find(
        {"account_id": {"$in": account_ids}},
        {"_id": 0}
    ).to_list(50)
    
    return {"accounts": accounts}

@api_router.post("/campaigns/{campaign_id}/social-accounts/{account_id}")
async def assign_account_to_campaign(campaign_id: str, account_id: str, user: dict = Depends(get_current_user)):
    # Vérifier que le clipper est accepté (pas pending)
    if user.get("role") == "clipper":
        member = await db.campaign_members.find_one({
            "campaign_id": campaign_id, "user_id": user["user_id"], "role": "clipper"
        })
        if not member:
            raise HTTPException(status_code=403, detail="Tu ne fais pas partie de cette campagne")
        if member.get("status") == "pending":
            raise HTTPException(status_code=403, detail="Ta candidature est en attente de validation.")

    account = await db.social_accounts.find_one({
        "account_id": account_id,
        "user_id": user["user_id"]
    })
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Vérifie que la plateforme du compte est autorisée par la campagne
    campaign_doc = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0, "platforms": 1, "name": 1})
    if campaign_doc:
        allowed_platforms = campaign_doc.get("platforms") or []
        # Si la liste est vide → autoriser tout (legacy / non configuré)
        if allowed_platforms and account["platform"] not in allowed_platforms:
            platforms_label = ", ".join(allowed_platforms) or "aucune"
            raise HTTPException(
                status_code=400,
                detail=f"La campagne « {campaign_doc.get('name', '')} » n'accepte que les plateformes : {platforms_label}. "
                       f"Demande à l'agence d'ajouter {account['platform']} dans les paramètres de la campagne."
            )

    existing = await db.campaign_social_accounts.find_one({
        "campaign_id": campaign_id,
        "account_id": account_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already assigned to this campaign")

    # A social account can only be active on ONE campaign at a time
    other_assignment = await db.campaign_social_accounts.find_one({
        "account_id": account_id,
        "campaign_id": {"$ne": campaign_id}
    })
    if other_assignment:
        # Get the campaign name for a helpful error message
        other_campaign = await db.campaigns.find_one(
            {"campaign_id": other_assignment["campaign_id"]}, {"_id": 0, "name": 1}
        )
        other_name = other_campaign.get("name", other_assignment["campaign_id"]) if other_campaign else other_assignment["campaign_id"]
        raise HTTPException(
            status_code=409,
            detail=f"Ce compte est déjà utilisé dans la campagne « {other_name} ». Un compte ne peut être actif que sur une seule campagne à la fois."
        )

    assignment = {
        "id": f"csa_{uuid.uuid4().hex[:12]}",
        "campaign_id": campaign_id,
        "user_id": user["user_id"],
        "account_id": account_id,
        "assigned_at": datetime.now(timezone.utc).isoformat()
    }

    await db.campaign_social_accounts.insert_one(assignment)

    # Trigger immediate tracking for this account+campaign (background, non-blocking)
    # cutoff = now: only videos published AFTER assignment are counted
    _assign_cutoff = datetime.now(timezone.utc)

    async def _immediate_track(acc_id: str, cid: str, uid: str, cutoff: datetime):
        try:
            acc = await db.social_accounts.find_one({"account_id": acc_id, "status": "verified"}, {"_id": 0})
            if not acc:
                return
            campaign = await db.campaigns.find_one({"campaign_id": cid}, {"_id": 0})
            rpm = (campaign or {}).get("rpm", 0)
            videos = await fetch_videos(acc["platform"], acc["username"], acc, since_days=7)
            now_iso = datetime.now(timezone.utc).isoformat()
            inserted = 0
            for vid in videos:
                if not vid.get("platform_video_id"):
                    continue
                # Only track videos published AFTER the account was assigned to this campaign
                pub_dt = _parse_utc(vid.get("published_at"))
                if pub_dt and pub_dt < cutoff:
                    continue  # Pre-campaign video — skip
                earnings = (vid["views"] / 1000) * rpm
                set_fields = {
                    "platform_video_id": vid["platform_video_id"],
                    "account_id": acc_id,
                    "user_id": uid,
                    "campaign_id": cid,
                    "platform": acc["platform"],
                    "url": vid.get("url", ""),
                    "title": vid.get("title"),
                    "thumbnail_url": vid.get("thumbnail_url"),
                    "views": vid["views"],
                    "likes": vid["likes"],
                    "comments": vid["comments"],
                    "published_at": vid.get("published_at"),
                    "fetched_at": now_iso,
                    "earnings": round(earnings, 4),
                    "manually_added": False,
                    "simulated": False,
                }
                try:
                    await db.tracked_videos.update_one(
                        {"account_id": acc_id, "platform_video_id": vid["platform_video_id"]},
                        {"$set": set_fields,
                         "$setOnInsert": {"video_id": f"vid_{uuid.uuid4().hex[:12]}", "created_at": now_iso}},
                        upsert=True
                    )
                    inserted += 1
                except Exception:
                    pass
            logger.info(f"Immediate track: {inserted} post-campaign videos saved for {acc['platform']}/@{acc['username']}")
            await db.social_accounts.update_one({"account_id": acc_id}, {"$set": {"last_tracked_at": now_iso}})
        except Exception as e:
            logger.debug(f"Immediate track on assign failed for {acc_id}: {e}")

    asyncio.create_task(_immediate_track(account_id, campaign_id, user["user_id"], _assign_cutoff))
    return {"message": "Account assigned"}

@api_router.delete("/campaigns/{campaign_id}/social-accounts/{account_id}")
async def remove_account_from_campaign(campaign_id: str, account_id: str, user: dict = Depends(get_current_user)):
    query = {"campaign_id": campaign_id, "account_id": account_id}
    # Agency/Manager can remove any account; clipper can only remove their own
    if user.get("role") not in ["agency", "manager"]:
        query["user_id"] = user["user_id"]
    result = await db.campaign_social_accounts.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"message": "Account removed from campaign"}

@api_router.delete("/campaigns/{campaign_id}/members/{member_user_id}")
async def kick_member_from_campaign(campaign_id: str, member_user_id: str, user: dict = Depends(get_current_user)):
    """Agency/Manager kicks a clipper or manager out of a campaign."""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager uniquement")
    campaign_check = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign_check:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    await _assert_campaign_authority(user, campaign_check)
    result = await db.campaign_members.delete_one({
        "campaign_id": campaign_id,
        "user_id": member_user_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    # Also remove their social account assignments from this campaign
    await db.campaign_social_accounts.delete_many({
        "campaign_id": campaign_id,
        "user_id": member_user_id
    })
    return {"message": "Membre retiré de la campagne"}

@api_router.delete("/campaigns/{campaign_id}/videos/{video_id}")
async def delete_campaign_video(campaign_id: str, video_id: str, user: dict = Depends(get_current_user)):
    """Agency/Manager deletes any tracked video from a campaign."""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager uniquement")
    campaign_check = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign_check:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    await _assert_campaign_authority(user, campaign_check)
    result = await db.tracked_videos.delete_one({
        "video_id": video_id,
        "campaign_id": campaign_id,
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vidéo introuvable")
    return {"message": "Vidéo supprimée"}

@api_router.post("/social-accounts/{account_id}/refresh")
async def refresh_social_account(account_id: str, user: dict = Depends(get_current_user)):
    """Re-trigger verification for a social account"""
    account = await db.social_accounts.find_one({"account_id": account_id, "user_id": user["user_id"]}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.social_accounts.update_one({"account_id": account_id}, {"$set": {"status": "pending", "error_message": None}})
    asyncio.create_task(_verify_and_update_account(account_id, account["platform"], account["username"]))
    return {"message": "Vérification relancée"}


async def _background_scrape_account(account_id: str, user_id: str):
    """Background task: scrapes videos for a social account and saves them to DB.
    Updates scrape_status to 'done' or 'error' when finished.
    """
    try:
        account = await db.social_accounts.find_one({"account_id": account_id}, {"_id": 0})
        if not account:
            return
        platform = account["platform"]
        username = account.get("username") or account.get("account_url") or ""
        now_iso = datetime.now(timezone.utc).isoformat()

        scrape_error = None
        videos = []
        try:
            # Timeout global 50s pour éviter le blocage sur Railway
            videos = await asyncio.wait_for(
                fetch_videos(platform, username, account, since_days=3650),
                timeout=50
            )
        except asyncio.TimeoutError:
            scrape_error = f"Timeout: le scraping de {platform} a dépassé 50s. Essayez 'Ajouter vidéo' manuellement."
            logger.warning(f"Scrape timeout for {platform}/@{username}")
        except Exception as e:
            scrape_error = str(e)
            logger.warning(f"Scrape error for {platform}/@{username}: {e}")

        if not videos and scrape_error:
            await db.social_accounts.update_one(
                {"account_id": account_id},
                {"$set": {
                    "scrape_status": "error",
                    "scrape_status_message": scrape_error,
                    "last_tracked_at": now_iso,
                }}
            )
            return

        if not videos:
            platform_tips = {
                "tiktok": (
                    "Aucune vidéo trouvée. TikTok bloque le scraping depuis les serveurs cloud. "
                    "Utilisez 'Ajouter vidéo' pour coller l'URL manuellement, "
                    "ou configurez TIKWM_API_KEY (gratuit sur tikwm.com) dans Railway."
                ),
                "instagram": (
                    "Aucune vidéo trouvée. Vérifiez que le compte Instagram est public et a des Reels. "
                    "Instagram bloque souvent le scraping cloud — utilisez 'Ajouter vidéo' manuellement."
                ),
                "youtube": (
                    "Aucune vidéo trouvée. Vérifiez que YOUTUBE_API_KEY est configurée dans Railway "
                    "et que la chaîne a des vidéos publiques."
                ),
            }
            msg = platform_tips.get(platform, f"Aucune vidéo trouvée pour {platform}/@{username}.")
            await db.social_accounts.update_one(
                {"account_id": account_id},
                {"$set": {
                    "scrape_status": "error",
                    "scrape_status_message": msg,
                    "last_tracked_at": now_iso,
                }}
            )
            return

        # Chercher les campagnes auxquelles ce compte est assigné
        assignments = await db.campaign_social_accounts.find(
            {"account_id": account_id}, {"_id": 0, "campaign_id": 1}
        ).to_list(50)
        linked_campaign_ids = [a["campaign_id"] for a in assignments]

        campaign_rpms = {}
        for cid in linked_campaign_ids:
            camp = await db.campaigns.find_one({"campaign_id": cid}, {"_id": 0, "rpm": 1})
            if camp:
                campaign_rpms[cid] = camp.get("rpm", 0)

        primary_campaign_id = linked_campaign_ids[0] if linked_campaign_ids else None
        primary_rpm = campaign_rpms.get(primary_campaign_id, 0) if primary_campaign_id else 0

        saved = 0
        for vid in videos:
            if not vid.get("platform_video_id"):
                continue
            vid_views = vid.get("views", 0)
            earnings = round((vid_views / 1000) * primary_rpm, 4) if primary_rpm else 0
            doc = {
                "video_id": f"vid_{uuid.uuid4().hex[:12]}",
                "platform_video_id": vid["platform_video_id"],
                "account_id": account_id,
                "user_id": user_id,
                "campaign_id": primary_campaign_id,
                "platform": platform,
                "url": vid.get("url", ""),
                "title": vid.get("title"),
                "thumbnail_url": vid.get("thumbnail_url"),
                "views": vid_views,
                "likes": vid.get("likes", 0),
                "comments": vid.get("comments", 0),
                "published_at": vid.get("published_at"),
                "fetched_at": now_iso,
                "earnings": earnings,
            }
            try:
                await db.tracked_videos.update_one(
                    {"account_id": account_id, "platform_video_id": vid["platform_video_id"]},
                    {"$set": doc, "$setOnInsert": {"created_at": now_iso}},
                    upsert=True
                )
                saved += 1
            except Exception:
                pass

        partial_note = ""
        if platform == "tiktok" and saved < 10:
            partial_note = (
                f" (résultats partiels — {saved} vidéo(s) via TikWm). "
                "Pour toutes vos vidéos : utilisez 'Ajouter vidéo' manuellement "
                "ou configurez TIKWM_API_KEY dans Railway."
            )

        await db.social_accounts.update_one(
            {"account_id": account_id},
            {"$set": {
                "scrape_status": "done",
                "scrape_status_message": f"{saved} vidéo(s) importée(s){partial_note}",
                "last_tracked_at": now_iso,
            }}
        )
        logger.info(f"Background scrape done: {saved} videos saved for {platform}/@{username}")

    except Exception as e:
        logger.error(f"Background scrape fatal error for {account_id}: {e}")
        try:
            await db.social_accounts.update_one(
                {"account_id": account_id},
                {"$set": {"scrape_status": "error", "scrape_status_message": str(e)}}
            )
        except Exception:
            pass


@api_router.post("/social-accounts/{account_id}/scrape-now")
async def scrape_account_now(account_id: str, user: dict = Depends(get_current_user)):
    """Launch background scraping for a verified social account. Returns immediately."""
    account = await db.social_accounts.find_one(
        {"account_id": account_id, "user_id": user["user_id"], "status": "verified"}, {"_id": 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail="Compte introuvable ou non vérifié")

    # Mark as running immediately so frontend can poll
    await db.social_accounts.update_one(
        {"account_id": account_id},
        {"$set": {"scrape_status": "running", "scrape_status_message": "Scraping en cours…"}}
    )

    # Launch background task — returns immediately, no timeout on the HTTP request
    asyncio.create_task(_background_scrape_account(account_id, user["user_id"]))

    return {
        "status": "started",
        "message": "Scraping lancé en arrière-plan. Les vidéos apparaîtront dans quelques secondes.",
    }


@api_router.get("/social-accounts/{account_id}/scrape-status")
async def get_scrape_status(account_id: str, user: dict = Depends(get_current_user)):
    """Poll the status of a background scrape job."""
    account = await db.social_accounts.find_one(
        {"account_id": account_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail="Compte introuvable")

    video_count = await db.tracked_videos.count_documents({"account_id": account_id})
    return {
        "scrape_status": account.get("scrape_status", "idle"),
        "scrape_status_message": account.get("scrape_status_message", ""),
        "last_tracked_at": account.get("last_tracked_at"),
        "video_count": video_count,
    }

@api_router.get("/social-accounts/{account_id}/videos")
async def get_account_videos(account_id: str, user: dict = Depends(get_current_user)):
    """Get tracked videos for a social account"""
    account = await db.social_accounts.find_one({"account_id": account_id, "user_id": user["user_id"]}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    videos = await db.tracked_videos.find({"account_id": account_id}, {"_id": 0}).sort("published_at", -1).to_list(100)
    return {"videos": videos}

@api_router.post("/social-accounts/{account_id}/add-video")
async def add_video_manually(account_id: str, request: Request, user: dict = Depends(get_current_user)):
    """
    Clipper manually adds a video URL (TikTok, YouTube, or Instagram).
    Fetches real stats and saves to tracked_videos for all campaigns where this account is assigned.
    """
    body = await request.json()
    video_url = (body.get("video_url") or "").strip()
    if not video_url:
        raise HTTPException(status_code=400, detail="URL de vidéo manquante")

    account = await db.social_accounts.find_one(
        {"account_id": account_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail="Compte introuvable")

    platform = account.get("platform", "")
    url_lower = video_url.lower()

    # Validate that URL matches the account platform
    url_valid = (
        (platform == "tiktok" and "tiktok.com" in url_lower) or
        (platform == "youtube" and ("youtube.com" in url_lower or "youtu.be" in url_lower)) or
        (platform == "instagram" and "instagram.com" in url_lower)
    )
    if not url_valid:
        examples = {
            "tiktok": "https://www.tiktok.com/@user/video/123",
            "youtube": "https://www.youtube.com/watch?v=XXXXX ou https://youtu.be/XXXXX",
            "instagram": "https://www.instagram.com/reel/XXXXX/",
        }
        raise HTTPException(
            status_code=400,
            detail=f"URL {platform} invalide. Exemple : {examples.get(platform, 'URL valide')}"
        )

    # Fetch stats based on platform — always succeeds (fallback to 0 views if API fails)
    stats_partial = False
    try:
        if platform == "tiktok":
            try:
                vid_data = await asyncio.wait_for(
                    _fetch_tiktok_single_video_tikwm(video_url), timeout=15
                )
            except Exception:
                vid_data = None
            if vid_data:
                # Validate video belongs to this account if we could identify the author
                vid_author = (vid_data.get("_author_username") or "").lower()
                account_username = account.get("username", "").lower().lstrip("@")
                if vid_author and account_username and vid_author != account_username:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cette vidéo appartient à @{vid_author}, pas à @{account_username}. Ajoutez uniquement vos propres vidéos."
                    )
            else:
                # TikWm failed — extract video ID from URL and save with 0 views
                m = re.search(r'/video/(\d+)', video_url)
                video_id = m.group(1) if m else f"tk_{uuid.uuid4().hex[:8]}"
                vid_data = {
                    "platform_video_id": video_id,
                    "url": video_url,
                    "title": None,
                    "thumbnail_url": None,
                    "views": 0, "likes": 0, "comments": 0, "published_at": None,
                }
                stats_partial = True
        elif platform == "youtube":
            try:
                vid_data = await asyncio.wait_for(
                    _fetch_single_youtube_video(video_url), timeout=15
                )
            except Exception:
                m = re.search(r'(?:v=|vi=|youtu\.be/|/shorts/|/embed/|/v/|/live/)([a-zA-Z0-9_-]{11})', video_url)
                video_id = m.group(1) if m else f"yt_{uuid.uuid4().hex[:8]}"
                vid_data = {
                    "platform_video_id": video_id,
                    "url": video_url,
                    "title": None,
                    "thumbnail_url": f"https://img.youtube.com/vi/{video_id}/mqdefault.jpg" if m else None,
                    "views": 0, "likes": 0, "comments": 0, "published_at": None,
                }
                stats_partial = True
        elif platform == "instagram":
            try:
                vid_data = await asyncio.wait_for(
                    _fetch_single_instagram_video(video_url), timeout=10
                )
            except Exception:
                m = re.search(r'/(?:p|reel|reels)/([A-Za-z0-9_-]+)', video_url)
                video_id = m.group(1) if m else f"ig_{uuid.uuid4().hex[:8]}"
                vid_data = {
                    "platform_video_id": video_id,
                    "url": video_url,
                    "title": None,
                    "thumbnail_url": None,
                    "views": 0, "likes": 0, "comments": 0, "published_at": None,
                }
                stats_partial = True
        else:
            raise HTTPException(status_code=400, detail=f"Plateforme non supportée : {platform}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Find all campaigns where this account is assigned
    assignments = await db.campaign_social_accounts.find(
        {"account_id": account_id}, {"_id": 0}
    ).to_list(100)

    now_iso = datetime.now(timezone.utc).isoformat()
    saved_count = 0
    for assignment in assignments:
        campaign_id = assignment["campaign_id"]
        campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
        rpm = (campaign or {}).get("rpm", 0)
        earnings = (vid_data["views"] / 1000) * rpm

        set_fields = {
            "platform_video_id": vid_data["platform_video_id"],
            "account_id": account_id,
            "user_id": user["user_id"],
            "campaign_id": campaign_id,
            "platform": platform,
            "url": vid_data["url"],
            "title": vid_data.get("title"),
            "thumbnail_url": vid_data.get("thumbnail_url"),
            "views": vid_data["views"],
            "likes": vid_data.get("likes", 0),
            "comments": vid_data.get("comments", 0),
            "published_at": vid_data.get("published_at"),
            "fetched_at": now_iso,
            "earnings": round(earnings, 4),
            "manually_added": True,
            "simulated": False,
        }
        try:
            await db.tracked_videos.update_one(
                {"account_id": account_id, "platform_video_id": vid_data["platform_video_id"]},
                {"$set": set_fields,
                 "$setOnInsert": {"video_id": f"vid_{uuid.uuid4().hex[:12]}", "created_at": now_iso}},
                upsert=True,
            )
            saved_count += 1
        except Exception as e:
            logger.warning(f"Failed to upsert manually added video {vid_data['platform_video_id']}: {e}")

    if saved_count == 0:
        # No campaign assigned — save linked to account only
        fallback_fields = {
            "platform_video_id": vid_data["platform_video_id"],
            "account_id": account_id,
            "user_id": user["user_id"],
            "campaign_id": None,
            "platform": platform,
            "url": vid_data["url"],
            "title": vid_data.get("title"),
            "thumbnail_url": vid_data.get("thumbnail_url"),
            "views": vid_data["views"],
            "likes": vid_data.get("likes", 0),
            "comments": vid_data.get("comments", 0),
            "published_at": vid_data.get("published_at"),
            "fetched_at": now_iso,
            "earnings": 0,
            "manually_added": True,
            "simulated": False,
        }
        await db.tracked_videos.update_one(
            {"account_id": account_id, "platform_video_id": vid_data["platform_video_id"]},
            {"$set": fallback_fields,
             "$setOnInsert": {"video_id": f"vid_{uuid.uuid4().hex[:12]}", "created_at": now_iso}},
            upsert=True,
        )

    if vid_data["views"] > 0:
        views_str = f"{vid_data['views']:,}"
        msg = f"Vidéo ajoutée ✓ ({views_str} vues)"
    elif stats_partial:
        msg = "Vidéo ajoutée ✓ — stats non disponibles pour l'instant (seront mises à jour au prochain tracking)"
    else:
        msg = "Vidéo ajoutée ✓ (0 vues — mise à jour au prochain tracking)"
    return {
        "message": msg,
        "video": {
            "url": vid_data["url"],
            "title": vid_data.get("title"),
            "views": vid_data["views"],
            "likes": vid_data.get("likes", 0),
            "thumbnail_url": vid_data.get("thumbnail_url"),
        }
    }


@api_router.get("/campaigns/{campaign_id}/period-stats")
async def get_campaign_period_stats(
    campaign_id: str,
    period: str = "30d",
    offset: int = 0,
    user: dict = Depends(get_current_user)
):
    """Aggregate views + earnings + clicks for a campaign over a time window.

    period : "24h" | "7d" | "30d" | "year" | "all"
    offset : 0 = current period, 1 = previous period of same length, etc.
    Returns: views/earnings/clicks for the window, plus period bounds for UI.
    """
    from datetime import timedelta

    PERIOD_DAYS = {"24h": 1, "7d": 7, "30d": 30, "year": 365}
    if period not in PERIOD_DAYS and period != "all":
        raise HTTPException(status_code=400, detail="period invalide (24h|7d|30d|year|all)")

    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")

    end = datetime.now(timezone.utc)
    if period == "all":
        start = datetime(2020, 1, 1, tzinfo=timezone.utc)
        period_label = "Depuis toujours"
    else:
        days = PERIOD_DAYS[period]
        # offset shifts window backwards (offset=1 = previous period)
        end = end - timedelta(days=days * offset)
        start = end - timedelta(days=days)
        period_label = {"24h": "24 dernières heures", "7d": "7 derniers jours",
                        "30d": "30 derniers jours", "year": "Cette année"}[period]

    start_str = start.strftime("%Y-%m-%d")
    end_str = end.strftime("%Y-%m-%d")

    # ── Views aggregation via snapshots (delta = total_end - total_start) ──
    views_in_period = 0
    if period == "all":
        # All-time = current total
        latest = await db.views_snapshots.find_one(
            {"campaign_id": campaign_id},
            {"_id": 0, "total_views": 1},
            sort=[("date", -1)]
        )
        views_in_period = latest["total_views"] if latest else 0
    else:
        # Snapshot at end of window
        end_snap = await db.views_snapshots.find_one(
            {"campaign_id": campaign_id, "date": {"$lte": end_str}},
            {"_id": 0, "total_views": 1},
            sort=[("date", -1)]
        )
        # Snapshot just before window start (anchor)
        start_snap = await db.views_snapshots.find_one(
            {"campaign_id": campaign_id, "date": {"$lt": start_str}},
            {"_id": 0, "total_views": 1},
            sort=[("date", -1)]
        )
        end_total = end_snap["total_views"] if end_snap else 0
        start_total = start_snap["total_views"] if start_snap else 0
        views_in_period = max(0, end_total - start_total)

    # ── Earnings (depends on payment model) ──
    payment_model = campaign.get("payment_model", "views")
    rpm = campaign.get("rpm", 0) or 0
    rate_per_click = campaign.get("rate_per_click", 0) or 0

    earnings_in_period = 0.0
    clicks_in_period = 0
    unique_clicks_in_period = 0

    if payment_model == "views":
        earnings_in_period = round((views_in_period / 1000) * rpm, 2)
    elif payment_model == "clicks":
        # Aggregate clicks from click_events in the window
        click_match = {
            "campaign_id": campaign_id,
            "clicked_at": {"$gte": start.isoformat(), "$lte": end.isoformat()},
        }
        clicks_in_period = await db.click_events.count_documents(click_match)
        unique_clicks_in_period = await db.click_events.count_documents({**click_match, "is_unique": True})
        billing_mode = campaign.get("click_billing_mode", "all")
        billable = unique_clicks_in_period if billing_mode != "all" else clicks_in_period
        earnings_in_period = round((billable / 1000) * rate_per_click, 2)

    return {
        "period": period,
        "period_label": period_label,
        "offset": offset,
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "views": views_in_period,
        "earnings": earnings_in_period,
        "clicks": clicks_in_period,
        "unique_clicks": unique_clicks_in_period,
        "payment_model": payment_model,
        "rpm": rpm,
        "rate_per_click": rate_per_click,
        "budget_unlimited": campaign.get("budget_unlimited", False),
    }


@api_router.get("/campaigns/{campaign_id}/my-period-stats")
async def get_my_period_stats(
    campaign_id: str,
    period: str = "30d",
    offset: int = 0,
    user: dict = Depends(get_current_user)
):
    """Per-clipper aggregate views + earnings + clicks over a time window.
    Same shape as /period-stats but filtered to the current authenticated user.
    """
    from datetime import timedelta

    PERIOD_DAYS = {"24h": 1, "7d": 7, "30d": 30, "year": 365}
    if period not in PERIOD_DAYS and period != "all":
        raise HTTPException(status_code=400, detail="period invalide (24h|7d|30d|year|all)")

    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")

    user_id = user["user_id"]
    end = datetime.now(timezone.utc)
    if period == "all":
        start = datetime(2020, 1, 1, tzinfo=timezone.utc)
        period_label = "Depuis toujours"
    else:
        days = PERIOD_DAYS[period]
        end = end - timedelta(days=days * offset)
        start = end - timedelta(days=days)
        period_label = {"24h": "24 dernières heures", "7d": "7 derniers jours",
                        "30d": "30 derniers jours", "year": "Cette année"}[period]

    start_str = start.strftime("%Y-%m-%d")
    end_str = end.strftime("%Y-%m-%d")

    # ── Views via user_views_snapshots (delta) ──
    views_in_period = 0
    if period == "all":
        latest = await db.user_views_snapshots.find_one(
            {"campaign_id": campaign_id, "user_id": user_id},
            {"_id": 0, "total_views": 1},
            sort=[("date", -1)]
        )
        views_in_period = latest["total_views"] if latest else 0
    else:
        end_snap = await db.user_views_snapshots.find_one(
            {"campaign_id": campaign_id, "user_id": user_id, "date": {"$lte": end_str}},
            {"_id": 0, "total_views": 1},
            sort=[("date", -1)]
        )
        start_snap = await db.user_views_snapshots.find_one(
            {"campaign_id": campaign_id, "user_id": user_id, "date": {"$lt": start_str}},
            {"_id": 0, "total_views": 1},
            sort=[("date", -1)]
        )
        end_total = end_snap["total_views"] if end_snap else 0
        start_total = start_snap["total_views"] if start_snap else 0
        views_in_period = max(0, end_total - start_total)

    payment_model = campaign.get("payment_model", "views")
    rpm = campaign.get("rpm", 0) or 0
    rate_per_click = campaign.get("rate_per_click", 0) or 0

    earnings_in_period = 0.0
    clicks_in_period = 0
    unique_clicks_in_period = 0

    if payment_model == "views":
        earnings_in_period = round((views_in_period / 1000) * rpm, 2)
    elif payment_model == "clicks":
        # Aggregate this clipper's clicks via their click_links
        my_links = await db.click_links.find(
            {"campaign_id": campaign_id, "clipper_id": user_id},
            {"_id": 0, "link_id": 1}
        ).to_list(50)
        link_ids = [l["link_id"] for l in my_links]
        if link_ids:
            click_match = {
                "link_id": {"$in": link_ids},
                "clicked_at": {"$gte": start.isoformat(), "$lte": end.isoformat()},
            }
            clicks_in_period = await db.click_events.count_documents(click_match)
            unique_clicks_in_period = await db.click_events.count_documents({**click_match, "is_unique": True})
        billing_mode = campaign.get("click_billing_mode", "all")
        billable = unique_clicks_in_period if billing_mode != "all" else clicks_in_period
        earnings_in_period = round((billable / 1000) * rate_per_click, 2)

    return {
        "period": period,
        "period_label": period_label,
        "offset": offset,
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "views": views_in_period,
        "earnings": earnings_in_period,
        "clicks": clicks_in_period,
        "unique_clicks": unique_clicks_in_period,
        "payment_model": payment_model,
        "rpm": rpm,
        "rate_per_click": rate_per_click,
        "budget_unlimited": campaign.get("budget_unlimited", False),
    }


@api_router.get("/campaigns/{campaign_id}/views-chart")
async def get_campaign_views_chart(campaign_id: str, days: int = 30, user: dict = Depends(get_current_user)):
    """
    Daily NEW views for a campaign chart (delta, not cumulative).
    views_snapshots stores cumulative totals → we compute day-to-day differences.
    """
    from datetime import timedelta
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    start_str = start.strftime("%Y-%m-%d")

    # Fetch snapshots from window. Also fetch the snapshot just before the window
    # to correctly compute the delta for the first day.
    snapshots = await db.views_snapshots.find(
        {"campaign_id": campaign_id, "date": {"$gte": start_str}},
        {"_id": 0, "date": 1, "total_views": 1}
    ).sort("date", 1).to_list(days + 2)

    if snapshots:
        # Anchor: total_views the day before the window (so delta on day 1 is correct)
        prev_snap = await db.views_snapshots.find_one(
            {"campaign_id": campaign_id, "date": {"$lt": start_str}},
            {"_id": 0, "total_views": 1},
            sort=[("date", -1)]
        )
        prev_total = prev_snap["total_views"] if prev_snap else 0

        snap_by_date = {s["date"]: s["total_views"] for s in snapshots}

        # Compute daily delta: new views = total_today - total_prev_day
        sorted_dates = sorted(snap_by_date.keys())
        delta_by_day: dict = {}
        running_prev = prev_total
        for d in sorted_dates:
            cum = snap_by_date[d]
            delta_by_day[d] = max(0, cum - running_prev)
            running_prev = cum

        timeline = []
        current = start
        while current <= end:
            day = current.strftime("%Y-%m-%d")
            timeline.append({"date": day, "views": delta_by_day.get(day, 0)})
            current += timedelta(days=1)
        return {"timeline": timeline, "source": "snapshots"}

    # Fallback (no snapshots yet): return zeros — chart will be empty until first tracking run
    timeline = []
    current = start
    while current <= end:
        timeline.append({"date": current.strftime("%Y-%m-%d"), "views": 0})
        current += timedelta(days=1)
    return {"timeline": timeline, "source": "no_data"}

@api_router.get("/campaigns/{campaign_id}/my-views-chart")
async def get_my_views_chart(campaign_id: str, days: int = 30, user: dict = Depends(get_current_user)):
    """
    Personal daily NEW views chart for the current clipper on a given campaign.
    Computes deltas from user_views_snapshots (same logic as campaign chart).
    """
    from datetime import timedelta
    uid = user["user_id"]
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    start_str = start.strftime("%Y-%m-%d")

    snapshots = await db.user_views_snapshots.find(
        {"campaign_id": campaign_id, "user_id": uid, "date": {"$gte": start_str}},
        {"_id": 0, "date": 1, "total_views": 1}
    ).sort("date", 1).to_list(days + 2)

    if snapshots:
        prev_snap = await db.user_views_snapshots.find_one(
            {"campaign_id": campaign_id, "user_id": uid, "date": {"$lt": start_str}},
            {"_id": 0, "total_views": 1},
            sort=[("date", -1)]
        )
        prev_total = prev_snap["total_views"] if prev_snap else 0
        snap_by_date = {s["date"]: s["total_views"] for s in snapshots}
        delta_by_day: dict = {}
        running = prev_total
        for d in sorted(snap_by_date.keys()):
            cum = snap_by_date[d]
            delta_by_day[d] = max(0, cum - running)
            running = cum
        timeline = []
        current = start
        while current <= end:
            day = current.strftime("%Y-%m-%d")
            timeline.append({"date": day, "views": delta_by_day.get(day, 0)})
            current += timedelta(days=1)
        return {"timeline": timeline}

    # No snapshots yet — return zeros
    timeline = []
    current = start
    while current <= end:
        timeline.append({"date": current.strftime("%Y-%m-%d"), "views": 0})
        current += timedelta(days=1)
    return {"timeline": timeline}

@api_router.get("/campaigns/{campaign_id}/my-videos")
async def get_my_campaign_videos(campaign_id: str, user: dict = Depends(get_current_user)):
    """Clipper's own tracked videos for a specific campaign, sorted by views desc."""
    videos = await db.tracked_videos.find(
        {"campaign_id": campaign_id, "user_id": user["user_id"]},
        {"_id": 0}
    ).sort("views", -1).to_list(200)
    return {"videos": videos}

@api_router.get("/campaigns/{campaign_id}/top-clips")
async def get_campaign_top_clips(
    campaign_id: str,
    limit: int = 10,
    period: str = "all",   # "24h" | "7d" | "30d" | "all"
    user: dict = Depends(get_current_user)
):
    """Top N videos by views for this campaign — visible to all roles.
    period: filtre les vidéos par date de publication (depuis quand publiées)."""
    from datetime import timedelta
    PERIOD_DAYS = {"24h": 1, "7d": 7, "30d": 30}
    query: dict = {"campaign_id": campaign_id, "views": {"$gt": 0}}
    if period in PERIOD_DAYS:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=PERIOD_DAYS[period])).isoformat()
        query["published_at"] = {"$gte": cutoff}
    raw = await db.tracked_videos.find(
        query,
        {"_id": 0}
    ).sort("views", -1).to_list(limit)

    # Enrich with clipper info
    user_ids = list({v.get("user_id") for v in raw if v.get("user_id")})
    users_map: dict = {}
    if user_ids:
        clipper_docs = await db.users.find(
            {"user_id": {"$in": user_ids}},
            {"_id": 0, "user_id": 1, "display_name": 1, "name": 1, "picture": 1}
        ).to_list(len(user_ids))
        users_map = {u["user_id"]: u for u in clipper_docs}

    clips = []
    for i, vid in enumerate(raw):
        uid = vid.get("user_id")
        clipper = users_map.get(uid, {})
        clips.append({
            "rank": i + 1,
            "video_id": vid.get("video_id"),
            "url": vid.get("url"),
            "platform": vid.get("platform"),
            "title": vid.get("title"),
            "thumbnail_url": vid.get("thumbnail_url"),
            "views": vid.get("views", 0),
            "likes": vid.get("likes", 0),
            "comments": vid.get("comments", 0),
            "published_at": vid.get("published_at"),
            "earnings": vid.get("earnings", 0),
            "clipper_name": clipper.get("display_name") or clipper.get("name") or "Clippeur",
            "clipper_picture": clipper.get("picture"),
            "user_id": uid,
        })
    return {"clips": clips}

@api_router.get("/campaigns/{campaign_id}/tracked-videos")
async def get_campaign_tracked_videos(campaign_id: str, user: dict = Depends(get_current_user)):
    """All tracked videos for a campaign (agency view)"""
    videos = await db.tracked_videos.find({"campaign_id": campaign_id}, {"_id": 0}).sort("published_at", -1).to_list(500)
    return {"videos": videos}

@api_router.post("/campaigns/{campaign_id}/refresh-tracking")
async def force_campaign_tracking(campaign_id: str, user: dict = Depends(get_current_user)):
    """Force immediate tracking for a campaign"""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager only")
    asyncio.create_task(run_video_tracking())
    return {"message": "Tracking lancé en arrière-plan"}

@api_router.post("/campaigns/{campaign_id}/import-link")
@api_router.post("/campaigns/{campaign_id}/add-video")
@api_router.post("/campaigns/{campaign_id}/track-video")
async def track_video_by_url(campaign_id: str, body: dict, user: dict = Depends(get_current_user)):
    """
    Agency adds a video URL to track automatically.
    - Auto-fetches current stats from the platform
    - Stored as manually_added=True (bypasses joined_at filter)
    - target: specific user_id | "all" (all active clippers) | "" (no clipper)
    """
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager uniquement")

    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")

    url = (body.get("url") or "").strip()
    platform = (body.get("platform") or "").lower().strip()
    target = (body.get("target") or "").strip()  # user_id | "all" | ""

    if not url:
        raise HTTPException(status_code=400, detail="URL requise")
    if platform not in ("tiktok", "youtube", "instagram"):
        raise HTTPException(status_code=400, detail="Plateforme invalide")
    # Vérifie que la plateforme est autorisée par la campagne
    allowed_platforms = campaign.get("platforms") or []
    if allowed_platforms and platform not in allowed_platforms:
        platforms_label = ", ".join(allowed_platforms) or "aucune"
        raise HTTPException(
            status_code=400,
            detail=f"Cette campagne n'accepte que : {platforms_label}. "
                   f"Modifie les plateformes dans l'onglet ⚙️ Paramètres pour ajouter {platform}."
        )

    # Fetch video stats — each platform function is self-contained with its own timeout and never raises
    try:
        vid_info = await fetch_single_video_by_url(url, platform)
    except Exception as e:
        logger.warning(f"track-video: could not fetch stats for {url} ({platform}): {type(e).__name__}: {e}")
        vid_id = None
        if platform == "tiktok":
            m = re.search(r'/video/(\d+)', url)
            vid_id = m.group(1) if m else None
        elif platform == "youtube":
            m = re.search(r'(?:v=|vi=|youtu\.be/|/shorts/|/embed/|/v/|/live/)([a-zA-Z0-9_-]{11})', url)
            vid_id = m.group(1) if m else None
        elif platform == "instagram":
            m = re.search(r'/(?:p|reel|reels)/([A-Za-z0-9_-]+)', url)
            vid_id = m.group(1) if m else None
        vid_info = {
            "platform_video_id": vid_id or f"{platform[:2]}_{uuid.uuid4().hex[:8]}",
            "url": url, "title": None, "thumbnail_url": None,
            "views": 0, "likes": 0, "comments": 0, "published_at": None,
        }

    rpm = campaign.get("rpm", 0)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Determine target users
    if target == "all":
        members = await db.campaign_members.find(
            {"campaign_id": campaign_id, "status": "active", "role": "clipper"},
            {"_id": 0, "user_id": 1}
        ).to_list(100)
        target_users = [m["user_id"] for m in members]
        if not target_users:
            raise HTTPException(status_code=400, detail="Aucun clippeur actif dans cette campagne")
    elif target:
        # Verify clipper is in campaign
        member = await db.campaign_members.find_one(
            {"campaign_id": campaign_id, "user_id": target, "role": "clipper"}
        )
        if not member:
            raise HTTPException(status_code=400, detail="Ce clippeur ne fait pas partie de cette campagne")
        target_users = [target]
    else:
        target_users = [None]  # No clipper association

    saved = []
    for uid in target_users:
        earnings = round((vid_info["views"] / 1000) * rpm, 2) if uid else 0
        video_id = f"vid_{uuid.uuid4().hex[:12]}"
        # Fields updated every time (on insert OR update)
        set_fields = {
            "platform_video_id": vid_info["platform_video_id"],
            "account_id": None,
            "user_id": uid,
            "campaign_id": campaign_id,
            "platform": platform,
            "url": url,
            "title": vid_info.get("title"),
            "thumbnail_url": vid_info.get("thumbnail_url"),
            "views": vid_info["views"],
            "likes": vid_info.get("likes", 0),
            "comments": vid_info.get("comments", 0),
            "published_at": vid_info.get("published_at"),
            "fetched_at": now_iso,
            "earnings": earnings,
            "manually_added": True,
            "added_by": user["user_id"],
        }
        # Fields only set on first insert (video_id + created_at must NOT be in $set to avoid conflict)
        insert_only = {"video_id": video_id, "created_at": now_iso}
        upsert_key = {"campaign_id": campaign_id, "platform_video_id": vid_info["platform_video_id"]}
        if uid:
            upsert_key["user_id"] = uid
        try:
            await db.tracked_videos.update_one(
                upsert_key,
                {"$set": set_fields, "$setOnInsert": insert_only},
                upsert=True
            )
            saved.append({**set_fields, **insert_only})
        except Exception as e:
            err_str = str(e)
            if "duplicate key" in err_str.lower() or "E11000" in err_str:
                # Unique index conflict — just update the existing doc
                try:
                    await db.tracked_videos.update_one(upsert_key, {"$set": set_fields})
                    saved.append({**set_fields, **insert_only})
                except Exception as e2:
                    logger.warning(f"track_video fallback update error: {e2}")
            else:
                logger.warning(f"track_video upsert error: {e}")
                raise HTTPException(status_code=500, detail=f"Erreur d'enregistrement en base: {e}")

    views = vid_info["views"]
    if views > 0:
        msg = f"Vidéo trackée avec succès — {views:,} vues"
    elif platform == "youtube" and not YOUTUBE_API_KEY:
        msg = "Vidéo YouTube enregistrée (stats indisponibles — clé YOUTUBE_API_KEY manquante)"
    elif platform == "instagram":
        msg = "Vidéo Instagram enregistrée (vues non disponibles sans API privée)"
    else:
        msg = "Vidéo enregistrée — stats en cours de récupération"

    return {
        "message": msg,
        "video": {
            "url": url,
            "title": vid_info.get("title"),
            "views": views,
            "platform": platform,
            "target_count": len([u for u in target_users if u]),
        }
    }

@api_router.post("/campaigns/{campaign_id}/manual-video")
async def add_manual_video(campaign_id: str, body: dict, user: dict = Depends(get_current_user)):
    """
    Agency adds a video manually for a clipper.
    Used for videos posted outside the campaign (exception/dérogation).
    These videos bypass the joined_at date filter and are always counted.
    """
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager uniquement")

    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    if campaign.get("agency_id") != user["user_id"] and campaign.get("manager_id") != user["user_id"]:
        # Allow if user is a manager of this campaign
        member = await db.campaign_members.find_one({"campaign_id": campaign_id, "user_id": user["user_id"], "role": "manager"})
        if not member:
            raise HTTPException(status_code=403, detail="Non autorisé")

    clipper_id = body.get("user_id", "").strip()
    url = body.get("url", "").strip()
    try:
        views = max(0, int(body.get("views", 0)))
    except (TypeError, ValueError):
        views = 0
    platform = (body.get("platform") or "tiktok").lower()
    title = (body.get("title") or "Vidéo ajoutée manuellement").strip()

    if not clipper_id or not url:
        raise HTTPException(status_code=400, detail="user_id et url sont requis")

    # Verify clipper is in this campaign
    member = await db.campaign_members.find_one({"campaign_id": campaign_id, "user_id": clipper_id, "role": "clipper"})
    if not member:
        raise HTTPException(status_code=400, detail="Ce clippeur ne fait pas partie de cette campagne")

    rpm = campaign.get("rpm", 0)
    video_id = f"vid_{uuid.uuid4().hex[:12]}"
    video = {
        "video_id": video_id,
        "platform_video_id": f"manual_{video_id}",
        "campaign_id": campaign_id,
        "user_id": clipper_id,
        "account_id": None,
        "platform": platform,
        "url": url,
        "title": title,
        "views": views,
        "likes": 0,
        "comments": 0,
        "manually_added": True,
        "added_by": user["user_id"],
        "published_at": None,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "earnings": round((views / 1000) * rpm, 2),
    }
    await db.tracked_videos.insert_one(video)
    video.pop("_id", None)

    # Notify clipper
    clipper = await db.users.find_one({"user_id": clipper_id}, {"_id": 0, "display_name": 1, "name": 1})
    clipper_name = (clipper or {}).get("display_name") or (clipper or {}).get("name", "")
    await notify_user(clipper_id, {
        "type": "manual_video_added",
        "message": f"L'agence a ajouté une vidéo à votre compte dans la campagne « {campaign.get('name', '')} ».",
        "campaign_id": campaign_id,
        "video_id": video_id,
    })

    return {"video": video, "earnings": video["earnings"]}

@api_router.delete("/campaigns/{campaign_id}/manual-video/{video_id}")
async def delete_manual_video(campaign_id: str, video_id: str, user: dict = Depends(get_current_user)):
    """Agency removes a manually added video."""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager uniquement")
    result = await db.tracked_videos.delete_one({
        "video_id": video_id,
        "campaign_id": campaign_id,
        "manually_added": True,
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vidéo introuvable ou non supprimable")
    return {"message": "Vidéo supprimée"}

# ================= MESSAGES & CHAT =================

@api_router.get("/campaigns/{campaign_id}/messages")
async def get_messages(campaign_id: str, user: dict = Depends(get_current_user)):
    messages = await db.messages.find(
        {"campaign_id": campaign_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    result = list(reversed(messages))
    # Ensure all messages expose a reactions dict
    for m in result:
        if "reactions" not in m:
            m["reactions"] = {}
    return {"messages": result}

@api_router.get("/messages/unread-counts")
async def get_unread_counts(user: dict = Depends(get_current_user)):
    """Retourne le nombre de messages non lus par campagne — 2 requêtes DB (batch)."""
    uid = user["user_id"]

    # 1 query: all memberships
    memberships = await db.campaign_members.find(
        {"user_id": uid}, {"_id": 0, "campaign_id": 1}
    ).to_list(200)
    campaign_ids = list(set(m["campaign_id"] for m in memberships))

    # For agencies add their own campaigns (1 query)
    if user.get("role") == "agency":
        own = await db.campaigns.find({"agency_id": uid}, {"_id": 0, "campaign_id": 1}).to_list(200)
        campaign_ids = list(set(campaign_ids + [c["campaign_id"] for c in own]))

    if not campaign_ids:
        support_unread = await db.support_messages.count_documents(
            {"user_id": uid, "from_admin": True, "read_by_user": False}
        )
        return {"unread": {}, "support_unread": support_unread}

    # 1 query: all last_seen timestamps for this user
    seen_docs = await db.message_reads.find(
        {"user_id": uid, "campaign_id": {"$in": campaign_ids}},
        {"_id": 0, "campaign_id": 1, "last_seen_at": 1}
    ).to_list(500)
    seen_map = {d["campaign_id"]: d.get("last_seen_at") for d in seen_docs}

    # 1 aggregation: count unread per campaign
    pipeline = [
        {"$match": {
            "campaign_id": {"$in": campaign_ids},
            "sender_id": {"$ne": uid},
        }},
        {"$group": {
            "_id": "$campaign_id",
            "latest": {"$max": "$created_at"},
            "count": {"$sum": 1},
            "msgs": {"$push": {"created_at": "$created_at"}}
        }},
    ]
    raw = await db.messages.aggregate(pipeline).to_list(500)

    counts = {}
    for row in raw:
        cid = row["_id"]
        last_seen = seen_map.get(cid)
        if last_seen:
            unread = sum(1 for m in row["msgs"] if m["created_at"] > last_seen)
        else:
            unread = row["count"]
        if unread > 0:
            counts[cid] = unread

    support_unread = await db.support_messages.count_documents(
        {"user_id": uid, "from_admin": True, "read_by_user": False}
    )
    return {"unread": counts, "support_unread": support_unread}

@api_router.post("/campaigns/{campaign_id}/mark-read")
async def mark_campaign_read(campaign_id: str, user: dict = Depends(get_current_user)):
    """Marque tous les messages d'une campagne comme lus pour cet utilisateur."""
    uid = user["user_id"]
    now = datetime.now(timezone.utc).isoformat()
    await db.message_reads.update_one(
        {"user_id": uid, "campaign_id": campaign_id},
        {"$set": {"last_seen_at": now, "user_id": uid, "campaign_id": campaign_id}},
        upsert=True
    )
    return {"ok": True}

@api_router.post("/messages")
async def send_message(message_data: MessageCreate, user: dict = Depends(get_current_user)):
    # Bloquer les clippers en attente de validation
    if user.get("role") == "clipper" and message_data.campaign_id:
        member = await db.campaign_members.find_one({
            "campaign_id": message_data.campaign_id,
            "user_id": user["user_id"],
            "role": "clipper",
        })
        if member and member.get("status") == "pending":
            raise HTTPException(status_code=403, detail="Ta candidature est en attente de validation. Tu pourras écrire dans le chat une fois accepté.")

    message = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "campaign_id": message_data.campaign_id,
        "sender_id": user["user_id"],
        "sender_name": user.get("display_name") or user.get("name"),
        "sender_role": user.get("role"),
        "recipient_id": message_data.recipient_id,
        "content": message_data.content,
        "message_type": message_data.message_type,
        "image_data": message_data.image_data,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.messages.insert_one(message)
    message.pop("_id", None)
    
    await manager.broadcast_to_campaign(message_data.campaign_id, {
        "type": "new_message",
        "message": message
    })
    
    return message

@api_router.post("/messages/{message_id}/react")
async def react_to_message(message_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Toggle an emoji reaction on a message. All roles can react (including clippers on announcements)."""
    ALLOWED_EMOJIS = ["❤️", "🔥", "😂", "👍", "👎", "😮", "🎉"]
    emoji = (body.get("emoji") or "").strip()
    if not emoji or emoji not in ALLOWED_EMOJIS:
        raise HTTPException(status_code=400, detail="Emoji non autorisé")

    msg = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message introuvable")

    reactions = dict(msg.get("reactions") or {})
    user_id = user["user_id"]

    current_users = list(reactions.get(emoji, []))
    if user_id in current_users:
        current_users.remove(user_id)
    else:
        current_users.append(user_id)

    if current_users:
        reactions[emoji] = current_users
    else:
        reactions.pop(emoji, None)

    await db.messages.update_one({"message_id": message_id}, {"$set": {"reactions": reactions}})

    # Broadcast to campaign so all connected users see the update in real-time
    try:
        await manager.broadcast_to_campaign(msg["campaign_id"], {
            "type": "message_reaction",
            "message_id": message_id,
            "reactions": reactions,
        })
    except Exception:
        pass

    return {"reactions": reactions}


@api_router.get("/messages/{message_id}/comments")
async def get_message_comments(message_id: str, user: dict = Depends(get_current_user)):
    """Get text comments on an annonce message."""
    comments = await db.message_comments.find(
        {"message_id": message_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    # Enrich with author info
    author_ids = list({c["user_id"] for c in comments})
    if author_ids:
        authors = await db.users.find(
            {"user_id": {"$in": author_ids}},
            {"_id": 0, "user_id": 1, "display_name": 1, "name": 1, "picture": 1, "role": 1}
        ).to_list(len(author_ids))
        authors_map = {a["user_id"]: a for a in authors}
    else:
        authors_map = {}
    for c in comments:
        a = authors_map.get(c["user_id"], {})
        c["author_name"] = a.get("display_name") or a.get("name") or "?"
        c["author_picture"] = a.get("picture")
        c["author_role"] = a.get("role")
    return {"comments": comments}


@api_router.post("/messages/{message_id}/comments")
async def post_message_comment(message_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Post a text comment on an annonce message."""
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Contenu vide")
    if len(content) > 500:
        raise HTTPException(status_code=400, detail="Commentaire trop long (500 caractères max)")

    msg = await db.messages.find_one({"message_id": message_id}, {"_id": 0, "campaign_id": 1, "message_type": 1})
    if not msg:
        raise HTTPException(status_code=404, detail="Message introuvable")

    comment_id = f"cmt_{uuid.uuid4().hex[:12]}"
    comment = {
        "comment_id": comment_id,
        "message_id": message_id,
        "campaign_id": msg.get("campaign_id"),
        "user_id": user["user_id"],
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.message_comments.insert_one(comment)
    comment.pop("_id", None)
    comment["author_name"] = user.get("display_name") or user.get("name") or "?"
    comment["author_picture"] = user.get("picture")
    comment["author_role"] = user.get("role")

    # Broadcast to campaign
    try:
        await manager.broadcast_to_campaign(msg["campaign_id"], {
            "type": "message_comment",
            "message_id": message_id,
            "comment": comment,
        })
    except Exception:
        pass

    # Update comment count on message
    await db.messages.update_one(
        {"message_id": message_id},
        {"$inc": {"comment_count": 1}}
    )

    return comment


@api_router.get("/campaigns/{campaign_id}/participants")
async def get_campaign_participants(campaign_id: str, user: dict = Depends(get_current_user)):
    """Get all participants (active + pending members + agency/manager) of a campaign."""
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")

    # All members (any status)
    members = await db.campaign_members.find(
        {"campaign_id": campaign_id},
        {"_id": 0, "user_id": 1, "role": 1, "status": 1, "joined_at": 1}
    ).to_list(500)

    member_ids = [m["user_id"] for m in members]
    agency_id = campaign.get("agency_id")
    campaign_manager_id = campaign.get("manager_id")

    # All user IDs we need to fetch (deduplicated)
    all_ids = list({uid for uid in member_ids + [agency_id, campaign_manager_id] if uid})

    user_docs = await db.users.find(
        {"user_id": {"$in": all_ids}},
        {"_id": 0, "user_id": 1, "display_name": 1, "name": 1, "picture": 1, "role": 1}
    ).to_list(500)
    users_map = {u["user_id"]: u for u in user_docs}

    participants = []
    seen_ids = set()

    # Agency owner first (not in campaign_members)
    for uid, lbl_role in [(agency_id, "agency"), (campaign_manager_id, "manager")]:
        if uid and uid not in seen_ids and uid not in member_ids:
            u = users_map.get(uid, {})
            participants.append({
                "user_id": uid,
                "role": u.get("role", lbl_role),
                "status": "owner",
                "display_name": u.get("display_name") or u.get("name", "Agence"),
                "picture": u.get("picture"),
                "joined_at": campaign.get("created_at"),
            })
            seen_ids.add(uid)

    # All members
    for m in members:
        uid = m["user_id"]
        if uid in seen_ids:
            continue
        u = users_map.get(uid, {})
        participants.append({
            "user_id": uid,
            "role": m.get("role", "clipper"),
            "status": m.get("status", "active"),
            "display_name": u.get("display_name") or u.get("name", "?"),
            "picture": u.get("picture"),
            "joined_at": m.get("joined_at"),
        })
        seen_ids.add(uid)

    return {"participants": participants, "total": len(participants)}

# ================= ANNOUNCEMENTS =================

@api_router.get("/announcements")
async def get_announcements(user: dict = Depends(get_current_user)):
    """Get announcements for feed"""
    if user.get("role") == "agency":
        announcements = await db.announcements.find(
            {"agency_id": user["user_id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
    else:
        memberships = await db.campaign_members.find(
            {"user_id": user["user_id"]},
            {"_id": 0, "campaign_id": 1}
        ).to_list(100)
        campaign_ids = [m["campaign_id"] for m in memberships]
        
        campaigns = await db.campaigns.find(
            {"campaign_id": {"$in": campaign_ids}},
            {"_id": 0, "agency_id": 1}
        ).to_list(100)
        agency_ids = list(set([c["agency_id"] for c in campaigns]))
        
        announcements = await db.announcements.find(
            {"agency_id": {"$in": agency_ids}},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
    
    for ann in announcements:
        agency = await db.users.find_one(
            {"user_id": ann["agency_id"]},
            {"_id": 0, "display_name": 1, "picture": 1}
        )
        ann["agency"] = agency
    
    return {"announcements": announcements}

@api_router.post("/announcements")
async def create_announcement(ann_data: AnnouncementCreate, user: dict = Depends(get_current_user)):
    if user.get("role") != "agency":
        raise HTTPException(status_code=403, detail="Only agencies can create announcements")
    
    announcement = {
        "announcement_id": f"ann_{uuid.uuid4().hex[:12]}",
        "agency_id": user["user_id"],
        "campaign_id": ann_data.campaign_id,
        "title": ann_data.title,
        "content": ann_data.content,
        "image_url": ann_data.image_url,
        "link_url": ann_data.link_url,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.announcements.insert_one(announcement)
    announcement.pop("_id", None)
    return announcement


@api_router.post("/announcements/{announcement_id}/like")
async def toggle_like(announcement_id: str, user: dict = Depends(get_current_user)):
    """Toggle like — supprime auto le dislike si présent (mutuellement exclusif)."""
    user_id = user["user_id"]
    existing = await db.announcement_likes.find_one({"announcement_id": announcement_id, "user_id": user_id})
    if existing:
        await db.announcement_likes.delete_one({"announcement_id": announcement_id, "user_id": user_id})
        liked = False
    else:
        await db.announcement_likes.insert_one({"announcement_id": announcement_id, "user_id": user_id})
        liked = True
        # Supprime dislike si présent (mutuellement exclusif)
        await db.announcement_dislikes.delete_one({"announcement_id": announcement_id, "user_id": user_id})
    like_count = await db.announcement_likes.count_documents({"announcement_id": announcement_id})
    dislike_count = await db.announcement_dislikes.count_documents({"announcement_id": announcement_id})
    disliked = await db.announcement_dislikes.find_one({"announcement_id": announcement_id, "user_id": user_id}) is not None
    return {"liked": liked, "count": like_count, "disliked": disliked, "dislike_count": dislike_count}


@api_router.post("/announcements/{announcement_id}/dislike")
async def toggle_dislike(announcement_id: str, user: dict = Depends(get_current_user)):
    """Toggle dislike — supprime auto le like si présent (mutuellement exclusif)."""
    user_id = user["user_id"]
    existing = await db.announcement_dislikes.find_one({"announcement_id": announcement_id, "user_id": user_id})
    if existing:
        await db.announcement_dislikes.delete_one({"announcement_id": announcement_id, "user_id": user_id})
        disliked = False
    else:
        await db.announcement_dislikes.insert_one({"announcement_id": announcement_id, "user_id": user_id})
        disliked = True
        # Supprime like si présent
        await db.announcement_likes.delete_one({"announcement_id": announcement_id, "user_id": user_id})
    like_count = await db.announcement_likes.count_documents({"announcement_id": announcement_id})
    dislike_count = await db.announcement_dislikes.count_documents({"announcement_id": announcement_id})
    liked = await db.announcement_likes.find_one({"announcement_id": announcement_id, "user_id": user_id}) is not None
    return {"disliked": disliked, "dislike_count": dislike_count, "liked": liked, "count": like_count}


@api_router.get("/announcements/{announcement_id}/likes")
async def get_likes(announcement_id: str, user: dict = Depends(get_current_user)):
    user_id = user["user_id"]
    like_count = await db.announcement_likes.count_documents({"announcement_id": announcement_id})
    dislike_count = await db.announcement_dislikes.count_documents({"announcement_id": announcement_id})
    liked = await db.announcement_likes.find_one({"announcement_id": announcement_id, "user_id": user_id}) is not None
    disliked = await db.announcement_dislikes.find_one({"announcement_id": announcement_id, "user_id": user_id}) is not None
    return {"count": like_count, "liked": liked, "dislike_count": dislike_count, "disliked": disliked}


@api_router.get("/announcements/{announcement_id}/comments")
async def get_comments(announcement_id: str, user: dict = Depends(get_current_user)):
    comments = await db.announcement_comments.find(
        {"announcement_id": announcement_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    for c in comments:
        author = await db.users.find_one({"user_id": c["user_id"]}, {"_id": 0, "display_name": 1, "picture": 1, "role": 1})
        c["author"] = author or {}
    return {"comments": comments}


@api_router.post("/announcements/{announcement_id}/comments")
async def post_comment(announcement_id: str, body: dict, user: dict = Depends(get_current_user)):
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Contenu vide")
    comment = {
        "comment_id": f"cmt_{uuid.uuid4().hex[:12]}",
        "announcement_id": announcement_id,
        "user_id": user["user_id"],
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.announcement_comments.insert_one(comment)
    comment.pop("_id", None)
    comment["author"] = {"display_name": user.get("display_name"), "picture": user.get("picture"), "role": user.get("role")}
    return comment


# ================= ADVICE (MANAGER) =================

@api_router.get("/advices")
async def get_advices(user: dict = Depends(get_current_user)):
    if user.get("role") == "manager":
        advices = await db.advices.find(
            {"manager_id": user["user_id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
    else:
        advices = await db.advices.find(
            {"recipient_ids": user["user_id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
    
    return {"advices": advices}

@api_router.get("/campaigns/{campaign_id}/received-advices")
async def get_received_advices(campaign_id: str, user: dict = Depends(get_current_user)):
    advices = await db.advices.find(
        {"campaign_id": campaign_id, "recipient_ids": user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    for adv in advices:
        sender_id = adv.get("sender_id") or adv.get("manager_id") or adv.get("agency_id")
        sender = await db.users.find_one({"user_id": sender_id}, {"_id": 0, "display_name": 1, "picture": 1, "role": 1}) if sender_id else None
        adv["sender"] = sender or {}
    return {"advices": advices}

@api_router.post("/advices")
async def create_advice(advice_data: AdviceCreate, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("manager", "agency"):
        raise HTTPException(status_code=403, detail="Seuls les managers et agences peuvent envoyer des conseils")
    
    advice = {
        "advice_id": f"adv_{uuid.uuid4().hex[:12]}",
        "manager_id": user["user_id"],
        "campaign_id": advice_data.campaign_id,
        "recipient_ids": advice_data.recipient_ids,
        "content": advice_data.content,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.advices.insert_one(advice)
    advice.pop("_id", None)
    
    for recipient_id in advice_data.recipient_ids:
        await manager.send_to_user(recipient_id, {
            "type": "new_advice",
            "advice": advice
        })
    
    return advice

# ================= MANAGER REMINDER =================

@api_router.get("/campaigns/{campaign_id}/clippers-advice-status")
async def get_clippers_advice_status(campaign_id: str, user: dict = Depends(get_current_user)):
    """Get clippers in a campaign with their advice status (for agency/manager)"""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency or Manager only")
    
    # Get clipper members
    members = await db.campaign_members.find(
        {"campaign_id": campaign_id, "role": "clipper", "status": "active"},
        {"_id": 0}
    ).to_list(100)
    
    # Batch fetch: users + social accounts + latest advice per clipper (3 queries total)
    member_ids = [m["user_id"] for m in members]

    user_docs = await db.users.find(
        {"user_id": {"$in": member_ids}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "display_name": 1, "picture": 1}
    ).to_list(200)
    users_map = {u["user_id"]: u for u in user_docs}

    # Récupère UNIQUEMENT les comptes sociaux assignés à CETTE campagne (pas tous les comptes du clipper)
    assignments = await db.campaign_social_accounts.find(
        {"campaign_id": campaign_id, "user_id": {"$in": member_ids}},
        {"_id": 0, "user_id": 1, "account_id": 1}
    ).to_list(1000)
    assigned_account_ids = {a["account_id"] for a in assignments}

    social_docs = await db.social_accounts.find(
        {"user_id": {"$in": member_ids}, "account_id": {"$in": list(assigned_account_ids)}},
        {"_id": 0, "user_id": 1, "platform": 1, "username": 1, "account_url": 1, "status": 1}
    ).to_list(1000)
    socials_map: dict = {}
    for s in social_docs:
        socials_map.setdefault(s["user_id"], []).append(s)

    # Latest advice per clipper for this campaign (aggregation — 1 query)
    advice_pipeline = [
        {"$match": {"campaign_id": campaign_id, "recipient_ids": {"$in": member_ids}}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$recipient_ids", "last_advice": {"$first": "$$ROOT"}}},
    ]
    # recipient_ids is an array field, so we unwind first
    advice_pipeline2 = [
        {"$match": {"campaign_id": campaign_id}},
        {"$unwind": "$recipient_ids"},
        {"$match": {"recipient_ids": {"$in": member_ids}}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$recipient_ids", "created_at": {"$first": "$created_at"}}},
    ]
    advice_agg = await db.advices.aggregate(advice_pipeline2).to_list(200)
    latest_advice_map = {a["_id"]: a["created_at"] for a in advice_agg}

    clippers = []
    now_utc = datetime.now(timezone.utc)
    for member in members:
        uid = member["user_id"]
        clipper_user = users_map.get(uid)
        if not clipper_user:
            continue

        hours_since_advice = None
        needs_advice = True
        last_advice_at = latest_advice_map.get(uid)
        if last_advice_at:
            last_time = datetime.fromisoformat(last_advice_at.replace("Z", "+00:00"))
            if last_time.tzinfo is None:
                last_time = last_time.replace(tzinfo=timezone.utc)
            hours_since_advice = (now_utc - last_time).total_seconds() / 3600
            needs_advice = hours_since_advice >= 72

        clippers.append({
            **clipper_user,
            "hours_since_advice": round(hours_since_advice, 1) if hours_since_advice is not None else None,
            "needs_advice": needs_advice,
            "last_advice_at": last_advice_at,
            "social_accounts": socials_map.get(uid, [])
        })
    
    # Sort: those needing advice first, then by hours since last advice (descending)
    clippers.sort(key=lambda x: (not x["needs_advice"], -(x["hours_since_advice"] or 9999)))
    
    return {"clippers": clippers}

@api_router.get("/manager/reminder-status")
async def get_reminder_status(user: dict = Depends(get_current_user)):
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Managers only")
    
    last_advice = await db.advices.find_one(
        {"manager_id": user["user_id"]},
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    
    if not last_advice:
        return {"show_reminder": True, "hours_since_last": None}
    
    last_time = datetime.fromisoformat(last_advice["created_at"])
    if last_time.tzinfo is None:
        last_time = last_time.replace(tzinfo=timezone.utc)
    
    hours_diff = (datetime.now(timezone.utc) - last_time).total_seconds() / 3600
    
    return {
        "show_reminder": hours_diff >= 72,
        "hours_since_last": round(hours_diff, 1)
    }

# ================= STATS & DASHBOARD =================

@api_router.get("/campaigns/{campaign_id}/stats")
async def get_campaign_stats(campaign_id: str, user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    members = await db.campaign_members.find(
        {"campaign_id": campaign_id, "role": "clipper"},
        {"_id": 0}
    ).to_list(100)

    # Batch: aggregate views per clipper (1 query) + batch user fetch (1 query)
    member_ids = [m["user_id"] for m in members]

    posts_agg = await db.posts.aggregate([
        {"$match": {"campaign_id": campaign_id, "user_id": {"$in": member_ids}}},
        {"$group": {"_id": "$user_id", "total_views": {"$sum": "$views"}, "post_count": {"$sum": 1}}}
    ]).to_list(200)
    posts_map = {p["_id"]: {"views": p["total_views"], "post_count": p["post_count"]} for p in posts_agg}

    user_docs = await db.users.find(
        {"user_id": {"$in": member_ids}},
        {"_id": 0, "user_id": 1, "display_name": 1, "name": 1, "picture": 1}
    ).to_list(200)
    users_map_stats = {u["user_id"]: u for u in user_docs}

    total_views = 0
    clipper_stats = []

    for member in members:
        uid = member["user_id"]
        p_data = posts_map.get(uid, {"views": 0, "post_count": 0})
        views = p_data["views"]
        earnings = (views / 1000) * campaign.get("rpm", 0)
        clipper_user = users_map_stats.get(uid, {})

        clipper_stats.append({
            "user_id": uid,
            "display_name": clipper_user.get("display_name") or clipper_user.get("name") or uid,
            "picture": clipper_user.get("picture"),
            "views": views,
            "post_count": p_data["post_count"],
            "earnings": round(earnings, 2),
            "strikes": member.get("strikes", 0),
            "status": member.get("status", "active")
        })
        total_views += views

    clipper_stats_sorted = sorted(clipper_stats, key=lambda x: x["views"], reverse=True)
    for i, cs in enumerate(clipper_stats_sorted):
        cs["rank"] = i + 1

    # ── Chart data: daily NEW views (delta from snapshots, last 30 days) ──
    from datetime import timedelta as _td
    today = datetime.now(timezone.utc).date()
    start_date_30 = str(today - _td(days=30))

    snapshots_30 = await db.views_snapshots.find(
        {"campaign_id": campaign_id, "date": {"$gte": start_date_30}},
        {"_id": 0, "date": 1, "total_views": 1}
    ).sort("date", 1).to_list(35)

    views_chart = []
    if snapshots_30:
        prev_snap_30 = await db.views_snapshots.find_one(
            {"campaign_id": campaign_id, "date": {"$lt": start_date_30}},
            {"_id": 0, "total_views": 1},
            sort=[("date", -1)]
        )
        prev_total_30 = prev_snap_30["total_views"] if prev_snap_30 else 0
        snap_by_date_30 = {s["date"]: s["total_views"] for s in snapshots_30}
        delta_by_day_30: dict = {}
        running = prev_total_30
        for d in sorted(snap_by_date_30.keys()):
            cum = snap_by_date_30[d]
            delta_by_day_30[d] = max(0, cum - running)
            running = cum
        for i in range(30, -1, -1):
            d = str(today - _td(days=i))
            views_chart.append({"date": d, "views": delta_by_day_30.get(d, 0)})
    else:
        for i in range(30, -1, -1):
            views_chart.append({"date": str(today - _td(days=i)), "views": 0})

    # ── Videos for client view (no RPM/earnings) ──
    # Batch-fetch any video uploaders not already in users_map_stats
    video_user_ids = {v.get("user_id") for v in all_videos if v.get("user_id") and v.get("user_id") not in users_map_stats}
    if video_user_ids:
        extra_users = await db.users.find(
            {"user_id": {"$in": list(video_user_ids)}},
            {"_id": 0, "user_id": 1, "display_name": 1, "name": 1, "picture": 1}
        ).to_list(200)
        for u in extra_users:
            users_map_stats[u["user_id"]] = u

    videos_client = []
    for vid in sorted(all_videos, key=lambda v: v.get("published_at") or v.get("fetched_at") or "", reverse=True)[:200]:
        uid = vid.get("user_id")
        clipper_info = users_map_stats.get(uid, {})
        videos_client.append({
            "video_id": vid.get("video_id"),
            "url": vid.get("url"),
            "platform": vid.get("platform"),
            "title": vid.get("title"),
            "thumbnail_url": vid.get("thumbnail_url"),
            "views": vid.get("views", 0),
            "likes": vid.get("likes", 0),
            "comments": vid.get("comments", 0),
            "published_at": vid.get("published_at"),
            "clipper_name": clipper_info.get("display_name") or clipper_info.get("name") or "Clippeur",
            "clipper_picture": clipper_info.get("picture"),
        })

    is_client = user.get("role") == "client"
    result = {
        "campaign_id": campaign_id,
        "total_views": total_views,
        "budget_used": round((total_views / 1000) * campaign["rpm"], 2),
        "budget_total": campaign.get("budget_total"),
        "budget_unlimited": campaign.get("budget_unlimited", False),
        "clipper_count": len(members),
        "clipper_stats": clipper_stats_sorted,
        "views_chart": views_chart,
        "videos": videos_client,
        "video_count": len(all_videos),
    }
    # Ne pas exposer le RPM aux clients
    if not is_client:
        result["rpm"] = campaign.get("rpm")
    return result

@api_router.get("/clipper/all-videos")
async def get_clipper_all_videos(user: dict = Depends(get_current_user)):
    """All tracked videos for the current clipper across all accounts and campaigns."""
    if user.get("role") != "clipper":
        raise HTTPException(status_code=403, detail="Clippers only")
    videos = await db.tracked_videos.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("published_at", -1).to_list(500)
    # Enrich with campaign name
    campaign_ids = list(set(v["campaign_id"] for v in videos if v.get("campaign_id")))
    camp_names = {}
    for cid in campaign_ids:
        c = await db.campaigns.find_one({"campaign_id": cid}, {"_id": 0, "name": 1})
        if c:
            camp_names[cid] = c["name"]
    for v in videos:
        v["campaign_name"] = camp_names.get(v.get("campaign_id"), "Sans campagne")
    return {"videos": videos, "total": len(videos)}

@api_router.get("/clipper/stats")
async def get_clipper_stats(user: dict = Depends(get_current_user)):
    if user.get("role") != "clipper":
        raise HTTPException(status_code=403, detail="Clippers only")

    memberships = await db.campaign_members.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).to_list(100)

    total_earnings = 0
    total_views = 0
    campaign_stats = []

    for membership in memberships:
        campaign = await db.campaigns.find_one(
            {"campaign_id": membership["campaign_id"]},
            {"_id": 0}
        )
        if campaign:
            payment_model = campaign.get("payment_model", "views")
            rpm = campaign.get("rpm", 0)
            rate_per_click = campaign.get("rate_per_click", 0.0)
            unique_only = campaign.get("unique_clicks_only", True)

            if payment_model == "clicks":
                calc = await _calc_clicks_for_member(campaign["campaign_id"], user["user_id"], rate_per_click, unique_only)
            else:
                calc = await _calc_earnings_for_member(campaign["campaign_id"], user["user_id"], rpm)

            views = calc.get("views", 0)
            earnings = calc["earned"]
            total_earnings += earnings
            total_views += views

            stat = {
                "campaign_id": campaign["campaign_id"],
                "campaign_name": campaign["name"],
                "views": views,
                "earnings": round(earnings, 2),
                "paid": calc["paid"],
                "owed": calc["owed"],
                "strikes": membership.get("strikes", 0),
                "status": membership.get("status", "active"),
                "payment_model": payment_model,
                "rate_per_click": rate_per_click,
            }
            # For click-based campaigns, include the tracking link directly
            if payment_model == "clicks":
                stat["clicks"] = calc.get("clicks", 0)
                stat["unique_clicks"] = calc.get("unique_clicks", 0)
                stat["tracking_url"] = calc.get("tracking_url")

            campaign_stats.append(stat)

    return {
        "total_earnings": round(total_earnings, 2),
        "total_views": total_views,
        "campaign_stats": campaign_stats
    }

# ================= STRIPE PAYMENTS =================

@api_router.post("/payments/create-checkout")
async def create_checkout_session(body: dict, user: dict = Depends(get_current_user)):
    """Agency top-up: create a Stripe Checkout session"""
    if user.get("role") != "agency":
        raise HTTPException(status_code=403, detail="Agencies only")

    amount_eur = body.get("amount", 100)  # euros
    if amount_eur < 10:
        raise HTTPException(status_code=400, detail="Minimum top-up is 10 EUR")

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "eur",
                    "product_data": {"name": "Recharge budget The Clip Deal"},
                    "unit_amount": int(amount_eur * 100),
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{FRONTEND_URL}/agency?payment=success&amount={amount_eur}",
            cancel_url=f"{FRONTEND_URL}/agency?payment=cancelled",
            metadata={"user_id": user["user_id"], "amount_eur": str(amount_eur)}
        )
        return {"url": session.url, "session_id": session.id}
    except stripe.error.StripeError as e:
        # In test/dev mode without real Stripe keys, return a mock response
        logger.warning(f"Stripe error (likely test mode): {e}")
        return {
            "url": f"{FRONTEND_URL}/agency?payment=success&amount={amount_eur}",
            "session_id": "mock_session",
            "mock": True
        }

@api_router.post("/payments/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events"""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    # SECURITE: la signature Stripe est OBLIGATOIRE en prod (sinon n'importe qui credite des wallets via cURL)
    if not STRIPE_WEBHOOK_SECRET:
        logger.error("Stripe webhook called but STRIPE_WEBHOOK_SECRET not configured - rejecting for security")
        raise HTTPException(status_code=503, detail="Webhook secret not configured")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logger.warning(f"Stripe webhook signature verification failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event.get("type") == "checkout.session.completed":
        session = event["data"]["object"]
        metadata = session.get("metadata", {})
        user_id = metadata.get("user_id")
        amount_eur = float(metadata.get("amount_eur", 0))

        if user_id and amount_eur > 0:
            # Record the top-up
            await db.payments.insert_one({
                "payment_id": f"pay_{uuid.uuid4().hex[:12]}",
                "user_id": user_id,
                "type": "topup",
                "amount_eur": amount_eur,
                "stripe_session_id": session.get("id"),
                "status": "completed",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            # Add to agency budget_used ceiling (increase available balance)
            await db.users.update_one(
                {"user_id": user_id},
                {"$inc": {"wallet_balance": amount_eur}}
            )

    return {"received": True}

@api_router.post("/payments/payout")
async def request_payout(payout_data: PayoutRequest, user: dict = Depends(get_current_user)):
    """Clipper requests a payout"""
    if user.get("role") != "clipper":
        raise HTTPException(status_code=403, detail="Clippers only")

    # Calculate total earnings
    memberships = await db.campaign_members.find(
        {"user_id": user["user_id"]},
        {"_id": 0, "campaign_id": 1}
    ).to_list(100)

    total_earnings = 0
    total_paid_confirmed = 0
    for membership in memberships:
        campaign = await db.campaigns.find_one({"campaign_id": membership["campaign_id"]}, {"_id": 0})
        if campaign:
            rpm = campaign.get("rpm", 0)
            calc = await _calc_earnings_for_member(campaign["campaign_id"], user["user_id"], rpm)
            total_earnings += calc["earned"]
            total_paid_confirmed += calc["paid"]

    total_earnings = round(total_earnings, 2)
    amount = payout_data.amount
    available = round(max(total_earnings - total_paid_confirmed, 0), 2)

    if amount > available:
        raise HTTPException(status_code=400, detail=f"Solde insuffisant. Disponible : {available:.2f} EUR")

    if amount < 50:
        raise HTTPException(status_code=400, detail="Minimum de virement : 50 EUR")

    payout_record = {
        "payment_id": f"pay_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "type": "payout",
        "amount_eur": amount,
        "campaign_id": payout_data.campaign_id,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.payments.insert_one(payout_record)
    payout_record.pop("_id", None)

    return {"message": "Demande de virement enregistrée", "payout": payout_record, "available_after": round(available - amount, 2)}

@api_router.get("/payments/history")
async def get_payment_history(user: dict = Depends(get_current_user)):
    payments = await db.payments.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"payments": payments}

# ================= PAIEMENTS DIRECTS (sans Stripe) =================

async def _calc_clicks_for_member(campaign_id: str, user_id: str, rate_per_click: float, unique_only: bool) -> dict:
    """Calculate click-based earnings for a clipper on a click-model campaign."""
    link = await db.click_links.find_one(
        {"campaign_id": campaign_id, "clipper_id": user_id, "is_active": True},
        {"_id": 0}
    )
    if not link:
        # No link generated yet
        clicks = 0
        unique_clicks = 0
        earnings = 0.0
        tracking_url = None
    else:
        clicks = link.get("click_count", 0)
        unique_clicks = link.get("unique_click_count", 0)
        billable = unique_clicks if unique_only else clicks
        earnings = round((billable / 1000) * rate_per_click, 2)  # €/1K clics
        backend_url = os.environ.get("BACKEND_URL", "https://api.theclipdealtrack.com")
        tracking_url = link.get("tracking_url") or f"{backend_url}/track/{link['short_code']}"

    # Confirmed payments (same table as views model)
    confirmed = await db.payments.find(
        {"user_id": user_id, "campaign_id": campaign_id, "type": "direct_payment", "status": "confirmed"},
        {"_id": 0, "amount_eur": 1, "confirmed_at": 1}
    ).sort("confirmed_at", -1).to_list(100)
    paid = round(sum(p.get("amount_eur", 0) for p in confirmed), 2)
    last_payment = confirmed[0] if confirmed else None

    membership = await db.campaign_members.find_one(
        {"campaign_id": campaign_id, "user_id": user_id},
        {"_id": 0, "joined_at": 1}
    )
    joined_at_str = None
    if membership and membership.get("joined_at"):
        jat = membership["joined_at"]
        joined_at_str = jat if isinstance(jat, str) else jat.isoformat()

    return {
        "clicks": clicks,
        "unique_clicks": unique_clicks,
        "views": 0,  # compatibility field
        "earned": earnings,
        "paid": paid,
        "owed": round(max(earnings - paid, 0), 2),
        "last_payment": last_payment,
        "joined_at": joined_at_str,
        "tracking_url": tracking_url,
    }

async def _calc_earnings_for_member(campaign_id: str, user_id: str, rpm: float) -> dict:
    """
    Calculate total views and earnings for a clipper on a campaign.
    Only counts videos published AFTER the clipper joined the campaign.
    Manually-added videos (agency exception) are always counted.

    Sources (union, dédupliqué par platform_video_id) :
    1. tracked_videos liés à ce campaign_id directement
    2. tracked_videos des comptes sociaux assignés à cette campagne
    3. posts soumis manuellement (db.posts)
    """
    # ── Récupérer joined_at du membre ──────────────────────────────────────
    membership = await db.campaign_members.find_one(
        {"campaign_id": campaign_id, "user_id": user_id},
        {"_id": 0, "joined_at": 1}
    )
    joined_at_str = None
    if membership and membership.get("joined_at"):
        jat = membership["joined_at"]
        joined_at_str = jat if isinstance(jat, str) else jat.isoformat()

    def _after_joined(published_at, manually_added=False):
        """Retourne True si la vidéo doit être comptabilisée."""
        if manually_added:
            return True
        if not joined_at_str:
            return True
        if not published_at:
            return True
        try:
            pub_str = str(published_at).replace("Z", "+00:00")
            join_str = joined_at_str.replace("Z", "+00:00")
            pub = datetime.fromisoformat(pub_str)
            joined = datetime.fromisoformat(join_str)
            if pub.tzinfo is None:
                pub = pub.replace(tzinfo=timezone.utc)
            if joined.tzinfo is None:
                joined = joined.replace(tzinfo=timezone.utc)
            return pub >= joined
        except Exception:
            return str(published_at)[:19] >= joined_at_str[:19]

    seen_video_ids = set()
    total_views = 0

    # ── Source 1 : tracked_videos avec campaign_id explicite ──────────────
    t_vids = await db.tracked_videos.find(
        {"campaign_id": campaign_id, "user_id": user_id},
        {"_id": 0, "platform_video_id": 1, "views": 1, "published_at": 1, "manually_added": 1}
    ).to_list(10000)
    for v in t_vids:
        if not _after_joined(v.get("published_at"), v.get("manually_added", False)):
            continue
        vid_key = v.get("platform_video_id") or v.get("video_id", "")
        if vid_key and vid_key not in seen_video_ids:
            seen_video_ids.add(vid_key)
            total_views += v.get("views", 0)

    # ── Source 2 : comptes assignés à la campagne ──────────────────────────
    assignments = await db.campaign_social_accounts.find(
        {"campaign_id": campaign_id, "user_id": user_id},
        {"_id": 0, "account_id": 1}
    ).to_list(100)
    account_ids = [a["account_id"] for a in assignments]
    if account_ids:
        acc_vids = await db.tracked_videos.find(
            {"account_id": {"$in": account_ids}},
            {"_id": 0, "platform_video_id": 1, "views": 1, "published_at": 1, "manually_added": 1}
        ).to_list(10000)
        for v in acc_vids:
            if not _after_joined(v.get("published_at"), v.get("manually_added", False)):
                continue
            vid_key = v.get("platform_video_id") or v.get("video_id", "")
            if vid_key and vid_key not in seen_video_ids:
                seen_video_ids.add(vid_key)
                total_views += v.get("views", 0)

    # ── Source 3 : posts manuels ────────────────────────────────────────────
    manual_posts = await db.posts.find(
        {"campaign_id": campaign_id, "user_id": user_id},
        {"_id": 0, "post_id": 1, "views": 1, "created_at": 1}
    ).to_list(10000)
    for p in manual_posts:
        if not _after_joined(p.get("created_at")):
            continue
        post_key = f"post_{p.get('post_id', '')}"
        if post_key not in seen_video_ids:
            seen_video_ids.add(post_key)
            total_views += p.get("views", 0)

    views = total_views
    earned = round((views / 1000) * rpm, 2)

    # ── Paiements déjà confirmés ───────────────────────────────────────────
    confirmed = await db.payments.find(
        {"user_id": user_id, "campaign_id": campaign_id, "type": "direct_payment", "status": "confirmed"},
        {"_id": 0, "amount_eur": 1, "confirmed_at": 1}
    ).sort("confirmed_at", -1).to_list(100)
    paid = round(sum(p.get("amount_eur", 0) for p in confirmed), 2)
    last_payment = confirmed[0] if confirmed else None

    return {
        "views": views,
        "earned": earned,
        "paid": paid,
        "owed": round(max(earned - paid, 0), 2),
        "last_payment": last_payment,
        "joined_at": joined_at_str,
    }

@api_router.get("/campaigns/{campaign_id}/payment-summary")
async def get_campaign_payment_summary(campaign_id: str, user: dict = Depends(get_current_user)):
    """Payment summary for a campaign.
    - Agency/manager: returns all clippers with earnings + owed
    - Clipper: returns only their own summary
    Supports both payment_model = 'views' and 'clicks'.
    """
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")

    payment_model = campaign.get("payment_model", "views")
    rpm = campaign.get("rpm", 0)
    rate_per_click = campaign.get("rate_per_click", 0.0)
    unique_only = campaign.get("unique_clicks_only", True)

    async def _calc(uid):
        if payment_model == "clicks":
            return await _calc_clicks_for_member(campaign_id, uid, rate_per_click, unique_only)
        return await _calc_earnings_for_member(campaign_id, uid, rpm)

    if user.get("role") in ["agency", "manager"]:
        members = await db.campaign_members.find(
            {"campaign_id": campaign_id, "role": "clipper"},
            {"_id": 0, "user_id": 1}
        ).to_list(200)
        result = []
        for m in members:
            clipper = await db.users.find_one(
                {"user_id": m["user_id"]},
                {"_id": 0, "user_id": 1, "display_name": 1, "name": 1, "picture": 1, "payment_info": 1}
            )
            if not clipper:
                continue
            data = await _calc(m["user_id"])
            result.append({**clipper, **data})
        result.sort(key=lambda x: x["earned"], reverse=True)
        return {
            "role": "agency",
            "clippers": result,
            "campaign_name": campaign.get("name"),
            "rpm": rpm,
            "payment_model": payment_model,
            "rate_per_click": rate_per_click,
        }

    else:  # clipper view
        data = await _calc(user["user_id"])
        return {
            "role": "clipper",
            "campaign_name": campaign.get("name"),
            "rpm": rpm,
            "payment_model": payment_model,
            "rate_per_click": rate_per_click,
            **data
        }

@api_router.get("/payments/owed")
async def get_owed_payments(user: dict = Depends(get_current_user)):
    """Agency: total owed to all clippers across all campaigns."""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager uniquement")

    campaigns = await db.campaigns.find(
        {"agency_id": user["user_id"]},
        {"_id": 0}
    ).to_list(200)

    # Batch: fetch all members for all campaigns + all clipper users in 2 queries
    campaign_ids = [c["campaign_id"] for c in campaigns]
    all_members = await db.campaign_members.find(
        {"campaign_id": {"$in": campaign_ids}, "role": "clipper"},
        {"_id": 0, "user_id": 1, "campaign_id": 1}
    ).to_list(2000)
    all_clipper_ids = list({m["user_id"] for m in all_members})
    clipper_docs = await db.users.find(
        {"user_id": {"$in": all_clipper_ids}},
        {"_id": 0, "user_id": 1, "display_name": 1, "name": 1, "picture": 1, "payment_info": 1}
    ).to_list(1000)
    clippers_map = {c["user_id"]: c for c in clipper_docs}

    # Group members by campaign for O(1) lookup
    members_by_campaign: dict = {}
    for m in all_members:
        members_by_campaign.setdefault(m["campaign_id"], []).append(m)

    rows = []
    for campaign in campaigns:
        rpm = campaign.get("rpm", 0)
        payment_model = campaign.get("payment_model", "views")
        rate_per_click = campaign.get("rate_per_click", 0.0)
        unique_only = campaign.get("unique_clicks_only", True)
        cid = campaign["campaign_id"]
        for m in members_by_campaign.get(cid, []):
            clipper = clippers_map.get(m["user_id"])
            if not clipper:
                continue
            if payment_model == "clicks":
                data = await _calc_clicks_for_member(cid, m["user_id"], rate_per_click, unique_only)
            else:
                data = await _calc_earnings_for_member(cid, m["user_id"], rpm)
            if data["earned"] > 0:
                rows.append({
                    **clipper,
                    "campaign_id": cid,
                    "campaign_name": campaign.get("name"),
                    "payment_model": payment_model,
                    "rpm": rpm,
                    "rate_per_click": rate_per_click,
                    **data,
                })
    rows.sort(key=lambda x: x["earned"], reverse=True)
    total_owed = round(sum(r["owed"] for r in rows), 2)
    return {"rows": rows, "total_owed": total_owed}

@api_router.post("/payments/confirm")
async def confirm_payment(body: dict, user: dict = Depends(get_current_user)):
    """Agency marks a direct payment as done."""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager uniquement")

    clipper_user_id = body.get("user_id")
    campaign_id = body.get("campaign_id")
    try:
        amount = float(body.get("amount", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Montant invalide")

    if not clipper_user_id or not campaign_id or amount <= 0:
        raise HTTPException(status_code=400, detail="Paramètres invalides")

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "payment_id": f"pay_{uuid.uuid4().hex[:12]}",
        "user_id": clipper_user_id,
        "agency_id": user["user_id"],
        "campaign_id": campaign_id,
        "type": "direct_payment",
        "amount_eur": amount,
        "status": "confirmed",
        "confirmed_at": now,
        "created_at": now,
    }
    await db.payments.insert_one(record)
    record.pop("_id", None)

    # Notify clipper via WebSocket
    await manager.send_to_user(clipper_user_id, {
        "type": "payment_confirmed",
        "campaign_id": campaign_id,
        "amount": amount,
    })
    return {"message": "Paiement confirmé", "payment": record}

# ================= SUBSCRIPTION =================

@api_router.get("/subscription/status")
async def get_subscription_status(user: dict = Depends(get_current_user)):
    """Get current subscription status for agency"""
    if user.get("role") not in ["agency"]:
        raise HTTPException(status_code=403, detail="Agences uniquement")

    trial_started_at = user.get("trial_started_at")
    subscription_status = user.get("subscription_status", "none")
    subscription_plan = user.get("subscription_plan")

    trial_days_remaining = 0
    trial_expired = False
    if trial_started_at and subscription_status == "trial":
        trial_start = datetime.fromisoformat(trial_started_at.replace("Z", "+00:00"))
        trial_end = trial_start + timedelta(days=14)
        now = datetime.now(timezone.utc)
        if now < trial_end:
            trial_days_remaining = (trial_end - now).days
        else:
            trial_expired = True
            subscription_status = "expired"

    return {
        "subscription_status": subscription_status,
        "subscription_plan": subscription_plan,
        "trial_started_at": trial_started_at,
        "trial_days_remaining": trial_days_remaining,
        "trial_expired": trial_expired,
    }

@api_router.post("/subscription/start-trial")
async def start_trial(user: dict = Depends(get_current_user)):
    """Start the 14-day free trial for a new agency"""
    if user.get("role") != "agency":
        raise HTTPException(status_code=403, detail="Agences uniquement")

    if user.get("trial_started_at") or user.get("subscription_status") not in [None, "none"]:
        return {"message": "Essai déjà commencé"}

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"trial_started_at": now_iso, "subscription_status": "trial"}}
    )
    return {"message": "Essai gratuit activé", "trial_started_at": now_iso}

SUBSCRIPTION_PLANS = {
    "plan_small":     {"name": "Starter",  "amount": 24900,  "label": "249€/mois",
                       "max_campaigns": 1,    "max_clippers": 15},
    "plan_medium":    {"name": "Pro",       "amount": 54900,  "label": "549€/mois",
                       "max_campaigns": 3,    "max_clippers": 10},
    "plan_unlimited": {"name": "Illimité",  "amount": 74900,  "label": "749€/mois",
                       "max_campaigns": None, "max_clippers": None},
    # Legacy alias — redirect to plan_medium
    "plan_full":      {"name": "Pro",       "amount": 54900,  "label": "549€/mois",
                       "max_campaigns": 3,    "max_clippers": 10},
}

# Limits per plan (None = unlimited). Trial period = always unlimited.
PLAN_LIMITS = {
    "plan_small":     {"campaigns": 1,    "clippers": 15},
    "plan_medium":    {"campaigns": 3,    "clippers": 10},
    "plan_unlimited": {"campaigns": None, "clippers": None},
    "plan_full":      {"campaigns": 3,    "clippers": 10},
}

def _get_plan_limits(user: dict) -> dict:
    """Return {"campaigns": N|None, "clippers": N|None} for the user's plan.
    During trial (14 days): always unlimited.
    No subscription: unlimited (new account grace).
    """
    sub_status = user.get("subscription_status", "none")
    if sub_status in (None, "none"):
        return {"campaigns": None, "clippers": None}  # new account grace
    if sub_status == "trial":
        trial_started_at = user.get("trial_started_at")
        if trial_started_at:
            trial_start = datetime.fromisoformat(trial_started_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) < trial_start + timedelta(days=14):
                return {"campaigns": None, "clippers": None}  # trial unlimited
    plan_id = user.get("subscription_plan", "plan_small")
    return PLAN_LIMITS.get(plan_id, {"campaigns": 1, "clippers": 15})

@api_router.post("/subscription/checkout")
async def create_subscription_checkout(body: dict, user: dict = Depends(get_current_user)):
    """Create a Stripe Checkout session for agency subscription"""
    if user.get("role") != "agency":
        raise HTTPException(status_code=403, detail="Agences uniquement")

    plan_id = body.get("plan_id", "plan_medium")
    if plan_id not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Plan invalide")

    if STRIPE_API_KEY == "sk_test_placeholder" or not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Paiement non configuré — ajoutez STRIPE_API_KEY dans Railway")

    plan = SUBSCRIPTION_PLANS[plan_id]
    stripe.api_key = STRIPE_API_KEY

    try:
        # Reuse existing customer or create a new one
        customer_id = user.get("stripe_customer_id")
        if not customer_id:
            customer = stripe.Customer.create(
                email=user.get("email", ""),
                name=user.get("display_name") or user.get("name", ""),
                metadata={"user_id": user["user_id"]},
            )
            customer_id = customer.id
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"stripe_customer_id": customer_id}}
            )

        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "eur",
                    "product_data": {
                        "name": f"The Clip Deal Track — {plan['name']}",
                        "description": f"Abonnement mensuel {plan['label']} (HT)",
                    },
                    "unit_amount": plan["amount"],
                    "recurring": {"interval": "month"},
                },
                "quantity": 1,
            }],
            mode="subscription",
            success_url=f"{FRONTEND_URL}/agency/settings?sub=success&plan={plan_id}",
            cancel_url=f"{FRONTEND_URL}/agency/settings?sub=cancelled",
            metadata={"user_id": user["user_id"], "plan_id": plan_id},
        )
        return {"url": session.url, "session_id": session.id}
    except stripe.error.StripeError as e:
        msg = getattr(e, "user_message", None) or str(e)
        raise HTTPException(status_code=400, detail=msg)
    except Exception as e:
        logger.error(f"Subscription checkout error: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la création du paiement")

@api_router.post("/subscription/webhook")
async def subscription_webhook(request: Request):
    """Handle Stripe subscription webhook events"""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

    if webhook_secret:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        except stripe.error.SignatureVerificationError:
            raise HTTPException(status_code=400, detail="Signature invalide")
    else:
        try:
            event = json.loads(payload)
        except Exception:
            raise HTTPException(status_code=400, detail="Payload invalide")

    event_type = event.get("type", "")

    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("user_id")
        plan_id = session.get("metadata", {}).get("plan_id")
        stripe_sub_id = session.get("subscription")
        if user_id and plan_id:
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {
                    "subscription_status": "active",
                    "subscription_plan": plan_id,
                    "stripe_subscription_id": stripe_sub_id,
                }}
            )
            logger.info(f"Subscription activated for {user_id}: {plan_id}")

    elif event_type in ("customer.subscription.deleted", "customer.subscription.paused"):
        sub = event["data"]["object"]
        stripe_sub_id = sub.get("id")
        user = await db.users.find_one({"stripe_subscription_id": stripe_sub_id}, {"_id": 0})
        if user:
            await db.users.update_one(
                {"stripe_subscription_id": stripe_sub_id},
                {"$set": {"subscription_status": "expired", "subscription_plan": None}}
            )
            logger.info(f"Subscription cancelled for {user.get('user_id')}")

    elif event_type == "invoice.payment_succeeded":
        invoice = event["data"]["object"]
        stripe_sub_id = invoice.get("subscription")
        if stripe_sub_id:
            await db.users.update_one(
                {"stripe_subscription_id": stripe_sub_id},
                {"$set": {"subscription_status": "active"}}
            )

    elif event_type == "invoice.payment_failed":
        invoice = event["data"]["object"]
        stripe_sub_id = invoice.get("subscription")
        if stripe_sub_id:
            await db.users.update_one(
                {"stripe_subscription_id": stripe_sub_id},
                {"$set": {"subscription_status": "past_due"}}
            )

    return {"received": True}

# ================= SETTINGS =================

@api_router.put("/settings")
async def update_settings(settings: dict, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"settings": settings}}
    )
    return {"message": "Settings updated"}

@api_router.put("/profile")
async def update_profile(profile_data: dict, user: dict = Depends(get_current_user)):
    update_fields = {}
    if "display_name" in profile_data:
        update_fields["display_name"] = profile_data["display_name"]
    if "picture" in profile_data:
        update_fields["picture"] = profile_data["picture"]
    if "payment_info" in profile_data:
        update_fields["payment_info"] = profile_data["payment_info"]

    if update_fields:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": update_fields}
        )
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    return updated or {}

# ================= WEBSOCKET =================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except (json.JSONDecodeError, ValueError):
                continue  # ignore malformed frames, don't crash
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
    except Exception:
        manager.disconnect(websocket, user_id)

# ================= ADMIN ROUTES =================

async def verify_admin_code(request: Request):
    """Dependency: verify X-Admin-Code header against env var."""
    if not ADMIN_SECRET_CODE:
        raise HTTPException(status_code=503, detail="ADMIN_SECRET_CODE non configuré sur le serveur")
    code = request.headers.get("X-Admin-Code", "")
    if not code or not hmac.compare_digest(code, ADMIN_SECRET_CODE):
        raise HTTPException(status_code=403, detail="Code admin invalide")
    return True

@api_router.get("/admin/verify")
async def admin_verify(request: Request):
    """Verify admin code — returns 200 if valid, 403 if not."""
    await verify_admin_code(request)
    return {"ok": True}

@api_router.get("/debug/tikwm/{username}")
async def debug_tikwm(username: str):
    """Debug endpoint: tests all TikWm strategies for a TikTok username. No auth required."""
    username = username.lstrip("@")
    result = {"tikwm_api_key_configured": bool(TIKWM_API_KEY)}

    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.tikwm.com",
        "Referer": "https://www.tikwm.com/",
    }

    def _trim_body(body):
        if isinstance(body, dict) and isinstance(body.get("data"), dict):
            vids = body["data"].get("videos") or []
            body["data"]["videos_sample"] = vids[:2]
            body["data"]["videos_count"] = len(vids)
            body["data"].pop("videos", None)
        return body

    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
        # Test 1: user info
        try:
            r = await c.get("https://www.tikwm.com/api/user/info",
                params={"unique_id": username}, headers=HEADERS)
            result["user_info"] = {"http_status": r.status_code,
                "body": r.json() if r.status_code == 200 else r.text[:300]}
        except Exception as e:
            result["user_info"] = {"error": str(e)}

        # Test 2: GET no-key
        try:
            r = await c.get("https://www.tikwm.com/api/user/posts",
                params={"unique_id": username, "count": 10, "cursor": 0}, headers=HEADERS)
            body = r.json() if r.status_code == 200 else r.text[:300]
            result["posts_get_nokey"] = {"http_status": r.status_code, "body": _trim_body(body) if r.status_code == 200 else body}
        except Exception as e:
            result["posts_get_nokey"] = {"error": str(e)}

        # Test 3: GET with API key (if configured)
        if TIKWM_API_KEY:
            try:
                r = await c.get("https://www.tikwm.com/api/user/posts",
                    params={"unique_id": username, "count": 10, "cursor": 0, "key": TIKWM_API_KEY}, headers=HEADERS)
                body = r.json() if r.status_code == 200 else r.text[:300]
                result["posts_get_key"] = {"http_status": r.status_code, "body": _trim_body(body) if r.status_code == 200 else body}
            except Exception as e:
                result["posts_get_key"] = {"error": str(e)}

        # Test 4: POST form-encoded
        try:
            post_data = {"unique_id": username, "count": "10", "cursor": "0"}
            if TIKWM_API_KEY:
                post_data["key"] = TIKWM_API_KEY
            r = await c.post("https://www.tikwm.com/api/user/posts",
                data=post_data,
                headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded"})
            body = r.json() if r.status_code == 200 else r.text[:300]
            result["posts_post_form"] = {"http_status": r.status_code, "body": _trim_body(body) if r.status_code == 200 else body}
        except Exception as e:
            result["posts_post_form"] = {"error": str(e)}

        # Test 5: GET with web=1
        try:
            r = await c.get("https://www.tikwm.com/api/user/posts",
                params={"unique_id": username, "count": 10, "cursor": 0, "web": 1, "hd": 1}, headers=HEADERS)
            body = r.json() if r.status_code == 200 else r.text[:300]
            result["posts_get_web1"] = {"http_status": r.status_code, "body": _trim_body(body) if r.status_code == 200 else body}
        except Exception as e:
            result["posts_get_web1"] = {"error": str(e)}

        # Test 6: feed search type=0 (videos)
        try:
            r = await c.get("https://www.tikwm.com/api/feed/search",
                params={"keywords": username, "count": 20, "cursor": 0, "type": 0}, headers=HEADERS)
            body = r.json() if r.status_code == 200 else r.text[:300]
            if isinstance(body, dict) and isinstance(body.get("data"), dict):
                items = body["data"].get("videos") or body["data"].get("data") or []
                result["feed_search_type0"] = {
                    "http_status": r.status_code,
                    "code": body.get("code"),
                    "data_keys": list(body["data"].keys()),
                    "items_count": len(items),
                    "first_item_author": (items[0].get("author") or {}).get("unique_id") if items else None,
                    "has_more": body["data"].get("hasMore"),
                    "cursor": body["data"].get("cursor"),
                }
            else:
                result["feed_search_type0"] = {"http_status": r.status_code, "body_snippet": str(body)[:300]}
        except Exception as e:
            result["feed_search_type0"] = {"error": str(e)}

        # Test 7: feed search type=1 (user)
        try:
            r = await c.get("https://www.tikwm.com/api/feed/search",
                params={"keywords": username, "count": 20, "cursor": 0, "type": 1}, headers=HEADERS)
            body = r.json() if r.status_code == 200 else r.text[:300]
            if isinstance(body, dict) and isinstance(body.get("data"), dict):
                items = body["data"].get("videos") or body["data"].get("data") or []
                result["feed_search_type1"] = {
                    "http_status": r.status_code,
                    "code": body.get("code"),
                    "data_keys": list(body["data"].keys()),
                    "items_count": len(items),
                    "first_item_author": (items[0].get("author") or {}).get("unique_id") if items else None,
                    "has_more": body["data"].get("hasMore"),
                    "cursor": body["data"].get("cursor"),
                }
            else:
                result["feed_search_type1"] = {"http_status": r.status_code, "body_snippet": str(body)[:300]}
        except Exception as e:
            result["feed_search_type1"] = {"error": str(e)}

    # Also run the full _fetch_tiktok_tikwm function (TikWm strategies only)
    try:
        videos = await _fetch_tiktok_tikwm(username)
        result["_fetch_tiktok_tikwm_result"] = {
            "videos_found": len(videos),
            "sample": videos[:2] if videos else [],
        }
    except Exception as e:
        result["_fetch_tiktok_tikwm_result"] = {"error": str(e)}

    # Test TikTok mobile API (uses numeric user_id from user_info)
    user_id_from_info = None
    try:
        ui = result.get("user_info", {})
        if isinstance(ui.get("body"), dict):
            user_id_from_info = ui["body"].get("data", {}).get("user", {}).get("id")
    except Exception:
        pass
    if user_id_from_info:
        try:
            mobile_videos = await _fetch_tiktok_mobile_api(user_id_from_info, username)
            result["mobile_api_result"] = {
                "user_id_used": user_id_from_info,
                "videos_found": len(mobile_videos),
                "sample": mobile_videos[:2] if mobile_videos else [],
            }
        except Exception as e:
            result["mobile_api_result"] = {"user_id_used": user_id_from_info, "error": str(e)}
    else:
        result["mobile_api_result"] = {"skipped": "user_id not available from user_info"}

    # Full pipeline test (TikWm + Mobile API + Playwright + yt-dlp)
    try:
        all_videos = await _fetch_tiktok_videos_async(username, since_days=30, user_id=user_id_from_info)
        result["full_pipeline_result"] = {
            "videos_found": len(all_videos),
            "sample": all_videos[:2] if all_videos else [],
        }
    except Exception as e:
        result["full_pipeline_result"] = {"error": str(e)}

    # Test Playwright directly
    result["playwright_available"] = PLAYWRIGHT_AVAILABLE
    if PLAYWRIGHT_AVAILABLE:
        try:
            scraped = await _scrape_tiktok_playwright(username)
            parsed_vids = _parse_tiktok_videos(scraped)
            result["playwright_result"] = {
                "videos_found": len(parsed_vids),
                "sample": parsed_vids[:2] if parsed_vids else [],
                "raw_keys": list(scraped.keys()) if isinstance(scraped, dict) else type(scraped).__name__,
            }
        except Exception as e:
            result["playwright_result"] = {"error": str(e)[:300]}

    return result


@api_router.get("/debug/instagram/{username}")
async def debug_instagram(username: str):
    """Debug endpoint: tests Instagram verification + video fetching for a public account."""
    username = username.lstrip("@")
    result = {
        "username": username,
        "instaloader_available": INSTALOADER_AVAILABLE,
    }
    # Test 1: Verify account (httpx API + fallbacks)
    try:
        info = await _verify_instagram(username)
        result["verify"] = {
            "status": "success",
            "display_name": info.get("display_name"),
            "follower_count": info.get("follower_count"),
            "avatar_url": info.get("avatar_url"),
        }
    except Exception as e:
        result["verify"] = {"status": "error", "error": str(e)[:200]}
    # Test 2: Fetch videos
    try:
        videos = await _fetch_instagram_videos_async(username, since_days=3650)
        result["videos"] = {
            "count": len(videos),
            "sample": videos[:2] if videos else [],
        }
    except Exception as e:
        result["videos"] = {"error": str(e)[:200]}
    return result


@api_router.get("/debug/youtube/{handle}")
async def debug_youtube(handle: str):
    """Debug endpoint: tests YouTube channel verification + video fetching."""
    result = {
        "handle": handle,
        "youtube_api_key_configured": bool(YOUTUBE_API_KEY),
    }
    if not YOUTUBE_API_KEY:
        result["error"] = "YOUTUBE_API_KEY not configured in Railway env vars. Add it at console.cloud.google.com."
        return result
    # Test 1: Verify channel
    try:
        info = await _verify_youtube(handle)
        result["verify"] = {
            "status": "success",
            "display_name": info.get("display_name"),
            "follower_count": info.get("follower_count"),
            "channel_id": info.get("platform_channel_id"),
        }
        channel_id = info.get("platform_channel_id")
    except Exception as e:
        result["verify"] = {"status": "error", "error": str(e)[:200]}
        channel_id = None
    # Test 2: Fetch videos
    if channel_id:
        try:
            videos = await _fetch_youtube_videos(channel_id, since_days=365)
            result["videos"] = {
                "count": len(videos),
                "sample": videos[:2] if videos else [],
            }
        except Exception as e:
            result["videos"] = {"error": str(e)[:200]}
    return result


@api_router.get("/admin/stats")
async def admin_stats(request: Request, _: bool = Depends(verify_admin_code)):
    users_count = await db.users.count_documents({})
    campaigns_count = await db.campaigns.count_documents({})
    click_campaigns_count = await db.campaigns.count_documents({"payment_model": "clicks"})
    videos_count = await db.tracked_videos.count_documents({})
    accounts_count = await db.social_accounts.count_documents({})
    messages_count = await db.messages.count_documents({})
    members_count = await db.campaign_members.count_documents({})
    # Views earnings
    earnings_agg = await db.earnings.aggregate([{"$group": {"_id": None, "total": {"$sum": "$amount"}}}]).to_list(1)
    total_earnings = earnings_agg[0]["total"] if earnings_agg else 0
    # Click stats (from click_links)
    click_agg = await db.click_links.aggregate([
        {"$group": {"_id": None,
            "total_clicks": {"$sum": "$click_count"},
            "total_unique": {"$sum": "$unique_click_count"},
            "click_earnings": {"$sum": "$earnings"}
        }}
    ]).to_list(1)
    ck = click_agg[0] if click_agg else {}
    # Total views across all tracked_videos
    views_agg = await db.tracked_videos.aggregate([
        {"$group": {"_id": None, "total_views": {"$sum": "$views"}}}
    ]).to_list(1)
    total_views = views_agg[0]["total_views"] if views_agg else 0
    return {
        "users": users_count,
        "campaigns": campaigns_count,
        "click_campaigns": click_campaigns_count,
        "tracked_videos": videos_count,
        "total_views": total_views,
        "social_accounts": accounts_count,
        "messages": messages_count,
        "campaign_members": members_count,
        "total_earnings_eur": round(total_earnings + ck.get("click_earnings", 0), 2),
        "total_clicks": ck.get("total_clicks", 0),
        "total_unique_clicks": ck.get("total_unique", 0),
        "click_earnings_eur": round(ck.get("click_earnings", 0), 2),
    }

@api_router.get("/admin/stats/videos-timeline")
async def admin_videos_timeline(
    request: Request,
    days: int = Query(30, ge=1, le=366),
    _: bool = Depends(verify_admin_code)
):
    """Tracked videos/views timeline. Grouping: hourly (1j), daily (≤90j), monthly (>90j)."""
    from datetime import timedelta
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    timeline = []

    if days == 1:
        # ── Hourly: last 24h ──────────────────────────────────────────────────
        pipeline = [
            {"$match": {"created_at": {"$gte": start.isoformat()}}},
            {"$group": {
                "_id": {"$substr": ["$created_at", 0, 13]},  # "YYYY-MM-DDTHH"
                "count": {"$sum": 1},
                "views": {"$sum": "$views"}
            }},
            {"$sort": {"_id": 1}}
        ]
        results = await db.tracked_videos.aggregate(pipeline).to_list(25)
        data_map = {r["_id"]: r for r in results}
        current = start.replace(minute=0, second=0, microsecond=0)
        while current <= end:
            key = current.strftime("%Y-%m-%dT%H")
            d = data_map.get(key, {})
            timeline.append({"date": current.strftime("%H:00"), "videos": d.get("count", 0), "views": d.get("views", 0)})
            current += timedelta(hours=1)

    elif days <= 90:
        # ── Daily ─────────────────────────────────────────────────────────────
        pipeline = [
            {"$match": {"created_at": {"$gte": start.isoformat()}}},
            {"$group": {
                "_id": {"$substr": ["$created_at", 0, 10]},
                "count": {"$sum": 1},
                "views": {"$sum": "$views"}
            }},
            {"$sort": {"_id": 1}}
        ]
        results = await db.tracked_videos.aggregate(pipeline).to_list(days + 1)
        data_map = {r["_id"]: r for r in results}
        current = start
        while current <= end:
            day = current.strftime("%Y-%m-%d")
            d = data_map.get(day, {})
            timeline.append({"date": day, "videos": d.get("count", 0), "views": d.get("views", 0)})
            current += timedelta(days=1)

    else:
        # ── Monthly: 1 year ───────────────────────────────────────────────────
        pipeline = [
            {"$match": {"created_at": {"$gte": start.isoformat()}}},
            {"$group": {
                "_id": {"$substr": ["$created_at", 0, 7]},  # "YYYY-MM"
                "count": {"$sum": 1},
                "views": {"$sum": "$views"}
            }},
            {"$sort": {"_id": 1}}
        ]
        results = await db.tracked_videos.aggregate(pipeline).to_list(13)
        data_map = {r["_id"]: r for r in results}
        # Generate all 12 (or 13) monthly buckets
        from calendar import monthrange
        current = start.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        while current <= end:
            key = current.strftime("%Y-%m")
            d = data_map.get(key, {})
            timeline.append({"date": key, "videos": d.get("count", 0), "views": d.get("views", 0)})
            # Next month
            days_in_month = monthrange(current.year, current.month)[1]
            current = current + timedelta(days=days_in_month)

    return {"timeline": timeline, "period": days}


@api_router.get("/admin/stats/clicks-timeline")
async def admin_clicks_timeline(
    request: Request,
    days: int = Query(30, ge=1, le=366),
    _: bool = Depends(verify_admin_code)
):
    """Click events timeline. Grouping: hourly (1j), daily (≤90j), monthly (>90j)."""
    from datetime import timedelta as _td
    end = datetime.now(timezone.utc)
    start = end - _td(days=days)
    timeline = []

    if days == 1:
        # ── Hourly ────────────────────────────────────────────────────────────
        pipeline = [
            {"$match": {"clicked_at": {"$gte": start.isoformat()}}},
            {"$group": {
                "_id": {"$substr": ["$clicked_at", 0, 13]},
                "clicks": {"$sum": 1},
                "unique_clicks": {"$sum": {"$cond": ["$is_unique", 1, 0]}}
            }},
            {"$sort": {"_id": 1}}
        ]
        results = await db.click_events.aggregate(pipeline).to_list(25)
        data_map = {r["_id"]: r for r in results}
        current = start.replace(minute=0, second=0, microsecond=0)
        while current <= end:
            key = current.strftime("%Y-%m-%dT%H")
            d = data_map.get(key, {})
            timeline.append({"date": current.strftime("%H:00"), "clicks": d.get("clicks", 0), "unique_clicks": d.get("unique_clicks", 0)})
            current += _td(hours=1)

    elif days <= 90:
        # ── Daily ─────────────────────────────────────────────────────────────
        pipeline = [
            {"$match": {"clicked_at": {"$gte": start.isoformat()}}},
            {"$group": {
                "_id": {"$substr": ["$clicked_at", 0, 10]},
                "clicks": {"$sum": 1},
                "unique_clicks": {"$sum": {"$cond": ["$is_unique", 1, 0]}}
            }},
            {"$sort": {"_id": 1}}
        ]
        results = await db.click_events.aggregate(pipeline).to_list(days + 1)
        data_map = {r["_id"]: r for r in results}
        current = start
        while current <= end:
            day = current.strftime("%Y-%m-%d")
            d = data_map.get(day, {})
            timeline.append({"date": day, "clicks": d.get("clicks", 0), "unique_clicks": d.get("unique_clicks", 0)})
            current += _td(days=1)

    else:
        # ── Monthly ───────────────────────────────────────────────────────────
        pipeline = [
            {"$match": {"clicked_at": {"$gte": start.isoformat()}}},
            {"$group": {
                "_id": {"$substr": ["$clicked_at", 0, 7]},
                "clicks": {"$sum": 1},
                "unique_clicks": {"$sum": {"$cond": ["$is_unique", 1, 0]}}
            }},
            {"$sort": {"_id": 1}}
        ]
        results = await db.click_events.aggregate(pipeline).to_list(13)
        data_map = {r["_id"]: r for r in results}
        from calendar import monthrange
        current = start.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        while current <= end:
            key = current.strftime("%Y-%m")
            d = data_map.get(key, {})
            timeline.append({"date": key, "clicks": d.get("clicks", 0), "unique_clicks": d.get("unique_clicks", 0)})
            days_in_month = monthrange(current.year, current.month)[1]
            current = current + _td(days=days_in_month)

    return {"timeline": timeline, "period": days}

@api_router.get("/admin/campaigns/{campaign_id}/detail")
async def admin_campaign_detail(campaign_id: str, request: Request, _: bool = Depends(verify_admin_code)):
    """Admin: full campaign detail — stats, members, messages."""
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Agency info
    agency = await db.users.find_one({"user_id": campaign.get("agency_id")}, {"_id": 0, "display_name": 1, "name": 1, "email": 1})
    campaign["agency_name"] = (agency or {}).get("display_name") or (agency or {}).get("name", "—")
    campaign["agency_email"] = (agency or {}).get("email", "")

    # Members + user info (batch)
    members = await db.campaign_members.find({"campaign_id": campaign_id}, {"_id": 0}).to_list(200)
    member_ids = [m["user_id"] for m in members]
    user_docs = await db.users.find(
        {"user_id": {"$in": member_ids}},
        {"_id": 0, "user_id": 1, "display_name": 1, "name": 1, "email": 1, "picture": 1, "role": 1}
    ).to_list(200)
    users_map = {u["user_id"]: u for u in user_docs}
    for m in members:
        m["user_info"] = users_map.get(m["user_id"], {})

    # Payment-model–specific stats
    if campaign.get("payment_model") == "clicks":
        links = await db.click_links.find({"campaign_id": campaign_id}, {"_id": 0}).to_list(200)
        # Attach clipper info to each link
        link_clipper_ids = [l.get("clipper_id") for l in links if l.get("clipper_id")]
        link_user_docs = await db.users.find(
            {"user_id": {"$in": link_clipper_ids}},
            {"_id": 0, "user_id": 1, "display_name": 1, "name": 1, "picture": 1}
        ).to_list(200)
        link_users_map = {u["user_id"]: u for u in link_user_docs}
        for lnk in links:
            info = link_users_map.get(lnk.get("clipper_id"), {})
            lnk["clipper_display_name"] = info.get("display_name") or info.get("name") or lnk.get("clipper_name", "?")
            lnk["clipper_picture"] = info.get("picture")
        total_clicks = sum(l.get("click_count", 0) for l in links)
        unique_clicks = sum(l.get("unique_click_count", 0) for l in links)
        earnings = round(sum(l.get("earnings", 0) for l in links), 2)
        campaign["click_stats"] = {
            "total_clicks": total_clicks,
            "unique_clicks": unique_clicks,
            "earnings": earnings,
            "links": links,
            "rate_per_click": campaign.get("rate_per_click", 0),
            "unique_clicks_only": campaign.get("unique_clicks_only", True),
        }
    else:
        agg = await db.tracked_videos.aggregate([
            {"$match": {"campaign_id": campaign_id}},
            {"$group": {"_id": None, "total_views": {"$sum": "$views"}, "video_count": {"$sum": 1}}}
        ]).to_list(1)
        s = agg[0] if agg else {}
        campaign["view_stats"] = {
            "total_views": s.get("total_views", 0),
            "video_count": s.get("video_count", 0),
            "budget_used": round((s.get("total_views", 0) / 1000) * campaign.get("rpm", 0), 2),
        }

    # Last 60 messages
    messages = await db.messages.find(
        {"campaign_id": campaign_id}, {"_id": 0}
    ).sort("created_at", 1).limit(100).to_list(100)
    sender_ids = list({m["sender_id"] for m in messages if m.get("sender_id")})
    sender_docs = await db.users.find(
        {"user_id": {"$in": sender_ids}},
        {"_id": 0, "user_id": 1, "display_name": 1, "name": 1, "picture": 1, "role": 1}
    ).to_list(200)
    senders_map = {u["user_id"]: u for u in sender_docs}
    for msg in messages:
        s = senders_map.get(msg.get("sender_id"), {})
        msg["sender_display_name"] = s.get("display_name") or s.get("name") or msg.get("sender_name", "?")
        msg["sender_picture"] = s.get("picture")
        msg["sender_role_resolved"] = s.get("role") or msg.get("sender_role", "")

    # Tracked videos (top 200 by views)
    tracked_videos = await db.tracked_videos.find(
        {"campaign_id": campaign_id},
        {"_id": 0, "video_id": 1, "url": 1, "title": 1, "platform": 1, "views": 1,
         "likes": 1, "comments": 1, "thumbnail_url": 1, "published_at": 1,
         "earnings": 1, "user_id": 1, "manually_added": 1, "fetched_at": 1}
    ).sort("views", -1).to_list(200)
    vid_user_ids = list({v["user_id"] for v in tracked_videos if v.get("user_id")})
    if vid_user_ids:
        vid_user_docs = await db.users.find(
            {"user_id": {"$in": vid_user_ids}},
            {"_id": 0, "user_id": 1, "display_name": 1, "name": 1}
        ).to_list(200)
        vid_users_map = {u["user_id"]: u for u in vid_user_docs}
        for v in tracked_videos:
            info = vid_users_map.get(v.get("user_id"), {})
            v["clipper_name"] = info.get("display_name") or info.get("name") or "?"
    campaign["tracked_videos"] = tracked_videos

    campaign["members"] = members
    campaign["messages"] = messages
    return campaign

@api_router.post("/admin/campaigns/{campaign_id}/send-message")
async def admin_send_campaign_message(campaign_id: str, request: Request, _: bool = Depends(verify_admin_code)):
    """Admin sends a message into a campaign chat (visible to all members)."""
    body = await request.json()
    content = body.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content requis")
    now = datetime.now(timezone.utc).isoformat()
    msg = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "campaign_id": campaign_id,
        "sender_id": "admin",
        "sender_name": "Admin The Clip Deal",
        "sender_role": "admin",
        "content": content,
        "created_at": now,
        "is_admin": True,
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    # Broadcast to campaign members via WebSocket
    await manager.broadcast_to_campaign(campaign_id, {"type": "new_message", "message": msg})
    return msg

# ─── SUPPORT CHAT ────────────────────────────────────────────────────────────

@api_router.get("/support/messages")
async def get_user_support_messages(user: dict = Depends(get_current_user)):
    """User fetches their support messages with admin."""
    msgs = await db.support_messages.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.support_messages.update_many(
        {"user_id": user["user_id"], "from_admin": True, "read_by_user": False},
        {"$set": {"read_by_user": True}}
    )
    return {"messages": msgs}

@api_router.post("/support/message")
async def send_user_support_message(request: Request, user: dict = Depends(get_current_user)):
    """User sends a message to admin support."""
    body = await request.json()
    content = body.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content required")
    msg = {
        "message_id": f"smsg_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "user_name": user.get("display_name") or user.get("name", "Utilisateur"),
        "user_role": user.get("role", ""),
        "from_admin": False,
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read_by_admin": False,
        "read_by_user": True
    }
    await db.support_messages.insert_one(msg)
    msg.pop("_id", None)

    # Auto-reply on first user message (if no admin reply exists yet)
    uid = user["user_id"]
    user_count = await db.support_messages.count_documents({"user_id": uid, "from_admin": False})
    admin_count = await db.support_messages.count_documents({"user_id": uid, "from_admin": True})
    if user_count == 1 and admin_count == 0:
        auto_reply = {
            "message_id": f"smsg_{uuid.uuid4().hex[:12]}",
            "user_id": uid,
            "user_name": "Support The Clip Deal",
            "user_role": "admin",
            "from_admin": True,
            "content": "L'équipe reviendra vers vous dans les 48 heures à venir.",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "read_by_admin": True,
            "read_by_user": False,
        }
        await db.support_messages.insert_one(auto_reply)

    return msg

@api_router.get("/admin/support/conversations")
async def admin_get_support_conversations(request: Request, _: bool = Depends(verify_admin_code)):
    """Admin: list all users with support messages + unread count."""
    pipeline = [
        {"$sort": {"created_at": 1}},
        {"$group": {
            "_id": "$user_id",
            "user_name": {"$last": "$user_name"},
            "user_role": {"$last": "$user_role"},
            "last_message": {"$last": "$content"},
            "last_from_admin": {"$last": "$from_admin"},
            "last_message_time": {"$last": "$created_at"},
            "unread_count": {"$sum": {"$cond": [
                {"$and": [{"$eq": ["$from_admin", False]}, {"$eq": ["$read_by_admin", False]}]},
                1, 0
            ]}}
        }},
        {"$sort": {"last_message_time": -1}}
    ]
    conversations = await db.support_messages.aggregate(pipeline).to_list(200)
    for conv in conversations:
        u = await db.users.find_one({"user_id": conv["_id"]}, {"_id": 0, "display_name": 1, "name": 1, "email": 1, "role": 1})
        conv["user_info"] = u or {}
        conv["user_id"] = conv.pop("_id")
    return {"conversations": conversations}

@api_router.get("/admin/support/messages/{user_id}")
async def admin_get_support_messages(user_id: str, request: Request, _: bool = Depends(verify_admin_code)):
    """Admin: get all support messages with a specific user."""
    msgs = await db.support_messages.find({"user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    await db.support_messages.update_many(
        {"user_id": user_id, "from_admin": False, "read_by_admin": False},
        {"$set": {"read_by_admin": True}}
    )
    return {"messages": msgs}

@api_router.post("/admin/support/send/{user_id}")
async def admin_send_support_message(user_id: str, request: Request, _: bool = Depends(verify_admin_code)):
    """Admin sends a support message to a user."""
    body = await request.json()
    content = body.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content required")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "display_name": 1, "name": 1, "role": 1})
    msg = {
        "message_id": f"smsg_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "user_name": (target.get("display_name") or target.get("name", "")) if target else "",
        "user_role": target.get("role", "") if target else "",
        "from_admin": True,
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read_by_admin": True,
        "read_by_user": False
    }
    await db.support_messages.insert_one(msg)
    msg.pop("_id", None)
    try:
        await manager.send_to_user(user_id, {"type": "support_message", "content": content, "created_at": msg["created_at"]})
    except Exception:
        pass
    return msg

@api_router.get("/admin/users")
async def admin_list_users(request: Request, _: bool = Depends(verify_admin_code)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(2000)
    return users

@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, request: Request, _: bool = Depends(verify_admin_code)):
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    # Delete all related data
    await db.users.delete_one({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.social_accounts.delete_many({"user_id": user_id})
    await db.campaign_members.delete_many({"user_id": user_id})
    await db.messages.delete_many({"sender_id": user_id})
    await db.earnings.delete_many({"user_id": user_id})
    await db.strikes.delete_many({"user_id": user_id})
    return {"deleted": user_id}

@api_router.post("/admin/users/{user_id}/ban")
async def admin_ban_user(user_id: str, request: Request, _: bool = Depends(verify_admin_code)):
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    await db.users.update_one({"user_id": user_id}, {"$set": {"banned": True}})
    await db.user_sessions.delete_many({"user_id": user_id})
    return {"banned": user_id}

@api_router.delete("/admin/campaigns/{campaign_id}")
async def admin_delete_campaign(campaign_id: str, request: Request, _: bool = Depends(verify_admin_code)):
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    # Notify agency
    agency_id = campaign.get("agency_id")
    if agency_id:
        agency_user = await db.users.find_one({"user_id": agency_id}, {"_id": 0})
        if agency_user:
            notif = {
                "message_id": f"msg_{uuid.uuid4().hex[:12]}",
                "campaign_id": campaign_id,
                "sender_id": "admin",
                "sender_name": "The Clip Deal — Modération",
                "sender_role": "admin",
                "recipient_id": agency_id,
                "content": f"Votre campagne « {campaign.get('name', campaign_id)} » a été retirée par la plateforme The Clip Deal car elle ne respecte pas nos conditions d'utilisation.",
                "message_type": "admin_notice",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.messages.insert_one(notif)
    await db.campaigns.delete_one({"campaign_id": campaign_id})
    await db.campaign_members.delete_many({"campaign_id": campaign_id})
    await db.tracked_videos.delete_many({"campaign_id": campaign_id})
    return {"deleted": campaign_id}

@api_router.delete("/admin/videos/{video_id}")
async def admin_delete_video(video_id: str, request: Request, _: bool = Depends(verify_admin_code)):
    video = await db.tracked_videos.find_one({"video_id": video_id}, {"_id": 0})
    if not video:
        raise HTTPException(status_code=404, detail="Vidéo introuvable")
    # Notify clipper
    clipper_id = video.get("user_id")
    if clipper_id:
        notif = {
            "message_id": f"msg_{uuid.uuid4().hex[:12]}",
            "campaign_id": video.get("campaign_id", ""),
            "sender_id": "admin",
            "sender_name": "The Clip Deal — Modération",
            "sender_role": "admin",
            "recipient_id": clipper_id,
            "content": f"Votre publication a été retirée par la plateforme The Clip Deal car elle ne respecte pas nos conditions d'utilisation.",
            "message_type": "admin_notice",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.messages.insert_one(notif)
    await db.tracked_videos.delete_one({"video_id": video_id})
    return {"deleted": video_id}

@api_router.post("/admin/notify")
async def admin_notify_user(request: Request, _: bool = Depends(verify_admin_code)):
    body = await request.json()
    user_id = body.get("user_id")
    message_content = body.get("message", "Votre contenu a été retiré par la plateforme.")
    campaign_id = body.get("campaign_id", "")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id requis")
    notif = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "campaign_id": campaign_id,
        "sender_id": "admin",
        "sender_name": "The Clip Deal — Modération",
        "sender_role": "admin",
        "recipient_id": user_id,
        "content": message_content,
        "message_type": "admin_notice",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.messages.insert_one(notif)
    await manager.send_to_user(user_id, {"type": "admin_notice", "content": message_content})
    return {"sent": True}

@api_router.delete("/admin/data/all-users")
async def admin_delete_all_users(request: Request, _: bool = Depends(verify_admin_code)):
    # Keep demo accounts and admin markers
    await db.users.delete_many({"email": {"$not": {"$regex": "@demo\\.clipdeal\\.local"}}})
    await db.user_sessions.delete_many({})
    return {"deleted": "all_non_demo_users"}

@api_router.delete("/admin/data/all-campaigns")
async def admin_delete_all_campaigns(request: Request, _: bool = Depends(verify_admin_code)):
    await db.campaigns.delete_many({})
    await db.campaign_members.delete_many({})
    await db.tracked_videos.delete_many({})
    return {"deleted": "all_campaigns"}

@api_router.delete("/admin/data/all-videos")
async def admin_delete_all_videos(request: Request, _: bool = Depends(verify_admin_code)):
    await db.tracked_videos.delete_many({})
    return {"deleted": "all_videos"}

@api_router.delete("/admin/data/simulated-videos")
async def admin_delete_simulated_videos(request: Request, _: bool = Depends(verify_admin_code)):
    """Delete only simulated/fake videos (simulated=True or platform_video_id starts with sim_)."""
    result = await db.tracked_videos.delete_many({
        "$or": [
            {"simulated": True},
            {"platform_video_id": {"$regex": "^sim_"}},
        ]
    })
    return {"deleted": result.deleted_count, "message": f"{result.deleted_count} vidéo(s) simulée(s) supprimée(s)"}

@api_router.get("/admin/debug/instagram/{username}")
async def admin_debug_instagram(username: str, request: Request, _: bool = Depends(verify_admin_code)):
    """
    Debug endpoint : teste Apify + API privée Instagram.
    GET /api/admin/debug/instagram/@username  (Header: X-Admin-Code)
    """
    username = username.lstrip("@")
    result = {
        "username": username,
        "apify_configured": bool(APIFY_TOKEN),
        "session_configured": bool(INSTAGRAM_SESSIONS),
        "endpoints": {},
    }

    # ── 0. Test Apify — démarrage uniquement (sans poll, évite timeout) ──
    if APIFY_TOKEN:
        try:
            actor_id = "apify~instagram-reel-scraper"
            payload = {
                "directUrls": [f"https://www.instagram.com/{username}/reels/"],
                "resultsType": "posts",
                "resultsLimit": 10,
            }
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.post(
                    f"https://api.apify.com/v2/acts/{actor_id}/runs",
                    params={"token": APIFY_TOKEN},
                    json=payload,
                )
            if r.status_code in (200, 201):
                run_data = r.json().get("data", r.json())
                run_id = run_data.get("id")
                dataset_id = run_data.get("defaultDatasetId")
                result["endpoints"]["apify"] = {
                    "status": "RUN_STARTED",
                    "run_id": run_id,
                    "dataset_id": dataset_id,
                    "check_url": f"https://api.apify.com/v2/actor-runs/{run_id}?token={APIFY_TOKEN}",
                    "dataset_url": f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={APIFY_TOKEN}&clean=true",
                    "note": "Attendez 2-3 min puis ouvrez dataset_url dans le navigateur",
                }
            else:
                result["endpoints"]["apify"] = {
                    "status": f"HTTP {r.status_code}",
                    "body": r.text[:300],
                }
        except Exception as e:
            result["endpoints"]["apify"] = {"status": f"ERROR: {e}"}
    else:
        result["endpoints"]["apify"] = {"status": "SKIP — APIFY_TOKEN non configuré"}

    if not INSTAGRAM_SESSIONS:
        return result

    if not INSTAGRAM_SESSIONS:
        return {"error": "INSTAGRAM_SESSION_IDS non configuré", **result}

    session = _get_instagram_session()
    headers_android = _ig_headers_android(session)

    # 1. web_profile_info — récupérer user_id
    try:
        profile_data = await _scrape_instagram_api(username)
        user_node = profile_data.get("data", {}).get("user", {})
        uid = user_node.get("id") or user_node.get("pk")
        result["user_id"] = uid
        result["follower_count"] = user_node.get("edge_followed_by", {}).get("count")
        result["endpoints"]["web_profile_info"] = "OK"
    except Exception as e:
        result["endpoints"]["web_profile_info"] = f"ERROR: {e}"
        return result

    if not uid:
        return {**result, "error": "user_id introuvable dans web_profile_info"}

    # 2. Feed endpoint — premier item brut
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            r = await c.get(
                f"https://i.instagram.com/api/v1/feed/user/{uid}/",
                headers=headers_android, params={"count": 3}
            )
        feed_data = r.json()
        items = feed_data.get("items", [])
        result["endpoints"]["feed"] = {
            "status": r.status_code,
            "total_items": len(items),
            "sample_item_keys": list(items[0].keys()) if items else [],
            "sample_stats": {k: items[0].get(k) for k in ["media_type","play_count","video_view_count","view_count","like_count","comment_count","clips_metadata"] if items} if items else {},
        }
    except Exception as e:
        result["endpoints"]["feed"] = f"ERROR: {e}"

    # 3. Clips/Reels endpoint — premier item brut
    try:
        hdrs = {**headers_android, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"}
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            r = await c.post(
                "https://i.instagram.com/api/v1/clips/user/",
                headers=hdrs,
                content=f"target_user_id={uid}&page_size=3&include_feed_video=true".encode()
            )
        clips_data = r.json()
        items = clips_data.get("items", [])
        first_media = items[0].get("media", items[0]) if items else {}
        result["endpoints"]["clips_reels"] = {
            "status": r.status_code,
            "total_items": len(items),
            "sample_media_keys": list(first_media.keys()) if first_media else [],
            "sample_stats": {k: first_media.get(k) for k in ["media_type","play_count","video_view_count","view_count","like_count","comment_count"]} if first_media else {},
        }
    except Exception as e:
        result["endpoints"]["clips_reels"] = f"ERROR: {e}"

    return result


@api_router.post("/admin/demo-login/{role}")
async def admin_demo_login(role: str, request: Request, _: bool = Depends(verify_admin_code)):
    """Create a demo session for a given role — used by admin previews."""
    if role not in ["clipper", "agency", "manager", "client"]:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    demo_names = {"clipper": "Demo Clippeur", "agency": "Demo Agence", "manager": "Demo Manager", "client": "Demo Client"}
    demo_emails = {
        "clipper": "clipper@demo.clipdeal.local",
        "agency": "agency@demo.clipdeal.local",
        "manager": "manager@demo.clipdeal.local",
        "client": "client@demo.clipdeal.local",
    }
    email = demo_emails[role]
    display_name = demo_names[role]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
    else:
        user_id = f"demo_{role}_{uuid.uuid4().hex[:8]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": display_name, "picture": None,
            "role": role, "display_name": display_name,
            "created_at": datetime.now(timezone.utc).isoformat(), "settings": {}
        })
    session_token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    # Set cookie so the preview tab is auto-authenticated
    is_prod = os.environ.get("RAILWAY_ENVIRONMENT") == "production"
    resp = Response(
        content=json.dumps({"session_token": session_token, "role": role, "user_id": user_id}),
        media_type="application/json"
    )
    resp.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=is_prod, samesite="lax",
        path="/", max_age=24 * 60 * 60
    )
    return resp

@api_router.get("/admin/api-usage")
async def admin_api_usage(request: Request, _: bool = Depends(verify_admin_code)):
    """Return API usage stats aggregated by hour / day / week / month for each service."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    hour = now.hour
    week_ago  = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    month_ago = (now - timedelta(days=30)).strftime("%Y-%m-%d")

    services = [
        {"key": "youtube",   "label": "YouTube Data API",       "free_limit": "10 000 req/jour"},
        {"key": "apify",     "label": "Apify (TikTok + Insta)", "free_limit": "$5/mois inclus"},
        {"key": "resend",    "label": "Resend (Emails)",        "free_limit": "3 000 emails/mois"},
    ]

    result = {}
    for svc in services:
        key = svc["key"]

        # Cette heure
        doc_hour = await db.api_usage.find_one(
            {"service": key, "date": today, "hour": hour}, {"_id": 0}
        )

        # Aujourd'hui
        agg_today = await db.api_usage.aggregate([
            {"$match": {"service": key, "date": today}},
            {"$group": {"_id": None, "calls": {"$sum": "$calls"}, "errors": {"$sum": "$errors"}}}
        ]).to_list(1)

        # 7 derniers jours
        agg_week = await db.api_usage.aggregate([
            {"$match": {"service": key, "date": {"$gte": week_ago}}},
            {"$group": {"_id": None, "calls": {"$sum": "$calls"}, "errors": {"$sum": "$errors"}}}
        ]).to_list(1)

        # 30 derniers jours
        agg_month = await db.api_usage.aggregate([
            {"$match": {"service": key, "date": {"$gte": month_ago}}},
            {"$group": {"_id": None, "calls": {"$sum": "$calls"}, "errors": {"$sum": "$errors"}}}
        ]).to_list(1)

        # Historique 24h par heure (pour mini-graphe)
        yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        hourly_docs = await db.api_usage.find(
            {"service": key, "date": {"$gte": yesterday}},
            {"_id": 0, "date": 1, "hour": 1, "calls": 1, "errors": 1}
        ).sort([("date", 1), ("hour", 1)]).to_list(50)

        calls_today  = agg_today[0]["calls"]  if agg_today  else 0
        errors_today = agg_today[0]["errors"] if agg_today  else 0
        calls_week   = agg_week[0]["calls"]   if agg_week   else 0
        calls_month  = agg_month[0]["calls"]  if agg_month  else 0

        result[key] = {
            "label":        svc["label"],
            "free_limit":   svc["free_limit"],
            "this_hour":    (doc_hour or {}).get("calls", 0),
            "errors_hour":  (doc_hour or {}).get("errors", 0),
            "today":        calls_today,
            "errors_today": errors_today,
            "success_rate": round((1 - errors_today / calls_today) * 100, 1) if calls_today > 0 else 100.0,
            "week":         calls_week,
            "month":        calls_month,
            "hourly":       hourly_docs,
        }

    return {"services": result, "fetched_at": now.isoformat()}


@api_router.post("/admin/reset-click-stats")
async def admin_reset_click_stats(request: Request, body: dict, _: bool = Depends(verify_admin_code)):
    """RESET les click_events + counters click_links. Utile pour purger les clics de test."""
    campaign_id = (body.get("campaign_id") or "").strip()  # vide = TOUTES les campagnes
    confirm = body.get("confirm") == "RESET_ALL_CLICKS"
    if not confirm:
        raise HTTPException(status_code=400, detail='confirm="RESET_ALL_CLICKS" requis')
    filter_q = {"campaign_id": campaign_id} if campaign_id else {}
    res_events = await db.click_events.delete_many(filter_q)
    res_dedup = await db.click_dedup.delete_many({})  # purge tout dedup (cohérent avec events purgés)
    # Reset les counters sur click_links
    update_q = {"campaign_id": campaign_id} if campaign_id else {}
    res_links = await db.click_links.update_many(update_q, {
        "$set": {"click_count": 0, "unique_click_count": 0, "earnings": 0}
    })
    return {
        "deleted_click_events": res_events.deleted_count,
        "deleted_dedup_entries": res_dedup.deleted_count,
        "reset_click_links": res_links.modified_count,
        "scope": "all_campaigns" if not campaign_id else f"campaign_{campaign_id}",
    }


@api_router.get("/admin/click-stats-detail")
async def admin_click_stats_detail(request: Request, _: bool = Depends(verify_admin_code)):
    """Detail des stats clicks par campagne pour debug : nb clics, nb unique, tarif, earnings calcules."""
    pipeline = [
        {"$group": {
            "_id": "$campaign_id",
            "total_clicks": {"$sum": "$click_count"},
            "total_unique": {"$sum": "$unique_click_count"},
            "total_earnings": {"$sum": "$earnings"},
            "nb_links": {"$sum": 1},
        }},
        {"$sort": {"total_earnings": -1}},
        {"$limit": 50},
    ]
    by_campaign = await db.click_links.aggregate(pipeline).to_list(50)
    # Enrich avec nom + tarif
    cids = [d["_id"] for d in by_campaign if d.get("_id")]
    campaigns = await db.campaigns.find({"campaign_id": {"$in": cids}}, {"_id": 0, "campaign_id": 1, "name": 1, "rate_per_click": 1}).to_list(len(cids))
    cmap = {c["campaign_id"]: c for c in campaigns}
    out = []
    grand_total_clicks = 0
    grand_total_earnings = 0
    for d in by_campaign:
        cid = d.get("_id")
        cam = cmap.get(cid, {})
        out.append({
            "campaign_id": cid,
            "campaign_name": cam.get("name", "?"),
            "rate_per_1k_clicks_eur": cam.get("rate_per_click", 0),
            "total_clicks": d.get("total_clicks", 0),
            "total_unique_clicks": d.get("total_unique", 0),
            "total_earnings_eur": round(d.get("total_earnings", 0), 2),
            "nb_links": d.get("nb_links", 0),
        })
        grand_total_clicks += d.get("total_clicks", 0)
        grand_total_earnings += d.get("total_earnings", 0)
    return {
        "by_campaign": out,
        "grand_total_clicks": grand_total_clicks,
        "grand_total_earnings_eur": round(grand_total_earnings, 2),
        "explanation": "Formule : earnings = (clics / 1000) × tarif_par_1K_clics. Si total semble anormal, verifier nb_links et tarifs.",
    }


@api_router.get("/admin/usage-monitor")
async def admin_usage_monitor(request: Request, _: bool = Depends(verify_admin_code)):
    """Suivi capacite et utilisation des APIs - dis a l'agence quand upgrader."""
    import time
    result = {"timestamp": datetime.now(timezone.utc).isoformat(), "services": {}, "recommendations": []}

    # Compte les clippeurs actifs (estime la conso)
    try:
        active_clippers = await db.campaign_members.count_documents({"role": "clipper", "status": "active"})
        active_campaigns = await db.campaigns.count_documents({"status": "active"})
        total_videos = await db.tracked_videos.count_documents({})
        result["clippers_active"] = active_clippers
        result["campaigns_active"] = active_campaigns
        result["total_videos_tracked"] = total_videos
    except Exception as e:
        logger.warning(f"usage-monitor counts error: {e}")
        result["clippers_active"] = 0

    # === ClipScraper VPS ===
    cs_status = {"name": "Scraper VPS Hostinger", "cost_per_month_eur": 5}
    if CLIP_SCRAPER_URL:
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                r = await c.get(f"{CLIP_SCRAPER_URL}/health")
            if r.status_code == 200:
                d = r.json()
                cs_status["status"] = "ok"
                cs_status["uptime_hours"] = round(d.get("uptime_seconds", 0) / 3600, 1)
                cs_status["concurrent_max"] = d.get("concurrent_max", 4)
                cs_status["concurrent_now"] = d.get("concurrent_active", 0)
                cs_status["proxy"] = d.get("proxy", "unknown")
                # Capacite : ~700 clippeurs sur KVM 2 (8GB RAM)
                cs_status["capacity_clippers"] = 700
                cs_status["percent_used"] = min(100, round((result.get("clippers_active", 0) / 700) * 100))
            else:
                cs_status["status"] = "error"
        except Exception as e:
            cs_status["status"] = "error"
            cs_status["error"] = str(e)[:200]
    else:
        cs_status["status"] = "not_configured"
    result["services"]["scraper_vps"] = cs_status

    # === Webshare proxy (estime via bandwidth tracker - sans appel API direct on a pas) ===
    ws_status = {"name": "Webshare proxy 20 IPs", "cost_per_month_eur": 11, "ip_count": 20}
    # Estimation : ~3 scrapes/clippeur/jour * 1MB = 3MB/jour/clippeur. 30j -> 90MB/clippeur/mois
    estimated_gb_used = (result.get("clippers_active", 0) * 90) / 1024
    ws_status["bandwidth_estimated_gb"] = round(estimated_gb_used, 1)
    ws_status["bandwidth_total_gb"] = 250
    ws_status["percent_used"] = min(100, round((estimated_gb_used / 250) * 100))
    # Capacite IPs : ~30 req/IP/jour safe -> 20 IPs * 30 = 600 req/jour = 200 clippeurs (3 scrapes/jour)
    ws_status["capacity_clippers"] = 200
    ws_status["percent_clippers"] = min(100, round((result.get("clippers_active", 0) / 200) * 100))
    ws_status["status"] = "ok"
    result["services"]["webshare"] = ws_status

    # === Apify (backup, devrait etre minimal) ===
    apify_status = {"name": "Apify (backup uniquement)", "cost_per_month_eur": 0, "free_credit_eur": 5}
    if APIFY_TOKEN:
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get("https://api.apify.com/v2/users/me", params={"token": APIFY_TOKEN})
                r2 = await c.get("https://api.apify.com/v2/users/me/usage/monthly", params={"token": APIFY_TOKEN})
            if r.status_code == 200 and r2.status_code == 200:
                d2 = r2.json().get("data", {})
                # Compute total monthly cost
                total_cost = 0
                for k, v in (d2.get("monthlyServiceUsage") or {}).items():
                    total_cost += v.get("baseAmountUsd", 0)
                apify_status["status"] = "ok"
                apify_status["monthly_usage_usd"] = round(total_cost, 4)
                apify_status["monthly_credit_usd"] = 5
                apify_status["percent_used"] = min(100, round((total_cost / 5) * 100))
                if total_cost > 4:
                    result["recommendations"].append(
                        f"Apify : tu as utilise ${total_cost:.2f}/$5 gratuit ce mois. "
                        "Trop d'appels Apify -> verifie pourquoi le scraper VPS ne prend pas le relais."
                    )
            else:
                apify_status["status"] = "error"
        except Exception as e:
            apify_status["status"] = "error"
            apify_status["error"] = str(e)[:200]
    else:
        apify_status["status"] = "not_configured"
    result["services"]["apify"] = apify_status

    # === YouTube API (gratuit 10k/jour) ===
    yt_status = {"name": "YouTube Data API (gratuit)", "cost_per_month_eur": 0,
                 "quota_per_day": 10000, "quota_used_estimated": result.get("clippers_active", 0) * 3,
                 "percent_used": min(100, round((result.get("clippers_active", 0) * 3 / 10000) * 100))}
    yt_status["status"] = "ok" if YOUTUBE_API_KEY else "not_configured"
    result["services"]["youtube_api"] = yt_status

    # === Resend ===
    resend_key = os.environ.get('RESEND_API_KEY', '').strip()
    resend_status = {"name": "Resend (emails)", "cost_per_month_eur": 0,
                     "limit_per_day": 100, "limit_per_month": 3000}
    if resend_key:
        resend_status["status"] = "ok"
        # Estimation : 1 email/nouveau signup
        resend_status["percent_used"] = "?"
    else:
        resend_status["status"] = "not_configured"
    result["services"]["resend"] = resend_status

    # === Railway (backend hosting) ===
    result["services"]["railway"] = {
        "name": "Railway (backend + frontend + MongoDB)",
        "cost_per_month_eur": 10,  # estimation Hobby
        "status": "ok",
        "capacity_clippers": 200,  # Hobby plan ~200 clippeurs
        "percent_used": min(100, round((result.get("clippers_active", 0) / 200) * 100)),
    }

    # === RECOMMANDATIONS ===
    nb_clippers = result.get("clippers_active", 0)
    if nb_clippers >= 200:
        result["recommendations"].append(
            f"⚠️ {nb_clippers} clippeurs actifs - tu approches la limite Webshare 20 IPs (200 max). "
            "Upgrade a 50 IPs ($30/mois) sur webshare.io."
        )
    if nb_clippers >= 180:
        result["recommendations"].append(
            f"⚠️ Railway Hobby plan limite ~200 clippeurs. "
            "Passe en Pro (20€/mois) sur railway.app pour eviter les ralentissements."
        )
    if nb_clippers >= 600:
        result["recommendations"].append(
            f"⚠️ Tu approches la limite VPS Hostinger KVM 2 (700 clippeurs). "
            "Ajoute un 2eme VPS (5€/mois) ou upgrade vers KVM 4 (15€/mois)."
        )
    if not result["recommendations"]:
        result["recommendations"].append(f"✅ Tout est OK pour {nb_clippers} clippeurs actifs - aucune action necessaire.")

    # Cout total mensuel estime
    result["total_monthly_cost_eur"] = sum(
        s.get("cost_per_month_eur", 0) for s in result["services"].values()
    )

    return result


@api_router.post("/admin/test-fetch-video")
async def admin_test_fetch_video(request: Request, body: dict, _: bool = Depends(verify_admin_code)):
    """Diagnostic : test fetch_single_video_by_url avec une URL et retourne le résultat brut + détection plateforme."""
    url = (body.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    # Auto-detect platform
    if "tiktok.com" in url:
        platform = "tiktok"
    elif "youtube.com" in url or "youtu.be" in url:
        platform = "youtube"
    elif "instagram.com" in url:
        platform = "instagram"
    else:
        return {"error": "platform not detected from URL"}
    try:
        result = await fetch_single_video_by_url(url, platform)
        return {
            "platform": platform,
            "url": url,
            "result": result,
            "diagnosis": {
                "views_found": (result.get("views") or 0) > 0,
                "title_found": bool(result.get("title")),
                "thumbnail_found": bool(result.get("thumbnail_url")),
                "apify_token_set": bool(APIFY_TOKEN),
                "youtube_key_set": bool(YOUTUBE_API_KEY),
                "clip_scraper_set": bool(CLIP_SCRAPER_URL and CLIP_SCRAPER_KEY),
                "backend_proxy_set": bool(BACKEND_PROXY_URL),
            }
        }
    except Exception as e:
        return {"platform": platform, "url": url, "error": f"{type(e).__name__}: {e}"}


@api_router.get("/admin/api-status")
async def admin_api_status(request: Request, _: bool = Depends(verify_admin_code)):
    """Test all API connections in parallel and return status."""
    import time

    async def test_mongodb():
        t = time.time()
        try:
            await db.command("ping")
            return {"status": "ok", "latency_ms": round((time.time() - t) * 1000)}
        except Exception as e:
            return {"status": "error", "error": str(e), "latency_ms": round((time.time() - t) * 1000)}

    async def test_youtube():
        t = time.time()
        if not YOUTUBE_API_KEY:
            return {"status": "not_configured", "error": "YOUTUBE_API_KEY manquante"}
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(
                    "https://www.googleapis.com/youtube/v3/channels",
                    params={"part": "snippet", "id": "UC_x5XG1OV2P6uZZ5FSM9Ttw", "key": YOUTUBE_API_KEY}
                )
            if r.status_code == 200:
                return {"status": "ok", "latency_ms": round((time.time() - t) * 1000)}
            return {"status": "error", "error": f"HTTP {r.status_code}", "latency_ms": round((time.time() - t) * 1000)}
        except Exception as e:
            return {"status": "error", "error": str(e), "latency_ms": round((time.time() - t) * 1000)}

    async def test_apify():
        t = time.time()
        if not APIFY_TOKEN:
            return {"status": "not_configured", "error": "APIFY_TOKEN manquant"}
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(
                    "https://api.apify.com/v2/users/me",
                    params={"token": APIFY_TOKEN}
                )
            if r.status_code == 200:
                data = r.json().get("data", {})
                plan = data.get("plan", {}).get("id", "unknown")
                usage_usd = data.get("monthlyUsage", {}).get("ACTOR_COMPUTE_UNITS", 0)
                limit_usd = data.get("plan", {}).get("monthlyActorComputeUnits", 0)
                return {
                    "status": "ok",
                    "latency_ms": round((time.time() - t) * 1000),
                    "plan": plan,
                    "usage_usd": round(usage_usd, 3),
                    "limit_usd": round(limit_usd, 3),
                }
            return {"status": "error", "error": f"HTTP {r.status_code}", "latency_ms": round((time.time() - t) * 1000)}
        except Exception as e:
            return {"status": "error", "error": str(e)[:100], "latency_ms": round((time.time() - t) * 1000)}

    async def test_stripe():
        t = time.time()
        if STRIPE_API_KEY == "sk_test_placeholder" or not STRIPE_API_KEY:
            return {"status": "not_configured", "error": "Clé Stripe non configurée"}
        try:
            import stripe as stripe_mod
            stripe_mod.api_key = STRIPE_API_KEY
            stripe_mod.Balance.retrieve()
            return {"status": "ok", "latency_ms": round((time.time() - t) * 1000)}
        except Exception as e:
            return {"status": "error", "error": str(e)[:100], "latency_ms": round((time.time() - t) * 1000)}

    async def test_google_oauth():
        t = time.time()
        if not GOOGLE_CLIENT_ID:
            return {"status": "not_configured", "error": "GOOGLE_CLIENT_ID manquant"}
        if not GOOGLE_AUTH_AVAILABLE:
            return {"status": "not_installed", "error": "google-auth non installé"}
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get("https://oauth2.googleapis.com/tokeninfo?id_token=test")
            # A 400 means the endpoint is reachable (invalid token is expected)
            if r.status_code in (200, 400):
                return {"status": "ok", "latency_ms": round((time.time() - t) * 1000)}
            return {"status": "error", "error": f"HTTP {r.status_code}", "latency_ms": round((time.time() - t) * 1000)}
        except Exception as e:
            return {"status": "error", "error": str(e), "latency_ms": round((time.time() - t) * 1000)}

    async def test_clipscraper():
        t = time.time()
        if not CLIP_SCRAPER_URL:
            return {"status": "not_configured", "error": "CLIP_SCRAPER_URL non configuré (déploie le service clip-scraper)"}
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(f"{CLIP_SCRAPER_URL}/health")
            if r.status_code == 200:
                data = r.json()
                return {
                    "status": "ok",
                    "latency_ms": round((time.time() - t) * 1000),
                    "version": data.get("version", "unknown"),
                    "cache_size": data.get("cache_size", 0),
                    "url": CLIP_SCRAPER_URL,
                }
            return {"status": "error", "error": f"HTTP {r.status_code}", "latency_ms": round((time.time() - t) * 1000)}
        except Exception as e:
            return {"status": "error", "error": str(e)[:150], "latency_ms": round((time.time() - t) * 1000)}

    results = await asyncio.gather(
        test_mongodb(), test_youtube(), test_apify(), test_stripe(), test_google_oauth(), test_clipscraper(),
        return_exceptions=False
    )
    return {
        "mongodb": results[0],
        "youtube_api": results[1],
        "apify": results[2],
        "stripe": results[3],
        "google_oauth": results[4],
        "clipscraper": results[5],
        "env_summary": {
            "CLIP_SCRAPER_URL": CLIP_SCRAPER_URL or "(non défini)",
            "CLIP_SCRAPER_KEY": "***configurée***" if CLIP_SCRAPER_KEY else "(non défini)",
            "APIFY_TOKEN": "***configurée***" if APIFY_TOKEN else "(non défini)",
            "YOUTUBE_API_KEY": "***configurée***" if YOUTUBE_API_KEY else "(non défini)",
            "RESEND_API_KEY": "***configurée***" if (os.environ.get('RESEND_API_KEY') or '').strip() else "(non défini)",
            "INSTAGRAM_SESSIONS": f"{len(INSTAGRAM_SESSIONS)} cookie(s)" if INSTAGRAM_SESSIONS else "(non défini)",
        },
        "checked_at": datetime.now(timezone.utc).isoformat()
    }

@api_router.get("/admin/campaigns")
async def admin_list_campaigns(request: Request, _: bool = Depends(verify_admin_code)):
    campaigns = await db.campaigns.find({}, {"_id": 0}).to_list(1000)
    return campaigns

@api_router.get("/admin/videos")
async def admin_list_videos(request: Request, _: bool = Depends(verify_admin_code)):
    videos = await db.tracked_videos.find({}, {"_id": 0}).to_list(2000)
    return videos

@api_router.get("/admin/posts")
async def admin_get_posts(request: Request, _: bool = Depends(verify_admin_code)):
    posts = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for p in posts:
        agency = await db.users.find_one({"user_id": p.get("agency_id")}, {"_id": 0, "display_name": 1})
        p["agency_name"] = agency.get("display_name") if agency else "—"
    return posts

@api_router.delete("/admin/posts/{post_id}")
async def admin_delete_post(post_id: str, request: Request, _: bool = Depends(verify_admin_code)):
    result = await db.announcements.delete_one({"announcement_id": post_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Post introuvable")
    return {"message": "Post supprimé"}

@api_router.get("/admin/all-campaigns")
async def admin_get_all_campaigns(request: Request, _: bool = Depends(verify_admin_code)):
    campaigns = await db.campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Batch agency names + member counts (2 queries instead of N×2)
    agency_ids = list({c.get("agency_id") for c in campaigns if c.get("agency_id")})
    agency_docs = await db.users.find(
        {"user_id": {"$in": agency_ids}},
        {"_id": 0, "user_id": 1, "display_name": 1, "name": 1}
    ).to_list(500)
    agency_map = {a["user_id"]: (a.get("display_name") or a.get("name", "—")) for a in agency_docs}
    # Member counts via aggregation
    cids = [c["campaign_id"] for c in campaigns]
    member_agg = await db.campaign_members.aggregate([
        {"$match": {"campaign_id": {"$in": cids}}},
        {"$group": {"_id": "$campaign_id", "count": {"$sum": 1}}}
    ]).to_list(500)
    member_counts = {m["_id"]: m["count"] for m in member_agg}
    for c in campaigns:
        c["agency_name"] = agency_map.get(c.get("agency_id"), "—")
        c["member_count"] = member_counts.get(c["campaign_id"], 0)
    return campaigns

# ================= HEALTH & ROOT =================

@api_router.get("/")
async def root():
    return {"message": "The Clip Deal Track API"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}


@api_router.get("/proxy-image")
async def proxy_image(url: str):
    """
    Proxy les images externes (Instagram CDN, TikTok, etc.) pour éviter les
    restrictions CORS et les URLs expirantes côté navigateur.
    """
    if not url:
        raise HTTPException(status_code=400, detail="url requis")
    # Sécurité : n'autoriser que les CDNs connus
    allowed = (
        "cdninstagram.com", "fbcdn.net", "instagram.com",
        "tiktokcdn.com", "tiktok.com", "p16-sign",
        "googleusercontent.com", "ytimg.com", "ggpht.com",
        "apify.com", "storage.apify.com",
    )
    if not any(d in url for d in allowed):
        raise HTTPException(status_code=403, detail="Domaine non autorisé")
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
            "Referer": "https://www.instagram.com/",
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        }
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            r = await c.get(url, headers=headers)
        if r.status_code != 200:
            raise HTTPException(status_code=404, detail=f"Image non trouvée (HTTP {r.status_code})")
        content_type = r.headers.get("content-type", "image/jpeg")
        return Response(
            content=r.content,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

@api_router.get("/tracking-status")
async def tracking_status():
    """Public endpoint: returns which platforms have full automatic tracking configured."""
    return {
        "tiktok": {
            "full_auto": bool(TIKWM_API_KEY),
            "method": "TikWm API (full)" if TIKWM_API_KEY else "TikWm search (partial ~2-3 videos) + manual URL",
            "note": None if TIKWM_API_KEY else "Add TIKWM_API_KEY in Railway env vars (free at tikwm.com) for full auto tracking",
        },
        "youtube": {
            "full_auto": bool(YOUTUBE_API_KEY),
            "method": "YouTube Data API v3" if YOUTUBE_API_KEY else "Not configured",
            "note": None if YOUTUBE_API_KEY else "Add YOUTUBE_API_KEY in Railway env vars (free at console.cloud.google.com)",
        },
        "instagram": {
            "full_auto": False,
            "method": "Unavailable (Railway datacenter IPs blocked by Instagram)",
            "note": "Instagram blocks automated scraping from cloud servers. No workaround without residential proxies.",
        },
    }

# ================= CLICK TRACKING =================

def _hash_ip(ip: str) -> str:
    """Hash an IP address with salt — never store raw IPs (GDPR)."""
    return hashlib.sha256(f"{CLICK_SALT}:{ip}".encode()).hexdigest()

def _gen_short_code() -> str:
    """Generate an 8-char alphanumeric short code."""
    alphabet = "abcdefghijkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))

async def _record_click_async(link_id: str, short_code: str, campaign_id: str,
                               clipper_id: str, ip_hash: str, user_agent: str,
                               referrer: str, rate_per_click: float, unique_only: bool,
                               click_billing_mode: str = "unique_24h"):
    """Fire-and-forget: record click event + update counters + recalc earnings.
    click_billing_mode:
      "all"              = tous les clics facturés, pas de dédup
      "unique_24h"       = 1 unique par IP / 24h (rolling window)
      "unique_lifetime"  = 1 unique par IP pour toute la campagne
    """
    try:
        now = datetime.now(timezone.utc).isoformat()

        # Deduplication via atomic upsert on click_dedup collection (race-condition safe)
        # Uses unique index on _dedup_key (created at startup)
        if click_billing_mode == "all":
            # No dedup — every click is unique for billing
            is_unique = True
        else:
            # Bucket: lifetime OR daily for unique_24h (approximates rolling 24h)
            if click_billing_mode == "unique_lifetime":
                bucket = "lifetime"
            else:
                bucket = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            dedup_key = f"{link_id}:{ip_hash}:{bucket}"
            try:
                result = await db.click_dedup.update_one(
                    {"_dedup_key": dedup_key},
                    {"$setOnInsert": {"first_at": now, "link_id": link_id, "bucket": bucket}},
                    upsert=True
                )
                is_unique = result.upserted_id is not None
            except Exception as e:
                # Fallback to non-atomic check if upsert fails (e.g. duplicate key collision before index ready)
                logger.warning(f"click_dedup upsert error, fallback to find_one: {e}")
                existing = await db.click_dedup.find_one({"_dedup_key": dedup_key})
                is_unique = existing is None

        # Insert click event
        await db.click_events.insert_one({
            "event_id": f"clk_{uuid.uuid4().hex[:12]}",
            "link_id": link_id,
            "short_code": short_code,
            "campaign_id": campaign_id,
            "clipper_id": clipper_id,
            "ip_hash": ip_hash,
            "user_agent": user_agent[:300] if user_agent else "",
            "referrer": referrer[:500] if referrer else "",
            "is_unique": is_unique,
            "clicked_at": now,
        })

        # Increment counters on the link
        inc_fields = {"click_count": 1}
        if is_unique:
            inc_fields["unique_click_count"] = 1
        await db.click_links.update_one(
            {"link_id": link_id},
            {"$inc": inc_fields, "$set": {"last_clicked_at": now}}
        )

        # Recalculate earnings on the link
        link = await db.click_links.find_one({"link_id": link_id}, {"_id": 0})
        if link:
            billable = link["unique_click_count"] if unique_only else link["click_count"]
            earnings = round((billable / 1000) * rate_per_click, 4)  # tarif par 1000 clics
            await db.click_links.update_one({"link_id": link_id}, {"$set": {"earnings": earnings}})
    except Exception as e:
        logger.warning(f"Click record error for {link_id}: {e}")

_IN_APP_UA_SIGNATURES = [
    "TikTok", "BytedanceWebview", "musical_ly", "aweme",      # TikTok
    "Instagram",                                                # Instagram
    "FBAN", "FBAV", "FB_IAB", "FB4A",                         # Facebook
    "GSA",                                                      # Google (YouTube app iOS)
    "Line/",                                                    # LINE
    "Snapchat",                                                 # Snapchat
]

def _is_inapp_browser(ua: str) -> bool:
    return any(sig.lower() in ua.lower() for sig in _IN_APP_UA_SIGNATURES)

def _build_breakout_page(destination: str) -> str:
    """HTML minimaliste : tente d'ouvrir dans le navigateur système, sinon retombe direct sur la destination.
    Aucun bouton 'copier', aucune instruction utilisateur — silencieux.
    """
    dest_safe = destination.replace('"', "&quot;").replace("'", "&#39;").replace("<", "&lt;")
    dest_no_proto = destination.replace("https://", "").replace("http://", "")
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirection…</title>
  <style>
    html,body{{margin:0;padding:0;background:#0d0d0d;color:#fff;height:100%;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      display:flex;align-items:center;justify-content:center;flex-direction:column}}
    .spinner{{width:34px;height:34px;border:3px solid rgba(255,255,255,.12);
      border-top-color:#f0c040;border-radius:50%;animation:spin .8s linear infinite}}
    @keyframes spin{{to{{transform:rotate(360deg)}}}}
    p{{margin-top:16px;font-size:13px;color:rgba(255,255,255,.4)}}
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>Redirection…</p>
  <script>
    var dest = "{dest_safe}";
    var destNoProto = "{dest_no_proto}";
    var ua = navigator.userAgent || '';

    var isIOS     = /iPhone|iPad|iPod/.test(ua);
    var isAndroid = /Android/.test(ua);
    var isTikTok  = /TikTok|BytedanceWebview|musical_ly|aweme/i.test(ua);
    var isInstagram = /Instagram/i.test(ua);
    var isFacebook  = /FBAN|FBAV|FB_IAB|FB4A/i.test(ua);
    var isLine      = /Line\\//i.test(ua);
    var isSnap      = /Snapchat/i.test(ua);
    var isInApp = isTikTok || isInstagram || isFacebook || isLine || isSnap ||
                  (/Android/.test(ua) && !/Chrome/.test(ua) && /Version\\//.test(ua));

    if (!isInApp) {{
      // Navigateur normal — redirection immédiate
      window.location.replace(dest);
    }} else if (isAndroid) {{
      // Android : tente Intent URL (laisse le système ouvrir Chrome/Samsung/etc)
      // S.browser_fallback_url = retombe sur la destination si l'intent échoue
      var intentUrl = 'intent://' + destNoProto +
        '#Intent;scheme=https;action=android.intent.action.VIEW;' +
        'S.browser_fallback_url=' + encodeURIComponent(dest) + ';end';
      try {{ window.location.replace(intentUrl); }} catch(e) {{}}
      // Fallback ultime après 1.2s (si l'intent n'a rien fait, on ouvre la destination dans le webview)
      setTimeout(function() {{ window.location.replace(dest); }}, 1200);
    }} else if (isIOS) {{
      // iOS : impossible de forcer Safari depuis WebView. On retombe direct sur la destination.
      // (Apple bloque ça par design)
      window.location.replace(dest);
    }} else {{
      window.location.replace(dest);
    }}
  </script>
</body>
</html>"""

@app.get("/track/{short_code}")
async def track_click(short_code: str, request: Request):
    """
    Public redirect endpoint — no auth required.
    Records the click and serves a page that escapes in-app WebViews (TikTok/Instagram/YouTube).
    Normal browsers get an immediate JS redirect. In-app browsers get a breakout page.
    """
    from starlette.responses import RedirectResponse
    link = await db.click_links.find_one({"short_code": short_code, "is_active": True}, {"_id": 0})
    if not link:
        return RedirectResponse(url="https://theclipdealtrack.com", status_code=302)

    campaign = await db.campaigns.find_one({"campaign_id": link["campaign_id"]}, {"_id": 0})
    destination = link.get("destination_url") or (campaign.get("destination_url") if campaign else None) or "https://theclipdealtrack.com"
    rate_per_click = (campaign.get("rate_per_click", 0)) if campaign else 0
    click_billing_mode = (campaign.get("click_billing_mode", "unique_24h")) if campaign else "unique_24h"
    unique_only = click_billing_mode != "all"

    # Get client IP
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    ip_hash = _hash_ip(ip)
    user_agent = request.headers.get("user-agent", "")
    referrer = request.headers.get("referer", "")

    # Record click asynchronously — don't block the response
    asyncio.create_task(_record_click_async(
        link["link_id"], short_code, link["campaign_id"],
        link["clipper_id"], ip_hash, user_agent, referrer,
        rate_per_click, unique_only, click_billing_mode
    ))

    # Always serve the HTML page — JS handles in-app vs normal browser
    html = _build_breakout_page(destination)
    return HTMLResponse(content=html, status_code=200)

@api_router.post("/campaigns/{campaign_id}/generate-links")
async def generate_click_links(campaign_id: str, user: dict = Depends(get_current_user)):
    """Agency: generate a unique tracking link for each active clipper (idempotent)."""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager uniquement")
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    if campaign.get("payment_model") != "clicks":
        raise HTTPException(status_code=400, detail="Cette campagne n'est pas au modèle 'clics'")

    members = await db.campaign_members.find(
        {"campaign_id": campaign_id, "role": "clipper", "status": "active"},
        {"_id": 0, "user_id": 1}
    ).to_list(200)

    generated = []
    for m in members:
        existing = await db.click_links.find_one(
            {"campaign_id": campaign_id, "clipper_id": m["user_id"], "is_active": True},
            {"_id": 0}
        )
        if existing:
            generated.append(existing)
            continue
        clipper = await db.users.find_one({"user_id": m["user_id"]}, {"_id": 0, "display_name": 1, "name": 1})
        # Generate unique short code (retry if collision)
        for _ in range(10):
            short_code = _gen_short_code()
            collision = await db.click_links.find_one({"short_code": short_code})
            if not collision:
                break
        link_id = f"lnk_{uuid.uuid4().hex[:12]}"
        backend_url = os.environ.get("BACKEND_URL", "https://api.theclipdealtrack.com")
        link_doc = {
            "link_id": link_id,
            "short_code": short_code,
            "campaign_id": campaign_id,
            "clipper_id": m["user_id"],
            "clipper_name": (clipper or {}).get("display_name") or (clipper or {}).get("name", "?"),
            "destination_url": campaign.get("destination_url", ""),
            "is_active": True,
            "click_count": 0,
            "unique_click_count": 0,
            "earnings": 0.0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_clicked_at": None,
            "tracking_url": f"{backend_url}/track/{short_code}",
        }
        await db.click_links.insert_one(link_doc)
        link_doc.pop("_id", None)
        generated.append(link_doc)

    return {"links": generated, "count": len(generated)}

@api_router.get("/campaigns/{campaign_id}/click-stats")
async def get_campaign_click_stats(
    campaign_id: str,
    period: str = "30d",            # 1d | 7d | 30d | all | custom
    date_from: Optional[str] = None, # YYYY-MM-DD
    date_to: Optional[str] = None,   # YYYY-MM-DD
    clipper_id: Optional[str] = None,  # filter by clipper (used by clipper's own view)
    user: dict = Depends(get_current_user)
):
    """Return click stats + chart data for a click-based campaign. Accessible by agency, manager, clipper."""
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Access check
    role = user.get("role")
    uid = user["user_id"]
    if role == "clipper":
        # Clippers can only see their own stats
        is_member = await db.campaign_members.find_one({"campaign_id": campaign_id, "user_id": uid, "status": "active"})
        if not is_member:
            raise HTTPException(status_code=403, detail="Not a member")
        clipper_id = uid  # force filter to self
    elif role not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Build date range
    now = datetime.now(timezone.utc)
    if period == "1d":
        from_dt = now - timedelta(days=1)
    elif period == "7d":
        from_dt = now - timedelta(days=7)
    elif period == "30d":
        from_dt = now - timedelta(days=30)
    elif period == "custom" and date_from:
        from_dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
    else:  # "all"
        from_dt = datetime(2020, 1, 1, tzinfo=timezone.utc)

    if period == "custom" and date_to:
        to_dt = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc) + timedelta(days=1)
    else:
        to_dt = now + timedelta(days=1)

    from_str = from_dt.isoformat()
    to_str = to_dt.isoformat()

    # Match filter
    match = {
        "campaign_id": campaign_id,
        "clicked_at": {"$gte": from_str, "$lte": to_str}
    }
    if clipper_id:
        match["clipper_id"] = clipper_id

    # Aggregate by day
    pipeline = [
        {"$match": match},
        {"$addFields": {
            "day": {"$substr": ["$clicked_at", 0, 10]}
        }},
        {"$group": {
            "_id": "$day",
            "clicks": {"$sum": 1},
            "unique_clicks": {"$sum": {"$cond": ["$is_unique", 1, 0]}}
        }},
        {"$sort": {"_id": 1}}
    ]
    daily = await db.click_events.aggregate(pipeline).to_list(1000)

    # Build a complete date range
    days_between = max(1, (to_dt - from_dt).days)
    chart = []
    date_map = {d["_id"]: d for d in daily}
    for i in range(min(days_between, 366)):
        day = (from_dt + timedelta(days=i)).strftime("%Y-%m-%d")
        entry = date_map.get(day, {"_id": day, "clicks": 0, "unique_clicks": 0})
        chart.append({
            "date": day,
            "label": (from_dt + timedelta(days=i)).strftime("%d/%m"),
            "clicks": entry.get("clicks", 0),
            "unique_clicks": entry.get("unique_clicks", 0),
        })

    # Global totals for the period
    totals = await db.click_events.aggregate([
        {"$match": match},
        {"$group": {
            "_id": None,
            "total_clicks": {"$sum": 1},
            "unique_clicks": {"$sum": {"$cond": ["$is_unique", 1, 0]}}
        }}
    ]).to_list(1)
    total_clicks = totals[0]["total_clicks"] if totals else 0
    unique_clicks = totals[0]["unique_clicks"] if totals else 0
    rate_per_click = campaign.get("rate_per_click", 0) or 0
    billable = unique_clicks if campaign.get("unique_clicks_only", True) else total_clicks
    total_earnings = round((billable / 1000) * rate_per_click, 2)

    # Per-clipper breakdown (agency only) — batch user lookup
    clippers_data = []
    if role in ["agency", "manager"] and not clipper_id:
        clipper_pipeline = [
            {"$match": match},
            {"$group": {
                "_id": "$clipper_id",
                "clicks": {"$sum": 1},
                "unique_clicks": {"$sum": {"$cond": ["$is_unique", 1, 0]}}
            }}
        ]
        clipper_stats = await db.click_events.aggregate(clipper_pipeline).to_list(100)
        # Batch fetch all clipper users in one query
        clipper_ids = [cs["_id"] for cs in clipper_stats if cs["_id"]]
        user_docs = await db.users.find(
            {"user_id": {"$in": clipper_ids}},
            {"_id": 0, "user_id": 1, "display_name": 1, "name": 1, "picture": 1}
        ).to_list(len(clipper_ids))
        user_map = {u["user_id"]: u for u in user_docs}
        for cs in clipper_stats:
            cu = user_map.get(cs["_id"], {})
            b = cs["unique_clicks"] if campaign.get("unique_clicks_only", True) else cs["clicks"]
            clippers_data.append({
                "clipper_id": cs["_id"],
                "name": cu.get("display_name") or cu.get("name", "?"),
                "picture": cu.get("picture"),
                "clicks": cs["clicks"],
                "unique_clicks": cs["unique_clicks"],
                "earnings": round((b / 1000) * rate_per_click, 2),
            })
        clippers_data.sort(key=lambda x: x["unique_clicks"], reverse=True)

    return {
        "period": period,
        "date_from": from_str[:10],
        "date_to": to_str[:10],
        "total_clicks": total_clicks,
        "unique_clicks": unique_clicks,
        "total_earnings": total_earnings,
        "rate_per_click": rate_per_click,
        "unique_only": campaign.get("unique_clicks_only", True),
        "chart": chart,
        "clippers": clippers_data,
    }


@api_router.get("/campaigns/{campaign_id}/click-links")
async def get_click_links(campaign_id: str, user: dict = Depends(get_current_user)):
    """Agency: get all tracking links + click stats for a campaign."""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager uniquement")
    links = await db.click_links.find(
        {"campaign_id": campaign_id},
        {"_id": 0}
    ).sort("clipper_name", 1).to_list(500)

    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    rate = (campaign.get("rate_per_click", 0)) if campaign else 0
    dest = (campaign.get("destination_url", "")) if campaign else ""
    backend_url = os.environ.get("BACKEND_URL", "https://api.theclipdealtrack.com")
    for lnk in links:
        if not lnk.get("tracking_url"):
            lnk["tracking_url"] = f"{backend_url}/track/{lnk['short_code']}"

    total_clicks = sum(l.get("click_count", 0) for l in links)
    total_unique = sum(l.get("unique_click_count", 0) for l in links)
    total_earnings = round(sum(l.get("earnings", 0) for l in links), 2)

    return {
        "links": links,
        "destination_url": dest,
        "rate_per_click": rate,
        "totals": {"clicks": total_clicks, "unique_clicks": total_unique, "earnings": total_earnings}
    }

@api_router.get("/campaigns/{campaign_id}/my-click-link")
async def get_my_click_link(campaign_id: str, user: dict = Depends(get_current_user)):
    """Clipper: get their own tracking link for a click-based campaign."""
    link = await db.click_links.find_one(
        {"campaign_id": campaign_id, "clipper_id": user["user_id"], "is_active": True},
        {"_id": 0}
    )
    if not link:
        raise HTTPException(status_code=404, detail="Lien introuvable — demande à ton agence de générer les liens")
    backend_url = os.environ.get("BACKEND_URL", "https://api.theclipdealtrack.com")
    if not link.get("tracking_url"):
        link["tracking_url"] = f"{backend_url}/track/{link['short_code']}"
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0, "rate_per_click": 1, "destination_url": 1})
    link["rate_per_click"] = (campaign.get("rate_per_click", 0)) if campaign else 0
    return link

@api_router.post("/campaigns/{campaign_id}/regenerate-link/{clipper_id}")
async def regenerate_click_link(campaign_id: str, clipper_id: str, user: dict = Depends(get_current_user)):
    """Agency: invalidate old link + create a fresh one for a clipper."""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager uniquement")
    # Deactivate old link
    await db.click_links.update_many(
        {"campaign_id": campaign_id, "clipper_id": clipper_id},
        {"$set": {"is_active": False}}
    )
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    clipper = await db.users.find_one({"user_id": clipper_id}, {"_id": 0, "display_name": 1, "name": 1})
    for _ in range(10):
        short_code = _gen_short_code()
        if not await db.click_links.find_one({"short_code": short_code}):
            break
    link_id = f"lnk_{uuid.uuid4().hex[:12]}"
    backend_url = os.environ.get("BACKEND_URL", "https://api.theclipdealtrack.com")
    link_doc = {
        "link_id": link_id,
        "short_code": short_code,
        "campaign_id": campaign_id,
        "clipper_id": clipper_id,
        "clipper_name": (clipper or {}).get("display_name") or (clipper or {}).get("name", "?"),
        "destination_url": (campaign or {}).get("destination_url", ""),
        "is_active": True,
        "click_count": 0,
        "unique_click_count": 0,
        "earnings": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_clicked_at": None,
        "tracking_url": f"{backend_url}/track/{short_code}",
    }
    await db.click_links.insert_one(link_doc)
    link_doc.pop("_id", None)
    return link_doc

class AddBudgetRequest(BaseModel):
    amount: float  # montant en euros à ajouter

@api_router.patch("/campaigns/{campaign_id}/settings")
async def update_campaign_settings(campaign_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Agency/Manager: edit campaign settings mid-flight or after budget exhaustion.
    - Always editable: name, description, destination_url, rate_per_click, click_window_hours, application_form_enabled, application_questions, platforms, max_clippers, min_views_payout, max_views_payout.
    - RPM editable ONLY when budget exhausted (budget_used >= budget_total) OR budget_unlimited.
    - Cannot change payment_model after creation.
    """
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager uniquement")
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    if campaign.get("agency_id") != user.get("user_id") and user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Non autorisé")

    ALWAYS_EDITABLE = {
        "name", "description", "destination_url", "rate_per_click",
        "click_window_hours", "application_form_enabled", "application_questions",
        "platforms", "max_clippers", "min_view_payout", "max_view_payout",
    }
    RPM_EDITABLE_WHEN_EXHAUSTED = {"rpm"}

    updates: dict = {}
    budget_total = campaign.get("budget_total") or 0
    budget_used = campaign.get("budget_used") or 0
    budget_unlimited = campaign.get("budget_unlimited", False)
    budget_exhausted = budget_unlimited or (budget_total > 0 and budget_used >= budget_total)

    for key, val in body.items():
        if key in ALWAYS_EDITABLE:
            updates[key] = val
        elif key in RPM_EDITABLE_WHEN_EXHAUSTED:
            if not budget_exhausted:
                raise HTTPException(
                    status_code=400,
                    detail="Le RPM ne peut être modifié qu'une fois la cagnotte épuisée. Rechargez le budget d'abord ou attendez l'épuisement."
                )
            if val is not None:
                updates["rpm"] = float(val)
        elif key == "payment_model":
            raise HTTPException(status_code=400, detail="Le modèle de paiement ne peut pas être modifié après création")

    if not updates:
        raise HTTPException(status_code=400, detail="Aucun champ modifiable fourni")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.campaigns.update_one({"campaign_id": campaign_id}, {"$set": updates})

    # If RPM changed and campaign was paused due to budget exhaustion, keep paused — agency must add budget to relaunch
    # If campaign was paused due to budget and budget is reloaded (handled in add-budget), auto-reactivate there
    updated = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    return {"campaign": updated}


@api_router.post("/campaigns/{campaign_id}/leave")
async def leave_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    """Clipper voluntarily leaves a campaign."""
    if user.get("role") not in ["clipper"]:
        raise HTTPException(status_code=403, detail="Clippeurs uniquement")
    user_id = user["user_id"]
    member = await db.campaign_members.find_one(
        {"campaign_id": campaign_id, "user_id": user_id, "role": "clipper"},
        {"_id": 0}
    )
    if not member:
        raise HTTPException(status_code=404, detail="Vous n'êtes pas membre de cette campagne")
    if member.get("status") in ("left", "rejected"):
        raise HTTPException(status_code=400, detail="Vous avez déjà quitté cette campagne")

    await db.campaign_members.update_one(
        {"campaign_id": campaign_id, "user_id": user_id, "role": "clipper"},
        {"$set": {"status": "left", "left_at": datetime.now(timezone.utc).isoformat()}}
    )
    # Notify agency/manager via WebSocket
    try:
        campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
        if campaign:
            await manager.broadcast_to_campaign(campaign_id, {
                "type": "clipper_left",
                "campaign_id": campaign_id,
                "user_id": user_id,
                "display_name": user.get("display_name") or user.get("name", ""),
            })
    except Exception:
        pass
    return {"message": "Vous avez quitté la campagne"}


@api_router.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    """Agency: delete a campaign.
    Conditions:
      1. Budget must be exhausted (used >= total) OR budget_unlimited=True.
      2. All active clippers must have been paid (no pending payments owed > 0).
    """
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager uniquement")
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    if campaign.get("agency_id") != user.get("user_id") and user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Non autorisé")

    budget_total = campaign.get("budget_total") or 0
    budget_used = campaign.get("budget_used") or 0
    budget_unlimited = campaign.get("budget_unlimited", False)

    if not budget_unlimited and budget_total > 0 and budget_used < budget_total:
        remaining = round(budget_total - budget_used, 2)
        raise HTTPException(
            status_code=400,
            detail=f"La cagnotte n'est pas encore épuisée. Il reste {remaining}€. Épuisez le budget ou passez en mode illimité avant de supprimer."
        )

    # Check all clippers are paid (total owed ≈ 0)
    active_members = await db.campaign_members.find(
        {"campaign_id": campaign_id, "role": "clipper", "status": {"$in": ["active", "left"]}},
        {"_id": 0, "user_id": 1}
    ).to_list(500)
    clipper_ids = [m["user_id"] for m in active_members]
    rpm = campaign.get("rpm") or 0
    unpaid_count = 0
    if clipper_ids:
        # Mongo aggregation : 2 queries au lieu de 2*N (passe de 2M docs à 2 reduce)
        try:
            views_agg = await db.tracked_videos.aggregate([
                {"$match": {"campaign_id": campaign_id, "user_id": {"$in": clipper_ids}}},
                {"$group": {"_id": "$user_id", "total_views": {"$sum": {"$ifNull": ["$views", 0]}}}}
            ]).to_list(len(clipper_ids))
            views_map = {r["_id"]: r["total_views"] for r in views_agg}
        except Exception as e:
            logger.warning(f"delete_campaign views agg error: {e}")
            views_map = {}
        try:
            paid_agg = await db.payments.aggregate([
                {"$match": {"campaign_id": campaign_id, "user_id": {"$in": clipper_ids}, "status": "confirmed"}},
                {"$group": {"_id": "$user_id", "total_paid": {"$sum": {"$ifNull": ["$amount_eur", 0]}}}}
            ]).to_list(len(clipper_ids))
            paid_map = {r["_id"]: r["total_paid"] for r in paid_agg}
        except Exception as e:
            logger.warning(f"delete_campaign payments agg error: {e}")
            paid_map = {}
        for clipper_user_id in clipper_ids:
            total_views = views_map.get(clipper_user_id, 0)
            owed = round((total_views / 1000) * rpm, 2) if rpm else 0
            paid = round(paid_map.get(clipper_user_id, 0), 2)
            if owed - paid > 0.5:  # 50 cent tolerance
                unpaid_count += 1

    if unpaid_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"{unpaid_count} clippeur(s) n'ont pas encore été payé(s). Confirmez tous les paiements avant de supprimer la campagne."
        )

    # All conditions met — delete campaign and related data
    await db.campaigns.delete_one({"campaign_id": campaign_id})
    await db.campaign_members.delete_many({"campaign_id": campaign_id})
    await db.messages.delete_many({"campaign_id": campaign_id})
    await db.tracked_videos.delete_many({"campaign_id": campaign_id})
    await db.posts.delete_many({"campaign_id": campaign_id})

    return {"message": "Campagne supprimée avec succès"}


@api_router.post("/campaigns/{campaign_id}/add-budget")
async def add_campaign_budget(campaign_id: str, body: AddBudgetRequest, user: dict = Depends(get_current_user)):
    """Agency: add more budget to an existing campaign."""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Agency/Manager uniquement")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Le montant doit être positif")
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    if campaign.get("agency_id") != user.get("user_id") and user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Non autorisé")
    current_budget = campaign.get("budget_total") or 0
    new_budget = round(current_budget + body.amount, 2)
    set_fields: dict = {"budget_total": new_budget, "budget_unlimited": False}
    # Auto-reactivate if the campaign was paused due to budget exhaustion
    if campaign.get("status") == "paused" and campaign.get("paused_reason") == "budget_exhausted":
        set_fields["status"] = "active"
        set_fields["paused_reason"] = None
    await db.campaigns.update_one(
        {"campaign_id": campaign_id},
        {"$set": set_fields}
    )
    updated = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    return {"budget_total": new_budget, "budget_used": updated.get("budget_used", 0), "status": updated.get("status")}

# Include router
app.include_router(api_router)

ALLOWED_ORIGINS = os.environ.get("FRONTEND_URL", "http://localhost:3000")
_origins = [o.strip() for o in ALLOWED_ORIGINS.split(",") if o.strip()]
if "http://localhost:3000" not in _origins:
    _origins.append("http://localhost:3000")
if "http://localhost:3001" not in _origins:
    _origins.append("http://localhost:3001")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    # ── MongoDB indexes — idempotent, safe to re-run ───────────────────────
    indexes = [
        # tracked_videos — unique per (account, campaign, platform_video_id) to allow same URL in multiple campaigns
        (db.tracked_videos, [("account_id", 1), ("campaign_id", 1), ("platform_video_id", 1)], {"unique": True, "sparse": True}),
        (db.tracked_videos, [("user_id", 1)], {}),
        (db.tracked_videos, [("campaign_id", 1)], {}),
        # messages
        (db.message_reads, [("user_id", 1), ("campaign_id", 1)], {"unique": True}),
        (db.messages, [("campaign_id", 1), ("created_at", 1)], {}),
        (db.messages, [("sender_id", 1)], {}),
        # click tracking
        (db.click_links, [("short_code", 1)], {"unique": True}),
        (db.click_links, [("campaign_id", 1), ("clipper_id", 1)], {}),
        (db.click_links, [("clipper_id", 1), ("is_active", 1)], {}),
        (db.click_events, [("link_id", 1), ("ip_hash", 1), ("clicked_at", 1)], {}),
        (db.click_events, [("campaign_id", 1), ("clicked_at", -1)], {}),
        (db.click_events, [("clipper_id", 1), ("clicked_at", -1)], {}),
        (db.click_events, [("campaign_id", 1), ("is_unique", 1)], {}),
        # click_dedup — atomic unique constraint pour prevention race condition (audit 200 clippeurs)
        (db.click_dedup, [("_dedup_key", 1)], {"unique": True, "name": "dedup_key_unique"}),
        # campaigns + members
        (db.campaigns, [("agency_id", 1)], {}),
        (db.campaigns, [("status", 1)], {}),
        (db.campaign_members, [("user_id", 1), ("status", 1)], {}),
        (db.campaign_members, [("campaign_id", 1), ("status", 1)], {}),
        # sessions — TTL: auto-delete expired sessions after 8 days
        (db.user_sessions, [("expires_at", 1)], {"expireAfterSeconds": 0, "name": "sessions_ttl"}),
        (db.user_sessions, [("session_token", 1)], {"unique": True}),
        # social accounts
        (db.social_accounts, [("user_id", 1)], {}),
        (db.social_accounts, [("status", 1)], {}),
        # announcements
        (db.announcements, [("created_at", -1)], {}),
        # message comments
        (db.message_comments, [("message_id", 1), ("created_at", 1)], {}),
        # posts (for views aggregation)
        (db.posts, [("campaign_id", 1), ("user_id", 1)], {}),
        (db.posts, [("user_id", 1)], {}),
        # advices (for manager reminder batch query)
        (db.advices, [("campaign_id", 1), ("recipient_ids", 1), ("created_at", -1)], {}),
        (db.advices, [("manager_id", 1), ("created_at", -1)], {}),
        # users (primary key lookup)
        (db.users, [("user_id", 1)], {"unique": True}),
        (db.users, [("email", 1)], {"unique": True}),
        # campaign_social_accounts
        (db.campaign_social_accounts, [("campaign_id", 1)], {}),
        (db.campaign_social_accounts, [("user_id", 1)], {}),
        # views_snapshots
        (db.views_snapshots, [("campaign_id", 1), ("date", -1)], {}),
        # user_views_snapshots (per clipper, per campaign, per day)
        (db.user_views_snapshots, [("campaign_id", 1), ("user_id", 1), ("date", -1)], {}),
        # payments
        (db.payments, [("user_id", 1), ("campaign_id", 1)], {}),
        (db.payments, [("agency_id", 1)], {}),
    ]
    for collection, keys, opts in indexes:
        try:
            await collection.create_index(keys, **opts)
        except Exception as e:
            logger.debug(f"Index already exists or minor error: {e}")

    # ── Drop old bad index: (account_id, platform_video_id) was unique, caused
    #    DuplicateKeyError when adding same YouTube/Instagram URL to 2 campaigns ──
    try:
        existing = await db.tracked_videos.index_information()
        for name, info in existing.items():
            key_fields = [k[0] for k in info.get("key", [])]
            if key_fields == ["account_id", "platform_video_id"] and info.get("unique"):
                await db.tracked_videos.drop_index(name)
                logger.info(f"Startup: dropped old unique index '{name}' on tracked_videos")
    except Exception as e:
        logger.debug(f"Old index cleanup: {e}")

    # ── Clean up expired sessions (belt + suspenders alongside TTL index) ──
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        res = await db.user_sessions.delete_many({"expires_at": {"$lt": now_iso}})
        if res.deleted_count:
            logger.info(f"Startup: purged {res.deleted_count} expired sessions.")
    except Exception as e:
        logger.warning(f"Session cleanup failed: {e}")

    # Purge all simulated/fake videos that may have been inserted by old code versions.
    # Simulated videos have simulated=True OR platform_video_id starting with "sim_".
    try:
        result = await db.tracked_videos.delete_many({
            "$or": [
                {"simulated": True},
                {"platform_video_id": {"$regex": "^sim_"}},
            ]
        })
        if result.deleted_count > 0:
            logger.info(f"Startup: purged {result.deleted_count} simulated/fake videos from DB.")
    except Exception as e:
        logger.warning(f"Startup simulated video purge failed: {e}")

    asyncio.create_task(auto_strike_loop())
    asyncio.create_task(track_videos_loop())

    # Test TikWm API key at startup and log the result
    if TIKWM_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(
                    "https://www.tikwm.com/api/user/posts",
                    params={"unique_id": "tiktok", "count": 1, "cursor": 0, "key": TIKWM_API_KEY},
                    headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.tikwm.com/"},
                )
                if r.status_code == 200 and r.json().get("code") == 0:
                    logger.info("✅ TikWm API key is valid — full automatic TikTok tracking enabled.")
                else:
                    logger.warning(f"⚠️ TikWm API key may be invalid (HTTP {r.status_code}, code={r.json().get('code')})")
        except Exception as e:
            logger.warning(f"⚠️ TikWm API key test failed: {e}")
    else:
        logger.warning(
            "⚠️ TIKWM_API_KEY not set. TikTok tracking limited to search results (~2-3 videos/account). "
            "Get a free key at tikwm.com and add TIKWM_API_KEY to Railway env vars."
        )

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# ================= AUTO STRIKE BACKGROUND TASK =================

async def auto_strike_loop():
    """Run every hour — check cadence violations and issue strikes automatically."""
    while True:
        try:
            await check_and_issue_strikes()
        except Exception as e:
            logger.error(f"Auto strike check failed: {e}")
        await asyncio.sleep(3600)  # every hour

async def check_and_issue_strikes():
    now = datetime.now(timezone.utc)
    campaigns = await db.campaigns.find({"status": "active"}, {"_id": 0}).to_list(500)

    for campaign in campaigns:
        campaign_id = campaign["campaign_id"]
        strike_days = campaign.get("strike_days", 3)
        max_strikes = campaign.get("max_strikes", 3)

        members = await db.campaign_members.find(
            {"campaign_id": campaign_id, "role": "clipper", "status": "active"},
            {"_id": 0}
        ).to_list(500)

        for member in members:
            last_post_at = member.get("last_post_at")
            if not last_post_at:
                # No posts yet — check join date
                joined_at = member.get("joined_at")
                if not joined_at:
                    continue
                try:
                    if isinstance(joined_at, str):
                        joined_at = datetime.fromisoformat(joined_at.replace("Z", "+00:00"))
                    if joined_at.tzinfo is None:
                        joined_at = joined_at.replace(tzinfo=timezone.utc)
                except (ValueError, AttributeError):
                    continue
                days_inactive = (now - joined_at).days
            else:
                if isinstance(last_post_at, str):
                    last_post_at = datetime.fromisoformat(last_post_at)
                if last_post_at.tzinfo is None:
                    last_post_at = last_post_at.replace(tzinfo=timezone.utc)
                days_inactive = (now - last_post_at).days

            if days_inactive >= strike_days:
                # Strike ID déterministe basé sur date du jour : empêche les doublons même sous race condition
                strike_day_key = now.strftime("%Y%m%d")
                strike_id = f"auto_{campaign_id}_{member['user_id']}_{strike_day_key}"

                # Upsert atomique : si déjà un strike auto aujourd'hui, ne crée rien
                upsert_result = await db.strikes.update_one(
                    {"strike_id": strike_id},
                    {"$setOnInsert": {
                        "strike_id": strike_id,
                        "campaign_id": campaign_id,
                        "user_id": member["user_id"],
                        "reason": f"Inactivité de {days_inactive} jours (seuil : {strike_days} jours)",
                        "auto": True,
                        "created_at": now.isoformat(),
                    }},
                    upsert=True
                )
                # Si pas inserted, c'est un doublon → skip
                if upsert_result.upserted_id is None:
                    continue

                # Compteur de strikes en atomique via $inc — évite race condition
                from pymongo import ReturnDocument
                updated_member = await db.campaign_members.find_one_and_update(
                    {"member_id": member["member_id"]},
                    {"$inc": {"strikes": 1}},
                    return_document=ReturnDocument.AFTER
                )
                new_strikes = (updated_member or {}).get("strikes", member.get("strikes", 0) + 1)

                if new_strikes >= max_strikes:
                    await db.campaign_members.update_one(
                        {"member_id": member["member_id"]},
                        {"$set": {"status": "suspended"}}
                    )
                    logger.info(f"Clipper {member['user_id']} suspended in campaign {campaign_id}")

                # Notify clipper via WebSocket
                await manager.send_to_user(member["user_id"], {
                    "type": "strike_issued",
                    "campaign_id": campaign_id,
                    "campaign_name": campaign.get("name", ""),
                    "strikes": new_strikes,
                    "suspended": new_strikes >= max_strikes
                })

                # Notify agency/creator via WebSocket
                campaign_creator_id = campaign.get("agency_id") or campaign.get("created_by") or campaign.get("user_id")
                if campaign_creator_id:
                    clipper_user = await db.users.find_one({"user_id": member["user_id"]}, {"_id": 0, "display_name": 1, "name": 1})
                    clipper_name = (clipper_user or {}).get("display_name") or (clipper_user or {}).get("name") or member["user_id"]
                    await manager.send_to_user(campaign_creator_id, {
                        "type": "agency_strike_notification",
                        "campaign_id": campaign_id,
                        "campaign_name": campaign.get("name", ""),
                        "clipper_id": member["user_id"],
                        "clipper_name": clipper_name,
                        "strikes": new_strikes,
                        "suspended": new_strikes >= max_strikes,
                        "reason": f"Inactivité de {days_inactive} jours (seuil : {strike_days} jours)"
                    })

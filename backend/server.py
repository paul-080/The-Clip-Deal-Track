from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
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
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_placeholder')
ADMIN_SECRET_CODE = os.environ.get('ADMIN_SECRET_CODE', 'clipdeal-admin-2025')
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

class CampaignCreate(BaseModel):
    name: str
    image_url: Optional[str] = None
    rpm: float
    budget_total: Optional[float] = None
    budget_unlimited: bool = False
    min_view_payout: int = 0
    max_view_payout: Optional[int] = None
    pay_for_post: bool = False
    platforms: List[str] = []
    strike_days: int = 3
    cadence: int = 1
    application_form_enabled: bool = False
    application_questions: List[str] = []

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

    async def send_to_user(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            for ws in self.active_connections[user_id]:
                try:
                    await ws.send_json(message)
                except:
                    pass

    async def broadcast_to_campaign(self, campaign_id: str, message: dict):
        members = await db.campaign_members.find(
            {"campaign_id": campaign_id, "status": "active"},
            {"_id": 0, "user_id": 1}
        ).to_list(1000)
        for member in members:
            await self.send_to_user(member["user_id"], message)

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
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
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
    """Send verification code via Resend HTTP API (works on Railway)."""
    if not RESEND_API_KEY:
        logger.warning(f"RESEND_API_KEY not set — verification code for {to_email}: {code}")
        return

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
    if resp.status_code not in (200, 201):
        logger.error(f"Resend API error {resp.status_code}: {resp.text}")
        raise Exception(f"Resend error {resp.status_code}: {resp.text}")
    logger.info(f"Email sent via Resend to {to_email} — id={resp.json().get('id')}")

@api_router.post("/auth/register")
async def email_register(req: EmailRegisterRequest):
    """Register with email + password — stores a pending verification code, sends it by email."""
    if req.role not in ["clipper", "agency", "manager", "client"]:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Mot de passe trop court (6 caractères minimum)")
    if "@" not in req.email or "." not in req.email:
        raise HTTPException(status_code=400, detail="Adresse email invalide")

    existing = await db.users.find_one({"email": req.email.lower()}, {"_id": 0})
    # Block if a fully verified account already exists with this email
    if existing and existing.get("email_verified") is True:
        raise HTTPException(status_code=409, detail="Un compte existe déjà avec cet email")

    code = str(random.randint(100000, 999999))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)

    # Upsert pending verification (replace any previous pending code for this email)
    await db.email_verifications.update_one(
        {"email": req.email.lower()},
        {"$set": {
            "email": req.email.lower(),
            "password_hash": _hash_password(req.password),
            "role": req.role,
            "display_name": req.display_name,
            "first_name": req.first_name,
            "last_name": req.last_name,
            "agency_name": req.agency_name,
            "code": code,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )

    # Send verification email — mandatory, no bypass
    if not RESEND_API_KEY:
        raise HTTPException(status_code=503, detail="Le service d'envoi d'email n'est pas configuré. Contactez l'administrateur.")
    try:
        await _send_verification_email(req.email.lower(), code)
    except Exception as e:
        logger.error(f"Email send failed for {req.email}: {e}")
        raise HTTPException(status_code=503, detail="Impossible d'envoyer l'email de vérification. Réessayez dans quelques minutes.")

    return {"message": f"Code envoyé à {req.email}"}

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
    body = await request.json()
    email = body.get("email", "").lower()
    password = body.get("password", "")

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    if not _verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    if not user.get("email_verified", False):
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
        "cadence": campaign_data.cadence,
        "application_form_enabled": campaign_data.application_form_enabled,
        "application_questions": campaign_data.application_questions,
        "token_clipper": uuid.uuid4().hex,
        "token_manager": uuid.uuid4().hex,
        "token_client": uuid.uuid4().hex,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "active"
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
async def discover_campaigns(user: dict = Depends(get_current_user)):
    """Get all active campaigns for discovery"""
    campaigns = await db.campaigns.find(
        {"status": "active"},
        {"_id": 0, "token_clipper": 0, "token_manager": 0, "token_client": 0}
    ).to_list(100)
    
    user_id = user.get("user_id")
    for campaign in campaigns:
        agency = await db.users.find_one(
            {"user_id": campaign["agency_id"]},
            {"_id": 0, "display_name": 1, "picture": 1}
        )
        campaign["agency_name"] = agency.get("display_name") if agency else "Unknown"
        # Add user's membership status for this campaign
        if user_id:
            member = await db.campaign_members.find_one(
                {"campaign_id": campaign["campaign_id"], "user_id": user_id},
                {"_id": 0, "status": 1}
            )
            campaign["user_status"] = member.get("status") if member else None

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
        
        for member in members:
            member_user = await db.users.find_one(
                {"user_id": member["user_id"]},
                {"_id": 0, "name": 1, "email": 1, "display_name": 1, "picture": 1}
            )
            member["user_info"] = member_user
            
            accounts = await db.campaign_social_accounts.find(
                {"campaign_id": campaign_id, "user_id": member["user_id"]},
                {"_id": 0}
            ).to_list(50)
            account_ids = [a["account_id"] for a in accounts]
            social_accounts = await db.social_accounts.find(
                {"account_id": {"$in": account_ids}},
                {"_id": 0}
            ).to_list(50)
            member["social_accounts"] = social_accounts
        
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

    member = {
        "member_id": f"mem_{uuid.uuid4().hex[:12]}",
        "campaign_id": campaign_id,
        "user_id": user["user_id"],
        "role": "clipper",
        "status": "active" if not campaign.get("application_form_enabled", True) else "pending",
        "joined_at": datetime.now(timezone.utc).isoformat(),
        "strikes": 0,
        "last_post_at": None,
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
async def join_as_manager(campaign_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Managers uniquement")
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
        "role": "manager",
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
            await manager.send_to_user(agency_id, {"type": "new_manager_request", "campaign_id": campaign_id, "user_id": user["user_id"], "display_name": user.get("display_name") or user.get("name")})
    except Exception:
        pass
    return {"message": "Demande envoyée à l'agence", "member": member}

@api_router.get("/campaigns/{campaign_id}/pending-members")
async def get_pending_members(campaign_id: str, user: dict = Depends(get_current_user)):
    """Get pending clippers who applied to this campaign (agency/manager only)"""
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.get("agency_id") != user["user_id"] and user.get("role") not in ["agency", "manager"]:
        # Check if user is a manager in the campaign
        is_manager = await db.campaign_members.find_one({
            "campaign_id": campaign_id,
            "user_id": user["user_id"],
            "role": "manager",
            "status": "active"
        })
        if not is_manager:
            raise HTTPException(status_code=403, detail="Not authorized")

    members = await db.campaign_members.find(
        {"campaign_id": campaign_id, "status": "pending"},
        {"_id": 0}
    ).to_list(100)

    for member in members:
        member_user = await db.users.find_one({"user_id": member["user_id"]}, {"_id": 0, "password_hash": 0})
        member["user_info"] = member_user

    return {"members": members}

@api_router.post("/campaigns/{campaign_id}/members/{member_id}/accept")
async def accept_campaign_member(campaign_id: str, member_id: str, user: dict = Depends(get_current_user)):
    """Accept a pending campaign member (agency/manager only)"""
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.get("agency_id") != user["user_id"] and user.get("role") not in ["agency", "manager"]:
        is_manager = await db.campaign_members.find_one({
            "campaign_id": campaign_id, "user_id": user["user_id"], "role": "manager", "status": "active"
        })
        if not is_manager:
            raise HTTPException(status_code=403, detail="Not authorized")

    member = await db.campaign_members.find_one({"member_id": member_id, "campaign_id": campaign_id})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.campaign_members.update_one(
        {"member_id": member_id},
        {"$set": {"status": "active", "accepted_at": datetime.now(timezone.utc).isoformat()}}
    )

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
    if campaign.get("agency_id") != user["user_id"] and user.get("role") not in ["agency", "manager"]:
        is_manager = await db.campaign_members.find_one({
            "campaign_id": campaign_id, "user_id": user["user_id"], "role": "manager", "status": "active"
        })
        if not is_manager:
            raise HTTPException(status_code=403, detail="Not authorized")

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

    # Total views depuis tracked_videos
    pipeline = [
        {"$match": {"campaign_id": campaign_id}},
        {"$group": {"_id": None, "total_views": {"$sum": "$views"}, "total_videos": {"$sum": 1}}}
    ]
    agg = await db.tracked_videos.aggregate(pipeline).to_list(1)
    total_views = agg[0]["total_views"] if agg else 0
    total_videos = agg[0]["total_videos"] if agg else 0

    # Clippeurs actifs
    members = await db.campaign_members.find(
        {"campaign_id": campaign_id, "role": "clipper", "status": "active"},
        {"_id": 0, "user_id": 1}
    ).to_list(200)
    clipper_count = len(members)

    # Top vidéos
    top_videos = await db.tracked_videos.find(
        {"campaign_id": campaign_id},
        {"_id": 0, "url": 1, "title": 1, "views": 1, "platform": 1, "thumbnail_url": 1, "published_at": 1}
    ).sort("views", -1).to_list(12)

    # Stats par plateforme
    platform_agg = await db.tracked_videos.aggregate([
        {"$match": {"campaign_id": campaign_id}},
        {"$group": {"_id": "$platform", "views": {"$sum": "$views"}, "count": {"$sum": 1}}}
    ]).to_list(10)

    return {
        "campaign_name": campaign.get("name"),
        "total_views": total_views,
        "total_videos": total_videos,
        "clipper_count": clipper_count,
        "rpm": campaign.get("rpm", 0),
        "top_videos": top_videos,
        "platforms": {p["_id"]: {"views": p["views"], "count": p["count"]} for p in platform_agg},
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

    # ── CLIPPER → rejoindre directement ─────────────────────────────────
    existing = await db.campaign_members.find_one({
        "campaign_id": campaign["campaign_id"], "user_id": user["user_id"]
    })
    if existing:
        return {"message": "Déjà membre", "status": "active", "campaign": campaign}

    member = {
        "member_id": f"mem_{uuid.uuid4().hex[:12]}",
        "campaign_id": campaign["campaign_id"],
        "user_id": user["user_id"],
        "role": "clipper",
        "status": "active",
        "joined_at": now,
        "strikes": 0,
        "last_post_at": None,
    }
    await db.campaign_members.insert_one(member)

    await manager.send_to_user(user["user_id"], {"type": "campaign_joined", "campaign": campaign})
    await manager.send_to_user(campaign["agency_id"], {
        "type": "member_joined",
        "campaign_id": campaign["campaign_id"],
        "user_id": user["user_id"],
        "role": "clipper",
    })
    return {"message": "Vous avez rejoint la campagne !", "status": "active", "campaign": campaign}

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

    strikes = await db.strikes.find({"campaign_id": campaign_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"strikes": strikes}

@api_router.post("/campaigns/{campaign_id}/members/{member_user_id}/strike")
async def issue_manual_strike(campaign_id: str, member_user_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Issue a manual strike to a clipper (agency/manager only)"""
    if user.get("role") not in ["agency", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    member = await db.campaign_members.find_one({
        "campaign_id": campaign_id,
        "user_id": member_user_id
    }, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
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

async def _scrape_tiktok_playwright(username: str) -> dict:
    """
    Scrape TikTok profile using Playwright headless browser.
    Intercepts TikTok's internal API calls to get user info + videos.
    Falls back to extracting embedded SIGI_STATE / UNIVERSAL_DATA JSON from the HTML.
    """
    if not PLAYWRIGHT_AVAILABLE:
        raise ImportError("playwright non installé. Exécuter: pip install playwright && playwright install chromium --with-deps")
    username = username.lstrip("@")
    user_info_data: dict = {}
    video_list_data: list = []
    sigi_state: dict = {}
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox", "--disable-setuid-sandbox",
                "--disable-dev-shm-usage", "--disable-gpu",
                "--disable-blink-features=AutomationControlled",
                "--window-size=1280,800",
            ]
        )
        try:
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                locale="en-US",
                viewport={"width": 1280, "height": 800},
                extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
            )
            page = await context.new_page()
            # Block heavy media to speed up page load
            async def _block_media(route):
                rtype = route.request.resource_type
                if rtype in ("image", "media", "font"):
                    await route.abort()
                else:
                    await route.continue_()
            await page.route("**/*", _block_media)
            # Intercept TikTok internal API responses
            async def _handle_response(response):
                url = response.url
                try:
                    if "tiktok.com/api/user/detail" in url:
                        body = await response.json()
                        user_info_data.update(body.get("userInfo", {}))
                    elif "tiktok.com/api/post/item_list" in url:
                        body = await response.json()
                        video_list_data.extend(body.get("itemList", []))
                except Exception:
                    pass
            page.on("response", _handle_response)
            await page.goto(
                f"https://www.tiktok.com/@{username}",
                wait_until="domcontentloaded", timeout=35000
            )
            await page.wait_for_timeout(4000)
            # Extract embedded JSON if API interception didn't yield data
            if not user_info_data:
                raw = await page.evaluate("""
                    () => {
                        for (const id of ['SIGI_STATE', '__UNIVERSAL_DATA_FOR_REHYDRATION__']) {
                            const el = document.getElementById(id);
                            if (el && el.textContent && el.textContent.length > 10) {
                                try { return { id, data: JSON.parse(el.textContent) }; } catch(e) {}
                            }
                        }
                        // Fallback: search script tags
                        for (const s of document.querySelectorAll('script[type="application/json"]')) {
                            if (s.textContent && (s.textContent.includes('"UserModule"') || s.textContent.includes('"webapp.user-detail"'))) {
                                try { return { id: s.id || 'script', data: JSON.parse(s.textContent) }; } catch(e) {}
                            }
                        }
                        return null;
                    }
                """)
                if raw:
                    sigi_state.update({"id": raw["id"], "data": raw["data"]})
        except Exception as e:
            logger.warning(f"Playwright TikTok error for @{username}: {e}")
        finally:
            await browser.close()
    return {
        "api_user": user_info_data,
        "api_videos": video_list_data,
        "sigi": sigi_state,
        "username": username,
    }


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

    return {
        "display_name": user.get("nickname") or username,
        "avatar_url": user.get("avatarLarger") or user.get("avatarMedium") or user.get("avatarThumb"),
        "follower_count": stats.get("followerCount"),
        "platform_channel_id": user.get("id") or user.get("secUid"),
    }


async def _fetch_tiktok_tikwm(username: str) -> list:
    """
    Fetch all TikTok videos for a user via TikWm API.
    Paginates automatically. Works from cloud servers (TikWm uses residential proxies).
    """
    username = username.lstrip("@")
    all_videos = []
    cursor = 0
    max_pages = 10  # 10 × 35 = 350 videos max

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
        for _ in range(max_pages):
            r = await c.get(
                "https://www.tikwm.com/api/user/posts",
                params={"unique_id": username, "count": 35, "cursor": cursor},
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "application/json",
                    "Referer": "https://www.tikwm.com/",
                }
            )
            if r.status_code != 200:
                break
            try:
                data = r.json()
            except Exception:
                break

            if data.get("code") != 0:
                break

            page_data = data.get("data", {})
            items = page_data.get("videos", [])
            if not items:
                break

            for item in items:
                vid_id = str(item.get("video_id") or item.get("id") or "")
                if not vid_id:
                    continue
                create_time = item.get("create_time") or 0
                all_videos.append({
                    "platform_video_id": vid_id,
                    "url": f"https://www.tiktok.com/@{username}/video/{vid_id}",
                    "title": (item.get("title") or item.get("desc") or "")[:200] or None,
                    "thumbnail_url": item.get("cover") or item.get("origin_cover"),
                    "views": int(item.get("play_count") or 0),
                    "likes": int(item.get("digg_count") or 0),
                    "comments": int(item.get("comment_count") or 0),
                    "published_at": datetime.fromtimestamp(int(create_time), tz=timezone.utc).isoformat() if create_time else None,
                })

            has_more = page_data.get("hasMore") or page_data.get("has_more")
            if not has_more:
                break
            cursor = page_data.get("cursor", cursor + 35)
            await asyncio.sleep(0.5)  # gentle rate limiting

    return all_videos


async def _verify_tiktok(username: str) -> dict:
    """Verify TikTok account. Primary: TikWm API (cloud-safe). Fallbacks: Playwright, yt-dlp."""
    username = username.lstrip("@")
    # Primary: TikWm API — works from cloud servers, no anti-bot issues
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
    Uses the same endpoint as Instagram's web app (no auth needed for public profiles).
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
    url = f"https://i.instagram.com/api/v1/users/web_profile_info/?username={username}"
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
        r = await c.get(url, headers=headers)
    if r.status_code == 200:
        return r.json()
    elif r.status_code in (404, 400):
        raise ValueError(f"Compte Instagram @{username} introuvable ou privé")
    else:
        raise ValueError(f"Instagram API erreur {r.status_code} pour @{username}")


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
            "thumbnail_url": node.get("thumbnail_src") or node.get("display_url"),
            "views": int(node.get("video_view_count") or node.get("play_count") or 0),
            "likes": int((node.get("edge_media_preview_like") or {}).get("count") or node.get("like_count") or 0),
            "comments": int((node.get("edge_media_to_comment") or {}).get("count") or node.get("comment_count") or 0),
            "published_at": datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat() if ts else None,
        })
    return result


async def _verify_instagram(username: str) -> dict:
    """Verify Instagram account. Primary: httpx API. Fallback: Playwright. Last resort: instaloader."""
    username = username.lstrip("@")
    # Primary: httpx Instagram internal API
    try:
        data = await _scrape_instagram_api(username)
        return _parse_instagram_profile(data)
    except Exception as e:
        logger.warning(f"Instagram httpx API failed for @{username}: {e}")
    # Fallback: Playwright browser interception
    if PLAYWRIGHT_AVAILABLE:
        try:
            data = await _scrape_instagram_playwright(username)
            return _parse_instagram_profile(data)
        except Exception as e:
            logger.warning(f"Playwright Instagram failed for @{username}: {e}")
    # Last resort: instaloader
    if INSTALOADER_AVAILABLE:
        loop = asyncio.get_event_loop()
        def _il_verify():
            L = instaloader.Instaloader()
            profile = instaloader.Profile.from_username(L.context, username)
            return {
                "display_name": profile.full_name or username,
                "avatar_url": profile.profile_pic_url,
                "follower_count": profile.followers,
                "platform_channel_id": str(profile.userid),
            }
        return await loop.run_in_executor(_thread_pool, _il_verify)
    raise ValueError(f"Impossible de vérifier Instagram @{username}")


async def verify_account(platform: str, username: str) -> dict:
    if platform == "youtube":
        return await _verify_youtube(username)
    elif platform == "tiktok":
        return await _verify_tiktok(username)
    elif platform == "instagram":
        return await _verify_instagram(username)
    else:
        raise ValueError(f"Plateforme inconnue: {platform}")

async def _verify_and_update_account(account_id: str, platform: str, username: str, via_url: bool = False):
    try:
        info = await verify_account(platform, username)
        await db.social_accounts.update_one(
            {"account_id": account_id},
            {"$set": {
                "status": "verified",
                "display_name": info.get("display_name"),
                "avatar_url": info.get("avatar_url"),
                "follower_count": info.get("follower_count"),
                "platform_channel_id": info.get("platform_channel_id"),
                "verified_at": datetime.now(timezone.utc).isoformat(),
                "error_message": None,
            }}
        )
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

        if via_url:
            # Fallback via URL : GET request + parse body to confirm account existence
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
                                # Check for "404" or not-found markers in YouTube page
                                not_found_markers = ["This channel doesn't exist", "404", "ytInitialData"]
                                # ytInitialData must be present on a valid page
                                if "ytInitialData" in body:
                                    http_ok = True
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

# ---------- Video fetching ----------

async def _fetch_tiktok_videos_async(username: str, since_days: int = 30) -> list:
    """
    Fetch TikTok videos. Priority: TikWm API (cloud-safe) → Playwright → yt-dlp.
    """
    username = username.lstrip("@")
    # Primary: TikWm API — no cloud blocking, paginated, free
    try:
        videos = await _fetch_tiktok_tikwm(username)
        if videos:
            logger.info(f"TikWm fetched {len(videos)} videos for @{username}")
            return videos
        logger.warning(f"TikWm returned 0 videos for @{username}")
    except Exception as e:
        logger.warning(f"TikWm fetch failed for @{username}: {e}")
    # Fallback: Playwright (pas de filtre de date — toutes les vidéos)
    if PLAYWRIGHT_AVAILABLE:
        try:
            scraped = await _scrape_tiktok_playwright(username)
            videos = _parse_tiktok_videos(scraped)
            return videos
        except Exception as e:
            logger.warning(f"Playwright TikTok video fetch failed for @{username}: {e}")
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
            raise
    raise ValueError("yt-dlp non installé — scraping TikTok impossible")


async def _fetch_instagram_videos_async(username: str, platform_channel_id: str = None, since_days: int = 3650) -> list:
    """
    Fetch Instagram videos — instaloader en priorité (plus fiable), puis API httpx.
    Récupère TOUTES les vidéos (Reels inclus), sans filtre de date.
    """
    username = username.lstrip("@")
    # Priorité 1 : instaloader (le plus fiable pour les comptes publics)
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
                # Récupère vidéos ET reels (is_video = True pour les deux)
                if not post.is_video:
                    continue
                result.append({
                    "platform_video_id": str(post.mediaid),
                    "url": f"https://www.instagram.com/p/{post.shortcode}/",
                    "title": (post.caption or "")[:150],
                    "thumbnail_url": post.url,
                    "views": post.video_view_count or 0,
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
    # Fallback : API httpx Instagram (scrape léger)
    try:
        data = await _scrape_instagram_api(username)
        return _parse_instagram_videos(data)
    except Exception as e:
        logger.warning(f"Instagram httpx video fetch failed for @{username}: {e}")
    # Dernier recours : Playwright
    if PLAYWRIGHT_AVAILABLE:
        try:
            data = await _scrape_instagram_playwright(username)
            return _parse_instagram_videos(data)
        except Exception as e:
            logger.warning(f"Playwright Instagram video fetch failed for @{username}: {e}")
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

async def fetch_videos(platform: str, username: str, account: dict, since_days: int = 30) -> list:
    if platform == "youtube":
        channel_id = account.get("platform_channel_id")
        return await _fetch_youtube_videos(channel_id, since_days)
    elif platform == "tiktok":
        return await _fetch_tiktok_videos_async(username, since_days)
    elif platform == "instagram":
        platform_channel_id = account.get("platform_channel_id")
        return await _fetch_instagram_videos_async(username, platform_channel_id, since_days)
    return []

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
            account = await db.social_accounts.find_one(
                {"account_id": account_id, "status": "verified"}, {"_id": 0}
            )
            if not account:
                continue
            platform = account["platform"]
            username = account["username"]
            try:
                videos = await fetch_videos(platform, username, account, since_days=30)
                now_iso = datetime.now(timezone.utc).isoformat()
                if not videos:
                    await db.social_accounts.update_one(
                        {"account_id": account_id},
                        {"$set": {"last_tracked_at": now_iso}}
                    )
                    await asyncio.sleep(0.5)
                    continue
                for vid in videos:
                    if not vid.get("platform_video_id"):
                        continue
                    earnings = (vid["views"] / 1000) * rpm
                    doc = {
                        "video_id": f"vid_{uuid.uuid4().hex[:12]}",
                        "platform_video_id": vid["platform_video_id"],
                        "account_id": account_id,
                        "user_id": user_id,
                        "campaign_id": campaign_id,
                        "platform": platform,
                        "url": vid.get("url", ""),
                        "title": vid.get("title"),
                        "thumbnail_url": vid.get("thumbnail_url"),
                        "views": vid["views"],
                        "likes": vid["likes"],
                        "comments": vid["comments"],
                        "published_at": vid.get("published_at"),
                        "fetched_at": now_iso,
                        "earnings": round(earnings, 4),
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
                    {"account_id": account_id},
                    {"$set": {"last_tracked_at": now_iso}}
                )
                # jitter to reduce rate-limit risk
                await asyncio.sleep(1)
            except Exception as e:
                logger.warning(f"Tracking failed for {platform}/@{username}: {e}")
    logger.info("Video tracking run complete.")

async def track_videos_loop():
    while True:
        try:
            await run_video_tracking()
        except Exception as e:
            logger.error(f"Video tracking loop error: {e}")
        await asyncio.sleep(24 * 3600)

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
    account = await db.social_accounts.find_one({
        "account_id": account_id,
        "user_id": user["user_id"]
    })
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    existing = await db.campaign_social_accounts.find_one({
        "campaign_id": campaign_id,
        "account_id": account_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already assigned")
    
    assignment = {
        "id": f"csa_{uuid.uuid4().hex[:12]}",
        "campaign_id": campaign_id,
        "user_id": user["user_id"],
        "account_id": account_id,
        "assigned_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.campaign_social_accounts.insert_one(assignment)
    return {"message": "Account assigned"}

@api_router.delete("/campaigns/{campaign_id}/social-accounts/{account_id}")
async def remove_account_from_campaign(campaign_id: str, account_id: str, user: dict = Depends(get_current_user)):
    result = await db.campaign_social_accounts.delete_one({
        "campaign_id": campaign_id,
        "account_id": account_id,
        "user_id": user["user_id"]
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"message": "Account removed from campaign"}

@api_router.post("/social-accounts/{account_id}/refresh")
async def refresh_social_account(account_id: str, user: dict = Depends(get_current_user)):
    """Re-trigger verification for a social account"""
    account = await db.social_accounts.find_one({"account_id": account_id, "user_id": user["user_id"]}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.social_accounts.update_one({"account_id": account_id}, {"$set": {"status": "pending", "error_message": None}})
    asyncio.create_task(_verify_and_update_account(account_id, account["platform"], account["username"]))
    return {"message": "Vérification relancée"}

def _generate_simulated_videos(platform: str, username: str, account_id: str, count: int = 4) -> list:
    """Generate realistic simulated videos when real scraping is unavailable."""
    import random as _rnd
    titles_tiktok = [
        "POV : quand tu découvres ce hack 🔥", "Trend du moment 💀", "Essayez ça chez vous 👀",
        "On a testé et c'est incroyable", "Tu savais que... ?", "Le clip le plus fou de la semaine",
        "Réaction honnête 😅", "Challenge accepté !", "Ça m'a pris 5 min pour faire ça",
    ]
    titles_ig = [
        "Reel de la semaine ✨", "Nouvelle tendance 🔥", "Check this out 👀",
        "Transformation incroyable", "Résultats après 30 jours", "Le secret que personne ne te dit",
    ]
    titles_yt = [
        "Je teste la tendance TikTok", "Vlog de la semaine", "Résultats choquants",
        "Mon setup 2025", "Tutorial complet", "La vérité sur...",
    ]
    titles = titles_tiktok if platform == "tiktok" else (titles_ig if platform == "instagram" else titles_yt)
    result = []
    base_views = _rnd.randint(8_000, 250_000)
    for i in range(count):
        vid_views = int(base_views * _rnd.uniform(0.4, 2.5))
        days_ago = _rnd.randint(i * 4 + 1, i * 4 + 10)
        pub_dt = datetime.now(timezone.utc) - timedelta(days=days_ago)
        fake_id = f"sim_{uuid.uuid4().hex[:12]}"
        result.append({
            "platform_video_id": fake_id,
            "url": f"https://www.{'tiktok.com/@' if platform=='tiktok' else 'instagram.com/p/' if platform=='instagram' else 'youtube.com/shorts/'}{username}/{fake_id}",
            "title": _rnd.choice(titles),
            "thumbnail_url": None,
            "views": vid_views,
            "likes": int(vid_views * _rnd.uniform(0.03, 0.10)),
            "comments": int(vid_views * _rnd.uniform(0.002, 0.008)),
            "published_at": pub_dt.isoformat(),
            "simulated": True,
        })
    return result

@api_router.post("/social-accounts/{account_id}/scrape-now")
async def scrape_account_now(account_id: str, user: dict = Depends(get_current_user)):
    """Immediately scrape videos for a verified social account (useful for testing)."""
    account = await db.social_accounts.find_one(
        {"account_id": account_id, "user_id": user["user_id"], "status": "verified"}, {"_id": 0}
    )
    if not account:
        raise HTTPException(status_code=404, detail="Compte introuvable ou non vérifié")
    platform = account["platform"]
    username = account.get("username") or account.get("account_url") or ""
    now_iso = datetime.now(timezone.utc).isoformat()

    scrape_error = None
    try:
        # Récupère TOUTES les vidéos (3650 jours = 10 ans = historique complet)
        videos = await fetch_videos(platform, username, account, since_days=3650)
    except Exception as e:
        logger.warning(f"Scraping failed for {platform}/@{username}: {e}")
        scrape_error = str(e)
        videos = []

    if not videos and scrape_error:
        raise HTTPException(
            status_code=503,
            detail=f"Le scraping a échoué pour {platform}/@{username}. "
                   f"Vérifiez que le compte est bien public. Erreur : {scrape_error}"
        )

    if not videos:
        platform_tips = {
            "tiktok": f"Aucune vidéo trouvée pour @{username} sur TikTok. Vérifiez que le compte est public et a au moins une vidéo publiée.",
            "instagram": "Aucune vidéo trouvée. Vérifiez que le compte Instagram est public et a des Reels/vidéos publiés.",
            "youtube": "Aucune vidéo trouvée. Vérifiez que la chaîne YouTube a des vidéos publiques.",
        }
        raise HTTPException(
            status_code=422,
            detail=platform_tips.get(platform, f"Aucune vidéo trouvée pour {platform}/@{username}. Compte privé ou vide ?")
        )

    # Chercher les campagnes auxquelles ce compte est assigné
    assignments = await db.campaign_social_accounts.find(
        {"account_id": account_id}, {"_id": 0, "campaign_id": 1}
    ).to_list(50)
    linked_campaign_ids = [a["campaign_id"] for a in assignments]

    # Récupérer le RPM des campagnes liées pour calculer les gains
    campaign_rpms = {}
    for cid in linked_campaign_ids:
        camp = await db.campaigns.find_one({"campaign_id": cid}, {"_id": 0, "rpm": 1})
        if camp:
            campaign_rpms[cid] = camp.get("rpm", 0)

    # campaign_id principal = le premier lié (ou None si aucun)
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
            "user_id": user["user_id"],
            "campaign_id": primary_campaign_id,   # ← lié à la campagne automatiquement
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
    await db.social_accounts.update_one({"account_id": account_id}, {"$set": {"last_tracked_at": now_iso}})
    campaigns_info = f" (campagne : {primary_campaign_id})" if primary_campaign_id else ""
    return {"message": f"{saved} vidéo(s) importées depuis {platform}/@{username}{campaigns_info}", "count": saved, "simulated": False}

@api_router.get("/social-accounts/{account_id}/videos")
async def get_account_videos(account_id: str, user: dict = Depends(get_current_user)):
    """Get tracked videos for a social account"""
    account = await db.social_accounts.find_one({"account_id": account_id, "user_id": user["user_id"]}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    videos = await db.tracked_videos.find({"account_id": account_id}, {"_id": 0}).sort("published_at", -1).to_list(100)
    return {"videos": videos}

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

# ================= MESSAGES & CHAT =================

@api_router.get("/campaigns/{campaign_id}/messages")
async def get_messages(campaign_id: str, user: dict = Depends(get_current_user)):
    messages = await db.messages.find(
        {"campaign_id": campaign_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"messages": list(reversed(messages))}

@api_router.get("/messages/unread-counts")
async def get_unread_counts(user: dict = Depends(get_current_user)):
    """Retourne le nombre de messages non lus par campagne depuis le dernier vu."""
    uid = user["user_id"]
    # Récupérer les campagnes de l'utilisateur
    memberships = await db.campaign_members.find(
        {"user_id": uid}, {"_id": 0, "campaign_id": 1}
    ).to_list(200)
    campaign_ids = list(set(m["campaign_id"] for m in memberships))
    # Pour les agences, ajouter leurs propres campagnes
    if user.get("role") == "agency":
        own = await db.campaigns.find({"agency_id": uid}, {"_id": 0, "campaign_id": 1}).to_list(200)
        campaign_ids = list(set(campaign_ids + [c["campaign_id"] for c in own]))

    counts = {}
    for cid in campaign_ids:
        # Récupérer la date du dernier "vu" de cet utilisateur pour cette campagne
        seen_doc = await db.message_reads.find_one({"user_id": uid, "campaign_id": cid}, {"_id": 0})
        last_seen = seen_doc.get("last_seen_at") if seen_doc else None
        query = {"campaign_id": cid, "sender_id": {"$ne": uid}}
        if last_seen:
            query["created_at"] = {"$gt": last_seen}
        count = await db.messages.count_documents(query)
        if count > 0:
            counts[cid] = count
    return {"unread": counts}

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
    message = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "campaign_id": message_data.campaign_id,
        "sender_id": user["user_id"],
        "sender_name": user.get("display_name") or user.get("name"),
        "sender_role": user.get("role"),
        "recipient_id": message_data.recipient_id,
        "content": message_data.content,
        "message_type": message_data.message_type,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.messages.insert_one(message)
    message.pop("_id", None)
    
    await manager.broadcast_to_campaign(message_data.campaign_id, {
        "type": "new_message",
        "message": message
    })
    
    return message

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
    user_id = user["user_id"]
    existing = await db.announcement_likes.find_one({"announcement_id": announcement_id, "user_id": user_id})
    if existing:
        await db.announcement_likes.delete_one({"announcement_id": announcement_id, "user_id": user_id})
        liked = False
    else:
        await db.announcement_likes.insert_one({"announcement_id": announcement_id, "user_id": user_id})
        liked = True
    count = await db.announcement_likes.count_documents({"announcement_id": announcement_id})
    return {"liked": liked, "count": count}


@api_router.get("/announcements/{announcement_id}/likes")
async def get_likes(announcement_id: str, user: dict = Depends(get_current_user)):
    user_id = user["user_id"]
    count = await db.announcement_likes.count_documents({"announcement_id": announcement_id})
    liked = await db.announcement_likes.find_one({"announcement_id": announcement_id, "user_id": user_id}) is not None
    return {"count": count, "liked": liked}


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
    
    clippers = []
    for member in members:
        clipper_user = await db.users.find_one(
            {"user_id": member["user_id"]},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "display_name": 1, "picture": 1}
        )
        
        if clipper_user:
            # Get last advice for this clipper in this campaign
            last_advice = await db.advices.find_one(
                {
                    "campaign_id": campaign_id,
                    "recipient_ids": member["user_id"]
                },
                {"_id": 0},
                sort=[("created_at", -1)]
            )
            
            hours_since_advice = None
            needs_advice = True
            
            if last_advice:
                last_time = datetime.fromisoformat(last_advice["created_at"])
                if last_time.tzinfo is None:
                    last_time = last_time.replace(tzinfo=timezone.utc)
                hours_since_advice = (datetime.now(timezone.utc) - last_time).total_seconds() / 3600
                needs_advice = hours_since_advice >= 72
            
            # Get social accounts for this clipper
            clipper_social_accounts = await db.social_accounts.find(
                {"user_id": member["user_id"]},
                {"_id": 0, "platform": 1, "username": 1, "account_url": 1, "status": 1}
            ).to_list(20)

            clippers.append({
                **clipper_user,
                "hours_since_advice": round(hours_since_advice, 1) if hours_since_advice else None,
                "needs_advice": needs_advice,
                "last_advice_at": last_advice["created_at"] if last_advice else None,
                "social_accounts": clipper_social_accounts
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

    total_views = 0
    clipper_stats = []

    for member in members:
        # Aggregate real views from posts
        posts = await db.posts.find(
            {"campaign_id": campaign_id, "user_id": member["user_id"]},
            {"_id": 0, "views": 1}
        ).to_list(10000)
        views = sum(p.get("views", 0) for p in posts)
        earnings = (views / 1000) * campaign["rpm"]

        clipper_user = await db.users.find_one(
            {"user_id": member["user_id"]},
            {"_id": 0, "display_name": 1, "name": 1, "picture": 1}
        )

        clipper_stats.append({
            "user_id": member["user_id"],
            "display_name": clipper_user.get("display_name") or clipper_user.get("name") if clipper_user else member["user_id"],
            "picture": clipper_user.get("picture") if clipper_user else None,
            "views": views,
            "post_count": len(posts),
            "earnings": round(earnings, 2),
            "strikes": member.get("strikes", 0),
            "status": member.get("status", "active")
        })
        total_views += views

    clipper_stats_sorted = sorted(clipper_stats, key=lambda x: x["views"], reverse=True)
    for i, cs in enumerate(clipper_stats_sorted):
        cs["rank"] = i + 1

    return {
        "campaign_id": campaign_id,
        "total_views": total_views,
        "budget_used": round((total_views / 1000) * campaign["rpm"], 2),
        "budget_total": campaign.get("budget_total"),
        "budget_unlimited": campaign.get("budget_unlimited", False),
        "clipper_count": len(members),
        "clipper_stats": clipper_stats_sorted
    }

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
            rpm = campaign.get("rpm", 0)
            # Réutilise le calcul unifié (tracked_videos + manual posts)
            calc = await _calc_earnings_for_member(campaign["campaign_id"], user["user_id"], rpm)
            views = calc["views"]
            earnings = calc["earned"]
            total_earnings += earnings
            total_views += views
            campaign_stats.append({
                "campaign_id": campaign["campaign_id"],
                "campaign_name": campaign["name"],
                "views": views,
                "earnings": round(earnings, 2),
                "paid": calc["paid"],
                "owed": calc["owed"],
                "strikes": membership.get("strikes", 0),
                "status": membership.get("status", "active")
            })

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

    try:
        if STRIPE_WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        else:
            event = json.loads(payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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

async def _calc_earnings_for_member(campaign_id: str, user_id: str, rpm: float) -> dict:
    """
    Calculate total views and earnings for a clipper on a campaign.

    Sources (union, dédupliqué par platform_video_id) :
    1. tracked_videos liés à ce campaign_id directement
    2. tracked_videos des comptes sociaux assignés à cette campagne (campaign_social_accounts)
    3. posts soumis manuellement (db.posts)
    """
    seen_video_ids = set()
    total_views = 0

    # ── Source 1 : tracked_videos avec campaign_id explicite ──────────────
    t_vids = await db.tracked_videos.find(
        {"campaign_id": campaign_id, "user_id": user_id},
        {"_id": 0, "platform_video_id": 1, "views": 1}
    ).to_list(10000)
    for v in t_vids:
        vid_key = v.get("platform_video_id") or v.get("video_id", "")
        if vid_key and vid_key not in seen_video_ids:
            seen_video_ids.add(vid_key)
            total_views += v.get("views", 0)

    # ── Source 2 : comptes assignés à la campagne (même si campaign_id=None) ──
    assignments = await db.campaign_social_accounts.find(
        {"campaign_id": campaign_id, "user_id": user_id},
        {"_id": 0, "account_id": 1}
    ).to_list(100)
    account_ids = [a["account_id"] for a in assignments]
    if account_ids:
        acc_vids = await db.tracked_videos.find(
            {"account_id": {"$in": account_ids}},
            {"_id": 0, "platform_video_id": 1, "views": 1}
        ).to_list(10000)
        for v in acc_vids:
            vid_key = v.get("platform_video_id") or v.get("video_id", "")
            if vid_key and vid_key not in seen_video_ids:
                seen_video_ids.add(vid_key)
                total_views += v.get("views", 0)

    # ── Source 3 : posts manuels ────────────────────────────────────────────
    manual_posts = await db.posts.find(
        {"campaign_id": campaign_id, "user_id": user_id},
        {"_id": 0, "post_id": 1, "views": 1}
    ).to_list(10000)
    for p in manual_posts:
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
    }

@api_router.get("/campaigns/{campaign_id}/payment-summary")
async def get_campaign_payment_summary(campaign_id: str, user: dict = Depends(get_current_user)):
    """Payment summary for a campaign.
    - Agency/manager: returns all clippers with earnings + owed
    - Clipper: returns only their own summary
    """
    campaign = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    rpm = campaign.get("rpm", 0)

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
            data = await _calc_earnings_for_member(campaign_id, m["user_id"], rpm)
            result.append({**clipper, **data})
        result.sort(key=lambda x: x["earned"], reverse=True)
        return {"role": "agency", "clippers": result, "campaign_name": campaign.get("name"), "rpm": rpm}

    else:  # clipper view
        data = await _calc_earnings_for_member(campaign_id, user["user_id"], rpm)
        return {
            "role": "clipper",
            "campaign_name": campaign.get("name"),
            "rpm": rpm,
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

    rows = []
    for campaign in campaigns:
        rpm = campaign.get("rpm", 0)
        members = await db.campaign_members.find(
            {"campaign_id": campaign["campaign_id"], "role": "clipper"},
            {"_id": 0, "user_id": 1}
        ).to_list(200)
        for m in members:
            clipper = await db.users.find_one(
                {"user_id": m["user_id"]},
                {"_id": 0, "user_id": 1, "display_name": 1, "name": 1, "picture": 1, "payment_info": 1}
            )
            if not clipper:
                continue
            data = await _calc_earnings_for_member(campaign["campaign_id"], m["user_id"], rpm)
            if data["earned"] > 0:
                rows.append({
                    **clipper,
                    "campaign_id": campaign["campaign_id"],
                    "campaign_name": campaign.get("name"),
                    "rpm": rpm,
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
    amount = float(body.get("amount", 0))

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
    "plan_small":     {"name": "Petite",       "amount": 7900,  "label": "79€/mois"},
    "plan_medium":    {"name": "Assez Grosse",  "amount": 19900, "label": "199€/mois"},
    "plan_unlimited": {"name": "Illimitée",     "amount": 59900, "label": "599€/mois"},
}

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
            message = json.loads(data)
            
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)

# ================= ADMIN ROUTES =================

async def verify_admin_code(request: Request):
    """Dependency: verify X-Admin-Code header against env var."""
    code = request.headers.get("X-Admin-Code", "")
    if not code or not hmac.compare_digest(code, ADMIN_SECRET_CODE):
        raise HTTPException(status_code=403, detail="Code admin invalide")
    return True

@api_router.get("/admin/verify")
async def admin_verify(request: Request):
    """Verify admin code — returns 200 if valid, 403 if not."""
    await verify_admin_code(request)
    return {"ok": True}

@api_router.get("/admin/stats")
async def admin_stats(request: Request, _: bool = Depends(verify_admin_code)):
    users_count = await db.users.count_documents({})
    campaigns_count = await db.campaigns.count_documents({})
    videos_count = await db.tracked_videos.count_documents({})
    accounts_count = await db.social_accounts.count_documents({})
    messages_count = await db.messages.count_documents({})
    members_count = await db.campaign_members.count_documents({})
    # Revenue: sum of earnings in euros
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    result = await db.earnings.aggregate(pipeline).to_list(1)
    total_earnings = result[0]["total"] if result else 0
    return {
        "users": users_count,
        "campaigns": campaigns_count,
        "tracked_videos": videos_count,
        "social_accounts": accounts_count,
        "messages": messages_count,
        "campaign_members": members_count,
        "total_earnings_eur": round(total_earnings, 2),
    }

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

    async def test_playwright():
        t = time.time()
        if not PLAYWRIGHT_AVAILABLE:
            return {"status": "not_installed", "error": "Playwright non installé"}
        try:
            async with _playwright_api() as pw:
                browser = await pw.chromium.launch(headless=True, args=["--no-sandbox"])
                await browser.close()
            return {"status": "ok", "latency_ms": round((time.time() - t) * 1000)}
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

    results = await asyncio.gather(
        test_mongodb(), test_youtube(), test_playwright(), test_stripe(), test_google_oauth(),
        return_exceptions=False
    )
    return {
        "mongodb": results[0],
        "youtube_api": results[1],
        "playwright": results[2],
        "stripe": results[3],
        "google_oauth": results[4],
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
async def admin_get_posts(request: Request):
    verify_admin_code(request)
    posts = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for p in posts:
        agency = await db.users.find_one({"user_id": p.get("agency_id")}, {"_id": 0, "display_name": 1})
        p["agency_name"] = agency.get("display_name") if agency else "—"
    return posts

@api_router.delete("/admin/posts/{post_id}")
async def admin_delete_post(post_id: str, request: Request):
    verify_admin_code(request)
    result = await db.announcements.delete_one({"announcement_id": post_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Post introuvable")
    return {"message": "Post supprimé"}

@api_router.get("/admin/all-campaigns")
async def admin_get_all_campaigns(request: Request):
    verify_admin_code(request)
    campaigns = await db.campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for c in campaigns:
        agency = await db.users.find_one({"user_id": c.get("agency_id")}, {"_id": 0, "display_name": 1})
        c["agency_name"] = agency.get("display_name") if agency else "—"
        c["member_count"] = await db.campaign_members.count_documents({"campaign_id": c["campaign_id"]})
    return campaigns

# ================= HEALTH & ROOT =================

@api_router.get("/")
async def root():
    return {"message": "The Clip Deal Track API"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

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
    try:
        await db.tracked_videos.create_index(
            [("account_id", 1), ("platform_video_id", 1)], unique=True
        )
    except Exception:
        pass
    try:
        await db.message_reads.create_index([("user_id", 1), ("campaign_id", 1)], unique=True)
        await db.messages.create_index([("campaign_id", 1), ("created_at", 1)])
    except Exception:
        pass
    asyncio.create_task(auto_strike_loop())
    asyncio.create_task(track_videos_loop())

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
                # Check if a strike was already issued for this inactivity period
                recent_strike = await db.strikes.find_one({
                    "campaign_id": campaign_id,
                    "user_id": member["user_id"],
                    "auto": True,
                    "created_at": {"$gte": (now - timedelta(days=strike_days)).isoformat()}
                })
                if recent_strike:
                    continue

                # Issue automatic strike
                strike = {
                    "strike_id": f"str_{uuid.uuid4().hex[:12]}",
                    "campaign_id": campaign_id,
                    "user_id": member["user_id"],
                    "reason": f"Inactivité de {days_inactive} jours (seuil : {strike_days} jours)",
                    "auto": True,
                    "created_at": now.isoformat()
                }
                await db.strikes.insert_one(strike)

                new_strikes = member.get("strikes", 0) + 1
                update = {"strikes": new_strikes}

                if new_strikes >= max_strikes:
                    update["status"] = "suspended"
                    logger.info(f"Clipper {member['user_id']} suspended in campaign {campaign_id}")

                await db.campaign_members.update_one(
                    {"member_id": member["member_id"]},
                    {"$set": update}
                )

                # Notify via WebSocket
                await manager.send_to_user(member["user_id"], {
                    "type": "strike_issued",
                    "campaign_id": campaign_id,
                    "strikes": new_strikes,
                    "suspended": new_strikes >= max_strikes
                })

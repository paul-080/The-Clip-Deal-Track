import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useAuth, API } from "../App";

// Proxy les images Instagram/TikTok (CDN URLs expirent côté navigateur)
const imgSrc = (url) => {
  if (!url) return null;
  if (
    url.includes("cdninstagram") || url.includes("fbcdn.net") ||
    url.includes("tiktokcdn") || url.includes("p16-sign")
  ) {
    return `${API}/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
};

// Nombre de vues PRECIS — pas d'arrondi, format français avec espaces (ex: 22 643, 1 234 567)
const fmtViews = (n) => {
  if (!n || n === 0) return "0";
  return Math.floor(Number(n)).toLocaleString("fr-FR");
};
import Sidebar from "../components/Sidebar";
import ScrapeStatusPanel from "../components/ScrapeStatusPanel";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Home, Search, Plus, Link2, CreditCard, Settings, MessageCircle,
  Video, Users, User, Eye, DollarSign, Copy, Check, Image, AlertTriangle,
  TrendingUp, BarChart3, ExternalLink, Heart, MessageSquare, ArrowUpDown,
  ChevronUp, ChevronDown, RefreshCw, Play, HelpCircle, MousePointerClick, Calendar,
  ThumbsUp, ThumbsDown, Share2, ChevronRight, BarChart2, X
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { PostCard, PostComposer } from "../components/AnnouncementFeed";
import { Checkbox } from "../components/ui/checkbox";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import ChatPanel from "../components/ChatPanel";
import SupportPage from "../components/SupportPage";

const ACCENT_COLOR = "#FF007F";

export default function AgencyDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [campaigns, setCampaigns] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [supportUnread, setSupportUnread] = useState(0);

  useEffect(() => {
    fetchData();
    fetchUnreadCounts();
    const interval = setInterval(fetchUnreadCounts, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start trial once for new agencies (runs when user is available)
  useEffect(() => {
    if (!user || user.trial_started_at || user.subscription_status) return;
    fetch(`${API}/subscription/start-trial`, { method: "POST", credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(() => {
        if (location.pathname === "/agency" || location.pathname === "/agency/") {
          navigate("/agency/welcome");
        }
      })
      .catch(() => {});
  }, [user?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchUnreadCounts = async () => {
    try {
      const res = await fetch(`${API}/messages/unread-counts`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUnreadCounts(data.unread || {});
        setSupportUnread(data.support_unread || 0);
      }
    } catch {}
  };

  const fetchData = async () => {
    try {
      const [campaignsRes, announcementsRes] = await Promise.all([
        fetch(`${API}/campaigns`, { credentials: "include" }),
        fetch(`${API}/announcements`, { credentials: "include" }),
      ]);

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
      }
      if (announcementsRes.ok) {
        const data = await announcementsRes.json();
        setAnnouncements(data.announcements || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const sidebarItems = [
    { id: "home", label: "Accueil — Annonces", icon: Home, path: "/agency" },
    { id: "discover", label: "Découvrir", icon: Search, path: "/agency/discover" },
    { id: "create", label: "Lancer une campagne", icon: Plus, path: "/agency/create" },
    { type: "divider" },
    { type: "section", label: "MES CAMPAGNES" },
    ...campaigns.map((c) => ({
      id: `campaign-${c.campaign_id}`,
      label: c.name,
      icon: Video,
      path: `/agency/campaign/${c.campaign_id}`,
      children: [
        {
          id: `chat-${c.campaign_id}`,
          label: `Chat — ${c.name}`,
          icon: MessageCircle,
          path: `/agency/campaign/${c.campaign_id}/chat`,
          badge: unreadCounts[c.campaign_id] || 0,
        },
      ],
    })),
    { type: "divider" },
    { id: "links", label: "Liens d'accès", icon: Link2, path: "/agency/links" },
    { id: "payment", label: "Paiement", icon: CreditCard, path: "/agency/payment" },
    { id: "support", label: "Support", icon: HelpCircle, path: "/agency/support", badge: supportUnread },
    { id: "settings", label: "Paramètres", icon: Settings, path: "/agency/settings" },
  ];

  return (
    <div className="flex min-h-screen bg-[#0A0A0A]">
      <Sidebar 
        items={sidebarItems} 
        accentColor={ACCENT_COLOR}
        role="agency"
      />
      <main className={`flex-1 md:ml-60 ${location.pathname.includes("/chat") ? "h-screen overflow-hidden" : "p-4 pt-16 md:p-8"}`}>
        <Routes>
          <Route index element={<AgencyHome announcements={announcements} onUpdate={fetchData} />} />
          <Route path="welcome" element={<WelcomePage />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="create" element={<CreateCampaign onCreated={fetchData} />} />
          <Route path="campaign/:campaignId" element={<CampaignDashboard campaigns={campaigns} />} />
          <Route path="campaign/:campaignId/chat" element={<ChatPanel campaigns={campaigns} />} />
          <Route path="links" element={<LinksPage />} />
          <Route path="payment" element={<PaymentPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

// Welcome / Trial Activated Page
function WelcomePage() {
  const navigate = useNavigate();
  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-center min-h-[80vh]"
    >
      <div className="max-w-lg w-full text-center space-y-8">
        <div className="w-20 h-20 rounded-2xl bg-[#FF007F]/20 flex items-center justify-center mx-auto">
          <span className="text-4xl">🎉</span>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white mb-3">2 semaines gratuites activées !</h1>
          <p className="text-white/50 text-base leading-relaxed">
            Votre essai gratuit est actif jusqu'au <span className="text-white font-medium">{fmt(trialEnd)}</span>.
            Créez vos premières campagnes et invitez vos clippers sans restriction.
          </p>
        </div>
        <div className="bg-[#121212] border border-white/10 rounded-2xl p-6 text-left space-y-3">
          <p className="text-white font-semibold text-sm mb-2">Inclus dans votre essai :</p>
          {["Campagnes illimitées pendant 14 jours", "Invitation de clippers sans limite", "Tracking automatique TikTok / Instagram / YouTube", "Chat par campagne", "Tableau de bord analytique"].map(f => (
            <div key={f} className="flex items-center gap-3 text-sm text-white/70">
              <span className="text-[#39FF14]">✓</span> {f}
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => navigate("/agency/create")}
            className="bg-[#FF007F] hover:bg-[#FF007F]/80 text-white px-8 py-3 text-base font-semibold"
          >
            Créer ma première campagne
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate("/agency/settings")}
            className="text-white/50 hover:text-white text-sm"
          >
            Voir les offres d'abonnement
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// Agency Home with Announcements (uses shared PostCard + PostComposer)
function AgencyHome({ announcements, onUpdate }) {
  const { user } = useAuth();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
      data-testid="agency-home"
    >
      <div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-2">Accueil — Annonces</h1>
        <p className="text-white/50">Publiez des annonces pour vos clippeurs (avec photo, like, dislike, commentaires)</p>
      </div>

      {/* Composer (avec upload photo) */}
      <PostComposer user={user} onPosted={onUpdate} />

      {/* Feed */}
      {announcements.length === 0 ? (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-8 text-center">
            <p className="text-white/50">Aucune annonce publiée</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann) => (
            <PostCard key={ann.announcement_id} ann={ann} currentUser={user} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

const SORT_OPTIONS_DISCOVER = [
  { value: "recent", label: "Plus récentes" },
  { value: "rpm", label: "Meilleure rémunération" },
  { value: "budget", label: "Budget restant" },
  { value: "views", label: "Plus de vues" },
];

// Discover Page for Agency
function DiscoverPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState("recent");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchCampaigns();
  }, [debouncedSearch, sort]);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      params.set("sort", sort);
      const res = await fetch(`${API}/campaigns/discover?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="agency-discover"
    >
      <div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-2">Découvrir</h1>
        <p className="text-white/50">Campagnes des autres agences (lecture seule)</p>
      </div>

      {/* Search + Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une campagne ou une agence…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors">
              ✕
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {SORT_OPTIONS_DISCOVER.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                sort === opt.value
                  ? "bg-white/15 text-white border border-white/25"
                  : "bg-white/5 text-white/50 border border-white/8 hover:bg-white/10 hover:text-white/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-[#121212] border-white/10">
              <CardContent className="p-6">
                <div className="skeleton h-8 w-3/4 rounded mb-4" />
                <div className="skeleton h-4 w-1/2 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-8 text-center">
            <p className="text-white/50">{search ? `Aucun résultat pour "${search}"` : "Aucune campagne disponible"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <div key={campaign.campaign_id} data-campaign-id={campaign.campaign_id} data-campaign-name={campaign.name} className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all group">
              {/* Cover */}
              <div
                className="h-32 relative overflow-hidden"
                style={{ background: campaign.image_url ? `url(${campaign.image_url}) center/cover no-repeat` : "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
              >
                <div className="absolute inset-0 bg-black/30" />
                <div className="absolute top-3 right-3 flex gap-1">
                  {(campaign.platforms || []).map(p => (
                    <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-black/60 text-white border border-white/20 font-medium">
                      {p === "tiktok" ? "TikTok" : p === "instagram" ? "IG" : p === "youtube" ? "YT" : p}
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-4 space-y-2">
                {campaign.agency_name && <p className="text-xs text-white/40">{campaign.agency_name}</p>}
                <h3 className="text-white font-bold text-sm leading-tight group-hover:text-[#FF007F] transition-colors">{campaign.name}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {campaign.payment_model === "clicks" ? (
                    <>
                      <span className="text-xs font-bold text-[#f0c040] bg-[#f0c040]/10 px-2 py-0.5 rounded-md">
                        🔗 {campaign.rate_per_click || 0}€ / 1K clics
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-bold text-[#39FF14] bg-[#39FF14]/10 px-2 py-0.5 rounded-md">
                      💰 {campaign.rpm || 0}€ / 1K vues
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {campaign.budget_unlimited ? (
                    <div className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-[#39FF14]/10 border border-[#39FF14]/25">
                      <span className="text-[#39FF14] text-xs font-semibold">♾️ Budget illimité</span>
                    </div>
                  ) : (() => {
                    const total = Number(campaign.budget || campaign.budget_total || 0);
                    const used = Number(campaign.budget_used || 0);
                    if (!total || total <= 0) {
                      return (
                        <div className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-white/5 border border-white/10">
                          <span className="text-white/40 text-xs italic">Budget non défini</span>
                        </div>
                      );
                    }
                    const pct = Math.min(100, Math.max(0, Math.round((used / total) * 100)));
                    return (
                      <>
                        <div className="flex justify-between text-xs text-white/40">
                          <span>Budget limité</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// Image Crop Modal
function ImageCropModal({ src, onConfirm, onClose }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [containerSize, setContainerSize] = useState({ w: 400, h: 225 });
  const [scale, setScale] = useState(1);

  const RATIOS = [
    { label: "16:9", value: 16 / 9 },
  ];

  const CROP_W = 400;

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      const cropH = CROP_W / aspectRatio;
      const sx = Math.max(CROP_W / img.naturalWidth, cropH / img.naturalHeight);
      setScale(sx);
      setOffset({ x: 0, y: 0 });
    };
    img.src = src;
  }, [src]);

  useEffect(() => {
    const cropH = CROP_W / aspectRatio;
    setContainerSize({ w: CROP_W, h: cropH });
    if (imgSize.w > 0) {
      const sx = Math.max(CROP_W / imgSize.w, cropH / imgSize.h);
      setScale(sx);
      setOffset({ x: 0, y: 0 });
    }
  }, [aspectRatio, imgSize]);

  const clampOffset = (ox, oy) => {
    const cropH = CROP_W / aspectRatio;
    const maxX = 0;
    const minX = Math.min(0, CROP_W - imgSize.w * scale);
    const maxY = 0;
    const minY = Math.min(0, cropH - imgSize.h * scale);
    return {
      x: Math.max(minX, Math.min(maxX, ox)),
      y: Math.max(minY, Math.min(maxY, oy)),
    };
  };

  const onMouseDown = (e) => {
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    const raw = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
    setOffset(clampOffset(raw.x, raw.y));
  };
  const onMouseUp = () => setDragging(false);

  const handleConfirm = () => {
    const cropH = CROP_W / aspectRatio;
    const canvas = document.createElement("canvas");
    canvas.width = CROP_W;
    canvas.height = cropH;
    const ctx = canvas.getContext("2d");
    const img = new window.Image();
    img.onload = () => {
      ctx.drawImage(img, offset.x, offset.y, imgSize.w * scale, imgSize.h * scale);
      onConfirm(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.src = src;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6 w-full max-w-lg">
        <h3 className="text-white font-bold text-lg mb-4">Recadrer l'image</h3>

        {/* Crop area — ratio fixe 16:9 */}
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-xl border border-white/20 mx-auto cursor-grab active:cursor-grabbing select-none"
          style={{ width: CROP_W, height: containerSize.h, maxWidth: "100%" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt="crop"
              draggable={false}
              style={{
                position: "absolute",
                left: offset.x,
                top: offset.y,
                width: imgSize.w * scale,
                height: imgSize.h * scale,
                userSelect: "none",
              }}
            />
          )}
          {/* Grid overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: `${CROP_W / 3}px ${containerSize.h / 3}px`
          }} />
        </div>
        <p className="text-xs text-white/30 text-center mt-2">Glissez pour repositionner</p>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 text-white/70 hover:bg-white/10 transition-colors text-sm">
            Annuler
          </button>
          <button onClick={handleConfirm} className="flex-1 px-4 py-2.5 rounded-xl bg-[#FF007F] hover:bg-[#FF007F]/80 text-white font-semibold transition-colors text-sm">
            Valider le recadrage
          </button>
        </div>
      </div>
    </div>
  );
}

// Create Campaign Page
function CreateCampaign({ onCreated }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    image_url: "",
    rpm: "",
    budget_total: "",
    budget_unlimited: false,
    min_view_payout: "0",
    max_view_payout: "",
    platforms: [],
    strike_days: "3",
    max_strikes: "3",
    cadence: "1",
    application_form_enabled: false,
    application_questions: [],
    // Modèle de rémunération
    payment_model: "views",
    tracking_start_date: "",  // ISO date - vide = aujourd'hui
    rate_per_click: "",
    destination_url: "",
    click_billing_mode: "unique_24h",
  });
  const [customQuestion, setCustomQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cropModalSrc, setCropModalSrc] = useState(null);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const togglePlatform = (platform) => {
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform],
    }));
  };

  const addQuestion = () => {
    if (customQuestion.trim()) {
      setFormData((prev) => ({
        ...prev,
        application_questions: [...prev.application_questions, customQuestion.trim()],
      }));
      setCustomQuestion("");
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Veuillez remplir le nom de la campagne");
      return;
    }
    if ((formData.payment_model === "views" || formData.payment_model === "both") && !formData.rpm) {
      toast.error("Veuillez renseigner le RPM (€ par 1000 vues)");
      return;
    }
    if ((formData.payment_model === "clicks" || formData.payment_model === "both") && (!formData.rate_per_click || !formData.destination_url.trim())) {
      toast.error("Veuillez renseigner le prix pour 1 000 clics et l'URL de destination");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        rpm: (formData.payment_model === "views" || formData.payment_model === "both") ? parseFloat(formData.rpm) || 0 : 0,
        rate_per_click: (formData.payment_model === "clicks" || formData.payment_model === "both") ? parseFloat(formData.rate_per_click) || 0 : 0,
        tracking_start_date: null,  // Plus utilise dans UI : backend defaut = now() au moment de la creation
        destination_url: formData.destination_url.trim() || null,
        budget_total: formData.budget_unlimited ? null : parseFloat(formData.budget_total) || null,
        min_view_payout: parseInt(formData.min_view_payout) || 0,
        max_view_payout: formData.max_view_payout ? parseInt(formData.max_view_payout) : null,
        strike_days: parseInt(formData.strike_days) || 3,
        max_strikes: parseInt(formData.max_strikes) || 3,
        cadence: parseInt(formData.cadence) || 1,
      };

      const res = await fetch(`${API}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const campaign = await res.json();
        toast.success("Campagne créée !");
        onCreated();
        navigate(`/agency/campaign/${campaign.campaign_id}`);
      } else {
        const error = await res.json();
        if (error.detail === "subscription_required") {
          toast.error("Votre essai a expiré — abonnez-vous dans Paramètres pour continuer");
          navigate("/agency/settings");
        } else {
          toast.error(error.detail || "Erreur lors de la création");
        }
      }
    } catch (error) {
      toast.error("Erreur de connexion");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 max-w-3xl"
      data-testid="create-campaign-page"
    >
      <div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-2">Lancer une campagne</h1>
        <p className="text-white/50">Créez une nouvelle campagne de clipping</p>
      </div>

      {/* Identity */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Image className="w-5 h-5 text-[#FF007F]" />
            Identité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-2">Nom de la campagne *</label>
            <Input
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Ex: Clips Gaming 2025"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              data-testid="campaign-name-input"
            />
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-2">Image de la campagne (optionnel)</label>
            <div className="flex items-center gap-3">
              {formData.image_url && (
                <div className="relative flex-shrink-0">
                  <img src={formData.image_url} alt="preview" className="w-24 h-14 rounded-lg object-cover border border-white/10" />
                  <button
                    type="button"
                    onClick={() => setCropModalSrc(formData.image_url)}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity rounded-lg text-white text-xs font-medium"
                  >
                    ✂ Recadrer
                  </button>
                </div>
              )}
              <label className="flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                <Image className="w-4 h-4 text-white/50" />
                <span className="text-sm text-white/50">{formData.image_url ? "Changer la photo" : "Choisir une photo"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => setCropModalSrc(ev.target.result);
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
          </div>
          {/* Crop Modal */}
          {cropModalSrc && (
            <ImageCropModal
              src={cropModalSrc}
              onConfirm={(croppedDataUrl) => {
                handleChange("image_url", croppedDataUrl);
                setCropModalSrc(null);
              }}
              onClose={() => setCropModalSrc(null)}
            />
          )}
        </CardContent>
      </Card>

      {/* Remuneration */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[#FF007F]" />
            Rémunération
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* tracking_start_date retire du UI : la campagne tracke automatiquement
              les videos postees a partir de sa creation. Plus de backfill estime. */}

          {/* Toggle modèle */}
          <div>
            <label className="block text-sm text-white/70 mb-3">Modèle de rémunération *</label>
            <div className="flex gap-2">
              {[
                { id: "views", label: "👁 Vues", desc: "Payé selon les vues générées" },
                { id: "clicks", label: "🔗 Clics", desc: "Lien dans la bio — payé par clic" },
                { id: "both", label: "👁🔗 Vues + Clics", desc: "Payé pour les vues ET les clics combinés" },
              ].map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleChange("payment_model", m.id)}
                  className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                    formData.payment_model === m.id
                      ? "bg-[#FF007F]/15 border-[#FF007F]/50 text-white"
                      : "bg-white/5 border-white/10 text-white/50 hover:border-white/25"
                  }`}
                >
                  <p className="text-sm font-semibold">{m.label}</p>
                  <p className="text-xs mt-0.5 opacity-60">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Champs spécifiques au modèle VUES */}
          {(formData.payment_model === "views" || formData.payment_model === "both") && (
            <>
              <div>
                <label className="block text-sm text-white/70 mb-2">RPM (€ par 1000 vues) *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.rpm}
                  onChange={(e) => handleChange("rpm", e.target.value)}
                  placeholder="3.50"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  data-testid="campaign-rpm-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/70 mb-2">Min. vues payout</label>
                  <Input type="number" value={formData.min_view_payout} onChange={(e) => handleChange("min_view_payout", e.target.value)} placeholder="1000" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-2">Max. vues payout</label>
                  <Input type="number" value={formData.max_view_payout} onChange={(e) => handleChange("max_view_payout", e.target.value)} placeholder="1000000" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
              </div>
            </>
          )}

          {/* Champs spécifiques au modèle CLICS */}
          {(formData.payment_model === "clicks" || formData.payment_model === "both") && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/70 mb-2">Prix pour 1 000 clics (€) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.rate_per_click}
                    onChange={(e) => handleChange("rate_per_click", e.target.value)}
                    placeholder="50"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  />
                  <p className="text-white/30 text-xs mt-1">Ex : 50 = €50 pour 1 000 clics (soit €0.05/clic)</p>
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-2">Anti-spam &amp; déduplication des clics</label>
                  <div className="space-y-2">
                    {[
                      {
                        value: "unique_24h",
                        label: "1 clic unique / 24h",
                        badge: "Recommandé",
                        badgeColor: "bg-green-500/20 text-green-400 border-green-500/30",
                        desc: "1 seul clic facturé par personne toutes les 24h — la même personne peut générer un nouveau clic le lendemain",
                      },
                      {
                        value: "unique_lifetime",
                        label: "1 clic unique à vie",
                        badge: "Anti-fraude strict",
                        badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
                        desc: "1 seul clic facturé par personne pour toute la durée de la campagne — même des semaines après, pas de doublon",
                      },
                      {
                        value: "all",
                        label: "Tous les clics",
                        badge: "Non recommandé",
                        badgeColor: "bg-amber-500/20 text-amber-400 border-amber-500/30",
                        desc: "⚠️ Chaque clic est facturé sans déduplication — expose aux fraudes et clics répétés artificiels",
                      },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          formData.click_billing_mode === opt.value
                            ? "border-[#FF007F]/40 bg-[#FF007F]/5"
                            : "border-white/10 hover:border-white/20"
                        }`}
                      >
                        <input
                          type="radio"
                          name="click_billing_mode"
                          value={opt.value}
                          checked={formData.click_billing_mode === opt.value}
                          onChange={() => handleChange("click_billing_mode", opt.value)}
                          className="mt-1 accent-[#FF007F]"
                        />
                        <div>
                          <p className="text-white/80 text-sm font-medium flex items-center gap-1.5">
                            {opt.label}
                            <span className={`text-[10px] border px-1.5 py-0.5 rounded font-medium ${opt.badgeColor}`}>{opt.badge}</span>
                          </p>
                          <p className="text-white/40 text-xs mt-0.5">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-2">URL de destination *</label>
                <Input
                  type="url"
                  value={formData.destination_url}
                  onChange={(e) => handleChange("destination_url", e.target.value)}
                  placeholder="https://monsite.com/produit"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
                <p className="text-white/30 text-xs mt-1.5">Les clippers mettent le lien de tracking dans leur bio — quand quelqu'un clique, il arrive sur cette URL.</p>
              </div>
              <div className="p-3 rounded-xl bg-[#f0c040]/8 border border-[#f0c040]/20">
                <p className="text-[#f0c040] text-xs font-medium mb-1">💡 Comment ça marche</p>
                <p className="text-white/50 text-xs">Chaque clipper reçoit un lien unique à mettre dans sa bio. Les gains = <strong className="text-white/70">(clics / 1 000) × tarif</strong>. Génère les liens depuis l'onglet <strong className="text-white/70">Liens</strong> après création.</p>
              </div>
            </>
          )}

          {/* Budget (commun aux deux modèles) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">Budget total (€)</label>
              <Input
                type="number"
                value={formData.budget_total}
                onChange={(e) => handleChange("budget_total", e.target.value)}
                placeholder="10000"
                disabled={formData.budget_unlimited}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 disabled:opacity-50"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.budget_unlimited}
                  onCheckedChange={(checked) => handleChange("budget_unlimited", checked)}
                  className="border-white/30"
                />
                <span className="text-white/70">Budget illimité</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Platforms */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Plateformes cibles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {["tiktok", "youtube", "instagram"].map((platform) => (
              <label key={platform} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.platforms.includes(platform)}
                  onCheckedChange={() => togglePlatform(platform)}
                  className="border-white/30"
                  data-testid={`platform-${platform}`}
                />
                <span className="text-white capitalize">{platform}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rules */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#FF007F]" />
            Règles de publication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">Strike auto après inactivité de</label>
              <div className="flex gap-2">
                {[{ val: "1", label: "1 jour" }, { val: "2", label: "2 jours" }, { val: "3", label: "3 jours" }, { val: "7", label: "7 jours" }].map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleChange("strike_days", val)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      formData.strike_days === val
                        ? "bg-[#FF007F] border-[#FF007F] text-white"
                        : "bg-white/5 border-white/10 text-white/50 hover:border-white/30"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">Cadence (posts/jour min)</label>
              <Input
                type="number"
                value={formData.cadence}
                onChange={(e) => handleChange("cadence", e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">Suspension après X strikes</label>
              <div className="flex gap-2">
                {[{ val: "1", label: "1" }, { val: "2", label: "2" }, { val: "3", label: "3" }, { val: "5", label: "5" }].map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleChange("max_strikes", val)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      formData.max_strikes === val
                        ? "bg-[#FF007F] border-[#FF007F] text-white"
                        : "bg-white/5 border-white/10 text-white/50 hover:border-white/30"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end pb-1">
              <p className="text-xs text-white/30 italic">Le clippeur est suspendu automatiquement après ce nombre de strikes consécutifs.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Application Form */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Formulaire de candidature</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={formData.application_form_enabled}
              onCheckedChange={(checked) => handleChange("application_form_enabled", checked)}
              className="border-white/30"
            />
            <span className="text-white/70">Activer le formulaire de candidature</span>
          </label>
          
          {formData.application_form_enabled && (
            <div className="space-y-3 pl-6">
              <p className="text-sm text-white/50">Questions par défaut:</p>
              <ul className="text-sm text-white/70 space-y-1">
                <li>• Nom / Prénom ?</li>
                <li>• Donnez une vidéo créée ?</li>
              </ul>
              
              {formData.application_questions.map((q, i) => (
                <div key={i} className="text-sm text-white/70">• {q}</div>
              ))}
              
              <div className="flex gap-2">
                <Input
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Ajouter une question..."
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
                <Button
                  type="button"
                  onClick={addQuestion}
                  variant="outline"
                  className="border-white/10 text-white"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full bg-[#FF007F] hover:bg-[#FF007F]/80 text-white py-6 text-lg"
        data-testid="create-campaign-btn"
      >
        {isSubmitting ? "Création en cours..." : "Créer la campagne"}
      </Button>
    </motion.div>
  );
}

// Campaign Dashboard for Agency — Shortimize style
function CampaignDashboard({ campaigns }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const campaignId = location.pathname.split("/")[3];
  const [campaign, setCampaign] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [pendingMembers, setPendingMembers] = useState([]);
  const [expulsionRequests, setExpulsionRequests] = useState([]);
  const [decidingExpulsion, setDecidingExpulsion] = useState(null);
  const [processingMember, setProcessingMember] = useState(null);
  const [kickingMember, setKickingMember] = useState(null);
  const [strikingMember, setStrikingMember] = useState(null);
  const [deletingVideo, setDeletingVideo] = useState(null);
  const [expandedMembers, setExpandedMembers] = useState(new Set());
  const [allVideos, setAllVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(false);
  // Toggle "videos" / "accounts" dans l'onglet Vidéos & Comptes
  const [videosSubView, setVideosSubView] = useState("videos");
  // Toggle "views" / "clicks" pour les campagnes payment_model="both"
  const [overviewMode, setOverviewMode] = useState("views");
  const [allAccountsByClipper, setAllAccountsByClipper] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  // Modal "Tracker un compte"
  const [showTrackAccountModal, setShowTrackAccountModal] = useState(false);
  const [trackAccountForm, setTrackAccountForm] = useState({ user_id: "", platform: "tiktok", username: "" });
  const [trackingAccount, setTrackingAccount] = useState(false);
  // Mode "Voir les videos avant" : scrape le compte + selection
  const [accountVideos, setAccountVideos] = useState(null); // null | { videos: [], count, ... }
  const [scrapingForPreview, setScrapingForPreview] = useState(false);
  const [trackingVideoId, setTrackingVideoId] = useState(null);
  // Multi-selection : ids des videos cochees pour bulk-add
  const [selectedVideoIds, setSelectedVideoIds] = useState(() => new Set());
  const [bulkTracking, setBulkTracking] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [sortField, setSortField] = useState("published_at");
  const [sortDir, setSortDir] = useState("desc");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterClipper, setFilterClipper] = useState("all");
  const [showManualVideoModal, setShowManualVideoModal] = useState(false);
  const [manualVideoForm, setManualVideoForm] = useState({ target: "", url: "", platform: "tiktok" });
  // Mode "url" (URL directe) ou "account" (scrape compte + selection)
  const [importMode, setImportMode] = useState("account");
  const [scrapeUsername, setScrapeUsername] = useState("");
  const [scrapedVideos, setScrapedVideos] = useState(null);
  const [scrapingAccount, setScrapingAccount] = useState(false);
  const [trackingVideoUrl, setTrackingVideoUrl] = useState(null);
  const [addingVideo, setAddingVideo] = useState(false);
  const [trackResult, setTrackResult] = useState(null); // { views, title, earnings }
  const [clickLinks, setClickLinks] = useState(null);      // { links, totals, rate_per_click }
  const [generatingLinks, setGeneratingLinks] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState(null);
  const [regeneratingLinkId, setRegeneratingLinkId] = useState(null);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [addBudgetAmount, setAddBudgetAmount] = useState("");
  const [addingBudget, setAddingBudget] = useState(false);
  // ── Campaign settings editor ───────────────────────────────────────────────
  const [settingsForm, setSettingsForm] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  // ── Click campaign stats ───────────────────────────────────────────────────
  const [clickStats, setClickStats] = useState(null);
  const [clickStatsLoading, setClickStatsLoading] = useState(false);
  const [viewsTimeline, setViewsTimeline] = useState(null);
  const [viewsTimelineLoading, setViewsTimelineLoading] = useState(false);
  const [viewsPeriod, setViewsPeriod] = useState("30");
  const [viewsOffset, setViewsOffset] = useState(0);
  const [period, setPeriod] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [topClips, setTopClips] = useState([]);
  const [topClipsLoading, setTopClipsLoading] = useState(false);
  const [topClipsPeriod, setTopClipsPeriod] = useState("all");
  // ── Period stats (24h / 7d / 30d / year / all) ──────────────────────────────
  const [periodStats, setPeriodStats] = useState(null);
  const [periodSel, setPeriodSel] = useState("30d");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [periodLoading, setPeriodLoading] = useState(false);
  // Gains mensuels par campagne (split par clipper)
  const [monthlyEarnings, setMonthlyEarnings] = useState(null);
  const [monthlyEarningsLoading, setMonthlyEarningsLoading] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState(null);

  const fmt = fmtViews;
  const PLAT_COLOR = { tiktok: "#00E5FF", instagram: "#FF007F", youtube: "#FF4444" };
  const PLAT_ICON = { tiktok: "🎵", instagram: "📸", youtube: "▶️" };

  const fetchTopClips = async (period = "all") => {
    setTopClipsLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/top-clips?limit=10&period=${period}`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setTopClips(d.clips || []); }
    } catch {}
    finally { setTopClipsLoading(false); }
  };

  useEffect(() => {
    if (campaignId) {
      fetchCampaign();
      fetchStats();
      fetchPendingMembers();
      fetchAllVideos();
      fetchTopClips();
      const interval = setInterval(fetchTopClips, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [campaignId]);

  const fetchViewsTimeline = async (d = viewsPeriod, off = viewsOffset) => {
    setViewsTimelineLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/views-chart?days=${d}&offset=${off}`, { credentials: "include" });
      if (res.ok) setViewsTimeline(await res.json());
    } catch {}
    finally { setViewsTimelineLoading(false); }
  };

  const fetchPeriodStats = async (p = periodSel, off = periodOffset) => {
    setPeriodLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/period-stats?period=${p}&offset=${off}`, { credentials: "include" });
      if (res.ok) setPeriodStats(await res.json());
    } catch {}
    finally { setPeriodLoading(false); }
  };

  const fetchMonthlyEarnings = async () => {
    setMonthlyEarningsLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/monthly-earnings`, { credentials: "include" });
      if (res.ok) setMonthlyEarnings(await res.json());
    } catch {}
    finally { setMonthlyEarningsLoading(false); }
  };

  // Auto-fetch period stats when entering overview tab
  useEffect(() => {
    if (campaignId && activeTab === "overview") {
      fetchPeriodStats(periodSel, periodOffset);
      fetchMonthlyEarnings();
    }
    // eslint-disable-next-line
  }, [campaignId, activeTab, periodSel, periodOffset]);

  const [refreshingStats, setRefreshingStats] = useState(false);
  const [refreshCountdown, setRefreshCountdown] = useState(0);
  const refreshAllData = useCallback(() => {
    // Reload ALL data sources de la campagne
    try { fetchCampaign?.(); } catch {}
    try { fetchStats?.(); } catch {}
    try { fetchAllVideos?.(); } catch {}
    try { fetchTopClips?.(); } catch {}
    try { fetchAllAccounts?.(); } catch {}
    try { fetchPeriodStats?.(); } catch {}
    try { fetchViewsTimeline?.(); } catch {}
    try { fetchMonthlyEarnings?.(); } catch {}
  }, []);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const handleResetTrackingData = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/reset-tracking-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const d = data.deleted || {};
        toast.success(
          `✓ Reset effectué : ${d.tracked_videos || 0} vidéos supprimées. Re-scrape en cours, données fraîches dans 1-3 min.`,
          { duration: 8000 }
        );
        setResetConfirmOpen(false);
        // Refresh UI immediatement (DB vidée) puis encore après scrape
        try { fetchAllVideos?.(); } catch {}
        try { fetchTopClips?.(); } catch {}
        try { fetchStats?.(); } catch {}
        setTimeout(() => { try { fetchAllVideos?.(); fetchTopClips?.(); fetchStats?.(); } catch {} }, 60000);
        setTimeout(() => { try { fetchAllVideos?.(); fetchTopClips?.(); fetchStats?.(); } catch {} }, 180000);
      } else {
        toast.error(data.detail || `Erreur ${res.status}`);
      }
    } catch (e) {
      toast.error("Erreur réseau");
    } finally {
      setResetting(false);
    }
  };

  const handleRefreshStats = async () => {
    if (refreshingStats) return;
    setRefreshingStats(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/refresh-stats`, {
        method: "POST", credentials: "include"
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("✓ Scrape lancé — refresh auto dans 60s, 90s, 180s", { duration: 6000 });
        // Refresh IMMEDIAT (fetch les data deja en DB)
        refreshAllData();
        // Refresh apres 60s, 90s, 180s pour capter les nouvelles vues
        setTimeout(() => refreshAllData(), 60000);
        setTimeout(() => refreshAllData(), 90000);
        setTimeout(() => refreshAllData(), 180000);
        // Countdown visuel pendant 3 min
        let countdown = 180;
        setRefreshCountdown(countdown);
        const timer = setInterval(() => {
          countdown -= 1;
          setRefreshCountdown(countdown);
          if (countdown <= 0) clearInterval(timer);
        }, 1000);
      } else if (res.status === 429) {
        toast.error(data.detail || "Trop tôt, attends 5 min entre 2 refresh", { duration: 5000 });
      } else {
        toast.error(data.detail || `Erreur ${res.status} lors du refresh`);
      }
    } catch (e) {
      toast.error("Erreur réseau : " + (e?.message || "connexion impossible"));
    } finally {
      setRefreshingStats(false);
    }
  };

  const fetchClickStats = async (p = period, cFrom = customFrom, cTo = customTo) => {
    setClickStatsLoading(true);
    try {
      let url = `${API}/campaigns/${campaignId}/click-stats?period=${p}`;
      if (p === "custom" && cFrom) url += `&date_from=${cFrom}`;
      if (p === "custom" && cTo) url += `&date_to=${cTo}`;
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) setClickStats(await res.json());
    } catch {}
    finally { setClickStatsLoading(false); }
  };

  // Auto-fetch click stats when campaign is loaded and is click-based (ou both)
  useEffect(() => {
    if (campaign?.payment_model === "clicks" || campaign?.payment_model === "both") fetchClickStats();
  }, [campaign?.campaign_id, campaign?.payment_model]);

  // Auto-fetch views timeline when campaign is loaded and is views-based (ou both)
  // Refetch quand viewsPeriod ou viewsOffset change
  useEffect(() => {
    if (campaign?.payment_model === "views" || campaign?.payment_model === "both") {
      fetchViewsTimeline(viewsPeriod, viewsOffset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.campaign_id, campaign?.payment_model, viewsPeriod, viewsOffset]);

  const handlePeriodChange = (p) => {
    setPeriod(p);
    if (p !== "custom") fetchClickStats(p);
  };

  const handleCustomApply = () => {
    if (customFrom) fetchClickStats("custom", customFrom, customTo);
  };

  const fetchClickLinks = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/click-links`, { credentials: "include" });
      if (res.ok) setClickLinks(await res.json());
    } catch {}
  };

  const handleGenerateLinks = async () => {
    setGeneratingLinks(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/generate-links`, {
        method: "POST", credentials: "include"
      });
      if (res.ok) {
        toast.success("Liens générés ✓");
        fetchClickLinks();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Erreur lors de la génération");
      }
    } catch { toast.error("Erreur réseau"); }
    finally { setGeneratingLinks(false); }
  };

  const handleCopyLink = (url, linkId) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLinkId(linkId);
      setTimeout(() => setCopiedLinkId(null), 2000);
      toast.success("Lien copié !");
    });
  };

  const handleRegenerateLink = async (clipperId, linkId) => {
    setRegeneratingLinkId(linkId);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/regenerate-link/${clipperId}`, {
        method: "POST", credentials: "include"
      });
      if (res.ok) {
        toast.success("Lien régénéré ✓");
        fetchClickLinks();
      } else toast.error("Erreur lors de la régénération");
    } catch { toast.error("Erreur réseau"); }
    finally { setRegeneratingLinkId(null); }
  };

  const handleAddBudget = async () => {
    const amount = parseFloat(addBudgetAmount);
    if (!amount || amount <= 0) return;
    setAddingBudget(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/add-budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount }),
      });
      if (res.ok) {
        const data = await res.json();
        setCampaign(prev => ({ ...prev, budget_total: data.budget_total, budget_unlimited: false }));
        toast.success(`+€${amount} ajouté au budget ✓`);
        setAddBudgetAmount("");
        setShowAddBudget(false);
      } else {
        const err = await res.json();
        toast.error(err.detail || "Erreur lors de l'ajout");
      }
    } catch { toast.error("Erreur réseau"); }
    finally { setAddingBudget(false); }
  };

  const handleSaveSettings = async () => {
    if (!settingsForm) return;
    setSavingSettings(true);
    try {
      const payload = { ...settingsForm };
      // tracking_start_date retire du UI : ne pas le modifier via les settings
      delete payload.tracking_start_date;
      const res = await fetch(`${API}/campaigns/${campaignId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setCampaign(data.campaign);
        if (data.backfill_started) {
          toast.success("Paramètres sauvegardés ✓ — Backfill lancé : les vidéos depuis la nouvelle date sont en cours de récupération (peut prendre 1-5 min)", { duration: 8000 });
          // Rafraichit la liste des videos après quelques secondes
          setTimeout(() => { fetchAllVideos(); fetchAllAccounts(); }, 60000);
          setTimeout(() => { fetchAllVideos(); fetchAllAccounts(); }, 180000);
        } else {
          toast.success("Paramètres sauvegardés ✓");
        }
      } else {
        const err = await res.json();
        toast.error(err.detail || "Erreur lors de la sauvegarde");
      }
    } catch { toast.error("Erreur réseau"); }
    finally { setSavingSettings(false); }
  };

  const handleDeleteCampaign = async () => {
    if (deleteConfirmText !== "SUPPRIMER") {
      toast.error("Saisissez SUPPRIMER pour confirmer");
      return;
    }
    setDeletingCampaign(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Campagne supprimée");
        navigate("/agency");
      } else {
        const err = await res.json();
        toast.error(err.detail || "Impossible de supprimer");
      }
    } catch { toast.error("Erreur réseau"); }
    finally { setDeletingCampaign(false); }
  };

  const handleScrapeAccount = async () => {
    if (!scrapeUsername.trim()) return;
    setScrapingAccount(true);
    setScrapedVideos(null);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/list-account-videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: scrapeUsername.trim().replace(/^@/, ""),
          platform: manualVideoForm.platform,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setScrapedVideos(data);
        if ((data.videos || []).length === 0) {
          toast.error("Aucune vidéo trouvée sur ce compte");
        } else {
          toast.success(`${data.videos.length} vidéos trouvées — clique sur celle à tracker`);
        }
      } else {
        let detail = "Erreur scraping";
        try { detail = (await res.json()).detail || detail; } catch {}
        toast.error(detail);
      }
    } catch (e) {
      toast.error(`Erreur réseau: ${e?.message || "connexion impossible"}`);
    } finally {
      setScrapingAccount(false);
    }
  };

  const handleTrackVideoFromList = async (video) => {
    setTrackingVideoUrl(video.url);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/add-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          url: video.url,
          platform: manualVideoForm.platform,
          target: manualVideoForm.target,
          // si on a le username (depuis scrape) on l'envoie pour permettre VPS gratuit
          ...(scrapeUsername ? { account_username: scrapeUsername.replace(/^@/, "") } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const v = data.video || {};
        const vws = v.views || 0;
        const lks = v.likes || 0;
        const status = data.scraping_status || "ok";
        if (status === "ok") {
          toast.success(`✓ Vidéo trackée — ${vws.toLocaleString("fr-FR")} vues officielles`);
        } else if (status === "partial") {
          toast.success(`✓ Vidéo trackée — ${lks.toLocaleString("fr-FR")} likes (vues non publiques)`, { duration: 6000 });
        } else {
          toast(data.message || "Vidéo enregistrée ⏳", { duration: 6000 });
        }
        // Marque la vidéo comme déjà trackée dans la liste
        setScrapedVideos(prev => prev ? {
          ...prev,
          videos: prev.videos.map(x => x.platform_video_id === video.platform_video_id ? { ...x, _tracked: true, views: vws, likes: lks } : x)
        } : prev);
        fetchAllVideos();
      } else {
        let detail = `Erreur tracking (HTTP ${res.status})`;
        try { detail = (await res.json()).detail || detail; } catch {}
        toast.error(detail, { duration: 6000 });
      }
    } catch (e) {
      toast.error(`Erreur: ${e?.message || "connexion impossible"}`);
    } finally {
      setTrackingVideoUrl(null);
    }
  };

  const handleAddManualVideo = async () => {
    if (!manualVideoForm.url) return;
    setAddingVideo(true);
    setTrackResult(null);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/add-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          url: manualVideoForm.url,
          platform: manualVideoForm.platform,
          target: manualVideoForm.target,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const v = data.video || {};
        const vws = v.views || 0;
        const lks = v.likes || 0;
        const status = data.scraping_status || "ok";
        setTrackResult({
          views: vws,
          title: v.title || "Sans titre",
          earnings: v.earnings || 0,
        });
        if (status === "ok") {
          toast.success(`Vidéo trackée ✓ — ${vws.toLocaleString("fr-FR")} vues officielles`);
        } else if (status === "partial") {
          toast.success(`Vidéo trackée ✓ — ${lks.toLocaleString("fr-FR")} likes (vues non publiques)`, { duration: 6000 });
        } else if (status === "retry_later") {
          toast("⏳ Vidéo enregistrée — stats récupérées au prochain cycle (toutes les 6h)", { duration: 7000, icon: "⏳" });
          setTimeout(() => { fetchAllVideos(); }, 30000);
        } else {
          toast.success(data.message || "Vidéo trackée ✓");
        }
        fetchAllVideos();
      } else {
        let detail = `Erreur (HTTP ${res.status})`;
        try { detail = (await res.json()).detail || detail; } catch {}
        toast.error(detail, { duration: 6000 });
      }
    } catch (e) {
      console.error("import-link error:", { name: e?.name, message: e?.message, url: manualVideoForm.url, platform: manualVideoForm.platform });
      const isBrowserBlock = e?.message?.includes("Failed to fetch") || e?.name === "TypeError";
      if (isBrowserBlock) {
        toast.error("Requête bloquée par AdBlock/extensions. Désactive-le pour theclipdealtrack.com OU essaie en navigation privée (Ctrl+Shift+N).", { duration: 10000 });
      } else {
        toast.error(`Erreur réseau: ${e?.message || "connexion impossible"}`);
      }
    }
    finally { setAddingVideo(false); }
  };

  const fetchAllVideos = async () => {
    setVideosLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/tracked-videos`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAllVideos(data.videos || []);
      }
    } catch {}
    finally { setVideosLoading(false); }
  };

  const fetchAllAccounts = async () => {
    setAccountsLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/all-accounts`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAllAccountsByClipper(data.clippers || []);
      }
    } catch {}
    finally { setAccountsLoading(false); }
  };

  const handleScrapeAccountForPreview = async () => {
    if (!trackAccountForm.username.trim() || !trackAccountForm.platform) {
      toast.error("Sélectionne une plateforme et entre le @username");
      return;
    }
    setScrapingForPreview(true);
    setAccountVideos(null);
    setSelectedVideoIds(new Set());
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/list-account-videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: trackAccountForm.username.trim(),
          platform: trackAccountForm.platform,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAccountVideos(data);
        toast.success(`✓ ${data.count || 0} vidéos trouvées pour @${data.username}`);
      } else {
        toast.error(data.detail || "Erreur lors du scraping");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setScrapingForPreview(false);
    }
  };

  // Toggle selection d'une video dans le modal "Voir les videos"
  const handleToggleVideoSelection = (videoId) => {
    if (!videoId) return;
    setSelectedVideoIds(prev => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  const handleSelectAllVideos = () => {
    if (!accountVideos?.videos) return;
    const all = (accountVideos.videos || [])
      .filter(v => !v._tracked && v.platform_video_id)
      .map(v => v.platform_video_id);
    setSelectedVideoIds(new Set(all));
  };

  const handleDeselectAllVideos = () => {
    setSelectedVideoIds(new Set());
  };

  // BULK : ajoute toutes les videos selectionnees a la campagne en une seule action
  const handleBulkAddSelectedVideos = async () => {
    if (bulkTracking) return;
    if (!accountVideos?.videos || selectedVideoIds.size === 0) return;
    const toAdd = (accountVideos.videos || []).filter(v => selectedVideoIds.has(v.platform_video_id) && !v._tracked);
    if (toAdd.length === 0) {
      toast.error("Aucune vidéo sélectionnée");
      return;
    }
    setBulkTracking(true);
    setBulkProgress({ done: 0, total: toAdd.length });
    let okCount = 0;
    let errCount = 0;
    for (let i = 0; i < toAdd.length; i++) {
      const video = toAdd[i];
      try {
        const body = {
          url: video.url,
          platform: trackAccountForm.platform,
          platform_video_id: video.platform_video_id || "",
          account_username: trackAccountForm.username.trim().replace(/^@/, ""),
          ...(trackAccountForm.user_id ? { target: trackAccountForm.user_id } : {}),
        };
        const res = await fetch(`${API}/campaigns/${campaignId}/add-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const v = data.video || {};
          okCount += 1;
          setAccountVideos(prev => prev ? {
            ...prev,
            videos: prev.videos.map(vv => vv.platform_video_id === video.platform_video_id
              ? { ...vv, _tracked: true, views: v.views || vv.views, likes: v.likes || vv.likes }
              : vv),
          } : prev);
        } else {
          errCount += 1;
        }
      } catch {
        errCount += 1;
      }
      setBulkProgress({ done: i + 1, total: toAdd.length });
    }
    setBulkTracking(false);
    setSelectedVideoIds(new Set());

    if (okCount > 0 && errCount === 0) {
      toast.success(`✓ ${okCount} vidéo${okCount > 1 ? "s" : ""} ajoutée${okCount > 1 ? "s" : ""} à la campagne`);
    } else if (okCount > 0 && errCount > 0) {
      toast.success(`✓ ${okCount} ajoutée${okCount > 1 ? "s" : ""}, ${errCount} en échec`, { duration: 6000 });
    } else {
      toast.error(`Échec : aucune vidéo ajoutée (${errCount} erreurs)`, { duration: 6000 });
    }

    // Refresh la liste de videos de la campagne et ferme le modal apres succes
    fetchAllVideos();
    if (okCount > 0 && errCount === 0) {
      setTimeout(() => {
        setShowTrackAccountModal(false);
        setAccountVideos(null);
      }, 1200);
    }
  };

  // Conserve l'ancien comportement single-click pour compatibilite (utilise ailleurs si besoin)
  const handleTrackVideoFromAccountPreview = async (video) => {
    if (trackingVideoId) return;
    setTrackingVideoId(video.platform_video_id);
    try {
      const body = {
        url: video.url,
        platform: trackAccountForm.platform,
        platform_video_id: video.platform_video_id || "",
        account_username: trackAccountForm.username.trim().replace(/^@/, ""),
        ...(trackAccountForm.user_id ? { target: trackAccountForm.user_id } : {}),
      };
      const res = await fetch(`${API}/campaigns/${campaignId}/add-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const v = data.video || {};
        const realViews = v.views || 0;
        const realLikes = v.likes || 0;
        const status = data.scraping_status || "ok";
        if (status === "ok") {
          toast.success(`✓ Vidéo trackée — ${realViews.toLocaleString("fr-FR")} vues officielles`);
        } else if (status === "partial") {
          toast.success(`✓ Vidéo trackée — ${realLikes.toLocaleString("fr-FR")} likes (vues non publiques)`, { duration: 6000 });
        } else if (status === "retry_later") {
          toast(`⏳ Vidéo enregistrée — stats en attente (récupérées au prochain cycle de tracking)`, { duration: 7000, icon: "⏳" });
        } else {
          toast.success(data.message || "Vidéo trackée");
        }
        setAccountVideos(prev => prev ? {
          ...prev,
          videos: prev.videos.map(vv => vv.platform_video_id === video.platform_video_id ? { ...vv, _tracked: true, views: realViews, likes: realLikes } : vv),
        } : prev);
        fetchAllVideos();
      } else {
        const e = await res.json().catch(() => ({}));
        toast.error(e.detail || `Erreur tracking (HTTP ${res.status})`, { duration: 6000 });
      }
    } catch (err) {
      const isBlock = err?.message?.includes("Failed to fetch") || err?.name === "TypeError";
      if (isBlock) {
        toast.error("Requête bloquée par AdBlock/extension. Désactive-le pour theclipdealtrack.com.", { duration: 8000 });
      } else {
        toast.error(`Erreur réseau: ${err?.message || "connexion impossible"}`);
      }
    } finally {
      setTrackingVideoId(null);
    }
  };

  const handleTrackAllVideosAndAddAccount = async () => {
    // Track le compte (scrape auto en background) + ajout
    await handleTrackAccount();
  };

  const handleTrackAccount = async () => {
    // user_id est OPTIONNEL : si vide, le compte est attribue a l'agence (gains restent agence)
    if (!trackAccountForm.platform || !trackAccountForm.username.trim()) {
      toast.error("Sélectionne une plateforme et entre un @username ou une URL");
      return;
    }
    const allowed = (campaign?.platforms && campaign.platforms.length > 0) ? campaign.platforms : null;
    if (allowed && !allowed.includes(trackAccountForm.platform)) {
      toast.error(`Cette campagne n'accepte que : ${allowed.join(", ")}`);
      return;
    }
    setTrackingAccount(true);
    try {
      const isUrl = trackAccountForm.username.trim().startsWith("http");
      const body = {
        platform: trackAccountForm.platform,
        ...(trackAccountForm.user_id ? { user_id: trackAccountForm.user_id } : {}),  // omet user_id si vide
        ...(isUrl ? { account_url: trackAccountForm.username.trim() } : { username: trackAccountForm.username.trim() }),
      };
      const res = await fetch(`${API}/campaigns/${campaignId}/add-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.already_assigned ? "Compte déjà assigné — ok" : "Compte ajouté ✓ vérification en cours…");
        setShowTrackAccountModal(false);
        setTrackAccountForm({ user_id: "", platform: "tiktok", username: "" });
        fetchAllAccounts();
      } else {
        toast.error(data.detail || "Erreur lors de l'ajout du compte");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setTrackingAccount(false);
    }
  };

  const fetchCampaign = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}`, { credentials: "include" });
      if (res.ok) setCampaign(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/stats`, { credentials: "include" });
      if (res.ok) setStats(await res.json());
    } catch {}
  };

  const fetchPendingMembers = async () => {
    try {
      // En meme temps : fetch expulsion requests
      try {
        const er = await fetch(`${API}/campaigns/${campaignId}/expulsion-requests`, { credentials: "include" });
        if (er.ok) { const ed = await er.json(); setExpulsionRequests(ed.expulsion_requests || []); }
      } catch {}
      const res = await fetch(`${API}/campaigns/${campaignId}/pending-members`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPendingMembers(data.members || []);
      }
    } catch {}
  };

  const handleAcceptMember = async (memberId) => {
    setProcessingMember(memberId);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/members/${memberId}/accept`, { method: "POST", credentials: "include" });
      if (res.ok) { toast.success("Candidature acceptée !"); fetchPendingMembers(); fetchCampaign(); }
      else toast.error("Erreur lors de l'acceptation");
    } catch { toast.error("Erreur réseau"); }
    setProcessingMember(null);
  };

  const handleRejectMember = async (memberId) => {
    setProcessingMember(memberId);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/members/${memberId}/reject`, { method: "POST", credentials: "include" });
      if (res.ok) { toast.success("Candidature refusée"); fetchPendingMembers(); }
      else toast.error("Erreur lors du refus");
    } catch { toast.error("Erreur réseau"); }
    setProcessingMember(null);
  };

  const handleKickMember = async (userId) => {
    if (!window.confirm("Retirer ce clippeur de la campagne ?")) return;
    setKickingMember(userId);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/members/${userId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { toast.success("Clippeur retiré"); fetchCampaign(); fetchAllVideos(); }
      else { const e = await res.json(); toast.error(e.detail || "Erreur"); }
    } catch { toast.error("Erreur réseau"); }
    setKickingMember(null);
  };

  const handleAddStrike = async (userId, reason) => {
    setStrikingMember(userId);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/members/${userId}/strike`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || "Strike manuel par l'agence" }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Strike ajouté (${data.strikes} total)${data.suspended ? " — clippeur suspendu" : ""}`);
        fetchCampaign();
      } else {
        const e = await res.json();
        toast.error(e.detail || "Erreur");
      }
    } catch { toast.error("Erreur réseau"); }
    setStrikingMember(null);
  };

  const handleRemoveStrike = async (userId) => {
    setStrikingMember(userId);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/members/${userId}/strike`, {
        method: "DELETE", credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Strike retiré (${data.strikes} restant${data.strikes !== 1 ? "s" : ""})`);
        fetchCampaign();
      } else {
        const e = await res.json();
        toast.error(e.detail || "Erreur");
      }
    } catch { toast.error("Erreur réseau"); }
    setStrikingMember(null);
  };

  const handleDeleteVideo = async (videoId) => {
    if (!window.confirm("Supprimer cette vidéo du tracking ?")) return;
    setDeletingVideo(videoId);
    try {
      // Tente nouveau endpoint d'abord, fallback ancien
      let res = await fetch(`${API}/campaigns/${campaignId}/tracked-videos/${videoId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok && res.status === 404) {
        res = await fetch(`${API}/campaigns/${campaignId}/videos/${videoId}`, { method: "DELETE", credentials: "include" });
      }
      if (res.ok) { toast.success("Vidéo supprimée"); fetchAllVideos(); }
      else { const e = await res.json().catch(() => ({})); toast.error(e.detail || "Erreur"); }
    } catch { toast.error("Erreur réseau"); }
    setDeletingVideo(null);
  };

  const handleRemoveSocialAccount = async (accountId) => {
    if (!window.confirm("Retirer ce compte de la campagne ? Toutes les vidéos trackées de ce compte seront aussi supprimées.")) return;
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/social-accounts/${accountId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { toast.success("Compte retiré"); fetchCampaign(); fetchAllAccounts(); fetchAllVideos(); }
      else { const e = await res.json(); toast.error(e.detail || "Erreur"); }
    } catch { toast.error("Erreur réseau"); }
  };

  const handleReassignAccount = async (accountId, currentUserId) => {
    // Affiche un select via prompt simple
    const members = activeMembers || [];
    const options = ["", ...members.map(m => m.user_id)];
    const labels = ["(Compte agence — gains agence)", ...members.map(m => m.user_info?.display_name || m.user_info?.name || m.user_id)];
    const promptText = "Réattribuer ce compte à :\n" + options.map((o, i) => `${i}: ${labels[i]}${o === currentUserId ? " (actuel)" : ""}`).join("\n") + "\n\nNuméro :";
    const choice = window.prompt(promptText, "0");
    if (choice === null) return;
    const idx = parseInt(choice, 10);
    if (isNaN(idx) || idx < 0 || idx >= options.length) { toast.error("Choix invalide"); return; }
    const newUserId = options[idx] || null;
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/social-accounts/${accountId}/reassign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_id: newUserId }),
      });
      if (res.ok) { toast.success("Compte réattribué"); fetchAllAccounts(); fetchAllVideos(); }
      else { const e = await res.json(); toast.error(e.detail || "Erreur"); }
    } catch { toast.error("Erreur réseau"); }
  };

  const handleReassignVideo = async (videoId, currentUserId) => {
    const members = activeMembers || [];
    const options = ["", ...members.map(m => m.user_id)];
    const labels = ["(Vidéo agence — gains agence)", ...members.map(m => m.user_info?.display_name || m.user_info?.name || m.user_id)];
    const promptText = "Réattribuer cette vidéo à :\n" + options.map((o, i) => `${i}: ${labels[i]}${o === currentUserId ? " (actuel)" : ""}`).join("\n") + "\n\nNuméro :";
    const choice = window.prompt(promptText, "0");
    if (choice === null) return;
    const idx = parseInt(choice, 10);
    if (isNaN(idx) || idx < 0 || idx >= options.length) { toast.error("Choix invalide"); return; }
    const newUserId = options[idx] || null;
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/tracked-videos/${videoId}/reassign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_id: newUserId }),
      });
      if (res.ok) { toast.success("Vidéo réattribuée"); fetchAllVideos(); }
      else { const e = await res.json(); toast.error(e.detail || "Erreur"); }
    } catch { toast.error("Erreur réseau"); }
  };

  const handleRefreshHistoric = async (accountId) => {
    if (!window.confirm("Forcer un re-scrape complet de ce compte depuis le début de la campagne ? (peut prendre 1-2 minutes)")) return;
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/social-accounts/${accountId}/refresh-historic`, { method: "POST", credentials: "include" });
      if (res.ok) { toast.success("Refresh historique lancé — actualisation dans 1-2 min", { duration: 6000 }); }
      else { const e = await res.json(); toast.error(e.detail || "Erreur"); }
    } catch { toast.error("Erreur réseau"); }
  };

  // ── Chart data: aggregate views per day from published_at ──────────────────
  const chartData = useMemo(() => {
    if (!allVideos.length) return [];
    const byDay = {};
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      byDay[key] = { date: key, views: 0, videos: 0 };
    }
    allVideos.forEach(v => {
      const d = (v.published_at || v.fetched_at || "").split("T")[0];
      if (byDay[d]) { byDay[d].views += v.views || 0; byDay[d].videos += 1; }
    });
    return Object.values(byDay).map(d => ({
      ...d,
      label: new Date(d.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    }));
  }, [allVideos]);

  // ── Filtered + sorted videos ─────────────────────────────────────────────
  const displayVideos = useMemo(() => {
    let vids = [...allVideos];
    if (filterPlatform !== "all") vids = vids.filter(v => v.platform === filterPlatform);
    if (filterClipper !== "all") vids = vids.filter(v => v.user_id === filterClipper);
    vids.sort((a, b) => {
      let av = a[sortField] ?? 0, bv = b[sortField] ?? 0;
      if (typeof av === "string") av = av.toLowerCase(); if (typeof bv === "string") bv = bv.toLowerCase();
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return vids;
  }, [allVideos, filterPlatform, filterClipper, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-white/20" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-[#FF007F]" /> : <ChevronDown className="w-3 h-3 text-[#FF007F]" />;
  };

  // ── Aggregate KPIs ───────────────────────────────────────────────────────
  const totalViews = allVideos.reduce((s, v) => s + (v.views || 0), 0);
  const totalLikes = allVideos.reduce((s, v) => s + (v.likes || 0), 0);
  const totalComments = allVideos.reduce((s, v) => s + (v.comments || 0), 0);
  const totalEarnings = allVideos.reduce((s, v) => s + (v.earnings || 0), 0);
  const engagementRate = totalViews > 0 ? ((totalLikes + totalComments) / totalViews * 100).toFixed(1) : "0.0";
  const avgViews = allVideos.length > 0 ? Math.round(totalViews / allVideos.length) : 0;

  // Clippers list for filter dropdown
  // Filter clippeurs SEULEMENT (pas de manager dans le classement)
  const activeMembers = campaign?.members?.filter(m => m.status === "active" && (m.role || "clipper") === "clipper") || [];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#FF007F] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!campaign) return <div className="text-center py-12"><p className="text-white/50">Campagne non trouvée</p></div>;

  const budgetPercentage = campaign.budget_total ? Math.min(100, (campaign.budget_used / campaign.budget_total) * 100) : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6" data-testid="agency-campaign-dashboard">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-1">{campaign.name}</h1>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-[#39FF14]/30 text-[#39FF14] text-xs">{campaign.status}</Badge>
            <span className="text-white/30 text-xs">{allVideos.length} vidéos trackées</span>
          </div>
        </div>
        <button onClick={() => { fetchAllVideos(); fetchStats(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-sm transition-all">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>


      {/* TABS — Shortimize style */}
      <div className="flex gap-0 bg-white/5 rounded-xl p-1 w-fit border border-white/10">
        {[
          { id: "overview", label: "Vue d'ensemble" },
          { id: "videos", label: `Vidéos & Comptes (${allVideos.length})`, dot: videosLoading },
          { id: "candidatures", label: "Candidatures", badge: pendingMembers.length + expulsionRequests.length },
          ...((campaign.payment_model === "clicks" || campaign.payment_model === "both") ? [{ id: "liens", label: "🔗 Liens" }] : []),
          { id: "clip-winner", label: "🏆 Clip Winner" },
          { id: "scraping", label: "🔄 Scraping" },
          { id: "settings", label: "⚙️ Paramètres" },
        ].map(tab => (
          <button key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === "candidatures") fetchPendingMembers();
              if (tab.id === "liens") fetchClickLinks();
              if (tab.id === "settings") {
                setSettingsForm({
                  name: campaign.name || "",
                  description: campaign.description || "",
                  destination_url: campaign.destination_url || "",
                  rate_per_click: campaign.rate_per_click || 0,
                  click_window_hours: campaign.click_window_hours || 24,
                  rpm: campaign.rpm || 0,
                  max_clippers: campaign.max_clippers || "",
                  platforms: campaign.platforms || [],
                  max_strikes: campaign.max_strikes ?? 3,
                  strike_days: campaign.strike_days ?? 3,
                  cadence: campaign.cadence ?? 1,
                  tracking_start_date: campaign.tracking_start_date ? campaign.tracking_start_date.slice(0, 10) : "",
                });
                setDeleteConfirmText("");
              }
            }}
            className={`relative flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id ? "bg-[#FF007F] text-white shadow-lg" : "text-white/50 hover:text-white"
            }`}>
            {tab.label}
            {tab.dot && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
            {tab.badge > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════ OVERVIEW TAB ═══════════ */}
      {activeTab === "overview" && campaign.payment_model === "both" && (
        <div className="flex justify-center">
          <div className="inline-flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
            <button onClick={() => setOverviewMode("views")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${overviewMode === "views" ? "bg-[#FF007F] text-white" : "text-white/50 hover:text-white"}`}>
              📊 Vues
            </button>
            <button onClick={() => setOverviewMode("clicks")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${overviewMode === "clicks" ? "bg-[#f0c040] text-black" : "text-white/50 hover:text-white"}`}>
              🔗 Clics
            </button>
          </div>
        </div>
      )}

      {activeTab === "overview" && (campaign.payment_model === "clicks" || (campaign.payment_model === "both" && overviewMode === "clicks")) ? (
        /* ── CLICK CAMPAIGN OVERVIEW ── */
        <div className="space-y-5">
          {/* ── Barre fine : budget restant + budget généré ce mois (campagne clic) ── */}
          {(() => {
            const now = new Date();
            const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            // Pour click campaigns, on calcule depuis click_events seraient idéals
            // mais on a déjà clickStats.total_earnings (cumulé). On approxime "ce mois" via filtrage chart si dispo
            const monthFromChart = (clickStats?.chart || []).reduce((s, d) => {
              const dt = new Date(d.date || d.label);
              return dt >= firstOfMonth ? s + (d.earnings || 0) : s;
            }, 0);
            const earningsThisMonth = monthFromChart > 0 ? monthFromChart : (clickStats?.total_earnings || 0);
            const budgetTotal = campaign.budget_total || 0;
            const budgetUsed = campaign.budget_used || 0;
            const budgetUnlimited = campaign.budget_unlimited;
            const pctRemaining = budgetTotal > 0 ? Math.max(0, 100 - (budgetUsed / budgetTotal) * 100) : 100;
            const monthLabel = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
            return (
              <div className="bg-[#121212] border border-white/10 rounded-xl px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                  <div className="flex items-center gap-3">
                    <span className="text-white/40">💰 Budget</span>
                    {budgetUnlimited ? (
                      <span className="text-[#39FF14] font-mono font-bold">♾️ Budget illimité</span>
                    ) : budgetTotal > 0 ? (
                      <>
                        <span className="text-white font-mono font-bold">€{budgetUsed.toFixed(0)} / €{budgetTotal.toFixed(0)}</span>
                        <span className={`font-mono font-bold ${pctRemaining < 10 ? "text-red-400" : pctRemaining < 30 ? "text-amber-400" : "text-[#39FF14]"}`}>
                          {pctRemaining.toFixed(0)}% restant
                        </span>
                      </>
                    ) : (
                      <span className="text-white/30">Pas de budget défini</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-white/40">Généré ce mois ({monthLabel})</span>
                      <span className="text-[#f0c040] font-mono font-bold">€{earningsThisMonth.toFixed(2)}</span>
                    </div>
                    <button
                      onClick={handleRefreshStats}
                      disabled={refreshingStats || refreshCountdown > 0}
                      title="Force un scrape immédiat (cooldown 5 min)"
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        refreshCountdown > 0
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/30 cursor-wait"
                          : "bg-[#00E5FF]/15 hover:bg-[#00E5FF]/25 text-[#00E5FF] border-[#00E5FF]/30 disabled:opacity-50"
                      }`}
                    >
                      {refreshingStats ? "↻ ..." :
                       refreshCountdown > 0 ? `⏳ Scraping ${refreshCountdown}s` :
                       "↻ Refresh stats"}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(
                          "⚠️ ATTENTION : Cette action va effacer TOUTES les stats actuelles de la campagne (vidéos, vues, snapshots) et relancer un scrape complet.\n\n" +
                          "Les données actuellement affichées seront perdues.\n\n" +
                          "À utiliser SEULEMENT si tu vois des stats fausses qui persistent.\n\n" +
                          "Confirmer le reset ?"
                        )) {
                          handleResetTrackingData();
                        }
                      }}
                      disabled={resetting}
                      title="Efface toutes les stats actuelles et relance un scrape complet (utile si stats fausses persistent)"
                      className="px-3 py-1 rounded-lg text-xs font-semibold border bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30 transition-all disabled:opacity-50"
                    >
                      {resetting ? "🗑️ Reset..." : "🗑️ Reset stats"}
                    </button>
                  </div>
                </div>
                {!budgetUnlimited && budgetTotal > 0 && (
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full transition-all"
                      style={{
                        width: `${100 - pctRemaining}%`,
                        background: pctRemaining < 10 ? "#FF4444" : pctRemaining < 30 ? "#f0c040" : "#39FF14",
                      }} />
                  </div>
                )}
                <p className="text-[10px] text-white/30">↻ Le compteur "Généré ce mois" se réinitialise automatiquement chaque 1er du mois</p>
              </div>
            );
          })()}

          {/* Period filter — synchronise les KPIs ET le graphique des clics */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
              {[
                { id: "1d", label: "Dernier jour" },
                { id: "7d", label: "7 jours" },
                { id: "30d", label: "30 jours" },
                { id: "all", label: "Depuis le début" },
                { id: "custom", label: <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Personnalisé</span> },
              ].map(p => (
                <button key={p.id} onClick={() => handlePeriodChange(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === p.id ? "bg-[#f0c040] text-black" : "text-white/50 hover:text-white"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {period === "custom" && (
              <div className="flex items-center gap-2">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#f0c040]/50" />
                <span className="text-white/30 text-xs">→</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#f0c040]/50" />
                <button onClick={handleCustomApply}
                  className="px-3 py-1.5 rounded-lg bg-[#f0c040] hover:bg-[#f0c040]/80 text-black text-xs font-bold transition-all">
                  Appliquer
                </button>
              </div>
            )}
            {clickStatsLoading && <div className="w-4 h-4 border-2 border-[#f0c040]/30 border-t-[#f0c040] rounded-full animate-spin" />}
          </div>

          {/* KPI row — clics ET vues (si disponible) — synchronisé avec period */}
          {clickStats && (() => {
            const periodLabels = { "1d": "24h", "7d": "7j", "30d": "30j", "all": "Tout", "custom": "perso" };
            const lbl = periodLabels[period] || period;
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: `Clics totaux (${lbl})`, value: (clickStats.total_clicks || 0).toLocaleString("fr-FR"), color: "text-white" },
                  { label: `Clics uniques (${lbl})`, value: (clickStats.unique_clicks || 0).toLocaleString("fr-FR"), color: "text-[#f0c040]" },
                  { label: `Taux unicité (${lbl})`, value: clickStats.total_clicks > 0 ? `${Math.round((clickStats.unique_clicks / clickStats.total_clicks) * 100)}%` : "—", color: "text-[#39FF14]" },
                  { label: `Gains générés (${lbl})`, value: `€${(clickStats.total_earnings || 0).toFixed(2)}`, color: "text-[#00E5FF]" },
                  { label: "Prix / 1K clics", value: `€${clickStats.rate_per_click || 0}`, color: "text-[#FF007F]" },
                  { label: `Moy. clics/jour (${lbl})`, value: clickStats.chart?.length > 0 ? Math.round(clickStats.total_clicks / Math.max(1, clickStats.chart.filter(d => d.clicks > 0).length)).toLocaleString("fr-FR") : "0", color: "text-white/70" },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-[#121212] border border-white/10 rounded-xl p-4">
                    <p className="text-xs text-white/40 mb-1">{kpi.label}</p>
                    <p className={`font-mono font-bold text-xl ${kpi.color}`}>{kpi.value}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Clicks chart */}
          <div className="bg-[#121212] border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-white font-medium flex items-center gap-2">
                <MousePointerClick className="w-4 h-4 text-[#f0c040]" /> Clics par jour
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-[#f0c040]" /><span className="text-white/30 text-xs">Tous les clics</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-[#39FF14]" /><span className="text-white/30 text-xs">Clics uniques</span>
                </div>
              </div>
            </div>
            {clickStatsLoading ? (
              <div className="h-48 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-[#f0c040]/30 border-t-[#f0c040] rounded-full animate-spin" />
              </div>
            ) : clickStats?.chart?.some(d => d.clicks > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={clickStats.chart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="clicksGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f0c040" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#f0c040" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="uniqueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#39FF14" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#39FF14" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false}
                    interval={Math.max(0, Math.floor((clickStats.chart?.length || 1) / 10) - 1)} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                    labelStyle={{ color: "white", fontSize: 11 }}
                    formatter={(v, name) => [v.toLocaleString("fr-FR"), name === "clicks" ? "Clics totaux" : "Clics uniques"]} />
                  <Area type="monotone" dataKey="clicks" stroke="#f0c040" strokeWidth={2} fill="url(#clicksGrad)" dot={false} />
                  <Area type="monotone" dataKey="unique_clicks" stroke="#39FF14" strokeWidth={1.5} fill="url(#uniqueGrad)" dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center">
                <p className="text-white/20 text-sm">Aucun clic enregistré sur cette période</p>
              </div>
            )}
          </div>

          {/* Budget + Clippers ranking for clicks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Budget click */}
            <div className="bg-[#121212] border border-white/10 rounded-xl p-5 space-y-4">
              <p className="text-white font-medium">Budget & Tarif clic</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-white/40">Prix / 1K clics</p>
                  <p className="text-[#f0c040] font-mono font-bold text-lg">€{campaign.rate_per_click || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40">Comptage</p>
                  <p className="text-white/70 text-sm font-medium mt-1">
                    {campaign.click_billing_mode === "unique_lifetime" ? "Unique à vie" : campaign.click_billing_mode === "all" ? "Tous les clics" : "Unique / 24h"}
                  </p>
                </div>
              </div>
              {!campaign.budget_unlimited && campaign.budget_total && (
                <div>
                  <div className="flex justify-between text-xs text-white/40 mb-1">
                    <span>Budget utilisé</span>
                    <span>€{campaign.budget_used || 0} / €{campaign.budget_total}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#f0c040] rounded-full transition-all" style={{ width: `${Math.min(100, ((campaign.budget_used || 0) / campaign.budget_total) * 100)}%` }} />
                  </div>
                </div>
              )}
              {!campaign.budget_unlimited && (
                <div>
                  {showAddBudget ? (
                    <div className="flex items-center gap-2">
                      <Input type="number" value={addBudgetAmount} onChange={e => setAddBudgetAmount(e.target.value)}
                        placeholder="Montant €" className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-8 text-sm"
                        onKeyDown={e => { if (e.key === "Enter") handleAddBudget(); if (e.key === "Escape") setShowAddBudget(false); }} autoFocus />
                      <button onClick={handleAddBudget} disabled={addingBudget || !addBudgetAmount}
                        className="px-3 h-8 rounded-lg bg-[#f0c040] hover:bg-[#f0c040]/80 text-black text-xs font-semibold disabled:opacity-50">{addingBudget ? "…" : "Ajouter"}</button>
                      <button onClick={() => { setShowAddBudget(false); setAddBudgetAmount(""); }}
                        className="px-2 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 text-xs">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddBudget(true)} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-[#f0c040] transition-colors">
                      <span className="text-base leading-none">＋</span> Ajouter du budget
                    </button>
                  )}
                </div>
              )}
              {campaign.destination_url && (
                <div className="p-2.5 rounded-lg bg-white/4 border border-white/8">
                  <p className="text-[10px] text-white/35 mb-0.5">URL de destination</p>
                  <p className="text-white/60 text-xs font-mono truncate">{campaign.destination_url}</p>
                </div>
              )}
            </div>

            {/* Clippers ranking — by clicks */}
            <div className="bg-[#121212] border border-white/10 rounded-xl p-5">
              <p className="text-white font-medium mb-3">Classement des clippeurs <span className="text-white/30 text-xs font-normal">(clics uniques)</span></p>
              {!clickStats?.clippers?.length ? (
                <p className="text-white/30 text-sm text-center py-4">Aucun clic enregistré</p>
              ) : (
                <div className="space-y-2">
                  {clickStats.clippers.map((c, idx) => {
                    // Match avec le member correspondant pour avoir strikes + status
                    const member = (campaign?.members || []).find(m => m.user_id === c.clipper_id) || {};
                    const maxStrikes = campaign?.max_strikes || 3;
                    const strikes = member.strikes || 0;
                    return (
                      <div key={c.clipper_id} className="flex items-center gap-2.5 p-2 rounded-lg bg-white/5">
                        <span className="font-mono text-xs text-white/30 w-5">#{idx + 1}</span>
                        <div className="w-6 h-6 rounded-full bg-[#f0c040]/20 flex items-center justify-center text-[10px] font-bold text-[#f0c040] flex-shrink-0">
                          {(c.name || "?")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs truncate">{c.name}</p>
                          <p className="text-white/30 text-[10px]">{c.total_clicks || c.clicks} clics · {c.unique_clicks} uniques · <span className="text-[#f0c040]">€{c.earnings.toFixed(2)}</span></p>
                        </div>
                        {/* Strikes - toujours visibles */}
                        {member.user_id && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => handleRemoveStrike(member.user_id)}
                              disabled={strikingMember === member.user_id || strikes === 0}
                              title="Retirer un strike"
                              className="w-5 h-5 rounded bg-white/5 hover:bg-white/15 text-white/40 hover:text-white text-xs font-bold border border-white/10 disabled:opacity-30 transition">−</button>
                            <div className="flex gap-0.5" title={`${strikes}/${maxStrikes} strikes`}>
                              {Array.from({ length: maxStrikes }).map((_, i) => (
                                <span key={i} className={`w-2 h-2 rounded-full ${i < strikes ? "bg-[#FF007F]" : "bg-white/10"}`} />
                              ))}
                            </div>
                            <button onClick={() => handleAddStrike(member.user_id)}
                              disabled={strikingMember === member.user_id}
                              title="Ajouter un strike"
                              className="w-5 h-5 rounded bg-[#FF007F]/10 hover:bg-[#FF007F]/25 text-[#FF007F] text-xs font-bold border border-[#FF007F]/20 disabled:opacity-50 transition">+</button>
                            {member.status === "suspended" && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-bold ml-1">BAN</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === "overview" && (
        <div className="space-y-5">
          {/* ── Barre fine : budget restant + budget généré ce mois ─────── */}
          {(() => {
            const now = new Date();
            const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const earningsThisMonth = (allVideos || []).reduce((s, v) => {
              if (!v.published_at) return s;
              const pub = new Date(v.published_at);
              return pub >= firstOfMonth ? s + (v.earnings || 0) : s;
            }, 0);
            const budgetTotal = campaign.budget_total || 0;
            const budgetUsed = campaign.budget_used || 0;
            const budgetUnlimited = campaign.budget_unlimited;
            const pctRemaining = budgetTotal > 0 ? Math.max(0, 100 - (budgetUsed / budgetTotal) * 100) : 100;
            const monthLabel = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
            return (
              <div className="bg-[#121212] border border-white/10 rounded-xl px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                  <div className="flex items-center gap-3">
                    <span className="text-white/40">💰 Budget</span>
                    {budgetUnlimited ? (
                      <span className="text-[#39FF14] font-mono font-bold">♾️ Budget illimité</span>
                    ) : budgetTotal > 0 ? (
                      <>
                        <span className="text-white font-mono font-bold">€{budgetUsed.toFixed(0)} / €{budgetTotal.toFixed(0)}</span>
                        <span className={`font-mono font-bold ${pctRemaining < 10 ? "text-red-400" : pctRemaining < 30 ? "text-amber-400" : "text-[#39FF14]"}`}>
                          {pctRemaining.toFixed(0)}% restant
                        </span>
                      </>
                    ) : (
                      <span className="text-white/30">Pas de budget défini</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-white/40">Généré ce mois ({monthLabel})</span>
                      <span className="text-[#f0c040] font-mono font-bold">€{earningsThisMonth.toFixed(2)}</span>
                    </div>
                    <button
                      onClick={handleRefreshStats}
                      disabled={refreshingStats || refreshCountdown > 0}
                      title="Force un scrape immédiat (cooldown 5 min)"
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        refreshCountdown > 0
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/30 cursor-wait"
                          : "bg-[#00E5FF]/15 hover:bg-[#00E5FF]/25 text-[#00E5FF] border-[#00E5FF]/30 disabled:opacity-50"
                      }`}
                    >
                      {refreshingStats ? "↻ ..." :
                       refreshCountdown > 0 ? `⏳ Scraping ${refreshCountdown}s` :
                       "↻ Refresh stats"}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(
                          "⚠️ ATTENTION : Cette action va effacer TOUTES les stats actuelles de la campagne (vidéos, vues, snapshots) et relancer un scrape complet.\n\n" +
                          "Les données actuellement affichées seront perdues.\n\n" +
                          "À utiliser SEULEMENT si tu vois des stats fausses qui persistent.\n\n" +
                          "Confirmer le reset ?"
                        )) {
                          handleResetTrackingData();
                        }
                      }}
                      disabled={resetting}
                      title="Efface toutes les stats actuelles et relance un scrape complet (utile si stats fausses persistent)"
                      className="px-3 py-1 rounded-lg text-xs font-semibold border bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30 transition-all disabled:opacity-50"
                    >
                      {resetting ? "🗑️ Reset..." : "🗑️ Reset stats"}
                    </button>
                  </div>
                </div>
                {!budgetUnlimited && budgetTotal > 0 && (
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full transition-all"
                      style={{
                        width: `${100 - pctRemaining}%`,
                        background: pctRemaining < 10 ? "#FF4444" : pctRemaining < 30 ? "#f0c040" : "#39FF14",
                      }} />
                  </div>
                )}
                <p className="text-[10px] text-white/30">↻ Le compteur "Généré ce mois" se réinitialise automatiquement chaque 1er du mois</p>
              </div>
            );
          })()}

          {/* KPI row — synchronisé avec la période ET l'offset du graphique ci-dessous */}
          {(() => {
            // Fenêtre identique à celle du graph (backend) : [end - days*offset - days, end - days*offset]
            const days = parseInt(viewsPeriod) || 30;
            const now = Date.now();
            const periodMs = days * 24 * 60 * 60 * 1000;
            const end = new Date(now - periodMs * viewsOffset);
            const start = new Date(end.getTime() - periodMs);
            const periodVideos = (allVideos || []).filter(v => {
              if (!v.published_at) return false;
              const pub = new Date(v.published_at);
              return pub >= start && pub <= end;
            });
            const pViews = periodVideos.reduce((s, v) => s + (v.views || 0), 0);
            const pLikes = periodVideos.reduce((s, v) => s + (v.likes || 0), 0);
            const pComments = periodVideos.reduce((s, v) => s + (v.comments || 0), 0);
            const pEarnings = periodVideos.reduce((s, v) => s + (v.earnings || 0), 0);
            const pEngagement = pViews > 0 ? ((pLikes + pComments) / pViews * 100).toFixed(1) : "0.0";
            const pAvgViews = periodVideos.length > 0 ? Math.round(pViews / periodVideos.length) : 0;
            const periodLabels = { "1": "24h", "7": "7j", "30": "30j", "90": "90j", "365": "1 an" };
            const baseLbl = periodLabels[viewsPeriod] || "30j";
            const lbl = viewsOffset > 0 ? `${baseLbl} · -${viewsOffset}` : baseLbl;
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: `Vues (${lbl})`, value: fmt(pViews), color: "text-white" },
                  { label: `Likes (${lbl})`, value: fmt(pLikes), color: "text-[#FF007F]" },
                  { label: `Commentaires (${lbl})`, value: fmt(pComments), color: "text-white/70" },
                  { label: `Engagement (${lbl})`, value: `${pEngagement}%`, color: "text-[#39FF14]" },
                  { label: `Moy. vues/vidéo (${lbl})`, value: fmt(pAvgViews), color: "text-[#00E5FF]" },
                  { label: `Gains générés (${lbl})`, value: `€${pEarnings.toFixed(0)}`, color: "text-[#f0c040]" },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-[#121212] border border-white/10 rounded-xl p-4">
                    <p className="text-xs text-white/40 mb-1">{kpi.label}</p>
                    <p className={`font-mono font-bold text-xl ${kpi.color}`}>{kpi.value}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── PANEL retire : Gains par mois etait estime (distribution lineaire),
              donc retire pour ne JAMAIS afficher de chiffres approximatifs.
              Remplacement futur : panel base sur video_views_snapshots (vraies donnees
              jour par jour, dispo apres 30 jours de campagne). ─── */}

          {/* Views timeline chart */}
          <div className="bg-[#121212] border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <p className="text-white font-medium">Vues</p>
                {viewsTimeline?.period_start && viewsOffset > 0 && (
                  <p className="text-[10px] text-white/40 mt-0.5">
                    {new Date(viewsTimeline.period_start).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                    {" → "}
                    {new Date(viewsTimeline.period_end).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Flèches d'offset (navigation entre périodes) */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setViewsOffset(o => o + 1)}
                    title="Période précédente"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all">‹</button>
                  {viewsOffset > 0 && (
                    <span className="text-[10px] text-white/50 px-1">il y a {viewsOffset} période{viewsOffset > 1 ? "s" : ""}</span>
                  )}
                  <button
                    onClick={() => setViewsOffset(o => Math.max(0, o - 1))}
                    disabled={viewsOffset === 0}
                    title="Période suivante"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all">›</button>
                </div>
                {/* Sélecteur de granularité */}
                <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5 gap-0.5">
                  {[["1","24h"],["7","7j"],["30","30j"],["90","90j"],["365","1an"]].map(([val, label]) => (
                    <button key={val} onClick={() => { setViewsPeriod(val); setViewsOffset(0); }}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewsPeriod === val ? "bg-white/15 text-white" : "text-white/40 hover:text-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {viewsTimelineLoading && <div className="w-4 h-4 border-2 border-[#FF007F]/30 border-t-[#FF007F] rounded-full animate-spin" />}
              </div>
            </div>
            {(() => {
              const isHourly = viewsTimeline?.granularity === "hourly";
              const days = parseInt(viewsTimeline?.days || viewsPeriod) || 30;
              const tlData = (viewsTimeline?.timeline || []).map(d => ({
                ...d,
                label: d.label || (isHourly
                  ? new Date(d.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                  : new Date(d.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })),
              }));
              const hasData = tlData.some(d => d.views > 0 || d.total_views > 0);
              // En mode horaire 24h on a 4 points (Business) ou 1 (Starter/Pro)
              // Sur 7j/30j on a beaucoup de points (28-120) → on cache les dots
              const showDots = isHourly && days <= 1;
              return hasData ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={tlData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="viewsTimelineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF007F" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#FF007F" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false}
                      interval={Math.max(0, Math.floor(tlData.length / 10) - 1)} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
                    <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                      labelStyle={{ color: "white", fontSize: 11 }}
                      formatter={(v, name) => [fmt(v), isHourly ? "Nouvelles vues" : "Vues"]} />
                    <Area type="monotone" dataKey="views" stroke="#FF007F" strokeWidth={2} fill="url(#viewsTimelineGrad)" dot={showDots ? { fill: "#FF007F", r: 4 } : false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center">
                  {viewsTimelineLoading
                    ? <div className="w-6 h-6 border-2 border-[#FF007F]/30 border-t-[#FF007F] rounded-full animate-spin" />
                    : <p className="text-white/20 text-sm text-center px-4">
                        {viewsOffset > 0
                          ? "Aucune donnée pour cette période passée"
                          : isHourly
                            ? "Pas encore de données — le premier scrape s'effectuera à 07:30 Paris"
                            : "Aucune donnée — les vues s'accumulent au fur et à mesure du tracking"}
                      </p>
                  }
                </div>
              );
            })()}
          </div>

          {/* Budget + Clippers ranking */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Budget */}
            <div className="bg-[#121212] border border-white/10 rounded-xl p-5 space-y-4">
              <p className="text-white font-medium">
                {campaign.payment_model === "clicks" ? "Budget & Tarif clic" : "Budget & RPM"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {campaign.payment_model === "clicks" ? (
                  <>
                    <div>
                      <p className="text-xs text-white/40">Prix / 1K clics</p>
                      <p className="text-[#FF007F] font-mono font-bold text-lg">€{campaign.rate_per_click || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-white/40">Type</p>
                      <p className="text-white/70 text-sm font-medium mt-1">
                        {campaign.click_billing_mode === "unique_lifetime" ? "Unique à vie" : campaign.click_billing_mode === "all" ? "Tous les clics" : "Unique / 24h"}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div><p className="text-xs text-white/40">RPM</p><p className="text-[#FF007F] font-mono font-bold text-lg">€{campaign.rpm}/1K</p></div>
                    {!campaign.budget_unlimited && campaign.budget_total && (
                      <div><p className="text-xs text-white/40">Budget utilisé</p><p className="text-white font-mono font-bold text-lg">€{campaign.budget_used || 0} / €{campaign.budget_total}</p></div>
                    )}
                  </>
                )}
              </div>
              {campaign.payment_model !== "clicks" && !campaign.budget_unlimited && campaign.budget_total && (
                <div>
                  <div className="flex justify-between text-xs text-white/40 mb-1">
                    <span>Progression</span><span>{budgetPercentage.toFixed(0)}%</span>
                  </div>
                  <Progress value={budgetPercentage} className="h-2" />
                </div>
              )}
              {/* Add budget */}
              {!campaign.budget_unlimited && (
                <div>
                  {showAddBudget ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={addBudgetAmount}
                        onChange={(e) => setAddBudgetAmount(e.target.value)}
                        placeholder="Montant €"
                        className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-8 text-sm"
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddBudget(); if (e.key === "Escape") setShowAddBudget(false); }}
                        autoFocus
                      />
                      <button
                        onClick={handleAddBudget}
                        disabled={addingBudget || !addBudgetAmount}
                        className="px-3 h-8 rounded-lg bg-[#FF007F] hover:bg-[#FF007F]/80 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                      >
                        {addingBudget ? "…" : "Ajouter"}
                      </button>
                      <button
                        onClick={() => { setShowAddBudget(false); setAddBudgetAmount(""); }}
                        className="px-2 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 text-xs transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddBudget(true)}
                      className="flex items-center gap-1.5 text-xs text-white/40 hover:text-[#FF007F] transition-colors"
                    >
                      <span className="text-base leading-none">＋</span> Ajouter du budget
                    </button>
                  )}
                </div>
              )}
              {campaign.payment_model === "clicks" && campaign.destination_url && (
                <div className="p-2.5 rounded-lg bg-white/4 border border-white/8">
                  <p className="text-[10px] text-white/35 mb-0.5">URL de destination</p>
                  <p className="text-white/60 text-xs font-mono truncate">{campaign.destination_url}</p>
                </div>
              )}
            </div>

            {/* Clippers ranking */}
            <div className="bg-[#121212] border border-white/10 rounded-xl p-5">
              <p className="text-white font-medium mb-3">Classement des clippeurs</p>
              {activeMembers.length === 0 ? (
                <p className="text-white/30 text-sm text-center py-4">Aucun clippeur actif</p>
              ) : (
                <div className="space-y-2">
                  {activeMembers.map((member, index) => {
                    const memberVideos = allVideos.filter(v => v.user_id === member.user_id);
                    const memberViews = memberVideos.reduce((s, v) => s + (v.views || 0), 0);
                    const memberEarnings = memberVideos.reduce((s, v) => s + (v.earnings || 0), 0);
                    const maxStrikes = campaign?.max_strikes || 3;
                    const strikes = member.strikes || 0;
                    return (
                      <div key={member.member_id} className="rounded-lg bg-white/5 overflow-hidden">
                        <div className="flex items-center gap-2.5 p-2">
                          <span className="font-mono text-xs text-white/30 w-5">#{index+1}</span>
                          <div className="w-6 h-6 rounded-full bg-[#FF007F]/20 flex items-center justify-center text-[10px] font-bold text-[#FF007F] flex-shrink-0">
                            {(member.user_info?.display_name || "?")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs truncate">{member.user_info?.display_name || member.user_info?.name}</p>
                            <p className="text-white/30 text-[10px]">{memberVideos.length} vid · {fmt(memberViews)} vues · <span className="text-[#FF007F]">€{memberEarnings.toFixed(2)}</span></p>
                          </div>
                          {/* Strikes - toujours visible */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleRemoveStrike(member.user_id)}
                              disabled={strikingMember === member.user_id || strikes === 0}
                              title="Retirer un strike"
                              className="w-5 h-5 rounded bg-white/5 hover:bg-white/15 text-white/40 hover:text-white text-xs font-bold border border-white/10 disabled:opacity-30 transition">−</button>
                            <div className="flex gap-0.5" title={`${strikes}/${maxStrikes} strikes`}>
                              {Array.from({ length: maxStrikes }).map((_, i) => (
                                <span key={i} className={`w-2 h-2 rounded-full ${i < strikes ? "bg-[#FF007F]" : "bg-white/10"}`} />
                              ))}
                            </div>
                            <button
                              onClick={() => handleAddStrike(member.user_id)}
                              disabled={strikingMember === member.user_id}
                              title="Ajouter un strike"
                              className="w-5 h-5 rounded bg-[#FF007F]/10 hover:bg-[#FF007F]/25 text-[#FF007F] text-xs font-bold border border-[#FF007F]/20 disabled:opacity-50 transition">+</button>
                            {member.status === "suspended" && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-bold ml-1">BAN</span>}
                          </div>
                          <button
                            onClick={() => setExpandedMembers(prev => { const s = new Set(prev); s.has(member.user_id) ? s.delete(member.user_id) : s.add(member.user_id); return s; })}
                            className="text-white/20 hover:text-white/60 text-xs px-1 transition-colors"
                            title="Plus d'options"
                          >⋯</button>
                        </div>
                        {expandedMembers.has(member.user_id) && (
                          <div className="border-t border-white/5 px-3 py-2 space-y-2">
                            {(member.social_accounts || []).length > 0 && (
                              <div className="space-y-1">
                                {(member.social_accounts || []).map(acc => (
                                  <div key={acc.account_id} className="flex items-center gap-2 text-xs text-white/40">
                                    <span>{acc.platform === "tiktok" ? "🎵" : acc.platform === "instagram" ? "📸" : "▶️"}</span>
                                    <span className="flex-1">@{acc.username}</span>
                                    <button
                                      onClick={() => handleRemoveSocialAccount(acc.account_id)}
                                      className="text-red-400/50 hover:text-red-400 transition-colors"
                                      title="Retirer ce compte"
                                    >✕</button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={() => handleKickMember(member.user_id)}
                              disabled={kickingMember === member.user_id}
                              className="w-full py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/20 transition-colors disabled:opacity-50"
                            >
                              {kickingMember === member.user_id ? "Retrait..." : "🚫 Retirer de la campagne"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ VIDEOS & COMPTES TAB ═══════════ */}
      {activeTab === "videos" && (
        <div className="space-y-4">
          {/* Toggle sous-vue : Vidéos / Comptes */}
          <div className="flex items-center gap-2">
            <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
              <button
                onClick={() => setVideosSubView("videos")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${videosSubView === "videos" ? "bg-[#FF007F] text-white" : "text-white/50 hover:text-white"}`}>
                📹 Vidéos
              </button>
              <button
                onClick={() => { setVideosSubView("accounts"); if (allAccountsByClipper.length === 0) fetchAllAccounts(); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${videosSubView === "accounts" ? "bg-[#FF007F] text-white" : "text-white/50 hover:text-white"}`}>
                👥 Comptes
              </button>
            </div>
            {videosSubView === "accounts" && (
              <>
                <button onClick={fetchAllAccounts} disabled={accountsLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs transition-all">
                  {accountsLoading ? "Chargement…" : "↻ Rafraîchir"}
                </button>
                <button onClick={() => { setTrackAccountForm({ user_id: "", platform: ((campaign?.platforms && campaign.platforms.length > 0) ? campaign.platforms[0] : "tiktok"), username: "" }); setAccountVideos(null); setShowTrackAccountModal(true); }}
                  className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/30 text-[#00E5FF] text-xs font-medium transition-all">
                  + Tracker un compte / vidéos
                </button>
              </>
            )}
          </div>

          {/* Sous-vue VIDÉOS */}
          {videosSubView === "videos" && (
          <>
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex bg-white/5 border border-white/10 rounded-lg p-1 gap-1">
              {["all", "tiktok", "instagram", "youtube"].map(p => (
                <button key={p} onClick={() => setFilterPlatform(p)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${filterPlatform === p ? "bg-white/10 text-white" : "text-white/40 hover:text-white"}`}
                  style={filterPlatform === p && p !== "all" ? { color: PLAT_COLOR[p] } : {}}>
                  {p === "all" ? "Toutes" : `${PLAT_ICON[p]} ${p}`}
                </button>
              ))}
            </div>
            {activeMembers.length > 0 && (
              <select value={filterClipper} onChange={e => setFilterClipper(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 focus:outline-none">
                <option value="all">Tous les clippeurs</option>
                {activeMembers.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.user_info?.display_name || m.user_info?.name}</option>
                ))}
              </select>
            )}
            <span className="text-white/30 text-xs self-center">{displayVideos.length} vidéo{displayVideos.length !== 1 ? "s" : ""}</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => { setTrackAccountForm({ user_id: "", platform: ((campaign?.platforms && campaign.platforms.length > 0) ? campaign.platforms[0] : "tiktok"), username: "" }); setAccountVideos(null); setShowTrackAccountModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/30 text-[#00E5FF] text-xs font-medium transition-all">
                + Tracker un compte / vidéos
              </button>
            </div>
          </div>


          {/* Modal ajout vidéo manuelle */}
          {showManualVideoModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-white font-semibold text-lg">Tracker une vidéo</h3>
                    <p className="text-white/40 text-xs mt-0.5">Les stats sont récupérées automatiquement — toujours comptabilisées dans la rémunération.</p>
                  </div>
                  <button onClick={() => { setShowManualVideoModal(false); setTrackResult(null); setManualVideoForm({ target: "", url: "", platform: ((campaign?.platforms && campaign.platforms.length > 0) ? campaign.platforms[0] : "tiktok") }); }} className="text-white/30 hover:text-white text-xl leading-none">✕</button>
                </div>

                {/* Résultat après tracking */}
                {trackResult && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-sm">
                    <p className="text-green-400 font-medium mb-1">✓ Vidéo trackée</p>
                    <p className="text-white/70 truncate">{trackResult.title}</p>
                    <div className="flex gap-4 mt-1.5 text-xs text-white/50">
                      <span>👁 {trackResult.views.toLocaleString("fr-FR")} vues</span>
                      {trackResult.earnings > 0 && <span>💰 €{trackResult.earnings.toFixed(2)} générés</span>}
                    </div>
                  </div>
                )}

                {/* Attribuer à */}
                <div>
                  <label className="text-xs text-white/50 block mb-1.5">Attribuer à</label>
                  <select value={manualVideoForm.target}
                    onChange={e => setManualVideoForm(f => ({ ...f, target: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#f0c040]/50">
                    <option value="">— Aucun clippeur (vues seulement)</option>
                    <option value="all">Tous les clippeurs actifs</option>
                    {activeMembers.map(m => (
                      <option key={m.user_id} value={m.user_id}>{m.user_info?.display_name || m.user_info?.name}</option>
                    ))}
                  </select>
                  {manualVideoForm.target === "all" && (
                    <p className="text-xs text-amber-400/70 mt-1">⚠️ Les gains seront divisés entre tous les clippeurs actifs.</p>
                  )}
                </div>

                {/* Plateforme — filtré par les plateformes autorisées de la campagne */}
                <div>
                  <label className="text-xs text-white/50 block mb-1.5">Plateforme *</label>
                  <div className="flex gap-2">
                    {(() => {
                      const allowed = (campaign?.platforms && campaign.platforms.length > 0) ? campaign.platforms : ["tiktok","instagram","youtube"];
                      const ALL = [["tiktok","🎵"], ["instagram","📸"], ["youtube","▶️"]];
                      return ALL.filter(([p]) => allowed.includes(p)).map(([p, icon]) => (
                        <button key={p} onClick={() => setManualVideoForm(f => ({ ...f, platform: p }))}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border ${manualVideoForm.platform === p ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/10 text-white/40 hover:text-white/70"}`}>
                          {icon} {p}
                        </button>
                      ));
                    })()}
                  </div>
                  {campaign?.platforms && campaign.platforms.length > 0 && campaign.platforms.length < 3 && (
                    <p className="text-xs text-white/40 mt-1.5">
                      Pour ajouter d'autres plateformes, va dans ⚙️ Paramètres → Plateformes acceptées.
                    </p>
                  )}
                </div>

                {/* URL directe — methode unique, fiable */}
                <div>
                  <label className="text-xs text-white/50 block mb-1.5">URL de la vidéo *</label>
                  <input type="url" value={manualVideoForm.url}
                    onChange={e => setManualVideoForm(f => ({ ...f, url: e.target.value }))}
                    placeholder="https://www.tiktok.com/@username/video/..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#f0c040]/50" />
                  <p className="text-[11px] text-white/40 mt-1.5">
                    💡 Copie l'URL de la vidéo depuis TikTok / Instagram / YouTube et colle-la ici. Les stats (vues, likes) sont récupérées automatiquement.
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => { setShowManualVideoModal(false); setTrackResult(null); setManualVideoForm({ target: "", url: "", platform: ((campaign?.platforms && campaign.platforms.length > 0) ? campaign.platforms[0] : "tiktok") }); }}
                    className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white text-sm transition-all">
                    {trackResult ? "Fermer" : "Annuler"}
                  </button>
                  <button onClick={handleAddManualVideo}
                    disabled={addingVideo || !manualVideoForm.url}
                    className="flex-1 py-2.5 rounded-xl bg-[#f0c040] text-black font-semibold text-sm hover:bg-[#f0c040]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    {addingVideo ? "Tracking..." : "Tracker cette vidéo"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {videosLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#FF007F] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : displayVideos.length === 0 ? (
            <div className="text-center py-20 bg-[#121212] border border-white/10 rounded-xl">
              <Play className="w-12 h-12 text-white/10 mx-auto mb-3" />
              <p className="text-white/40">Aucune vidéo trackée</p>
              <p className="text-white/20 text-sm mt-1">Les clippeurs doivent lancer un scraping depuis leur dashboard</p>
            </div>
          ) : (
            <div className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-b border-white/10 text-xs text-white/40 font-medium">
                <button className="flex items-center gap-1 text-left hover:text-white/70 transition-colors" onClick={() => toggleSort("title")}>
                  Vidéo <SortIcon field="title" />
                </button>
                <button className="flex items-center gap-1 hover:text-white/70 transition-colors" onClick={() => toggleSort("views")}>
                  Vues <SortIcon field="views" />
                </button>
                <button className="flex items-center gap-1 hover:text-white/70 transition-colors" onClick={() => toggleSort("likes")}>
                  Likes <SortIcon field="likes" />
                </button>
                <button className="flex items-center gap-1 hover:text-white/70 transition-colors" onClick={() => toggleSort("comments")}>
                  Comments <SortIcon field="comments" />
                </button>
                <button className="flex items-center gap-1 hover:text-white/70 transition-colors" onClick={() => toggleSort("earnings")}>
                  Gains <SortIcon field="earnings" />
                </button>
                <button className="flex items-center gap-1 hover:text-white/70 transition-colors" onClick={() => toggleSort("published_at")}>
                  Date <SortIcon field="published_at" />
                </button>
                <div></div>
              </div>

              {/* Table rows */}
              <div className="divide-y divide-white/5">
                {displayVideos.map((video, i) => {
                  const color = PLAT_COLOR[video.platform] || "#fff";
                  const engRate = video.views > 0 ? (((video.likes || 0) + (video.comments || 0)) / video.views * 100).toFixed(1) : "—";
                  const clipperName = activeMembers.find(m => m.user_id === video.user_id)?.user_info?.display_name || null;
                  return (
                    <a key={video.video_id || i} href={video.url} target="_blank" rel="noopener noreferrer"
                      className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 hover:bg-white/5 transition-all group items-center">

                      {/* Thumbnail + title */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative w-16 h-10 rounded-md overflow-hidden flex-shrink-0 bg-white/10">
                          {video.thumbnail_url
                            ? <img src={imgSrc(video.thumbnail_url)} alt="" className="w-full h-full object-cover"
                                onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
                            : null}
                          <div className="w-full h-full items-center justify-center text-lg"
                            style={{ display: video.thumbnail_url ? "none" : "flex" }}>
                            {PLAT_ICON[video.platform]}
                          </div>
                          {/* Play overlay on hover */}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ExternalLink className="w-4 h-4 text-white" />
                          </div>
                          {/* Platform pill */}
                          <span className="absolute bottom-0.5 left-0.5 text-[8px] font-bold px-1 py-0.5 rounded"
                            style={{ background: `${color}ee`, color: "#000" }}>
                            {video.platform}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm truncate leading-tight">
                            {video.title || `Vidéo ${video.platform}`}
                          </p>
                          {clipperName ? (
                            <p className="text-white/30 text-xs truncate mt-0.5">{clipperName}</p>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#f0c040]/15 text-[#f0c040] border border-[#f0c040]/25 mt-0.5 font-medium">
                              💰 Gains agence
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Views */}
                      <div className="text-white font-mono text-sm flex items-center gap-1">
                        {fmt(video.views || 0)}
                        {video.platform === "instagram" && (
                          <span
                            className="text-[10px] text-white/30 cursor-help"
                            title="Vues Instagram officielles (méthode Meta API : vues > 1s de lecture). L'app Insta peut afficher un nombre plus élevé qui inclut les vues Facebook cross-post — ce nombre n'est pas accessible via les APIs publiques."
                          >ⓘ</span>
                        )}
                      </div>

                      {/* Likes */}
                      <div className="flex items-center gap-1 text-white/60 text-sm">
                        <Heart className="w-3 h-3 text-[#FF007F]" />
                        {fmt(video.likes || 0)}
                      </div>

                      {/* Comments */}
                      <div className="flex items-center gap-1 text-white/60 text-sm">
                        <MessageSquare className="w-3 h-3 text-[#00E5FF]" />
                        {fmt(video.comments || 0)}
                      </div>

                      {/* Earnings */}
                      <div className={`font-mono text-sm font-bold ${(video.earnings || 0) > 0 ? "text-[#f0c040]" : "text-white/20"}`}>
                        {(video.earnings || 0) > 0 ? `€${video.earnings.toFixed(2)}` : "—"}
                      </div>

                      {/* Date */}
                      <div className="text-white/40 text-xs">
                        {video.published_at
                          ? new Date(video.published_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })
                          : "—"}
                      </div>
                      {/* Actions : réassigner + supprimer */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReassignVideo(video.video_id, video.user_id); }}
                          className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-[#00E5FF] transition-colors"
                          title="Réattribuer cette vidéo"
                        >👤</button>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteVideo(video.video_id); }}
                          disabled={deletingVideo === video.video_id}
                          className="p-1 rounded hover:bg-red-500/20 text-red-400/50 hover:text-red-400 transition-colors disabled:opacity-30"
                          title="Supprimer la vidéo du tracking"
                        >🗑</button>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
          </>
          )}

          {/* Sous-vue COMPTES — groupé par clipper avec mini-vidéos */}
          {videosSubView === "accounts" && (
            <div className="space-y-4">
              {accountsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-2 border-[#FF007F] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : allAccountsByClipper.length === 0 ? (
                <div className="text-center py-20 bg-[#121212] border border-white/10 rounded-xl">
                  <Users className="w-12 h-12 text-white/10 mx-auto mb-3" />
                  <p className="text-white/40">Aucun compte assigné</p>
                  <p className="text-white/20 text-sm mt-1">Les clippeurs doivent attribuer leurs comptes depuis leur dashboard</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-white/40 text-xs">
                    {allAccountsByClipper.length} clippeur{allAccountsByClipper.length > 1 ? "s" : ""} ·{" "}
                    {allAccountsByClipper.reduce((s, c) => s + c.accounts.length, 0)} compte{allAccountsByClipper.reduce((s, c) => s + c.accounts.length, 0) > 1 ? "s" : ""} au total
                  </p>
                  {allAccountsByClipper.map(clipper => (
                    <div key={clipper.user_id || "__agency__"} className={`bg-[#121212] border rounded-xl p-4 ${clipper.is_agency_owned ? "border-[#f0c040]/40 bg-[#f0c040]/5" : "border-white/10"}`}>
                      {/* Header clipper / agence */}
                      <div className={`flex items-center gap-3 mb-3 pb-3 border-b ${clipper.is_agency_owned ? "border-[#f0c040]/20" : "border-white/8"}`}>
                        <div className={`w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${clipper.is_agency_owned ? "bg-[#f0c040]/20" : "bg-[#00E5FF]/20"}`}>
                          {clipper.picture
                            ? <img src={clipper.picture} alt="" className="w-full h-full object-cover" />
                            : clipper.is_agency_owned
                              ? <span className="text-base">💰</span>
                              : <span className="text-sm font-bold text-[#00E5FF]">{(clipper.display_name || "?")[0].toUpperCase()}</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-semibold truncate ${clipper.is_agency_owned ? "text-[#f0c040]" : "text-white"}`}>{clipper.display_name}</p>
                            {clipper.is_agency_owned && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#f0c040]/20 text-[#f0c040] border border-[#f0c040]/30 font-medium whitespace-nowrap">
                                Gains agence
                              </span>
                            )}
                          </div>
                          <p className="text-white/40 text-xs">
                            {clipper.accounts.length} compte{clipper.accounts.length > 1 ? "s" : ""} · {clipper.recent_videos.length} vidéo{clipper.recent_videos.length > 1 ? "s" : ""} récente{clipper.recent_videos.length > 1 ? "s" : ""}
                            {clipper.is_agency_owned && " · gains non attribués à un clippeur"}
                          </p>
                        </div>
                      </div>

                      {/* Comptes en grille — chaque carte montre stats CETTE campagne (vues/likes/posts) + abonnes (compte global) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
                        {clipper.accounts.map(acc => {
                          const link = acc.account_url || (
                            acc.platform === "tiktok" ? `https://tiktok.com/@${acc.username}` :
                            acc.platform === "instagram" ? `https://instagram.com/${acc.username}` :
                            `https://youtube.com/@${acc.username}`
                          );
                          // Stats cumulees sur cette campagne (filtre allVideos par account_id)
                          const accVideos = (allVideos || []).filter(v => v.account_id === acc.account_id);
                          const accViews = accVideos.reduce((s, v) => s + (v.views || 0), 0);
                          const accLikes = accVideos.reduce((s, v) => s + (v.likes || 0), 0);
                          const accPosts = accVideos.length;
                          return (
                            <div key={acc.account_id}
                              className="flex flex-col gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 transition-all group">
                              {/* Ligne 1 : nom du compte + actions */}
                              <div className="flex items-center gap-2">
                                <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-base">{PLAT_ICON[acc.platform]}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white text-xs font-medium truncate">@{acc.username}</p>
                                    {acc.follower_count != null && (
                                      <p className="text-white/30 text-[10px]">{fmt(acc.follower_count)} abonnés</p>
                                    )}
                                  </div>
                                  <ExternalLink className="w-3 h-3 text-white/30 group-hover:text-white/70 transition-colors flex-shrink-0" />
                                  {acc.status !== "verified" && (
                                    <span className="text-[9px] text-amber-400/70 flex-shrink-0">{acc.status}</span>
                                  )}
                                </a>
                                <div className="flex items-center gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
                                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReassignAccount(acc.account_id, clipper.user_id); }}
                                    title="Réattribuer ce compte à un autre clippeur"
                                    className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-[#00E5FF] text-xs">👤</button>
                                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRefreshHistoric(acc.account_id); }}
                                    title="Refresh historique depuis début campagne"
                                    className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-[#39FF14] text-xs">↻</button>
                                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveSocialAccount(acc.account_id); }}
                                    title="Retirer ce compte de la campagne"
                                    className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-red-400 text-xs">🗑</button>
                                </div>
                              </div>
                              {/* Ligne 2 : stats sur cette campagne */}
                              <div className="grid grid-cols-3 gap-1 pt-1 border-t border-white/8">
                                <div className="text-center">
                                  <p className="text-[#00E5FF] text-xs font-mono font-bold">{fmt(accViews)}</p>
                                  <p className="text-[9px] text-white/40 uppercase">Vues</p>
                                </div>
                                <div className="text-center border-x border-white/8">
                                  <p className="text-[#FF007F] text-xs font-mono font-bold">{fmt(accLikes)}</p>
                                  <p className="text-[9px] text-white/40 uppercase">Likes</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-white text-xs font-mono font-bold">{accPosts}</p>
                                  <p className="text-[9px] text-white/40 uppercase">Posts</p>
                                </div>
                              </div>
                              {/* Ligne 3 : erreur de scraping si presente (visible direct par agence) */}
                              {acc.last_scrape_error && (
                                <div className="pt-1 border-t border-red-500/20">
                                  <p className="text-red-400 text-[10px] truncate" title={acc.last_scrape_error}>
                                    ⚠️ {acc.last_scrape_error}
                                  </p>
                                </div>
                              )}
                              {!acc.last_scrape_error && acc.last_scrape_warning && (
                                <div className="pt-1 border-t border-amber-500/20">
                                  <p className="text-amber-400 text-[10px] truncate" title={acc.last_scrape_warning}>
                                    {acc.last_scrape_warning}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Vidéos récentes en petit en bas */}
                      {clipper.recent_videos.length > 0 && (
                        <div>
                          <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Vidéos récentes</p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                            {clipper.recent_videos.map(v => (
                              <a key={v.video_id} href={v.url} target="_blank" rel="noopener noreferrer"
                                className="group block rounded-md overflow-hidden bg-white/5 hover:bg-white/10 transition-colors">
                                <div className="relative aspect-video bg-black">
                                  {v.thumbnail_url ? (
                                    <img src={imgSrc(v.thumbnail_url)} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-base">{PLAT_ICON[v.platform]}</div>
                                  )}
                                  <span className="absolute top-0.5 left-0.5 text-[8px] px-1 py-0.5 rounded font-bold"
                                    style={{ background: `${PLAT_COLOR[v.platform] || "#fff"}ee`, color: "#000" }}>
                                    {v.platform}
                                  </span>
                                </div>
                                <div className="px-1.5 py-1">
                                  <div className="flex items-center justify-between text-[9px] text-white/40">
                                    <span>👁 {fmt(v.views || 0)}</span>
                                    {(v.earnings || 0) > 0 && <span className="text-[#39FF14]">€{v.earnings.toFixed(2)}</span>}
                                  </div>
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Modal "Tracker un compte" — scrape compte + selection videos OU ajout direct */}
          {showTrackAccountModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-2xl space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-2 sticky top-0 bg-[#1a1a1a] -mx-6 px-6 -mt-6 pt-6 pb-3 z-10">
                  <div>
                    <h3 className="text-white font-semibold text-lg">Tracker un compte</h3>
                    <p className="text-white/40 text-xs mt-0.5">Ajoute le compte au tracking auto, ou scrape pour sélectionner manuellement les vidéos.</p>
                  </div>
                  <button onClick={() => { setShowTrackAccountModal(false); setAccountVideos(null); setSelectedVideoIds(new Set()); }} className="text-white/30 hover:text-white text-xl leading-none">✕</button>
                </div>

                {/* Clippeur (optionnel) */}
                <div>
                  <label className="text-xs text-white/50 block mb-1.5">Clippeur (optionnel)</label>
                  <select value={trackAccountForm.user_id}
                    onChange={e => setTrackAccountForm(f => ({ ...f, user_id: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00E5FF]/50">
                    <option value="">💰 Aucun — gains à l'agence</option>
                    {activeMembers.map(m => (
                      <option key={m.user_id} value={m.user_id}>{m.user_info?.display_name || m.user_info?.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-white/40 mt-1.5">
                    {trackAccountForm.user_id
                      ? "Les gains de ce compte seront attribués à ce clippeur"
                      : "Compte rattaché directement à l'agence — les gains restent à l'agence"}
                  </p>
                </div>

                {/* Plateforme */}
                <div>
                  <label className="text-xs text-white/50 block mb-1.5">Plateforme *</label>
                  <div className="flex gap-2">
                    {(() => {
                      const allowed = (campaign?.platforms && campaign.platforms.length > 0) ? campaign.platforms : ["tiktok","instagram","youtube"];
                      const ALL = [["tiktok","🎵"], ["instagram","📸"], ["youtube","▶️"]];
                      return ALL.filter(([p]) => allowed.includes(p)).map(([p, icon]) => (
                        <button key={p} onClick={() => { setTrackAccountForm(f => ({ ...f, platform: p })); setAccountVideos(null); }}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border ${trackAccountForm.platform === p ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/10 text-white/40 hover:text-white/70"}`}>
                          {icon} {p}
                        </button>
                      ));
                    })()}
                  </div>
                </div>

                {/* Username ou URL */}
                <div>
                  <label className="text-xs text-white/50 block mb-1.5">@username ou URL du profil *</label>
                  <input type="text" value={trackAccountForm.username}
                    onChange={e => { setTrackAccountForm(f => ({ ...f, username: e.target.value })); setAccountVideos(null); }}
                    placeholder="@username  ou  https://www.tiktok.com/@..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#00E5FF]/50" />
                </div>

                {/* 2 modes : voir les videos avant OU ajouter direct */}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleScrapeAccountForPreview}
                    disabled={scrapingForPreview || trackingAccount || !trackAccountForm.username.trim()}
                    className="py-2.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white/80 text-sm font-medium border border-white/10 transition-all flex items-center justify-center gap-2">
                    {scrapingForPreview ? (
                      <><div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" /> Scraping…</>
                    ) : (
                      <>🔍 Voir les vidéos</>
                    )}
                  </button>
                  <button onClick={handleTrackAccount}
                    disabled={trackingAccount || scrapingForPreview || !trackAccountForm.username.trim()}
                    className="py-2.5 rounded-lg bg-[#00E5FF] hover:bg-[#00E5FF]/90 disabled:opacity-50 text-black text-sm font-bold transition-all">
                    {trackingAccount ? "Ajout…" : "✓ Ajouter + tracking auto"}
                  </button>
                </div>
                <p className="text-[10px] text-white/30 -mt-2">
                  💡 <strong>Voir les vidéos</strong> : scrape le compte et te laisse sélectionner manuellement chaque vidéo · <strong>Ajouter + tracking auto</strong> : ajoute le compte et lance le scraping périodique automatique
                </p>

                {/* Liste des videos scrapees — selection multiple par checkbox */}
                {accountVideos && (accountVideos.videos || []).length > 0 && (
                  <div className="space-y-2 border-t border-white/10 pt-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs text-white/60 font-medium">{accountVideos.count} vidéos trouvées</p>
                      <div className="flex items-center gap-2 text-[10px]">
                        <button type="button" onClick={handleSelectAllVideos}
                          disabled={bulkTracking}
                          className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/70 disabled:opacity-50">
                          Tout sélectionner
                        </button>
                        <button type="button" onClick={handleDeselectAllVideos}
                          disabled={bulkTracking || selectedVideoIds.size === 0}
                          className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/70 disabled:opacity-50">
                          Tout décocher
                        </button>
                        <span className="text-white/40">
                          {selectedVideoIds.size > 0 ? `${selectedVideoIds.size} sélectionnée${selectedVideoIds.size > 1 ? "s" : ""}` : "Coche pour tracker"}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-1">
                      {accountVideos.videos.map((v) => {
                        const isTracked = v._tracked;
                        const vid = v.platform_video_id;
                        const isSelected = vid && selectedVideoIds.has(vid);
                        return (
                          <button key={vid || v.url} type="button"
                            onClick={() => !isTracked && !bulkTracking && handleToggleVideoSelection(vid)}
                            disabled={isTracked || bulkTracking || !vid}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
                              isTracked ? "bg-[#39FF14]/10 border-[#39FF14]/30 cursor-default" :
                              isSelected ? "bg-[#00E5FF]/10 border-[#00E5FF]/50 ring-1 ring-[#00E5FF]/40" :
                              "bg-white/3 border-white/10 hover:border-[#00E5FF]/40 hover:bg-white/8"
                            } ${bulkTracking ? "opacity-60 cursor-wait" : ""}`}>
                            {/* Checkbox visuelle */}
                            <div className={`w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center ${
                              isTracked ? "bg-[#39FF14] border-[#39FF14]" :
                              isSelected ? "bg-[#00E5FF] border-[#00E5FF]" :
                              "border-white/30 bg-transparent"
                            }`}>
                              {(isTracked || isSelected) && <span className="text-[#0a0a0a] text-xs font-bold">✓</span>}
                            </div>
                            {v.thumbnail_url ? (
                              <img src={v.thumbnail_url} alt="" className="w-12 h-12 rounded flex-shrink-0 object-cover" onError={e => e.target.style.display = "none"} />
                            ) : (
                              <div className="w-12 h-12 rounded flex-shrink-0 bg-white/10 flex items-center justify-center text-base">
                                {trackAccountForm.platform === "tiktok" ? "🎵" : trackAccountForm.platform === "instagram" ? "📸" : "▶️"}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs truncate">{v.title || "Sans titre"}</p>
                              <p className="text-[10px] text-white/40 mt-0.5">
                                👁 {(v.views || 0).toLocaleString("fr-FR")} · ❤️ {(v.likes || 0).toLocaleString("fr-FR")}
                              </p>
                            </div>
                            {isTracked && (
                              <span className="text-[10px] flex-shrink-0 font-medium text-[#39FF14]">
                                ✓ Tracké
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {accountVideos && (accountVideos.videos || []).length === 0 && (
                  <div className="text-center py-6 border-t border-white/10">
                    <p className="text-white/40 text-sm">Aucune vidéo trouvée pour ce compte</p>
                  </div>
                )}

                {/* Footer : bouton Rajouter a la campagne + Fermer */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
                  <button onClick={() => { setShowTrackAccountModal(false); setAccountVideos(null); setSelectedVideoIds(new Set()); }}
                    disabled={bulkTracking}
                    className="px-5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all disabled:opacity-50">
                    Fermer
                  </button>
                  {accountVideos && (accountVideos.videos || []).length > 0 && (
                    <button onClick={handleBulkAddSelectedVideos}
                      disabled={bulkTracking || selectedVideoIds.size === 0}
                      className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                        selectedVideoIds.size === 0 || bulkTracking
                          ? "bg-white/10 text-white/30 cursor-not-allowed"
                          : "bg-[#00E5FF] hover:bg-[#00E5FF]/80 text-[#0a0a0a]"
                      }`}>
                      {bulkTracking
                        ? `⏳ Ajout... ${bulkProgress.done}/${bulkProgress.total}`
                        : `+ Rajouter ${selectedVideoIds.size > 0 ? `(${selectedVideoIds.size}) ` : ""}à la campagne`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ CANDIDATURES TAB ═══════════ */}
      {activeTab === "candidatures" && (
        <div className="space-y-5">
          {/* === DEMANDES D'EXPULSION === */}
          {expulsionRequests.length > 0 && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <h3 className="text-red-400 font-semibold text-base mb-3 flex items-center gap-2">
                ⚠️ Clippeurs à expulser ({expulsionRequests.length})
              </h3>
              <div className="space-y-2">
                {expulsionRequests.map(r => {
                  const u = r.user_info || {};
                  const isDeciding = decidingExpulsion === r.expulsion_id;
                  const decide = async (decision) => {
                    setDecidingExpulsion(r.expulsion_id);
                    try {
                      const res = await fetch(`${API}/campaigns/${campaignId}/expulsion-requests/${r.expulsion_id}/decide`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ decision }),
                      });
                      if (res.ok) {
                        const d = await res.json();
                        toast.success(d.message);
                        setExpulsionRequests(prev => prev.filter(x => x.expulsion_id !== r.expulsion_id));
                        if (decision === "approve") fetchCampaign();
                      } else {
                        const e = await res.json();
                        toast.error(e.detail || "Erreur");
                      }
                    } catch (e) { toast.error(e.message); }
                    finally { setDecidingExpulsion(null); }
                  };
                  return (
                    <div key={r.expulsion_id} className="bg-[#121212] border border-red-500/30 rounded-lg p-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-red-500/20 flex items-center justify-center font-bold text-red-400 text-sm flex-shrink-0">
                        {(u.display_name || u.name || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium">{u.display_name || u.name || "?"}</p>
                        <p className="text-white/50 text-xs">{r.reason}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => decide("reject")}
                          disabled={isDeciding}
                          className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/15 text-white/70 text-xs font-medium border border-white/10 transition disabled:opacity-50">
                          Garder (2e chance)
                        </button>
                        <button onClick={() => decide("approve")}
                          disabled={isDeciding}
                          className="px-3 py-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold border border-red-500/40 transition disabled:opacity-50">
                          {isDeciding ? "..." : "Expulser"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold text-lg">
              Candidatures en attente
              {pendingMembers.length > 0 && (
                <span className="ml-2 bg-[#FF007F] text-white text-xs px-2 py-0.5 rounded-full">{pendingMembers.length}</span>
              )}
            </h3>
            <button onClick={fetchPendingMembers} className="text-white/40 hover:text-white text-xs transition-colors underline">Rafraîchir</button>
          </div>
          {pendingMembers.length === 0 ? (
            <div className="text-center py-16 text-white/30 bg-[#121212] rounded-xl border border-white/10">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-sm">Aucune candidature en attente</p>
            </div>
          ) : (
            <>{pendingMembers.map(member => {
              const isManager = member.role === "manager";
              const roleColor = isManager ? "#39FF14" : "#FF007F";
              return (
                <div key={member.member_id} className="bg-[#121212] border border-white/10 rounded-xl p-4 flex items-start gap-4"
                  style={{ borderLeft: `3px solid ${roleColor}` }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ background: `${roleColor}20`, color: roleColor }}>
                    {(member.user_info?.display_name || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-semibold text-sm">{member.user_info?.display_name || member.user_info?.name || "Utilisateur"}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                        style={{ color: roleColor, borderColor: `${roleColor}40`, background: `${roleColor}15` }}>
                        {isManager ? "Manager" : "Clippeur"}
                      </span>
                    </div>
                    <p className="text-white/40 text-xs mt-0.5">
                      {member.user_info?.email || ""}
                      {" · "}Postulé le {member.joined_at ? new Date(member.joined_at).toLocaleDateString("fr-FR") : "Date inconnue"}
                    </p>
                    {/* Manager motivation */}
                    {isManager && (member.first_name || member.last_name || member.motivation) && (
                      <div className="mt-2 space-y-0.5">
                        {(member.first_name || member.last_name) && (
                          <p className="text-white/60 text-xs">
                            👤 {[member.first_name, member.last_name].filter(Boolean).join(" ")}
                          </p>
                        )}
                        {member.motivation && (
                          <p className="text-white/50 text-xs italic">
                            💬 "{member.motivation}"
                          </p>
                        )}
                      </div>
                    )}
                    {member.global_stats && (
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-white/50">
                          👁 <span className="text-white/80 font-mono font-medium">
                            {member.global_stats.total_views >= 1000000
                              ? `${(member.global_stats.total_views / 1000000).toFixed(1)}M`
                              : member.global_stats.total_views >= 1000
                              ? `${(member.global_stats.total_views / 1000).toFixed(0)}K`
                              : member.global_stats.total_views}
                          </span> vues plateforme
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-white/50">
                          🎬 <span className="text-white/80 font-medium">{member.global_stats.video_count}</span> vidéo{member.global_stats.video_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                    {/* Réponses au formulaire de candidature */}
                    {Array.isArray(member.responses) && member.responses.length > 0 && (
                      <div className="mt-3 space-y-1.5 bg-white/3 border border-white/8 rounded-lg p-3">
                        {member.responses.map((r, idx) => (
                          <div key={idx} className="text-xs">
                            <p className="text-white/50 font-medium">{r.question}</p>
                            <p className="text-white/85 mt-0.5 break-words">{r.answer || <span className="italic text-white/30">(pas de réponse)</span>}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => handleAcceptMember(member.member_id)} disabled={processingMember === member.member_id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50 transition-colors"
                      style={{ background: `${roleColor}15`, color: roleColor, borderColor: `${roleColor}40` }}>✓ Accepter</button>
                    <button onClick={() => handleRejectMember(member.member_id)} disabled={processingMember === member.member_id}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold border border-red-500/30 disabled:opacity-50 transition-colors">✗ Refuser</button>
                  </div>
                </div>
              );
            })}</>
          )}
        </div>
      )}

      {/* ═══════════ LIENS TAB (modèle au clic ou both) ═══════════ */}
      {activeTab === "liens" && (campaign.payment_model === "clicks" || campaign.payment_model === "both") && (
        <div className="space-y-5">
          {/* Header + actions */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                <Link2 className="w-5 h-5 text-[#FF007F]" /> Liens de tracking bio
              </h3>
              {campaign.destination_url && (
                <p className="text-white/35 text-xs mt-0.5">
                  Destination : <span className="text-white/60">{campaign.destination_url}</span>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchClickLinks}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-sm transition-all border border-white/10"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Actualiser
              </button>
              <button
                onClick={handleGenerateLinks}
                disabled={generatingLinks}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF007F] hover:bg-[#FF007F]/90 text-white text-sm font-semibold transition-all disabled:opacity-50"
              >
                {generatingLinks
                  ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Génération...</>
                  : <><Link2 className="w-3.5 h-3.5" /> Générer les liens</>
                }
              </button>
            </div>
          </div>

          {/* Totaux */}
          {clickLinks?.totals && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Clics totaux", value: (clickLinks.totals.clicks || 0).toLocaleString("fr-FR"), color: "text-white" },
                { label: "Clics uniques", value: (clickLinks.totals.unique_clicks || 0).toLocaleString("fr-FR"), color: "text-[#00E5FF]" },
                { label: "Gains générés", value: `€${(clickLinks.totals.earnings || 0).toFixed(2)}`, color: "text-[#f0c040]" },
              ].map(kpi => (
                <div key={kpi.label} className="bg-[#121212] border border-white/10 rounded-xl p-4 text-center">
                  <p className="text-xs text-white/35 mb-1">{kpi.label}</p>
                  <p className={`font-mono font-bold text-2xl ${kpi.color}`}>{kpi.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Table des liens */}
          {!clickLinks ? (
            <div className="text-center py-16 text-white/30 bg-[#121212] rounded-xl border border-white/10">
              <p className="text-4xl mb-3">🔗</p>
              <p className="text-sm mb-1">Aucun lien généré</p>
              <p className="text-xs">Clique sur "Générer les liens" pour créer un lien unique par clippeur actif.</p>
            </div>
          ) : clickLinks.links.length === 0 ? (
            <div className="text-center py-16 text-white/30 bg-[#121212] rounded-xl border border-white/10">
              <p className="text-4xl mb-3">👥</p>
              <p className="text-sm">Aucun clippeur actif dans cette campagne</p>
              <p className="text-xs mt-1">Accepte des candidatures d'abord.</p>
            </div>
          ) : (
            <div className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className="text-left text-white/40 text-xs font-medium px-5 py-3">Clippeur</th>
                    <th className="text-right text-white/40 text-xs font-medium px-4 py-3">Clics</th>
                    <th className="text-right text-white/40 text-xs font-medium px-4 py-3">Uniques</th>
                    <th className="text-right text-white/40 text-xs font-medium px-4 py-3">Gains</th>
                    <th className="text-left text-white/40 text-xs font-medium px-4 py-3">Lien de tracking</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {clickLinks.links.map((lnk) => (
                    <tr key={lnk.link_id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#FF007F]/20 flex items-center justify-center text-xs font-bold text-[#FF007F] flex-shrink-0">
                            {(lnk.clipper_name || "?")[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">{lnk.clipper_name}</p>
                            {lnk.last_clicked_at && (
                              <p className="text-white/30 text-[10px] mt-0.5">
                                Dernier clic : {new Date(lnk.last_clicked_at).toLocaleDateString("fr-FR")}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-white">{(lnk.click_count || 0).toLocaleString("fr-FR")}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono text-[#00E5FF]">{(lnk.unique_click_count || 0).toLocaleString("fr-FR")}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono font-bold text-[#f0c040]">€{(lnk.earnings || 0).toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-white/40 text-xs font-mono truncate" title={lnk.tracking_url}>
                          {lnk.tracking_url}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleCopyLink(lnk.tracking_url, lnk.link_id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/8 hover:bg-white/15 transition-all text-white/50 hover:text-white"
                            title="Copier le lien"
                          >
                            {copiedLinkId === lnk.link_id
                              ? <Check className="w-3.5 h-3.5 text-[#39FF14]" />
                              : <Copy className="w-3.5 h-3.5" />
                            }
                          </button>
                          <button
                            onClick={() => handleRegenerateLink(lnk.clipper_id, lnk.link_id)}
                            disabled={regeneratingLinkId === lnk.link_id}
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/8 hover:bg-orange-500/20 transition-all text-white/50 hover:text-orange-400 disabled:opacity-40"
                            title="Régénérer (invalide l'ancien)"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${regeneratingLinkId === lnk.link_id ? "animate-spin" : ""}`} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {clickLinks.rate_per_click > 0 && (
                <div className="px-5 py-3 border-t border-white/5 text-xs text-white/30">
                  Tarif : <span className="text-white/50 font-mono">€{clickLinks.rate_per_click} / 1K clics ({campaign.click_billing_mode === "unique_lifetime" ? "unique à vie" : campaign.click_billing_mode === "all" ? "tous les clics" : "unique/24h"})</span>
                  <span className="ml-2 text-white/20">— soit €{(clickLinks.rate_per_click / 1000).toFixed(4)}/clic</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ CLIP WINNER TAB ═══════════ */}
      {activeTab === "clip-winner" && (
        <div className="space-y-4">
          {/* Header + sélecteur de période */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                🏆 <span>Top 10 — Clips les plus vus</span>
              </h3>
              <p className="text-white/35 text-xs mt-0.5">{ {"24h":"Dernières 24h","7d":"7 derniers jours","30d":"30 derniers jours","all":"Depuis toujours"}[topClipsPeriod] } · auto-refresh 5 min</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5 gap-0.5">
                {[["24h","24h"],["7d","7j"],["30d","30j"],["all","Tout"]].map(([val, label]) => (
                  <button key={val} onClick={() => { setTopClipsPeriod(val); fetchTopClips(val); }}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${topClipsPeriod === val ? "bg-[#FF007F] text-white" : "text-white/50 hover:text-white"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={() => fetchTopClips(topClipsPeriod)} disabled={topClipsLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-sm transition-all border border-white/10 disabled:opacity-40">
                <RefreshCw className={`w-4 h-4 ${topClipsLoading ? "animate-spin" : ""}`} /> Actualiser
              </button>
            </div>
          </div>

          {topClipsLoading && topClips.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#f0c040]/30 border-t-[#f0c040] rounded-full animate-spin" />
            </div>
          ) : topClips.length === 0 ? (
            <div className="text-center py-16 text-white/30 bg-[#121212] rounded-xl border border-white/10">
              <p className="text-4xl mb-3">🏆</p>
              <p className="text-sm">Aucun clip tracké pour l'instant</p>
              <p className="text-xs mt-1">Les clips apparaîtront ici dès que le tracking sera actif.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {topClips.map((clip, i) => {
                const platColor = { tiktok: "#00E5FF", instagram: "#FF007F", youtube: "#FF4444" }[clip.platform] || "#fff";
                const medalColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
                const borderCol = i < 3 ? `${medalColors[i]}50` : "rgba(255,255,255,0.08)";
                const eng = clip.views > 0
                  ? (((clip.likes || 0) + (clip.comments || 0)) / clip.views * 100).toFixed(1) + "%"
                  : "—";
                return (
                  <div key={clip.video_id || i}
                    className="flex items-center gap-4 bg-[#121212] rounded-xl p-3 overflow-hidden"
                    style={{ border: `1px solid ${borderCol}` }}>

                    {/* Rang grand */}
                    <div className="w-9 flex-shrink-0 text-center">
                      {i < 3
                        ? <span className="text-2xl font-bold leading-none" style={{ color: medalColors[i] }}>{i + 1}</span>
                        : <span className="text-lg font-bold text-white/25">#{i + 1}</span>}
                    </div>

                    {/* Thumbnail grand + cliquable */}
                    <a href={clip.url} target="_blank" rel="noopener noreferrer"
                      className="relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden bg-white/5 group/thumb cursor-pointer">
                      {clip.thumbnail_url
                        ? <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-200"
                            onError={e => { e.target.style.display = "none"; }} />
                        : <div className="w-full h-full flex items-center justify-center text-2xl">
                            {{ tiktok: "🎵", instagram: "📸", youtube: "▶️" }[clip.platform]}
                          </div>}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                        <svg className="w-6 h-6 text-white drop-shadow" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                      <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold px-1 py-0.5 rounded"
                        style={{ background: `${platColor}dd`, color: "#000" }}>{clip.platform}</span>
                    </a>

                    {/* Titre + clipper */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {clip.title ? clip.title.slice(0, 40) + (clip.title.length > 40 ? "…" : "") : "—"}
                      </p>
                      <p className="text-white/30 text-xs truncate mt-0.5">{clip.clipper_name || "—"}</p>
                    </div>

                    {/* Stats : vues · likes · audience */}
                    <div className="flex-shrink-0 flex gap-5 items-center">
                      <div className="text-center">
                        <p className="font-mono font-bold text-white text-sm">{fmt(clip.views || 0)}</p>
                        <p className="text-[10px] text-white/30">vues</p>
                      </div>
                      <div className="text-center">
                        <p className="font-mono font-bold text-[#FF007F] text-sm">{fmt(clip.likes || 0)}</p>
                        <p className="text-[10px] text-white/30">likes</p>
                      </div>
                      <div className="text-center">
                        <p className="font-mono font-bold text-[#f0c040] text-sm">{eng}</p>
                        <p className="text-[10px] text-white/30">audience</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ SCRAPING TAB ═══════════ */}
      {activeTab === "scraping" && (
        <div className="space-y-4 max-w-4xl">
          <div className="bg-[#0d0d0d] border border-white/8 rounded-xl p-3 text-xs text-white/50">
            ℹ️ Le scraping est <strong>automatique</strong> : il tourne 4 fois par jour aux horaires fixes affichés ci-dessous.
            Les agences ne peuvent pas le déclencher manuellement — l'admin gère ça.
          </div>
          <ScrapeStatusPanel
            campaignId={campaignId}
            canForceScrape={user?.role === "admin" || sessionStorage.getItem("preview_mode") === "1"}
            onScrapeComplete={() => { fetchAllVideos(); fetchStats(); fetchAllAccounts(); }}
          />
        </div>
      )}

      {/* ═══════════ SETTINGS TAB ═══════════ */}
      {activeTab === "settings" && settingsForm && (
        <div className="space-y-6 max-w-2xl">
          {/* Editable anytime */}
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 space-y-5">
            <h3 className="text-white font-semibold text-base">Paramètres généraux</h3>

            <div className="space-y-1">
              <label className="text-xs text-white/50 font-medium">Nom de la campagne</label>
              <input
                value={settingsForm.name}
                onChange={e => setSettingsForm(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-white/50 font-medium">Description</label>
              <textarea
                value={settingsForm.description}
                onChange={e => setSettingsForm(p => ({ ...p, description: e.target.value }))}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25 resize-none"
              />
            </div>

            {(campaign.payment_model === "clicks" || campaign.payment_model === "both") && (
              <>
                <div className="space-y-1">
                  <label className="text-xs text-white/50 font-medium">URL de destination (modifiable à tout moment)</label>
                  <input
                    value={settingsForm.destination_url}
                    onChange={e => setSettingsForm(p => ({ ...p, destination_url: e.target.value }))}
                    placeholder="https://tiktok.com/@xxx ou https://instagram.com/xxx ou https://votresite.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25"
                  />
                  <p className="text-[11px] text-white/40">
                    💡 Le changement s'applique à TOUS les liens de tracking déjà générés (chaque lien short_code redirige vers cette URL).
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-white/50 font-medium">Tarif / 1 000 clics (€)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={settingsForm.rate_per_click}
                      onChange={e => setSettingsForm(p => ({ ...p, rate_per_click: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-white/25"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-white/50 font-medium">Fenêtre de clic (heures)</label>
                    <input
                      type="number" min="1" max="720"
                      value={settingsForm.click_window_hours}
                      onChange={e => setSettingsForm(p => ({ ...p, click_window_hours: parseInt(e.target.value) || 24 }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-white/25"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1">
              <label className="text-xs text-white/50 font-medium">Nombre max de clippers</label>
              <input
                type="number" min="1"
                value={settingsForm.max_clippers}
                onChange={e => setSettingsForm(p => ({ ...p, max_clippers: parseInt(e.target.value) || "" }))}
                placeholder="Illimité"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25"
              />
            </div>

            {/* Date debut tracking retiree du UI :
                la campagne tracke automatiquement les videos a partir de sa creation. */}

            {/* Strikes : nb max + jours d'inactivite + cadence */}
            <div className="bg-white/3 border border-white/10 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-white">Système de strikes & cadence</h4>
              <p className="text-xs text-white/40">Si le clippeur ne poste pas X vidéos par jour, il reçoit un strike. Au max de strikes, une demande d'expulsion arrive dans Candidatures.</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-white/50 font-medium">Posts/jour min</label>
                  <input
                    type="number" min="0" max="20"
                    value={settingsForm.cadence ?? 1}
                    onChange={e => setSettingsForm(p => ({ ...p, cadence: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-white/25"
                  />
                  <p className="text-[10px] text-white/30">0 = pas de minimum</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-white/50 font-medium">Jours sans post avant strike</label>
                  <input
                    type="number" min="1" max="30"
                    value={settingsForm.strike_days ?? 3}
                    onChange={e => setSettingsForm(p => ({ ...p, strike_days: parseInt(e.target.value) || 3 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-white/25"
                  />
                  <p className="text-[10px] text-white/30">Défaut : 3 jours</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-white/50 font-medium">Strikes max avant expulsion</label>
                  <input
                    type="number" min="1" max="10"
                    value={settingsForm.max_strikes ?? 3}
                    onChange={e => setSettingsForm(p => ({ ...p, max_strikes: parseInt(e.target.value) || 3 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-white/25"
                  />
                  <p className="text-[10px] text-white/30">Défaut : 3</p>
                </div>
              </div>
            </div>

            {/* Plateformes acceptées (modifiable) */}
            <div className="space-y-2">
              <label className="text-xs text-white/50 font-medium">Plateformes acceptées</label>
              <div className="flex gap-2">
                {[["tiktok","🎵 TikTok"], ["instagram","📸 Instagram"], ["youtube","▶️ YouTube"]].map(([p, label]) => {
                  const isSelected = (settingsForm.platforms || []).includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSettingsForm(prev => {
                        const platforms = prev.platforms || [];
                        return { ...prev, platforms: isSelected ? platforms.filter(x => x !== p) : [...platforms, p] };
                      })}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                        isSelected
                          ? "bg-[#FF007F]/15 border-[#FF007F]/40 text-[#FF007F]"
                          : "bg-white/5 border-white/10 text-white/40 hover:text-white/70"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-white/35">Active/désactive les plateformes que tes clippeurs peuvent utiliser pour cette campagne.</p>
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="w-full py-2.5 rounded-xl bg-[#FF007F] hover:bg-[#FF007F]/80 text-white font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {savingSettings ? "Sauvegarde…" : "Sauvegarder les paramètres"}
            </button>
          </div>

          {/* RPM — only editable when budget exhausted */}
          {campaign.payment_model === "views" && (
            <div className={`border rounded-2xl p-6 space-y-4 ${
              (campaign.budget_unlimited || (campaign.budget_used || 0) >= (campaign.budget_total || 0))
                ? "bg-[#1a1a1a] border-white/10"
                : "bg-white/3 border-white/5 opacity-60"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-white font-semibold text-base">RPM (€ / 1 000 vues)</h3>
                  <p className="text-xs text-white/40 mt-0.5">
                    {(campaign.budget_unlimited || (campaign.budget_used || 0) >= (campaign.budget_total || 0))
                      ? "Modifiable car la cagnotte est épuisée."
                      : "Disponible uniquement une fois la cagnotte épuisée."}
                  </p>
                </div>
                {!(campaign.budget_unlimited || (campaign.budget_used || 0) >= (campaign.budget_total || 0)) && (
                  <span className="text-xs px-2 py-1 rounded-lg bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 whitespace-nowrap">
                    🔒 Verrouillé
                  </span>
                )}
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-white/50 font-medium">Nouveau RPM (€)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={settingsForm.rpm}
                    onChange={e => setSettingsForm(p => ({ ...p, rpm: parseFloat(e.target.value) || 0 }))}
                    disabled={!(campaign.budget_unlimited || (campaign.budget_used || 0) >= (campaign.budget_total || 0))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-white/25 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
                <button
                  onClick={() => handleSaveSettings()}
                  disabled={savingSettings || !(campaign.budget_unlimited || (campaign.budget_used || 0) >= (campaign.budget_total || 0))}
                  className="py-2.5 px-5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Appliquer
                </button>
              </div>
            </div>
          )}

          {/* Budget section */}
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 space-y-4">
            <h3 className="text-white font-semibold text-base">Budget</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Utilisé</span>
              <span className="text-white font-mono">€{(campaign.budget_used || 0).toFixed(2)} / {campaign.budget_unlimited ? "∞" : `€${(campaign.budget_total || 0).toFixed(2)}`}</span>
            </div>
            {!campaign.budget_unlimited && (
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.round(((campaign.budget_used || 0) / Math.max(1, campaign.budget_total || 1)) * 100))}%`,
                    background: (campaign.budget_used || 0) >= (campaign.budget_total || 0) ? "#ef4444" : "#FF007F",
                  }}
                />
              </div>
            )}
            {(campaign.budget_used || 0) >= (campaign.budget_total || 0) && !campaign.budget_unlimited && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <span className="text-red-400 text-sm">⚠️ Budget épuisé — la campagne est en pause</span>
              </div>
            )}
            <div className="flex gap-3">
              <input
                type="number" min="1" step="1"
                value={addBudgetAmount}
                onChange={e => setAddBudgetAmount(e.target.value)}
                placeholder="Montant à ajouter (€)"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25"
              />
              <button
                onClick={handleAddBudget}
                disabled={addingBudget || !addBudgetAmount}
                className="px-5 py-2.5 rounded-xl bg-[#39FF14]/15 border border-[#39FF14]/25 text-[#39FF14] text-sm font-semibold hover:bg-[#39FF14]/25 transition-colors disabled:opacity-40"
              >
                {addingBudget ? "…" : "+ Recharger"}
              </button>
            </div>
          </div>

          {/* Danger zone */}
          <div className="bg-red-950/20 border border-red-500/20 rounded-2xl p-6 space-y-4">
            <h3 className="text-red-400 font-semibold text-base">⚠️ Zone dangereuse</h3>
            <p className="text-white/50 text-sm">
              La suppression est définitive et irréversible. Conditions requises :
            </p>
            <ul className="text-xs text-white/40 space-y-1 list-disc list-inside">
              <li className={`${(campaign.budget_unlimited || (campaign.budget_used || 0) >= (campaign.budget_total || 0)) ? "text-green-400" : "text-white/40"}`}>
                {(campaign.budget_unlimited || (campaign.budget_used || 0) >= (campaign.budget_total || 0)) ? "✓" : "○"} Budget épuisé ou illimité
              </li>
              <li>Tous les paiements clippers confirmés</li>
            </ul>
            <div className="space-y-2">
              <label className="text-xs text-white/50">Saisissez <strong className="text-white">SUPPRIMER</strong> pour confirmer</label>
              <input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="SUPPRIMER"
                className="w-full bg-white/5 border border-red-500/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/40"
              />
              <button
                onClick={handleDeleteCampaign}
                disabled={deletingCampaign || deleteConfirmText !== "SUPPRIMER"}
                className="w-full py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 font-semibold text-sm hover:bg-red-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deletingCampaign ? "Suppression…" : "Supprimer la campagne"}
              </button>
            </div>
          </div>
        </div>
      )}

    </motion.div>
  );
}

// Links Page
function LinksPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      const res = await fetch(`${API}/campaigns/all-links/agency`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = (type, token, campaignId) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/join/${type}/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(`${campaignId}-${type}`);
    toast.success("Lien copié !");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="links-page"
    >
      <div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-2">Liens d'accès</h1>
        <p className="text-white/50">Partagez ces liens pour inviter des participants</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i} className="bg-[#121212] border-white/10">
              <CardContent className="p-6">
                <div className="skeleton h-6 w-1/3 rounded mb-4" />
                <div className="skeleton h-4 w-full rounded mb-2" />
                <div className="skeleton h-4 w-full rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-8 text-center">
            <p className="text-white/50">Aucune campagne créée</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {campaigns.map((campaign) => (
            <Card key={campaign.campaign_id} data-campaign-id={campaign.campaign_id} data-campaign-name={campaign.name} className="bg-[#121212] border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Video className="w-5 h-5 text-[#FF007F]" />
                  {campaign.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { type: "clipper", token: campaign.token_clipper, icon: Video, label: "Lien Clippeur", color: "#00E5FF" },
                  { type: "manager", token: campaign.token_manager, icon: Users, label: "Lien Manager", color: "#39FF14" },
                  { type: "client", token: campaign.token_client, icon: Eye, label: "Lien Client", color: "#FFB300" },
                ].map(({ type, token, icon: Icon, label, color }) => (
                  <div
                    key={type}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4" style={{ color }} />
                      <span className="text-white/70">{label}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyLink(type, token, campaign.campaign_id)}
                      className="text-white/50 hover:text-white"
                      data-testid={`copy-${type}-link-${campaign.campaign_id}`}
                    >
                      {copiedId === `${campaign.campaign_id}-${type}` ? (
                        <Check className="w-4 h-4 text-[#39FF14]" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      <span className="ml-2">Copier</span>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// Payment Page
function PaymentPage() {
  const [owedData, setOwedData] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchOwed(); }, []);

  const fetchOwed = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/payments/owed`, { credentials: "include" });
      if (res.ok) setOwedData(await res.json());
    } catch {}
    finally { setLoading(false); }
  };

  const handleConfirm = async (row) => {
    setConfirming(`${row.user_id}_${row.campaign_id}`);
    try {
      const res = await fetch(`${API}/payments/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_id: row.user_id, campaign_id: row.campaign_id, amount: row.owed }),
      });
      if (res.ok) {
        toast.success(`Paiement de €${row.owed.toFixed(2)} confirmé ✓`);
        fetchOwed();
      } else toast.error("Erreur");
    } catch { toast.error("Erreur de connexion"); }
    finally { setConfirming(null); }
  };

  const fmt = fmtViews;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8" data-testid="agency-payment-page">
      <div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-2">Portefeuille</h1>
        <p className="text-white/50">Ce que vous devez à vos clippeurs — virements directs hors plateforme</p>
      </div>

      {/* Total owed banner */}
      {!loading && owedData && (
        <Card className="bg-[#121212] border-[#f0c040]/30">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-white/50 mb-1">Total dû à tous les clippeurs</p>
              <p className="font-mono font-black text-4xl text-[#f0c040]">€{owedData.total_owed?.toFixed(2)}</p>
            </div>
            <DollarSign className="w-12 h-12 text-[#f0c040]/20" />
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Détail par clippeur / campagne</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-14 bg-white/5 rounded animate-pulse"/>)}</div>
          ) : !owedData?.rows?.length ? (
            <p className="text-white/40 text-center py-12">Aucun clippeur avec des gains</p>
          ) : (
            <div className="space-y-2">
              {owedData.rows.map((row) => {
                const key = `${row.user_id}_${row.campaign_id}`;
                return (
                  <div key={key} className="flex items-center gap-4 p-4 bg-white/5 rounded-xl hover:bg-white/8 transition-colors">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-[#00E5FF]/20 flex items-center justify-center flex-shrink-0">
                      {row.picture ? <img src={row.picture} alt="" className="w-full h-full object-cover"/> : <User className="w-5 h-5 text-[#00E5FF]"/>}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{row.display_name || row.name}</p>
                      <p className="text-xs text-white/40 truncate">{row.campaign_name}</p>
                      {row.payment_info && (
                        <p className="text-xs text-[#f0c040] flex items-center gap-1 mt-0.5">
                          <CreditCard className="w-3 h-3"/>{row.payment_info}
                        </p>
                      )}
                    </div>
                    {/* Stats */}
                    <div className="text-right flex-shrink-0 space-y-0.5">
                      <p className="text-xs text-white/40">{fmt(row.views)} vues · €{row.earned.toFixed(2)} générés</p>
                      <p className={`font-mono font-bold text-base ${row.owed > 0 ? "text-[#f0c040]" : "text-[#39FF14]"}`}>
                        {row.owed > 0 ? `À payer : €${row.owed.toFixed(2)}` : "✓ À jour"}
                      </p>
                      {!row.payment_info && row.owed > 0 && (
                        <p className="text-xs text-white/30 italic">En attente de coordonnées</p>
                      )}
                    </div>
                    {/* Action */}
                    {row.owed > 0 && (
                      <button
                        onClick={() => handleConfirm(row)}
                        disabled={confirming === key}
                        className="ml-2 px-3 py-2 rounded-lg bg-[#f0c040]/20 hover:bg-[#f0c040]/30 border border-[#f0c040]/40 text-[#f0c040] text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                      >
                        {confirming === key ? "..." : "Marquer payé"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historique confirmations */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader><CardTitle className="text-white text-base">Historique des virements confirmés</CardTitle></CardHeader>
        <CardContent>
          {!owedData ? null : owedData.rows.filter(r => r.last_payment).length === 0 ? (
            <p className="text-white/40 text-sm text-center py-6">Aucun virement confirmé</p>
          ) : (
            <div className="space-y-2">
              {owedData.rows.filter(r => r.last_payment).map((row) => (
                <div key={`hist_${row.user_id}_${row.campaign_id}`} className="flex items-center gap-3 justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full overflow-hidden bg-[#00E5FF]/20 flex items-center justify-center flex-shrink-0">
                      {row.picture
                        ? <img src={row.picture} alt="" className="w-full h-full object-cover" />
                        : <span className="text-[#00E5FF] text-xs font-bold">{(row.display_name || row.name || "?")[0].toUpperCase()}</span>
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{row.display_name || row.name} <span className="text-white/40 font-normal">— {row.campaign_name}</span></p>
                      <p className="text-white/40 text-xs">{new Date(row.last_payment.confirmed_at).toLocaleDateString("fr-FR")}</p>
                    </div>
                  </div>
                  <p className="font-mono font-bold text-[#39FF14] flex-shrink-0">€{row.last_payment.amount_eur?.toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Settings Page
function SettingsPage() {
  const { user, logout } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [strikeThreshold, setStrikeThreshold] = useState("3");
  const [picturePreview, setPicturePreview] = useState(user?.picture || null);
  const [pictureBase64, setPictureBase64] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [subStatus, setSubStatus] = useState(null);
  const [subLoading, setSubLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  // Toggle "Vues & Clics" (full) vs "Clics uniquement"
  const [pricingMode, setPricingMode] = useState("full");

  useEffect(() => {
    fetch(`${API}/subscription/status`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSubStatus(d))
      .catch(() => {});
  }, []);

  // Handle return from GoCardless
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subStatusParam = params.get("sub");
    const flowId = params.get("flow") || params.get("redirect_flow_id");
    const planParam = params.get("plan");

    if (subStatusParam === "success") {
      toast.success("Abonnement activé avec succès !");
      window.history.replaceState({}, "", window.location.pathname);
      fetch(`${API}/subscription/status`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setSubStatus(d));
    } else if (subStatusParam === "pending" && flowId) {
      // L'utilisateur revient de GoCardless après signature du mandat
      // On complete le flow pour activer la subscription
      toast.info("Activation de l'abonnement en cours...");
      fetch(`${API}/payments/gocardless/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ flow_id: flowId }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.ok) {
            toast.success(`Abonnement ${planParam ? planParam.replace("plan_", "") : ""} activé !`);
            window.history.replaceState({}, "", window.location.pathname);
            fetch(`${API}/subscription/status`, { credentials: "include" })
              .then(r => r.ok ? r.json() : null)
              .then(d => d && setSubStatus(d));
          } else {
            toast.error(d.detail || "Erreur lors de l'activation");
          }
        })
        .catch(() => toast.error("Erreur réseau"));
    } else if (subStatusParam === "cancelled") {
      toast.info("Paiement annulé");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleSubscribe = async (planId) => {
    setCheckoutLoading(planId);
    try {
      const r = await fetch(`${API}/subscription/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan_id: planId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur");
      window.location.href = data.url;
    } catch (e) {
      toast.error(e.message);
      setCheckoutLoading(null);
    }
  };

  // ===== Plans VUES (tracking vues seulement, AUCUN tracking de clics) =====
  const PLANS_FULL = [
    {
      id: "plan_small", name: "Starter", price: "349€/mois",
      features: [
        "1 campagne active",
        "30 comptes trackés (TikTok/Insta/YouTube)",
        "Tracking vues 1× / jour (08h Paris)",
        "Striking automatique",
        "Stats vues complètes + RPM auto",
        "Support standard",
        "Pas de tracking clics inclus"
      ]
    },
    {
      id: "plan_medium", name: "Pro", price: "549€/mois", featured: true,
      features: [
        "3 campagnes actives",
        "100 comptes trackés (TikTok/Insta/YouTube)",
        "Tracking vues 2× / jour (07:30 + 15:30)",
        "Striking automatique",
        "Stats vues complètes + RPM auto",
        "Analytics avancés",
        "Support prioritaire",
        "Pas de tracking clics inclus"
      ]
    },
    {
      id: "plan_unlimited", name: "Business", price: "749€/mois",
      features: [
        "Campagnes illimitées",
        "400 comptes trackés (TikTok/Insta/YouTube)",
        "Tracking vues 4× / jour (07:30, 12:00, 15:30, 22:00)",
        "Striking automatique",
        "Stats vues complètes + RPM auto",
        "Analytics avancés",
        "Support premium 24/7",
        "Accès API",
        "Pas de tracking clics inclus"
      ]
    },
    {
      id: "plan_custom", name: "Enterprise", price: "Sur devis", custom: true,
      features: [
        "Campagnes illimitées",
        "Comptes trackés illimités",
        "Serveur dédié sur mesure",
        "Tracking personnalisé (intervalle libre)",
        "Striking automatique",
        "Intégrations sur mesure",
        "Account manager dédié",
        "SLA garanti",
        "Vues + Clics combinés possibles"
      ]
    },
  ];

  // ===== Plans CLICS (tracking clics seulement, AUCUN tracking de vues) =====
  const PLANS_CLICK = [
    {
      id: "plan_small_click", name: "Starter Clic", price: "89€/mois",
      features: [
        "1 campagne active (au clic)",
        "30 comptes (liens trackés)",
        "Tracking clics en temps réel",
        "Liens bio personnalisés",
        "Support standard",
        "Pas de tracking vues ni striking auto"
      ]
    },
    {
      id: "plan_medium_click", name: "Pro Clic", price: "149€/mois", featured: true,
      features: [
        "3 campagnes actives (au clic)",
        "100 comptes (liens trackés)",
        "Tracking clics en temps réel",
        "Liens bio personnalisés",
        "Analytics clics avancés",
        "Support prioritaire",
        "Pas de tracking vues ni striking auto"
      ]
    },
    {
      id: "plan_unlimited_click", name: "Business Clic", price: "225€/mois",
      features: [
        "Campagnes illimitées (au clic)",
        "400 comptes (liens trackés)",
        "Tracking clics en temps réel",
        "Liens bio personnalisés",
        "Analytics clics avancés",
        "Support premium 24/7",
        "Pas de tracking vues ni striking auto"
      ]
    },
  ];

  const PLANS = pricingMode === "click" ? PLANS_CLICK : PLANS_FULL;

  const handlePicture = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setPicturePreview(ev.target.result); setPictureBase64(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const profileBody = { display_name: displayName };
      if (pictureBase64) profileBody.picture = pictureBase64;
      await Promise.all([
        fetch(`${API}/profile`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(profileBody),
        }),
        fetch(`${API}/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ strike_threshold: parseInt(strikeThreshold) }),
        }),
      ]);
      toast.success("Paramètres sauvegardés");
    } catch (error) {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="agency-settings-page"
    >
      <div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-2">Paramètres</h1>
        <p className="text-white/50">Configurez votre agence</p>
      </div>

      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Profil de l'agence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Photo de profil */}
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 border border-white/10">
              {picturePreview
                ? <img src={picturePreview} alt="" className="w-full h-full object-cover" />
                : <span className="text-white/40 font-bold text-2xl">{displayName?.[0] || "A"}</span>}
            </div>
            <div>
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10 transition-colors">
                <Plus className="w-4 h-4" />
                {picturePreview ? "Changer la photo" : "Ajouter une photo"}
                <input type="file" accept="image/*" className="hidden" onChange={handlePicture} />
              </label>
              <p className="text-xs text-white/30 mt-1">JPG, PNG — max 5 Mo</p>
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-2">Nom de l'agence</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-2">Email (Google)</label>
            <Input value={user?.email || ""} disabled className="bg-white/5 border-white/10 text-white/50" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Règles de strikes</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <label className="block text-sm text-white/70 mb-2">
              Nombre de strikes avant suspension
            </label>
            <Input
              type="number"
              value={strikeThreshold}
              onChange={(e) => setStrikeThreshold(e.target.value)}
              className="bg-white/5 border-white/10 text-white w-24"
            />
          </div>
        </CardContent>
      </Card>

      {/* Subscription card */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#FF007F]" />
            Abonnement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Current status */}
          {subStatus && (
            <div className={`rounded-xl p-4 border ${
              subStatus.subscription_status === "active"
                ? "bg-[#39FF14]/10 border-[#39FF14]/30"
                : subStatus.trial_expired || subStatus.subscription_status === "expired"
                ? "bg-red-500/10 border-red-500/30"
                : subStatus.subscription_status === "trial"
                ? "bg-[#00E5FF]/10 border-[#00E5FF]/30"
                : "bg-white/5 border-white/10"
            }`}>
              {subStatus.subscription_status === "active" && (
                <div>
                  <p className="text-[#39FF14] font-semibold text-sm">✓ Abonnement actif</p>
                  <p className="text-white/60 text-xs mt-0.5">
                    Plan {[...PLANS_FULL, ...PLANS_CLICK].find(p => p.id === subStatus.subscription_plan)?.name || subStatus.subscription_plan}
                  </p>
                </div>
              )}
              {subStatus.subscription_status === "trial" && !subStatus.trial_expired && (
                <div>
                  <p className="text-[#00E5FF] font-semibold text-sm">🎁 Essai gratuit — plan Business activé</p>
                  <p className="text-white/60 text-xs mt-0.5">
                    {subStatus.trial_days_remaining > 0
                      ? `${subStatus.trial_days_remaining} jour${subStatus.trial_days_remaining > 1 ? "s" : ""} restant${subStatus.trial_days_remaining > 1 ? "s" : ""} — toutes les fonctionnalités du plan Business 749€/mois`
                      : "Dernier jour — choisis un plan ci-dessous pour continuer"}
                  </p>
                  {subStatus.usage && subStatus.limits && (
                    <p className="text-white/40 text-[10px] mt-1.5">
                      Usage actuel : {subStatus.usage.campaigns} campagne{subStatus.usage.campaigns > 1 ? "s" : ""} · {subStatus.usage.clippers} clippeur{subStatus.usage.clippers > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              )}
              {(subStatus.trial_expired || subStatus.subscription_status === "expired" || subStatus.subscription_status === "past_due") && (
                <div>
                  <p className="text-red-400 font-semibold text-sm">⚠️ Essai expiré</p>
                  <p className="text-white/60 text-xs mt-0.5">Abonnez-vous pour continuer à créer des campagnes</p>
                </div>
              )}
              {(!subStatus.subscription_status || subStatus.subscription_status === "none") && (
                <div>
                  <p className="text-white/60 text-sm">Aucun abonnement actif</p>
                </div>
              )}
            </div>
          )}

          {/* Toggle Vues & Clics / Clics seulement */}
          <div className="flex justify-center">
            <div className="inline-flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
              <button onClick={() => setPricingMode("full")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${pricingMode === "full" ? "bg-[#FF007F] text-white" : "text-white/50 hover:text-white"}`}>
                Vues & Clics
              </button>
              <button onClick={() => setPricingMode("click")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${pricingMode === "click" ? "bg-[#f0c040] text-black" : "text-white/50 hover:text-white"}`}>
                Au clic uniquement
              </button>
            </div>
          </div>
          <p className="text-center text-xs text-white/40">
            {pricingMode === "full"
              ? "Tracking complet : vues + clics + analytics complets"
              : "Tracking au clic uniquement (sans suivi des vues) — moins cher si vous gérez seulement des liens en bio"}
          </p>

          {/* Plan cards */}
          <div className={`grid grid-cols-1 md:grid-cols-2 ${pricingMode === "full" ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-4`}>
            {PLANS.map(plan => {
              const isActive = subStatus?.subscription_plan === plan.id && subStatus?.subscription_status === "active";
              return (
                <div key={plan.id} className={`rounded-2xl p-5 border space-y-4 flex flex-col ${
                  plan.featured
                    ? "border-[#FF007F]/60 bg-[#FF007F]/5"
                    : plan.custom
                    ? "border-[#00E5FF]/40 bg-[#00E5FF]/5"
                    : "border-white/10 bg-white/3"
                } ${isActive ? "ring-2 ring-[#39FF14]/50" : ""}`}>
                  {plan.featured && (
                    <span className="self-start text-[10px] font-semibold bg-[#FF007F] text-white px-2 py-0.5 rounded-full">Recommandé</span>
                  )}
                  {plan.custom && (
                    <span className="self-start text-[10px] font-semibold bg-[#00E5FF] text-black px-2 py-0.5 rounded-full">Sur mesure</span>
                  )}
                  <div>
                    <p className="text-white font-semibold text-sm">{plan.name}</p>
                    <p className="text-white font-bold text-2xl mt-0.5">{plan.price}</p>
                  </div>
                  <ul className="space-y-1.5 flex-1">
                    {plan.features.map(f => (
                      <li key={f} className="text-white/60 text-xs flex items-start gap-1.5 leading-snug">
                        <span className="text-[#39FF14] flex-shrink-0">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.custom ? (
                    <Button
                      onClick={() => window.location.href = "mailto:contact@theclipdealtrack.com?subject=Plan%20Enterprise"}
                      className="w-full text-xs py-2.5 bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-black font-semibold"
                    >
                      Nous contacter
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleSubscribe(plan.id)}
                      disabled={isActive || checkoutLoading === plan.id}
                      className={`w-full text-xs py-2.5 ${
                        isActive
                          ? "bg-[#39FF14]/20 text-[#39FF14] cursor-default"
                          : plan.featured
                          ? "bg-[#FF007F] hover:bg-[#FF007F]/80 text-white"
                          : "bg-white/10 hover:bg-white/20 text-white border border-white/10"
                      }`}
                    >
                      {isActive ? "Plan actuel" : checkoutLoading === plan.id ? "Redirection..." : "Choisir ce plan"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-white/30">Prélèvement SEPA sécurisé via GoCardless · HT · Résiliation possible à tout moment · Essai gratuit de 14 jours en plan Business</p>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[#FF007F] hover:bg-[#FF007F]/80 text-white"
        >
          {isSaving ? "Enregistrement..." : "Enregistrer"}
        </Button>
        <Button
          variant="outline"
          onClick={logout}
          className="border-red-500/30 text-red-400 hover:bg-red-500/10"
        >
          Se déconnecter
        </Button>
      </div>
    </motion.div>
  );
}

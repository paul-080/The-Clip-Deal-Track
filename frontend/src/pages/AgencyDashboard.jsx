import { useState, useEffect, useRef, useMemo } from "react";
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

// Nombre de vues exact avec suffixe lisible
const fmtViews = (n) => {
  if (!n || n === 0) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("fr-FR");
};
import Sidebar from "../components/Sidebar";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Home, Search, Plus, Link2, CreditCard, Settings, MessageCircle,
  Video, Users, User, Eye, DollarSign, Copy, Check, Image, AlertTriangle,
  TrendingUp, BarChart3, ExternalLink, Heart, MessageSquare, ArrowUpDown,
  ChevronUp, ChevronDown, RefreshCw, Play, HelpCircle, MousePointerClick, Calendar
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
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
      <main className={`flex-1 ml-64 ${location.pathname.includes("/chat") ? "h-screen overflow-hidden" : "p-8"}`}>
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

// Agency Home with Announcements
function AgencyHome({ announcements, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title, content }),
      });

      if (res.ok) {
        toast.success("Annonce publiée");
        setTitle("");
        setContent("");
        setShowForm(false);
        onUpdate();
      }
    } catch (error) {
      toast.error("Erreur lors de la publication");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="agency-home"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-3xl text-white mb-2">Accueil — Annonces</h1>
          <p className="text-white/50">Publiez des annonces pour vos clippeurs</p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#FF007F] hover:bg-[#FF007F]/80 text-white"
          data-testid="new-announcement-btn"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle annonce
        </Button>
      </div>

      {showForm && (
        <Card className="bg-[#121212] border-[#FF007F]/30">
          <CardContent className="p-6 space-y-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de l'annonce"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              data-testid="announcement-title-input"
            />
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Contenu de l'annonce..."
              rows={4}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              data-testid="announcement-content-input"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-[#FF007F] hover:bg-[#FF007F]/80 text-white"
                data-testid="publish-announcement-btn"
              >
                {isSubmitting ? "Publication..." : "Publier"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                className="border-white/10 text-white"
              >
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {announcements.length === 0 ? (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-8 text-center">
            <p className="text-white/50">Aucune annonce publiée</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann) => (
            <Card key={ann.announcement_id} className="bg-[#121212] border-white/10">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-lg text-white">{ann.title}</h3>
                  <span className="text-xs text-white/30">
                    {new Date(ann.created_at).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                <p className="text-white/60">{ann.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// Discover Page for Agency
function DiscoverPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`${API}/campaigns/discover`, { credentials: "include" });
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
        <h1 className="font-display font-bold text-3xl text-white mb-2">Découvrir</h1>
        <p className="text-white/50">Campagnes des autres agences (lecture seule)</p>
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
                  <div className="flex justify-between text-xs text-white/40">
                    <span>Budget</span>
                    <span>{Math.round(((campaign.budget_used || 0) / (campaign.budget_total || 1)) * 100)}%</span>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, ((campaign.budget_used || 0) / (campaign.budget_total || 1)) * 100)}%` }} />
                  </div>
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
    if (formData.payment_model === "views" && !formData.rpm) {
      toast.error("Veuillez renseigner le RPM (€ par 1000 vues)");
      return;
    }
    if (formData.payment_model === "clicks" && (!formData.rate_per_click || !formData.destination_url.trim())) {
      toast.error("Veuillez renseigner le prix pour 1 000 clics et l'URL de destination");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        rpm: formData.payment_model === "views" ? parseFloat(formData.rpm) || 0 : 0,
        rate_per_click: formData.payment_model === "clicks" ? parseFloat(formData.rate_per_click) || 0 : 0,
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
        <h1 className="font-display font-bold text-3xl text-white mb-2">Lancer une campagne</h1>
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

          {/* Toggle modèle */}
          <div>
            <label className="block text-sm text-white/70 mb-3">Modèle de rémunération *</label>
            <div className="flex gap-2">
              {[
                { id: "views", label: "👁 Au nombre de vues", desc: "Payé selon les vues générées" },
                { id: "clicks", label: "🔗 Au clic (lien bio)", desc: "Lien unique dans la bio — payé par clic" },
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
          {formData.payment_model === "views" && (
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
          {formData.payment_model === "clicks" && (
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
  const campaignId = location.pathname.split("/")[3];
  const [campaign, setCampaign] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [pendingMembers, setPendingMembers] = useState([]);
  const [processingMember, setProcessingMember] = useState(null);
  const [kickingMember, setKickingMember] = useState(null);
  const [strikingMember, setStrikingMember] = useState(null);
  const [deletingVideo, setDeletingVideo] = useState(null);
  const [expandedMembers, setExpandedMembers] = useState(new Set());
  const [allVideos, setAllVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [sortField, setSortField] = useState("published_at");
  const [sortDir, setSortDir] = useState("desc");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterClipper, setFilterClipper] = useState("all");
  const [showManualVideoModal, setShowManualVideoModal] = useState(false);
  const [manualVideoForm, setManualVideoForm] = useState({ target: "", url: "", platform: "tiktok" });
  const [addingVideo, setAddingVideo] = useState(false);
  const [trackResult, setTrackResult] = useState(null); // { views, title, earnings }
  const [clickLinks, setClickLinks] = useState(null);      // { links, totals, rate_per_click }
  const [generatingLinks, setGeneratingLinks] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState(null);
  const [regeneratingLinkId, setRegeneratingLinkId] = useState(null);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [addBudgetAmount, setAddBudgetAmount] = useState("");
  const [addingBudget, setAddingBudget] = useState(false);
  // ── Click campaign stats ───────────────────────────────────────────────────
  const [clickStats, setClickStats] = useState(null);
  const [clickStatsLoading, setClickStatsLoading] = useState(false);
  const [viewsTimeline, setViewsTimeline] = useState(null);
  const [viewsTimelineLoading, setViewsTimelineLoading] = useState(false);
  const [viewsPeriod, setViewsPeriod] = useState("30");
  const [period, setPeriod] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [topClips, setTopClips] = useState([]);
  const [topClipsLoading, setTopClipsLoading] = useState(false);

  const fmt = fmtViews;
  const PLAT_COLOR = { tiktok: "#00E5FF", instagram: "#FF007F", youtube: "#FF4444" };
  const PLAT_ICON = { tiktok: "🎵", instagram: "📸", youtube: "▶️" };

  const fetchTopClips = async () => {
    setTopClipsLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/top-clips?limit=10`, { credentials: "include" });
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

  const fetchViewsTimeline = async (d = viewsPeriod) => {
    setViewsTimelineLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/views-chart?days=${d}`, { credentials: "include" });
      if (res.ok) setViewsTimeline(await res.json());
    } catch {}
    finally { setViewsTimelineLoading(false); }
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

  // Auto-fetch click stats when campaign is loaded and is click-based
  useEffect(() => {
    if (campaign?.payment_model === "clicks") fetchClickStats();
  }, [campaign?.campaign_id, campaign?.payment_model]);

  // Auto-fetch views timeline when campaign is loaded and is views-based
  useEffect(() => {
    if (campaign?.payment_model === "views") fetchViewsTimeline();
  }, [campaign?.campaign_id, campaign?.payment_model]);

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

  const handleAddManualVideo = async () => {
    if (!manualVideoForm.url) return;
    setAddingVideo(true);
    setTrackResult(null);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/track-video`, {
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
        setTrackResult({
          views: v.views || 0,
          title: v.title || "Sans titre",
          earnings: v.earnings || 0,
        });
        if ((v.views || 0) === 0) {
          toast.success("Vidéo enregistrée ✓ — stats en attente (API manquante ou vidéo privée)");
        } else {
          toast.success(`Vidéo trackée ✓ — ${(v.views || 0).toLocaleString("fr-FR")} vues`);
        }
        fetchAllVideos();
      } else {
        let detail = "Erreur lors de l'ajout";
        try { detail = (await res.json()).detail || detail; } catch {}
        toast.error(detail);
      }
    } catch (e) { toast.error("Erreur réseau — vérifiez la connexion"); }
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
    if (!window.confirm("Supprimer cette vidéo ?")) return;
    setDeletingVideo(videoId);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/videos/${videoId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { toast.success("Vidéo supprimée"); fetchAllVideos(); }
      else { const e = await res.json(); toast.error(e.detail || "Erreur"); }
    } catch { toast.error("Erreur réseau"); }
    setDeletingVideo(null);
  };

  const handleRemoveSocialAccount = async (accountId) => {
    if (!window.confirm("Retirer ce compte de la campagne ?")) return;
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/social-accounts/${accountId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { toast.success("Compte retiré"); fetchCampaign(); }
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
  const activeMembers = campaign?.members?.filter(m => m.status === "active") || [];

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
          <h1 className="font-display font-bold text-3xl text-white mb-1">{campaign.name}</h1>
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
          { id: "videos", label: `Vidéos (${allVideos.length})`, dot: videosLoading },
          { id: "candidatures", label: "Candidatures", badge: pendingMembers.length },
          ...(campaign.payment_model === "clicks" ? [{ id: "liens", label: "🔗 Liens" }] : []),
          { id: "clip-winner", label: "🏆 Clip Winner" },
        ].map(tab => (
          <button key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === "candidatures") fetchPendingMembers();
              if (tab.id === "liens") fetchClickLinks();
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
      {activeTab === "overview" && campaign.payment_model === "clicks" ? (
        /* ── CLICK CAMPAIGN OVERVIEW ── */
        <div className="space-y-5">
          {/* Period filter */}
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

          {/* KPI row — clics */}
          {clickStats && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Clics totaux", value: (clickStats.total_clicks || 0).toLocaleString("fr-FR"), color: "text-white" },
                { label: "Clics uniques", value: (clickStats.unique_clicks || 0).toLocaleString("fr-FR"), color: "text-[#f0c040]" },
                { label: "Taux unicité", value: clickStats.total_clicks > 0 ? `${Math.round((clickStats.unique_clicks / clickStats.total_clicks) * 100)}%` : "—", color: "text-[#39FF14]" },
                { label: "Gains estimés", value: `€${(clickStats.total_earnings || 0).toFixed(2)}`, color: "text-[#00E5FF]" },
                { label: "Prix / 1K clics", value: `€${clickStats.rate_per_click || 0}`, color: "text-[#FF007F]" },
                { label: "Moy. clics/jour", value: clickStats.chart?.length > 0 ? Math.round(clickStats.total_clicks / Math.max(1, clickStats.chart.filter(d => d.clicks > 0).length)).toLocaleString("fr-FR") : "0", color: "text-white/70" },
              ].map(kpi => (
                <div key={kpi.label} className="bg-[#121212] border border-white/10 rounded-xl p-4">
                  <p className="text-xs text-white/40 mb-1">{kpi.label}</p>
                  <p className={`font-mono font-bold text-xl ${kpi.color}`}>{kpi.value}</p>
                </div>
              ))}
            </div>
          )}

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
                  {clickStats.clippers.map((c, idx) => (
                    <div key={c.clipper_id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/5">
                      <span className="font-mono text-sm text-white/30 w-6">#{idx + 1}</span>
                      <div className="w-7 h-7 rounded-full bg-[#f0c040]/20 flex items-center justify-center text-xs font-bold text-[#f0c040] flex-shrink-0">
                        {(c.name || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{c.name}</p>
                        <p className="text-white/30 text-xs">{c.total_clicks || c.clicks} clics · {c.unique_clicks} uniques</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[#f0c040] font-mono text-sm font-bold">{c.unique_clicks.toLocaleString("fr-FR")}</p>
                        <p className="text-white/40 text-xs">€{c.earnings.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === "overview" && (
        <div className="space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Vues totales", value: fmt(totalViews), color: "text-white" },
              { label: "Likes", value: fmt(totalLikes), color: "text-[#FF007F]" },
              { label: "Commentaires", value: fmt(totalComments), color: "text-white/70" },
              { label: "Engagement", value: `${engagementRate}%`, color: "text-[#39FF14]" },
              { label: "Moy. vues/vidéo", value: fmt(avgViews), color: "text-[#00E5FF]" },
              { label: "Gains estimés", value: `€${totalEarnings.toFixed(0)}`, color: "text-[#f0c040]" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-[#121212] border border-white/10 rounded-xl p-4">
                <p className="text-xs text-white/40 mb-1">{kpi.label}</p>
                <p className={`font-mono font-bold text-xl ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Views timeline chart */}
          <div className="bg-[#121212] border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-white font-medium">Vues par jour</p>
              <div className="flex items-center gap-2">
                {/* Period selector */}
                <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5 gap-0.5">
                  {[["7","7j"], ["30","30j"], ["90","90j"]].map(([val, label]) => (
                    <button key={val}
                      onClick={() => { setViewsPeriod(val); fetchViewsTimeline(val); }}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewsPeriod === val ? "bg-white/15 text-white" : "text-white/40 hover:text-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {viewsTimelineLoading && <div className="w-4 h-4 border-2 border-[#FF007F]/30 border-t-[#FF007F] rounded-full animate-spin" />}
              </div>
            </div>
            {(() => {
              const tlData = (viewsTimeline?.timeline || []).map(d => ({
                ...d,
                label: new Date(d.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
              }));
              const hasData = tlData.some(d => d.views > 0);
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
                      formatter={(v) => [fmt(v), "Vues"]} />
                    <Area type="monotone" dataKey="views" stroke="#FF007F" strokeWidth={2} fill="url(#viewsTimelineGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center">
                  {viewsTimelineLoading
                    ? <div className="w-6 h-6 border-2 border-[#FF007F]/30 border-t-[#FF007F] rounded-full animate-spin" />
                    : <p className="text-white/20 text-sm">Aucune donnée — les vues s'accumulent au fur et à mesure du tracking</p>
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
                    return (
                      <div key={member.member_id} className="rounded-lg bg-white/5 overflow-hidden">
                        <div className="flex items-center gap-3 p-2.5">
                          <span className="font-mono text-sm text-white/30 w-6">#{index+1}</span>
                          <div className="w-7 h-7 rounded-full bg-[#FF007F]/20 flex items-center justify-center text-xs font-bold text-[#FF007F] flex-shrink-0">
                            {(member.user_info?.display_name || "?")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm truncate">{member.user_info?.display_name || member.user_info?.name}</p>
                            <p className="text-white/30 text-xs">{memberVideos.length} vidéo{memberVideos.length !== 1 ? "s" : ""}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-white text-sm font-mono">{fmt(memberViews)}</p>
                            <p className="text-[#FF007F] text-xs">€{memberEarnings.toFixed(2)}</p>
                          </div>
                          <button
                            onClick={() => setExpandedMembers(prev => { const s = new Set(prev); s.has(member.user_id) ? s.delete(member.user_id) : s.add(member.user_id); return s; })}
                            className="text-white/20 hover:text-white/60 text-xs px-1.5 transition-colors"
                            title="Gérer"
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
                            {/* ── Strike management ── */}
                            <div className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg bg-white/3 border border-white/8">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-white/40 uppercase tracking-wide">Strikes</span>
                                <div className="flex gap-0.5">
                                  {Array.from({ length: campaign?.max_strikes || 3 }).map((_, i) => (
                                    <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < (member.strikes || 0) ? "bg-[#FF007F]" : "bg-white/10"}`} />
                                  ))}
                                </div>
                                <span className="text-xs font-mono text-white/60">{member.strikes || 0}/{campaign?.max_strikes || 3}</span>
                                {member.status === "suspended" && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">SUSPENDU</span>}
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleRemoveStrike(member.user_id)}
                                  disabled={strikingMember === member.user_id || (member.strikes || 0) === 0}
                                  className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/15 text-white/40 hover:text-white text-sm font-bold border border-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Retirer un strike"
                                >−</button>
                                <button
                                  onClick={() => handleAddStrike(member.user_id)}
                                  disabled={strikingMember === member.user_id}
                                  className="w-6 h-6 rounded-md bg-[#FF007F]/10 hover:bg-[#FF007F]/25 text-[#FF007F] text-sm font-bold border border-[#FF007F]/20 transition-colors disabled:opacity-50"
                                  title="Ajouter un strike"
                                >+</button>
                              </div>
                            </div>
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

      {/* ═══════════ VIDEOS TAB ═══════════ */}
      {activeTab === "videos" && (
        <div className="space-y-4">
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
            <button onClick={() => { setTrackResult(null); setManualVideoForm({ target: "", url: "", platform: "tiktok" }); setShowManualVideoModal(true); }}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f0c040]/10 hover:bg-[#f0c040]/20 border border-[#f0c040]/30 text-[#f0c040] text-xs font-medium transition-all">
              + Tracker une vidéo
            </button>
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
                  <button onClick={() => { setShowManualVideoModal(false); setTrackResult(null); setManualVideoForm({ target: "", url: "", platform: "tiktok" }); }} className="text-white/30 hover:text-white text-xl leading-none">✕</button>
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

                {/* Plateforme */}
                <div>
                  <label className="text-xs text-white/50 block mb-1.5">Plateforme *</label>
                  <div className="flex gap-2">
                    {[["tiktok","🎵"], ["instagram","📸"], ["youtube","▶️"]].map(([p, icon]) => (
                      <button key={p} onClick={() => setManualVideoForm(f => ({ ...f, platform: p }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border ${manualVideoForm.platform === p ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/10 text-white/40 hover:text-white/70"}`}>
                        {icon} {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* URL */}
                <div>
                  <label className="text-xs text-white/50 block mb-1.5">URL de la vidéo *</label>
                  <input type="url" value={manualVideoForm.url}
                    onChange={e => setManualVideoForm(f => ({ ...f, url: e.target.value }))}
                    placeholder="https://www.tiktok.com/@..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-[#f0c040]/50" />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => { setShowManualVideoModal(false); setTrackResult(null); setManualVideoForm({ target: "", url: "", platform: "tiktok" }); }}
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
                          {clipperName && (
                            <p className="text-white/30 text-xs truncate mt-0.5">{clipperName}</p>
                          )}
                        </div>
                      </div>

                      {/* Views */}
                      <div className="text-white font-mono text-sm">{fmt(video.views || 0)}</div>

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
                      {/* Delete */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteVideo(video.video_id); }}
                          disabled={deletingVideo === video.video_id}
                          className="p-1 rounded hover:bg-red-500/20 text-red-400/50 hover:text-red-400 transition-colors disabled:opacity-30"
                          title="Supprimer la vidéo"
                        >🗑</button>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ CANDIDATURES TAB ═══════════ */}
      {activeTab === "candidatures" && (
        <div className="space-y-3">
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

      {/* ═══════════ LIENS TAB (modèle au clic) ═══════════ */}
      {activeTab === "liens" && campaign.payment_model === "clicks" && (
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
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                🏆 <span>Top 10 — Clips les plus vus</span>
              </h3>
              <p className="text-white/35 text-xs mt-0.5">Toutes plateformes · auto-refresh 5 min</p>
            </div>
            <button onClick={fetchTopClips} disabled={topClipsLoading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-sm transition-all border border-white/10 disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 ${topClipsLoading ? "animate-spin" : ""}`} /> Actualiser
            </button>
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
        <h1 className="font-display font-bold text-3xl text-white mb-2">Liens d'accès</h1>
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
        <h1 className="font-display font-bold text-3xl text-white mb-2">Portefeuille</h1>
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

  useEffect(() => {
    fetch(`${API}/subscription/status`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSubStatus(d))
      .catch(() => {});
  }, []);

  // Handle return from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sub") === "success") {
      toast.success("Abonnement activé avec succès !");
      window.history.replaceState({}, "", window.location.pathname);
      fetch(`${API}/subscription/status`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setSubStatus(d));
    } else if (params.get("sub") === "cancelled") {
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

  const PLANS = [
    { id: "plan_small", name: "Starter", price: "150€/mois", features: ["1 campagne active", "15 clippers max", "Tracking automatique", "Chat & analytics", "Support standard"] },
    { id: "plan_full",  name: "Full",    price: "350€/mois", features: ["Campagnes illimitées", "Clippers illimités", "Tracking automatique", "Analytics avancés", "Support prioritaire", "Liens tracking bio"], featured: true },
  ];

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
        <h1 className="font-display font-bold text-3xl text-white mb-2">Paramètres</h1>
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
                    Plan {PLANS.find(p => p.id === subStatus.subscription_plan)?.name || subStatus.subscription_plan}
                  </p>
                </div>
              )}
              {subStatus.subscription_status === "trial" && !subStatus.trial_expired && (
                <div>
                  <p className="text-[#00E5FF] font-semibold text-sm">Essai gratuit en cours</p>
                  <p className="text-white/60 text-xs mt-0.5">
                    {subStatus.trial_days_remaining > 0
                      ? `${subStatus.trial_days_remaining} jour${subStatus.trial_days_remaining > 1 ? "s" : ""} restant${subStatus.trial_days_remaining > 1 ? "s" : ""}`
                      : "Dernier jour"}
                  </p>
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

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map(plan => {
              const isActive = subStatus?.subscription_plan === plan.id && subStatus?.subscription_status === "active";
              return (
                <div key={plan.id} className={`rounded-xl p-4 border space-y-3 ${
                  plan.featured
                    ? "border-[#FF007F]/60 bg-[#FF007F]/5"
                    : "border-white/10 bg-white/3"
                } ${isActive ? "ring-2 ring-[#39FF14]/50" : ""}`}>
                  {plan.featured && (
                    <span className="text-[10px] font-semibold bg-[#FF007F] text-white px-2 py-0.5 rounded-full">Recommandé</span>
                  )}
                  <div>
                    <p className="text-white font-semibold text-sm">{plan.name}</p>
                    <p className="text-white/80 font-bold text-xl">{plan.price}</p>
                  </div>
                  <ul className="space-y-1">
                    {plan.features.map(f => (
                      <li key={f} className="text-white/50 text-xs flex items-center gap-1.5">
                        <span className="text-[#39FF14]">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={isActive || checkoutLoading === plan.id}
                    className={`w-full text-xs py-2 ${
                      isActive
                        ? "bg-[#39FF14]/20 text-[#39FF14] cursor-default"
                        : plan.featured
                        ? "bg-[#FF007F] hover:bg-[#FF007F]/80 text-white"
                        : "bg-white/10 hover:bg-white/20 text-white border border-white/10"
                    }`}
                  >
                    {isActive ? "Plan actuel" : checkoutLoading === plan.id ? "Redirection..." : "Choisir ce plan"}
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-white/30">Paiement sécurisé par Stripe · HT · Résiliation possible à tout moment</p>
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

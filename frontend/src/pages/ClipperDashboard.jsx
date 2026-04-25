import { useState, useEffect } from "react";
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

// Nombre de vues exact avec suffixe lisible (1 600 vues, pas "2K")
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
  Home, Search, Smartphone, CreditCard, Settings, MessageCircle,
  Video, TrendingUp, Eye, DollarSign, Plus, Trash2, Check, X, AlertTriangle,
  Heart, Share2, BarChart2, Link2, ChevronRight, HelpCircle, Copy, RefreshCw, MousePointerClick
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import ChatPanel from "../components/ChatPanel";
import SupportPage from "../components/SupportPage";

const ACCENT_COLOR = "#00E5FF";

export default function ClipperDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [campaigns, setCampaigns] = useState([]);
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [supportUnread, setSupportUnread] = useState(0);

  useEffect(() => {
    fetchData();
    fetchUnreadCounts();
    const interval = setInterval(fetchUnreadCounts, 30000);
    return () => clearInterval(interval);
  }, []);

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
      const [campaignsRes, accountsRes, announcementsRes, statsRes] = await Promise.all([
        fetch(`${API}/campaigns`, { credentials: "include" }),
        fetch(`${API}/social-accounts`, { credentials: "include" }),
        fetch(`${API}/announcements`, { credentials: "include" }),
        fetch(`${API}/clipper/stats`, { credentials: "include" }),
      ]);

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
      }
      if (accountsRes.ok) {
        const data = await accountsRes.json();
        setSocialAccounts(data.accounts || []);
      }
      if (announcementsRes.ok) {
        const data = await announcementsRes.json();
        setAnnouncements(data.announcements || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const sidebarItems = [
    { id: "home", label: "Accueil", icon: Home, path: "/clipper" },
    { id: "discover", label: "Découvrir", icon: Search, path: "/clipper/discover" },
    { id: "accounts", label: "Mes comptes", icon: Smartphone, path: "/clipper/accounts" },
    { id: "videos", label: "Mes vidéos", icon: Video, path: "/clipper/videos" },
    { type: "divider" },
    { type: "section", label: "MES CAMPAGNES" },
    ...campaigns.map((c) => ({
      id: `campaign-${c.campaign_id}`,
      label: c.name,
      icon: Video,
      path: `/clipper/campaign/${c.campaign_id}`,
      children: [
        {
          id: `chat-${c.campaign_id}`,
          label: `Chat — ${c.name}`,
          icon: MessageCircle,
          path: `/clipper/campaign/${c.campaign_id}/chat`,
          badge: unreadCounts[c.campaign_id] || 0,
        },
      ],
    })),
    { type: "divider" },
    { id: "payment", label: "Paiement", icon: CreditCard, path: "/clipper/payment" },
    { id: "support", label: "Support", icon: HelpCircle, path: "/clipper/support", badge: supportUnread },
    { id: "settings", label: "Paramètres", icon: Settings, path: "/clipper/settings" },
  ];

  return (
    <div className="flex min-h-screen bg-[#0A0A0A]">
      <Sidebar 
        items={sidebarItems} 
        accentColor={ACCENT_COLOR}
        role="clipper"
      />
      <main className={`flex-1 ml-64 ${location.pathname.includes("/chat") ? "h-screen overflow-hidden" : "p-8"}`}>
        <Routes>
          <Route index element={<ClipperHome announcements={announcements} stats={stats} />} />
          <Route path="discover" element={<DiscoverCampaigns onJoin={fetchData} />} />
          <Route path="accounts" element={
            <AccountsPage
              accounts={socialAccounts}
              campaigns={campaigns}
              onUpdate={fetchData}
            />
          } />
          <Route path="videos" element={<AllVideosPage />} />
          <Route path="campaign/:campaignId" element={<CampaignDashboard campaigns={campaigns} clipperStats={stats} />} />
          <Route path="campaign/:campaignId/chat" element={<ChatPanel campaigns={campaigns} />} />
          <Route path="payment" element={<PaymentPage stats={stats} />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

// ── Post Card ──────────────────────────────────────────────────────────────────
function PostCard({ ann, currentUser }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(ann.likes || 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [loadingCmts, setLoadingCmts] = useState(false);
  const [sending, setSending] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  useEffect(() => {
    fetch(`${API}/announcements/${ann.announcement_id}/likes`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setLiked(d.liked); setLikeCount(d.count); } })
      .catch(() => {});
  }, [ann.announcement_id]);

  const toggleLike = async () => {
    const prev = liked;
    setLiked(!prev);
    setLikeCount(c => prev ? c - 1 : c + 1);
    try {
      const r = await fetch(`${API}/announcements/${ann.announcement_id}/like`, { method: "POST", credentials: "include" });
      if (r.ok) { const d = await r.json(); setLiked(d.liked); setLikeCount(d.count); }
    } catch {}
  };

  const loadComments = async () => {
    setLoadingCmts(true);
    try {
      const r = await fetch(`${API}/announcements/${ann.announcement_id}/comments`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setComments(d.comments || []); }
    } catch {}
    setLoadingCmts(false);
  };

  const toggleComments = () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && comments.length === 0) loadComments();
  };

  const sendComment = async () => {
    if (!commentText.trim()) return;
    setSending(true);
    try {
      const r = await fetch(`${API}/announcements/${ann.announcement_id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (r.ok) {
        const c = await r.json();
        setComments(prev => [...prev, c]);
        setCommentText("");
      }
    } catch {}
    setSending(false);
  };

  const lines = (ann.content || "").split("\n");
  const isLong = lines.length > 5;
  const displayLines = isLong && !contentExpanded ? lines.slice(0, 4) : lines;
  const imageUrl = ann.image_url || ann.image;

  return (
    <div className="px-5 py-5">
      {/* Category tag */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="w-5 h-5 rounded bg-[#FF007F]/20 flex items-center justify-center">
          <BarChart2 className="w-3 h-3 text-[#FF007F]" />
        </span>
        <span className="text-xs text-white/40 uppercase tracking-wide font-medium">
          Campagnes {ann.campaign_name ? `• ${ann.campaign_name}` : ""}
        </span>
      </div>

      {/* Author */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#FF007F]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {ann.agency?.picture
              ? <img src={ann.agency.picture} alt="" className="w-full h-full object-cover" />
              : <span className="text-[#FF007F] font-bold text-sm">{ann.agency?.display_name?.[0] || "A"}</span>}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-white text-sm">{ann.agency?.display_name || "Agence"}</span>
              <span className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white/50" />
              </span>
            </div>
            <p className="text-xs text-white/40">
              {ann.agency?.handle ? `${ann.agency.handle} · ` : ""}{formatDate(ann.created_at)}
            </p>
          </div>
        </div>
        <button className="text-white/20 hover:text-white/50 transition-colors" onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success("Lien copié"); }}>
          <Link2 className="w-4 h-4" />
        </button>
      </div>

      {/* Title */}
      {ann.title && <p className="font-semibold text-white mb-2">{ann.title}</p>}

      {/* Content */}
      <div className="text-sm text-white/70 leading-relaxed whitespace-pre-line mb-3">
        {displayLines.join("\n")}
        {isLong && !contentExpanded && (
          <button onClick={() => setContentExpanded(true)} className="ml-1 text-[#00E5FF] hover:underline text-xs">voir plus</button>
        )}
      </div>

      {/* Image */}
      {imageUrl && (
        <div className="rounded-xl overflow-hidden mb-4 border border-white/10">
          <img src={imageUrl} alt="" className="w-full object-cover max-h-80" />
        </div>
      )}

      {/* Engagement bar */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleLike}
            className={`flex items-center gap-1.5 text-sm transition-colors ${liked ? "text-[#FF007F]" : "text-white/40 hover:text-white/70"}`}
          >
            <Heart className={`w-4 h-4 transition-all ${liked ? "fill-[#FF007F] scale-110" : ""}`} />
            <span>{likeCount > 0 ? likeCount : ""} Comme</span>
          </button>
          <button
            onClick={toggleComments}
            className={`flex items-center gap-1.5 text-sm transition-colors ${commentsOpen ? "text-[#00E5FF]" : "text-white/40 hover:text-white/70"}`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>{comments.length || ""} commentaire{comments.length !== 1 ? "s" : ""}</span>
          </button>
        </div>
        <button className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors">
          <Share2 className="w-4 h-4" /> Partager
        </button>
      </div>

      {/* Comments section */}
      {commentsOpen && (
        <div className="mt-4 space-y-3">
          {loadingCmts ? (
            <p className="text-xs text-white/30 text-center py-2">Chargement…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-2">Soyez le premier à commenter</p>
          ) : (
            comments.map((c) => (
              <div key={c.comment_id} className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {c.author?.picture
                    ? <img src={c.author.picture} alt="" className="w-full h-full object-cover" />
                    : <span className="text-white/60 text-xs font-bold">{c.author?.display_name?.[0] || "?"}</span>}
                </div>
                <div className="flex-1 bg-white/5 rounded-2xl px-3 py-2">
                  <p className="text-xs font-semibold text-white/80 mb-0.5">{c.author?.display_name || "Utilisateur"}</p>
                  <p className="text-sm text-white/70 leading-snug">{c.content}</p>
                </div>
              </div>
            ))
          )}

          {/* Comment input */}
          <div className="flex items-center gap-2.5 pt-1">
            <div className="w-7 h-7 rounded-full bg-[#FF007F]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {currentUser?.picture
                ? <img src={currentUser.picture} alt="" className="w-full h-full object-cover" />
                : <span className="text-[#FF007F] text-xs font-bold">{currentUser?.display_name?.[0] || "?"}</span>}
            </div>
            <div className="flex-1 flex items-center gap-2 bg-white/5 rounded-full px-3 py-1.5 border border-white/5 focus-within:border-white/20 transition-colors">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendComment()}
                placeholder="Écrire un commentaire…"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
              />
              <button
                onClick={sendComment}
                disabled={sending || !commentText.trim()}
                className="text-white/30 hover:text-[#00E5FF] disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Post Composer (agency only) ────────────────────────────────────────────────
function PostComposer({ user, onPosted }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setImagePreview(ev.target.result); setImageBase64(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!title.trim() && !content.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: title.trim(), content: content.trim(), image_url: imageBase64 }),
      });
      if (r.ok) {
        toast.success("Annonce publiée !");
        setTitle(""); setContent(""); setImagePreview(null); setImageBase64(null); setOpen(false);
        if (onPosted) onPosted();
      } else {
        const err = await r.json();
        toast.error(err.detail || "Erreur");
      }
    } catch { toast.error("Erreur de connexion"); }
    setSubmitting(false);
  };

  return (
    <div className="border-b border-white/10">
      {!open ? (
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="w-9 h-9 rounded-full bg-[#FF007F]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {user?.picture ? <img src={user.picture} alt="" className="w-full h-full object-cover rounded-full" /> : <span className="text-[#FF007F] font-bold text-sm">{user?.display_name?.[0] || "A"}</span>}
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex-1 text-left bg-white/5 rounded-full px-4 py-2 text-sm text-white/30 hover:bg-white/10 transition-colors"
          >
            Publier une annonce campagne…
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF007F]/10 text-[#FF007F] text-xs font-medium hover:bg-[#FF007F]/20 transition-colors">
            <Video className="w-3.5 h-3.5" /> En direct
          </button>
        </div>
      ) : (
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-[#FF007F]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {user?.picture ? <img src={user.picture} alt="" className="w-full h-full object-cover rounded-full" /> : <span className="text-[#FF007F] font-bold text-sm">{user?.display_name?.[0] || "A"}</span>}
            </div>
            <span className="font-semibold text-white text-sm">{user?.display_name}</span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre de l'annonce…"
            className="w-full bg-transparent text-white font-semibold text-base placeholder:text-white/30 outline-none border-b border-white/10 pb-2"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Décris ta campagne, tarif, plateformes…"
            rows={4}
            className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/30 outline-none resize-none leading-relaxed"
          />

          {imagePreview && (
            <div className="relative rounded-xl overflow-hidden border border-white/10">
              <img src={imagePreview} alt="" className="w-full max-h-60 object-cover" />
              <button onClick={() => { setImagePreview(null); setImageBase64(null); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <label className="flex items-center gap-2 text-white/40 hover:text-white/70 cursor-pointer transition-colors text-sm">
              <Plus className="w-4 h-4" />
              <span>Ajouter une photo</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
            </label>
            <div className="flex gap-2">
              <button onClick={() => { setOpen(false); setTitle(""); setContent(""); setImagePreview(null); setImageBase64(null); }} className="px-4 py-1.5 text-sm text-white/40 hover:text-white transition-colors">Annuler</button>
              <button
                onClick={handleSubmit}
                disabled={submitting || (!title.trim() && !content.trim())}
                className="px-4 py-1.5 text-sm font-medium bg-[#FF007F] text-white rounded-lg hover:bg-[#FF007F]/80 disabled:opacity-40 transition-colors"
              >
                {submitting ? "Publication…" : "Publier"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Clipper Home Page ──────────────────────────────────────────────────────────
function ClipperHome({ announcements: initialAnnouncements, stats }) {
  const { user } = useAuth();
  const [feed, setFeed] = useState(initialAnnouncements);
  const [copiedLink, setCopiedLink] = useState(null);

  useEffect(() => { setFeed(initialAnnouncements); }, [initialAnnouncements]);

  const reloadFeed = async () => {
    try {
      const r = await fetch(`${API}/announcements`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setFeed(d.announcements || []); }
    } catch {}
  };

  const handleCopyTrackingLink = (url, id) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(id);
      setTimeout(() => setCopiedLink(null), 2000);
      toast.success("Lien copié !");
    });
  };

  const displayFeed = feed;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6" data-testid="clipper-home">
      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-[#121212] border-white/10">
            <CardContent className="p-5">
              <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Gains</p>
              <p className="font-mono font-bold text-xl text-[#00E5FF]">€{stats.total_earnings?.toFixed(2) || "0.00"}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#121212] border-white/10">
            <CardContent className="p-5">
              <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Campagnes</p>
              <p className="font-mono font-bold text-xl text-white">{stats.campaign_stats?.length || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#121212] border-white/10">
            <CardContent className="p-5">
              <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Vues totales</p>
              <p className="font-mono font-bold text-xl text-white">
                {(stats.campaign_stats?.reduce((acc, c) => acc + c.views, 0) || 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* My Campaigns with status badges + tracking links */}
      {stats?.campaign_stats && stats.campaign_stats.length > 0 && (
        <Card className="bg-[#121212] border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Mes campagnes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.campaign_stats.map((cs) => (
              <div key={cs.campaign_id} className="rounded-lg overflow-hidden">
                {/* Ligne principale */}
                <div className="flex items-center justify-between p-3 bg-white/5">
                  <div className="flex items-center gap-2 min-w-0 mr-3">
                    <span className="text-white text-sm font-medium truncate">{cs.campaign_name}</span>
                    {cs.payment_model === "clicks" && (
                      <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[#f0c040]/15 text-[#f0c040] border border-[#f0c040]/25 font-medium">
                        <MousePointerClick className="w-2.5 h-2.5" /> Clic
                      </span>
                    )}
                  </div>
                  {cs.status === "pending" && (
                    <span className="flex-shrink-0 text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium">
                      ⏳ En attente
                    </span>
                  )}
                  {cs.status === "active" && (
                    <span className="flex-shrink-0 text-xs px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/30 font-medium">
                      ✅ Actif
                    </span>
                  )}
                  {cs.status === "rejected" && (
                    <span className="flex-shrink-0 text-xs px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 font-medium">
                      ❌ Refusée
                    </span>
                  )}
                </div>

                {/* Lien de tracking bio — visible uniquement si campagne active au clic */}
                {cs.payment_model === "clicks" && cs.status === "active" && cs.tracking_url && (
                  <div className="px-3 py-2.5 bg-[#f0c040]/6 border-t border-[#f0c040]/15 flex items-center gap-2">
                    <Link2 className="w-3.5 h-3.5 text-[#f0c040] flex-shrink-0" />
                    <p className="flex-1 font-mono text-xs text-white/60 truncate">{cs.tracking_url}</p>
                    <button
                      onClick={() => handleCopyTrackingLink(cs.tracking_url, cs.campaign_id)}
                      className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#f0c040] hover:bg-[#f0c040]/90 text-black text-xs font-bold transition-all"
                    >
                      {copiedLink === cs.campaign_id
                        ? <><Check className="w-3 h-3" /> Copié</>
                        : <><Copy className="w-3 h-3" /> Copier</>
                      }
                    </button>
                  </div>
                )}

                {/* Message si campagne au clic mais lien pas encore généré */}
                {cs.payment_model === "clicks" && cs.status === "active" && !cs.tracking_url && (
                  <div className="px-3 py-2 bg-white/3 border-t border-white/5">
                    <p className="text-white/30 text-xs">Lien en cours de génération par l'agence…</p>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Feed card */}
      <Card className="bg-[#121212] border-white/10 overflow-hidden">
        {/* Composer — agences uniquement */}
        {(user?.role === "agency" || user?.role === "manager") && <PostComposer user={user} onPosted={reloadFeed} />}

        {/* Posts */}
        <div className="divide-y divide-white/5">
          {displayFeed.length > 0 ? (
            displayFeed.map((ann) => (
              <PostCard key={ann.announcement_id} ann={ann} currentUser={user} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageCircle className="w-10 h-10 text-white/10 mb-3" />
              <p className="text-white/30 text-sm">Aucune annonce pour le moment</p>
              <p className="text-white/20 text-xs mt-1">Les annonces de tes agences apparaissent ici</p>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

// Discover Campaigns Page
const SORT_OPTIONS = [
  { value: "recent", label: "Plus récentes" },
  { value: "rpm", label: "Meilleure rémunération" },
  { value: "budget", label: "Budget restant" },
  { value: "views", label: "Plus de vues" },
  { value: "clippers", label: "Plus de clippers" },
];

function DiscoverCampaigns({ onJoin }) {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [applyForm, setApplyForm] = useState({ tiktok: "", instagram: "", youtube: "", example_url: "" });
  const [applying, setApplying] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [debouncedSearch, setDebouncedSearch] = useState("");

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

  const handleApply = async () => {
    // If campaign has no application form, instant join with no form required
    if (!selectedCampaign.application_form_enabled) {
      setApplying(true);
      try {
        const res = await fetch(`${API}/campaigns/${selectedCampaign.campaign_id}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        if (res.ok) {
          toast.success("Vous avez rejoint la campagne !");
          setSelectedCampaign(null);
          if (onJoin) onJoin();
        } else {
          const err = await res.json();
          toast.error(err.detail || "Erreur");
        }
      } catch {
        toast.error("Erreur de connexion");
      } finally {
        setApplying(false);
      }
      return;
    }
    if (!applyForm.tiktok && !applyForm.instagram && !applyForm.youtube) {
      toast.error("Renseigne au moins un compte social");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`${API}/campaigns/${selectedCampaign.campaign_id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(applyForm),
      });
      if (res.ok) {
        toast.success("Candidature envoyée !");
        setSelectedCampaign(null);
        setApplyForm({ tiktok: "", instagram: "", youtube: "", example_url: "" });
        if (onJoin) onJoin();
      } else {
        const err = await res.json();
        toast.error(err.detail || "Erreur lors de la candidature");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setApplying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="discover-page"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Découvrir</h1>
        <p className="text-white/50">Explorez les campagnes disponibles</p>
      </div>

      {/* Search + Sort bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une campagne, une agence…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {SORT_OPTIONS.map(opt => (
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

      {/* Apply Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#121212] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold text-xl text-white">{selectedCampaign.name}</h2>
                {selectedCampaign.payment_model === "clicks" ? (
                  <p className="text-sm text-white/50 mt-1">
                    🔗 <span className="text-[#f0c040] font-mono font-bold">€{selectedCampaign.rate_per_click || 0}</span>
                    <span className="text-white/30"> / 1K clics</span>
                    {selectedCampaign.unique_clicks_only && <span className="ml-2 text-[10px] text-white/30 border border-white/10 px-1.5 py-0.5 rounded-md">Clics uniques</span>}
                  </p>
                ) : (
                  <p className="text-sm text-white/50 mt-1">RPM : <span className="text-[#00E5FF] font-mono">€{selectedCampaign.rpm}</span></p>
                )}
              </div>
              <button onClick={() => setSelectedCampaign(null)} className="text-white/40 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Click campaign info box */}
            {selectedCampaign.payment_model === "clicks" && (
              <div className="p-3 rounded-xl bg-[#f0c040]/8 border border-[#f0c040]/25">
                <p className="text-[#f0c040] text-xs font-semibold mb-1">🔗 Campagne au clic</p>
                <p className="text-white/50 text-xs">
                  Après acceptation, tu recevras un <strong className="text-white/70">lien de tracking unique</strong> à mettre dans ta bio.
                  Gains = <strong className="text-[#f0c040]">(clics / 1 000) × €{selectedCampaign.rate_per_click || 0}</strong>{selectedCampaign.unique_clicks_only ? " — 1 IP = 1 clic" : ""}.
                </p>
              </div>
            )}
            {selectedCampaign.application_form_enabled === false ? (
              <p className="text-sm text-[#39FF14]/80 bg-[#39FF14]/10 rounded-lg px-3 py-2">
                ⚡ Rejoindre instantanément — aucun formulaire requis
              </p>
            ) : (
              <p className="text-sm text-white/60">
                {selectedCampaign.payment_model === "clicks"
                  ? "Renseigne tes comptes sociaux (facultatif pour les campagnes au clic)."
                  : "Renseigne tes comptes sociaux pour postuler. Ils seront trackés automatiquement dès ton acceptation."}
              </p>
            )}
            {selectedCampaign.application_form_enabled !== false && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1">TikTok (@pseudo)</label>
                  <Input value={applyForm.tiktok} onChange={(e) => setApplyForm(p => ({ ...p, tiktok: e.target.value }))} placeholder="@monpseudo" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Instagram (@pseudo)</label>
                  <Input value={applyForm.instagram} onChange={(e) => setApplyForm(p => ({ ...p, instagram: e.target.value }))} placeholder="@monpseudo" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">YouTube (@pseudo)</label>
                  <Input value={applyForm.youtube} onChange={(e) => setApplyForm(p => ({ ...p, youtube: e.target.value }))} placeholder="@monpseudo" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Exemple de clip (URL)</label>
                  <Input value={applyForm.example_url} onChange={(e) => setApplyForm(p => ({ ...p, example_url: e.target.value }))} placeholder="https://tiktok.com/..." className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={() => setSelectedCampaign(null)} className="flex-1 text-white/50 hover:text-white">Annuler</Button>
              <Button onClick={handleApply} disabled={applying} className="flex-1 bg-[#FF007F] hover:bg-[#FF007F]/80 text-white">
                {applying ? "Envoi..." : "Postuler"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-[#121212] border-white/10">
              <CardContent className="p-6">
                <div className="skeleton h-8 w-3/4 rounded mb-4" />
                <div className="skeleton h-4 w-1/2 rounded mb-2" />
                <div className="skeleton h-4 w-2/3 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-8 text-center">
            <p className="text-white/50">Aucune campagne disponible</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <div
              key={c.campaign_id}
              className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all cursor-pointer group"
            >
              {/* Cover image */}
              <div
                className="h-36 relative overflow-hidden"
                style={{ background: c.image_url ? `url(${c.image_url}) center/cover no-repeat` : "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
              >
                <div className="absolute inset-0 bg-black/30" />
                {/* Platform badges top-right */}
                <div className="absolute top-3 right-3 flex gap-1">
                  {(c.platforms || []).map(p => (
                    <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-black/60 text-white border border-white/20 font-medium">
                      {p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : p === "youtube" ? "YouTube" : p}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card body */}
              <div className="p-4 space-y-3">
                {/* Agency name */}
                {(c.agency_name || c.agency) && (
                  <p className="text-xs text-white/40 font-medium">{c.agency_name || c.agency}</p>
                )}

                {/* Campaign name */}
                <h3 className="text-white font-bold text-base leading-tight group-hover:text-[#00E5FF] transition-colors">
                  {c.name}
                </h3>

                {/* Description */}
                {c.description && (
                  <p className="text-white/50 text-xs leading-relaxed line-clamp-2">{c.description}</p>
                )}

                {/* Payment model badge */}
                <div className="flex items-center gap-2 flex-wrap">
                  {c.payment_model === "clicks" ? (
                    <span className="text-xs font-bold text-[#f0c040] bg-[#f0c040]/10 px-2 py-1 rounded-md">
                      🔗 {c.rate_per_click || 0}€ / 1K clics
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-[#39FF14] bg-[#39FF14]/10 px-2 py-1 rounded-md">
                      💰 {c.rpm || 0}€ / 1K vues
                    </span>
                  )}
                </div>

                {/* Budget bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-white/40">
                    <span>Budget</span>
                    <span>{Math.round(((c.budget_used || 0) / (c.budget || c.budget_total || 1)) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.round(((c.budget_used || 0) / (c.budget || c.budget_total || 1)) * 100))}%` }}
                    />
                  </div>
                </div>

                {/* Clippers + spots */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/40">
                    👥 {c.active_members || 0} clippers actifs
                  </span>
                  {c.max_clippers && (
                    <span className="text-xs text-white/40">
                      {Math.max(0, c.max_clippers - (c.active_members || 0))} places restantes
                    </span>
                  )}
                </div>

                {/* Apply button */}
                {c.user_status === "active" ? (
                  <div className="w-full py-2 rounded-lg bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] text-sm font-semibold text-center mt-1">
                    ✓ Membre actif
                  </div>
                ) : c.user_status === "pending" ? (
                  <div className="w-full py-2 rounded-lg bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-sm font-semibold text-center mt-1">
                    ⏳ Candidature en attente
                  </div>
                ) : c.user_status === "rejected" ? (
                  <div className="w-full py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold text-center mt-1">
                    ✗ Candidature refusée
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedCampaign(c)}
                    className="w-full py-2 rounded-lg bg-[#FF007F] hover:bg-[#FF007F]/80 text-white text-sm font-semibold transition-colors mt-1"
                  >
                    Postuler
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// Accounts Management Page
// ---- All Videos Page ----
function AllVideosPage() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | tiktok | instagram | youtube
  const [sort, setSort] = useState("recent"); // recent | views | earnings

  useEffect(() => {
    fetchAllVideos();
  }, []);

  const fetchAllVideos = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/clipper/all-videos`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos || []);
      }
    } catch {}
    finally { setLoading(false); }
  };

  const fmt = fmtViews;
  const platformColor = { tiktok: "#00E5FF", youtube: "#FF0000", instagram: "#FF007F" };
  const platformEmoji = { tiktok: "🎵", youtube: "▶️", instagram: "📸" };

  const filtered = videos
    .filter(v => filter === "all" || v.platform === filter)
    .sort((a, b) => {
      if (sort === "views") return (b.views || 0) - (a.views || 0);
      if (sort === "earnings") return (b.earnings || 0) - (a.earnings || 0);
      return new Date(b.published_at || b.fetched_at || 0) - new Date(a.published_at || a.fetched_at || 0);
    });

  const totalViews = videos.reduce((s, v) => s + (v.views || 0), 0);
  const totalEarnings = videos.reduce((s, v) => s + (v.earnings || 0), 0);
  const platformCounts = videos.reduce((acc, v) => { acc[v.platform] = (acc[v.platform] || 0) + 1; return acc; }, {});

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-3xl text-white mb-1">Mes vidéos</h1>
          <p className="text-white/50">{videos.length} vidéo{videos.length !== 1 ? "s" : ""} trackée{videos.length !== 1 ? "s" : ""} · {fmt(totalViews)} vues · €{totalEarnings.toFixed(2)} générés</p>
        </div>
        <button onClick={fetchAllVideos} className="text-white/40 hover:text-white text-sm transition-colors border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/30">
          ↻ Actualiser
        </button>
      </div>

      {/* Stats pills */}
      {videos.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {Object.entries(platformCounts).map(([plat, count]) => (
            <div key={plat} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
              <span>{platformEmoji[plat]}</span>
              <span className="text-xs font-medium" style={{ color: platformColor[plat] }}>{plat}</span>
              <span className="text-white/50 text-xs">{count} vidéo{count > 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex bg-white/5 rounded-lg p-1 gap-1">
          {["all", "tiktok", "instagram", "youtube"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                filter === f ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}
              style={filter === f && f !== "all" ? { color: platformColor[f] } : {}}>
              {f === "all" ? "Tout" : f === "tiktok" ? "🎵 TikTok" : f === "instagram" ? "📸 Instagram" : "▶️ YouTube"}
            </button>
          ))}
        </div>
        <div className="flex bg-white/5 rounded-lg p-1 gap-1">
          {[["recent", "Récentes"], ["views", "Vues"], ["earnings", "Gains"]].map(([s, l]) => (
            <button key={s} onClick={() => setSort(s)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                sort === s ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Video className="w-16 h-16 text-white/10 mx-auto mb-4" />
          <p className="text-white/40 text-lg mb-2">{videos.length === 0 ? "Aucune vidéo trackée" : "Aucune vidéo pour ce filtre"}</p>
          <p className="text-white/20 text-sm">
            {videos.length === 0
              ? "Ajoutez vos comptes réseaux sociaux et lancez un scraping pour voir vos vidéos ici"
              : "Essayez un autre filtre"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((v) => {
            const color = platformColor[v.platform] || "#fff";
            return (
              <a key={v.video_id || v.platform_video_id} href={v.url} target="_blank" rel="noreferrer"
                className="group block rounded-xl overflow-hidden bg-[#121212] border border-white/10 hover:border-white/20 transition-all hover:-translate-y-0.5">
                {/* Thumbnail */}
                <div className="relative w-full aspect-video bg-white/5">
                  {v.thumbnail_url
                    ? <img src={imgSrc(v.thumbnail_url)} alt="" className="w-full h-full object-cover"
                        onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
                    : null}
                  <div className="w-full h-full items-center justify-center text-2xl"
                    style={{ display: v.thumbnail_url ? "none" : "flex" }}>
                    {platformEmoji[v.platform] || "🎬"}
                  </div>
                  {/* Platform badge */}
                  <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: `${color}dd`, color: "#000" }}>
                    {v.platform}
                  </span>
                  {/* Views overlay */}
                  <span className="absolute bottom-1.5 right-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/70 text-white">
                    👁 {fmt(v.views)}
                  </span>
                </div>
                {/* Info */}
                <div className="p-2.5">
                  <p className="text-white text-xs font-medium line-clamp-2 mb-1.5 leading-snug">
                    {v.title || "Vidéo sans titre"}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-white/30 text-[10px]">
                      {v.published_at ? new Date(v.published_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}
                    </span>
                    {v.earnings > 0 && (
                      <span className="text-[#39FF14] text-[10px] font-mono font-bold">€{v.earnings.toFixed(2)}</span>
                    )}
                  </div>
                  {v.campaign_name && v.campaign_name !== "Sans campagne" && (
                    <p className="text-white/20 text-[9px] mt-1 truncate">{v.campaign_name}</p>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function AccountsPage({ accounts: propAccounts, campaigns, onUpdate }) {
  // Local copy of accounts for real-time status updates during verification polling
  const [localAccounts, setLocalAccounts] = useState(propAccounts);
  const [newPlatform, setNewPlatform] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [campaignAccounts, setCampaignAccounts] = useState({});
  const [videosByAccount, setVideosByAccount] = useState({});
  const [expandedAccounts, setExpandedAccounts] = useState(new Set());
  const [refreshingAccounts, setRefreshingAccounts] = useState(new Set());
  const [scrapingAccounts, setScrapingAccounts] = useState(new Set());
  // Manual video URL submission (TikTok fallback)
  const [manualVideoUrl, setManualVideoUrl] = useState("");
  const [manualVideoAccount, setManualVideoAccount] = useState(null); // account_id
  const [addingManualVideo, setAddingManualVideo] = useState(false);

  // Sync local accounts when parent refreshes (e.g. after adding a new account)
  useEffect(() => { setLocalAccounts(propAccounts); }, [propAccounts]);

  // Poll ONLY the accounts endpoint every 3s while any is pending (lightweight — no full fetchData)
  useEffect(() => {
    if (!localAccounts.some((a) => a.status === "pending")) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`${API}/social-accounts`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const fetched = data.accounts || [];
          setLocalAccounts(fetched);
          // Once all verified/errored, trigger full parent refresh (updates sidebar etc.)
          if (!fetched.some(a => a.status === "pending")) onUpdate();
        }
      } catch {}
    }, 3000);
    return () => clearInterval(t);
  }, [localAccounts, onUpdate]);

  useEffect(() => {
    fetchCampaignAccounts();
  }, [campaigns]);

  const fetchCampaignAccounts = async () => {
    const accountsMap = {};
    for (const campaign of campaigns) {
      try {
        const res = await fetch(`${API}/campaigns/${campaign.campaign_id}/social-accounts`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          accountsMap[campaign.campaign_id] = data.accounts || [];
        }
      } catch (error) {}
    }
    setCampaignAccounts(accountsMap);
  };

  const handleAddAccount = async () => {
    if (!newPlatform || !newUsername.trim()) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }
    setIsAdding(true);
    try {
      const res = await fetch(`${API}/social-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          platform: newPlatform,
          account_url: newUsername.trim(),
        }),
      });
      if (res.ok) {
        toast.success("Compte ajouté — vérification en cours...");
        setNewPlatform("");
        setNewUsername("");
        onUpdate();
      } else {
        const error = await res.json();
        toast.error(error.detail || "Erreur lors de l'ajout");
      }
    } catch (error) {
      toast.error("Erreur de connexion");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteAccount = async (accountId) => {
    try {
      const res = await fetch(`${API}/social-accounts/${accountId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Compte supprimé");
        onUpdate();
      }
    } catch (error) {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleRefreshAccount = async (accountId) => {
    setRefreshingAccounts((prev) => new Set(prev).add(accountId));
    try {
      const res = await fetch(`${API}/social-accounts/${accountId}/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Vérification relancée");
        onUpdate();
      }
    } catch (error) {
      toast.error("Erreur");
    } finally {
      setRefreshingAccounts((prev) => { const s = new Set(prev); s.delete(accountId); return s; });
    }
  };

  const toggleVideos = async (accountId) => {
    const next = new Set(expandedAccounts);
    if (next.has(accountId)) {
      next.delete(accountId);
      setExpandedAccounts(next);
      return;
    }
    next.add(accountId);
    setExpandedAccounts(next);
    // Always reload videos when opening
    try {
      const res = await fetch(`${API}/social-accounts/${accountId}/videos`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setVideosByAccount((prev) => ({ ...prev, [accountId]: data.videos || [] }));
      }
    } catch {}
  };

  const handleScrapeNow = async (accountId) => {
    setScrapingAccounts((prev) => new Set(prev).add(accountId));
    // Ensure videos section is open
    setExpandedAccounts((prev) => new Set(prev).add(accountId));
    try {
      const res = await fetch(`${API}/social-accounts/${accountId}/scrape-now`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        const detail = err.detail || "Erreur lors du scraping";
        const shortMsg = detail.length > 120 ? detail.substring(0, 120) + "…" : detail;
        toast.error(shortMsg, { duration: 8000 });
        setScrapingAccounts((prev) => { const s = new Set(prev); s.delete(accountId); return s; });
        return;
      }
      const data = await res.json();
      if (data.status === "started") {
        toast.info("Scraping lancé… Les vidéos arrivent dans quelques secondes ⏳", { duration: 4000 });
        // Poll every 3s until scrape_status is no longer "running"
        let attempts = 0;
        const maxAttempts = 25; // 75s max
        const poll = setInterval(async () => {
          attempts++;
          try {
            const sr = await fetch(`${API}/social-accounts/${accountId}/scrape-status`, { credentials: "include" });
            if (sr.ok) {
              const sd = await sr.json();
              if (sd.scrape_status !== "running") {
                clearInterval(poll);
                if (sd.scrape_status === "done") {
                  toast.success(sd.scrape_status_message || "Scraping terminé ✓");
                } else if (sd.scrape_status === "error") {
                  const msg = sd.scrape_status_message || "Erreur lors du scraping";
                  toast.error(msg.length > 150 ? msg.substring(0, 150) + "…" : msg, { duration: 10000 });
                }
                // Reload videos
                const vres = await fetch(`${API}/social-accounts/${accountId}/videos`, { credentials: "include" });
                if (vres.ok) {
                  const vdata = await vres.json();
                  setVideosByAccount((prev) => ({ ...prev, [accountId]: vdata.videos || [] }));
                }
                setScrapingAccounts((prev) => { const s = new Set(prev); s.delete(accountId); return s; });
              }
            }
          } catch (_) {}
          if (attempts >= maxAttempts) {
            clearInterval(poll);
            toast.error("Scraping trop long — vérifiez la connexion ou ajoutez les vidéos manuellement.", { duration: 8000 });
            setScrapingAccounts((prev) => { const s = new Set(prev); s.delete(accountId); return s; });
          }
        }, 3000);
      } else {
        // Legacy sync response (if backend was not updated yet)
        toast.success(data.message || "Scraping terminé ✓");
        const vres = await fetch(`${API}/social-accounts/${accountId}/videos`, { credentials: "include" });
        if (vres.ok) {
          const vdata = await vres.json();
          setVideosByAccount((prev) => ({ ...prev, [accountId]: vdata.videos || [] }));
        }
        setScrapingAccounts((prev) => { const s = new Set(prev); s.delete(accountId); return s; });
      }
    } catch (e) {
      toast.error("Erreur de connexion — réessayez ou ajoutez les vidéos manuellement.");
      setScrapingAccounts((prev) => { const s = new Set(prev); s.delete(accountId); return s; });
    }
  };

  const handleAssignAccount = async (campaignId, accountId) => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/social-accounts/${accountId}`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Compte assigné à la campagne");
        fetchCampaignAccounts();
      } else {
        const error = await res.json();
        toast.error(error.detail || "Erreur");
      }
    } catch (error) {
      toast.error("Erreur de connexion");
    }
  };

  const handleAddVideoManually = async (accountId) => {
    if (!manualVideoUrl.trim()) {
      toast.error("Collez l'URL de votre vidéo");
      return;
    }
    setAddingManualVideo(true);
    try {
      const res = await fetch(`${API}/social-accounts/${accountId}/add-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ video_url: manualVideoUrl.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || "Vidéo ajoutée ✓");
        setManualVideoUrl("");
        setManualVideoAccount(null);
        // Reload videos for this account
        const vres = await fetch(`${API}/social-accounts/${accountId}/videos`, { credentials: "include" });
        if (vres.ok) {
          const vdata = await vres.json();
          setVideosByAccount((prev) => ({ ...prev, [accountId]: vdata.videos || [] }));
        }
        setExpandedAccounts((prev) => new Set(prev).add(accountId));
      } else {
        const err = await res.json();
        toast.error(err.detail || "Erreur lors de l'ajout de la vidéo", { duration: 8000 });
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setAddingManualVideo(false);
    }
  };

  const handleRemoveFromCampaign = async (campaignId, accountId) => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/social-accounts/${accountId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Compte retiré de la campagne");
        fetchCampaignAccounts();
      }
    } catch (error) {
      toast.error("Erreur");
    }
  };

  const fmt = fmtViews;
  const platformColor = { tiktok: "#00E5FF", youtube: "#FF0000", instagram: "#FF007F" };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="accounts-page"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Mes comptes</h1>
        <p className="text-white/50">Gérez vos comptes réseaux sociaux</p>
      </div>

      {/* Add account form */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Ajouter un compte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Select value={newPlatform} onValueChange={setNewPlatform}>
              <SelectTrigger className="w-40 bg-white/5 border-white/10 text-white" data-testid="platform-select">
                <SelectValue placeholder="Plateforme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder={
                newPlatform === "tiktok" ? "https://www.tiktok.com/@votre_pseudo" :
                newPlatform === "instagram" ? "https://www.instagram.com/votre_pseudo" :
                newPlatform === "youtube" ? "https://www.youtube.com/@votre_chaine" :
                "https://..."
              }
              className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30"
              data-testid="username-input"
              onKeyDown={(e) => e.key === "Enter" && handleAddAccount()}
            />
            <Button
              onClick={handleAddAccount}
              disabled={isAdding}
              className="bg-[#00E5FF] hover:bg-[#00E5FF]/80 text-black"
              data-testid="add-account-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Compact account rows */}
      {localAccounts.length > 0 && (
        <div className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Mes comptes ({localAccounts.length})</span>
            <span className="text-[10px] text-white/25">Tracking auto toutes les 6h</span>
          </div>
          {localAccounts.map((account, idx) => {
            const color = platformColor[account.platform] || "#00E5FF";
            const isExpanded = expandedAccounts.has(account.account_id);
            const isRefreshing = refreshingAccounts.has(account.account_id);
            const isScraping = scrapingAccounts.has(account.account_id);
            const videos = videosByAccount[account.account_id] || [];
            return (
              <div key={account.account_id} className={idx < localAccounts.length - 1 || isExpanded ? "border-b border-white/6" : ""}>
                {/* Compact row */}
                <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/2 transition-colors">
                  {/* Small avatar */}
                  <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden border"
                    style={{ borderColor: color + "40" }}>
                    {account.avatar_url
                      ? <img src={imgSrc(account.avatar_url)} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-xs font-bold"
                          style={{ background: color + "20", color }}>
                          {account.platform[0].toUpperCase()}
                        </div>
                    }
                  </div>

                  {/* Platform pill + username */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                      style={{ background: color + "20", color }}>
                      {account.platform}
                    </span>
                    <span className="text-white text-sm font-medium truncate">@{account.username}</span>
                    {account.display_name && (
                      <span className="text-white/30 text-xs truncate hidden sm:block">{account.display_name}</span>
                    )}
                  </div>

                  {/* Status + followers */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {account.status === "pending" && (
                      <div className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 border border-yellow-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-yellow-400 text-[10px]">Vérif…</span>
                      </div>
                    )}
                    {account.status === "verified" && (
                      <div className="flex items-center gap-2">
                        <span className="text-[#39FF14] text-[10px] flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" /> OK
                        </span>
                        {account.follower_count != null && (
                          <span className="text-white/35 text-[10px]">{fmt(account.follower_count)} abn</span>
                        )}
                        {videos.length > 0 && (
                          <span className="text-white/25 text-[10px]">{videos.length} vidéo{videos.length > 1 ? "s" : ""}</span>
                        )}
                      </div>
                    )}
                    {account.status === "error" && (
                      <span className="text-red-400 text-[10px] flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" /> Erreur
                      </span>
                    )}
                  </div>

                  {/* Action icon buttons */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {account.status === "verified" && (
                      <>
                        {/* Toggle videos */}
                        <button
                          onClick={() => toggleVideos(account.account_id)}
                          title={isExpanded ? "Masquer les vidéos" : "Voir les vidéos"}
                          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                            isExpanded ? "text-[#00E5FF] bg-[#00E5FF]/10" : "text-white/30 hover:text-white hover:bg-white/10"
                          }`}
                        >
                          <BarChart2 className="w-3 h-3" />
                        </button>
                        {/* Scrape now */}
                        <button
                          onClick={() => handleScrapeNow(account.account_id)}
                          disabled={isScraping}
                          title="Scraper maintenant"
                          className="w-6 h-6 rounded flex items-center justify-center text-white/30 hover:text-[#00E5FF] hover:bg-[#00E5FF]/10 transition-colors disabled:opacity-40"
                        >
                          {isScraping
                            ? <div className="w-2.5 h-2.5 border border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
                            : <TrendingUp className="w-3 h-3" />
                          }
                        </button>
                        {/* Add video manually (all platforms) */}
                        <button
                          onClick={() => {
                            setManualVideoAccount(manualVideoAccount === account.account_id ? null : account.account_id);
                            setExpandedAccounts((prev) => new Set(prev).add(account.account_id));
                          }}
                          title="Ajouter une vidéo manuellement"
                          className="w-6 h-6 rounded flex items-center justify-center text-white/30 hover:text-[#FF007F] hover:bg-[#FF007F]/10 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        {/* Re-verify */}
                        <button
                          onClick={() => handleRefreshAccount(account.account_id)}
                          disabled={isRefreshing}
                          title="Re-vérifier"
                          className="w-6 h-6 rounded flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 text-xs"
                        >
                          ↻
                        </button>
                      </>
                    )}
                    {(account.status === "error" || account.status === "pending") && (
                      <button
                        onClick={() => handleRefreshAccount(account.account_id)}
                        disabled={isRefreshing || account.status === "pending"}
                        title="Réessayer"
                        className="w-6 h-6 rounded flex items-center justify-center text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10 transition-colors disabled:opacity-40 text-xs"
                      >
                        ↻
                      </button>
                    )}
                    {/* Delete */}
                    <button
                      onClick={() => handleDeleteAccount(account.account_id)}
                      title="Supprimer"
                      className="w-6 h-6 rounded flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Expanded videos section */}
                {isExpanded && (
                  <div className="px-4 pb-3 pt-2 bg-white/2">
                    {/* Manual video URL input (all platforms) */}
                    {manualVideoAccount === account.account_id && (
                      <div className="mb-3 p-2.5 rounded-lg bg-[#FF007F]/5 border border-[#FF007F]/20">
                        <p className="text-[#FF007F] text-[10px] font-semibold mb-1.5">
                          📎 Ajouter une vidéo {account.platform === "tiktok" ? "TikTok" : account.platform === "youtube" ? "YouTube" : "Instagram"} manuellement
                        </p>
                        <div className="flex gap-2">
                          <Input
                            value={manualVideoUrl}
                            onChange={(e) => setManualVideoUrl(e.target.value)}
                            placeholder={
                              account.platform === "tiktok"
                                ? "https://www.tiktok.com/@.../video/..."
                                : account.platform === "youtube"
                                ? "https://www.youtube.com/watch?v=... ou https://youtu.be/..."
                                : "https://www.instagram.com/reel/..."
                            }
                            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/20 text-xs h-7"
                            onKeyDown={(e) => e.key === "Enter" && handleAddVideoManually(account.account_id)}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleAddVideoManually(account.account_id)}
                            disabled={addingManualVideo || !manualVideoUrl.trim()}
                            className="bg-[#FF007F]/80 hover:bg-[#FF007F] text-white text-xs h-7 px-3"
                          >
                            {addingManualVideo ? <div className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" /> : "Ajouter"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {videos.length === 0 ? (
                      <div className="flex items-center gap-3 py-2">
                        <p className="text-white/30 text-xs flex-1">Aucune vidéo trackée</p>
                        <button
                          onClick={() => handleScrapeNow(account.account_id)}
                          disabled={isScraping}
                          className="text-[#00E5FF] text-xs hover:underline disabled:opacity-50"
                        >
                          {isScraping ? "Scraping…" : "Lancer le scraping"}
                        </button>
                        <button
                          onClick={() => setManualVideoAccount(manualVideoAccount === account.account_id ? null : account.account_id)}
                          className="text-[#FF007F] text-xs hover:underline"
                        >
                          + Ajouter manuellement
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {videos.map((v) => (
                          <a key={v.video_id || v.platform_video_id} href={v.url} target="_blank" rel="noreferrer"
                            data-video-id={v.video_id || v.platform_video_id}
                            className="group block rounded-lg overflow-hidden bg-white/5 hover:bg-white/10 transition-colors">
                            {v.thumbnail_url ? (
                              <img src={imgSrc(v.thumbnail_url)} alt="" className="w-full aspect-video object-cover" />
                            ) : (
                              <div className="w-full aspect-video bg-white/10 flex items-center justify-center">
                                <Video className="w-4 h-4 text-white/20" />
                              </div>
                            )}
                            <div className="p-1.5">
                              <div className="flex items-center gap-1 text-[10px] text-white/40">
                                <span>👁 {fmt(v.views)}</span>
                                {v.earnings > 0 && <span className="text-[#39FF14]">€{v.earnings.toFixed(2)}</span>}
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Campaign Attribution */}
      <div>
        <h2 className="font-display font-bold text-xl text-white mb-4">Attribution par campagne</h2>
        {campaigns.length === 0 ? (
          <Card className="bg-[#121212] border-white/10">
            <CardContent className="p-8 text-center">
              <p className="text-white/50">Rejoignez une campagne pour attribuer vos comptes</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {campaigns.map((campaign) => {
              const assignedAccounts = campaignAccounts[campaign.campaign_id] || [];
              // All verified accounts not already in THIS campaign
              const verifiedAccounts = localAccounts.filter(
                (a) => a.status === "verified" && !assignedAccounts.find((ca) => ca.account_id === a.account_id)
              );
              // For each, check if it's assigned to another campaign
              const getOtherCampaignName = (accountId) => {
                for (const [cid, accs] of Object.entries(campaignAccounts)) {
                  if (cid === campaign.campaign_id) continue;
                  if (accs.find((ca) => ca.account_id === accountId)) {
                    const c = campaigns.find((x) => x.campaign_id === cid);
                    return c ? c.name : "une autre campagne";
                  }
                }
                return null;
              };
              const freeAccounts = verifiedAccounts.filter((a) => !getOtherCampaignName(a.account_id));
              const busyAccounts = verifiedAccounts.filter((a) => !!getOtherCampaignName(a.account_id));
              return (
                <Card key={campaign.campaign_id} data-campaign-id={campaign.campaign_id} data-campaign-name={campaign.name} className="bg-[#121212] border-white/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white text-lg flex items-center gap-2">
                      <Video className="w-5 h-5 text-[#00E5FF]" />
                      {campaign.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {assignedAccounts.length === 0 ? (
                      <p className="text-white/50 text-sm">Aucun compte assigné</p>
                    ) : (
                      assignedAccounts.map((account) => (
                        <div key={account.account_id}
                          className="flex items-center justify-between p-2 bg-white/5 rounded">
                          <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-[#39FF14]" />
                            <Badge className="bg-white/10 text-white">{account.platform}</Badge>
                            <span className="text-white text-sm">{account.username}</span>
                          </div>
                          <Button variant="ghost" size="sm"
                            onClick={() => handleRemoveFromCampaign(campaign.campaign_id, account.account_id)}
                            className="text-white/50 hover:text-white">
                            Retirer
                          </Button>
                        </div>
                      ))
                    )}
                    {/* Accounts busy on another campaign — shown greyed out */}
                    {busyAccounts.length > 0 && (
                      <div className="space-y-1">
                        {busyAccounts.map((account) => (
                          <div key={account.account_id}
                            className="flex items-center justify-between p-2 bg-white/5 rounded opacity-50 cursor-not-allowed"
                            title={`Déjà utilisé dans « ${getOtherCampaignName(account.account_id)} »`}>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-white/10 text-white/60">{account.platform}</Badge>
                              <span className="text-white/60 text-sm">{account.username}</span>
                              <span className="text-white/40 text-xs">— déjà dans « {getOtherCampaignName(account.account_id)} »</span>
                            </div>
                            <span className="text-xs text-yellow-400/70">Occupé</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {freeAccounts.length > 0 && (
                      <Select onValueChange={(accountId) => handleAssignAccount(campaign.campaign_id, accountId)}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white"
                          data-testid={`assign-account-${campaign.campaign_id}`}>
                          <SelectValue placeholder="+ Ajouter un compte" />
                        </SelectTrigger>
                        <SelectContent>
                          {freeAccounts.map((account) => (
                            <SelectItem key={account.account_id} value={account.account_id}>
                              {account.platform} — {account.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {freeAccounts.length === 0 && busyAccounts.length === 0 && verifiedAccounts.length === 0 && (
                      <p className="text-white/30 text-xs">Tous vos comptes vérifiés sont déjà assignés ici.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Campaign Dashboard
function CampaignDashboard({ campaigns, clipperStats }) {
  const location = useLocation();
  const campaignId = location.pathname.split("/")[3];
  const campaign = campaigns.find((c) => c.campaign_id === campaignId);
  const [clickLink, setClickLink] = useState(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clickStats, setClickStats] = useState(null);
  const [clickPeriod, setClickPeriod] = useState("30d");
  const [viewsTimeline, setViewsTimeline] = useState(null);
  const [viewsPeriod, setViewsPeriod] = useState("30");
  const [viewsLoading, setViewsLoading] = useState(false);
  const [myVideos, setMyVideos] = useState([]);
  const [topClips, setTopClips] = useState([]);
  const [topClipsLoading, setTopClipsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [leavingCampaign, setLeavingCampaign] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const navigate = useNavigate();
  // Period stats (mes données uniquement)
  const [periodStats, setPeriodStats] = useState(null);
  const [periodSel, setPeriodSel] = useState("30d");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [periodLoading, setPeriodLoading] = useState(false);

  const fetchMyPeriodStats = async (p = periodSel, off = periodOffset) => {
    setPeriodLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/my-period-stats?period=${p}&offset=${off}`, { credentials: "include" });
      if (res.ok) setPeriodStats(await res.json());
    } catch {}
    finally { setPeriodLoading(false); }
  };

  useEffect(() => {
    if (campaignId && activeTab === "overview") fetchMyPeriodStats(periodSel, periodOffset);
    // eslint-disable-next-line
  }, [campaignId, activeTab, periodSel, periodOffset]);

  // Stats perso depuis le parent (déjà fetchées)
  const myStats = clipperStats?.campaign_stats?.find((s) => s.campaign_id === campaignId);
  const isClickCampaign = campaign?.payment_model === "clicks";
  const budgetTotal = campaign?.budget_total || 0;
  const budgetUsed = campaign?.budget_used || 0;
  const budgetUnlimited = campaign?.budget_unlimited;
  const budgetLeft = Math.max(0, budgetTotal - budgetUsed);

  useEffect(() => {
    if (!campaignId) return;
    if (isClickCampaign) { fetchClickLink(); fetchClickStats("30d"); }
    else { fetchViewsTimeline("30"); }
    fetchMyVideos();
    fetchTopClips();
    // Auto-refresh Clip Winner every 5 minutes
    const interval = setInterval(fetchTopClips, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [campaignId, isClickCampaign]);

  const fetchMyVideos = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/my-videos`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setMyVideos(d.videos || []); }
    } catch {}
  };

  const fetchTopClips = async () => {
    setTopClipsLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/top-clips?limit=10`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setTopClips(d.clips || []); }
    } catch {}
    finally { setTopClipsLoading(false); }
  };

  const fetchViewsTimeline = async (d = viewsPeriod) => {
    setViewsLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/my-views-chart?days=${d}`, { credentials: "include" });
      if (res.ok) setViewsTimeline(await res.json());
    } catch {}
    finally { setViewsLoading(false); }
  };

  const fetchClickStats = async (p = clickPeriod) => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/click-stats?period=${p}`, { credentials: "include" });
      if (res.ok) setClickStats(await res.json());
    } catch {}
  };

  const fetchClickLink = async () => {
    setLoadingLink(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/my-click-link`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setClickLink(data);
      }
    } catch {}
    finally { setLoadingLink(false); }
  };

  const handleCopy = () => {
    if (!clickLink?.tracking_url) return;
    navigator.clipboard.writeText(clickLink.tracking_url).then(() => {
      setCopied(true);
      toast.success("Lien copié !");
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleLeaveCampaign = async () => {
    setLeavingCampaign(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/leave`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Vous avez quitté la campagne");
        setShowLeaveConfirm(false);
        navigate("/clipper/discover");
      } else {
        const err = await res.json();
        toast.error(err.detail || "Impossible de quitter la campagne");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setLeavingCampaign(false);
    }
  };

  const handleGenerateLink = async () => {
    setGeneratingLink(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/generate-my-link`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setClickLink(data);
        toast.success("Lien de tracking généré !");
      } else {
        const err = await res.json();
        toast.error(err.detail || "Impossible de générer le lien");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setGeneratingLink(false);
    }
  };

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-white/50">Campagne non trouvée</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
      data-testid="campaign-dashboard"
    >
      {/* Leave confirmation modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a1a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-white font-bold text-lg">Quitter la campagne ?</h3>
            <p className="text-white/60 text-sm">
              Vous quitterez définitivement <strong className="text-white">{campaign.name}</strong>.
              Vos vidéos trackées et gains seront conservés, mais vous ne pourrez plus poster pour cette campagne.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleLeaveCampaign}
                disabled={leavingCampaign}
                className="flex-1 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-colors text-sm font-semibold disabled:opacity-50"
              >
                {leavingCampaign ? "En cours…" : "Quitter"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-display font-bold text-3xl text-white">{campaign.name}</h1>
            {isClickCampaign && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#f0c040]/15 text-[#f0c040] border border-[#f0c040]/25 font-medium">
                <MousePointerClick className="w-3 h-3" /> Campagne au clic
              </span>
            )}
          </div>
          <p className="text-white/50">Votre tableau de bord pour cette campagne</p>
        </div>
        <button
          onClick={() => setShowLeaveConfirm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-medium"
        >
          <X className="w-3.5 h-3.5" /> Quitter
        </button>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-white/8 pb-0">
        {[
          { id: "overview", label: "Vue d'ensemble", icon: "📊" },
          { id: "mes-videos", label: "Mes vidéos", icon: "🎬" },
          { id: "clip-winner", label: "Clip Winner", icon: "🏆" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
              activeTab === tab.id
                ? "border-[#00E5FF] text-[#00E5FF]"
                : "border-transparent text-white/40 hover:text-white/70"
            }`}>
            <span>{tab.icon}</span>{tab.label}
            {tab.id === "mes-videos" && myVideos.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 text-[10px]">{myVideos.length}</span>
            )}
            {tab.id === "clip-winner" && topClips.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#f0c040]/20 text-[#f0c040] text-[10px]">{topClips.length}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab !== "overview" && activeTab !== "mes-videos" && activeTab !== "clip-winner" && null}

      {/* ══════ ONGLET MES VIDÉOS ══════ */}
      {activeTab === "mes-videos" && (
        <div className="space-y-4">
          {myVideos.length === 0 ? (
            <div className="bg-[#121212] border border-white/10 rounded-xl p-10 text-center">
              <p className="text-4xl mb-3">🎬</p>
              <p className="text-white/40 text-sm">Aucune vidéo trackée pour l'instant</p>
              <p className="text-white/20 text-xs mt-1">Tes vidéos apparaîtront ici après le prochain tracking (toutes les 6h)</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {myVideos.map(vid => (
                <a key={vid.video_id} href={vid.url} target="_blank" rel="noopener noreferrer"
                  className="group bg-[#121212] border border-white/10 rounded-xl overflow-hidden hover:border-white/25 transition-all">
                  <div className="aspect-video relative bg-black overflow-hidden">
                    {vid.thumbnail_url
                      ? <img src={vid.thumbnail_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      : <div className="w-full h-full flex items-center justify-center text-2xl">{vid.platform === "tiktok" ? "🎵" : vid.platform === "instagram" ? "📸" : "▶️"}</div>
                    }
                    <div className="absolute top-2 left-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: vid.platform === "tiktok" ? "#00E5FF20" : vid.platform === "instagram" ? "#FF007F20" : "#FF000020",
                                 color: vid.platform === "tiktok" ? "#00E5FF" : vid.platform === "instagram" ? "#FF007F" : "#FF4444" }}>
                        {vid.platform === "tiktok" ? "TikTok" : vid.platform === "instagram" ? "Instagram" : "YouTube"}
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-white text-xs font-medium line-clamp-2 mb-2">{vid.title || "Sans titre"}</p>
                    <div className="flex items-center justify-between text-[10px] text-white/40">
                      <span>👁 {vid.views >= 1000000 ? `${(vid.views/1000000).toFixed(1)}M` : vid.views >= 1000 ? `${Math.round(vid.views/1000)}K` : vid.views}</span>
                      <span className="text-[#39FF14]">€{(vid.earnings || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════ ONGLET CLIP WINNER ══════ */}
      {activeTab === "clip-winner" && (
        <ClipWinnerTab clips={topClips} loading={topClipsLoading} onRefresh={fetchTopClips} accentColor="#00E5FF" />
      )}

      {/* ══════ ONGLET OVERVIEW ══════ */}
      {activeTab === "overview" && (<>

      {/* ═══ Stats par période (mes données uniquement) ═══ */}
      {(() => {
        const PERIODS = [["24h","24h"],["7d","7j"],["30d","30j"],["year","An"],["all","Tout"]];
        const canPrev = periodSel !== "all";
        const canNext = periodOffset > 0;
        return (
          <div className="bg-[#121212] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-white font-medium text-sm">Mes stats par période</p>
                <p className="text-xs text-white/40 mt-0.5">{periodStats?.period_label || "Sélectionnez une période"}{periodOffset > 0 ? ` (il y a ${periodOffset} période${periodOffset > 1 ? "s" : ""})` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => canPrev && setPeriodOffset(o => o + 1)} disabled={!canPrev}
                  title="Période précédente"
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all">‹</button>
                <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5 gap-0.5">
                  {PERIODS.map(([val, label]) => (
                    <button key={val} onClick={() => { setPeriodSel(val); setPeriodOffset(0); }}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${periodSel === val ? "bg-[#00E5FF] text-black" : "text-white/50 hover:text-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <button onClick={() => canNext && setPeriodOffset(o => Math.max(0, o - 1))} disabled={!canNext}
                  title="Période suivante"
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all">›</button>
                {periodLoading && <div className="w-4 h-4 border-2 border-[#00E5FF]/30 border-t-[#00E5FF] rounded-full animate-spin ml-1" />}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-white/40 mb-1">Mes vues</p>
                <p className="text-xl font-bold font-mono text-[#00E5FF]">{fmtViews(periodStats?.views || 0)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-white/40 mb-1">Mes gains</p>
                <p className="text-xl font-bold font-mono text-[#39FF14]">€{(periodStats?.earnings || 0).toFixed(2)}</p>
              </div>
              {periodStats?.payment_model === "clicks" && (
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-xs text-white/40 mb-1">Mes clics</p>
                  <p className="text-xl font-bold font-mono text-[#FF007F]">{fmtViews(periodStats?.clicks || 0)}</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ═══ LIEN DE TRACKING — visible uniquement pour campagnes au clic ═══ */}
      {isClickCampaign && (
        <div className="rounded-2xl border border-[#f0c040]/30 bg-[#f0c040]/6 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-[#f0c040]" />
            <h2 className="text-[#f0c040] font-bold text-base">Ton lien de tracking personnalisé</h2>
          </div>
          <p className="text-white/50 text-sm">
            Mets ce lien dans ta bio TikTok / Instagram / YouTube. Chaque clic unique est comptabilisé et rémunéré{" "}
            <strong className="text-[#f0c040]">€{campaign.rate_per_click || 0} / 1 000 clics</strong>.
          </p>

          {loadingLink ? (
            <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
          ) : clickLink?.tracking_url ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[#0A0A0A] border border-white/10 rounded-xl px-4 py-2.5 font-mono text-sm text-white/80 truncate select-all">
                {clickLink.tracking_url}
              </div>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#f0c040] hover:bg-[#f0c040]/90 text-black font-bold text-sm transition-all"
              >
                {copied ? <><Check className="w-4 h-4" /> Copié</> : <><Copy className="w-4 h-4" /> Copier</>}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-white/40 text-sm flex-1">Ton lien de tracking n'a pas encore été généré.</p>
              <button
                onClick={handleGenerateLink}
                disabled={generatingLink}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#f0c040]/20 hover:bg-[#f0c040]/30 border border-[#f0c040]/40 text-[#f0c040] font-bold text-sm transition-all disabled:opacity-50"
              >
                {generatingLink
                  ? <><div className="w-4 h-4 border-2 border-[#f0c040]/30 border-t-[#f0c040] rounded-full animate-spin" /> Génération...</>
                  : <><Link2 className="w-4 h-4" /> Générer mon lien</>
                }
              </button>
            </div>
          )}

          {/* Destination */}
          {clickLink?.destination_url && (
            <p className="text-xs text-white/30">
              Redirige vers : <span className="text-white/50">{clickLink.destination_url}</span>
            </p>
          )}
        </div>
      )}

      {/* Stats cards */}
      {isClickCampaign ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-[#121212] border-white/10">
            <CardContent className="p-6">
              <p className="text-sm text-white/50 mb-1">Clics totaux</p>
              <p className="font-mono font-bold text-3xl text-white">
                {(clickLink?.click_count ?? myStats?.clicks ?? 0).toLocaleString("fr-FR")}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-[#121212] border-white/10">
            <CardContent className="p-6">
              <p className="text-sm text-white/50 mb-1">Clics uniques</p>
              <p className="font-mono font-bold text-3xl text-[#f0c040]">
                {(clickLink?.unique_click_count ?? myStats?.unique_clicks ?? 0).toLocaleString("fr-FR")}
              </p>
              <p className="text-xs text-white/30 mt-1">Facturables</p>
            </CardContent>
          </Card>
          <Card className="bg-[#121212] border-white/10">
            <CardContent className="p-6">
              <p className="text-sm text-white/50 mb-1">Gains générés</p>
              <p className="font-mono font-bold text-3xl text-[#00E5FF]">
                €{(clickLink?.earnings ?? myStats?.earnings ?? 0).toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-[#121212] border-white/10">
            <CardContent className="p-5">
              <p className="text-xs text-white/50 mb-1">Classement</p>
              <p className="font-mono font-bold text-2xl text-white">#{myStats?.rank || "-"}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#121212] border-white/10">
            <CardContent className="p-5">
              <p className="text-xs text-white/50 mb-1">Mes vues</p>
              <p className="font-mono font-bold text-2xl text-white">{fmtViews(myStats?.views || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#121212] border-white/10">
            <CardContent className="p-5">
              <p className="text-xs text-white/50 mb-1">Mes gains</p>
              <p className="font-mono font-bold text-2xl text-[#00E5FF]">€{(myStats?.earnings || 0).toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#121212] border-white/10">
            <CardContent className="p-5">
              <p className="text-xs text-white/50 mb-1">Budget restant</p>
              {budgetUnlimited
                ? <p className="font-mono font-bold text-2xl text-[#39FF14]">Illimité</p>
                : <>
                    <p className="font-mono font-bold text-2xl text-[#f0c040]">€{budgetLeft.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                    <div className="mt-1.5 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-[#f0c040] rounded-full transition-all"
                        style={{ width: `${Math.min(100, budgetTotal > 0 ? (budgetUsed / budgetTotal) * 100 : 0)}%` }} />
                    </div>
                  </>
              }
            </CardContent>
          </Card>
        </div>
      )}

      {/* Click chart — only for click campaigns */}
      {isClickCampaign && (
        <Card className="bg-[#121212] border-white/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <MousePointerClick className="w-4 h-4 text-[#f0c040]" /> Tes clics dans le temps
              </CardTitle>
              {/* Period pills */}
              <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5 gap-0.5">
                {[{ id: "1d", label: "1j" }, { id: "7d", label: "7j" }, { id: "30d", label: "30j" }, { id: "all", label: "Tout" }].map(p => (
                  <button key={p.id}
                    onClick={() => { setClickPeriod(p.id); fetchClickStats(p.id); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${clickPeriod === p.id ? "bg-[#f0c040] text-black" : "text-white/40 hover:text-white"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {clickStats?.chart?.some(d => d.clicks > 0) ? (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={clickStats.chart} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="myClicksGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f0c040" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f0c040" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="myUniqueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#00E5FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9 }} tickLine={false} axisLine={false}
                    interval={Math.max(0, Math.floor((clickStats.chart?.length || 1) / 8) - 1)} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                    formatter={(v, name) => [v.toLocaleString("fr-FR"), name === "clicks" ? "Clics" : "Clics uniques"]} />
                  <Area type="monotone" dataKey="clicks" stroke="#f0c040" strokeWidth={2} fill="url(#myClicksGrad)" dot={false} />
                  <Area type="monotone" dataKey="unique_clicks" stroke="#00E5FF" strokeWidth={1.5} fill="url(#myUniqueGrad)" dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-32 flex items-center justify-center">
                <p className="text-white/20 text-sm">Aucun clic enregistré sur cette période</p>
              </div>
            )}
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#f0c040]" /><span className="text-white/30 text-xs">Tous tes clics</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-[#00E5FF]" style={{ borderTop: "1.5px dashed #00E5FF", height: 0 }} /><span className="text-white/30 text-xs">Clics uniques</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strikes */}
      {myStats?.strikes > 0 && (
        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">
              Tu as {myStats.strikes} strike(s) actif(s) sur cette campagne
            </span>
          </CardContent>
        </Card>
      )}

      {/* Views chart — campagnes au view uniquement */}
      {!isClickCampaign && (
        <Card className="bg-[#121212] border-white/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#00E5FF]" /> Tes vues par jour
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Period selector + flèches */}
                {(() => {
                  const PL = [["7","7j"],["30","30j"],["90","90j"],["365","1an"]];
                  const idx = PL.findIndex(([v]) => v === viewsPeriod);
                  const go = (v) => { setViewsPeriod(v); fetchViewsTimeline(v); };
                  return (
                    <div className="flex items-center gap-1">
                      <button onClick={() => idx > 0 && go(PL[idx-1][0])} disabled={idx === 0}
                        className="w-6 h-6 flex items-center justify-center rounded text-sm font-bold text-white/40 hover:text-white disabled:opacity-20 transition-all">‹</button>
                      <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5 gap-0.5">
                        {PL.map(([val, label]) => (
                          <button key={val} onClick={() => go(val)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewsPeriod === val ? "bg-[#00E5FF]/20 text-[#00E5FF]" : "text-white/40 hover:text-white"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => idx < PL.length-1 && go(PL[idx+1][0])} disabled={idx === PL.length-1}
                        className="w-6 h-6 flex items-center justify-center rounded text-sm font-bold text-white/40 hover:text-white disabled:opacity-20 transition-all">›</button>
                    </div>
                  );
                })()}
                {viewsLoading && <div className="w-4 h-4 border-2 border-[#00E5FF]/30 border-t-[#00E5FF] rounded-full animate-spin" />}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {(() => {
              const tlData = (viewsTimeline?.timeline || []).map(d => ({
                ...d,
                label: new Date(d.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
              }));
              const hasData = tlData.some(d => d.views > 0);
              return hasData ? (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={tlData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="myViewsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#00E5FF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9 }} tickLine={false} axisLine={false}
                      interval={Math.max(0, Math.floor(tlData.length / 8) - 1)} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9 }} tickLine={false} axisLine={false}
                      tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v/1000)}K` : v} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: "white" }}
                      formatter={(v) => [v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(1)}K` : v.toLocaleString("fr-FR"), "Nouvelles vues"]}
                    />
                    <Area type="monotone" dataKey="views" stroke="#00E5FF" strokeWidth={2} fill="url(#myViewsGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-36 flex items-center justify-center">
                  {viewsLoading
                    ? <div className="w-6 h-6 border-2 border-[#00E5FF]/30 border-t-[#00E5FF] rounded-full animate-spin" />
                    : <p className="text-white/20 text-sm">Aucune vue encore — les données apparaissent après le prochain tracking (toutes les 6h)</p>
                  }
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Détails campagne */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-base">Détails de la campagne</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {isClickCampaign ? (
              <>
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Tarif</p>
                  <p className="font-mono text-lg text-[#f0c040]">€{campaign.rate_per_click || 0}<span className="text-xs text-white/40"> / 1K clics</span></p>
                </div>
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Comptage</p>
                  <p className="text-sm text-white">{campaign.unique_clicks_only ? "Clics uniques" : "Tous les clics"}</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">RPM</p>
                  <p className="font-mono text-lg text-white">€{campaign.rpm || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Min. vues payout</p>
                  <p className="font-mono text-lg text-white">{campaign.min_view_payout || "-"}</p>
                </div>
              </>
            )}
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Statut</p>
              <p className="text-sm text-white capitalize">{myStats?.status || "actif"}</p>
            </div>
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Plateformes</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {(campaign.platforms || []).map((p) => (
                  <Badge key={p} variant="outline" className="text-xs border-white/20 text-white/60">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      </>)}
    </motion.div>
  );
}

// ─── Clip Winner Tab (composant partagé) ─────────────────────────────────────
function ClipWinnerTab({ clips, loading, onRefresh, accentColor = "#f0c040" }) {
  const fmtV = (n) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n/1000)}K` : (n||0).toString();
  const engagementRate = (clip) => {
    if (!clip.views || clip.views === 0) return "—";
    const eng = ((clip.likes || 0) + (clip.comments || 0)) / clip.views * 100;
    return eng.toFixed(1) + "%";
  };
  const platIcon = { tiktok: "🎵", instagram: "📸", youtube: "▶️" };
  const medalColors = ["#FFD700", "#C0C0C0", "#CD7F32"];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <h2 className="text-white font-semibold">Top 10 clips de la campagne</h2>
          <span className="text-xs text-white/30">· auto-refresh toutes les 5 min</span>
        </div>
        <button onClick={onRefresh} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white text-xs transition-all disabled:opacity-40">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </div>

      {loading && clips.length === 0 ? (
        <div className="bg-[#121212] border border-white/10 rounded-xl p-10 text-center">
          <div className="w-6 h-6 border-2 border-white/10 border-t-white/50 rounded-full animate-spin mx-auto" />
        </div>
      ) : clips.length === 0 ? (
        <div className="bg-[#121212] border border-white/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">🏆</p>
          <p className="text-white/40 text-sm">Aucun clip encore — le classement apparaîtra dès les premières vues</p>
        </div>
      ) : (
        <div className="space-y-2">
          {clips.map((clip, i) => {
            const eng = engagementRate(clip);
            const borderCol = i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : "rgba(255,255,255,0.08)";
            return (
              <div key={clip.video_id || i}
                className="flex items-center gap-4 bg-[#121212] rounded-xl p-3 overflow-hidden"
                style={{ border: `1px solid ${borderCol}` }}>

                {/* Rang — grand chiffre */}
                <div className="w-10 flex-shrink-0 text-center">
                  {i < 3
                    ? <span className="text-2xl leading-none" style={{ color: medalColors[i] }}>
                        {i + 1}
                      </span>
                    : <span className="text-lg font-bold text-white/25">#{i + 1}</span>
                  }
                </div>

                {/* Thumbnail — grand, cliquable */}
                <a href={clip.url} target="_blank" rel="noopener noreferrer"
                  className="relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden bg-white/5 group cursor-pointer">
                  {clip.thumbnail_url
                    ? <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                    : <div className="w-full h-full flex items-center justify-center text-2xl">{platIcon[clip.platform] || "🎬"}</div>
                  }
                  {/* Overlay play */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <svg className="w-6 h-6 text-white drop-shadow" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                  {/* Platform badge */}
                  <span className="absolute bottom-1 left-1 text-[9px] font-bold px-1 py-0.5 rounded"
                    style={{ background: clip.platform === "tiktok" ? "#00E5FFcc" : clip.platform === "instagram" ? "#FF007Fcc" : "#FF4444cc", color: "#000" }}>
                    {clip.platform}
                  </span>
                </a>

                {/* Titre court */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate max-w-[180px]">
                    {clip.title ? clip.title.slice(0, 40) + (clip.title.length > 40 ? "…" : "") : "—"}
                  </p>
                  <p className="text-white/30 text-xs truncate mt-0.5">{clip.clipper_name || "—"}</p>
                </div>

                {/* Stats : vues · likes · audience qualifiée */}
                <div className="flex-shrink-0 flex gap-4 items-center">
                  <div className="text-center">
                    <p className="font-mono font-bold text-white text-sm">{fmtV(clip.views || 0)}</p>
                    <p className="text-[10px] text-white/30">vues</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono font-bold text-[#FF007F] text-sm">{fmtV(clip.likes || 0)}</p>
                    <p className="text-[10px] text-white/30">likes</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono font-bold text-sm" style={{ color: accentColor }}>{eng}</p>
                    <p className="text-[10px] text-white/30">audience</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Payment Page
function PaymentPage({ stats }) {
  const { user } = useAuth();
  const parsePaymentInfo = (raw) => {
    try { const p = JSON.parse(raw || "{}"); return { iban: p.iban || "", nom: p.nom || "", bic: p.bic || "" }; } catch { return { iban: raw || "", nom: "", bic: "" }; }
  };
  const [bankInfo, setBankInfo] = useState(parsePaymentInfo(user?.payment_info));
  const [savingInfo, setSavingInfo] = useState(false);
  const [campaignSummaries, setCampaignSummaries] = useState({});
  const [clickLinks, setClickLinks] = useState({});   // { [campaign_id]: link }
  const [copiedLinkId, setCopiedLinkId] = useState(null);

  useEffect(() => {
    if (stats?.campaign_stats) {
      stats.campaign_stats.forEach(cs => {
        fetchCampaignSummary(cs.campaign_id);
        fetchMyClickLink(cs.campaign_id);
      });
    }
  }, [stats]);

  const fetchCampaignSummary = async (campaignId) => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/payment-summary`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCampaignSummaries(prev => ({ ...prev, [campaignId]: data }));
      }
    } catch {}
  };

  const fetchMyClickLink = async (campaignId) => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/my-click-link`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setClickLinks(prev => ({ ...prev, [campaignId]: data }));
      }
    } catch {}
    // 404 = not a click campaign — silently ignored
  };

  const handleCopyLink = (url, id) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLinkId(id);
      setTimeout(() => setCopiedLinkId(null), 2000);
      toast.success("Lien copié !");
    });
  };

  const handleSavePaymentInfo = async () => {
    setSavingInfo(true);
    try {
      const res = await fetch(`${API}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ payment_info: JSON.stringify(bankInfo) }),
      });
      if (res.ok) toast.success("Coordonnées de paiement sauvegardées ✓");
      else toast.error("Erreur");
    } catch { toast.error("Erreur de connexion"); }
    finally { setSavingInfo(false); }
  };

  const fmt = fmtViews;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8" data-testid="payment-page">
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Paiement</h1>
        <p className="text-white/50">Vos gains et ce que l'agence vous doit</p>
      </div>

      {/* Total banner */}
      <Card className="bg-[#121212] border-[#f0c040]/30">
        <CardContent className="p-5 sm:p-8 text-center">
          <p className="text-xs sm:text-sm text-white/50 mb-1 sm:mb-2">Total généré (toutes campagnes)</p>
          <p className="font-mono font-black text-3xl sm:text-4xl lg:text-5xl text-[#f0c040] break-all">
            €{stats?.total_earnings?.toFixed(2) || "0.00"}
          </p>
        </CardContent>
      </Card>

      {/* Coordonnées bancaires */}
      <Card className="bg-[#121212] border-[#f0c040]/20">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#f0c040]" />
            Vos coordonnées bancaires
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-white/40">Ces informations sont transmises à l'agence pour qu'elle puisse vous virer directement. Elles ne sont jamais partagées avec d'autres parties.</p>
          <div className="grid gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-1.5 font-medium uppercase tracking-wide">Nom du titulaire <span className="text-red-400">*</span></label>
              <Input
                value={bankInfo.nom}
                onChange={(e) => setBankInfo(prev => ({ ...prev, nom: e.target.value }))}
                placeholder="Ex: Jean Dupont (tel qu'il apparaît sur votre compte)"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
              />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1.5 font-medium uppercase tracking-wide">IBAN <span className="text-red-400">*</span></label>
              <Input
                value={bankInfo.iban}
                onChange={(e) => setBankInfo(prev => ({ ...prev, iban: e.target.value.toUpperCase() }))}
                placeholder="Ex: FR76 3000 6000 0112 3456 7890 189"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1.5 font-medium uppercase tracking-wide">BIC / SWIFT <span className="text-red-400">*</span></label>
              <Input
                value={bankInfo.bic}
                onChange={(e) => setBankInfo(prev => ({ ...prev, bic: e.target.value.toUpperCase() }))}
                placeholder="Ex: BNPAFRPP"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 font-mono"
              />
            </div>
          </div>
          <Button onClick={handleSavePaymentInfo} disabled={savingInfo || (!bankInfo.iban && !bankInfo.nom)}
            className="w-full bg-[#f0c040] hover:bg-[#f0c040]/80 text-black font-semibold">
            {savingInfo ? "Enregistrement…" : "Sauvegarder mes coordonnées bancaires"}
          </Button>
          {bankInfo.iban && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-green-400 text-xs font-medium">✓ Coordonnées enregistrées — l'agence peut vous virer</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Par campagne */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Détail par campagne</CardTitle>
        </CardHeader>
        <CardContent>
          {!stats?.campaign_stats || stats.campaign_stats.length === 0 ? (
            <p className="text-white/50 text-center py-8">Rejoignez une campagne pour voir vos gains</p>
          ) : (
            <div className="space-y-3">
              {stats.campaign_stats.map((cs) => {
                const summary = campaignSummaries[cs.campaign_id];
                const isClickModel = summary?.payment_model === "clicks";
                const myLink = clickLinks[cs.campaign_id];
                return (
                  <div key={cs.campaign_id} className="p-4 bg-white/5 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-white font-medium">{cs.campaign_name}</p>
                          {isClickModel && (
                            <span className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full bg-[#f0c040]/15 text-[#f0c040] border border-[#f0c040]/25 font-medium">
                              <MousePointerClick className="w-2.5 h-2.5" /> Au clic
                            </span>
                          )}
                        </div>
                        {isClickModel
                          ? <p className="text-xs text-white/40">{(summary?.clicks || 0).toLocaleString("fr-FR")} clics · {(summary?.unique_clicks || 0).toLocaleString("fr-FR")} uniques</p>
                          : <p className="text-xs text-white/40">{fmt(cs.views)} vues</p>
                        }
                      </div>
                      <p className="font-mono font-bold text-[#00E5FF] text-lg">€{cs.earnings?.toFixed(2)}</p>
                    </div>

                    {/* Lien bio pour campagnes au clic */}
                    {isClickModel && myLink?.tracking_url && (
                      <div className="p-3 rounded-xl bg-[#f0c040]/8 border border-[#f0c040]/20 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5 text-[#f0c040]" />
                          <p className="text-[#f0c040] text-xs font-semibold">Ton lien de tracking bio</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="flex-1 font-mono text-xs text-white/70 bg-black/30 rounded-lg px-3 py-2 truncate">
                            {myLink.tracking_url}
                          </p>
                          <button
                            onClick={() => handleCopyLink(myLink.tracking_url, myLink.link_id)}
                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#f0c040] hover:bg-[#f0c040]/90 text-black text-xs font-bold transition-all"
                          >
                            {copiedLinkId === myLink.link_id
                              ? <><Check className="w-3 h-3" /> Copié</>
                              : <><Copy className="w-3 h-3" /> Copier</>
                            }
                          </button>
                        </div>
                        <p className="text-white/30 text-[10px]">
                          Mets ce lien dans ta bio TikTok, Instagram, YouTube. Chaque clic est comptabilisé.
                        </p>
                        <div className="flex gap-3 pt-0.5">
                          <div className="flex items-center gap-1.5">
                            <MousePointerClick className="w-3 h-3 text-white/30" />
                            <span className="text-xs text-white/50">{(myLink.click_count || 0).toLocaleString("fr-FR")} clics total</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Eye className="w-3 h-3 text-[#00E5FF]/50" />
                            <span className="text-xs text-[#00E5FF]/70">{(myLink.unique_click_count || 0).toLocaleString("fr-FR")} uniques</span>
                          </div>
                          {myLink.rate_per_click > 0 && (
                            <div className="flex items-center gap-1.5">
                              <DollarSign className="w-3 h-3 text-[#f0c040]/50" />
                              <span className="text-xs text-[#f0c040]/70">€{myLink.rate_per_click} / 1K clics</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Gains / paiements */}
                    {summary && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white/5 rounded-lg p-3 text-center">
                          <p className="text-xs text-white/40 mb-1">Déjà payé</p>
                          <p className="font-mono font-bold text-[#39FF14]">€{summary.paid?.toFixed(2) || "0.00"}</p>
                        </div>
                        <div className={`rounded-lg p-3 text-center border ${summary.owed > 0 ? "bg-[#f0c040]/10 border-[#f0c040]/30" : "bg-[#39FF14]/5 border-[#39FF14]/20"}`}>
                          <p className="text-xs text-white/40 mb-1">À recevoir</p>
                          <p className={`font-mono font-bold ${summary.owed > 0 ? "text-[#f0c040]" : "text-[#39FF14]"}`}>
                            {summary.owed > 0 ? `€${summary.owed.toFixed(2)}` : "✓ À jour"}
                          </p>
                        </div>
                      </div>
                    )}
                    {summary?.last_payment && (
                      <p className="text-xs text-white/30 flex items-center gap-1">
                        <Check className="w-3 h-3 text-[#39FF14]" />
                        Dernier virement reçu : €{summary.last_payment.amount_eur?.toFixed(2)} le {new Date(summary.last_payment.confirmed_at).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                  </div>
                );
              })}
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
  const [picturePreview, setPicturePreview] = useState(user?.picture || null);
  const [pictureBase64, setPictureBase64] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

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
      const body = { display_name: displayName };
      if (pictureBase64) body.picture = pictureBase64;
      const res = await fetch(`${API}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success("Profil mis à jour");
      }
    } catch (error) {
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="settings-page"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Paramètres</h1>
        <p className="text-white/50">Gérez votre profil</p>
      </div>

      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Photo de profil */}
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 border border-white/10">
              {picturePreview
                ? <img src={picturePreview} alt="" className="w-full h-full object-cover" />
                : <span className="text-white/40 font-bold text-2xl">{displayName?.[0] || "?"}</span>}
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
            <label className="block text-sm text-white/70 mb-2">Pseudo</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
              data-testid="display-name-settings"
            />
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-2">Email</label>
            <Input value={user?.email || ""} disabled className="bg-white/5 border-white/10 text-white/50" />
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="bg-[#f0c040] hover:bg-[#f0c040]/90 text-black font-semibold" data-testid="save-settings-btn">
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-[#121212] border-white/10">
        <CardContent className="p-6">
          <Button variant="outline" onClick={logout} className="border-red-500/30 text-red-400 hover:bg-red-500/10" data-testid="logout-btn">
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

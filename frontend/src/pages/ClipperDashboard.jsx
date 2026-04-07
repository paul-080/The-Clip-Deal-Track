import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useAuth, API } from "../App";
import Sidebar from "../components/Sidebar";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Home, Search, Smartphone, CreditCard, Settings, MessageCircle,
  Video, TrendingUp, Eye, DollarSign, Plus, Trash2, Check, X, AlertTriangle,
  Heart, Share2, BarChart2, Link2, ChevronRight
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import ChatPanel from "../components/ChatPanel";

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

  useEffect(() => {
    fetchData();
  }, []);

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
        },
      ],
    })),
    { type: "divider" },
    { id: "payment", label: "Paiement", icon: CreditCard, path: "/clipper/payment" },
    { id: "settings", label: "Paramètres", icon: Settings, path: "/clipper/settings" },
  ];

  return (
    <div className="flex min-h-screen bg-[#0A0A0A]">
      <Sidebar 
        items={sidebarItems} 
        accentColor={ACCENT_COLOR}
        role="clipper"
      />
      <main className="flex-1 ml-64 p-8">
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
          <Route path="campaign/:campaignId" element={<CampaignDashboard campaigns={campaigns} />} />
          <Route path="campaign/:campaignId/chat" element={<ChatPanel campaigns={campaigns} />} />
          <Route path="payment" element={<PaymentPage stats={stats} />} />
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

  useEffect(() => { setFeed(initialAnnouncements); }, [initialAnnouncements]);

  const reloadFeed = async () => {
    try {
      const r = await fetch(`${API}/announcements`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setFeed(d.announcements || []); }
    } catch {}
  };

  const DEMO_POST = {
    announcement_id: "demo1",
    agency: { display_name: "Clip Factory", handle: "@clipfactory" },
    campaign_name: "MONEY BY CLIPPING",
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    title: "Nouvelle campagne disponible 🔥",
    content: "- Niche Trading/Lifestyle\n- 1.2$/1000 vues\n- TikTok & Instagram\n\nREJOINS LA CAMPAGNE 🚀",
    image_url: null,
    likes: 2,
  };

  const displayFeed = feed.length === 0 ? [DEMO_POST] : feed;

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

      {/* My Campaigns with status badges */}
      {stats?.campaign_stats && stats.campaign_stats.length > 0 && (
        <Card className="bg-[#121212] border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Mes campagnes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.campaign_stats.map((cs) => (
              <div key={cs.campaign_id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-white text-sm font-medium truncate mr-3">{cs.campaign_name}</span>
                {cs.status === "pending" && (
                  <span className="flex-shrink-0 text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium">
                    ⏳ En attente de validation
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
            ))}
          </CardContent>
        </Card>
      )}

      {/* Feed card */}
      <Card className="bg-[#121212] border-white/10 overflow-hidden">
        {/* Composer */}
        <PostComposer user={user} onPosted={reloadFeed} />

        {/* Posts */}
        <div className="divide-y divide-white/5">
          {displayFeed.map((ann) => (
            <PostCard key={ann.announcement_id} ann={ann} currentUser={user} />
          ))}
        </div>
      </Card>
    </motion.div>
  );
}

// Discover Campaigns Page
function DiscoverCampaigns({ onJoin }) {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [applyForm, setApplyForm] = useState({ tiktok: "", instagram: "", youtube: "", example_url: "" });
  const [applying, setApplying] = useState(false);

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

      {/* Apply Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#121212] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold text-xl text-white">{selectedCampaign.name}</h2>
                <p className="text-sm text-white/50 mt-1">RPM : <span className="text-[#00E5FF] font-mono">€{selectedCampaign.rpm}</span></p>
              </div>
              <button onClick={() => setSelectedCampaign(null)} className="text-white/40 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {selectedCampaign.application_form_enabled === false ? (
              <p className="text-sm text-[#39FF14]/80 bg-[#39FF14]/10 rounded-lg px-3 py-2">
                ⚡ Rejoindre instantanément — aucun formulaire requis
              </p>
            ) : (
              <p className="text-sm text-white/60">Renseigne tes comptes sociaux pour postuler. Ils seront trackés automatiquement dès ton acceptation.</p>
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

                {/* RPM badge */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#39FF14] bg-[#39FF14]/10 px-2 py-1 rounded-md">
                    💰 {c.rpm || 0}€ / 1K vues
                  </span>
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
function AccountsPage({ accounts, campaigns, onUpdate }) {
  const [newPlatform, setNewPlatform] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [campaignAccounts, setCampaignAccounts] = useState({});
  const [videosByAccount, setVideosByAccount] = useState({});
  const [expandedAccounts, setExpandedAccounts] = useState(new Set());
  const [refreshingAccounts, setRefreshingAccounts] = useState(new Set());
  const [scrapingAccounts, setScrapingAccounts] = useState(new Set());

  // Poll every 3s while any account is pending
  useEffect(() => {
    if (!accounts.some((a) => a.status === "pending")) return;
    const t = setInterval(onUpdate, 3000);
    return () => clearInterval(t);
  }, [accounts, onUpdate]);

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
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || "Scraping terminé");
        // Reload videos
        const vres = await fetch(`${API}/social-accounts/${accountId}/videos`, { credentials: "include" });
        if (vres.ok) {
          const vdata = await vres.json();
          setVideosByAccount((prev) => ({ ...prev, [accountId]: vdata.videos || [] }));
        }
      } else {
        const err = await res.json();
        toast.error(err.detail || "Erreur lors du scraping");
      }
    } catch (e) {
      toast.error("Erreur de connexion");
    } finally {
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

  const fmt = (n) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n || 0);
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

      {/* Enriched account cards */}
      {accounts.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-display font-bold text-xl text-white">Mes comptes ({accounts.length})</h2>
          {accounts.map((account) => {
            const color = platformColor[account.platform] || "#00E5FF";
            const isExpanded = expandedAccounts.has(account.account_id);
            const isRefreshing = refreshingAccounts.has(account.account_id);
            const videos = videosByAccount[account.account_id] || [];
            return (
              <Card key={account.account_id} className="bg-[#121212] border-white/10 overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-14 h-14 rounded-full flex-shrink-0 overflow-hidden border-2"
                      style={{ borderColor: color + "40" }}>
                      {account.avatar_url
                        ? <img src={account.avatar_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-xl font-bold"
                            style={{ background: color + "20", color }}>
                            {account.platform[0].toUpperCase()}
                          </div>
                      }
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge style={{ background: color + "20", color }} className="text-xs font-semibold border-0">
                          {account.platform}
                        </Badge>
                        <span className="text-white font-semibold">@{account.username}</span>
                        {account.display_name && (
                          <span className="text-white/40 text-sm truncate">{account.display_name}</span>
                        )}
                      </div>
                      {account.status === "pending" && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                          <span className="text-yellow-400 text-xs">Recherche du compte...</span>
                        </div>
                      )}
                      {account.status === "verified" && (
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-[#39FF14] text-xs flex items-center gap-1">
                            <Check className="w-3 h-3" /> Vérifié
                          </span>
                          {account.follower_count != null && (
                            <span className="text-white/50 text-xs">
                              {fmt(account.follower_count)} abonnés
                            </span>
                          )}
                          {account.verified_at && (
                            <span className="text-white/30 text-xs">
                              le {new Date(account.verified_at).toLocaleDateString("fr-FR")}
                            </span>
                          )}
                        </div>
                      )}
                      {account.status === "error" && (
                        <div className="mt-1">
                          <span className="text-red-400 text-xs flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Compte introuvable — vérifiez le nom d'utilisateur
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                      {account.status === "verified" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleVideos(account.account_id)}
                            className="text-white/50 hover:text-white text-xs gap-1"
                          >
                            <BarChart2 className="w-3 h-3" />
                            {isExpanded ? "Masquer" : "Vidéos"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleScrapeNow(account.account_id)}
                            disabled={scrapingAccounts.has(account.account_id)}
                            className="text-[#00E5FF]/70 hover:text-[#00E5FF] text-xs gap-1 border border-[#00E5FF]/20 hover:border-[#00E5FF]/50"
                          >
                            {scrapingAccounts.has(account.account_id) ? (
                              <><div className="w-3 h-3 border border-[#00E5FF] border-t-transparent rounded-full animate-spin" /> Scraping...</>
                            ) : (
                              <><TrendingUp className="w-3 h-3" /> Scraper</>
                            )}
                          </Button>
                        </>
                      )}
                      {(account.status === "error" || account.status === "pending") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRefreshAccount(account.account_id)}
                          disabled={isRefreshing || account.status === "pending"}
                          className="text-yellow-400 hover:text-yellow-300 text-xs"
                        >
                          {isRefreshing ? "..." : "Réessayer"}
                        </Button>
                      )}
                      {account.status === "verified" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRefreshAccount(account.account_id)}
                          disabled={isRefreshing}
                          className="text-white/30 hover:text-white text-xs"
                          title="Re-vérifier le compte"
                        >
                          ↻
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteAccount(account.account_id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Videos section (collapsible) */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      {videos.length === 0 ? (
                        <div className="text-center py-6 space-y-3">
                          <Video className="w-8 h-8 text-white/20 mx-auto" />
                          <p className="text-white/40 text-sm">Aucune vidéo trackée pour l'instant</p>
                          <Button
                            size="sm"
                            onClick={() => handleScrapeNow(account.account_id)}
                            disabled={scrapingAccounts.has(account.account_id)}
                            className="bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30 text-xs"
                          >
                            {scrapingAccounts.has(account.account_id) ? "Scraping en cours..." : "Lancer le scraping maintenant"}
                          </Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {videos.map((v) => (
                            <a key={v.video_id || v.platform_video_id} href={v.url} target="_blank" rel="noreferrer"
                              data-video-id={v.video_id || v.platform_video_id}
                              className="group block rounded-lg overflow-hidden bg-white/5 hover:bg-white/10 transition-colors">
                              {v.thumbnail_url ? (
                                <img src={v.thumbnail_url} alt="" className="w-full aspect-video object-cover" />
                              ) : (
                                <div className="w-full aspect-video bg-white/10 flex items-center justify-center">
                                  <Video className="w-6 h-6 text-white/20" />
                                </div>
                              )}
                              <div className="p-2">
                                {v.title && (
                                  <p className="text-white text-xs font-medium line-clamp-2 mb-1">{v.title}</p>
                                )}
                                <div className="flex items-center gap-2 text-xs text-white/40">
                                  <span>👁 {fmt(v.views)}</span>
                                  <span>❤️ {fmt(v.likes)}</span>
                                  {v.earnings > 0 && (
                                    <span className="text-[#39FF14]">€{v.earnings.toFixed(2)}</span>
                                  )}
                                </div>
                                {account.last_tracked_at && (
                                  <p className="text-white/20 text-xs mt-1">
                                    Mis à jour {(() => {
                                      const h = Math.round((Date.now() - new Date(account.last_tracked_at)) / 3600000);
                                      return h < 1 ? "à l'instant" : `il y a ${h}h`;
                                    })()}
                                  </p>
                                )}
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
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
              const availableAccounts = accounts.filter(
                (a) => a.status === "verified" && !assignedAccounts.find((ca) => ca.account_id === a.account_id)
              );
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
                    {availableAccounts.length > 0 && (
                      <Select onValueChange={(accountId) => handleAssignAccount(campaign.campaign_id, accountId)}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white"
                          data-testid={`assign-account-${campaign.campaign_id}`}>
                          <SelectValue placeholder="+ Ajouter un compte" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableAccounts.map((account) => (
                            <SelectItem key={account.account_id} value={account.account_id}>
                              {account.platform} — {account.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
function CampaignDashboard({ campaigns }) {
  const location = useLocation();
  const campaignId = location.pathname.split("/")[3];
  const campaign = campaigns.find((c) => c.campaign_id === campaignId);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (campaignId) {
      fetchStats();
    }
  }, [campaignId]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/stats`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-white/50">Campagne non trouvée</p>
      </div>
    );
  }

  const myStats = stats?.clipper_stats?.find((s) => true); // First one for demo

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="campaign-dashboard"
    >
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">{campaign.name}</h1>
        <p className="text-white/50">Votre tableau de bord pour cette campagne</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-6">
            <p className="text-sm text-white/50 mb-1">Votre classement</p>
            <p className="font-mono font-bold text-3xl text-white">
              #{myStats?.rank || "-"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-6">
            <p className="text-sm text-white/50 mb-1">Vos vues</p>
            <p className="font-mono font-bold text-3xl text-white">
              {myStats?.views?.toLocaleString() || "0"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-6">
            <p className="text-sm text-white/50 mb-1">Gains en attente</p>
            <p className="font-mono font-bold text-3xl text-[#00E5FF]">
              €{myStats?.earnings?.toFixed(2) || "0.00"}
            </p>
          </CardContent>
        </Card>
      </div>

      {myStats?.strikes > 0 && (
        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">
              Vous avez {myStats.strikes} strike(s) actif(s)
            </span>
          </CardContent>
        </Card>
      )}

      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Détails de la campagne</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-white/50">RPM</p>
              <p className="font-mono text-lg text-white">€{campaign.rpm}</p>
            </div>
            <div>
              <p className="text-sm text-white/50">Min. vues payout</p>
              <p className="font-mono text-lg text-white">{campaign.min_view_payout}</p>
            </div>
            <div>
              <p className="text-sm text-white/50">Max. vues payout</p>
              <p className="font-mono text-lg text-white">{campaign.max_view_payout || "∞"}</p>
            </div>
            <div>
              <p className="text-sm text-white/50">Plateformes</p>
              <div className="flex gap-1 mt-1">
                {campaign.platforms?.map((p) => (
                  <Badge key={p} variant="outline" className="text-xs">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Payment Page
function PaymentPage({ stats }) {
  const { user } = useAuth();
  const [paymentInfo, setPaymentInfo] = useState(user?.payment_info || "");
  const [savingInfo, setSavingInfo] = useState(false);
  const [campaignSummaries, setCampaignSummaries] = useState({});

  useEffect(() => {
    if (stats?.campaign_stats) {
      stats.campaign_stats.forEach(cs => fetchCampaignSummary(cs.campaign_id));
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

  const handleSavePaymentInfo = async () => {
    setSavingInfo(true);
    try {
      const res = await fetch(`${API}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ payment_info: paymentInfo }),
      });
      if (res.ok) toast.success("Coordonnées de paiement sauvegardées ✓");
      else toast.error("Erreur");
    } catch { toast.error("Erreur de connexion"); }
    finally { setSavingInfo(false); }
  };

  const fmt = (n) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n||0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8" data-testid="payment-page">
      <div>
        <h1 className="font-display font-bold text-3xl text-white mb-2">Paiement</h1>
        <p className="text-white/50">Vos gains et ce que l'agence vous doit</p>
      </div>

      {/* Total banner */}
      <Card className="bg-[#121212] border-[#f0c040]/30">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-white/50 mb-2">Total généré (toutes campagnes)</p>
          <p className="font-mono font-black text-5xl text-[#f0c040]">
            €{stats?.total_earnings?.toFixed(2) || "0.00"}
          </p>
        </CardContent>
      </Card>

      {/* IBAN / PayPal */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#f0c040]" />
            Vos coordonnées de paiement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-white/40">Renseignez votre IBAN ou votre adresse PayPal pour que l'agence puisse vous virer directement.</p>
          <div className="flex gap-3">
            <Input
              value={paymentInfo}
              onChange={(e) => setPaymentInfo(e.target.value)}
              placeholder="IBAN ou adresse PayPal (ex: FR76... ou jean@paypal.com)"
              className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30"
            />
            <Button onClick={handleSavePaymentInfo} disabled={savingInfo}
              className="bg-[#f0c040] hover:bg-[#f0c040]/80 text-black font-semibold">
              {savingInfo ? "..." : "Sauvegarder"}
            </Button>
          </div>
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
                return (
                  <div key={cs.campaign_id} className="p-4 bg-white/5 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{cs.campaign_name}</p>
                        <p className="text-xs text-white/40">{fmt(cs.views)} vues</p>
                      </div>
                      <p className="font-mono font-bold text-[#00E5FF] text-lg">€{cs.earnings?.toFixed(2)}</p>
                    </div>
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
  const [paymentInfo, setPaymentInfo] = useState(user?.payment_info || "");
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
      const body = { display_name: displayName, payment_info: paymentInfo };
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

          {/* IBAN / PayPal */}
          <div className="pt-2 border-t border-white/10">
            <label className="block text-sm text-white/70 mb-1">Coordonnées de paiement</label>
            <p className="text-xs text-white/30 mb-2">IBAN, PayPal ou Revolut — visible uniquement par les agences pour vous payer</p>
            <Input
              value={paymentInfo}
              onChange={(e) => setPaymentInfo(e.target.value)}
              placeholder="FR76 3000 6000 0112 3456 7890 189  ou  votre@paypal.com"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
            />
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

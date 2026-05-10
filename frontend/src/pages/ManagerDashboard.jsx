import { useState, useEffect, useMemo } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useAuth, API } from "../App";
import Sidebar from "../components/Sidebar";
import ScrapeStatusPanel from "../components/ScrapeStatusPanel";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Bell, Settings, MessageCircle, Video, ClipboardList,
  Users, Send, AlertTriangle, Check, HelpCircle,
  Search, X, Home, ChevronRight, BarChart3,
  RefreshCw, ArrowUpDown, ChevronUp, ChevronDown, Play, ExternalLink, TrendingUp
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Progress } from "../components/ui/progress";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import ChatPanel from "../components/ChatPanel";
import SupportPage from "../components/SupportPage";

// PRECIS — pas d'arrondi (ex: 22 643 au lieu de "22.6K")
const fmtViews = (n) => {
  if (!n || n === 0) return "0";
  return Math.floor(Number(n)).toLocaleString("fr-FR");
};

const ACCENT_COLOR = "#39FF14";

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [reminderStatus, setReminderStatus] = useState({ show_reminder: false });
  const [loading, setLoading] = useState(true);
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
        setSupportUnread(data.support_unread || 0);
      }
    } catch {}
  };

  const fetchData = async () => {
    try {
      const [campaignsRes, reminderRes] = await Promise.all([
        fetch(`${API}/campaigns`, { credentials: "include" }),
        fetch(`${API}/manager/reminder-status`, { credentials: "include" }),
      ]);

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
      }
      if (reminderRes.ok) {
        const data = await reminderRes.json();
        setReminderStatus(data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const sidebarItems = [
    {
      id: "home",
      label: "Accueil",
      icon: Home,
      path: "/manager",
      notification: reminderStatus.show_reminder
    },
    { id: "discover", label: "Découvrir", icon: Search, path: "/manager/discover" },
    { type: "divider" },
    ...(campaigns.length > 0 ? [{ type: "section", label: "MES CAMPAGNES" }] : []),
    ...campaigns.map((c) => ({
      id: `campaign-${c.campaign_id}`,
      label: c.name,
      icon: Video,
      path: `/manager/campaign/${c.campaign_id}`,
      children: [
        {
          id: `chat-${c.campaign_id}`,
          label: `Chat — ${c.name}`,
          icon: MessageCircle,
          path: `/manager/campaign/${c.campaign_id}/chat`,
        },
      ],
    })),
    ...(campaigns.length > 0 ? [{ type: "divider" }] : []),
    { id: "support", label: "Support", icon: HelpCircle, path: "/manager/support", badge: supportUnread },
    { id: "settings", label: "Paramètres", icon: Settings, path: "/manager/settings" },
  ];

  return (
    <div className="flex min-h-screen bg-[#0A0A0A]">
      <Sidebar
        items={sidebarItems}
        accentColor={ACCENT_COLOR}
        role="manager"
      />
      <main className="flex-1 md:ml-60 p-4 pt-16 md:p-8">
        <Routes>
          <Route index element={<HomePage reminderStatus={reminderStatus} campaigns={campaigns} />} />
          <Route path="discover" element={<DiscoverCampaigns onJoin={fetchData} />} />
          <Route path="campaign/:campaignId" element={<CampaignDashboard campaigns={campaigns} />} />
          <Route path="campaign/:campaignId/chat" element={<ChatPanel campaigns={campaigns} />} />
          <Route path="advices" element={<AdvicesPage campaigns={campaigns} />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

// ── Home Page ────────────────────────────────────────────────────────────────
function HomePage({ reminderStatus, campaigns }) {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="manager-home-page"
    >
      <div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-2">Tableau de bord</h1>
        <p className="text-white/50">Bienvenue dans votre espace manager</p>
      </div>

      {/* Reminder card */}
      {reminderStatus.show_reminder ? (
        <Card className="bg-[#39FF14]/10 border-[#39FF14]/30">
          <CardContent className="p-6 flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-[#39FF14]/20 flex items-center justify-center flex-shrink-0">
              <Bell className="w-6 h-6 text-[#39FF14]" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg text-white mb-2">
                Il est temps de donner un conseil !
              </h3>
              <p className="text-white/60">
                {reminderStatus.hours_since_last
                  ? `Cela fait ${Math.round(reminderStatus.hours_since_last)} heures depuis votre dernier conseil.`
                  : "Vous n'avez pas encore envoyé de conseil."}
              </p>
              <Button
                className="mt-4 bg-[#39FF14] hover:bg-[#39FF14]/80 text-black"
                onClick={() => navigate("/manager/advices")}
              >
                Envoyer un conseil
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#39FF14]/20 flex items-center justify-center flex-shrink-0">
              <Check className="w-5 h-5 text-[#39FF14]" />
            </div>
            <div>
              <p className="text-white font-medium">Tout est à jour !</p>
              <p className="text-white/40 text-sm">Vous avez récemment envoyé un conseil à votre équipe.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-5">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Campagnes</p>
            <p className="font-mono font-bold text-2xl text-[#39FF14]">{campaigns.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-5">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Statut</p>
            <p className="font-mono font-bold text-2xl text-white">Manager</p>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10 cursor-pointer hover:border-[#39FF14]/30 transition-colors"
          onClick={() => navigate("/manager/discover")}>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Découvrir</p>
              <p className="text-sm text-white/60">Nouvelles campagnes</p>
            </div>
            <ChevronRight className="w-5 h-5 text-[#39FF14]" />
          </CardContent>
        </Card>
      </div>

      {/* Campaign shortcuts */}
      {campaigns.length > 0 && (
        <Card className="bg-[#121212] border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Video className="w-4 h-4 text-[#39FF14]" />
              Mes campagnes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {campaigns.map((c) => (
              <button
                key={c.campaign_id}
                onClick={() => navigate(`/manager/campaign/${c.campaign_id}`)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/8 border border-white/8 hover:border-[#39FF14]/30 transition-all text-left"
              >
                <span className="text-white text-sm font-medium">{c.name}</span>
                <ChevronRight className="w-4 h-4 text-white/30" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

// ── Discover Campaigns ────────────────────────────────────────────────────────
function DiscoverCampaigns({ onJoin }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [applying, setApplying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [applyForm, setApplyForm] = useState({ first_name: "", last_name: "", motivation: "" });

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
    if (!applyForm.first_name.trim() || !applyForm.last_name.trim() || !applyForm.motivation.trim()) {
      toast.error("Remplis tous les champs obligatoires");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`${API}/campaigns/${selectedCampaign.campaign_id}/join-as-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          first_name: applyForm.first_name.trim(),
          last_name: applyForm.last_name.trim(),
          motivation: applyForm.motivation.trim(),
        }),
      });
      if (res.ok) {
        toast.success("Candidature envoyée ! L'agence va examiner ta demande.");
        setCampaigns(prev => prev.map(c =>
          c.campaign_id === selectedCampaign.campaign_id
            ? { ...c, user_status: "pending" }
            : c
        ));
        setSelectedCampaign(null);
        setApplyForm({ first_name: "", last_name: "", motivation: "" });
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

  const filtered = campaigns.filter(c =>
    !searchQuery || c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.agency_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusBadge = (status) => {
    if (status === "active") return <Badge className="bg-[#39FF14]/20 text-[#39FF14] text-[10px]">✓ Accepté</Badge>;
    if (status === "pending") return <Badge className="bg-yellow-500/20 text-yellow-400 text-[10px]">⏳ En attente</Badge>;
    if (status === "rejected") return <Badge className="bg-red-500/20 text-red-400 text-[10px]">✗ Refusé</Badge>;
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="manager-discover-page"
    >
      <div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-2">Découvrir</h1>
        <p className="text-white/50">Explorez les campagnes disponibles et postulez en tant que manager</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher une campagne..."
          className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30"
        />
      </div>

      {/* Apply Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#121212] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold text-xl text-white">{selectedCampaign.name}</h2>
                <p className="text-sm text-white/50 mt-1">par {selectedCampaign.agency_name}</p>
              </div>
              <button onClick={() => setSelectedCampaign(null)} className="text-white/40 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#39FF14]/8 border border-[#39FF14]/20 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-white/50">RPM</span>
                <span className="font-mono text-[#39FF14] font-bold">€{selectedCampaign.rpm}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Budget</span>
                <span className="font-mono text-white">€{selectedCampaign.budget?.toFixed(0)}</span>
              </div>
              {selectedCampaign.platforms?.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Plateformes</span>
                  <span className="text-white capitalize">{selectedCampaign.platforms.join(", ")}</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Prénom <span className="text-red-400">*</span></label>
                  <input
                    value={applyForm.first_name}
                    onChange={e => setApplyForm(p => ({ ...p, first_name: e.target.value }))}
                    placeholder="Jean"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#39FF14]/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Nom <span className="text-red-400">*</span></label>
                  <input
                    value={applyForm.last_name}
                    onChange={e => setApplyForm(p => ({ ...p, last_name: e.target.value }))}
                    placeholder="Dupont"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#39FF14]/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Pourquoi veux-tu manager cette campagne ? <span className="text-red-400">*</span></label>
                <textarea
                  value={applyForm.motivation}
                  onChange={e => setApplyForm(p => ({ ...p, motivation: e.target.value }))}
                  placeholder="Décris ton expérience en gestion de clippers, tes méthodes de travail..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#39FF14]/50 resize-none"
                />
              </div>
            </div>

            <p className="text-xs text-white/30">Ta candidature sera examinée par l'agence. Tu seras notifié dès validation.</p>

            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={() => { setSelectedCampaign(null); setApplyForm({ first_name: "", last_name: "", motivation: "" }); }} className="flex-1 text-white/50 hover:text-white border-white/10">
                Annuler
              </Button>
              <Button
                onClick={handleApply}
                disabled={applying || !applyForm.first_name.trim() || !applyForm.last_name.trim() || !applyForm.motivation.trim()}
                className="flex-1 bg-[#39FF14] hover:bg-[#39FF14]/80 text-black font-bold disabled:opacity-50"
              >
                {applying ? "Envoi..." : "Postuler comme Manager"}
              </Button>
            </div>
          </motion.div>
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
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-white/20" />
          </div>
          <p className="text-white/40 text-lg font-medium">Aucune campagne disponible</p>
          <p className="text-white/20 text-sm mt-2">Revenez plus tard ou contactez une agence</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((campaign) => {
            const budgetTotalRaw = Number(campaign.budget || campaign.budget_total || 0);
            const budgetUsedRaw = Number(campaign.budget_used || 0);
            const budgetPct = budgetTotalRaw > 0
              ? Math.min(100, Math.max(0, Math.round((budgetUsedRaw / budgetTotalRaw) * 100)))
              : 0;
            return (
              <motion.div
                key={campaign.campaign_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="bg-[#121212] border-white/10 hover:border-[#39FF14]/30 transition-all hover:-translate-y-0.5 duration-200 cursor-pointer h-full"
                  onClick={() => !campaign.user_status && setSelectedCampaign(campaign)}>
                  <CardContent className="p-5 space-y-4 h-full flex flex-col">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-base leading-tight truncate">{campaign.name}</p>
                        <p className="text-white/40 text-xs mt-0.5 truncate">{campaign.agency_name}</p>
                      </div>
                      {campaign.user_status ? statusBadge(campaign.user_status) : (
                        <Badge className="bg-[#39FF14]/15 text-[#39FF14] text-[10px] whitespace-nowrap">
                          Postuler
                        </Badge>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-mono font-bold text-[#39FF14]">€{campaign.rpm} RPM</span>
                      {campaign.platforms?.map(p => (
                        <span key={p} className="px-1.5 py-0.5 rounded-md bg-white/8 text-white/50 capitalize">{p}</span>
                      ))}
                    </div>

                    {/* Budget bar / badge */}
                    {campaign.budget_unlimited ? (
                      <div className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-[#39FF14]/10 border border-[#39FF14]/25">
                        <span className="text-[#39FF14] text-xs font-semibold">♾️ Budget illimité</span>
                      </div>
                    ) : budgetTotalRaw > 0 ? (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-white/30">
                          <span>Budget limité</span>
                          <span>€{budgetUsedRaw.toFixed(0)} / €{budgetTotalRaw.toFixed(0)} · {budgetPct}%</span>
                        </div>
                        <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#39FF14] rounded-full transition-all"
                            style={{ width: `${budgetPct}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-white/5 border border-white/10">
                        <span className="text-white/40 text-xs italic">Budget non défini</span>
                      </div>
                    )}

                    <div className="mt-auto">
                      {campaign.user_status ? (
                        <div className="text-xs text-white/30 text-center py-1">
                          {campaign.user_status === "active" && "✓ Vous êtes manager de cette campagne"}
                          {campaign.user_status === "pending" && "Candidature en cours d'examen..."}
                          {campaign.user_status === "rejected" && "Candidature refusée"}
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedCampaign(campaign); }}
                          className="w-full py-2 rounded-xl bg-[#39FF14]/15 hover:bg-[#39FF14]/25 border border-[#39FF14]/30 text-[#39FF14] text-xs font-bold transition-all"
                        >
                          Postuler comme Manager
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ── Campaign Dashboard ────────────────────────────────────────────────────────
function CampaignDashboard({ campaigns }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const campaignId = location.pathname.split("/")[3];
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [allVideos, setAllVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(false);
  // Toggle "videos" / "accounts"
  const [videosSubView, setVideosSubView] = useState("videos");
  const [allAccountsByClipper, setAllAccountsByClipper] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  // Modal "Tracker un compte"
  const [showTrackAccountModal, setShowTrackAccountModal] = useState(false);
  const [trackAccountForm, setTrackAccountForm] = useState({ user_id: "", platform: "tiktok", username: "" });
  const [trackingAccount, setTrackingAccount] = useState(false);
  const [sortField, setSortField] = useState("published_at");
  const [sortDir, setSortDir] = useState("desc");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterClipper, setFilterClipper] = useState("all");
  const [expandedMembers, setExpandedMembers] = useState(new Set());
  const [strikingMember, setStrikingMember] = useState(null);
  const [kickingMember, setKickingMember] = useState(null);
  const [deletingVideo, setDeletingVideo] = useState(null);
  const [topClips, setTopClips] = useState([]);
  const [topClipsLoading, setTopClipsLoading] = useState(false);
  const [topClipsPeriod, setTopClipsPeriod] = useState("all");
  const [viewsTimeline, setViewsTimeline] = useState(null);
  const [viewsTimelineLoading, setViewsTimelineLoading] = useState(false);
  const [viewsPeriod, setViewsPeriod] = useState("30");

  const fmt = fmtViews;
  const PLAT_COLOR = { tiktok: "#00E5FF", instagram: "#FF007F", youtube: "#FF4444" };
  const PLAT_ICON  = { tiktok: "🎵", instagram: "📸", youtube: "▶️" };
  const ACCENT = "#39FF14";

  const fetchCampaign = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}`, { credentials: "include" });
      if (res.ok) setCampaign(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const fetchAllVideos = async () => {
    setVideosLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/tracked-videos`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setAllVideos(d.videos || []); }
    } catch {} finally { setVideosLoading(false); }
  };

  const fetchAllAccounts = async () => {
    setAccountsLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/all-accounts`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setAllAccountsByClipper(d.clippers || []); }
    } catch {} finally { setAccountsLoading(false); }
  };

  const handleTrackAccount = async () => {
    // user_id est OPTIONNEL : si vide, gains a l'agence
    if (!trackAccountForm.platform || !trackAccountForm.username.trim()) {
      toast.error("Sélectionne une plateforme et colle l'URL complète du profil");
      return;
    }
    const allowed = (campaign?.platforms && campaign.platforms.length > 0) ? campaign.platforms : null;
    if (allowed && !allowed.includes(trackAccountForm.platform)) {
      toast.error(`Cette campagne n'accepte que : ${allowed.join(", ")}`);
      return;
    }

    // ── DETECTION BULK : si plusieurs URLs (séparés par newline / espace / virgule)
    const inputRaw = trackAccountForm.username.trim();
    const items = inputRaw.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);

    // ── VALIDATION : chaque item doit etre une URL complete (commence par http)
    const invalidItems = items.filter(s => !s.toLowerCase().startsWith("http"));
    if (invalidItems.length > 0) {
      toast.error(
        `❌ URL invalide : « ${invalidItems[0]} ». Colle l'URL COMPLÈTE du profil (ex: https://www.instagram.com/username), pas juste le @username.`,
        { duration: 8000 }
      );
      return;
    }
    if (items.length > 1) {
      setTrackingAccount(true);
      try {
        const body = {
          platform: trackAccountForm.platform,
          ...(trackAccountForm.user_id ? { user_id: trackAccountForm.user_id } : {}),
          urls: items,
        };
        const res = await fetch(`${API}/campaigns/${campaignId}/add-accounts-bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const nbAdded = data.total_added || 0;
          const nbSkipped = data.total_skipped || 0;
          const nbErrors = data.total_errors || 0;
          let msg = `✓ ${nbAdded} compte${nbAdded > 1 ? "s" : ""} ajouté${nbAdded > 1 ? "s" : ""}`;
          if (nbSkipped > 0) msg += ` · ${nbSkipped} ignoré${nbSkipped > 1 ? "s" : ""}`;
          if (nbErrors > 0) msg += ` · ${nbErrors} erreur${nbErrors > 1 ? "s" : ""}`;
          if (data.limit_reached) msg += " ⚠ Limite plan atteinte";
          toast.success(msg, { duration: 8000 });
          if (Array.isArray(data.skipped) && data.skipped.length > 0) {
            data.skipped.slice(0, 5).forEach(s => toast(`↷ ${s.username || s.url} : ${s.reason}`, { duration: 7000, icon: "⚠️" }));
          }
          if (Array.isArray(data.errors) && data.errors.length > 0) {
            data.errors.slice(0, 3).forEach(e => toast.error(`✗ ${e.username || e.url} : ${e.error}`, { duration: 7000 }));
          }
          if (nbAdded > 0) {
            setShowTrackAccountModal(false);
            setTrackAccountForm({ user_id: "", platform: "tiktok", username: "" });
            fetchAllAccounts();
          }
        } else {
          toast.error(data.detail || "Erreur lors de l'ajout en masse");
        }
      } catch {
        toast.error("Erreur réseau");
      } finally {
        setTrackingAccount(false);
      }
      return;
    }

    setTrackingAccount(true);
    try {
      const isUrl = inputRaw.startsWith("http");
      const body = {
        platform: trackAccountForm.platform,
        ...(trackAccountForm.user_id ? { user_id: trackAccountForm.user_id } : {}),
        ...(isUrl ? { account_url: inputRaw } : { username: inputRaw }),
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

  const fetchTopClips = async (period = "all") => {
    setTopClipsLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/top-clips?limit=10&period=${period}`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setTopClips(d.clips || []); }
    } catch {} finally { setTopClipsLoading(false); }
  };

  const fetchViewsTimeline = async (d = viewsPeriod) => {
    setViewsTimelineLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/views-chart?days=${d}`, { credentials: "include" });
      if (res.ok) setViewsTimeline(await res.json());
    } catch {} finally { setViewsTimelineLoading(false); }
  };

  useEffect(() => {
    if (campaignId) {
      fetchCampaign();
      fetchAllVideos();
      fetchTopClips();
      const interval = setInterval(fetchTopClips, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [campaignId]);

  useEffect(() => {
    if (campaign?.payment_model === "views" || campaign.payment_model === "both") fetchViewsTimeline();
  }, [campaign?.campaign_id]);

  const handleAddStrike = async (userId) => {
    setStrikingMember(userId);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/members/${userId}/strike`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Strike manuel par le manager" }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Strike ajouté (${data.strikes} total)${data.suspended ? " — clippeur suspendu" : ""}`);
        fetchCampaign();
      } else { const e = await res.json(); toast.error(e.detail || "Erreur"); }
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
      } else { const e = await res.json(); toast.error(e.detail || "Erreur"); }
    } catch { toast.error("Erreur réseau"); }
    setStrikingMember(null);
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

  // KPIs
  const totalViews    = allVideos.reduce((s, v) => s + (v.views    || 0), 0);
  const totalLikes    = allVideos.reduce((s, v) => s + (v.likes    || 0), 0);
  const totalComments = allVideos.reduce((s, v) => s + (v.comments || 0), 0);
  const totalEarnings = allVideos.reduce((s, v) => s + (v.earnings || 0), 0);
  const engagementRate = totalViews > 0 ? ((totalLikes + totalComments) / totalViews * 100).toFixed(1) : "0.0";
  const avgViews = allVideos.length > 0 ? Math.round(totalViews / allVideos.length) : 0;

  // Filter clippeurs SEULEMENT (pas de manager dans le classement)
  const activeMembers = campaign?.members?.filter(m => m.status === "active" && (m.role || "clipper") === "clipper") || [];
  const budgetPercentage = campaign?.budget_total ? Math.min(100, (campaign.budget_used / campaign.budget_total) * 100) : 0;

  const displayVideos = useMemo(() => {
    let vids = [...allVideos];
    if (filterPlatform !== "all") vids = vids.filter(v => v.platform === filterPlatform);
    if (filterClipper !== "all") vids = vids.filter(v => v.user_id === filterClipper);
    vids.sort((a, b) => {
      let av = a[sortField] ?? 0, bv = b[sortField] ?? 0;
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
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
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3" style={{ color: ACCENT }} />
      : <ChevronDown className="w-3 h-3" style={{ color: ACCENT }} />;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
    </div>
  );
  if (!campaign) return <div className="text-center py-12"><p className="text-white/50">Campagne non trouvée</p></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6" data-testid="manager-campaign-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-1">{campaign.name}</h1>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-white/20 text-white/50 text-xs">{campaign.status}</Badge>
            <span className="text-white/30 text-xs">{allVideos.length} vidéos trackées</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { fetchAllVideos(); fetchViewsTimeline(); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-sm transition-all">
            <RefreshCw className="w-4 h-4" /> Actualiser
          </button>
          <button onClick={() => navigate(`/manager/campaign/${campaignId}/chat`)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-black text-sm font-bold transition-all"
            style={{ background: ACCENT }}>
            <MessageCircle className="w-4 h-4" /> Chat
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-0 bg-white/5 rounded-xl p-1 w-fit border border-white/10">
        {[
          { id: "overview", label: "Vue d'ensemble" },
          { id: "videos", label: `Vidéos & Comptes (${allVideos.length})`, dot: videosLoading },
          { id: "clip-winner", label: "🏆 Clip Winner" },
          { id: "scraping", label: "🔄 Scraping" },
        ].map(tab => (
          <button key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id ? "text-black shadow-lg" : "text-white/50 hover:text-white"
            }`}
            style={activeTab === tab.id ? { background: ACCENT } : {}}>
            {tab.label}
            {tab.dot && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
          </button>
        ))}
      </div>

      {/* ═══ OVERVIEW TAB ═══ */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Vues totales",    value: fmt(totalViews),            color: "text-white" },
              { label: "Likes",           value: fmt(totalLikes),            color: "text-[#FF007F]" },
              { label: "Commentaires",    value: fmt(totalComments),         color: "text-white/70" },
              { label: "Engagement",      value: `${engagementRate}%`,       color: "text-[#39FF14]" },
              { label: "Moy. vues/vidéo", value: fmt(avgViews),              color: "text-[#00E5FF]" },
              { label: "Gains estimés",   value: `€${totalEarnings.toFixed(0)}`, color: "text-[#f0c040]" },
            ].map(kpi => (
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
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewsPeriod === val ? "bg-white/15 text-white" : "text-white/40 hover:text-white"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => idx < PL.length-1 && go(PL[idx+1][0])} disabled={idx === PL.length-1}
                        className="w-6 h-6 flex items-center justify-center rounded text-sm font-bold text-white/40 hover:text-white disabled:opacity-20 transition-all">›</button>
                    </div>
                  );
                })()}
                {viewsTimelineLoading && <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: ACCENT + "50", borderTopColor: ACCENT }} />}
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
                      <linearGradient id="mgr-viewsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={ACCENT} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false}
                      interval={Math.max(0, Math.floor(tlData.length / 10) - 1)} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
                    <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                      labelStyle={{ color: "white", fontSize: 11 }}
                      formatter={v => [fmt(v), "Vues"]} />
                    <Area type="monotone" dataKey="views" stroke={ACCENT} strokeWidth={2} fill="url(#mgr-viewsGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center">
                  {viewsTimelineLoading
                    ? <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: ACCENT + "40", borderTopColor: ACCENT }} />
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
              <p className="text-white font-medium">Budget & RPM</p>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-white/40">RPM</p><p className="font-mono font-bold text-lg" style={{ color: ACCENT }}>€{campaign.rpm}/1K</p></div>
                {!campaign.budget_unlimited && campaign.budget_total && (
                  <div><p className="text-xs text-white/40">Budget utilisé</p>
                    <p className="text-white font-mono font-bold text-lg">€{campaign.budget_used || 0} / €{campaign.budget_total}</p>
                  </div>
                )}
              </div>
              {!campaign.budget_unlimited && campaign.budget_total && (
                <div>
                  <div className="flex justify-between text-xs text-white/40 mb-1">
                    <span>Progression</span><span>{budgetPercentage.toFixed(0)}%</span>
                  </div>
                  <Progress value={budgetPercentage} className="h-2" />
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
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                            style={{ background: ACCENT + "40", color: ACCENT }}>
                            {(member.user_info?.display_name || "?")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs truncate">{member.user_info?.display_name || member.user_info?.name}</p>
                            <p className="text-white/30 text-[10px]">{memberVideos.length} vid · {fmt(memberViews)} vues · <span style={{ color: ACCENT }}>€{memberEarnings.toFixed(2)}</span></p>
                          </div>
                          {/* Strikes - toujours visible */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => handleRemoveStrike(member.user_id)}
                              disabled={strikingMember === member.user_id || strikes === 0}
                              title="Retirer un strike"
                              className="w-5 h-5 rounded bg-white/5 hover:bg-white/15 text-white/40 hover:text-white text-xs font-bold border border-white/10 disabled:opacity-30 transition">−</button>
                            <div className="flex gap-0.5" title={`${strikes}/${maxStrikes} strikes`}>
                              {Array.from({ length: maxStrikes }).map((_, i) => (
                                <span key={i} className={`w-2 h-2 rounded-full ${i < strikes ? "bg-red-500" : "bg-white/10"}`} />
                              ))}
                            </div>
                            <button onClick={() => handleAddStrike(member.user_id)}
                              disabled={strikingMember === member.user_id}
                              title="Ajouter un strike"
                              className="w-5 h-5 rounded bg-red-500/10 hover:bg-red-500/25 text-red-400 text-xs font-bold border border-red-500/20 disabled:opacity-50 transition">+</button>
                            {member.status === "suspended" && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-bold ml-1">BAN</span>}
                          </div>
                          <button
                            onClick={() => setExpandedMembers(prev => { const s = new Set(prev); s.has(member.user_id) ? s.delete(member.user_id) : s.add(member.user_id); return s; })}
                            title="Plus d'options"
                            className="text-white/20 hover:text-white/60 text-xs px-1 transition-colors">⋯</button>
                        </div>
                        {expandedMembers.has(member.user_id) && (
                          <div className="border-t border-white/5 px-3 py-2">
                            <button onClick={() => handleKickMember(member.user_id)}
                              disabled={kickingMember === member.user_id}
                              className="w-full py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/20 transition-colors disabled:opacity-50">
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

      {/* ═══ VIDEOS TAB ═══ */}
      {activeTab === "videos" && (
        <div className="space-y-4">
          {/* Modal "Tracker un compte" */}
          {showTrackAccountModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-white font-semibold text-lg">Tracker un compte</h3>
                    <p className="text-white/40 text-xs mt-0.5">Ajoute un compte social pour un clippeur. Les vidéos seront trackées automatiquement.</p>
                  </div>
                  <button onClick={() => setShowTrackAccountModal(false)} className="text-white/30 hover:text-white text-xl leading-none">✕</button>
                </div>

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
                      ? "Les gains seront attribués à ce clippeur"
                      : "Compte rattaché directement à l'agence — gains non attribués"}
                  </p>
                </div>

                <div>
                  <label className="text-xs text-white/50 block mb-1.5">Plateforme *</label>
                  <div className="flex gap-2">
                    {(() => {
                      const allowed = (campaign?.platforms && campaign.platforms.length > 0) ? campaign.platforms : ["tiktok","instagram","youtube"];
                      const ALL = [["tiktok","🎵"], ["instagram","📸"], ["youtube","▶️"]];
                      return ALL.filter(([p]) => allowed.includes(p)).map(([p, icon]) => (
                        <button key={p} onClick={() => setTrackAccountForm(f => ({ ...f, platform: p }))}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border ${trackAccountForm.platform === p ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/10 text-white/40 hover:text-white/70"}`}>
                          {icon} {p}
                        </button>
                      ));
                    })()}
                  </div>
                </div>

                <div>
                  {(() => {
                    const items = (trackAccountForm.username || "").split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
                    const isBulk = items.length > 1;
                    const invalidItems = items.filter(s => !s.toLowerCase().startsWith("http"));
                    const hasInvalid = invalidItems.length > 0;
                    const platformExample = trackAccountForm.platform === "instagram"
                      ? "https://www.instagram.com/username"
                      : trackAccountForm.platform === "tiktok"
                        ? "https://www.tiktok.com/@username"
                        : "https://www.youtube.com/@username";
                    return (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs text-white/50">
                            URL(s) complète(s) du profil *
                            {isBulk && <span className="ml-2 text-[#00E5FF] font-bold">📋 Mode bulk : {items.length} URL{items.length > 1 ? "s" : ""}</span>}
                          </label>
                          {isBulk && (
                            <button type="button" onClick={() => setTrackAccountForm(f => ({ ...f, username: "" }))}
                              className="text-[10px] text-white/40 hover:text-white/70 underline">vider</button>
                          )}
                        </div>
                        <textarea value={trackAccountForm.username}
                          onChange={e => setTrackAccountForm(f => ({ ...f, username: e.target.value }))}
                          rows={isBulk ? Math.min(8, Math.max(3, items.length)) : 2}
                          placeholder={`${platformExample}\n\n💡 Colle plusieurs URLs (1 par ligne) pour ajouter en masse`}
                          className={`w-full bg-white/5 border rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none font-mono resize-y ${hasInvalid ? "border-red-500/60 focus:border-red-500" : "border-white/10 focus:border-[#00E5FF]/50"}`} />
                        {hasInvalid ? (
                          <p className="text-[11px] text-red-400 mt-1.5 font-medium">
                            ❌ {invalidItems.length} entrée{invalidItems.length > 1 ? "s" : ""} invalide{invalidItems.length > 1 ? "s" : ""} : il faut l'URL COMPLÈTE (ex: <span className="font-mono">{platformExample}</span>), pas juste le @username.
                          </p>
                        ) : (
                          <p className="text-[10px] text-white/40 mt-1">
                            {isBulk
                              ? `✓ ${items.length} URLs valides — seront ajoutées d'un coup.`
                              : "Colle l'URL complète du profil. Tu peux en coller plusieurs (1 par ligne) pour ajouter en masse."}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowTrackAccountModal(false)}
                    className="flex-1 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-all">
                    Annuler
                  </button>
                  {(() => {
                    const items = (trackAccountForm.username || "").split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
                    const isBulk = items.length > 1;
                    const hasInvalid = items.some(s => !s.toLowerCase().startsWith("http"));
                    return (
                      <button onClick={handleTrackAccount}
                        disabled={trackingAccount || !trackAccountForm.username.trim() || hasInvalid}
                        title={hasInvalid ? "Colle l'URL COMPLÈTE du profil (https://...)" : ""}
                        className="flex-1 py-2.5 rounded-lg bg-[#00E5FF] hover:bg-[#00E5FF]/90 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-bold transition-all">
                        {trackingAccount
                          ? (isBulk ? "Ajout en masse…" : "Ajout…")
                          : (isBulk ? `✓ Ajouter ${items.length} comptes` : "✓ Ajouter le compte")}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Toggle sous-vue */}
          <div className="flex items-center gap-2">
            <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
              <button onClick={() => setVideosSubView("videos")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${videosSubView === "videos" ? "text-black" : "text-white/50 hover:text-white"}`}
                style={videosSubView === "videos" ? { background: ACCENT } : {}}>
                📹 Vidéos
              </button>
              <button onClick={() => { setVideosSubView("accounts"); if (allAccountsByClipper.length === 0) fetchAllAccounts(); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${videosSubView === "accounts" ? "text-black" : "text-white/50 hover:text-white"}`}
                style={videosSubView === "accounts" ? { background: ACCENT } : {}}>
                👥 Comptes
              </button>
            </div>
            {videosSubView === "accounts" && (
              <>
                <button onClick={fetchAllAccounts} disabled={accountsLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs transition-all">
                  {accountsLoading ? "Chargement…" : "↻ Rafraîchir"}
                </button>
                <button onClick={() => { setTrackAccountForm({ user_id: "", platform: ((campaign?.platforms && campaign.platforms.length > 0) ? campaign.platforms[0] : "tiktok"), username: "" }); setShowTrackAccountModal(true); }}
                  className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/30 text-[#00E5FF] text-xs font-medium transition-all">
                  + Tracker un compte
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
              {["all","tiktok","instagram","youtube"].map(p => (
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
            <button onClick={() => { setTrackAccountForm({ user_id: "", platform: ((campaign?.platforms && campaign.platforms.length > 0) ? campaign.platforms[0] : "tiktok"), username: "" }); setShowTrackAccountModal(true); }}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 border border-[#00E5FF]/30 text-[#00E5FF] text-xs font-medium transition-all">
              + Tracker un compte
            </button>
          </div>

          {/* Table header */}
          {displayVideos.length === 0 ? (
            <div className="text-center py-16 text-white/30 bg-[#121212] rounded-xl border border-white/10">
              <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Aucune vidéo trackée</p>
              <p className="text-xs mt-1">Le tracking démarre dès qu'un clippeur connecte son compte social.</p>
            </div>
          ) : (
            <div className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-0 text-xs text-white/40 border-b border-white/10 px-4 py-2.5">
                <span className="w-10" />
                <span>Vidéo</span>
                <button onClick={() => toggleSort("views")} className="flex items-center gap-1 hover:text-white transition-colors pr-6">Vues <SortIcon field="views" /></button>
                <button onClick={() => toggleSort("likes")} className="flex items-center gap-1 hover:text-white transition-colors pr-6">Likes <SortIcon field="likes" /></button>
                <button onClick={() => toggleSort("earnings")} className="flex items-center gap-1 hover:text-white transition-colors pr-6">Gains <SortIcon field="earnings" /></button>
                <span className="w-8" />
              </div>
              <div className="divide-y divide-white/5">
                {displayVideos.map(v => (
                  <div key={v.video_id} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-0 items-center px-4 py-2.5 hover:bg-white/3 transition-colors">
                    {/* Thumbnail */}
                    <div className="w-10 h-14 rounded-md bg-white/5 overflow-hidden mr-3 flex-shrink-0">
                      {v.thumbnail_url
                        ? <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display = "none"} />
                        : <div className="w-full h-full flex items-center justify-center text-lg">{PLAT_ICON[v.platform] || "🎬"}</div>}
                    </div>
                    {/* Info */}
                    <div className="min-w-0 pr-4">
                      <a href={v.url} target="_blank" rel="noopener noreferrer"
                        className="text-white text-xs font-medium line-clamp-2 hover:underline">{v.title || v.url || "—"}</a>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: (PLAT_COLOR[v.platform] || "#fff") + "20", color: PLAT_COLOR[v.platform] || "#fff" }}>{v.platform}</span>
                        {v.clipper_name && <span className="text-white/30 text-[10px]">{v.clipper_name}</span>}
                      </div>
                    </div>
                    {/* Stats */}
                    <span className="font-mono text-white text-xs pr-6" title={v.platform === "instagram" ? "Vues Insta officielles (Meta API > 1s lecture). L'app peut afficher un total IG+Facebook plus élevé." : ""}>
                      {fmt(v.views || 0)}{v.platform === "instagram" && <span className="opacity-50 ml-0.5">ⓘ</span>}
                    </span>
                    <span className="font-mono text-[#FF007F] text-xs pr-6">{fmt(v.likes || 0)}</span>
                    <span className="font-mono text-xs pr-4" style={{ color: ACCENT }}>€{(v.earnings || 0).toFixed(2)}</span>
                    {/* Actions */}
                    <div className="flex gap-1">
                      <a href={v.url} target="_blank" rel="noopener noreferrer"
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white transition-colors">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button onClick={() => handleDeleteVideo(v.video_id)} disabled={deletingVideo === v.video_id}
                        className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center text-red-400/50 hover:text-red-400 transition-colors disabled:opacity-30">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
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
                  <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${ACCENT}40`, borderTopColor: "transparent" }} />
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
                    {allAccountsByClipper.reduce((s, c) => s + c.accounts.length, 0)} compte{allAccountsByClipper.reduce((s, c) => s + c.accounts.length, 0) > 1 ? "s" : ""}
                  </p>
                  {allAccountsByClipper.map(clipper => (
                    <div key={clipper.user_id || "__agency__"} className={`bg-[#121212] border rounded-xl p-4 ${clipper.is_agency_owned ? "border-[#f0c040]/40 bg-[#f0c040]/5" : "border-white/10"}`}>
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
                            {clipper.is_agency_owned && " · gains non attribués"}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
                        {clipper.accounts.map(acc => {
                          const link = acc.account_url || (
                            acc.platform === "tiktok" ? `https://tiktok.com/@${acc.username}` :
                            acc.platform === "instagram" ? `https://instagram.com/${acc.username}` :
                            `https://youtube.com/@${acc.username}`
                          );
                          return (
                            <a key={acc.account_id} href={link} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 transition-all group">
                              <span className="text-base">{PLAT_ICON[acc.platform]}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-xs font-medium truncate">@{acc.username}</p>
                                {acc.follower_count != null && (
                                  <p className="text-white/30 text-[10px]">{fmt(acc.follower_count)} abonnés</p>
                                )}
                              </div>
                              <ExternalLink className="w-3 h-3 text-white/30 group-hover:text-white/70 transition-colors flex-shrink-0" />
                            </a>
                          );
                        })}
                      </div>

                      {clipper.recent_videos.length > 0 && (
                        <div>
                          <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Vidéos récentes</p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                            {clipper.recent_videos.map(v => (
                              <a key={v.video_id} href={v.url} target="_blank" rel="noopener noreferrer"
                                className="group block rounded-md overflow-hidden bg-white/5 hover:bg-white/10 transition-colors">
                                <div className="relative aspect-video bg-black">
                                  {v.thumbnail_url ? (
                                    <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
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
                                    {(v.earnings || 0) > 0 && <span style={{ color: ACCENT }}>€{v.earnings.toFixed(2)}</span>}
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
        </div>
      )}

      {/* ═══ SCRAPING TAB ═══ */}
      {activeTab === "scraping" && (
        <div className="space-y-4 max-w-4xl">
          <div className="bg-[#0d0d0d] border border-white/8 rounded-xl p-3 text-xs text-white/50">
            ℹ️ Le scraping est <strong>automatique</strong> 4 fois par jour aux horaires fixes. Seul l'admin peut forcer un scrape manuel.
          </div>
          <ScrapeStatusPanel
            campaignId={campaignId}
            canForceScrape={user?.role === "admin" || sessionStorage.getItem("preview_mode") === "1"}
            onScrapeComplete={() => { fetchAllVideos(); fetchAllAccounts(); }}
          />
        </div>
      )}

      {/* ═══ CLIP WINNER TAB ═══ */}
      {activeTab === "clip-winner" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-white font-semibold text-lg flex items-center gap-2">🏆 <span>Top 10 — Clips les plus vus</span></h3>
              <p className="text-white/35 text-xs mt-0.5">{ {"24h":"Dernières 24h","7d":"7 derniers jours","30d":"30 derniers jours","all":"Depuis toujours"}[topClipsPeriod] } · auto-refresh 5 min</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5 gap-0.5">
                {[["24h","24h"],["7d","7j"],["30d","30j"],["all","Tout"]].map(([val, label]) => (
                  <button key={val} onClick={() => { setTopClipsPeriod(val); fetchTopClips(val); }}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${topClipsPeriod === val ? "bg-[#39FF14] text-black" : "text-white/50 hover:text-white"}`}>
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
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#f0c04040", borderTopColor: "#f0c040" }} />
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
                const medalColors = ["#FFD700","#C0C0C0","#CD7F32"];
                const borderCol = i < 3 ? `${medalColors[i]}50` : "rgba(255,255,255,0.08)";
                const eng = clip.views > 0
                  ? (((clip.likes || 0) + (clip.comments || 0)) / clip.views * 100).toFixed(1) + "%"
                  : "—";
                return (
                  <div key={clip.video_id || i}
                    className="flex items-center gap-4 bg-[#121212] rounded-xl p-3 overflow-hidden"
                    style={{ border: `1px solid ${borderCol}` }}>
                    <div className="w-9 flex-shrink-0 text-center">
                      {i < 3
                        ? <span className="text-2xl font-bold leading-none" style={{ color: medalColors[i] }}>{i+1}</span>
                        : <span className="text-lg font-bold text-white/25">#{i+1}</span>}
                    </div>
                    <a href={clip.url} target="_blank" rel="noopener noreferrer"
                      className="relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden bg-white/5 group/thumb cursor-pointer">
                      {clip.thumbnail_url
                        ? <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-200" onError={e => { e.target.style.display = "none"; }} />
                        : <div className="w-full h-full flex items-center justify-center text-2xl">{PLAT_ICON[clip.platform]}</div>}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                        <svg className="w-6 h-6 text-white drop-shadow" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                      <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold px-1 py-0.5 rounded"
                        style={{ background: `${platColor}dd`, color: "#000" }}>{clip.platform}</span>
                    </a>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {clip.title ? clip.title.slice(0, 40) + (clip.title.length > 40 ? "…" : "") : "—"}
                      </p>
                      <p className="text-white/30 text-xs truncate mt-0.5">{clip.clipper_name || "—"}</p>
                    </div>
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

// ── Advices Page ─────────────────────────────────────────────────────────────
function AdvicesPage({ campaigns }) {
  const [advices, setAdvices] = useState([]);
  const [content, setContent] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [selectedClippers, setSelectedClippers] = useState([]);
  const [campaignClippers, setCampaignClippers] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchAdvices();
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      fetchCampaignClippers();
    }
  }, [selectedCampaign]);

  const fetchAdvices = async () => {
    try {
      const res = await fetch(`${API}/advices`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAdvices(data.advices || []);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const fetchCampaignClippers = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${selectedCampaign}/stats`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCampaignClippers(data.clipper_stats || []);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const toggleClipper = (userId) => {
    setSelectedClippers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSend = async () => {
    if (!content.trim() || !selectedCampaign || selectedClippers.length === 0) {
      toast.error("Veuillez remplir tous les champs et sélectionner des clippeurs");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/advices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          campaign_id: selectedCampaign,
          recipient_ids: selectedClippers,
          content: content.trim(),
        }),
      });

      if (res.ok) {
        toast.success("Conseil envoyé !");
        setContent("");
        setSelectedClippers([]);
        fetchAdvices();
      }
    } catch (error) {
      toast.error("Erreur lors de l'envoi");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="advices-page"
    >
      <div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-2">Conseils</h1>
        <p className="text-white/50">Envoyez des conseils personnalisés à vos clippeurs</p>
      </div>

      {/* Send Advice Form */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Nouveau conseil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-2">Campagne</label>
            <select
              value={selectedCampaign}
              onChange={(e) => {
                setSelectedCampaign(e.target.value);
                setSelectedClippers([]);
              }}
              className="w-full bg-white/5 border border-white/10 rounded-md p-3 text-white"
              data-testid="select-campaign-advice"
            >
              <option value="">Sélectionner une campagne</option>
              {campaigns.map((c) => (
                <option key={c.campaign_id} value={c.campaign_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {selectedCampaign && (
            <div>
              <label className="block text-sm text-white/70 mb-2">Destinataires</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {campaignClippers.length === 0 ? (
                  <p className="text-white/50 text-sm">Aucun clippeur dans cette campagne</p>
                ) : (
                  campaignClippers.map((clipper, i) => (
                    <label key={clipper.user_id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedClippers.includes(clipper.user_id)}
                        onCheckedChange={() => toggleClipper(clipper.user_id)}
                        className="border-white/30"
                      />
                      <span className="text-white">
                        {clipper.display_name || clipper.name || `Clippeur ${i + 1}`}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm text-white/70 mb-2">Message</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Écrivez votre conseil..."
              rows={4}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              data-testid="advice-content-input"
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={isSubmitting}
            className="bg-[#39FF14] hover:bg-[#39FF14]/80 text-black"
            data-testid="send-advice-btn"
          >
            <Send className="w-4 h-4 mr-2" />
            {isSubmitting ? "Envoi..." : "Envoyer"}
          </Button>
        </CardContent>
      </Card>

      {/* Advice History */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Historique des conseils</CardTitle>
        </CardHeader>
        <CardContent>
          {advices.length === 0 ? (
            <p className="text-white/50 text-center py-8">Aucun conseil envoyé</p>
          ) : (
            <div className="space-y-4">
              {advices.map((advice) => (
                <div key={advice.advice_id} className="p-4 bg-white/5 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white/50">
                      {new Date(advice.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Badge className="bg-[#39FF14]/20 text-[#39FF14]">
                      {advice.recipient_ids?.length || 0} destinataire(s)
                    </Badge>
                  </div>
                  <p className="text-white">{advice.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Settings Page ─────────────────────────────────────────────────────────────
function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="manager-settings-page"
    >
      <div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-2">Paramètres</h1>
        <p className="text-white/50">Informations de votre compte</p>
      </div>

      <Card className="bg-[#121212] border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-2">Nom affiché</label>
            <p className="text-white font-medium">{user?.display_name || user?.name}</p>
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-2">Email</label>
            <p className="text-white/50">{user?.email}</p>
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-2">Rôle</label>
            <Badge className="bg-[#39FF14]/20 text-[#39FF14]">Manager</Badge>
          </div>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        onClick={logout}
        className="border-red-500/30 text-red-400 hover:bg-red-500/10"
        data-testid="logout-btn-manager"
      >
        Se déconnecter
      </Button>
    </motion.div>
  );
}

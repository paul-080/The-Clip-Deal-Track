import { useState, useEffect, useMemo } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useAuth, API } from "../App";
import Sidebar from "../components/Sidebar";
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

const fmtViews = (n) => {
  if (!n || n === 0) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
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
    { id: "advices", label: "Conseils", icon: ClipboardList, path: "/manager/advices" },
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
      <main className="flex-1 ml-64 p-8">
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
        <h1 className="font-display font-bold text-3xl text-white mb-2">Tableau de bord</h1>
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
        <h1 className="font-display font-bold text-3xl text-white mb-2">Découvrir</h1>
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
            const budgetPct = campaign.budget > 0
              ? Math.min(100, ((campaign.budget_used || 0) / campaign.budget) * 100)
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

                    {/* Budget bar */}
                    {campaign.budget > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-white/30">
                          <span>Budget</span>
                          <span>€{(campaign.budget_used || 0).toFixed(0)} / €{campaign.budget.toFixed(0)}</span>
                        </div>
                        <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#39FF14] rounded-full transition-all"
                            style={{ width: `${budgetPct}%` }}
                          />
                        </div>
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
  const campaignId = location.pathname.split("/")[3];
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [allVideos, setAllVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [sortField, setSortField] = useState("views");
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
    if (campaign?.payment_model === "views") fetchViewsTimeline();
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

  const activeMembers = campaign?.members?.filter(m => m.status === "active") || [];
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
          <h1 className="font-display font-bold text-3xl text-white mb-1">{campaign.name}</h1>
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
          { id: "videos", label: `Vidéos (${allVideos.length})`, dot: videosLoading },
          { id: "clip-winner", label: "🏆 Clip Winner" },
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
                    return (
                      <div key={member.member_id} className="rounded-lg bg-white/5 overflow-hidden">
                        <div className="flex items-center gap-3 p-2.5">
                          <span className="font-mono text-sm text-white/30 w-6">#{index+1}</span>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-black flex-shrink-0"
                            style={{ background: ACCENT + "40", color: ACCENT }}>
                            {(member.user_info?.display_name || "?")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm truncate">{member.user_info?.display_name || member.user_info?.name}</p>
                            <p className="text-white/30 text-xs">{memberVideos.length} vidéo{memberVideos.length !== 1 ? "s" : ""}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-white text-sm font-mono">{fmt(memberViews)}</p>
                            <p className="text-xs" style={{ color: ACCENT }}>€{memberEarnings.toFixed(2)}</p>
                          </div>
                          <button
                            onClick={() => setExpandedMembers(prev => { const s = new Set(prev); s.has(member.user_id) ? s.delete(member.user_id) : s.add(member.user_id); return s; })}
                            className="text-white/20 hover:text-white/60 text-xs px-1.5 transition-colors">⋯</button>
                        </div>
                        {expandedMembers.has(member.user_id) && (
                          <div className="border-t border-white/5 px-3 py-2 space-y-2">
                            {/* Strike management */}
                            <div className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg bg-white/3 border border-white/8">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-white/40 uppercase tracking-wide">Strikes</span>
                                <div className="flex gap-0.5">
                                  {Array.from({ length: campaign?.max_strikes || 3 }).map((_, i) => (
                                    <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < (member.strikes || 0) ? "bg-red-500" : "bg-white/10"}`} />
                                  ))}
                                </div>
                                <span className="text-xs font-mono text-white/60">{member.strikes || 0}/{campaign?.max_strikes || 3}</span>
                                {member.status === "suspended" && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">SUSPENDU</span>}
                              </div>
                              <div className="flex gap-1">
                                <button onClick={() => handleRemoveStrike(member.user_id)}
                                  disabled={strikingMember === member.user_id || (member.strikes || 0) === 0}
                                  className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/15 text-white/40 hover:text-white text-sm font-bold border border-white/10 transition-colors disabled:opacity-30">−</button>
                                <button onClick={() => handleAddStrike(member.user_id)}
                                  disabled={strikingMember === member.user_id}
                                  className="w-6 h-6 rounded-md bg-red-500/10 hover:bg-red-500/25 text-red-400 text-sm font-bold border border-red-500/20 transition-colors disabled:opacity-50">+</button>
                              </div>
                            </div>
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
                    <span className="font-mono text-white text-xs pr-6">{fmt(v.views || 0)}</span>
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
        <h1 className="font-display font-bold text-3xl text-white mb-2">Conseils</h1>
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
        <h1 className="font-display font-bold text-3xl text-white mb-2">Paramètres</h1>
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

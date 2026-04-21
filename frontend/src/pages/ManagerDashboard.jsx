import { useState, useEffect } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useAuth, API } from "../App";
import Sidebar from "../components/Sidebar";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Bell, Settings, MessageCircle, Video, ClipboardList,
  Users, Send, AlertTriangle, Check, HelpCircle,
  Search, X, Home, ChevronRight, BarChart3
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import ChatPanel from "../components/ChatPanel";
import SupportPage from "../components/SupportPage";

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
  const campaign = campaigns.find((c) => c.campaign_id === campaignId);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (campaignId) fetchData();
  }, [campaignId]);

  const fetchData = async () => {
    try {
      const statsRes = await fetch(`${API}/campaigns/${campaignId}/stats`, { credentials: "include" });
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#39FF14] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-white/50">Campagne non trouvée</p>
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Vue d'ensemble", icon: BarChart3 },
    { id: "clippers", label: "Clippeurs", icon: Users },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
      data-testid="manager-campaign-dashboard"
    >
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display font-bold text-3xl text-white mb-2">{campaign.name}</h1>
          <p className="text-white/50">Suivi de la campagne</p>
        </div>
        <Button
          onClick={() => navigate(`/manager/campaign/${campaignId}/chat`)}
          className="bg-[#39FF14] hover:bg-[#39FF14]/80 text-black font-bold"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Ouvrir le chat
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id
                ? "bg-[#39FF14] text-black"
                : "text-white/50 hover:text-white"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-[#121212] border-white/10">
              <CardContent className="p-6">
                <p className="text-sm text-white/50 mb-1">Vues totales</p>
                <p className="font-mono font-bold text-2xl text-white">
                  {stats?.total_views?.toLocaleString() || 0}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-[#121212] border-white/10">
              <CardContent className="p-6">
                <p className="text-sm text-white/50 mb-1">Clippeurs actifs</p>
                <p className="font-mono font-bold text-2xl text-[#39FF14]">
                  {stats?.clipper_count || 0}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-[#121212] border-white/10">
              <CardContent className="p-6">
                <p className="text-sm text-white/50 mb-1">Strikes actifs</p>
                <p className="font-mono font-bold text-2xl text-red-400">
                  {stats?.clipper_stats?.filter(c => c.strikes > 0).length || 0}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "clippers" && (
        <Card className="bg-[#121212] border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-[#39FF14]" />
              Clippeurs de la campagne
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!stats?.clipper_stats || stats.clipper_stats.length === 0 ? (
              <p className="text-white/50 text-center py-8">Aucun clippeur actif</p>
            ) : (
              <div className="space-y-3">
                {stats.clipper_stats.map((clipper, index) => (
                  <div
                    key={clipper.user_id}
                    className={`flex items-center justify-between p-4 rounded-xl ${
                      clipper.strikes > 0
                        ? "bg-red-500/8 border border-red-500/20"
                        : "bg-white/5 border border-white/8"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full bg-[#39FF14]/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-[#39FF14]">#{index + 1}</span>
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">
                          {clipper.display_name || clipper.name || `Clippeur ${index + 1}`}
                        </p>
                        {clipper.strikes > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3 text-red-400" />
                            <span className="text-red-400 text-xs">{clipper.strikes} strike(s)</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-white text-sm">
                        {clipper.views?.toLocaleString()} vues
                      </p>
                      <p className="text-xs text-[#39FF14]">€{clipper.earnings?.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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

import { useState, useEffect } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useAuth, API } from "../App";
import Sidebar from "../components/Sidebar";
import { motion } from "framer-motion";
import { Settings, MessageCircle, Video, Eye, Users, TrendingUp, Heart, ExternalLink, Film, HelpCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import ChatPanel from "../components/ChatPanel";
import SupportPage from "../components/SupportPage";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const ACCENT_COLOR = "#FFB300";

const fmtViews = (n) => {
  if (!n || n === 0) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("fr-FR");
};

const PLAT_COLOR = { tiktok: "#00E5FF", instagram: "#FF007F", youtube: "#FF0000" };
const PLAT_LABEL = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

export default function ClientDashboard() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
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
      const res = await fetch(`${API}/campaigns`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const sidebarItems = [
    { type: "section", label: "MES CAMPAGNES" },
    ...campaigns.map((c) => ({
      id: `campaign-${c.campaign_id}`,
      label: c.name,
      icon: Video,
      path: `/client/campaign/${c.campaign_id}`,
      children: [
        { id: `chat-${c.campaign_id}`, label: `Chat — ${c.name}`, icon: MessageCircle, path: `/client/campaign/${c.campaign_id}/chat` },
      ],
    })),
    { type: "divider" },
    { id: "support", label: "Support", icon: HelpCircle, path: "/client/support", badge: supportUnread },
    { id: "settings", label: "Paramètres", icon: Settings, path: "/client/settings" },
  ];

  return (
    <div className="flex min-h-screen bg-[#0A0A0A]">
      <Sidebar items={sidebarItems} accentColor={ACCENT_COLOR} role="client" />
      <main className="flex-1 ml-64 p-8">
        <Routes>
          <Route index element={<ClientHome campaigns={campaigns} loading={loading} />} />
          <Route path="campaign/:campaignId" element={<CampaignView campaigns={campaigns} />} />
          <Route path="campaign/:campaignId/chat" element={<ChatPanel campaigns={campaigns} />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

// ─── Home ────────────────────────────────────────────────────────────────────
function ClientHome({ campaigns, loading }) {
  const navigate = useNavigate();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8" data-testid="client-home">
      <div>
        <h1 className="font-bold text-3xl text-white mb-1">Mes campagnes</h1>
        <p className="text-white/40">Suivez vos campagnes de clipping en temps réel</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-40 bg-white/5 rounded-2xl animate-pulse" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-12 text-center">
            <Film className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/50">Vous n'avez pas encore de campagnes.</p>
            <p className="text-white/30 text-sm mt-1">Votre agence vous ajoutera à une campagne.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <button key={c.campaign_id} onClick={() => navigate(`/client/campaign/${c.campaign_id}`)}
              className="text-left bg-[#121212] border border-white/10 hover:border-[#FFB300]/40 rounded-2xl p-6 transition-all hover:-translate-y-0.5">
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-[#FFB300]/15 flex items-center justify-center">
                  <Video className="w-5 h-5 text-[#FFB300]" />
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  c.status === "active" ? "bg-green-500/15 text-green-400 border border-green-500/25" :
                  c.status === "paused" ? "bg-amber-500/15 text-amber-400 border border-amber-500/25" :
                  "bg-white/5 text-white/40 border border-white/10"
                }`}>{c.status === "active" ? "Actif" : c.status === "paused" ? "Pausé" : c.status}</span>
              </div>
              <h3 className="font-semibold text-white text-base mb-1 truncate">{c.name}</h3>
              <div className="flex gap-1.5 mt-3">
                {c.platforms?.map((p) => (
                  <span key={p} className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                    style={{ background: PLAT_COLOR[p] + "20", color: PLAT_COLOR[p] }}>
                    {PLAT_LABEL[p] || p}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─── Campaign View ────────────────────────────────────────────────────────────
function CampaignView({ campaigns }) {
  const location = useLocation();
  const campaignId = location.pathname.split("/")[3];
  const campaign = campaigns.find((c) => c.campaign_id === campaignId);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState("videos");
  const [sortBy, setSortBy] = useState("recent"); // "recent" | "views"

  useEffect(() => {
    if (campaignId) fetchStats();
  }, [campaignId]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/stats`, { credentials: "include" });
      if (res.ok) setStats(await res.json());
    } catch (e) { console.error(e); }
  };

  if (!campaign) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-white/40">Campagne non trouvée</p>
    </div>
  );

  const videos = stats?.videos || [];
  const chartData = (stats?.views_chart || []).map(d => ({
    date: new Date(d.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    vues: d.views,
  }));

  const sortedVideos = [...videos].sort((a, b) =>
    sortBy === "views"
      ? (b.views || 0) - (a.views || 0)
      : new Date(b.published_at || 0) - new Date(a.published_at || 0)
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6" data-testid="client-campaign-view">
      {/* Header */}
      <div>
        <h1 className="font-bold text-3xl text-white mb-1">{campaign.name}</h1>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            campaign.status === "active" ? "bg-green-500/15 text-green-400 border border-green-500/25" : "bg-white/5 text-white/40 border border-white/10"
          }`}>{campaign.status === "active" ? "Actif" : campaign.status}</span>
          {campaign.platforms?.map(p => (
            <span key={p} className="text-xs px-2 py-0.5 rounded-md font-medium"
              style={{ background: PLAT_COLOR[p] + "20", color: PLAT_COLOR[p] }}>
              {PLAT_LABEL[p] || p}
            </span>
          ))}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-5">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Vues totales</p>
            <p className="font-mono font-bold text-2xl text-white">{fmtViews(stats?.total_views || 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-5">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Clippeurs</p>
            <p className="font-mono font-bold text-2xl text-white">{stats?.clipper_count || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-5">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1 flex items-center gap-1.5"><Film className="w-3.5 h-3.5" />Vidéos postées</p>
            <p className="font-mono font-bold text-2xl text-white">{stats?.video_count || videos.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Budget bar */}
      {campaign.budget > 0 && (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-white/40 uppercase tracking-wide font-medium">Budget consommé</p>
              <p className="text-sm font-mono font-bold text-white">
                €{((campaign.budget_used || 0)).toFixed(0)} <span className="text-white/30 font-normal">/ €{campaign.budget.toFixed(0)}</span>
              </p>
            </div>
            <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, ((campaign.budget_used || 0) / campaign.budget) * 100)}%`,
                  background: ((campaign.budget_used || 0) / campaign.budget) > 0.85
                    ? "#ef4444"
                    : ((campaign.budget_used || 0) / campaign.budget) > 0.6
                    ? "#f0c040"
                    : "#22c55e",
                }}
              />
            </div>
            <p className="text-xs text-white/30 mt-1.5">
              {Math.round(((campaign.budget_used || 0) / campaign.budget) * 100)}% utilisé
            </p>
          </CardContent>
        </Card>
      )}

      {/* Views chart */}
      <Card className="bg-[#121212] border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#FFB300]" />
            Évolution des vues — 30 derniers jours
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="clientViewsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFB300" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#FFB300" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                  interval={Math.floor(chartData.length / 6)} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={v => fmtViews(v)} />
                <Tooltip
                  contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                  labelStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}
                  itemStyle={{ color: "#FFB300", fontFamily: "monospace" }}
                  formatter={(v) => [fmtViews(v), "Vues"]}
                />
                <Area type="monotone" dataKey="vues" stroke="#FFB300" strokeWidth={2}
                  fill="url(#clientViewsGrad)" dot={false} activeDot={{ r: 4, fill: "#FFB300" }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center">
              <p className="text-white/30 text-sm">Pas encore de données de tracking</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs + Sort */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
          {[{ id: "videos", label: `Vidéos (${videos.length})` }, { id: "clippers", label: `Clippeurs (${stats?.clipper_count || 0})` }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? "bg-[#FFB300] text-black" : "text-white/50 hover:text-white"}`}>
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === "videos" && videos.length > 0 && (
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
            {[{ id: "recent", label: "Plus récent" }, { id: "views", label: "Plus de vues" }].map(s => (
              <button key={s.id} onClick={() => setSortBy(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sortBy === s.id ? "bg-[#FFB300] text-black" : "text-white/50 hover:text-white"}`}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Videos grid */}
      {activeTab === "videos" && (
        videos.length === 0 ? (
          <Card className="bg-[#121212] border-white/10">
            <CardContent className="p-10 text-center">
              <Film className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/40">Aucune vidéo trackée pour le moment</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {sortedVideos.map((v) => {
              const color = PLAT_COLOR[v.platform] || "#fff";
              return (
                <a key={v.video_id} href={v.url} target="_blank" rel="noreferrer"
                  className="group block rounded-xl overflow-hidden bg-[#121212] border border-white/10 hover:border-white/20 transition-all hover:-translate-y-0.5">
                  {/* Thumbnail */}
                  <div className="relative w-full aspect-video bg-white/5">
                    {v.thumbnail_url ? (
                      <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover"
                        onError={e => { e.target.style.display = "none"; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">
                        {v.platform === "tiktok" ? "♪" : v.platform === "instagram" ? "📷" : "▶"}
                      </div>
                    )}
                    {/* Platform badge */}
                    <span className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: color + "cc", color: "#000" }}>
                      {PLAT_LABEL[v.platform] || v.platform}
                    </span>
                    {/* External link */}
                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink className="w-3.5 h-3.5 text-white drop-shadow" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-2.5">
                    {v.title && (
                      <p className="text-white/70 text-[11px] leading-tight line-clamp-2 mb-1.5">{v.title}</p>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-white/40">
                      <span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" />{fmtViews(v.views)}</span>
                      {v.likes > 0 && <span className="flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" />{fmtViews(v.likes)}</span>}
                    </div>
                    <p className="text-white/25 text-[10px] mt-1 truncate">{v.clipper_name}</p>
                    {v.published_at && (
                      <p className="text-white/20 text-[9px]">
                        {new Date(v.published_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </p>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )
      )}

      {/* Clippers tab */}
      {activeTab === "clippers" && (
        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-4">
            {!stats?.clipper_stats?.length ? (
              <div className="py-8 text-center">
                <Users className="w-8 h-8 text-white/20 mx-auto mb-2" />
                <p className="text-white/40">Aucun clippeur actif</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.clipper_stats.map((c, i) => (
                  <div key={c.user_id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                    <span className="font-mono font-bold text-[#FFB300] w-6 text-sm">#{i + 1}</span>
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-[#FFB300]/20 flex items-center justify-center flex-shrink-0">
                      {c.picture ? <img src={c.picture} alt="" className="w-full h-full object-cover" /> :
                        <span className="text-[#FFB300] text-xs font-bold">{(c.display_name || "C")[0]}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{c.display_name}</p>
                      <p className="text-white/30 text-xs">{c.post_count} vidéo{c.post_count !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-white font-mono text-sm font-bold">{fmtViews(c.views)}</p>
                      <p className="text-white/30 text-xs">vues</p>
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

// ─── Settings ────────────────────────────────────────────────────────────────
function SettingsPage() {
  const { user, logout } = useAuth();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8" data-testid="client-settings-page">
      <div>
        <h1 className="font-bold text-3xl text-white mb-2">Paramètres</h1>
        <p className="text-white/50">Informations de votre compte</p>
      </div>
      <Card className="bg-[#121212] border-white/10">
        <CardHeader><CardTitle className="text-white">Profil</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-1">Nom</label>
            <p className="text-white">{user?.display_name || user?.name}</p>
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1">Email</label>
            <p className="text-white/50">{user?.email}</p>
          </div>
        </CardContent>
      </Card>
      <Button variant="outline" onClick={logout}
        className="border-red-500/30 text-red-400 hover:bg-red-500/10" data-testid="logout-btn-client">
        Se déconnecter
      </Button>
    </motion.div>
  );
}

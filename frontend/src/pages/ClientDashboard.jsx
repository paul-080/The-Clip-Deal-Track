import { useState, useEffect } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useAuth, API } from "../App";
import Sidebar from "../components/Sidebar";
import { motion } from "framer-motion";
import { Settings, MessageCircle, Video, Eye, Users, TrendingUp, Heart, ExternalLink, Film, HelpCircle, RefreshCw } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState("overview");
  const [allVideos, setAllVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [viewsTimeline, setViewsTimeline] = useState(null);
  const [viewsPeriod, setViewsPeriod] = useState("30");
  const [viewsLoading, setViewsLoading] = useState(false);
  const [topClips, setTopClips] = useState([]);
  const [topClipsLoading, setTopClipsLoading] = useState(false);
  const [sortField, setSortField] = useState("views");
  const [sortDir, setSortDir] = useState("desc");

  const fmt = fmtViews;
  const PLAT_COLOR_MAP = { tiktok: "#00E5FF", instagram: "#FF007F", youtube: "#FF4444" };
  const PLAT_ICON = { tiktok: "🎵", instagram: "📸", youtube: "▶️" };

  useEffect(() => {
    if (campaignId) {
      fetchStats();
      fetchAllVideos();
      fetchViewsTimeline("30");
      fetchTopClips();
      const interval = setInterval(fetchTopClips, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [campaignId]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/stats`, { credentials: "include" });
      if (res.ok) setStats(await res.json());
    } catch {}
  };

  const fetchAllVideos = async () => {
    setVideosLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/videos`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setAllVideos(d.videos || []); }
    } catch {} finally { setVideosLoading(false); }
  };

  const fetchViewsTimeline = async (d = viewsPeriod) => {
    setViewsLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/views-chart?days=${d}`, { credentials: "include" });
      if (res.ok) setViewsTimeline(await res.json());
    } catch {} finally { setViewsLoading(false); }
  };

  const fetchTopClips = async () => {
    setTopClipsLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/top-clips?limit=10`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setTopClips(d.clips || []); }
    } catch {} finally { setTopClipsLoading(false); }
  };

  if (!campaign) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-white/40">Campagne non trouvée</p>
    </div>
  );

  const isClickCampaign = campaign.payment_model === "clicks";

  // Chart data
  const chartData = viewsTimeline?.data?.map(d => ({
    date: new Date(d.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    vues: d.views,
  })) || (stats?.views_chart || []).map(d => ({
    date: new Date(d.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    vues: d.views,
  }));

  // Sort videos
  const sortedVideos = [...allVideos].sort((a, b) => {
    const va = a[sortField] ?? 0, vb = b[sortField] ?? 0;
    return sortDir === "desc" ? vb - va : va - vb;
  });

  const totalViews = stats?.total_views || 0;
  const totalLikes = allVideos.reduce((s, v) => s + (v.likes || 0), 0);
  const engRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(1) + "%" : "—";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6" data-testid="client-campaign-view">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl text-white mb-1">{campaign.name}</h1>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
              campaign.status === "active" ? "bg-green-500/15 text-green-400 border-green-500/25" : "bg-white/5 text-white/40 border-white/10"
            }`}>{campaign.status === "active" ? "Actif" : campaign.status}</span>
            {campaign.platforms?.map(p => (
              <span key={p} className="text-xs px-2 py-0.5 rounded-md font-medium"
                style={{ background: PLAT_COLOR_MAP[p] + "20", color: PLAT_COLOR_MAP[p] }}>
                {PLAT_LABEL[p] || p}
              </span>
            ))}
          </div>
        </div>
        <button onClick={() => { fetchStats(); fetchAllVideos(); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-sm transition-all">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {/* TABS */}
      <div className="flex gap-0 bg-white/5 rounded-xl p-1 w-fit border border-white/10">
        {[
          { id: "overview", label: "Vue d'ensemble" },
          { id: "videos", label: `Vidéos (${allVideos.length})`, dot: videosLoading },
          { id: "clip-winner", label: "🏆 Clip Winner" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id ? "bg-[#FFB300] text-black shadow-lg" : "text-white/50 hover:text-white"
            }`}>
            {tab.label}
            {tab.dot && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
          </button>
        ))}
      </div>

      {/* ══ VUE D'ENSEMBLE ══ */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Vues totales", value: fmt(totalViews), color: "text-white" },
              { label: "Clippeurs actifs", value: stats?.clipper_count || 0, color: "text-[#FFB300]" },
              { label: "Vidéos postées", value: allVideos.length, color: "text-white" },
              { label: "Audience qualifiée", value: engRate, color: "text-[#39FF14]" },
            ].map(kpi => (
              <div key={kpi.label} className="bg-[#121212] border border-white/10 rounded-xl p-4">
                <p className="text-xs text-white/35 mb-1">{kpi.label}</p>
                <p className={`font-mono font-bold text-2xl ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-2">
            <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
              {[{ id: "7", label: "7 jours" }, { id: "30", label: "30 jours" }, { id: "90", label: "90 jours" }].map(p => (
                <button key={p.id} onClick={() => { setViewsPeriod(p.id); fetchViewsTimeline(p.id); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewsPeriod === p.id ? "bg-[#FFB300] text-black" : "text-white/50 hover:text-white"}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {viewsLoading && <div className="w-4 h-4 border-2 border-[#FFB300]/30 border-t-[#FFB300] rounded-full animate-spin" />}
          </div>

          {/* Chart */}
          <div className="bg-[#121212] border border-white/10 rounded-xl p-5">
            <p className="text-white/50 text-xs mb-4 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-[#FFB300]" />
              Vues par jour
            </p>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="clientGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFB300" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FFB300" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                    interval={Math.max(0, Math.floor(chartData.length / 7) - 1)} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                    labelStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}
                    itemStyle={{ color: "#FFB300", fontFamily: "monospace" }}
                    formatter={(v) => [fmt(v), "Vues"]}
                  />
                  <Area type="monotone" dataKey="vues" stroke="#FFB300" strokeWidth={2}
                    fill="url(#clientGrad)" dot={false} activeDot={{ r: 4, fill: "#FFB300" }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center">
                <p className="text-white/30 text-sm">Pas encore de données de tracking</p>
              </div>
            )}
          </div>

          {/* Clippers ranking */}
          {stats?.clipper_stats?.length > 0 && (
            <div className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden">
              <p className="text-white/50 text-xs px-4 py-3 border-b border-white/5 flex items-center gap-2">
                <Users className="w-3.5 h-3.5" /> Classement des clippeurs
              </p>
              <div className="divide-y divide-white/5">
                {stats.clipper_stats.map((c, i) => (
                  <div key={c.user_id} className="flex items-center gap-3 px-4 py-3">
                    <span className="font-mono font-bold text-[#FFB300] w-6 text-sm">#{i + 1}</span>
                    <div className="w-7 h-7 rounded-full bg-[#FFB300]/15 flex items-center justify-center flex-shrink-0 text-xs font-bold text-[#FFB300]">
                      {(c.display_name || "C")[0]}
                    </div>
                    <p className="flex-1 text-white text-sm truncate">{c.display_name}</p>
                    <p className="font-mono text-sm font-bold text-white">{fmt(c.views)}</p>
                    <p className="text-white/30 text-xs w-8">vues</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ VIDÉOS ══ */}
      {activeTab === "videos" && (
        <div className="space-y-3">
          {/* Sort bar */}
          <div className="flex items-center gap-2">
            <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
              {[{ id: "views", label: "Vues" }, { id: "likes", label: "Likes" }, { id: "published_at", label: "Date" }].map(s => (
                <button key={s.id} onClick={() => { if (sortField === s.id) setSortDir(d => d === "desc" ? "asc" : "desc"); else { setSortField(s.id); setSortDir("desc"); } }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sortField === s.id ? "bg-[#FFB300] text-black" : "text-white/50 hover:text-white"}`}>
                  {s.label} {sortField === s.id ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </button>
              ))}
            </div>
          </div>

          {videosLoading && allVideos.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#FFB300]/30 border-t-[#FFB300] rounded-full animate-spin" />
            </div>
          ) : allVideos.length === 0 ? (
            <div className="text-center py-16 text-white/30 bg-[#121212] rounded-xl border border-white/10">
              <Film className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucune vidéo trackée pour le moment</p>
            </div>
          ) : (
            <div className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-4 py-3 border-b border-white/5 text-xs text-white/35 font-medium uppercase tracking-wide">
                <div>Vidéo</div><div>Vues</div><div>Likes</div><div>Date</div>
              </div>
              <div className="divide-y divide-white/5">
                {sortedVideos.map((video, i) => {
                  const color = PLAT_COLOR_MAP[video.platform] || "#fff";
                  return (
                    <a key={video.video_id || i} href={video.url} target="_blank" rel="noopener noreferrer"
                      className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-4 py-3 hover:bg-white/5 transition-all group items-center">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative w-14 h-10 rounded-md overflow-hidden flex-shrink-0 bg-white/10">
                          {video.thumbnail_url
                            ? <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = "none"; }} />
                            : <div className="w-full h-full flex items-center justify-center text-lg">{PLAT_ICON[video.platform]}</div>}
                          <span className="absolute bottom-0.5 left-0.5 text-[8px] font-bold px-1 rounded"
                            style={{ background: `${color}ee`, color: "#000" }}>{video.platform}</span>
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ExternalLink className="w-3 h-3 text-white" />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm truncate">{video.title || `Vidéo ${video.platform}`}</p>
                          <p className="text-white/30 text-xs truncate">{video.clipper_name}</p>
                        </div>
                      </div>
                      <div className="text-white font-mono text-sm">{fmt(video.views || 0)}</div>
                      <div className="flex items-center gap-1 text-[#FF007F] text-sm font-mono">
                        <Heart className="w-3 h-3" />{fmt(video.likes || 0)}
                      </div>
                      <div className="text-white/40 text-xs">
                        {video.published_at ? new Date(video.published_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ CLIP WINNER ══ */}
      {activeTab === "clip-winner" && (
        <ClientClipWinner clips={topClips} loading={topClipsLoading} onRefresh={fetchTopClips} />
      )}
    </motion.div>
  );
}

// ─── Client Clip Winner (inline, same design as agency) ───────────────────────
function ClientClipWinner({ clips, loading, onRefresh }) {
  const engRate = (clip) => {
    if (!clip.views) return "—";
    return (((clip.likes || 0) + (clip.comments || 0)) / clip.views * 100).toFixed(1) + "%";
  };
  const medalColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
  const platColor = { tiktok: "#00E5FF", instagram: "#FF007F", youtube: "#FF4444" };
  const platIcon = { tiktok: "🎵", instagram: "📸", youtube: "▶️" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-lg flex items-center gap-2">🏆 Top 10 — Clips les plus vus</h3>
          <p className="text-white/35 text-xs mt-0.5">Toutes plateformes · auto-refresh 5 min</p>
        </div>
        <button onClick={onRefresh} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-sm transition-all border border-white/10 disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </div>

      {loading && clips.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#FFB300]/30 border-t-[#FFB300] rounded-full animate-spin" />
        </div>
      ) : clips.length === 0 ? (
        <div className="text-center py-16 text-white/30 bg-[#121212] rounded-xl border border-white/10">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-sm">Aucun clip tracké pour l'instant</p>
        </div>
      ) : (
        <div className="space-y-2">
          {clips.map((clip, i) => {
            const bc = i < 3 ? `${medalColors[i]}50` : "rgba(255,255,255,0.08)";
            const pc = platColor[clip.platform] || "#fff";
            return (
              <div key={clip.video_id || i} className="flex items-center gap-4 bg-[#121212] rounded-xl p-3"
                style={{ border: `1px solid ${bc}` }}>
                <div className="w-9 flex-shrink-0 text-center">
                  {i < 3
                    ? <span className="text-2xl font-bold" style={{ color: medalColors[i] }}>{i + 1}</span>
                    : <span className="text-lg font-bold text-white/25">#{i + 1}</span>}
                </div>
                <a href={clip.url} target="_blank" rel="noopener noreferrer"
                  className="relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden bg-white/5 group/t cursor-pointer">
                  {clip.thumbnail_url
                    ? <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover group-hover/t:scale-105 transition-transform" />
                    : <div className="w-full h-full flex items-center justify-center text-2xl">{platIcon[clip.platform]}</div>}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/t:opacity-100 transition-opacity flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                  <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold px-1 py-0.5 rounded"
                    style={{ background: `${pc}dd`, color: "#000" }}>{clip.platform}</span>
                </a>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {clip.title ? clip.title.slice(0, 40) + (clip.title.length > 40 ? "…" : "") : "—"}
                  </p>
                  <p className="text-white/30 text-xs mt-0.5">{clip.clipper_name || "—"}</p>
                </div>
                <div className="flex-shrink-0 flex gap-5 items-center">
                  <div className="text-center">
                    <p className="font-mono font-bold text-white text-sm">{fmtViews(clip.views || 0)}</p>
                    <p className="text-[10px] text-white/30">vues</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono font-bold text-[#FF007F] text-sm">{fmtViews(clip.likes || 0)}</p>
                    <p className="text-[10px] text-white/30">likes</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono font-bold text-[#FFB300] text-sm">{engRate(clip)}</p>
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

import { useState, useEffect, useMemo } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useAuth, API } from "../App";
import Sidebar from "../components/Sidebar";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Settings, MessageCircle, Video, Eye, Users, TrendingUp, Heart, ExternalLink, Film, HelpCircle, RefreshCw, Search, X, Compass, CheckCircle, Clock, DollarSign, Zap } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import ChatPanel from "../components/ChatPanel";
import SupportPage from "../components/SupportPage";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const ACCENT_COLOR = "#FFB300";

// PRECIS — pas d'arrondi (ex: 22 643 au lieu de "22.6K")
const fmtViews = (n) => {
  if (!n || n === 0) return "0";
  return Math.floor(Number(n)).toLocaleString("fr-FR");
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
    { id: "discover", label: "Découvrir", icon: Compass, path: "/client/discover" },
    { type: "divider" },
    { type: "section", label: "MES CAMPAGNES" },
    ...campaigns.map((c) => ({
      id: `campaign-${c.campaign_id}`,
      label: c.name,
      icon: Video,
      path: `/client/campaign/${c.campaign_id}`,
    })),
    { type: "divider" },
    { id: "support", label: "Support", icon: HelpCircle, path: "/client/support", badge: supportUnread },
    { id: "settings", label: "Paramètres", icon: Settings, path: "/client/settings" },
  ];

  return (
    <div className="flex min-h-screen bg-[#0A0A0A]">
      <Sidebar items={sidebarItems} accentColor={ACCENT_COLOR} role="client" />
      <main className="flex-1 md:ml-60 p-4 pt-16 md:p-8">
        <Routes>
          <Route index element={<ClientHome campaigns={campaigns} loading={loading} />} />
          <Route path="discover" element={<DiscoverCampaigns onJoin={fetchData} />} />
          <Route path="campaign/:campaignId" element={<CampaignView campaigns={campaigns} />} />
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
            <p className="text-white/30 text-sm mt-1 mb-6">Découvrez les campagnes actives et rejoignez-en une pour voir les stats en temps réel.</p>
            <button onClick={() => navigate("/client/discover")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all"
              style={{ background: "#FFB300", color: "#000" }}>
              <Compass className="w-4 h-4" /> Découvrir les campagnes
            </button>
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
  const [activeTab, setActiveTab] = useState("overview");
  const [allVideos, setAllVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [viewsTimeline, setViewsTimeline] = useState(null);
  const [viewsPeriod, setViewsPeriod] = useState("30");
  const [viewsTimelineLoading, setViewsTimelineLoading] = useState(false);
  const [topClips, setTopClips] = useState([]);
  const [topClipsLoading, setTopClipsLoading] = useState(false);
  const [sortField, setSortField] = useState("published_at");
  const [sortDir, setSortDir] = useState("desc");
  const [filterPlatform, setFilterPlatform] = useState("all");

  const fmt = fmtViews;
  const PLAT_COLOR_MAP = { tiktok: "#00E5FF", instagram: "#FF007F", youtube: "#FF4444" };
  const PLAT_ICON = { tiktok: "🎵", instagram: "📸", youtube: "▶️" };

  useEffect(() => {
    if (campaignId) {
      fetchAllVideos();
      fetchViewsTimeline("30");
      fetchTopClips();
      const interval = setInterval(fetchTopClips, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [campaignId]);

  const fetchAllVideos = async () => {
    setVideosLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/videos`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setAllVideos(d.videos || []); }
    } catch {} finally { setVideosLoading(false); }
  };

  const fetchViewsTimeline = async (d = viewsPeriod) => {
    setViewsTimelineLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/views-chart?days=${d}`, { credentials: "include" });
      if (res.ok) setViewsTimeline(await res.json());
    } catch {} finally { setViewsTimelineLoading(false); }
  };

  const fetchTopClips = async (period = "all") => {
    setTopClipsLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/top-clips?limit=10&period=${period}`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setTopClips(d.clips || []); }
    } catch {} finally { setTopClipsLoading(false); }
  };

  if (!campaign) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-white/40">Campagne non trouvée</p>
    </div>
  );

  // ── KPIs (same as agency, without gains estimés) ──────────────────────────
  const totalViews = allVideos.reduce((s, v) => s + (v.views || 0), 0);
  const totalLikes = allVideos.reduce((s, v) => s + (v.likes || 0), 0);
  const totalComments = allVideos.reduce((s, v) => s + (v.comments || 0), 0);
  const engagementRate = totalViews > 0 ? ((totalLikes + totalComments) / totalViews * 100).toFixed(1) : "0.0";
  const avgViews = allVideos.length > 0 ? Math.round(totalViews / allVideos.length) : 0;

  // ── Chart data (same format as agency) ───────────────────────────────────
  const isHourly = viewsTimeline?.granularity === "hourly";
  const tlData = (viewsTimeline?.timeline || []).map(d => {
    const dateKey = (d.date || "").length >= 10 ? (d.date || "").slice(0, 10) : (d.date || "");
    const videosPosted = isHourly
      ? allVideos.filter(v => v.published_at && v.published_at.slice(0, 13) === dateKey.slice(0, 13)).length
      : allVideos.filter(v => v.published_at && v.published_at.slice(0, 10) === dateKey).length;
    return {
      ...d,
      videos_posted: videosPosted,
      label: new Date(d.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    };
  });
  const hasChartData = tlData.some(d => d.views > 0);

  // ── Filtered + sorted videos ──────────────────────────────────────────────
  const displayVideos = [...allVideos]
    .filter(v => filterPlatform === "all" || v.platform === filterPlatform)
    .sort((a, b) => {
      let av = a[sortField] ?? 0, bv = b[sortField] ?? 0;
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  // Guard : campaign peut etre undefined si l'ID est invalide ou si campaigns n'est pas encore charge
  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-white/60 text-base mb-2">Campagne introuvable</p>
        <p className="text-white/30 text-sm">Cette campagne n'existe plus ou vous n'y avez pas accès.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6" data-testid="client-campaign-view">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-1">{campaign.name}</h1>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
              campaign.status === "active" ? "bg-green-500/15 text-green-400 border-green-500/25" : "bg-white/5 text-white/40 border-white/10"
            }`}>{campaign.status === "active" ? "Actif" : campaign.status}</span>
            <span className="text-white/30 text-xs">{allVideos.length} vidéos trackées</span>
          </div>
        </div>
        <button onClick={() => { fetchAllVideos(); fetchViewsTimeline(viewsPeriod); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-sm transition-all">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {/* TABS — same style as agency */}
      <div className="flex gap-0 bg-white/5 rounded-xl p-1 w-fit border border-white/10">
        {[
          { id: "overview", label: "Vue d'ensemble" },
          { id: "videos",   label: `Vidéos (${allVideos.length})`, dot: videosLoading },
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

      {/* ══ OVERVIEW TAB ══ */}
      {activeTab === "overview" && (
        <div className="space-y-5">

          {/* KPI row — same as agency (5 cards, no gains estimés) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: "Vues totales",    value: fmt(totalViews),      color: "text-white" },
              { label: "Likes",           value: fmt(totalLikes),      color: "text-[#FFB300]" },
              { label: "Commentaires",    value: fmt(totalComments),   color: "text-white/70" },
              { label: "Engagement",      value: `${engagementRate}%`, color: "text-[#39FF14]" },
              { label: "Moy. vues/vidéo", value: fmt(avgViews),        color: "text-[#00E5FF]" },
            ].map(kpi => (
              <div key={kpi.label} className="bg-[#121212] border border-white/10 rounded-xl p-4">
                <p className="text-xs text-white/40 mb-1">{kpi.label}</p>
                <p className={`font-mono font-bold text-xl ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Views timeline chart — period selector inside card (same as agency) */}
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
                {viewsTimelineLoading && <div className="w-4 h-4 border-2 border-[#FFB300]/30 border-t-[#FFB300] rounded-full animate-spin" />}
              </div>
            </div>
            {hasChartData ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={tlData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="clientViewsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFB300" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FFB300" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false}
                    interval={Math.max(0, Math.floor(tlData.length / 10) - 1)} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const p = payload[0]?.payload || {};
                      const views = p.views || 0;
                      const videosPosted = p.videos_posted || 0;
                      return (
                        <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px" }}>
                          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginBottom: 6 }}>{label}</div>
                          <div style={{ color: "#FFB300", fontSize: 14, fontWeight: 600 }}>
                            {fmt(views)} <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 400 }}>{isHourly ? "nouvelles vues" : "vues"}</span>
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 4 }}>
                            📹 {videosPosted} vidéo{videosPosted > 1 ? "s" : ""} posté{videosPosted > 1 ? "es" : "e"} {isHourly ? "cette heure" : "ce jour"}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="views" stroke="#FFB300" strokeWidth={2} fill="url(#clientViewsGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center">
                {viewsTimelineLoading
                  ? <div className="w-6 h-6 border-2 border-[#FFB300]/30 border-t-[#FFB300] rounded-full animate-spin" />
                  : <p className="text-white/20 text-sm">Aucune donnée — les vues s'accumulent au fur et à mesure du tracking</p>
                }
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ VIDEOS TAB ══ */}
      {activeTab === "videos" && (
        <div className="space-y-3">
          {/* Barre tri + filtre */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Tri */}
            <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
              {[
                { id: "views",        label: "🔥 Plus de vues" },
                { id: "published_at", label: "🕐 Plus récent"  },
              ].map(s => (
                <button key={s.id} onClick={() => { setSortField(s.id); setSortDir(s.id === "published_at" ? "desc" : "desc"); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sortField === s.id ? "bg-[#FFB300] text-black" : "text-white/40 hover:text-white"}`}>
                  {s.label}
                </button>
              ))}
            </div>
            {/* Filtre plateforme */}
            <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
              {[["all","Toutes"],["tiktok","🎵 TikTok"],["instagram","📸 Insta"],["youtube","▶️ YouTube"]].map(([p, label]) => (
                <button key={p} onClick={() => setFilterPlatform(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterPlatform === p ? "bg-white/15 text-white" : "text-white/40 hover:text-white"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {videosLoading && allVideos.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#FFB300]/30 border-t-[#FFB300] rounded-full animate-spin" />
            </div>
          ) : displayVideos.length === 0 ? (
            <div className="text-center py-16 text-white/30 bg-[#121212] rounded-xl border border-white/10">
              <Film className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucune vidéo trackée pour le moment</p>
            </div>
          ) : (
            /* ── même style que Clip Winner ── */
            <div className="space-y-2">
              {displayVideos.map((video, i) => {
                const pc = PLAT_COLOR_MAP[video.platform] || "#fff";
                const engRate = video.views
                  ? (((video.likes || 0) + (video.comments || 0)) / video.views * 100).toFixed(1) + "%"
                  : "—";
                const medalColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
                const borderColor = i < 3 ? `${medalColors[i]}50` : "rgba(255,255,255,0.08)";
                return (
                  <div key={video.video_id || i}
                    className="flex items-center gap-4 bg-[#121212] rounded-xl p-3"
                    style={{ border: `1px solid ${borderColor}` }}>
                    {/* Rang */}
                    <div className="w-9 flex-shrink-0 text-center">
                      {i < 3
                        ? <span className="text-2xl font-bold" style={{ color: medalColors[i] }}>{i + 1}</span>
                        : <span className="text-lg font-bold text-white/25">#{i + 1}</span>}
                    </div>
                    {/* Thumbnail */}
                    <a href={video.url} target="_blank" rel="noopener noreferrer"
                      className="relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden bg-white/5 group/t cursor-pointer">
                      {video.thumbnail_url
                        ? <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover group-hover/t:scale-105 transition-transform" />
                        : <div className="w-full h-full flex items-center justify-center text-2xl">{PLAT_ICON[video.platform]}</div>}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/t:opacity-100 transition-opacity flex items-center justify-center">
                        <ExternalLink className="w-4 h-4 text-white" />
                      </div>
                      <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold px-1 py-0.5 rounded"
                        style={{ background: `${pc}dd`, color: "#000" }}>{video.platform}</span>
                    </a>
                    {/* Titre */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {video.title ? video.title.slice(0, 50) + (video.title.length > 50 ? "…" : "") : "—"}
                      </p>
                      <p className="text-white/30 text-xs mt-0.5">
                        {video.published_at ? new Date(video.published_at).toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"2-digit" }) : "—"}
                      </p>
                    </div>
                    {/* Stats */}
                    <div className="flex-shrink-0 flex gap-5 items-center">
                      <div className="text-center" title={video.platform === "instagram" ? "Vues Insta officielles (Meta API > 1s lecture). L'app Insta peut afficher un total IG+Facebook plus élevé." : ""}>
                        <p className="font-mono font-bold text-white text-sm">
                          {fmt(video.views || 0)}{video.platform === "instagram" && <span className="opacity-50 text-[10px] ml-0.5">ⓘ</span>}
                        </p>
                        <p className="text-[10px] text-white/30">vues</p>
                      </div>
                      <div className="text-center">
                        <p className="font-mono font-bold text-[#FF007F] text-sm">{fmt(video.likes || 0)}</p>
                        <p className="text-[10px] text-white/30">likes</p>
                      </div>
                      <div className="text-center">
                        <p className="font-mono font-bold text-[#FFB300] text-sm">{engRate}</p>
                        <p className="text-[10px] text-white/30">eng.</p>
                      </div>
                    </div>
                  </div>
                );
              })}
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
  const [period, setPeriod] = useState("all");
  const periodLabel = { "24h":"Dernières 24h","7d":"7 derniers jours","30d":"30 derniers jours","all":"Depuis toujours" }[period];
  useEffect(() => { if (onRefresh) onRefresh(period); /* eslint-disable-next-line */ }, [period]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-white font-semibold text-lg flex items-center gap-2">🏆 Top 10 — Clips les plus vus</h3>
          <p className="text-white/35 text-xs mt-0.5">{periodLabel} · auto-refresh 5 min</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5 gap-0.5">
            {[["24h","24h"],["7d","7j"],["30d","30j"],["all","Tout"]].map(([val, label]) => (
              <button key={val} onClick={() => setPeriod(val)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${period === val ? "bg-[#FFB300] text-black" : "text-white/50 hover:text-white"}`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => onRefresh && onRefresh(period)} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-sm transition-all border border-white/10 disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </button>
        </div>
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

// ─── Discover Campaigns ───────────────────────────────────────────────────────
function DiscoverCampaigns({ onJoin }) {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState({});
  const [search, setSearch] = useState("");

  useEffect(() => { fetchDiscover(); }, []);

  const fetchDiscover = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/campaigns/discover`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json();
        setCampaigns(d.campaigns || []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleJoin = async (campaignId) => {
    if (joining[campaignId]) return;
    setJoining((p) => ({ ...p, [campaignId]: true }));
    try {
      const res = await fetch(`${API}/campaigns/${campaignId}/join-as-client`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Candidature envoyée ! En attente de validation par l'agence.");
        // Update user_status in local list immediately
        setCampaigns((prev) =>
          prev.map((c) => c.campaign_id === campaignId ? { ...c, user_status: "pending" } : c)
        );
        onJoin && onJoin(); // refresh sidebar
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.detail || "Erreur lors de la candidature");
      }
    } catch { toast.error("Impossible d'envoyer la candidature"); }
    finally { setJoining((p) => ({ ...p, [campaignId]: false })); }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return campaigns;
    const q = search.toLowerCase();
    return campaigns.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.agency_name?.toLowerCase().includes(q)
    );
  }, [campaigns, search]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-white mb-1 flex items-center gap-3">
            <Compass className="w-8 h-8" style={{ color: "#FFB300" }} />
            Découvrir les campagnes
          </h1>
          <p className="text-white/40 text-sm">Rejoignez une campagne pour accéder aux statistiques en temps réel</p>
        </div>
        <button onClick={fetchDiscover}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-sm transition-all border border-white/10">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une campagne ou agence..."
          className="w-full bg-[#121212] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#FFB300]/40"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map((i) => <div key={i} className="h-56 bg-white/5 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-white/30 bg-[#121212] rounded-xl border border-white/10">
          <Compass className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? "Aucune campagne ne correspond à votre recherche" : "Aucune campagne disponible pour le moment"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => {
            // user_status is returned by the backend discover endpoint
            const status = c.user_status; // null | "pending" | "active" | "rejected"

            return (
              <div key={c.campaign_id}
                className="bg-[#121212] border border-white/10 rounded-2xl p-5 flex flex-col gap-4 hover:border-[#FFB300]/30 transition-all">

                {/* Top: name + status badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-base leading-tight mb-0.5 truncate">{c.name}</h3>
                    {c.agency_name && <p className="text-white/40 text-xs truncate">{c.agency_name}</p>}
                  </div>
                  {status === "active" ? (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: "#22c55e20", color: "#22c55e", border: "1px solid #22c55e30" }}>
                      <CheckCircle className="w-2.5 h-2.5" /> Accès autorisé
                    </span>
                  ) : status === "pending" ? (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: "#f5a62320", color: "#f5a623", border: "1px solid #f5a62330" }}>
                      <Clock className="w-2.5 h-2.5" /> En attente
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: "#ffffff10", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      Ouvert
                    </span>
                  )}
                </div>

                {/* Platforms */}
                <div className="flex flex-wrap gap-1.5">
                  {(c.platforms || []).map((p) => (
                    <span key={p} className="text-[10px] px-2 py-0.5 rounded-md font-medium"
                      style={{ background: (PLAT_COLOR[p] || "#fff") + "22", color: PLAT_COLOR[p] || "#fff" }}>
                      {PLAT_LABEL[p] || p}
                    </span>
                  ))}
                  {!c.platforms?.length && (
                    <span className="text-[10px] text-white/20">Aucune plateforme</span>
                  )}
                </div>

                {/* Stats row — RPM et budget MASQUES pour le client (info commerciale agence-only) */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-white/35 mb-0.5">Clippers</p>
                    <p className="font-mono font-bold text-sm text-white">
                      {c.clipper_count ?? "—"}
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-white/35 mb-0.5">Vues</p>
                    <p className="font-mono font-bold text-sm text-white">
                      {fmtViews(c.total_views || 0)}
                    </p>
                  </div>
                </div>

                {/* CTA */}
                {status === "active" ? (
                  <button onClick={() => navigate(`/client/campaign/${c.campaign_id}`)}
                    className="w-full py-2 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: "#FFB30020", color: "#FFB300", border: "1px solid #FFB30030" }}>
                    📊 Voir les statistiques
                  </button>
                ) : status === "pending" ? (
                  <button disabled
                    className="w-full py-2 rounded-xl text-sm font-medium opacity-50 cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Clock className="w-3.5 h-3.5" /> Candidature en attente
                  </button>
                ) : (
                  <button onClick={() => handleJoin(c.campaign_id)} disabled={joining[c.campaign_id]}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
                    style={{ background: "#FFB300", color: "#000" }}>
                    {joining[c.campaign_id] ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        Envoi...
                      </span>
                    ) : "Rejoindre pour voir les stats"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
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

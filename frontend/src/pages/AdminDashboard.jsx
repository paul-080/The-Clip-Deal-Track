import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard, Users, Play, Building2, Briefcase, UserCircle,
  Plug, Settings, LogOut, RefreshCw, Trash2, Ban, CheckCircle2,
  XCircle, AlertCircle, Clock, Database, Youtube, Zap, CreditCard,
  Globe, Eye, ExternalLink, Shield, AlertTriangle,
  MessageCircle, Send, MousePointerClick, TrendingUp, X, ChevronDown
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { API } from "../App";

const ADMIN_CODE_KEY = "admin_code";

// ─── helpers ────────────────────────────────────────────────────────────────

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Admin-Code": localStorage.getItem(ADMIN_CODE_KEY) || "",
  };
}

async function adminFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...adminHeaders(), ...(opts.headers || {}) },
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Erreur inconnue" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function roleBadge(role) {
  const colors = {
    clipper: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    agency: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    manager: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    client: "bg-green-500/20 text-green-300 border-green-500/30",
    admin: "bg-red-500/20 text-red-300 border-red-500/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors[role] || "bg-white/10 text-white/60 border-white/10"}`}>
      {role || "—"}
    </span>
  );
}

// ─── CodeGate ────────────────────────────────────────────────────────────────

function CodeGate({ onUnlock }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`${API}/admin/verify`, {
        headers: { "X-Admin-Code": code },
        credentials: "include",
      }).then(async (r) => {
        if (!r.ok) throw new Error("invalid");
      });
      localStorage.setItem(ADMIN_CODE_KEY, code);
      onUnlock();
    } catch {
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-full max-w-sm p-8">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-6">
            <Shield className="w-8 h-8 text-[#00E5FF]" />
            <span className="text-2xl font-bold">
              <span className="text-[#00E5FF]">The Clip</span>
              <span className="text-white"> Deal</span>
            </span>
          </div>
          <p className="text-white/40 text-sm">Accès administrateur restreint</p>
        </div>

        <form onSubmit={handleSubmit} className={shake ? "animate-shake" : ""}>
          <div className="mb-4">
            <label className="block text-xs text-white/40 mb-2 uppercase tracking-wider">
              Code d'accès
            </label>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#00E5FF]/50 transition-colors text-center tracking-widest text-lg"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || !code}
            className="w-full bg-[#00E5FF] hover:bg-[#00E5FF]/90 disabled:opacity-40 text-black font-semibold py-3 rounded-lg transition-all"
          >
            {loading ? "Vérification..." : "Entrer"}
          </button>
          {shake && (
            <p className="text-red-400 text-sm text-center mt-3">Code incorrect</p>
          )}
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.4s ease; }
      `}</style>
    </div>
  );
}

// ─── OverviewTab ─────────────────────────────────────────────────────────────

function fmtNum(n) {
  if (n === undefined || n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("fr-FR");
}

// Period config
const PERIODS = [
  { key: "1",   label: "24h",    days: 1   },
  { key: "7",   label: "7j",     days: 7   },
  { key: "30",  label: "30j",    days: 30  },
  { key: "365", label: "1 an",   days: 365 },
];

function OverviewTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewsTimeline, setViewsTimeline] = useState([]);
  const [clicksTimeline, setClicksTimeline] = useState([]);
  const [activeChart, setActiveChart] = useState("views"); // "views" | "clicks"
  const [chartPeriod, setChartPeriod] = useState("30");   // "1" | "7" | "30" | "365"
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Initial load: stats + default timeline (30j)
  useEffect(() => {
    Promise.all([
      adminFetch("/admin/stats"),
      adminFetch("/admin/stats/videos-timeline?days=30").catch(() => ({ timeline: [] })),
      adminFetch("/admin/stats/clicks-timeline?days=30").catch(() => ({ timeline: [] })),
    ]).then(([s, vt, ct]) => {
      setStats(s);
      setViewsTimeline(vt.timeline || []);
      setClicksTimeline(ct.timeline || []);
    }).catch((e) => toast.error(e.message))
    .finally(() => setLoading(false));
  }, []);

  // Re-fetch timelines when period changes
  const fetchTimelines = async (days) => {
    setTimelineLoading(true);
    try {
      const [vt, ct] = await Promise.all([
        adminFetch(`/admin/stats/videos-timeline?days=${days}`).catch(() => ({ timeline: [] })),
        adminFetch(`/admin/stats/clicks-timeline?days=${days}`).catch(() => ({ timeline: [] })),
      ]);
      setViewsTimeline(vt.timeline || []);
      setClicksTimeline(ct.timeline || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTimelineLoading(false);
    }
  };

  const handlePeriodChange = (key) => {
    setChartPeriod(key);
    const p = PERIODS.find(p => p.key === key);
    if (p) fetchTimelines(p.days);
  };

  // Format x-axis label based on period
  const xTickFormatter = (val) => {
    if (chartPeriod === "1") return val;           // already "HH:00"
    if (chartPeriod === "365") {
      // "YYYY-MM" → "MMM"
      const months = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];
      const m = parseInt(val.slice(5, 7), 10);
      return months[m - 1] || val;
    }
    // daily: "YYYY-MM-DD" → "DD/MM"
    return val ? val.slice(5).replace("-", "/") : val;
  };

  const xInterval = chartPeriod === "1" ? 3 : chartPeriod === "7" ? 0 : chartPeriod === "30" ? 4 : 0;

  if (loading) return <div className="text-white/40 text-sm">Chargement...</div>;
  if (!stats) return null;

  const topCards = [
    { label: "Utilisateurs", value: stats.users, icon: Users, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Campagnes (total)", value: stats.campaigns, icon: Play, color: "text-purple-400", bg: "bg-purple-400/10" },
    { label: "Campagnes au clic", value: stats.click_campaigns || 0, icon: MousePointerClick, color: "text-[#f0c040]", bg: "bg-yellow-400/10" },
    { label: "Membres campagne", value: stats.campaign_members, icon: UserCircle, color: "text-cyan-400", bg: "bg-cyan-400/10" },
    { label: "Revenus total", value: `${(stats.total_earnings_eur || 0).toFixed(2)} €`, icon: CreditCard, color: "text-green-400", bg: "bg-green-400/10" },
    { label: "Messages", value: stats.messages, icon: MessageCircle, color: "text-pink-400", bg: "bg-pink-400/10" },
  ];

  const viewsCards = [
    { label: "Vues totales", value: fmtNum(stats.total_views || 0), icon: Eye, color: "text-[#00E5FF]", bg: "bg-[#00E5FF]/10" },
    { label: "Vidéos trackées", value: stats.tracked_videos, icon: TrendingUp, color: "text-indigo-400", bg: "bg-indigo-400/10" },
    { label: "Comptes sociaux", value: stats.social_accounts, icon: Globe, color: "text-amber-400", bg: "bg-amber-400/10" },
  ];

  const clickCards = [
    { label: "Clics totaux", value: fmtNum(stats.total_clicks || 0), icon: MousePointerClick, color: "text-[#f0c040]", bg: "bg-yellow-400/10" },
    { label: "Clics uniques", value: fmtNum(stats.total_unique_clicks || 0), icon: Shield, color: "text-green-400", bg: "bg-green-400/10" },
    { label: "Revenus au clic", value: `${(stats.click_earnings_eur || 0).toFixed(2)} €`, icon: CreditCard, color: "text-purple-400", bg: "bg-purple-400/10" },
  ];

  const hasViews = viewsTimeline.some(d => d.views > 0);
  const hasClicks = clicksTimeline.some(d => d.clicks > 0);
  const chartData = activeChart === "views" ? viewsTimeline : clicksTimeline;
  const chartHasData = activeChart === "views" ? hasViews : hasClicks;

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">Vue d'ensemble</h2>

      {/* Top row — general stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {topCards.map((card) => (
          <div key={card.label} className="bg-[#1a1a1a] border border-white/10 rounded-xl p-4">
            <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <div className="text-xl font-bold text-white">{typeof card.value === "number" ? card.value.toLocaleString("fr-FR") : card.value}</div>
            <div className="text-white/40 text-xs mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Second row — views vs clicks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Views section */}
        <div className="bg-[#1a1a1a] border border-[#00E5FF]/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-4 h-4 text-[#00E5FF]" />
            <p className="text-white font-medium text-sm">Statistiques Vues</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {viewsCards.map(c => (
              <div key={c.label} className={`${c.bg} rounded-lg p-3`}>
                <c.icon className={`w-4 h-4 ${c.color} mb-2`} />
                <div className="text-lg font-bold text-white">{typeof c.value === "number" ? c.value.toLocaleString("fr-FR") : c.value}</div>
                <div className="text-white/40 text-[10px] mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Clicks section */}
        <div className="bg-[#1a1a1a] border border-[#f0c040]/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <MousePointerClick className="w-4 h-4 text-[#f0c040]" />
            <p className="text-white font-medium text-sm">Statistiques Clics</p>
            <span className="ml-auto text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">Anti-spam actif</span>
            <button
              onClick={async () => {
                if (!window.confirm(`Réinitialiser TOUS les clics (events + counters + earnings) ?\n\nUtile pour purger les clics de test.\n\nIRRÉVERSIBLE.`)) return;
                try {
                  const res = await fetch(`${API}/admin/reset-click-stats`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Admin-Code": localStorage.getItem(ADMIN_CODE_KEY) || "" },
                    body: JSON.stringify({ confirm: "RESET_ALL_CLICKS" }),
                  });
                  if (res.ok) {
                    const d = await res.json();
                    toast.success(`✓ ${d.deleted_click_events} events purgés, ${d.reset_click_links} liens réinitialisés`);
                    setTimeout(() => window.location.reload(), 1500);
                  } else {
                    const e = await res.json();
                    toast.error(e.detail || "Erreur reset");
                  }
                } catch (e) { toast.error(e.message); }
              }}
              className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition">
              Reset clics test
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {clickCards.map(c => (
              <div key={c.label} className={`${c.bg} rounded-lg p-3`}>
                <c.icon className={`w-4 h-4 ${c.color} mb-2`} />
                <div className="text-lg font-bold text-white">{typeof c.value === "number" ? c.value.toLocaleString("fr-FR") : c.value}</div>
                <div className="text-white/40 text-[10px] mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chart — toggle views / clicks + period selector */}
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          {/* Title + loading dot */}
          <div className="flex items-center gap-2">
            <p className="text-white font-medium">
              Activité —&nbsp;
              <span className="text-white/50">{PERIODS.find(p => p.key === chartPeriod)?.label}</span>
            </p>
            {timelineLoading && <div className="w-3 h-3 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />}
          </div>

          <div className="flex items-center gap-2">
            {/* Period selector + flèches */}
            {(() => {
              const idx = PERIODS.findIndex(p => p.key === chartPeriod);
              return (
                <div className="flex items-center gap-1">
                  <button onClick={() => idx > 0 && handlePeriodChange(PERIODS[idx-1].key)} disabled={idx === 0}
                    className="w-6 h-6 flex items-center justify-center rounded text-sm font-bold text-white/40 hover:text-white disabled:opacity-20 transition-all">‹</button>
                  <div className="flex gap-0.5 bg-white/5 border border-white/10 rounded-lg p-0.5">
                    {PERIODS.map(p => (
                      <button key={p.key} onClick={() => handlePeriodChange(p.key)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${chartPeriod === p.key ? "bg-white/20 text-white" : "text-white/40 hover:text-white"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => idx < PERIODS.length-1 && handlePeriodChange(PERIODS[idx+1].key)} disabled={idx === PERIODS.length-1}
                    className="w-6 h-6 flex items-center justify-center rounded text-sm font-bold text-white/40 hover:text-white disabled:opacity-20 transition-all">›</button>
                </div>
              );
            })()}

            {/* Views / Clicks toggle */}
            <div className="flex gap-1 bg-white/5 rounded-lg p-1 border border-white/10">
              <button
                onClick={() => setActiveChart("views")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${activeChart === "views" ? "bg-[#00E5FF] text-black" : "text-white/50 hover:text-white"}`}
              >
                <Eye className="w-3 h-3" /> Vues
              </button>
              <button
                onClick={() => setActiveChart("clicks")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${activeChart === "clicks" ? "bg-[#f0c040] text-black" : "text-white/50 hover:text-white"}`}
              >
                <MousePointerClick className="w-3 h-3" /> Clics
              </button>
            </div>
          </div>
        </div>
        {chartHasData ? (
          <ResponsiveContainer width="100%" height={200}>
            {activeChart === "views" ? (
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#00E5FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickFormatter={xTickFormatter} interval={xInterval} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} allowDecimals={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", fontSize: 12 }} />
                <Area type="monotone" dataKey="views" stroke="#00E5FF" fill="url(#gradViews)" strokeWidth={2} dot={false} name="Vues" />
              </AreaChart>
            ) : (
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f0c040" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f0c040" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradUniq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#39FF14" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#39FF14" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} tickFormatter={xTickFormatter} interval={xInterval} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", fontSize: 12 }} />
                <Area type="monotone" dataKey="clicks" stroke="#f0c040" fill="url(#gradClicks)" strokeWidth={2} dot={false} name="Clics totaux" />
                <Area type="monotone" dataKey="unique_clicks" stroke="#39FF14" fill="url(#gradUniq)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Clics uniques" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-white/20 text-sm">
            {activeChart === "views" ? "Les données apparaîtront après le premier tracking" : "Aucun clic enregistré pour l'instant"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── UsersTab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmBan, setConfirmBan] = useState(null);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    adminFetch("/admin/users")
      .then(setUsers)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleDelete = async (userId) => {
    try {
      await adminFetch(`/admin/users/${userId}`, { method: "DELETE" });
      toast.success("Utilisateur supprimé");
      setConfirmDelete(null);
      fetchUsers();
    } catch (e) { toast.error(e.message); }
  };

  const handleBan = async (userId) => {
    try {
      await adminFetch(`/admin/users/${userId}/ban`, { method: "POST" });
      toast.success("Utilisateur banni");
      setConfirmBan(null);
      fetchUsers();
    } catch (e) { toast.error(e.message); }
  };

  const filtered = users
    .filter((u) =>
      (!search ||
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.display_name?.toLowerCase().includes(search.toLowerCase())) &&
      (roleFilter === "all" || u.role === roleFilter)
    )
    .sort((a, b) => {
      if (sortOrder === "newest") return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sortOrder === "oldest") return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      return 0;
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h2 className="text-xl font-semibold text-white">Utilisateurs ({filtered.length}/{users.length})</h2>
        <div className="flex gap-3 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30 w-48"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30 cursor-pointer"
          >
            <option value="all">Tous les rôles</option>
            <option value="clipper">Clippeur</option>
            <option value="agency">Agence</option>
            <option value="manager">Manager</option>
            <option value="client">Client</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30 cursor-pointer"
          >
            <option value="newest">Plus récents</option>
            <option value="oldest">Plus anciens</option>
          </select>
          <button onClick={fetchUsers} className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white transition-all">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-white/40 text-sm">Chargement...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-xs uppercase">
                <th className="text-left py-3 px-4">Nom</th>
                <th className="text-left py-3 px-4">Email</th>
                <th className="text-left py-3 px-4">Rôle</th>
                <th className="text-left py-3 px-4">Inscription</th>
                <th className="text-left py-3 px-4">Statut</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.user_id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="py-3 px-4 text-white font-medium">
                    {user.display_name || user.name || "—"}
                  </td>
                  <td className="py-3 px-4 text-white/60">{user.email}</td>
                  <td className="py-3 px-4">{roleBadge(user.role)}</td>
                  <td className="py-3 px-4 text-white/40">{formatDate(user.created_at)}</td>
                  <td className="py-3 px-4">
                    {user.banned ? (
                      <span className="text-red-400 text-xs">Banni</span>
                    ) : (
                      <span className="text-green-400 text-xs">Actif</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setConfirmBan(user)}
                        className="p-1.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-all"
                        title="Bannir"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(user)}
                        className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-white/30 text-sm">Aucun utilisateur</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <ConfirmModal
          title="Supprimer l'utilisateur ?"
          message={`Supprimer « ${confirmDelete.display_name || confirmDelete.name} » (${confirmDelete.email}) et toutes ses données ?`}
          confirmLabel="Supprimer définitivement"
          danger
          onConfirm={() => handleDelete(confirmDelete.user_id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Confirm Ban */}
      {confirmBan && (
        <ConfirmModal
          title="Bannir l'utilisateur ?"
          message={`Bannir « ${confirmBan.display_name || confirmBan.name} » et révoquer toutes ses sessions ?`}
          confirmLabel="Bannir"
          onConfirm={() => handleBan(confirmBan.user_id)}
          onCancel={() => setConfirmBan(null)}
        />
      )}
    </div>
  );
}

// ─── PreviewTab ───────────────────────────────────────────────────────────────

function PreviewTab({ role, label, icon: Icon, color }) {
  const [loading, setLoading] = useState(false);

  const openPreview = async () => {
    setLoading(true);
    try {
      // This call sets the session_token cookie automatically (credentials: include)
      await adminFetch(`/admin/demo-login/${role}`, { method: "POST" });
      // Cookie is now set — open the dashboard in a new tab, it will be auto-authenticated
      window.open(`/${role}`, "_blank");
      toast.success(`Preview ${label} ouvert — connecté en tant que démo`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const roleDescriptions = {
    clipper: "Voir l'app comme un clippeur — accès aux campagnes, comptes sociaux, gains et chat.",
    agency: "Voir l'app comme une agence — création de campagnes, gestion des clippers, analytics.",
    manager: "Voir l'app comme un manager — supervision des clippers, conseils, modération.",
    client: "Voir l'app comme un client — suivi des campagnes, validation de contenus, toutes les campagnes.",
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">Preview — {label}</h2>
      <div className="max-w-xl">
        <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-8">
          <div className={`w-16 h-16 rounded-2xl ${color} flex items-center justify-center mb-6`}>
            <Icon className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Dashboard {label}</h3>
          <p className="text-white/50 text-sm mb-6">{roleDescriptions[role]}</p>

          <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6 text-xs text-white/40">
            <p className="font-medium text-white/60 mb-1">Compte de démonstration</p>
            <p>Email : <span className="text-white/70">{role}@demo.clipdeal.local</span></p>
            <p>Rôle : <span className="text-white/70">{role}</span></p>
            <p className="mt-2 text-white/50">⚠️ La session preview durera 24h. Le clic droit admin est actif dans ce contexte.</p>
          </div>

          <button
            onClick={openPreview}
            disabled={loading}
            className="flex items-center gap-2 bg-[#00E5FF] hover:bg-[#00E5FF]/90 disabled:opacity-50 text-black font-semibold px-6 py-3 rounded-lg transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            {loading ? "Connexion..." : `Ouvrir le dashboard ${label}`}
          </button>
        </div>

        <div className="mt-4 bg-[#1a1a1a] border border-white/10 rounded-xl p-5">
          <p className="text-xs text-white/40 mb-3 uppercase tracking-wider font-medium">Clic droit admin</p>
          <p className="text-sm text-white/60">
            Dans les pages preview, faites un <strong className="text-white/80">clic droit</strong> sur une
            campagne ou une vidéo pour accéder aux options de modération admin (suppression + message automatique).
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── ApiStatusTab ─────────────────────────────────────────────────────────────

// ─── Prospects (campagnes pre-remplies pour demarcher agences) ─────
function ProspectsTab() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newCamp, setNewCamp] = useState({ name: "", agency_name: "", payment_model: "views", rpm: 5, rate_per_click: 5, destination_url: "" });
  const [addingClipper, setAddingClipper] = useState(null);
  const [newClipper, setNewClipper] = useState({ discord_username: "", platform: "tiktok", username: "" });

  const baseUrl = window.location.origin;

  const refresh = useCallback(() => {
    setLoading(true);
    adminFetch("/admin/prospects").then(d => setProspects(d.prospects || [])).catch(e => toast.error(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const createCampaign = async () => {
    if (!newCamp.name || !newCamp.agency_name) { toast.error("Nom + agence requis"); return; }
    try {
      const res = await fetch(`${API}/admin/prospects/create-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Code": localStorage.getItem(ADMIN_CODE_KEY) || "" },
        body: JSON.stringify({ ...newCamp, budget_unlimited: true }),
      });
      if (res.ok) {
        toast.success("Campagne prospect créée ✓");
        setShowCreate(false);
        setNewCamp({ name: "", agency_name: "", payment_model: "views", rpm: 5, rate_per_click: 5, destination_url: "" });
        refresh();
      } else { const e = await res.json(); toast.error(e.detail || "Erreur"); }
    } catch (e) { toast.error(e.message); }
  };

  const addClipper = async (cid) => {
    if (!newClipper.discord_username || !newClipper.username) { toast.error("Discord + username requis"); return; }
    try {
      const res = await fetch(`${API}/admin/prospects/${cid}/add-clipper-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Code": localStorage.getItem(ADMIN_CODE_KEY) || "" },
        body: JSON.stringify(newClipper),
      });
      if (res.ok) {
        toast.success("Compte ajouté ✓");
        setNewClipper({ discord_username: "", platform: "tiktok", username: "" });
        setAddingClipper(null);
        refresh();
      } else { const e = await res.json(); toast.error(e.detail || "Erreur"); }
    } catch (e) { toast.error(e.message); }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié !");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Prospects</h2>
          <p className="text-sm text-white/50 mt-1">Crée des campagnes pré-remplies pour démarcher des agences</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg bg-[#FF007F] hover:bg-[#FF007F]/90 text-white text-sm font-medium transition">+ Nouvelle campagne prospect</button>
      </div>

      {showCreate && (
        <div className="bg-[#121212] border border-[#FF007F]/30 rounded-xl p-5 space-y-3">
          <h3 className="text-white font-semibold">Nouvelle campagne prospect</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={newCamp.name} onChange={e => setNewCamp(p => ({...p, name: e.target.value}))} placeholder="Nom de la campagne" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
            <input value={newCamp.agency_name} onChange={e => setNewCamp(p => ({...p, agency_name: e.target.value}))} placeholder="Nom de l'agence cible" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
            <select value={newCamp.payment_model} onChange={e => setNewCamp(p => ({...p, payment_model: e.target.value}))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
              <option value="views">Au vue (RPM)</option>
              <option value="clicks">Au clic</option>
            </select>
            {newCamp.payment_model === "views" ? (
              <input type="number" value={newCamp.rpm} onChange={e => setNewCamp(p => ({...p, rpm: e.target.value}))} placeholder="RPM €/1K vues" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
            ) : (
              <>
                <input type="number" value={newCamp.rate_per_click} onChange={e => setNewCamp(p => ({...p, rate_per_click: e.target.value}))} placeholder="€/1K clics" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                <input value={newCamp.destination_url} onChange={e => setNewCamp(p => ({...p, destination_url: e.target.value}))} placeholder="URL destination" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm col-span-2" />
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={createCampaign} className="flex-1 py-2 rounded-lg bg-[#FF007F] text-white text-sm font-medium">Créer</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border border-white/10 text-white/60 text-sm">Annuler</button>
          </div>
        </div>
      )}

      {loading && <div className="text-white/40 text-sm">Chargement...</div>}
      {!loading && prospects.length === 0 && (
        <div className="text-center py-10 bg-[#121212] border border-white/10 rounded-xl">
          <p className="text-white/40">Aucun prospect créé pour l'instant</p>
        </div>
      )}

      <div className="space-y-3">
        {prospects.map(p => {
          const agencyLink = `${baseUrl}/claim/agency/${p.prospect_agency_token}`;
          const clipperLink = `${baseUrl}/claim/clipper/${p.prospect_clipper_token}`;
          return (
            <div key={p.campaign_id} className="bg-[#121212] border border-white/10 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold">{p.name}</p>
                  <p className="text-white/40 text-xs">Agence cible : {p.agency_name} · {p.payment_model === "clicks" ? `${p.rate_per_click}€/1K clics` : `${p.rpm}€/1K vues`}</p>
                </div>
                <div className="flex gap-3 text-xs flex-shrink-0">
                  <span className="text-white/60">{p.prospect_accounts_count} comptes</span>
                  <span className="text-[#00E5FF]">{p.tracked_videos_count} vidéos</span>
                  <span className="text-[#39FF14]">{(p.total_views || 0).toLocaleString("fr-FR")} vues</span>
                </div>
              </div>

              {/* Liens magiques + Apercu */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="bg-white/5 rounded-lg p-2 flex items-center gap-2">
                  <span className="text-[10px] text-white/40 uppercase font-bold w-14">Agence</span>
                  <code className="flex-1 text-xs text-white/70 truncate">{agencyLink}</code>
                  <button onClick={() => copyToClipboard(agencyLink)} className="text-[#00E5FF] hover:text-white text-xs px-2 py-1 rounded bg-[#00E5FF]/10">Copier</button>
                </div>
                <div className="bg-white/5 rounded-lg p-2 flex items-center gap-2">
                  <span className="text-[10px] text-white/40 uppercase font-bold w-14">Clipper</span>
                  <code className="flex-1 text-xs text-white/70 truncate">{clipperLink}</code>
                  <button onClick={() => copyToClipboard(clipperLink)} className="text-[#FF007F] hover:text-white text-xs px-2 py-1 rounded bg-[#FF007F]/10">Copier</button>
                </div>
              </div>

              {/* Bouton Apercu agence */}
              <button
                onClick={async () => {
                  if (!p.agency_id) { toast.error("Pas d'agence ghost"); return; }
                  try {
                    const res = await fetch(`${API}/admin/impersonate/${p.agency_id}`, {
                      method: "POST",
                      headers: { "X-Admin-Code": localStorage.getItem(ADMIN_CODE_KEY) || "" },
                    });
                    if (!res.ok) { const e = await res.json(); toast.error(e.detail || "Erreur"); return; }
                    const d = await res.json();
                    document.cookie = `session_token=${d.session_token}; path=/; max-age=7200; SameSite=Lax`;
                    localStorage.setItem("session_token", d.session_token);
                    window.open(`/agency/campaign/${p.campaign_id}`, "_blank");
                    toast.success(`Aperçu agence (2h)`);
                  } catch (e) { toast.error(e.message); }
                }}
                className="w-full py-2 rounded-lg bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 text-[#00E5FF] text-xs font-medium border border-[#00E5FF]/30 transition flex items-center justify-center gap-2">
                👁 Aperçu — voir comme l'agence verra cette campagne
              </button>

              {/* Bouton ajouter clippeur */}
              {addingClipper === p.campaign_id ? (
                <div className="bg-white/3 rounded-lg p-3 space-y-2 border border-white/10">
                  <div className="grid grid-cols-3 gap-2">
                    <input value={newClipper.discord_username} onChange={e => setNewClipper(prev => ({...prev, discord_username: e.target.value}))} placeholder="Pseudo Discord" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                    <select value={newClipper.platform} onChange={e => setNewClipper(prev => ({...prev, platform: e.target.value}))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
                      <option value="tiktok">TikTok</option>
                      <option value="instagram">Instagram</option>
                      <option value="youtube">YouTube</option>
                    </select>
                    <input value={newClipper.username} onChange={e => setNewClipper(prev => ({...prev, username: e.target.value}))} placeholder="Username (sans @)" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => addClipper(p.campaign_id)} className="flex-1 py-2 rounded-lg bg-[#39FF14]/20 text-[#39FF14] text-sm font-medium border border-[#39FF14]/30">Ajouter</button>
                    <button onClick={() => setAddingClipper(null)} className="px-4 py-2 rounded-lg border border-white/10 text-white/60 text-sm">Annuler</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingClipper(p.campaign_id)} className="w-full py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs transition">+ Ajouter un compte clippeur (Discord)</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── Capacite & Couts ─────────────────────────────────────────────
function UsageMonitorTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    adminFetch("/admin/usage-monitor")
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const barColor = (pct) => pct < 60 ? "#39FF14" : pct < 80 ? "#FFB300" : "#FF2A2A";
  const Bar = ({ pct, color }) => (
    <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
      <div className="h-full transition-all" style={{ width: `${Math.min(100, pct || 0)}%`, background: color || barColor(pct) }} />
    </div>
  );

  if (loading && !data) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!data) return <div className="text-white/40 p-8">Aucune donnée. <button onClick={refresh} className="text-[#00E5FF] underline">Réessayer</button></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Capacité & Coûts</h2>
          <p className="text-sm text-white/50 mt-1">Utilisation actuelle des APIs et recommandations d'upgrade</p>
        </div>
        <button onClick={refresh} disabled={loading}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition disabled:opacity-50">
          {loading ? "..." : "Actualiser"}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#121212] border border-white/10 rounded-xl p-4">
          <p className="text-xs text-white/40 mb-1">Clippeurs actifs</p>
          <p className="text-2xl font-mono font-bold text-white">{data.clippers_active}</p>
        </div>
        <div className="bg-[#121212] border border-white/10 rounded-xl p-4">
          <p className="text-xs text-white/40 mb-1">Campagnes actives</p>
          <p className="text-2xl font-mono font-bold text-[#FF007F]">{data.campaigns_active}</p>
        </div>
        <div className="bg-[#121212] border border-white/10 rounded-xl p-4">
          <p className="text-xs text-white/40 mb-1">Vidéos trackées (total)</p>
          <p className="text-2xl font-mono font-bold text-[#00E5FF]">{(data.total_videos_tracked || 0).toLocaleString("fr-FR")}</p>
        </div>
        <div className="bg-[#121212] border border-white/10 rounded-xl p-4">
          <p className="text-xs text-white/40 mb-1">Coût total/mois (estim.)</p>
          <p className="text-2xl font-mono font-bold text-[#39FF14]">{data.total_monthly_cost_eur || 0}€</p>
        </div>
      </div>

      {/* Recommendations */}
      {data.recommendations && data.recommendations.length > 0 && (
        <div className="bg-[#121212] border border-white/10 rounded-xl p-5">
          <p className="text-sm font-medium text-white mb-3">Recommandations</p>
          <div className="space-y-2">
            {data.recommendations.map((r, i) => (
              <div key={i} className={`px-3 py-2 rounded-lg text-sm ${r.startsWith("✅") ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                {r}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Service cards */}
      <div className="space-y-3">
        {Object.entries(data.services || {}).map(([key, svc]) => {
          const pct = typeof svc.percent_used === "number" ? svc.percent_used : 0;
          const isError = svc.status === "error";
          const isNotConfig = svc.status === "not_configured";
          return (
            <div key={key} className="bg-[#121212] border border-white/10 rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-white font-medium">{svc.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-white/40">{svc.cost_per_month_eur || 0}€/mois</span>
                    {isError && <span className="text-xs text-red-400">⚠ erreur</span>}
                    {isNotConfig && <span className="text-xs text-amber-400">non configuré</span>}
                    {!isError && !isNotConfig && <span className="text-xs text-green-400">✓ OK</span>}
                  </div>
                </div>
                {typeof svc.percent_used === "number" && (
                  <span className="text-xl font-mono font-bold" style={{ color: barColor(pct) }}>{pct}%</span>
                )}
              </div>
              {typeof svc.percent_used === "number" && <Bar pct={pct} />}

              {/* Détails par service */}
              <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                {svc.capacity_clippers && (
                  <div><span className="text-white/40">Capacité max :</span> <span className="text-white font-mono">{svc.capacity_clippers} clippeurs</span></div>
                )}
                {svc.bandwidth_estimated_gb !== undefined && (
                  <div><span className="text-white/40">Bandwidth utilisée :</span> <span className="text-white font-mono">{svc.bandwidth_estimated_gb} / {svc.bandwidth_total_gb} GB</span></div>
                )}
                {svc.monthly_usage_usd !== undefined && (
                  <div><span className="text-white/40">Utilisation Apify :</span> <span className="text-white font-mono">${svc.monthly_usage_usd} / ${svc.monthly_credit_usd}</span></div>
                )}
                {svc.quota_used_estimated !== undefined && (
                  <div><span className="text-white/40">Quota utilisé/jour :</span> <span className="text-white font-mono">{svc.quota_used_estimated} / {svc.quota_per_day}</span></div>
                )}
                {svc.uptime_hours !== undefined && (
                  <div><span className="text-white/40">Uptime :</span> <span className="text-white font-mono">{svc.uptime_hours}h</span></div>
                )}
                {svc.concurrent_now !== undefined && (
                  <div><span className="text-white/40">Concurrent :</span> <span className="text-white font-mono">{svc.concurrent_now} / {svc.concurrent_max}</span></div>
                )}
                {svc.proxy && (
                  <div><span className="text-white/40">Proxy :</span> <span className="text-white font-mono">{svc.proxy}</span></div>
                )}
                {svc.ip_count && (
                  <div><span className="text-white/40">IPs :</span> <span className="text-white font-mono">{svc.ip_count}</span></div>
                )}
                {svc.error && (
                  <div className="col-span-full"><span className="text-red-400 text-xs">{svc.error}</span></div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-white/30 text-center">Mise à jour : {new Date(data.timestamp).toLocaleString("fr-FR")}</p>
    </div>
  );
}


function ApiStatusTab() {
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage]     = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const testAll = useCallback(() => {
    setLoading(true);
    adminFetch("/admin/api-status")
      .then(setStatus)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const fetchUsage = useCallback(() => {
    setUsageLoading(true);
    adminFetch("/admin/api-usage")
      .then(setUsage)
      .catch(() => {})
      .finally(() => setUsageLoading(false));
  }, []);

  useEffect(() => { testAll(); fetchUsage(); }, [testAll, fetchUsage]);

  const apis = [
    { key: "mongodb",      label: "MongoDB",                          icon: Database,   desc: "Base de données principale (Railway)" },
    { key: "clipscraper",  label: "ClipScraper VPS Hostinger",        icon: Globe,      desc: "Scraping principal TikTok+Insta+YouTube (proxy Webshare)" },
    { key: "youtube_api",  label: "YouTube Data API v3",              icon: Youtube,    desc: "Stats YouTube (gratuit, 10 000 req/jour)" },
    { key: "apify",        label: "Apify (BACKUP uniquement)",        icon: Zap,        desc: "Dernier recours - $5/mois gratuit, devrait quasi jamais être appelé" },
    { key: "google_oauth", label: "Google OAuth",                     icon: Shield,     desc: "Connexion Google (login)" },
    { key: "stripe",       label: "Stripe (déprécié)",                icon: CreditCard, desc: "Ancien paiement, retiré au profit de GoCardless" },
  ];

  const usageServices = [
    { key: "youtube",   label: "YouTube API",             color: "#FF0000", icon: "▶" },
    { key: "apify",     label: "Apify (TikTok + Insta)",  color: "#00E5FF", icon: "⚡" },
    { key: "resend",    label: "Resend (Emails)",          color: "#9B59B6", icon: "✉" },
  ];

  function StatusBadge({ s }) {
    if (!s) return <span className="text-white/30 text-xs">Non testé</span>;
    if (s.status === "ok") return (
      <span className="flex items-center gap-1 text-green-400 text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" /> OK {s.latency_ms && `· ${s.latency_ms}ms`}
      </span>
    );
    if (s.status === "not_configured") return (
      <span className="flex items-center gap-1 text-amber-400 text-xs font-medium">
        <AlertCircle className="w-3.5 h-3.5" /> Non configuré
      </span>
    );
    if (s.status === "not_installed") return (
      <span className="flex items-center gap-1 text-amber-400 text-xs font-medium">
        <AlertCircle className="w-3.5 h-3.5" /> Non installé
      </span>
    );
    return (
      <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
        <XCircle className="w-3.5 h-3.5" /> Erreur
      </span>
    );
  }

  function MiniBar({ value, max, color }) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    const danger = pct > 80;
    return (
      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: danger ? "#ef4444" : color }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Connexions ── */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold text-white">Connexions API</h2>
          <button
            onClick={testAll}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white text-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Tout tester
          </button>
        </div>
        {status?.checked_at && (
          <p className="text-white/30 text-xs mb-4 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Dernier test : {formatDate(status.checked_at)}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {apis.map(({ key, label, icon: Icon, desc }) => {
            const s = status?.[key];
            return (
              <div key={key} className="bg-[#1a1a1a] border border-white/10 rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center">
                      <Icon className="w-5 h-5 text-white/60" />
                    </div>
                    <div>
                      <p className="text-white font-medium text-sm">{label}</p>
                      <p className="text-white/40 text-xs">{desc}</p>
                    </div>
                  </div>
                  <StatusBadge s={s} />
                </div>
                {s?.error && (
                  <p className="mt-3 text-xs text-red-400/70 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                    {s.error}
                  </p>
                )}
                {/* Apify: show plan + compute units */}
                {api.key === "apify" && s?.status === "ok" && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {s.plan && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/20 font-mono">
                        Plan: {s.plan}
                      </span>
                    )}
                    {s.limit_usd > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/50 border border-white/10 font-mono">
                        CU ce mois: {s.usage_usd} / {s.limit_usd}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Utilisation API ── */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-semibold text-white">Utilisation des APIs</h2>
            <p className="text-white/40 text-xs mt-0.5">Nombre d'appels réels par période — mis à jour en temps réel</p>
          </div>
          <button
            onClick={fetchUsage}
            disabled={usageLoading}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white text-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${usageLoading ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>

        {/* Tableau principal */}
        <div className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                <th className="text-left px-5 py-3 text-white/40 text-xs font-semibold uppercase tracking-wider">Service</th>
                <th className="text-center px-4 py-3 text-white/40 text-xs font-semibold uppercase tracking-wider">Cette heure</th>
                <th className="text-center px-4 py-3 text-white/40 text-xs font-semibold uppercase tracking-wider">Aujourd'hui</th>
                <th className="text-center px-4 py-3 text-white/40 text-xs font-semibold uppercase tracking-wider">7 jours</th>
                <th className="text-center px-4 py-3 text-white/40 text-xs font-semibold uppercase tracking-wider">30 jours</th>
                <th className="text-center px-4 py-3 text-white/40 text-xs font-semibold uppercase tracking-wider">Taux succès</th>
                <th className="text-left px-4 py-3 text-white/40 text-xs font-semibold uppercase tracking-wider">Limite gratuite</th>
              </tr>
            </thead>
            <tbody>
              {usageLoading && !usage ? (
                <tr><td colSpan={7} className="py-10 text-center text-white/30 text-xs">Chargement...</td></tr>
              ) : usageServices.map(({ key, label, color, icon }) => {
                const d = usage?.services?.[key];
                const successRate = d?.success_rate ?? 100;
                const errColor = successRate < 90 ? "text-red-400" : successRate < 99 ? "text-amber-400" : "text-green-400";
                return (
                  <tr key={key} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base" style={{ color }}>{icon}</span>
                        <div>
                          <p className="text-white text-xs font-medium">{label}</p>
                          <p className="text-white/30 text-[10px]">{d?.free_limit || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-white font-mono text-sm">{(d?.this_hour ?? 0).toLocaleString()}</span>
                      {d?.errors_hour > 0 && <span className="text-red-400 text-[10px] ml-1">({d.errors_hour} err)</span>}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-white font-mono text-sm font-semibold">{(d?.today ?? 0).toLocaleString()}</span>
                      {d?.errors_today > 0 && <span className="text-red-400 text-[10px] ml-1">({d.errors_today} err)</span>}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-white/70 font-mono text-sm">{(d?.week ?? 0).toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-white/60 font-mono text-sm">{(d?.month ?? 0).toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`font-mono text-sm font-semibold ${errColor}`}>{successRate}%</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {/* Mini progress bar — YouTube 10k/jour, Apify $5/mois, Resend 3000/mois */}
                      {key === "youtube" && <MiniBar value={d?.today ?? 0} max={10000} color={color} />}
                      {key === "apify"   && <MiniBar value={d?.today ?? 0} max={100}   color={color} />}
                      {key === "resend"  && <MiniBar value={d?.month ?? 0} max={3000}  color={color} />}
                      <p className="text-white/30 text-[10px] mt-1">{d?.free_limit}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mini-graphes 24h */}
        {usage && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {usageServices.map(({ key, label, color }) => {
              const hourly = usage?.services?.[key]?.hourly || [];
              const maxVal = Math.max(...hourly.map(h => h.calls), 1);
              return (
                <div key={key} className="bg-[#1a1a1a] border border-white/8 rounded-xl p-4">
                  <p className="text-white/60 text-xs font-medium mb-3">{label} — 24h</p>
                  {hourly.length === 0 ? (
                    <p className="text-white/20 text-[10px] text-center py-4">Aucun appel</p>
                  ) : (
                    <div className="flex items-end gap-0.5 h-12">
                      {hourly.map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm min-w-[2px]"
                          style={{
                            height: `${Math.max((h.calls / maxVal) * 100, 4)}%`,
                            backgroundColor: h.errors > 0 ? "#ef4444" : color,
                            opacity: 0.7,
                          }}
                          title={`${h.date} ${h.hour}h : ${h.calls} appels${h.errors > 0 ? `, ${h.errors} erreurs` : ""}`}
                        />
                      ))}
                    </div>
                  )}
                  <p className="text-white/30 text-[10px] mt-2 text-right">
                    Total : {(usage?.services?.[key]?.today ?? 0).toLocaleString()} aujourd'hui
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {usage?.fetched_at && (
          <p className="text-white/20 text-[10px] mt-3 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" /> Données au {formatDate(usage.fetched_at)}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── PostsTab ────────────────────────────────────────────────────────────────

function PostsTab() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [search, setSearch] = useState("");

  const fetchPosts = useCallback(() => {
    setLoading(true);
    adminFetch("/admin/posts")
      .then(setPosts)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleDelete = async (postId) => {
    try {
      await adminFetch(`/admin/posts/${postId}`, { method: "DELETE" });
      toast.success("Post supprimé");
      setConfirmDelete(null);
      fetchPosts();
    } catch (e) { toast.error(e.message); }
  };

  const filtered = posts.filter(p =>
    !search ||
    p.title?.toLowerCase().includes(search.toLowerCase()) ||
    p.content?.toLowerCase().includes(search.toLowerCase()) ||
    p.agency_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h2 className="text-xl font-semibold text-white">Tous les posts ({filtered.length}/{posts.length})</h2>
        <div className="flex gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30 w-56"
          />
          <button onClick={fetchPosts} className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white transition-all">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="text-white/40 text-sm">Chargement...</div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 && <p className="text-white/30 text-sm text-center py-12">Aucun post</p>}
          {filtered.map((post) => (
            <div key={post.announcement_id} className="bg-[#1a1a1a] border border-white/10 rounded-xl p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded">{post.agency_name}</span>
                  <span className="text-xs text-white/30">{formatDate(post.created_at)}</span>
                </div>
                <p className="text-white font-semibold text-sm truncate">{post.title || "(sans titre)"}</p>
                <p className="text-white/50 text-xs mt-1 line-clamp-2">{post.content}</p>
              </div>
              <button
                onClick={() => setConfirmDelete(post)}
                className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {confirmDelete && (
        <ConfirmModal
          title="Supprimer ce post ?"
          message={`Supprimer le post "${confirmDelete.title || "(sans titre)"}" ?`}
          confirmLabel="Supprimer"
          danger
          onConfirm={() => handleDelete(confirmDelete.announcement_id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ─── AdminCampaignDetailPanel ─────────────────────────────────────────────────

function AdminCampaignDetailPanel({ campaignId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("stats"); // stats | chat | membres | videos
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    adminFetch(`/admin/campaigns/${campaignId}/detail`)
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [campaignId]);

  useEffect(() => {
    if (tab === "chat" && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [tab, data?.messages]);

  const handleSendMsg = async () => {
    if (!newMsg.trim()) return;
    setSending(true);
    try {
      const msg = await adminFetch(`/admin/campaigns/${campaignId}/send-message`, {
        method: "POST",
        body: JSON.stringify({ content: newMsg.trim() }),
      });
      setData(d => d ? { ...d, messages: [...(d.messages || []), msg] } : d);
      setNewMsg("");
      toast.success("Message envoyé");
    } catch (e) { toast.error(e.message); }
    finally { setSending(false); }
  };

  const isClick = data?.payment_model === "clicks";
  const cs = data?.click_stats || {};
  const vs = data?.view_stats || {};

  const statusColors = { active: "bg-green-500/20 text-green-400 border-green-500/30", paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", ended: "bg-red-500/20 text-red-400 border-red-500/30", draft: "bg-white/5 text-white/40 border-white/10" };
  const roleColors = { clipper: "text-blue-300", agency: "text-purple-300", manager: "text-amber-300", client: "text-green-300" };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/60" onClick={onClose} />
      {/* Panel */}
      <div className="w-full max-w-2xl bg-[#0d0d0d] border-l border-white/10 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/10 flex-shrink-0">
          {loading ? (
            <div className="text-white/40 text-sm">Chargement...</div>
          ) : (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-white font-semibold truncate">{data?.name || "—"}</h3>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${statusColors[data?.status] || statusColors.draft}`}>{data?.status}</span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${isClick ? "bg-yellow-400/15 text-yellow-300 border-yellow-400/30" : "bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/30"}`}>
                  {isClick ? "Au clic" : "Aux vues"}
                </span>
              </div>
              <p className="text-white/40 text-xs mt-1">Agence : {data?.agency_name} · {data?.agency_email}</p>
            </div>
          )}
          <button onClick={onClose} className="ml-4 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 flex-shrink-0 overflow-x-auto">
          {[
            { id: "stats", label: isClick ? "Clics & Stats" : "Vues & Stats" },
            { id: "videos", label: `Vidéos (${data?.tracked_videos?.length || 0})` },
            { id: "chat", label: `Chat (${data?.messages?.length || 0})` },
            { id: "membres", label: `Membres (${data?.members?.length || 0})` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-medium transition-all border-b-2 ${tab === t.id ? "border-[#00E5FF] text-[#00E5FF]" : "border-transparent text-white/40 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-white/40 text-sm text-center">Chargement des données...</div>
          ) : !data ? null : (

            // ── STATS TAB ──
            tab === "stats" ? (
              <div className="p-5 space-y-4">
                {isClick ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Clics totaux", value: (cs.total_clicks || 0).toLocaleString("fr-FR"), color: "text-[#f0c040]", bg: "bg-yellow-400/10" },
                        { label: "Clics uniques", value: (cs.unique_clicks || 0).toLocaleString("fr-FR"), color: "text-green-400", bg: "bg-green-400/10" },
                        { label: "Gains générés", value: `€${(cs.earnings || 0).toFixed(2)}`, color: "text-[#00E5FF]", bg: "bg-[#00E5FF]/10" },
                      ].map(c => (
                        <div key={c.label} className={`${c.bg} rounded-xl p-4`}>
                          <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
                          <div className="text-white/40 text-xs mt-1">{c.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 text-xs text-white/50">
                      <span className="text-white/70 font-medium">Tarif : </span>€{cs.rate_per_click || 0}/clic ·
                      <span className="text-white/70 font-medium ml-2">Mode : </span>
                      {cs.unique_clicks_only ? "Clics uniques uniquement (anti-spam)" : "Tous les clics"}
                    </div>
                    {/* Liens de tracking */}
                    {cs.links?.length > 0 && (
                      <div>
                        <p className="text-white/50 text-xs uppercase tracking-wider font-medium mb-3">Liens des clippeurs</p>
                        <div className="space-y-2">
                          {cs.links.map(lnk => (
                            <div key={lnk.link_id} className="bg-[#1a1a1a] border border-white/10 rounded-lg p-3 flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full bg-[#f0c040]/20 flex items-center justify-center text-xs font-bold text-[#f0c040] flex-shrink-0">
                                {(lnk.clipper_display_name || "?")[0]?.toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-xs font-medium truncate">{lnk.clipper_display_name}</p>
                                <p className="text-white/30 text-[10px] font-mono truncate">{lnk.tracking_url}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-[#f0c040] font-mono text-xs">{(lnk.click_count || 0).toLocaleString("fr-FR")} clics</p>
                                <p className="text-[#39FF14] font-mono text-[10px]">{(lnk.unique_click_count || 0).toLocaleString("fr-FR")} uniques</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Vues totales", value: fmtNum(vs.total_views || 0), color: "text-[#00E5FF]", bg: "bg-[#00E5FF]/10" },
                        { label: "Vidéos", value: vs.video_count || 0, color: "text-indigo-400", bg: "bg-indigo-400/10" },
                        { label: "Budget consommé", value: `€${(vs.budget_used || 0).toFixed(2)}`, color: "text-green-400", bg: "bg-green-400/10" },
                      ].map(c => (
                        <div key={c.label} className={`${c.bg} rounded-xl p-4`}>
                          <div className={`text-xl font-bold ${c.color}`}>{typeof c.value === "number" ? c.value.toLocaleString("fr-FR") : c.value}</div>
                          <div className="text-white/40 text-xs mt-1">{c.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 text-xs text-white/50">
                      <span className="text-white/70 font-medium">RPM : </span>€{data.rpm || 0}/1K vues ·
                      <span className="text-white/70 font-medium ml-2">Budget total : </span>
                      {data.budget_unlimited ? "Illimité" : `€${data.budget_total || 0}`}
                    </div>
                  </>
                )}
                {/* Budget bar */}
                {!data.budget_unlimited && data.budget_total > 0 && (
                  <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-4">
                    <div className="flex justify-between text-xs text-white/50 mb-2">
                      <span>Budget consommé</span>
                      <span className="font-mono">{Math.round(((isClick ? cs.earnings : vs.budget_used) / data.budget_total) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#00E5FF] to-[#f0c040] rounded-full transition-all"
                        style={{ width: `${Math.min(100, ((isClick ? cs.earnings : vs.budget_used) / data.budget_total) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-white/30 mt-1.5">
                      <span>€{(isClick ? cs.earnings : vs.budget_used || 0).toFixed(2)}</span>
                      <span>€{data.budget_total}</span>
                    </div>
                  </div>
                )}
              </div>
            )

            // ── VIDEOS TAB ──
            : tab === "videos" ? (
              <div className="p-5">
                {(!data.tracked_videos || data.tracked_videos.length === 0) ? (
                  <p className="text-white/30 text-sm text-center py-12">Aucune vidéo trackée pour cette campagne</p>
                ) : (
                  <>
                    <p className="text-white/40 text-xs mb-3 uppercase tracking-wider">{data.tracked_videos.length} vidéos — triées par vues</p>
                    <div className="space-y-2">
                      {data.tracked_videos.map(v => (
                        <div key={v.video_id || v.url} className="bg-[#1a1a1a] border border-white/10 rounded-lg p-3 flex items-center gap-3">
                          {/* Thumbnail */}
                          <div className="w-10 h-14 rounded-md bg-white/5 overflow-hidden flex-shrink-0">
                            {v.thumbnail_url ? (
                              <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white/20">
                                <Play className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <a href={v.url} target="_blank" rel="noopener noreferrer"
                              className="text-white text-xs font-medium line-clamp-1 hover:text-[#00E5FF] transition-colors">
                              {v.title || v.url || "—"}
                            </a>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-white/30 text-[10px]">{v.clipper_name || "?"}</span>
                              {v.platform && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                  v.platform === "tiktok" ? "bg-pink-500/20 text-pink-300" :
                                  v.platform === "instagram" ? "bg-purple-500/20 text-purple-300" :
                                  "bg-red-500/20 text-red-300"
                                }`}>{v.platform}</span>
                              )}
                              {v.manually_added && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">manuel</span>
                              )}
                            </div>
                          </div>
                          {/* Stats */}
                          <div className="text-right flex-shrink-0">
                            <p className="text-[#00E5FF] font-mono text-xs font-semibold">{fmtNum(v.views || 0)}</p>
                            <p className="text-green-400 font-mono text-[10px]">€{(v.earnings || 0).toFixed(2)}</p>
                            <p className="text-white/25 text-[10px]">❤️ {fmtNum(v.likes || 0)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )

            // ── CHAT TAB ──
            : tab === "chat" ? (
              <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {data.messages?.length === 0 && (
                    <p className="text-white/20 text-sm text-center py-12">Aucun message dans ce chat</p>
                  )}
                  {data.messages?.map(msg => (
                    <div key={msg.message_id} className={`flex ${msg.sender_id === "admin" || msg.is_admin ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${
                        msg.is_admin ? "bg-[#00E5FF] text-black rounded-br-sm" :
                        msg.sender_role_resolved === "agency" || msg.sender_role === "agency" ? "bg-purple-500/20 text-white rounded-bl-sm" :
                        "bg-white/10 text-white rounded-bl-sm"
                      }`}>
                        <p className={`text-[10px] font-medium mb-1 ${msg.is_admin ? "text-black/60" : roleColors[msg.sender_role_resolved || msg.sender_role] || "text-white/50"}`}>
                          {msg.is_admin ? "Admin" : msg.sender_display_name || msg.sender_name || "?"}
                        </p>
                        <p>{msg.content}</p>
                        <p className={`text-[9px] mt-1 ${msg.is_admin ? "text-black/40" : "text-white/30"}`}>
                          {new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                {/* Admin send */}
                <div className="p-4 border-t border-white/10 flex gap-2 flex-shrink-0">
                  <input
                    value={newMsg}
                    onChange={e => setNewMsg(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMsg(); } }}
                    placeholder="Envoyer un message admin dans le chat..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#00E5FF]/40"
                  />
                  <button
                    onClick={handleSendMsg}
                    disabled={sending || !newMsg.trim()}
                    className="px-4 py-2.5 bg-[#00E5FF] hover:bg-[#00E5FF]/90 disabled:opacity-40 text-black rounded-xl transition-all"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )

            // ── MEMBRES TAB ──
            : (
              <div className="p-5">
                {data.members?.length === 0 && (
                  <p className="text-white/30 text-sm text-center py-12">Aucun membre</p>
                )}
                <div className="space-y-2">
                  {data.members?.map(m => (
                    <div key={m.member_id} className="bg-[#1a1a1a] border border-white/10 rounded-lg p-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
                        {m.user_info?.picture ? (
                          <img src={m.user_info.picture} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white/50">
                            {(m.user_info?.display_name || m.user_info?.name || "?")[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {m.user_info?.display_name || m.user_info?.name || m.user_id}
                        </p>
                        <p className="text-white/30 text-xs truncate">{m.user_info?.email}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs font-medium ${roleColors[m.role] || "text-white/50"}`}>{m.role}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                          m.status === "active" ? "bg-green-500/15 text-green-400 border-green-500/25" :
                          m.status === "pending" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" :
                          "bg-white/5 text-white/30 border-white/10"
                        }`}>{m.status}</span>
                        {m.strikes > 0 && (
                          <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-mono">
                            {m.strikes} strike{m.strikes > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AdminCampaignsTab ────────────────────────────────────────────────────────

function AdminCampaignsTab() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState(null); // campaign_id of open detail panel

  const fetchCampaigns = useCallback(() => {
    setLoading(true);
    adminFetch("/admin/all-campaigns")
      .then(setCampaigns)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const handleDelete = async (campaignId) => {
    try {
      await adminFetch(`/admin/campaigns/${campaignId}`, { method: "DELETE" });
      toast.success("Campagne supprimée");
      setConfirmDelete(null);
      if (detailId === campaignId) setDetailId(null);
      fetchCampaigns();
    } catch (e) { toast.error(e.message); }
  };

  const statusColors = { active: "text-green-400", paused: "text-yellow-400", ended: "text-red-400", draft: "text-white/40" };

  const filtered = campaigns.filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.agency_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h2 className="text-xl font-semibold text-white">Campagnes ({filtered.length}/{campaigns.length})</h2>
        <div className="flex gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30 w-56"
          />
          <button onClick={fetchCampaigns} className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white transition-all">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="text-white/40 text-sm">Chargement...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-xs uppercase">
                <th className="text-left py-3 px-4">Campagne</th>
                <th className="text-left py-3 px-4">Agence</th>
                <th className="text-left py-3 px-4">Type</th>
                <th className="text-left py-3 px-4">Statut</th>
                <th className="text-left py-3 px-4">Membres</th>
                <th className="text-left py-3 px-4">Tarif</th>
                <th className="text-left py-3 px-4">Créée le</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.campaign_id} className={`border-b border-white/5 hover:bg-white/3 transition-colors cursor-pointer ${detailId === c.campaign_id ? "bg-[#00E5FF]/5" : ""}`}
                  onClick={() => setDetailId(c.campaign_id === detailId ? null : c.campaign_id)}>
                  <td className="py-3 px-4 text-white font-medium">{c.name}</td>
                  <td className="py-3 px-4 text-white/60">{c.agency_name}</td>
                  <td className="py-3 px-4">
                    {c.payment_model === "clicks" ? (
                      <span className="flex items-center gap-1 text-[#f0c040] text-xs font-medium">
                        <MousePointerClick className="w-3 h-3" /> Clic
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[#00E5FF] text-xs font-medium">
                        <Eye className="w-3 h-3" /> Vue
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-xs font-medium ${statusColors[c.status] || "text-white/40"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-white/60">{c.member_count || 0}</td>
                  <td className="py-3 px-4 text-[#39FF14] font-mono text-xs">
                    {c.payment_model === "clicks" ? `€${c.rate_per_click || 0}/clic` : `€${c.rpm || 0}/1K`}
                  </td>
                  <td className="py-3 px-4 text-white/40">{formatDate(c.created_at)}</td>
                  <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={async () => {
                          if (!c.agency_id) { toast.error("Pas d'agence assignée"); return; }
                          try {
                            const res = await fetch(`${API}/admin/impersonate/${c.agency_id}`, {
                              method: "POST",
                              headers: { "X-Admin-Code": localStorage.getItem(ADMIN_CODE_KEY) || "" },
                            });
                            if (!res.ok) { const e = await res.json(); toast.error(e.detail || "Erreur"); return; }
                            const d = await res.json();
                            // Set cookie for the new tab + open
                            document.cookie = `session_token=${d.session_token}; path=/; max-age=7200; SameSite=Lax`;
                            localStorage.setItem("session_token", d.session_token);
                            window.open(`/agency/campaign/${c.campaign_id}`, "_blank");
                            toast.success(`Connecté en tant que ${d.user.display_name || d.user.email} (2h)`);
                          } catch (e) { toast.error(e.message); }
                        }}
                        className="p-1.5 rounded bg-[#FF007F]/10 hover:bg-[#FF007F]/20 text-[#FF007F] transition-all"
                        title="Voir comme l'agence (impersonate 2h)"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDetailId(c.campaign_id === detailId ? null : c.campaign_id)}
                        className={`p-1.5 rounded transition-all ${detailId === c.campaign_id ? "bg-[#00E5FF]/20 text-[#00E5FF]" : "bg-white/5 hover:bg-white/10 text-white/50 hover:text-white"}`}
                        title="Voir détail (panneau)"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(c)}
                        className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="py-12 text-center text-white/30 text-sm">Aucune campagne</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {confirmDelete && (
        <ConfirmModal
          title="Supprimer cette campagne ?"
          message={`Supprimer la campagne "${confirmDelete.name}" et toutes ses données ?`}
          confirmLabel="Supprimer définitivement"
          danger
          onConfirm={() => handleDelete(confirmDelete.campaign_id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {/* Campaign detail slide-over panel */}
      {detailId && (
        <AdminCampaignDetailPanel
          campaignId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

// ─── SettingsTab ──────────────────────────────────────────────────────────────

function SettingsTab() {
  const [confirmAction, setConfirmAction] = useState(null);
  const [inputValue, setInputValue] = useState("");

  const actions = [
    {
      id: "all-campaigns",
      label: "Supprimer toutes les campagnes",
      desc: "Supprime toutes les campagnes, membres et vidéos trackées.",
      confirmWord: "SUPPRIMER",
      endpoint: "/admin/data/all-campaigns",
      method: "DELETE",
      danger: true,
    },
    {
      id: "all-videos",
      label: "Supprimer toutes les vidéos",
      desc: "Supprime uniquement les vidéos trackées (campaigns préservées).",
      confirmWord: "SUPPRIMER",
      endpoint: "/admin/data/all-videos",
      method: "DELETE",
      danger: true,
    },
    {
      id: "all-users",
      label: "Supprimer tous les comptes",
      desc: "⚠️ Supprime tous les comptes utilisateurs (sauf démos). Action irréversible.",
      confirmWord: "TOUT SUPPRIMER",
      endpoint: "/admin/data/all-users",
      method: "DELETE",
      danger: true,
      extreme: true,
    },
  ];

  const executeAction = async (action) => {
    if (inputValue !== action.confirmWord) {
      toast.error(`Tapez exactement : ${action.confirmWord}`);
      return;
    }
    try {
      await adminFetch(action.endpoint, { method: action.method });
      toast.success("Action effectuée");
      setConfirmAction(null);
      setInputValue("");
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-2">Paramètres</h2>
      <p className="text-white/40 text-sm mb-8">Actions d'administration — certaines sont irréversibles.</p>

      <div className="space-y-4 max-w-2xl">
        <p className="text-xs uppercase tracking-wider text-red-400/70 font-medium mb-3 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> Zone dangereuse
        </p>
        {actions.map((action) => (
          <div
            key={action.id}
            className={`border rounded-xl p-5 ${action.extreme ? "border-red-500/40 bg-red-500/5" : "border-white/10 bg-[#1a1a1a]"}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium text-sm">{action.label}</p>
                <p className="text-white/40 text-xs mt-1">{action.desc}</p>
              </div>
              <button
                onClick={() => { setConfirmAction(action); setInputValue(""); }}
                className="ml-4 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm rounded-lg transition-all whitespace-nowrap"
              >
                Exécuter
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Confirm Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-white font-semibold mb-2">{confirmAction.label}</h3>
            <p className="text-white/50 text-sm mb-5">{confirmAction.desc}</p>
            <p className="text-sm text-white/60 mb-2">
              Tapez <strong className="text-red-400">{confirmAction.confirmWord}</strong> pour confirmer :
            </p>
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-red-500/50 mb-4"
              placeholder={confirmAction.confirmWord}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => executeAction(confirmAction)}
                disabled={inputValue !== confirmAction.confirmWord}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition-all"
              >
                Confirmer
              </button>
              <button
                onClick={() => { setConfirmAction(null); setInputValue(""); }}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white/70 font-medium py-2.5 rounded-lg text-sm transition-all"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SupportTab ───────────────────────────────────────────────────────────────

function SupportTab() {
  const [conversations, setConversations] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const fetchConversations = useCallback(() => {
    setLoadingConvs(true);
    adminFetch("/admin/support/conversations")
      .then((d) => setConversations(d.conversations || []))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoadingConvs(false));
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const openConversation = useCallback(async (userId) => {
    setSelectedUserId(userId);
    setLoadingMsgs(true);
    try {
      const d = await adminFetch(`/admin/support/messages/${userId}`);
      setMessages(d.messages || []);
      // Refresh convs to update unread counts
      fetchConversations();
    } catch (e) { toast.error(e.message); }
    finally { setLoadingMsgs(false); }
  }, [fetchConversations]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedUserId) return;
    setSending(true);
    try {
      const msg = await adminFetch(`/admin/support/send/${selectedUserId}`, {
        method: "POST",
        body: JSON.stringify({ content: newMessage.trim() }),
      });
      setMessages((prev) => [...prev, msg]);
      setNewMessage("");
    } catch (e) { toast.error(e.message); }
    finally { setSending(false); }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleMsgChange = (e) => setNewMessage(e.target.value);

  const selectedConv = conversations.find((c) => c.user_id === selectedUserId);

  return (
    <div className="flex gap-0 h-[calc(100vh-130px)] min-h-[500px]">
      {/* Left: conversations list */}
      <div className="w-72 flex-shrink-0 border-r border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Support</h2>
          <button onClick={fetchConversations} className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white transition-all">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <p className="text-white/30 text-sm text-center py-8">Chargement...</p>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              <MessageCircle className="w-8 h-8 text-white/20 mx-auto mb-3" />
              <p className="text-white/30 text-sm">Aucune conversation</p>
              <p className="text-white/20 text-xs mt-1">Les messages des utilisateurs apparaîtront ici</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.user_id}
                onClick={() => openConversation(conv.user_id)}
                className={`w-full text-left px-4 py-3.5 border-b border-white/5 hover:bg-white/5 transition-all ${selectedUserId === conv.user_id ? "bg-[#00E5FF]/10 border-l-2 border-l-[#00E5FF]" : ""}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-full bg-[#00E5FF]/20 flex items-center justify-center text-xs font-bold text-[#00E5FF] flex-shrink-0">
                    {(conv.user_info?.display_name || conv.user_name || "?")[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">
                      {conv.user_info?.display_name || conv.user_name || conv.user_id}
                    </p>
                    <p className="text-white/30 text-[10px]">{conv.user_role}</p>
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="bg-[#00E5FF] text-black text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
                <p className="text-white/40 text-[11px] truncate pl-9">
                  {conv.last_from_admin ? "Vous : " : ""}{conv.last_message}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedUserId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 text-white/10 mx-auto mb-4" />
              <p className="text-white/30 text-sm">Sélectionnez une conversation</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center gap-3 flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#00E5FF]/20 flex items-center justify-center text-xs font-bold text-[#00E5FF]">
                {(selectedConv?.user_info?.display_name || "?")[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-white text-sm font-medium">
                  {selectedConv?.user_info?.display_name || selectedConv?.user_name || selectedUserId}
                </p>
                <p className="text-white/30 text-xs">{selectedConv?.user_info?.email || selectedConv?.user_role}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs ? (
                <p className="text-white/30 text-sm text-center py-8">Chargement...</p>
              ) : messages.length === 0 ? (
                <p className="text-white/20 text-sm text-center py-8">Aucun message — démarrez la conversation</p>
              ) : (
                messages.map((msg) => (
                  <div key={msg.message_id} className={`flex ${msg.from_admin ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${
                      msg.from_admin
                        ? "bg-[#00E5FF] text-black rounded-br-sm"
                        : "bg-white/10 text-white rounded-bl-sm"
                    }`}>
                      <p>{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${msg.from_admin ? "text-black/50" : "text-white/30"}`}>
                        {new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-white/10 flex gap-2 flex-shrink-0">
              <input
                value={newMessage}
                onChange={handleMsgChange}
                onKeyDown={handleKeyDown}
                placeholder="Répondre au support..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#00E5FF]/40"
              />
              <button
                onClick={handleSend}
                disabled={sending || !newMessage.trim()}
                className="px-4 py-2.5 bg-[#00E5FF] hover:bg-[#00E5FF]/90 disabled:opacity-40 text-black rounded-xl transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
        <h3 className="text-white font-semibold mb-2">{title}</h3>
        <p className="text-white/50 text-sm mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className={`flex-1 ${danger ? "bg-red-500 hover:bg-red-600" : "bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-black"} text-white font-medium py-2.5 rounded-lg text-sm transition-all`}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-white/5 hover:bg-white/10 text-white/70 font-medium py-2.5 rounded-lg text-sm transition-all"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function AdminSidebar({ active, setActive, onLogout }) {
  const items = [
    { id: "overview", label: "Vue d'ensemble", icon: LayoutDashboard },
    { id: "users", label: "Utilisateurs", icon: Users },
    { id: "campaigns", label: "Campagnes", icon: Play },
    { id: "posts", label: "Tous les posts", icon: Eye },
    { id: "preview-clipper", label: "Preview Clippeur", icon: TrendingUp, preview: true },
    { id: "preview-agency", label: "Preview Agence", icon: Building2, preview: true },
    { id: "preview-manager", label: "Preview Manager", icon: Briefcase, preview: true },
    { id: "preview-client", label: "Preview Client", icon: UserCircle, preview: true },
    { id: "api-status", label: "Connexions API", icon: Plug },
    { id: "usage-monitor", label: "Capacité & Coûts", icon: TrendingUp },
    { id: "prospects", label: "Prospects", icon: Building2 },
    { id: "support", label: "Support Chat", icon: MessageCircle },
    { id: "settings", label: "Paramètres", icon: Settings },
  ];

  return (
    <aside className="w-64 min-h-screen bg-[#0d0d0d] border-r border-white/10 flex flex-col">
      {/* Header */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#00E5FF]" />
          <span className="text-sm font-bold text-white">Admin Panel</span>
        </div>
        <p className="text-xs text-white/30 mt-1">The Clip Deal</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-[#00E5FF]/15 text-[#00E5FF]"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              } ${item.preview && !isActive ? "opacity-80" : ""}`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
              {item.preview && <ExternalLink className="w-3 h-3 ml-auto opacity-40" />}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/10">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion admin
        </button>
      </div>
    </aside>
  );
}

// ─── AdminDashboard (main) ────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [unlocked, setUnlocked] = useState(false);
  const [active, setActive] = useState("overview");

  // Check if already unlocked (code in localStorage)
  useEffect(() => {
    const code = localStorage.getItem(ADMIN_CODE_KEY);
    if (code) {
      fetch(`${API}/admin/verify`, {
        headers: { "X-Admin-Code": code },
        credentials: "include",
      }).then((r) => {
        if (r.ok) setUnlocked(true);
        else localStorage.removeItem(ADMIN_CODE_KEY);
      }).catch(() => {});
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_CODE_KEY);
    setUnlocked(false);
  };

  if (!unlocked) {
    return <CodeGate onUnlock={() => setUnlocked(true)} />;
  }

  const previewRoles = {
    "preview-clipper": { role: "clipper", label: "Clippeur", icon: Play, color: "bg-blue-500/20" },
    "preview-agency": { role: "agency", label: "Agence", icon: Building2, color: "bg-purple-500/20" },
    "preview-manager": { role: "manager", label: "Manager", icon: Briefcase, color: "bg-amber-500/20" },
    "preview-client": { role: "client", label: "Client", icon: UserCircle, color: "bg-green-500/20" },
  };

  const renderContent = () => {
    if (active === "overview") return <OverviewTab />;
    if (active === "users") return <UsersTab />;
    if (active === "posts") return <PostsTab />;
    if (active === "campaigns") return <AdminCampaignsTab />;
    if (active === "api-status") return <ApiStatusTab />;
    if (active === "usage-monitor") return <UsageMonitorTab />;
    if (active === "prospects") return <ProspectsTab />;
    if (active === "settings") return <SettingsTab />;
    if (active === "support") return <SupportTab />;
    if (previewRoles[active]) {
      const p = previewRoles[active];
      return <PreviewTab role={p.role} label={p.label} icon={p.icon} color={p.color} />;
    }
    return null;
  };

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] flex select-none"
      onContextMenu={e => e.preventDefault()}
    >
      <AdminSidebar active={active} setActive={setActive} onLogout={handleLogout} />
      <main className="flex-1 p-8 overflow-auto">
        {renderContent()}
      </main>
    </div>
  );
}

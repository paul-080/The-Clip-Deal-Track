import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, Play, Building2, Briefcase, UserCircle,
  Plug, Settings, LogOut, RefreshCw, Trash2, Ban, CheckCircle2,
  XCircle, AlertCircle, Clock, Database, Youtube, Zap, CreditCard,
  Globe, Eye, ExternalLink, Shield, AlertTriangle,
  MessageCircle, Send, MousePointerClick, TrendingUp, X, ChevronDown, Menu
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

// ─── Scraping History (logs des appels par source — alerte si Apify) ──────
function ScrapingHistoryTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all"); // all | apify_only | source-X
  const [search, setSearch] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (filter === "apify_only") params.set("apify_only", "true");
    else if (filter !== "all") params.set("source", filter);
    adminFetch(`/admin/scraping-history?${params.toString()}`)
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!data && loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!data) return <div className="text-white/40 p-8">Aucune donnée. <button onClick={refresh} className="text-[#00E5FF] underline">Réessayer</button></div>;

  const SOURCE_COLORS = {
    clipscraper: "text-[#39FF14]",
    apify: "text-red-400",
    tikwm: "text-[#00E5FF]",
    tikwm_partial: "text-[#00E5FF]/70",
    rapidapi: "text-amber-400",
    instagram_private: "text-[#FF007F]",
    instaloader: "text-purple-400",
    playwright: "text-cyan-400",
    ytdlp: "text-orange-400",
    youtube_api: "text-red-300",
    tiktok_mobile: "text-[#00E5FF]/80",
  };

  const SOURCE_LABEL = {
    clipscraper: "ClipScraper VPS",
    apify: "🚨 Apify",
    tikwm: "TikWm",
    tikwm_partial: "TikWm partial",
    rapidapi: "RapidAPI",
    instagram_private: "Insta Private",
    instaloader: "Instaloader",
    playwright: "Playwright",
    ytdlp: "yt-dlp",
    youtube_api: "YouTube API",
    tiktok_mobile: "TikTok Mobile",
  };

  // Filter by search (username or platform)
  const filteredHistory = (data.history || []).filter(h => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (h.username || "").toLowerCase().includes(s) || (h.platform || "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Historique Scraping</h2>
          <p className="text-sm text-white/50 mt-1">Toutes les tentatives de scraping triées par source. Apify est en rouge.</p>
        </div>
        <button onClick={refresh} disabled={loading}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition disabled:opacity-50 flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </div>

      {/* Alerte rouge si Apify utilisé */}
      {data.apify_today_count > 0 && (
        <div className="bg-red-500/15 border-2 border-red-500/50 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
            <p className="text-red-400 font-bold text-base">⚠️ APIFY UTILISÉ AUJOURD'HUI</p>
          </div>
          <p className="text-white/80 text-sm">
            <span className="font-bold text-red-400 text-lg">{data.apify_today_count}</span> appels Apify aujourd'hui
            · <span className="font-bold text-red-400 text-lg">{data.apify_month_count}</span> ce mois ({data.apify_month_videos} vidéos)
          </p>
          <p className="text-white/50 text-xs mt-2">
            Apify est censé être le tout dernier recours. Si ce compteur monte vite, c'est que ClipScraper VPS et les autres sources échouent — vérifie la config CLIP_SCRAPER_URL/KEY sur Railway et l'état du VPS.
          </p>
        </div>
      )}

      {/* Stats par source sur 24h */}
      <div className="bg-[#121212] border border-white/10 rounded-xl p-5">
        <p className="text-white font-medium mb-3 text-sm">Sources utilisées (dernières 24h)</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {(data.stats_24h || []).map(s => {
            const isApify = s._id?.startsWith("apify");
            return (
              <div key={s._id} className={`rounded-lg p-3 border ${isApify ? "bg-red-500/10 border-red-500/30" : "bg-white/5 border-white/10"}`}>
                <p className={`text-xs font-medium mb-1 ${SOURCE_COLORS[s._id] || "text-white/60"}`}>
                  {SOURCE_LABEL[s._id] || s._id}
                </p>
                <p className="text-white font-mono font-bold text-lg">{s.count}</p>
                <p className="text-[10px] text-white/40">{s.successes} OK · {s.videos_total} vidéos</p>
              </div>
            );
          })}
          {(!data.stats_24h || data.stats_24h.length === 0) && (
            <p className="text-white/30 text-sm col-span-full">Aucune activité de scraping dans les 24h</p>
          )}
        </div>
      </div>

      {/* Filtres + recherche */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-white/5 border border-white/10 rounded-lg p-1 gap-1">
          {[
            { id: "all", label: "Toutes" },
            { id: "apify_only", label: "🚨 Apify seulement" },
            { id: "clipscraper", label: "ClipScraper" },
            { id: "tikwm", label: "TikWm" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filter === f.id ? (f.id === "apify_only" ? "bg-red-500/30 text-red-300" : "bg-white/15 text-white") : "text-white/40 hover:text-white"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher username ou plateforme..."
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30 flex-1 max-w-xs" />
        <span className="text-white/40 text-xs">{filteredHistory.length} / {data.total} entrées</span>
      </div>

      {/* Table historique */}
      <div className="bg-[#121212] border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-xs uppercase">
                <th className="text-left py-3 px-4">Date</th>
                <th className="text-left py-3 px-4">Source</th>
                <th className="text-left py-3 px-4">Plateforme</th>
                <th className="text-left py-3 px-4">Compte</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Vidéos</th>
                <th className="text-left py-3 px-4">Erreur</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((h) => {
                const isApify = h.is_apify;
                const dt = new Date(h.timestamp);
                return (
                  <tr key={h.id} className={`border-b border-white/5 ${isApify ? "bg-red-500/8 hover:bg-red-500/12" : "hover:bg-white/3"} transition-colors`}>
                    <td className="py-2.5 px-4 text-white/70 text-xs whitespace-nowrap">
                      {dt.toLocaleDateString("fr-FR")} {dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className={`py-2.5 px-4 font-medium ${SOURCE_COLORS[h.source] || "text-white/60"} ${isApify ? "font-bold" : ""}`}>
                      {SOURCE_LABEL[h.source] || h.source}
                    </td>
                    <td className="py-2.5 px-4 text-white/70 text-xs">
                      {h.platform === "tiktok" ? "🎵" : h.platform === "instagram" ? "📸" : h.platform === "youtube" ? "▶️" : ""} {h.platform}
                    </td>
                    <td className="py-2.5 px-4 text-white text-xs">@{h.username}</td>
                    <td className="py-2.5 px-4">
                      {h.success
                        ? <span className="text-[#39FF14] text-xs">✓ OK</span>
                        : <span className="text-red-400 text-xs">✗ Échec</span>
                      }
                    </td>
                    <td className="py-2.5 px-4 font-mono text-white/70 text-xs">{h.video_count || 0}</td>
                    <td className="py-2.5 px-4 text-white/40 text-[11px] max-w-[300px] truncate" title={h.error}>
                      {h.error || "—"}
                    </td>
                  </tr>
                );
              })}
              {filteredHistory.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-white/30 text-sm">Aucune entrée</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Alertes Fraude (compte revendiqué par 2 users, fake views, bot clicks) ─────
function FraudAlertsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending");

  const refresh = useCallback(() => {
    setLoading(true);
    adminFetch(`/admin/fraud-alerts?status=${statusFilter}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => toast.error("Erreur chargement alertes"))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const resolve = async (alertId, decision) => {
    if (!window.confirm(`Marquer cette alerte comme "${decision}" ?`)) return;
    try {
      const res = await adminFetch(`/admin/fraud-alerts/${alertId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: "" }),
      });
      if (res.ok) { toast.success("Alerte résolue"); refresh(); }
      else { const e = await res.json(); toast.error(e.detail || "Erreur"); }
    } catch { toast.error("Erreur réseau"); }
  };

  const sevColor = (sev) => sev === "high" ? "text-red-400" : sev === "medium" ? "text-amber-400" : "text-white/60";
  const sevBg = (sev) => sev === "high" ? "bg-red-500/10 border-red-500/30" : sev === "medium" ? "bg-amber-500/10 border-amber-500/30" : "bg-white/5 border-white/10";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-red-400" /> Alertes Fraude
        </h2>
        <p className="text-sm text-white/50 mt-1">Détection automatique : comptes revendiqués par plusieurs utilisateurs, fake views, bot clicks.</p>
      </div>

      <div className="flex gap-2">
        {["pending", "resolved", "all"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${statusFilter === s ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-white/5 text-white/50"}`}>
            {s === "pending" ? "En attente" : s === "resolved" ? "Résolues" : "Toutes"}
          </button>
        ))}
        <button onClick={refresh} disabled={loading}
          className="ml-auto px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-xs">
          {loading ? "Chargement..." : "↻ Rafraîchir"}
        </button>
      </div>

      {loading && <div className="text-center py-12 text-white/40">Chargement...</div>}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-4">
              <p className="text-white/40 text-xs">Stockées</p>
              <p className="text-2xl font-bold text-white">{data.stored_alerts_count}</p>
            </div>
            <div className="bg-[#1a1a1a] border border-amber-500/20 rounded-xl p-4">
              <p className="text-amber-400/80 text-xs">Détectées (live)</p>
              <p className="text-2xl font-bold text-amber-400">{data.live_alerts_count}</p>
            </div>
            <div className="bg-[#1a1a1a] border border-red-500/20 rounded-xl p-4">
              <p className="text-red-400/80 text-xs">Total</p>
              <p className="text-2xl font-bold text-red-400">{data.total}</p>
            </div>
          </div>

          {/* Stockées */}
          {data.stored_alerts?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white/70 mb-2">Alertes stockées ({data.stored_alerts.length})</h3>
              <div className="space-y-2">
                {data.stored_alerts.map(a => (
                  <div key={a.alert_id} className={`rounded-xl p-4 border ${sevBg(a.severity)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs font-bold uppercase ${sevColor(a.severity)}`}>{a.severity}</span>
                          <span className="text-white/40 text-xs">{a.type}</span>
                          {a.platform && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">{a.platform}</span>}
                        </div>
                        <p className="text-white text-sm">{a.details}</p>
                        <div className="text-white/40 text-xs mt-1.5 space-y-0.5">
                          {a.username && <p>📱 @{a.username}</p>}
                          {a.existing_user_email && <p>👤 Existant: <span className="text-white/60">{a.existing_user_name || a.existing_user_email}</span></p>}
                          {a.attempted_user_email && <p>🆕 Tentative: <span className="text-white/60">{a.attempted_user_name || a.attempted_user_email}</span></p>}
                          {a.campaign_name && <p>📂 Campagne: <span className="text-white/60">{a.campaign_name}</span></p>}
                          <p className="text-white/30">{new Date(a.created_at).toLocaleString("fr-FR")}</p>
                        </div>
                      </div>
                      {a.status === "pending" && (
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button onClick={() => resolve(a.alert_id, "confirmed")}
                            className="px-2.5 py-1 rounded text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-300 font-medium">
                            🚫 Confirmer fraude
                          </button>
                          <button onClick={() => resolve(a.alert_id, "false_positive")}
                            className="px-2.5 py-1 rounded text-[10px] bg-white/5 hover:bg-white/10 text-white/60">
                            ✓ Faux positif
                          </button>
                        </div>
                      )}
                      {a.status === "resolved" && (
                        <span className={`px-2 py-1 rounded text-[10px] ${a.decision === "confirmed" ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white/50"}`}>
                          {a.decision === "confirmed" ? "Fraude" : "Faux positif"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live detected */}
          {data.live_detected_alerts?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white/70 mb-2">Détection live ({data.live_detected_alerts.length})</h3>
              <div className="space-y-2">
                {data.live_detected_alerts.map((a, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${sevBg(a.severity)}`}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-bold uppercase ${sevColor(a.severity)}`}>{a.severity}</span>
                      <span className="text-white/40 text-xs">{a.type}</span>
                    </div>
                    <p className="text-white text-sm">{a.details}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.total === 0 && (
            <div className="text-center py-16 bg-[#1a1a1a] border border-white/10 rounded-xl">
              <CheckCircle2 className="w-12 h-12 text-[#39FF14]/50 mx-auto mb-3" />
              <p className="text-white/60">Aucune alerte de fraude</p>
              <p className="text-white/30 text-sm mt-1">Le système surveille automatiquement les patterns suspects.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Prospects (campagnes pre-remplies pour demarcher agences) ─────
function ProspectsTab() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newCamp, setNewCamp] = useState({
    // basics
    name: "", description: "", agency_name: "", image_url: "",
    payment_model: "views",
    rpm: 5, rate_per_click: 5, destination_url: "",
    click_billing_mode: "unique_24h", click_window_hours: 24,
    // platforms
    platforms: ["tiktok", "instagram", "youtube"],
    // règles
    max_clippers: "", cadence: 1, max_strikes: 3, strike_days: 3,
    min_view_payout: 0, max_view_payout: "",
    // budget
    budget_unlimited: true, budget_total: 0,
    // candidature
    application_form_enabled: true,
    application_questions: ["Pourquoi veux-tu rejoindre cette campagne ?"],
    // tracking
    tracking_start_date: "",
  });
  const [addingClipper, setAddingClipper] = useState(null);
  const [bulkClipper, setBulkClipper] = useState({ discord_username: "", accounts: [{ platform: "tiktok", username: "" }] });
  const [accountsMap, setAccountsMap] = useState({}); // { [campaign_id]: { by_discord: {...} } }

  const baseUrl = window.location.origin;

  const fetchAccountsFor = useCallback(async (cid) => {
    try {
      const d = await adminFetch(`/admin/prospects/${cid}/clipper-accounts`);
      setAccountsMap(prev => ({ ...prev, [cid]: d }));
    } catch {}
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    adminFetch("/admin/prospects").then(d => {
      setProspects(d.prospects || []);
      // Auto-fetch accounts pour chaque
      (d.prospects || []).forEach(p => fetchAccountsFor(p.campaign_id));
    }).catch(e => toast.error(e.message)).finally(() => setLoading(false));
  }, [fetchAccountsFor]);
  useEffect(() => { refresh(); }, [refresh]);

  const createCampaign = async () => {
    if (!newCamp.name || !newCamp.agency_name) { toast.error("Nom + agence requis"); return; }
    if ((newCamp.payment_model === "views" || newCamp.payment_model === "both") && !newCamp.rpm) {
      toast.error("RPM requis pour le modèle vues"); return;
    }
    if ((newCamp.payment_model === "clicks" || newCamp.payment_model === "both") && (!newCamp.rate_per_click || !newCamp.destination_url.trim())) {
      toast.error("Tarif clic + URL destination requis"); return;
    }
    if (newCamp.platforms.length === 0) {
      toast.error("Sélectionne au moins 1 plateforme"); return;
    }
    try {
      const payload = {
        ...newCamp,
        rpm: parseFloat(newCamp.rpm) || 0,
        rate_per_click: parseFloat(newCamp.rate_per_click) || 0,
        max_clippers: newCamp.max_clippers ? parseInt(newCamp.max_clippers) : null,
        max_view_payout: newCamp.max_view_payout ? parseInt(newCamp.max_view_payout) : null,
        budget_total: parseFloat(newCamp.budget_total) || 0,
        application_questions: newCamp.application_form_enabled
          ? (newCamp.application_questions || []).filter(q => q && q.trim())
          : [],
        tracking_start_date: newCamp.tracking_start_date
          ? new Date(newCamp.tracking_start_date + "T00:00:00Z").toISOString()
          : null,
      };
      const res = await fetch(`${API}/admin/prospects/create-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Code": localStorage.getItem(ADMIN_CODE_KEY) || "" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Campagne prospect créée ✓");
        setShowCreate(false);
        setNewCamp({
          name: "", description: "", agency_name: "", image_url: "",
          payment_model: "views",
          rpm: 5, rate_per_click: 5, destination_url: "",
          click_billing_mode: "unique_24h", click_window_hours: 24,
          platforms: ["tiktok", "instagram", "youtube"],
          max_clippers: "", cadence: 1, max_strikes: 3, strike_days: 3,
          min_view_payout: 0, max_view_payout: "",
          budget_unlimited: true, budget_total: 0,
          application_form_enabled: true,
          application_questions: ["Pourquoi veux-tu rejoindre cette campagne ?"],
          tracking_start_date: "",
        });
        refresh();
      } else { const e = await res.json(); toast.error(e.detail || "Erreur"); }
    } catch (e) { toast.error(e.message); }
  };

  const togglePlatform = (p) => {
    setNewCamp(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p) ? prev.platforms.filter(x => x !== p) : [...prev.platforms, p]
    }));
  };

  const submitBulkClipper = async (cid) => {
    if (!bulkClipper.discord_username) { toast.error("Pseudo Discord requis"); return; }
    const valid = bulkClipper.accounts.filter(a => a.username && a.username.trim());
    if (valid.length === 0) { toast.error("Au moins 1 compte requis"); return; }
    let okCount = 0;
    for (const acc of valid) {
      try {
        const res = await fetch(`${API}/admin/prospects/${cid}/add-clipper-account`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Admin-Code": localStorage.getItem(ADMIN_CODE_KEY) || "" },
          body: JSON.stringify({ discord_username: bulkClipper.discord_username, platform: acc.platform, username: acc.username.trim().replace(/^@/, "") }),
        });
        if (res.ok) okCount++;
      } catch {}
    }
    if (okCount > 0) {
      toast.success(`✓ ${okCount}/${valid.length} compte(s) ajouté(s) pour ${bulkClipper.discord_username}`);
      setBulkClipper({ discord_username: "", accounts: [{ platform: "tiktok", username: "" }] });
      setAddingClipper(null);
      fetchAccountsFor(cid);
      refresh();
    } else {
      toast.error("Aucun compte ajouté");
    }
  };

  const deleteProspectAccount = async (account_id, cid) => {
    if (!window.confirm("Supprimer ce compte pré-enregistré ?")) return;
    try {
      const res = await fetch(`${API}/admin/prospects/clipper-accounts/${account_id}`, {
        method: "DELETE",
        headers: { "X-Admin-Code": localStorage.getItem(ADMIN_CODE_KEY) || "" },
      });
      if (res.ok) {
        toast.success("Supprimé");
        fetchAccountsFor(cid);
      } else { toast.error("Erreur"); }
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
        <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold text-base">Nouvelle campagne prospect</h3>
              <p className="text-white/40 text-xs mt-0.5">Mêmes options qu'une vraie campagne agence</p>
            </div>
            <button onClick={() => setShowCreate(false)} className="text-white/30 hover:text-white text-lg">✕</button>
          </div>
          <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">

            {/* ── Section : Informations de base ── */}
            <section className="space-y-3">
              <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Informations</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-white/50 block mb-1">Nom de la campagne *</label>
                  <input value={newCamp.name} onChange={e => setNewCamp(p => ({...p, name: e.target.value}))}
                    placeholder="Ex: Campagne MrBeast Highlights"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">Nom de l'agence cible *</label>
                  <input value={newCamp.agency_name} onChange={e => setNewCamp(p => ({...p, agency_name: e.target.value}))}
                    placeholder="Ex: Marcus Lawrence Agency"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">URL image de couverture (optionnel)</label>
                  <input value={newCamp.image_url} onChange={e => setNewCamp(p => ({...p, image_url: e.target.value}))}
                    placeholder="https://..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-white/50 block mb-1">Description</label>
                  <textarea value={newCamp.description} onChange={e => setNewCamp(p => ({...p, description: e.target.value}))}
                    placeholder="Décris la campagne en quelques phrases..."
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30 resize-none" />
                </div>
              </div>
            </section>

            {/* ── Section : Modèle de paiement ── */}
            <section className="space-y-3">
              <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Modèle de paiement</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "views", label: "💰 Vues", desc: "RPM (€ / 1000 vues)" },
                  { id: "clicks", label: "🔗 Clics", desc: "€ / 1000 clics" },
                  { id: "both", label: "Vues + Clics", desc: "Cumul des deux" },
                ].map(m => (
                  <button key={m.id} onClick={() => setNewCamp(p => ({...p, payment_model: m.id}))}
                    className={`p-3 rounded-xl text-left transition-all border ${newCamp.payment_model === m.id ? "bg-[#FF007F]/10 border-[#FF007F]/40 text-white" : "bg-white/3 border-white/10 text-white/60 hover:bg-white/5"}`}>
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">{m.desc}</p>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(newCamp.payment_model === "views" || newCamp.payment_model === "both") && (
                  <div>
                    <label className="text-xs text-white/50 block mb-1">RPM (€ / 1000 vues) *</label>
                    <input type="number" step="0.1" value={newCamp.rpm} onChange={e => setNewCamp(p => ({...p, rpm: e.target.value}))}
                      placeholder="Ex: 5"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                  </div>
                )}
                {(newCamp.payment_model === "clicks" || newCamp.payment_model === "both") && (
                  <>
                    <div>
                      <label className="text-xs text-white/50 block mb-1">Tarif (€ / 1000 clics) *</label>
                      <input type="number" step="0.1" value={newCamp.rate_per_click} onChange={e => setNewCamp(p => ({...p, rate_per_click: e.target.value}))}
                        placeholder="Ex: 5"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-white/50 block mb-1">URL de destination *</label>
                      <input value={newCamp.destination_url} onChange={e => setNewCamp(p => ({...p, destination_url: e.target.value}))}
                        placeholder="https://..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                    </div>
                    <div>
                      <label className="text-xs text-white/50 block mb-1">Comptage des clics</label>
                      <select value={newCamp.click_billing_mode} onChange={e => setNewCamp(p => ({...p, click_billing_mode: e.target.value}))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30">
                        <option value="all">Tous les clics</option>
                        <option value="unique_24h">Uniques / 24h (recommandé)</option>
                        <option value="unique_lifetime">Uniques à vie</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* ── Section : Plateformes ── */}
            <section className="space-y-3">
              <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Plateformes acceptées</p>
              <div className="flex gap-2">
                {[["tiktok", "🎵 TikTok"], ["instagram", "📸 Instagram"], ["youtube", "▶️ YouTube"]].map(([id, label]) => (
                  <button key={id} onClick={() => togglePlatform(id)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border ${newCamp.platforms.includes(id) ? "bg-white/15 border-white/30 text-white" : "bg-white/3 border-white/10 text-white/40 hover:text-white/70"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {/* ── Section : Budget ── */}
            <section className="space-y-3">
              <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Budget</p>
              <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                <input type="checkbox" checked={newCamp.budget_unlimited}
                  onChange={e => setNewCamp(p => ({...p, budget_unlimited: e.target.checked}))}
                  className="w-4 h-4 accent-[#FF007F]" />
                Budget illimité
              </label>
              {!newCamp.budget_unlimited && (
                <div>
                  <label className="text-xs text-white/50 block mb-1">Budget total (€)</label>
                  <input type="number" value={newCamp.budget_total} onChange={e => setNewCamp(p => ({...p, budget_total: e.target.value}))}
                    placeholder="Ex: 1000"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                </div>
              )}
            </section>

            {/* ── Section : Règles & Strikes ── */}
            <section className="space-y-3">
              <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Règles de la campagne</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-white/50 block mb-1">Max clippeurs</label>
                  <input type="number" value={newCamp.max_clippers} onChange={e => setNewCamp(p => ({...p, max_clippers: e.target.value}))}
                    placeholder="Illimité"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">Posts/jour min</label>
                  <input type="number" value={newCamp.cadence} onChange={e => setNewCamp(p => ({...p, cadence: e.target.value}))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">Max strikes</label>
                  <input type="number" value={newCamp.max_strikes} onChange={e => setNewCamp(p => ({...p, max_strikes: e.target.value}))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">Jours d'inact.</label>
                  <input type="number" value={newCamp.strike_days} onChange={e => setNewCamp(p => ({...p, strike_days: e.target.value}))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/50 block mb-1">Vues min payées</label>
                  <input type="number" value={newCamp.min_view_payout} onChange={e => setNewCamp(p => ({...p, min_view_payout: e.target.value}))}
                    placeholder="0"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="text-xs text-white/50 block mb-1">Vues max payées (cap)</label>
                  <input type="number" value={newCamp.max_view_payout} onChange={e => setNewCamp(p => ({...p, max_view_payout: e.target.value}))}
                    placeholder="Sans plafond"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                </div>
              </div>
            </section>

            {/* ── Section : Tracking ── */}
            <section className="space-y-3">
              <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Tracking</p>
              <div>
                <label className="text-xs text-white/50 block mb-1">Date de début du tracking</label>
                <input type="date" value={newCamp.tracking_start_date} onChange={e => setNewCamp(p => ({...p, tracking_start_date: e.target.value}))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30" />
                <p className="text-[10px] text-white/30 mt-1">Toutes les vidéos publiées depuis cette date seront trackées + rémunérées. Vide = aujourd'hui.</p>
              </div>
            </section>

            {/* ── Section : Candidature ── */}
            <section className="space-y-3">
              <p className="text-[11px] text-white/40 uppercase tracking-wider font-medium">Candidature</p>
              <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                <input type="checkbox" checked={newCamp.application_form_enabled}
                  onChange={e => setNewCamp(p => ({...p, application_form_enabled: e.target.checked}))}
                  className="w-4 h-4 accent-[#FF007F]" />
                Activer le formulaire de candidature
              </label>
              {newCamp.application_form_enabled && (
                <div className="space-y-2">
                  <p className="text-xs text-white/50">Questions à poser aux candidats :</p>
                  {(newCamp.application_questions || []).map((q, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input value={q}
                        onChange={e => setNewCamp(prev => ({ ...prev, application_questions: prev.application_questions.map((qq, i) => i === idx ? e.target.value : qq) }))}
                        placeholder="Question..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30" />
                      {newCamp.application_questions.length > 1 && (
                        <button onClick={() => setNewCamp(prev => ({ ...prev, application_questions: prev.application_questions.filter((_, i) => i !== idx) }))}
                          className="w-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400">✕</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setNewCamp(prev => ({ ...prev, application_questions: [...(prev.application_questions || []), ""] }))}
                    className="w-full py-2 rounded-lg bg-white/3 hover:bg-white/8 text-white/50 hover:text-white text-xs border border-dashed border-white/10 transition">
                    + Ajouter une question
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* Footer fixe */}
          <div className="px-5 py-4 border-t border-white/8 flex gap-2 bg-[#0a0a0a]">
            <button onClick={() => setShowCreate(false)}
              className="px-5 py-2.5 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition">Annuler</button>
            <button onClick={createCampaign}
              className="flex-1 py-2.5 rounded-lg bg-[#FF007F] hover:bg-[#FF007F]/90 text-white text-sm font-semibold transition">
              Créer la campagne prospect
            </button>
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
                    const res = await fetch(`${API}/admin/preview-as/${p.agency_id}`, {
                      method: "POST", credentials: "include",
                      headers: { "X-Admin-Code": localStorage.getItem(ADMIN_CODE_KEY) || "" },
                    });
                    if (!res.ok) { const e = await res.json(); toast.error(e.detail || "Erreur"); return; }
                    const d = await res.json();
                    window.open(`/agency/campaign/${p.campaign_id}`, "_blank");
                    toast.success(`✓ Aperçu (2h) - tu vas devoir te reconnecter en admin apres`);
                  } catch (e) { toast.error(e.message); }
                }}
                className="w-full py-2 rounded-lg bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 text-[#00E5FF] text-xs font-medium border border-[#00E5FF]/30 transition flex items-center justify-center gap-2">
                👁 Aperçu — voir comme l'agence verra cette campagne
              </button>

              {/* Bouton ajouter clippeur */}
              {/* Liste des comptes deja pre-enregistres */}
              {accountsMap[p.campaign_id]?.total > 0 && (
                <div className="bg-white/3 border border-white/5 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-white/50 font-medium">Clippeurs pré-enregistrés ({accountsMap[p.campaign_id].total} comptes) :</p>
                  <div className="space-y-1.5">
                    {Object.entries(accountsMap[p.campaign_id].by_discord || {}).map(([discord, accs]) => (
                      <div key={discord} className="flex items-center gap-2 flex-wrap py-1 px-2 bg-white/5 rounded">
                        <span className="text-xs text-[#39FF14] font-medium">@{discord}</span>
                        <span className="text-white/30 text-xs">→</span>
                        {accs.map(a => (
                          <span key={a.account_id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 text-[11px]">
                            <span className="text-white/40">{a.platform === "tiktok" ? "🎵" : a.platform === "instagram" ? "📸" : "▶️"}</span>
                            <span className="text-white/80">@{a.username}</span>
                            <button onClick={() => deleteProspectAccount(a.account_id, p.campaign_id)}
                              className="text-red-400/50 hover:text-red-400 ml-1">✕</button>
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {addingClipper === p.campaign_id ? (
                <div className="bg-white/3 rounded-lg p-3 space-y-2 border border-[#39FF14]/30">
                  <p className="text-xs text-white/60">Saisis le pseudo Discord puis ajoute autant de comptes sociaux que voulu pour ce clippeur :</p>
                  <input value={bulkClipper.discord_username} onChange={e => setBulkClipper(prev => ({...prev, discord_username: e.target.value}))}
                    placeholder="Pseudo Discord du clippeur (ex: paul_clipper)"
                    className="w-full bg-white/5 border border-[#39FF14]/40 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
                  <div className="space-y-1.5">
                    {bulkClipper.accounts.map((acc, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <select value={acc.platform}
                          onChange={e => setBulkClipper(prev => ({ ...prev, accounts: prev.accounts.map((a, i) => i === idx ? { ...a, platform: e.target.value } : a) }))}
                          className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-sm w-32">
                          <option value="tiktok">🎵 TikTok</option>
                          <option value="instagram">📸 Instagram</option>
                          <option value="youtube">▶️ YouTube</option>
                        </select>
                        <input value={acc.username}
                          onChange={e => setBulkClipper(prev => ({ ...prev, accounts: prev.accounts.map((a, i) => i === idx ? { ...a, username: e.target.value } : a) }))}
                          placeholder="username (sans @)"
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                        {bulkClipper.accounts.length > 1 && (
                          <button onClick={() => setBulkClipper(prev => ({ ...prev, accounts: prev.accounts.filter((_, i) => i !== idx) }))}
                            className="w-8 h-8 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm">✕</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setBulkClipper(prev => ({ ...prev, accounts: [...prev.accounts, { platform: prev.accounts[prev.accounts.length-1]?.platform === "tiktok" ? "instagram" : "tiktok", username: "" }] }))}
                      className="w-full py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs transition border border-dashed border-white/10">
                      + Ajouter un autre compte pour ce clippeur
                    </button>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => submitBulkClipper(p.campaign_id)} className="flex-1 py-2 rounded-lg bg-[#39FF14]/20 text-[#39FF14] text-sm font-medium border border-[#39FF14]/30">
                      Ajouter tous les comptes
                    </button>
                    <button onClick={() => { setAddingClipper(null); setBulkClipper({ discord_username: "", accounts: [{ platform: "tiktok", username: "" }] }); }} className="px-4 py-2 rounded-lg border border-white/10 text-white/60 text-sm">Fermer</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingClipper(p.campaign_id)} className="w-full py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs transition">+ Ajouter un clippeur (Discord + ses comptes)</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── Capacite & Couts ─────────────────────────────────────────────
function ApifyAlarmBanner() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const refresh = () => adminFetch("/admin/apify-usage-today").then(setData).catch(() => {});
    refresh();
    const i = setInterval(refresh, 2 * 60 * 1000);
    return () => clearInterval(i);
  }, []);

  if (!data || data.error || (data.apify_total_today || 0) === 0) return null;

  // Pas d'estimation : juste les compteurs reels
  return (
    <div className="rounded-xl border-2 p-4 bg-amber-500/15 border-amber-500/40">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-amber-400 font-bold text-base">⚠️ Apify utilisé aujourd'hui</p>
          <p className="text-white/70 text-xs mt-1">
            Apify ne devrait être utilisé qu'en dernier recours. Si le compteur monte, le scraping gratuit est à investiguer.
          </p>
          <p className="text-white/50 text-[10px] mt-1.5">
            Aujourd'hui : <span className="font-mono text-white">{data.apify_total_today || 0}</span> calls Apify
            (Insta {data.apify_instagram_today || 0} + TikTok {data.apify_tiktok_today || 0})
            sur <span className="font-mono text-white">{data.total_scrapes_today || 0}</span> scrapes total.
          </p>
        </div>
      </div>
    </div>
  );
}

function InstaStressTestSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runStressTest = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const d = await adminFetch("/admin/insta-stress-test-30?n_iterations=30", { method: "GET" });
      setData(d);
    } catch (e) {
      setError(`Erreur : ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const verdictColor = data?.verdict?.startsWith("✅") ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/5"
    : data?.verdict?.startsWith("🟡") ? "text-amber-400 border-amber-500/40 bg-amber-500/5"
    : data?.verdict?.startsWith("🟠") ? "text-orange-400 border-orange-500/40 bg-orange-500/5"
    : "text-red-400 border-red-500/40 bg-red-500/5";

  return (
    <div className="bg-[#121212] border border-white/10 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-white font-semibold text-base flex items-center gap-2">
            🔥 Stress Test Instagram (30 scrapes consécutifs)
          </h3>
          <p className="text-white/40 text-xs mt-0.5">
            Lance 30 scrapes Insta sur 5 comptes Business publics différents. Donne un taux de succès réel sur production.
          </p>
        </div>
        <button
          onClick={runStressTest}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-400 border border-purple-500/40 text-sm font-bold transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {loading
            ? <><div className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" /> Stress test… (peut prendre 2-5 min)</>
            : "🔥 Lancer stress test 30x"}
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-xs">❌ {error}</div>}

      {data && (
        <>
          <div className={`border rounded-lg p-3 text-sm font-bold ${verdictColor}`}>
            {data.verdict}
          </div>

          <div className="grid grid-cols-5 gap-2">
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <p className="text-white/50 text-[10px]">Total</p>
              <p className="text-white font-mono font-bold text-lg">{data.n_iterations}</p>
            </div>
            <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
              <p className="text-emerald-400/70 text-[10px]">Succès</p>
              <p className="text-emerald-400 font-mono font-bold text-lg">{data.success_count}</p>
            </div>
            <div className="bg-red-500/10 rounded-lg p-2 text-center">
              <p className="text-red-400/70 text-[10px]">Échecs</p>
              <p className="text-red-400 font-mono font-bold text-lg">{data.fail_count}</p>
            </div>
            <div className="bg-cyan-500/10 rounded-lg p-2 text-center">
              <p className="text-cyan-400/70 text-[10px]">Taux</p>
              <p className="text-cyan-400 font-mono font-bold text-lg">{data.success_rate_pct}%</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <p className="text-white/50 text-[10px]">Durée</p>
              <p className="text-white font-mono font-bold text-lg">{data.total_duration_sec}s</p>
            </div>
          </div>

          {/* Par compte */}
          <div className="bg-white/3 rounded-lg p-2">
            <p className="text-white/60 text-xs font-semibold mb-2">Détail par compte :</p>
            <div className="space-y-1">
              {Object.entries(data.by_account || {}).map(([acc, stats]) => (
                <div key={acc} className="flex items-center gap-2 text-[11px]">
                  <span className={`w-2 h-2 rounded-full ${stats.success_rate >= 80 ? "bg-emerald-400" : stats.success_rate >= 50 ? "bg-amber-400" : "bg-red-400"}`} />
                  <span className="text-white/80 font-mono w-32">@{acc}</span>
                  <span className="text-white/50 w-16">{stats.success_rate}%</span>
                  <span className="text-white/40">{stats.ok}/{stats.tries} OK · ~{stats.avg_videos} vidéos/réussite</span>
                </div>
              ))}
            </div>
          </div>

          {/* Config détectée */}
          <div className="bg-white/3 rounded-lg p-2 text-[11px] grid grid-cols-2 gap-2">
            <p className="text-white/60">Proxies : <span className="text-white font-mono">{data.config.proxy_pool_size}</span></p>
            <p className="text-white/60">Sémaphore : <span className="text-white font-mono">{data.config.insta_sem_size} parallèles · {data.config.insta_delay_sec}s delay</span></p>
            <p className="text-white/60">Cookies Insta : <span className="text-white font-mono">{data.config.instagram_sessions_count}</span></p>
            <p className="text-white/60">Meta Business : <span className={data.config.ig_business_configured ? "text-emerald-400" : "text-amber-400"}>{data.config.ig_business_configured ? "✓ configuré" : "✗ pas configuré"}</span></p>
          </div>

          {/* Détail itérations (collapse) */}
          <details className="bg-white/3 rounded-lg p-2">
            <summary className="text-white/60 text-xs cursor-pointer">📜 Détail des {data.n_iterations} itérations</summary>
            <div className="mt-2 max-h-64 overflow-y-auto space-y-0.5">
              {data.results.map((r) => (
                <div key={r.iteration} className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-white/30 w-8">#{r.iteration}</span>
                  <span className="text-white/60 w-24">@{r.username}</span>
                  <span className={r.ok ? "text-emerald-400 w-8" : "text-red-400 w-8"}>{r.ok ? "✓" : "✗"}</span>
                  <span className="text-white/40 w-24">{r.video_count || 0} vidéos</span>
                  <span className="text-white/40">{r.duration_ms}ms</span>
                  {r.error && <span className="text-red-400/70 truncate flex-1">{r.error.slice(0, 50)}</span>}
                </div>
              ))}
            </div>
          </details>
        </>
      )}

      {!data && !loading && !error && (
        <div className="text-center py-4 text-white/30 text-xs">
          Clique sur "Lancer stress test 30x" pour mesurer la fiabilité réelle d'Instagram.
          <br />
          Si taux ≥ 90% → production-ready. Sinon je te dis quoi ajouter.
        </div>
      )}
    </div>
  );
}

function ProxyVpsDeepTestSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runTest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // adminFetch retourne deja le JSON parse (pas un Response)
      const d = await adminFetch("/admin/test-proxy-vps-deep", { method: "GET" });
      setData(d);
    } catch (e) {
      setError(`Erreur : ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const verdictColor = data?.verdict?.startsWith("✅") ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/5"
    : data?.verdict?.startsWith("🔴") ? "text-red-400 border-red-500/40 bg-red-500/5"
    : "text-amber-400 border-amber-500/40 bg-amber-500/5";

  return (
    <div className="bg-[#121212] border border-white/10 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-white font-semibold text-base flex items-center gap-2">
            🔬 Test proxy Webshare + VPS Hostinger — DIAGNOSTIC ROOT CAUSE
          </h3>
          <p className="text-white/40 text-xs mt-0.5">
            Test chaque composant en isolation : IP cloud, IP via proxy, VPS /health, VPS scrape, Insta via proxy, TikWm via proxy.
          </p>
        </div>
        <button
          onClick={runTest}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 border border-orange-500/40 text-sm font-bold transition-all disabled:opacity-50"
        >
          {loading ? <>⏳ Test…</> : "🔬 Test approfondi"}
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-xs">❌ {error}</div>}

      {data && (
        <>
          <div className={`border rounded-lg p-3 text-sm font-bold ${verdictColor}`}>{data.verdict}</div>

          {data.actions && data.actions.length > 0 && (
            <div className="bg-[#0a0a0a] border border-white/10 rounded-lg p-3 space-y-1.5">
              <p className="text-white/60 text-xs font-semibold">📋 Actions à faire :</p>
              {data.actions.map((a, i) => (
                <p key={i} className="text-white text-xs leading-relaxed">{a}</p>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            {Object.entries(data.tests || {}).map(([name, t]) => (
              <div key={name} className={`p-2 rounded-lg border flex items-center gap-3 ${t.ok ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/30"}`}>
                <span className={`w-2 h-2 rounded-full ${t.ok ? "bg-emerald-400" : "bg-red-400"} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${t.ok ? "text-emerald-400" : "text-red-400"}`}>{name}</p>
                  <p className="text-white/50 text-[11px] truncate">{t.info || t.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!data && !loading && !error && (
        <div className="text-center py-4 text-white/30 text-xs">Clique sur "Test approfondi" pour savoir EXACTEMENT pourquoi le scraping marche pas</div>
      )}
    </div>
  );
}

function MegaDiagnosticSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runDiag = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // adminFetch retourne deja le JSON parse
      const d = await adminFetch("/admin/mega-diagnostic", { method: "GET" });
      setData(d);
    } catch (e) {
      setError(`Erreur réseau : ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const verdictColor = data?.verdict?.startsWith("✅") ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/5"
    : data?.verdict?.startsWith("🔴") ? "text-red-400 border-red-500/40 bg-red-500/5"
    : "text-amber-400 border-amber-500/40 bg-amber-500/5";

  return (
    <div className="bg-[#121212] border border-white/10 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-white font-semibold text-base flex items-center gap-2">
            🚨 MEGA DIAGNOSTIC — pourquoi le scraping marche pas ?
          </h3>
          <p className="text-white/40 text-xs mt-0.5">
            Test TOUT en 30 sec : env vars + sources + scrape réel + analyse historique. Donne actions concrètes.
          </p>
        </div>
        <button
          onClick={runDiag}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/40 text-sm font-bold transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {loading
            ? <><div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" /> Diagnostic en cours…</>
            : "🔍 Lancer le mega-diagnostic"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-xs">❌ {error}</div>
      )}

      {data && (
        <>
          {/* Verdict global */}
          <div className={`border rounded-lg p-3 text-sm font-bold ${verdictColor}`}>
            {data.verdict}
          </div>

          {/* Actions à faire */}
          {data.actions_a_faire && data.actions_a_faire.length > 0 && (
            <div className="bg-[#0a0a0a] border border-white/10 rounded-lg p-3 space-y-1.5">
              <p className="text-white/60 text-xs font-semibold">📋 Actions à faire :</p>
              {data.actions_a_faire.map((a, i) => (
                <p key={i} className="text-white text-xs leading-relaxed">{a}</p>
              ))}
            </div>
          )}

          {/* Sources test */}
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.sources || {}).map(([name, src]) => (
              <div key={name} className={`p-2 rounded-lg border ${src.ok ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/30"}`}>
                <p className={`text-xs font-semibold ${src.ok ? "text-emerald-400" : "text-red-400"}`}>
                  {src.ok ? "✅" : "🔴"} {name}
                </p>
                <p className="text-white/50 text-[10px] truncate">{src.info || src.reason}</p>
              </div>
            ))}
          </div>

          {/* Live scrape test */}
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.live_scrape_test || {}).map(([platform, res]) => (
              <div key={platform} className={`p-2 rounded-lg border ${res.ok ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/30"}`}>
                <p className={`text-xs font-semibold ${res.ok ? "text-emerald-400" : "text-red-400"}`}>
                  {res.ok ? "✅" : "🔴"} Test {platform} {res.account_tested}
                </p>
                <p className="text-white/50 text-[10px]">
                  {res.ok ? `${res.videos_found} vidéos trouvées` : (res.error || "échec")}
                </p>
              </div>
            ))}
          </div>

          {/* Env vars */}
          <details className="bg-white/3 rounded-lg p-2">
            <summary className="text-white/60 text-xs cursor-pointer">📦 Env vars Railway (cliquer pour ouvrir)</summary>
            <div className="mt-2 space-y-1">
              {Object.entries(data.env_vars || {}).map(([name, info]) => (
                <div key={name} className="flex items-center gap-2 text-[11px]">
                  <span className={`w-2 h-2 rounded-full ${info.configured ? "bg-emerald-400" : "bg-red-400"}`} />
                  <span className="text-white/70 font-mono w-48">{name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] ${info.criticite === "CRITIQUE" ? "bg-red-500/15 text-red-400" : info.criticite === "IMPORTANT" ? "bg-amber-500/15 text-amber-400" : "bg-white/10 text-white/50"}`}>
                    {info.criticite}
                  </span>
                  <span className="text-white/40 truncate flex-1">{info.note}</span>
                </div>
              ))}
            </div>
          </details>

          {/* Analyse 50 derniers scrapes */}
          {data.recent_scrapes_analysis?.by_source && (
            <details className="bg-white/3 rounded-lg p-2">
              <summary className="text-white/60 text-xs cursor-pointer">
                📊 Analyse {data.recent_scrapes_analysis.total_recent} derniers scrapes
              </summary>
              <div className="mt-2 space-y-1">
                {Object.entries(data.recent_scrapes_analysis.by_source).map(([src, stats]) => (
                  <div key={src} className="flex items-center gap-2 text-[11px]">
                    <span className="text-white/70 font-mono w-40">{src}</span>
                    <span className="text-emerald-400">✅ {stats.ok}</span>
                    <span className="text-red-400">🔴 {stats.ko}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <p className="text-[10px] text-white/30 italic">
            Testé le {new Date(data.tested_at).toLocaleString("fr-FR")}
          </p>
        </>
      )}

      {!data && !loading && !error && (
        <div className="text-center py-6 text-white/30 text-sm">
          Clique sur "Lancer le mega-diagnostic" pour savoir EXACTEMENT pourquoi le scraping marche pas.
        </div>
      )}
    </div>
  );
}

function ScrapingHealthCheckSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // adminFetch retourne deja le JSON parse (pas un Response)
      const d = await adminFetch("/admin/scraping-health-check", { method: "GET" });
      setData(d);
    } catch (e) {
      setError(`Erreur réseau : ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const verdictColor = data?.verdict?.startsWith("✅") ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/5"
    : data?.verdict?.startsWith("🔴") ? "text-red-400 border-red-500/40 bg-red-500/5"
    : "text-amber-400 border-amber-500/40 bg-amber-500/5";

  return (
    <div className="bg-[#121212] border border-white/10 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-white font-semibold text-base flex items-center gap-2">
            🏥 Scraping Health Check
          </h3>
          <p className="text-white/40 text-xs mt-0.5">
            Test toutes les sources (VPS, proxy, Meta API, YouTube API, TikWm, RapidAPI, sessions Insta) en parallèle
          </p>
        </div>
        <button
          onClick={runCheck}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-[#00E5FF]/15 hover:bg-[#00E5FF]/25 text-[#00E5FF] border border-[#00E5FF]/40 text-sm font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {loading
            ? <><div className="w-3 h-3 border border-[#00E5FF] border-t-transparent rounded-full animate-spin" /> Test en cours…</>
            : "▶ Lancer le test"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-xs">
          ❌ {error}
        </div>
      )}

      {data && (
        <>
          {/* Verdict global */}
          <div className={`border rounded-lg p-3 text-sm font-semibold ${verdictColor}`}>
            {data.verdict}
          </div>

          {/* Summary counters */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <p className="text-white/50 text-[10px]">Total</p>
              <p className="text-white font-mono font-bold text-lg">{data.summary?.total || 0}</p>
            </div>
            <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
              <p className="text-emerald-400/70 text-[10px]">OK</p>
              <p className="text-emerald-400 font-mono font-bold text-lg">{data.summary?.ok || 0}</p>
            </div>
            <div className="bg-red-500/10 rounded-lg p-2 text-center">
              <p className="text-red-400/70 text-[10px]">KO</p>
              <p className="text-red-400 font-mono font-bold text-lg">{data.summary?.ko || 0}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <p className="text-white/50 text-[10px]">Skipped</p>
              <p className="text-white/60 font-mono font-bold text-lg">{data.summary?.skipped || 0}</p>
            </div>
          </div>

          {/* Détails par source */}
          <div className="space-y-1.5 mt-3">
            {Object.entries(data.sources || {}).map(([name, src]) => {
              const statusColors = {
                ok: { dot: "bg-emerald-400", text: "text-emerald-400", border: "border-emerald-500/20" },
                ko: { dot: "bg-red-400", text: "text-red-400", border: "border-red-500/30" },
                skipped: { dot: "bg-white/30", text: "text-white/40", border: "border-white/10" },
              };
              const c = statusColors[src.status] || statusColors.skipped;
              return (
                <div key={name} className={`flex items-center gap-3 py-2 px-3 bg-white/3 border ${c.border} rounded-lg`}>
                  <div className={`w-2 h-2 rounded-full ${c.dot} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{name}</p>
                    <p className={`text-[11px] truncate ${c.text}`}>
                      {src.message || src.reason || (src.status === "ok" ? "OK" : src.status === "ko" ? "Erreur" : "Non testé")}
                    </p>
                  </div>
                  {typeof src.duration_ms === "number" && (
                    <span className="text-white/30 text-[10px] font-mono flex-shrink-0">{src.duration_ms}ms</span>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[10px] text-white/30 italic mt-2">
            Testé le {new Date(data.checked_at).toLocaleString("fr-FR")}
          </p>
        </>
      )}

      {!data && !loading && !error && (
        <div className="text-center py-6 text-white/30 text-sm">
          Clique sur "Lancer le test" pour vérifier l'état de toutes les sources de scraping
        </div>
      )}
    </div>
  );
}

function SiteHealthSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    adminFetch("/admin/site-health")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 5 * 60 * 1000);  // refresh auto toutes les 5min
    return () => clearInterval(i);
  }, [refresh]);

  if (loading && !data) {
    return <div className="bg-[#121212] border border-white/10 rounded-xl p-5 text-white/40 text-sm">Chargement surveillance...</div>;
  }
  if (!data || data.error) {
    return (
      <div className="bg-[#121212] border border-white/10 rounded-xl p-5">
        <p className="text-white/60 text-sm">Surveillance indisponible : {data?.error || "erreur"}</p>
        <button onClick={refresh} className="mt-2 text-[#00E5FF] text-xs underline">Reessayer</button>
      </div>
    );
  }

  const PLATFORM_META = {
    tiktok: { label: "TikTok", icon: "🎵" },
    instagram: { label: "Instagram", icon: "📸" },
    youtube: { label: "YouTube", icon: "▶️" },
  };

  const { summary, scrapes_by_platform, watchdog, scheduling } = data;

  return (
    <div className="space-y-4">
      {/* Alarme Apify si utilise */}
      <ApifyAlarmBanner />

      {/* Header simple : compteurs reels */}
      <div className="bg-[#121212] border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-white font-semibold text-base">État du site (données réelles)</p>
            <p className="text-xs text-white/50 mt-1">
              {summary.total_clippers?.toLocaleString("fr-FR")} clippeurs · {summary.active_campaigns} campagnes actives · {summary.total_tracked_accounts?.toLocaleString("fr-FR")} comptes trackés
            </p>
          </div>
          <button onClick={refresh} disabled={loading}
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm">
            {loading ? "..." : "↻ Actualiser"}
          </button>
        </div>
      </div>

      {/* Compteurs scrapes par plateforme (REEL, sans % vs capacite estimee) */}
      <div className="bg-[#121212] border border-white/10 rounded-xl p-5 space-y-3">
        <p className="text-white font-semibold text-base">📊 Scrapes réels par plateforme</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries(scrapes_by_platform || {}).map(([plat, p]) => {
            const meta = PLATFORM_META[plat] || { label: plat, icon: "" };
            return (
              <div key={plat} className="rounded-lg border border-white/10 bg-white/3 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{meta.icon}</span>
                  <span className="text-white font-semibold">{meta.label}</span>
                </div>
                <div className="space-y-1 text-xs text-white/60">
                  <div className="flex justify-between">
                    <span>Scrapes ce mois</span>
                    <span className="font-mono text-white">{(p.month_calls || 0).toLocaleString("fr-FR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Aujourd'hui</span>
                    <span className="font-mono text-white">{(p.today_calls || 0).toLocaleString("fr-FR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Comptes trackés</span>
                    <span className="font-mono text-white">{(p.accounts_tracked || 0).toLocaleString("fr-FR")}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Watchdog : derniers tests reels (pas de verdict couleur arbitraire) */}
      <div className="bg-[#121212] border border-white/10 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-white font-semibold text-base">🐕 Derniers tests Watchdog</p>
          <button
            onClick={() => adminFetch("/admin/run-watchdog-now", { method: "POST" }).then(refresh).catch(() => {})}
            className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/70">
            Tester maintenant
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries(watchdog || {}).map(([plat, w]) => {
            const meta = PLATFORM_META[plat] || { label: plat, icon: "" };
            const isOk = w.success === true;
            const hasResult = w.success !== undefined;
            return (
              <div key={plat} className={`rounded-lg border p-3 ${
                hasResult && isOk ? "bg-green-500/10 border-green-500/30" :
                hasResult && !isOk ? "bg-red-500/10 border-red-500/30" :
                "bg-white/5 border-white/10"
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-medium text-sm">{meta.icon} {meta.label}</span>
                  {hasResult && (
                    <span className={`text-xs font-bold ${isOk ? "text-green-400" : "text-red-400"}`}>
                      {isOk ? "✓ Test OK" : "✗ Test échec"}
                    </span>
                  )}
                </div>
                {w.timestamp && (
                  <p className="text-[10px] text-white/40">
                    Dernier test : {new Date(w.timestamp).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                )}
                {w.video_count !== undefined && (
                  <p className="text-[10px] text-white/40">{w.video_count} vidéos · {w.duration_ms || 0}ms</p>
                )}
                {w.error && <p className="text-[10px] text-red-400 truncate" title={w.error}>{w.error}</p>}
                {!hasResult && <p className="text-[10px] text-white/30">{w.message || "pas encore testé"}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scheduling : juste les compteurs, pas de qualité spread arbitraire */}
      {scheduling && (
        <div className="bg-[#121212] border border-white/10 rounded-xl p-5 space-y-3">
          <p className="text-white font-semibold text-base">⏱️ Planning scraping</p>
          <div className="flex justify-between text-xs">
            <span className="text-white/60">Campagnes en retard</span>
            <span className={`font-mono font-bold ${(scheduling.overdue_campaigns || 0) > 5 ? "text-red-400" : "text-white"}`}>
              {scheduling.overdue_campaigns || 0}
            </span>
          </div>
        </div>
      )}

      {/* 🚨 MEGA DIAGNOSTIC : EN HAUT DE PAGE car le user dit "rien ne marche" */}
      <MegaDiagnosticSection />

      {/* 🔥 STRESS TEST INSTA 30x : verifier taux de succes reel */}
      <InstaStressTestSection />

      {/* 🔬 TEST APPROFONDI proxy + VPS — pour identifier la cause exacte du 'rien ne marche' */}
      <ProxyVpsDeepTestSection />

      {/* Health check global de toutes les sources de scraping */}
      <ScrapingHealthCheckSection />

      {/* Test scraping autonome */}
      <InstaHealthSection />

      {/* Compteurs reels (Apify, alertes, circuit breakers) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`bg-[#121212] border rounded-xl p-4 ${summary.apify_used_today > 0 ? "border-amber-500/40" : "border-white/10"}`}>
          <p className="text-xs text-white/40">Apify utilisé ajd</p>
          <p className={`text-2xl font-mono font-bold mt-1 ${summary.apify_used_today > 0 ? "text-amber-400" : "text-white"}`}>
            {summary.apify_used_today || 0}
          </p>
        </div>
        <div className={`bg-[#121212] border rounded-xl p-4 ${summary.open_alerts_critical > 0 ? "border-red-500/40" : "border-white/10"}`}>
          <p className="text-xs text-white/40">Alertes ouvertes</p>
          <p className={`text-2xl font-mono font-bold mt-1 ${summary.open_alerts_critical > 0 ? "text-red-400" : "text-white"}`}>
            {summary.open_alerts_critical || 0}
          </p>
        </div>
        <div className={`bg-[#121212] border rounded-xl p-4 ${summary.circuit_breakers_active > 0 ? "border-amber-500/40" : "border-white/10"}`}>
          <p className="text-xs text-white/40">Circuit breakers</p>
          <p className={`text-2xl font-mono font-bold mt-1 ${summary.circuit_breakers_active > 0 ? "text-amber-400" : "text-white"}`}>
            {summary.circuit_breakers_active || 0}
          </p>
        </div>
        <div className="bg-[#121212] border border-white/10 rounded-xl p-4">
          <p className="text-xs text-white/40">Clippeurs actifs 30j</p>
          <p className="text-2xl font-mono font-bold mt-1 text-white">{summary.active_clippers_30d?.toLocaleString("fr-FR") || 0}</p>
          <p className="text-[10px] text-white/40">/ {summary.total_clippers?.toLocaleString("fr-FR") || 0} total</p>
        </div>
      </div>

      <p className="text-[10px] text-white/30 italic text-center pt-2">
        Toutes les données ci-dessus sont des compteurs réels en base, sans estimation ni seuil arbitraire.
      </p>
    </div>
  );
}

function InstaHealthSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState(null);
  const [globalData, setGlobalData] = useState(null);
  const [globalLoading, setGlobalLoading] = useState(false);

  const runTest = useCallback(() => {
    setLoading(true);
    setData(null);
    adminFetch("/admin/insta-health-full")
      .then(setData)
      .catch((e) => toast.error("Test failed : " + (e.message || "erreur")))
      .finally(() => setLoading(false));
  }, []);

  const runGlobalTest = useCallback(() => {
    setGlobalLoading(true);
    setGlobalData(null);
    adminFetch("/admin/scraping-health-all")
      .then(setGlobalData)
      .catch((e) => toast.error("Test global failed : " + (e.message || "erreur")))
      .finally(() => setGlobalLoading(false));
  }, []);

  const [vpsData, setVpsData] = useState(null);
  const [vpsLoading, setVpsLoading] = useState(false);
  const runVpsTest = useCallback(() => {
    setVpsLoading(true);
    setVpsData(null);
    adminFetch("/admin/vps-health")
      .then(setVpsData)
      .catch((e) => toast.error("Test VPS failed : " + (e.message || "erreur")))
      .finally(() => setVpsLoading(false));
  }, []);

  const [resetAllLoading, setResetAllLoading] = useState(false);
  const handleResetAllCampaigns = useCallback(() => {
    if (!window.confirm(
      "🚨 PURGE TOTALE — DERNIER AVERTISSEMENT 🚨\n\n" +
      "Cette action va effacer TOUTES les stats de TOUTES les campagnes :\n" +
      "- Toutes les vidéos trackées\n" +
      "- Tous les snapshots quotidiens\n" +
      "- Tous les budget_used remis à 0\n\n" +
      "Un re-scrape complet sera lancé en background (2-10 min).\n\n" +
      "Confirmer la purge globale ?"
    )) return;
    setResetAllLoading(true);
    adminFetch("/admin/reset-all-tracking-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    })
      .then((d) => {
        const del = d?.deleted || {};
        toast.success(
          `✓ Purge effectuée : ${del.tracked_videos || 0} vidéos + ${(del.video_snapshots || 0) + (del.campaign_snapshots || 0) + (del.user_snapshots || 0)} snapshots supprimés. Re-scrape lancé.`,
          { duration: 10000 }
        );
      })
      .catch((e) => toast.error("Reset all failed : " + (e.message || "erreur")))
      .finally(() => setResetAllLoading(false));
  }, []);

  const retryFailed = useCallback(() => {
    setRetrying(true);
    setRetryResult(null);
    adminFetch("/admin/retry-failed-insta", { method: "POST" })
      .then((r) => {
        setRetryResult(r);
        toast.success(`Retry : ${r.ok || 0} OK / ${r.failed || 0} echec`);
        runTest();  // refresh apres retry
      })
      .catch((e) => toast.error("Retry failed : " + (e.message || "erreur")))
      .finally(() => setRetrying(false));
  }, [runTest]);

  return (
    <div className="bg-[#121212] border border-white/10 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-white font-semibold text-base">🩺 Diagnostic Scraping (Insta + TikTok + YouTube)</p>
          <p className="text-xs text-white/50 mt-1">
            Teste chaque source en live. Identifie ce qui pète exactement et propose le fix.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={runGlobalTest}
            disabled={globalLoading}
            className="px-3 py-2 rounded-lg bg-[#00E5FF] hover:bg-[#00E5FF]/80 text-black text-sm font-semibold disabled:opacity-50"
          >
            {globalLoading ? "Test 3 plateformes..." : "🌐 Test 3 plateformes"}
          </button>
          <button
            onClick={runVpsTest}
            disabled={vpsLoading}
            className="px-3 py-2 rounded-lg bg-purple-500 hover:bg-purple-500/80 text-white text-sm font-semibold disabled:opacity-50"
          >
            {vpsLoading ? "Test VPS..." : "🖥️ Tester VPS"}
          </button>
          <button
            onClick={handleResetAllCampaigns}
            disabled={resetAllLoading}
            title="🚨 PURGE TOTALE de toutes les campagnes : efface toutes les stats DB et relance un scrape complet"
            className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50 border-2 border-red-500/50"
          >
            {resetAllLoading ? "🚨 Purge..." : "🚨 Reset toutes campagnes"}
          </button>
          <button
            onClick={runTest}
            disabled={loading}
            className="px-3 py-2 rounded-lg bg-[#FF007F] hover:bg-[#FF007F]/80 text-white text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Test Insta..." : "🩺 Test Insta détaillé"}
          </button>
          {data?.failed_accounts_count > 0 && (
            <button
              onClick={retryFailed}
              disabled={retrying}
              className="px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm border border-amber-500/30 disabled:opacity-50"
            >
              {retrying ? "Retry..." : `↻ Retry ${data.failed_accounts_count} comptes Insta`}
            </button>
          )}
        </div>
      </div>

      {/* Resultat test VPS */}
      {vpsData && (
        <div className={`rounded-lg border p-4 ${
          vpsData.verdict?.includes("✅") ? "bg-green-500/10 border-green-500/40" :
          vpsData.verdict?.includes("🚨") ? "bg-red-500/10 border-red-500/40" :
          "bg-amber-500/10 border-amber-500/40"
        }`}>
          <p className={`font-bold text-sm mb-2 ${
            vpsData.verdict?.includes("✅") ? "text-green-400" :
            vpsData.verdict?.includes("🚨") ? "text-red-400" : "text-amber-400"
          }`}>{vpsData.verdict}</p>
          {vpsData.fix && (
            <p className="text-white/70 text-xs mb-2">🔧 {vpsData.fix}</p>
          )}
          {vpsData.vps_url && (
            <p className="text-[10px] text-white/40 mb-2 font-mono">URL : {vpsData.vps_url}</p>
          )}
          <div className="space-y-1">
            {(vpsData.tests || []).map((t, i) => (
              <div key={i} className={`text-xs px-2 py-1.5 rounded ${
                t.ok ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-300"
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{t.ok ? "✅" : "❌"} {t.name}</span>
                  {t.duration_ms !== undefined && <span className="text-[10px] opacity-60">{t.duration_ms}ms</span>}
                </div>
                {t.result && <p className="text-[10px] opacity-80 mt-0.5">→ {t.result}</p>}
                {t.error && <p className="text-[10px] opacity-80 mt-0.5">err: {t.error.substring(0, 200)}</p>}
                {!t.ok && t.fix_if_failed && (
                  <p className="text-[10px] text-amber-300 mt-1">🔧 {t.fix_if_failed}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resultat test global 3 plateformes */}
      {globalData && (
        <div className="space-y-3">
          {/* Verdict */}
          <div className={`p-3 rounded-lg border ${
            globalData.verdict?.includes("🚨") ? "bg-red-500/10 border-red-500/40" :
            globalData.verdict?.includes("⚠️") ? "bg-amber-500/10 border-amber-500/40" :
            "bg-green-500/10 border-green-500/40"
          }`}>
            <p className={`font-bold ${
              globalData.verdict?.includes("🚨") ? "text-red-400" :
              globalData.verdict?.includes("⚠️") ? "text-amber-400" : "text-green-400"
            }`}>{globalData.verdict}</p>
            {globalData.recommendation && (
              <p className="text-white/70 text-xs mt-2">💡 {globalData.recommendation}</p>
            )}
          </div>

          {/* Config globale */}
          {globalData.config_global && (
            <div className="bg-white/3 rounded-lg p-3">
              <p className="text-[11px] text-white/50 font-semibold uppercase mb-2">Config env Railway</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                {Object.entries(globalData.config_global).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-white/50 truncate">{k}</span>
                    <span className={`font-mono ${typeof v === "string" && v.includes("❌") ? "text-red-400" : typeof v === "string" && v.includes("✅") ? "text-green-400" : "text-white"}`}>
                      {typeof v === "boolean" ? (v ? "✅ true" : "❌ false") : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3 plateformes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {Object.entries(globalData.platforms || {}).map(([plat, info]) => {
              const platMeta = { instagram: { icon: "📸", label: "Instagram" }, tiktok: { icon: "🎵", label: "TikTok" }, youtube: { icon: "▶️", label: "YouTube" } }[plat] || { icon: "?", label: plat };
              return (
                <div key={plat} className={`rounded-lg border p-3 ${info.any_working ? "bg-green-500/5 border-green-500/30" : "bg-red-500/5 border-red-500/30"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white font-bold text-sm">{platMeta.icon} {platMeta.label}</p>
                    <span className={`text-xs font-bold ${info.any_working ? "text-green-400" : "text-red-400"}`}>
                      {info.any_working ? "✅ OK" : "❌ HS"}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/40 mb-2">Test : @{info.test_account}</p>
                  <div className="space-y-1">
                    {(info.sources || []).map((s, i) => (
                      <div key={i} className={`text-xs px-2 py-1 rounded ${
                        s.skipped ? "bg-white/5 text-white/40" :
                        s.ok ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-300"
                      }`}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate">{s.skipped ? "⏭️" : s.ok ? "✅" : "❌"} {s.name}</span>
                          {s.duration_ms !== undefined && <span className="text-[9px] opacity-60">{s.duration_ms}ms</span>}
                        </div>
                        {s.result && <p className="text-[10px] opacity-80 mt-0.5">→ {s.result}</p>}
                        {s.error && <p className="text-[10px] opacity-80 mt-0.5">err: {s.error.substring(0, 80)}</p>}
                        {!s.ok && s.fix_if_failed && (
                          <p className="text-[10px] text-amber-300 mt-0.5">🔧 {s.fix_if_failed}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {(globalData.failed_accounts_by_platform?.[plat] || []).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/10">
                      <p className="text-[10px] text-red-400 font-semibold mb-1">
                        {globalData.failed_accounts_by_platform[plat].length} compte{globalData.failed_accounts_by_platform[plat].length > 1 ? "s" : ""} en erreur :
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {globalData.failed_accounts_by_platform[plat].slice(0, 5).map((a, i) => (
                          <div key={i} className="text-[10px] bg-white/3 rounded p-1">
                            <p className="text-white truncate">@{a.username}</p>
                            <p className="text-red-300/70 truncate">{a.error}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!data && !loading && (
        <p className="text-xs text-white/40 text-center py-3">Clique "Lancer test complet" pour voir l'état des sources.</p>
      )}

      {data && (
        <>
          {/* Verdict global */}
          <div className={`p-3 rounded-lg border ${
            data.verdict?.includes("🚨") ? "bg-red-500/10 border-red-500/40" :
            data.verdict?.includes("⚠️") ? "bg-amber-500/10 border-amber-500/40" :
            "bg-green-500/10 border-green-500/40"
          }`}>
            <p className={`font-bold ${
              data.verdict?.includes("🚨") ? "text-red-400" :
              data.verdict?.includes("⚠️") ? "text-amber-400" : "text-green-400"
            }`}>{data.verdict}</p>
            {data.recommendation && (
              <p className="text-white/70 text-xs mt-2">💡 {data.recommendation}</p>
            )}
          </div>

          {/* Config */}
          {data.config && (
            <div className="bg-white/3 rounded-lg p-3">
              <p className="text-[11px] text-white/50 font-semibold uppercase mb-2">Configuration env</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                {Object.entries(data.config).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-white/50 truncate">{k}</span>
                    <span className={`font-mono ${typeof v === "string" && v.includes("❌") ? "text-red-400" : typeof v === "string" && v.includes("✅") ? "text-green-400" : "text-white"}`}>
                      {typeof v === "boolean" ? (v ? "✅ true" : "❌ false") : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sources testees */}
          <div className="space-y-2">
            <p className="text-[11px] text-white/50 font-semibold uppercase">Sources testées sur @{data.test_username}</p>
            {(data.sources || []).map((s, i) => (
              <div key={i} className={`p-3 rounded-lg border text-sm ${
                s.skipped ? "bg-white/3 border-white/10" :
                s.ok ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
              }`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`font-semibold ${s.skipped ? "text-white/40" : s.ok ? "text-green-400" : "text-red-400"}`}>
                    {s.skipped ? "⏭️" : s.ok ? "✅" : "❌"} {s.name}
                  </span>
                  {s.duration_ms !== undefined && (
                    <span className="text-[10px] text-white/40 font-mono">{s.duration_ms}ms</span>
                  )}
                </div>
                {s.result && <p className="text-xs text-white/70 mt-1">→ {s.result}</p>}
                {s.error && <p className="text-xs text-red-300 mt-1">Erreur : {s.error}</p>}
                {s.reason && <p className="text-xs text-white/50 mt-1 italic">{s.reason}</p>}
                {!s.ok && s.fix_if_failed && (
                  <p className="text-[11px] text-amber-300 mt-1.5">🔧 Fix : {s.fix_if_failed}</p>
                )}
              </div>
            ))}
          </div>

          {/* Comptes en erreur dans la DB */}
          {data.failed_accounts_count > 0 && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <p className="text-red-400 font-semibold text-sm mb-2">
                🚨 {data.failed_accounts_count} compte{data.failed_accounts_count > 1 ? "s" : ""} Insta en erreur dans la DB
              </p>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {(data.failed_accounts_in_db || []).map((acc, i) => (
                  <div key={i} className="text-xs bg-white/3 rounded p-2">
                    <p className="text-white">@{acc.username} <span className="text-white/40 ml-2">({acc.status})</span></p>
                    <p className="text-red-300 text-[10px] mt-0.5 truncate" title={acc.last_scrape_error}>
                      {acc.last_scrape_error || "?"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {retryResult && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-xs">
              <p className="text-blue-300 font-semibold">Résultat retry</p>
              <p className="text-white/70">
                Re-scrapé : {retryResult.retried || 0} · ✓ OK : {retryResult.ok || 0} · ❌ Échec : {retryResult.failed || 0}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ApiCapacitySection() {
  // Conserve pour rétro-compat — redirige vers SiteHealthSection
  return <SiteHealthSection />;
}

function _UnusedApiCapacitySection() {
  const [cap, setCap] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    adminFetch("/admin/api-capacity")
      .then(setCap)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  if (loading && !cap) {
    return <div className="bg-[#121212] border border-white/10 rounded-xl p-5 text-white/40 text-sm">Chargement capacités APIs...</div>;
  }
  if (!cap || cap.error) {
    return (
      <div className="bg-[#121212] border border-white/10 rounded-xl p-5">
        <p className="text-white/60 text-sm">Capacités API : {cap?.error || "indisponible"}</p>
        <button onClick={refresh} className="mt-2 text-[#00E5FF] text-xs underline">Reessayer</button>
      </div>
    );
  }

  const PLATFORM_LABELS = {
    tiktok: { label: "TikTok", icon: "🎵", color: "#00E5FF" },
    instagram: { label: "Instagram", icon: "📸", color: "#FF007F" },
    youtube: { label: "YouTube", icon: "▶️", color: "#FF4444" },
  };
  const statusBg = (s) => s === "RED" ? "bg-red-500/15 border-red-500/40" : s === "ORANGE" ? "bg-amber-500/15 border-amber-500/40" : "bg-green-500/15 border-green-500/40";
  const statusFg = (s) => s === "RED" ? "text-red-400" : s === "ORANGE" ? "text-amber-400" : "text-green-400";

  return (
    <div className="bg-[#121212] border border-white/10 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-semibold text-base">📊 Capacite mensuelle scraping (gratuit)</p>
          <p className="text-xs text-white/50 mt-1">Pourcentage du quota mensuel utilise par plateforme. Permet de savoir quand upgrader le proxy ou les quotas API.</p>
        </div>
        <button onClick={refresh} disabled={loading} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs">
          {loading ? "..." : "↻"}
        </button>
      </div>

      {cap.recommendation && (
        <div className="p-3 rounded-lg bg-[#00E5FF]/8 border border-[#00E5FF]/25 text-[#00E5FF] text-sm font-medium">
          💡 {cap.recommendation}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {Object.entries(cap.platforms || {}).map(([plat, p]) => {
          const meta = PLATFORM_LABELS[plat] || { label: plat, icon: "", color: "#fff" };
          return (
            <div key={plat} className={`rounded-xl border p-4 ${statusBg(p.status)}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{meta.icon}</span>
                  <span className="text-white font-semibold">{meta.label}</span>
                </div>
                <span className={`text-2xl font-mono font-bold ${statusFg(p.status)}`}>{p.month_usage_pct}%</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-3">
                <div className="h-full transition-all" style={{ width: `${Math.min(100, p.month_usage_pct)}%`, background: meta.color }} />
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-white/50">
                  <span>Mois en cours</span>
                  <span className="text-white font-mono">{(p.month_calls || 0).toLocaleString("fr-FR")} / {(p.month_capacity || 0).toLocaleString("fr-FR")}</span>
                </div>
                <div className="flex justify-between text-white/50">
                  <span>Aujourd'hui</span>
                  <span className="text-white font-mono">{(p.today_calls || 0).toLocaleString("fr-FR")} / {(p.day_capacity || 0).toLocaleString("fr-FR")} ({p.day_usage_pct}%)</span>
                </div>
                <div className="flex justify-between text-white/50">
                  <span>Reste ce mois</span>
                  <span className="text-white font-mono">{(p.remaining_month || 0).toLocaleString("fr-FR")}</span>
                </div>
                {p.days_until_full !== null && p.days_until_full !== undefined && (
                  <div className="flex justify-between text-white/50">
                    <span>Saturation prevue</span>
                    <span className={p.days_until_full < 30 ? "text-amber-400 font-mono" : "text-white/70 font-mono"}>
                      {p.days_until_full > 0 ? `dans ${p.days_until_full}j` : "depassee"}
                    </span>
                  </div>
                )}
              </div>
              <p className={`text-[11px] mt-2 ${statusFg(p.status)}`}>{p.advice}</p>
            </div>
          );
        })}
      </div>

      {cap.global && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-white/10">
          <div className="bg-white/3 rounded-lg p-3">
            <p className="text-[10px] text-white/40 uppercase">Goulot</p>
            <p className="text-white font-mono font-bold mt-1">{cap.global.bottleneck_platform}</p>
            <p className="text-xs text-amber-400">{cap.global.bottleneck_usage_pct}% utilise</p>
          </div>
          <div className="bg-white/3 rounded-lg p-3">
            <p className="text-[10px] text-white/40 uppercase">Comptes possibles en plus</p>
            <p className="text-white font-mono font-bold mt-1">{(cap.global.additional_accounts_capacity || 0).toLocaleString("fr-FR")}</p>
            <p className="text-xs text-white/50">avant saturation</p>
          </div>
          <div className="bg-white/3 rounded-lg p-3">
            <p className="text-[10px] text-white/40 uppercase">Plan small (30 cpt)</p>
            <p className="text-white font-mono font-bold mt-1">+{cap.global.max_new_agencies_per_plan?.small || 0}</p>
            <p className="text-xs text-white/50">agences possibles</p>
          </div>
          <div className="bg-white/3 rounded-lg p-3">
            <p className="text-[10px] text-white/40 uppercase">Plan medium / large</p>
            <p className="text-white font-mono font-bold mt-1">+{cap.global.max_new_agencies_per_plan?.medium || 0} / +{cap.global.max_new_agencies_per_plan?.large || 0}</p>
            <p className="text-xs text-white/50">agences possibles</p>
          </div>
        </div>
      )}
    </div>
  );
}

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

      {/* NEW : Capacite mensuelle scraping (TT/IG/YT en %) */}
      <ApiCapacitySection />

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
    { key: "gocardless",   label: "GoCardless (SEPA)",                icon: CreditCard, desc: "Paiements SEPA + abonnements récurrents (sandbox/live)" },
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
  const [scrapingId, setScrapingId] = useState(null); // campaign_id en cours de scrape

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

  const handleForceScrape = async (campaignId, campaignName) => {
    if (scrapingId) return; // déjà en cours
    setScrapingId(campaignId);
    toast.info(`Scraping en cours pour "${campaignName}" — peut prendre 30s à 2min...`);
    try {
      const res = await adminFetch(`/admin/campaigns/${campaignId}/force-scrape`, { method: "POST" });
      toast.success(`✓ Scraping terminé : ${res.total_videos_inserted || 0} vidéos · ${res.total_errors || 0} erreurs · ${res.accounts_scraped || 0} comptes`, { duration: 6000 });
    } catch (e) {
      toast.error(`Erreur scraping : ${e.message}`);
    } finally {
      setScrapingId(null);
    }
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
                            const res = await fetch(`${API}/admin/preview-as/${c.agency_id}`, {
                              method: "POST", credentials: "include",
                              headers: { "X-Admin-Code": localStorage.getItem(ADMIN_CODE_KEY) || "" },
                            });
                            if (!res.ok) { const e = await res.json(); toast.error(e.detail || "Erreur"); return; }
                            const d = await res.json();
                            window.open(`/agency/campaign/${c.campaign_id}`, "_blank");
                            toast.success(`✓ Connecté comme ${d.user.display_name || d.user.email} (2h) - relog admin requis apres`);
                          } catch (e) { toast.error(e.message); }
                        }}
                        className="p-1.5 rounded bg-[#FF007F]/10 hover:bg-[#FF007F]/20 text-[#FF007F] transition-all"
                        title="Voir comme l'agence (impersonate 2h)"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleForceScrape(c.campaign_id, c.name)}
                        disabled={scrapingId === c.campaign_id}
                        className={`p-1.5 rounded transition-all ${scrapingId === c.campaign_id ? "bg-[#39FF14]/20 text-[#39FF14] cursor-wait" : "bg-[#39FF14]/10 hover:bg-[#39FF14]/20 text-[#39FF14]"}`}
                        title={scrapingId === c.campaign_id ? "Scraping en cours..." : "Lancer un scraping de cette campagne (admin)"}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${scrapingId === c.campaign_id ? "animate-spin" : ""}`} />
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
  const [mobileOpen, setMobileOpen] = useState(false);
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
    { id: "scraping-history", label: "Historique Scraping", icon: RefreshCw },
    { id: "fraud-alerts", label: "🚨 Alertes Fraude", icon: AlertTriangle },
    { id: "prospects", label: "Prospects", icon: Building2 },
    { id: "support", label: "Support Chat", icon: MessageCircle },
    { id: "settings", label: "Paramètres", icon: Settings },
  ];

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const handleSelect = (id) => {
    setActive(id);
    setMobileOpen(false);
  };

  const sidebarBody = (
    <>
      <div className="p-5 border-b border-white/10 flex items-center gap-2">
        <Shield className="w-5 h-5 text-[#00E5FF]" />
        <span className="text-sm font-bold text-white flex-1">Admin Panel</span>
        <button onClick={() => setMobileOpen(false)} className="md:hidden p-1.5 rounded-lg hover:bg-white/5 text-white/50" aria-label="Fermer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all ${
                isActive
                  ? "bg-[#00E5FF]/15 text-[#00E5FF]"
                  : "text-white/55 hover:text-white hover:bg-white/5"
              } ${item.preview && !isActive ? "opacity-80" : ""}`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
              {item.preview && <ExternalLink className="w-3 h-3 ml-auto opacity-40" />}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion admin
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Hamburger mobile */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 w-10 h-10 rounded-xl bg-[#1a1a1a]/95 backdrop-blur border border-white/10 flex items-center justify-center text-white/80 shadow-lg"
        aria-label="Ouvrir le menu admin"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 min-h-screen bg-[#0d0d0d] border-r border-white/10 flex-col">
        {sidebarBody}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
              className="md:hidden fixed left-0 top-0 bottom-0 w-[85vw] max-w-[300px] bg-[#0d0d0d] border-r border-white/10 flex flex-col z-[60] shadow-2xl"
            >
              {sidebarBody}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
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
    if (active === "scraping-history") return <ScrapingHistoryTab />;
    if (active === "fraud-alerts") return <FraudAlertsTab />;
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
      <main className="flex-1 p-4 pt-16 md:p-8 overflow-auto">
        {renderContent()}
      </main>
    </div>
  );
}

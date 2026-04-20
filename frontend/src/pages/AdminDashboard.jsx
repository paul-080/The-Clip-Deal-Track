import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard, Users, Play, Building2, Briefcase, UserCircle,
  Plug, Settings, LogOut, RefreshCw, Trash2, Ban, CheckCircle2,
  XCircle, AlertCircle, Clock, Database, Youtube, Zap, CreditCard,
  Globe, ChevronRight, Eye, ExternalLink, Shield, AlertTriangle,
  MessageCircle, Send
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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

function OverviewTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState([]);

  useEffect(() => {
    adminFetch("/admin/stats")
      .then(setStats)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    adminFetch("/admin/stats/videos-timeline")
      .then((d) => setTimeline(d.timeline || []))
      .catch(() => {});
  }, []);

  if (loading) return <div className="text-white/40 text-sm">Chargement...</div>;
  if (!stats) return null;

  const cards = [
    { label: "Utilisateurs", value: stats.users, icon: Users, color: "text-blue-400" },
    { label: "Campagnes", value: stats.campaigns, icon: Play, color: "text-purple-400" },
    { label: "Vidéos trackées", value: stats.tracked_videos, icon: Eye, color: "text-green-400" },
    { label: "Comptes sociaux", value: stats.social_accounts, icon: Globe, color: "text-amber-400" },
    { label: "Messages", value: stats.messages, icon: Briefcase, color: "text-pink-400" },
    { label: "Membres campagne", value: stats.campaign_members, icon: UserCircle, color: "text-cyan-400" },
    { label: "Revenus total", value: `${stats.total_earnings_eur} €`, icon: CreditCard, color: "text-[#00E5FF]" },
  ];

  const hasData = timeline.some(d => d.videos > 0);

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-6">Vue d'ensemble</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-[#1a1a1a] border border-white/10 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <card.icon className={`w-5 h-5 ${card.color}`} />
              <span className="text-white/50 text-xs">{card.label}</span>
            </div>
            <div className="text-2xl font-bold text-white">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="mt-8 bg-[#1a1a1a] border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <p className="text-white font-medium">Vues trackées — 30 derniers jours</p>
          {!hasData && <span className="text-white/30 text-xs">Aucune donnée récente</span>}
        </div>
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={timeline} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorVids" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00E5FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                tickFormatter={(d) => d.slice(5)}
                interval={4}
              />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", fontSize: 12 }}
                labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                formatter={(v, name) => [v.toLocaleString("fr-FR"), "Vues"]}
              />
              <Area type="monotone" dataKey="views" stroke="#00E5FF" fill="url(#colorVids)" strokeWidth={2} dot={false} name="views" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-white/20 text-sm">
            Les données apparaîtront après le premier tracking
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

function ApiStatusTab() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const testAll = useCallback(() => {
    setLoading(true);
    adminFetch("/admin/api-status")
      .then(setStatus)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { testAll(); }, [testAll]);

  const apis = [
    { key: "mongodb", label: "MongoDB", icon: Database, desc: "Base de données principale" },
    { key: "youtube_api", label: "YouTube API", icon: Youtube, desc: "YouTube Data API v3" },
    { key: "playwright", label: "Playwright", icon: Globe, desc: "Scraping TikTok / Instagram" },
    { key: "stripe", label: "Stripe", icon: CreditCard, desc: "Paiements et abonnements" },
    { key: "google_oauth", label: "Google OAuth", icon: Shield, desc: "Connexion Google" },
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
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
        <p className="text-white/30 text-xs mb-5 flex items-center gap-1">
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
            </div>
          );
        })}
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

// ─── AdminCampaignsTab ────────────────────────────────────────────────────────

function AdminCampaignsTab() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [search, setSearch] = useState("");

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
    <div>
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
                <th className="text-left py-3 px-4">Statut</th>
                <th className="text-left py-3 px-4">Membres</th>
                <th className="text-left py-3 px-4">RPM</th>
                <th className="text-left py-3 px-4">Créée le</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.campaign_id} data-campaign-id={c.campaign_id} data-campaign-name={c.name} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="py-3 px-4 text-white font-medium">{c.name}</td>
                  <td className="py-3 px-4 text-white/60">{c.agency_name}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs font-medium ${statusColors[c.status] || "text-white/40"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-white/60">{c.member_count || 0}</td>
                  <td className="py-3 px-4 text-[#39FF14] font-mono text-xs">€{c.rpm || 0}/1K</td>
                  <td className="py-3 px-4 text-white/40">{formatDate(c.created_at)}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2 justify-end">
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
                <tr><td colSpan={7} className="py-12 text-center text-white/30 text-sm">Aucune campagne</td></tr>
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
    { id: "posts", label: "Tous les posts", icon: Eye },
    { id: "campaigns", label: "Campagnes", icon: Play },
    { id: "preview-clipper", label: "Preview Clippeur", icon: Play },
    { id: "preview-agency", label: "Preview Agence", icon: Building2 },
    { id: "preview-manager", label: "Preview Manager", icon: Briefcase },
    { id: "preview-client", label: "Preview Client", icon: UserCircle },
    { id: "api-status", label: "Connexions API", icon: Plug },
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
          const isPreview = item.id.startsWith("preview-");
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-[#00E5FF]/15 text-[#00E5FF]"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              } ${isPreview && !isActive ? "opacity-75" : ""}`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
              {isPreview && <ExternalLink className="w-3 h-3 ml-auto opacity-50" />}
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
    if (active === "settings") return <SettingsTab />;
    if (active === "support") return <SupportTab />;
    if (previewRoles[active]) {
      const p = previewRoles[active];
      return <PreviewTab role={p.role} label={p.label} icon={p.icon} color={p.color} />;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex">
      <AdminSidebar active={active} setActive={setActive} onLogout={handleLogout} />
      <main className="flex-1 p-8 overflow-auto">
        {renderContent()}
      </main>
    </div>
  );
}

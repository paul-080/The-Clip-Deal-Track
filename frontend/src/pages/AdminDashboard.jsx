import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard, Users, Play, Building2, Briefcase, UserCircle,
  Plug, Settings, LogOut, RefreshCw, Trash2, Ban, CheckCircle2,
  XCircle, AlertCircle, Clock, Database, Youtube, Zap, CreditCard,
  Globe, ChevronRight, Eye, ExternalLink, Shield, AlertTriangle
} from "lucide-react";
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

  useEffect(() => {
    adminFetch("/admin/stats")
      .then(setStats)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
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
    </div>
  );
}

// ─── UsersTab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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

  const filtered = users.filter((u) =>
    !search ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Utilisateurs ({users.length})</h2>
        <div className="flex gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30 w-56"
          />
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
    { id: "preview-clipper", label: "Preview Clippeur", icon: Play },
    { id: "preview-agency", label: "Preview Agence", icon: Building2 },
    { id: "preview-manager", label: "Preview Manager", icon: Briefcase },
    { id: "preview-client", label: "Preview Client", icon: UserCircle },
    { id: "api-status", label: "Connexions API", icon: Plug },
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
    if (active === "api-status") return <ApiStatusTab />;
    if (active === "settings") return <SettingsTab />;
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

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth, API } from "../App";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video, Check, AlertCircle, Eye, TrendingUp, Users,
  Clock, Star, Lock, ChevronRight, Heart, MessageCircle, BarChart2, RefreshCw
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { GoogleLogin } from "@react-oauth/google";

const ROLE_CONFIG = {
  clipper: { color: "#00E5FF", label: "Clippeur", icon: Video },
  manager: { color: "#39FF14", label: "Manager", icon: Users },
  client:  { color: "#FFB300", label: "Client",   icon: Eye  },
};

function fmt(n) {
  return n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M`
       : n >= 1_000     ? `${(n/1_000).toFixed(0)}K`
       : String(n || 0);
}

const ACCENT = "#FFB300";
const PLAT_COLOR = { tiktok: "#00E5FF", instagram: "#FF007F", youtube: "#FF0000" };
const PLAT_LABEL = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };
const PERIODS = [{ label: "7j", days: 7 }, { label: "30j", days: 30 }, { label: "90j", days: 90 }, { label: "Tout", days: 0 }];

// ─── Page stats publique Client ──────────────────────────────────────────────
function ClientStatsPage({ token }) {
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [period, setPeriod]     = useState(30);
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [sortPub, setSortPub]   = useState("views"); // "views" | "published_at"

  const fetchStats = () => {
    setLoading(true);
    fetch(`${API}/campaigns/public-stats/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail)))
      .then(setStats)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStats(); }, [token]);

  if (loading) return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-[#FFB300] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
      <div className="text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-white font-bold text-xl mb-2">Lien invalide</p>
        <p className="text-white/50">{error}</p>
      </div>
    </div>
  );

  // Timeline filtrage par période
  const rawTimeline = stats.timeline || [];
  const tlFiltered = period === 0 ? rawTimeline : rawTimeline.slice(-period);
  const tlData = tlFiltered.map(d => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
  }));

  // Vidéos filtrées + triées
  const allVideos = stats.top_videos || [];
  const filteredVideos = [...(filterPlatform === "all" ? allVideos : allVideos.filter(v => v.platform === filterPlatform))]
    .sort((a, b) => {
      if (sortPub === "published_at") {
        const da = a.published_at || ""; const db = b.published_at || "";
        return da < db ? 1 : da > db ? -1 : 0;
      }
      return (b.views || 0) - (a.views || 0);
    });
  const platforms = Object.keys(stats.platforms || {});

  const kpis = [
    { label: "Vues totales",    value: fmt(stats.total_views),    color: "text-white" },
    { label: "Likes",           value: fmt(stats.total_likes),    color: "text-[#FFB300]" },
    { label: "Commentaires",    value: fmt(stats.total_comments), color: "text-white/70" },
    { label: "Engagement",      value: `${stats.engagement}%`,   color: "text-[#39FF14]" },
    { label: "Moy. vues/vidéo", value: fmt(stats.avg_views),     color: "text-[#00E5FF]" },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="border-b border-white/5 px-6 py-4 flex items-center gap-3">
        <img src="/logo.svg" alt="" className="w-8 h-8" onError={e => e.target.style.display="none"} />
        <span className="font-bold text-white">The Clip Deal Track</span>
        <span className="ml-auto text-xs bg-[#FFB300]/20 text-[#FFB300] px-2 py-1 rounded-full font-medium">Vue client</span>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Titre + refresh */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/40 text-sm mb-1">Campagne</p>
            <h1 className="font-bold text-3xl text-white">{stats.campaign_name}</h1>
          </div>
          <button onClick={fetchStats}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mt-2">
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
          </button>
        </div>

        {/* 5 KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {kpis.map(({ label, value, color }) => (
            <div key={label} className="bg-[#121212] border border-white/10 rounded-xl p-4">
              <p className={`font-mono font-black text-2xl ${color}`}>{value}</p>
              <p className="text-xs text-white/40 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 bg-white/5 rounded-xl p-1 w-fit border border-white/10">
          {[
            { id: "overview", label: "Vue d'ensemble" },
            { id: "videos",   label: `Vidéos (${allVideos.length})` },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id ? "bg-[#FFB300] text-black shadow-lg" : "text-white/50 hover:text-white"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (
          <div className="space-y-5">
            {/* Courbe */}
            <div className="bg-[#121212] border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-white">Évolution des vues</h2>
                <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
                  {PERIODS.map(p => (
                    <button key={p.days} onClick={() => setPeriod(p.days)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        period === p.days ? "bg-[#FFB300] text-black" : "text-white/40 hover:text-white"
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              {tlData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={tlData}>
                    <defs>
                      <linearGradient id="cg_pub" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={ACCENT} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="label" tick={{ fill: "#ffffff40", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#ffffff40", fontSize: 11 }} axisLine={false} tickLine={false}
                      tickFormatter={v => v >= 1000 ? `${Math.round(v/1000)}K` : v} />
                    <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                      labelStyle={{ color: "#fff" }} itemStyle={{ color: ACCENT }}
                      formatter={v => [v?.toLocaleString("fr-FR"), "Vues"]} />
                    <Area type="monotone" dataKey="views" stroke={ACCENT} strokeWidth={2}
                      fill="url(#cg_pub)" dot={false} activeDot={{ r: 4, fill: ACCENT }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-white/30 text-sm">
                  Aucune donnée disponible
                </div>
              )}
            </div>

            {/* Par plateforme */}
            {platforms.length > 0 && (
              <div className="bg-[#121212] border border-white/10 rounded-2xl p-6">
                <h2 className="font-semibold text-white mb-4">Par plateforme</h2>
                <div className="grid grid-cols-3 gap-4">
                  {platforms.map(plat => {
                    const d = stats.platforms[plat];
                    return (
                      <div key={plat} className="text-center p-4 bg-white/5 rounded-xl">
                        <p className="text-sm font-medium mb-2" style={{ color: PLAT_COLOR[plat] || "#fff" }}>
                          {PLAT_LABEL[plat] || plat}
                        </p>
                        <p className="font-mono font-bold text-white text-xl">{fmt(d.views)}</p>
                        <p className="text-xs text-white/40 mt-1">{d.count} vidéo{d.count > 1 ? "s" : ""}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VIDEOS ── */}
        {activeTab === "videos" && (
          <div className="space-y-3">
            {/* Barre tri + filtre */}
            <div className="flex flex-wrap gap-2">
              <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
                {[
                  { id: "views",        label: "🔥 Plus de vues" },
                  { id: "published_at", label: "🕐 Plus récent"  },
                ].map(s => (
                  <button key={s.id} onClick={() => setSortPub(s.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sortPub === s.id ? "bg-[#FFB300] text-black" : "text-white/40 hover:text-white"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              {platforms.length > 1 && (
                <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
                  {["all", ...platforms].map(p => (
                    <button key={p} onClick={() => setFilterPlatform(p)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterPlatform === p ? "bg-white/15 text-white" : "text-white/40 hover:text-white"}`}>
                      {p === "all" ? "Toutes" : PLAT_LABEL[p] || p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {filteredVideos.length === 0 ? (
              <div className="text-center py-12 text-white/30">Aucune vidéo</div>
            ) : (
              <div className="space-y-2">
                {filteredVideos.map((v, i) => {
                  const pc = PLAT_COLOR[v.platform] || "#fff";
                  const engRate = v.views
                    ? (((v.likes || 0) + (v.comments || 0)) / v.views * 100).toFixed(1) + "%"
                    : "—";
                  const medalColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
                  const borderColor = i < 3 ? `${medalColors[i]}50` : "rgba(255,255,255,0.08)";
                  return (
                    <div key={i} className="flex items-center gap-4 bg-[#121212] rounded-xl p-3"
                      style={{ border: `1px solid ${borderColor}` }}>
                      {/* Rang */}
                      <div className="w-9 flex-shrink-0 text-center">
                        {i < 3
                          ? <span className="text-2xl font-bold" style={{ color: medalColors[i] }}>{i + 1}</span>
                          : <span className="text-lg font-bold text-white/25">#{i + 1}</span>}
                      </div>
                      {/* Thumbnail */}
                      <a href={v.url} target="_blank" rel="noopener noreferrer"
                        className="relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden bg-white/5 group/t cursor-pointer">
                        {v.thumbnail_url
                          ? <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover group-hover/t:scale-105 transition-transform" />
                          : <div className="w-full h-full flex items-center justify-center"><Video className="w-6 h-6 text-white/20" /></div>}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/t:opacity-100 transition-opacity flex items-center justify-center">
                          <ChevronRight className="w-4 h-4 text-white" />
                        </div>
                        <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold px-1 py-0.5 rounded"
                          style={{ background: `${pc}dd`, color: "#000" }}>{v.platform}</span>
                      </a>
                      {/* Titre */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {v.title ? v.title.slice(0, 50) + (v.title.length > 50 ? "…" : "") : "—"}
                        </p>
                        <p className="text-white/30 text-xs mt-0.5">
                          {v.published_at ? new Date(v.published_at).toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"2-digit" }) : "—"}
                        </p>
                      </div>
                      {/* Stats */}
                      <div className="flex-shrink-0 flex gap-5 items-center">
                        <div className="text-center">
                          <p className="font-mono font-bold text-white text-sm">{fmt(v.views || 0)}</p>
                          <p className="text-[10px] text-white/30">vues</p>
                        </div>
                        <div className="text-center">
                          <p className="font-mono font-bold text-[#FF007F] text-sm">{fmt(v.likes || 0)}</p>
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

        <p className="text-center text-white/20 text-xs pt-4">
          Powered by The Clip Deal Track · Données actualisées automatiquement
        </p>
      </div>
    </div>
  );
}

// ─── Connexion / Inscription unifiée (clipper / manager) ─────────────────────
function RegisterAndJoin({ token, role, campaignInfo }) {
  const { color, label } = ROLE_CONFIG[role] || ROLE_CONFIG.clipper;
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode]         = useState("register"); // "register" | "login"
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [done, setDone]         = useState(false);

  // Après auth réussie → rejoindre la campagne
  const joinCampaign = async () => {
    try {
      const jres = await fetch(`${API}/campaigns/join/${token}`, {
        method: "POST", credentials: "include",
      });
      const jdata = await jres.json();
      if (!jres.ok && jdata.detail !== "Déjà membre de cette campagne") {
        toast.error(jdata.detail || "Erreur lors de la jonction");
        return false;
      }
    } catch {}
    return true;
  };

  // Connexion compte existant
  const handleLogin = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Email ou mot de passe incorrect"); return; }
      setUser(data.user);
      const ok = await joinCampaign();
      if (ok) {
        setDone(true);
        toast.success("Connecté !");
        setTimeout(() => navigate(`/${data.user.role || role}`), 1800);
      }
    } catch { setError("Erreur de connexion"); }
    finally { setLoading(false); }
  };

  // Inscription instantanée (sans code email)
  const handleRegister = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API}/auth/join-register`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, display_name: name, role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Erreur"); return; }
      setUser(data.user);
      const ok = await joinCampaign();
      if (ok) {
        setDone(true);
        toast.success("Compte créé !");
        setTimeout(() => navigate(`/${data.user.role || role}`), 1800);
      }
    } catch { setError("Erreur de connexion"); }
    finally { setLoading(false); }
  };

  // Google OAuth
  const handleGoogle = async (credentialResponse) => {
    setError(""); setLoading(true);
    try {
      const r = await fetch(`${API}/auth/google`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: credentialResponse.credential, role, display_name: name || "Utilisateur" }),
      });
      if (!r.ok) { const d = await r.json(); setError(d.detail || "Erreur Google"); return; }
      const data = await r.json();
      setUser(data.user);
      const ok = await joinCampaign();
      if (ok) {
        setDone(true);
        toast.success("Connecté avec Google !");
        setTimeout(() => navigate(`/${data.user.role || role}`), 1800);
      }
    } catch { setError("Erreur Google"); }
    finally { setLoading(false); }
  };

  if (done) return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
      <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} className="text-center">
        <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: `${color}20` }}>
          <Check className="w-10 h-10" style={{ color }} />
        </div>
        <h2 className="font-bold text-white text-2xl mb-2">
          {role === "clipper" ? "Campagne rejointe !" : "Candidature envoyée !"}
        </h2>
        <p className="text-white/50 text-sm mb-1">{campaignInfo?.name}</p>
        <p className="text-white/30 text-xs flex items-center justify-center gap-1 mt-4">
          <Clock className="w-3 h-3" /> Redirection...
        </p>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} className="w-full max-w-md space-y-4">

        {/* Bandeau campagne */}
        {campaignInfo && (
          <div className="bg-[#121212] border border-white/10 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
              <Video className="w-5 h-5" style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold truncate">{campaignInfo.name}</p>
              <p className="text-xs text-white/40">{campaignInfo.rpm}€ / 1 000 vues</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full font-bold border flex-shrink-0"
              style={{ color, borderColor: `${color}40`, background: `${color}15` }}>
              {label}
            </span>
          </div>
        )}

        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-7 space-y-5">

            {/* Toggle login / register */}
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
              {[["register","Créer un compte"],["login","J'ai déjà un compte"]].map(([m, lbl]) => (
                <button key={m} onClick={() => { setMode(m); setError(""); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === m ? "text-black shadow" : "text-white/50 hover:text-white"}`}
                  style={mode === m ? { backgroundColor: color } : {}}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Google OAuth */}
            <div className="flex flex-col items-center gap-3">
              <p className="text-white/30 text-xs">Continuer avec</p>
              <GoogleLogin
                onSuccess={handleGoogle}
                onError={() => setError("Connexion Google échouée")}
                theme="filled_black" shape="pill" text="continue_with" locale="fr" useOneTap={false}
              />
            </div>

            {/* Séparateur */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-white/30">ou</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Formulaire */}
            <form onSubmit={mode === "login" ? handleLogin : handleRegister} className="space-y-3">
              {mode === "register" && (
                <Input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Nom complet" required
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" />
              )}
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Adresse email" required
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" />
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder={mode === "register" ? "Mot de passe (6 caractères min.)" : "Mot de passe"}
                required minLength={mode === "register" ? 6 : 1}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" />

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <Button type="submit" disabled={loading} className="w-full py-5 font-bold text-black mt-2"
                style={{ backgroundColor: color }}>
                {loading ? "..." : mode === "login" ? "Se connecter →" : "Créer mon compte →"}
              </Button>
            </form>

          </CardContent>
        </Card>

        <p className="text-center text-white/20 text-xs">The Clip Deal Track</p>
      </motion.div>
    </div>
  );
}

// ─── Router principal ─────────────────────────────────────────────────────────
export default function JoinCampaign() {
  const { role, token } = useParams();
  const [campaignInfo, setCampaignInfo] = useState(null);
  const [infoError, setInfoError]       = useState(null);

  useEffect(() => {
    if (role === "client") return; // stats publiques, pas besoin d'info
    fetch(`${API}/campaigns/join-info/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail)))
      .then(setCampaignInfo)
      .catch(e => setInfoError(String(e)));
  }, [token, role]);

  // CLIENT → stats publiques sans compte
  if (role === "client") {
    return <ClientStatsPage token={token} />;
  }

  if (infoError) return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
      <div className="text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-white font-bold text-xl mb-2">Lien invalide</p>
        <p className="text-white/50">{infoError}</p>
      </div>
    </div>
  );

  // CLIPPER / MANAGER → inscription + join
  return <RegisterAndJoin token={token} role={role} campaignInfo={campaignInfo} />;
}

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

  // Vidéos filtrées
  const allVideos = stats.top_videos || [];
  const filteredVideos = filterPlatform === "all" ? allVideos : allVideos.filter(v => v.platform === filterPlatform);
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
            {/* Filtre plateforme */}
            {platforms.length > 1 && (
              <div className="flex gap-2">
                {["all", ...platforms].map(p => (
                  <button key={p} onClick={() => setFilterPlatform(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      filterPlatform === p
                        ? "border-[#FFB300]/50 bg-[#FFB300]/10 text-[#FFB300]"
                        : "border-white/10 text-white/40 hover:text-white"
                    }`}>
                    {p === "all" ? "Toutes" : PLAT_LABEL[p] || p}
                  </button>
                ))}
              </div>
            )}

            {filteredVideos.length === 0 ? (
              <div className="text-center py-12 text-white/30">Aucune vidéo</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredVideos.map((v, i) => (
                  <a key={i} href={v.url} target="_blank" rel="noopener noreferrer"
                    className="flex gap-3 bg-[#121212] border border-white/10 rounded-xl p-3 hover:border-white/20 transition-all group">
                    {v.thumbnail_url ? (
                      <img src={v.thumbnail_url} alt="" className="w-20 h-14 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-20 h-14 rounded-lg bg-white/5 flex-shrink-0 flex items-center justify-center">
                        <Video className="w-5 h-5 text-white/20" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white/80 text-sm line-clamp-2 group-hover:text-white transition-colors">
                        {v.title || v.url}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-white/40">
                        <span className="text-[#FFB300] font-mono font-bold">{fmt(v.views)} vues</span>
                        {v.likes > 0 && <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmt(v.likes)}</span>}
                        {v.comments > 0 && <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{fmt(v.comments)}</span>}
                        <span className="capitalize ml-auto" style={{ color: PLAT_COLOR[v.platform] || "#fff" }}>
                          {PLAT_LABEL[v.platform] || v.platform}
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
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

// ─── Formulaire inscription (clipper / manager) ───────────────────────────────
function RegisterAndJoin({ token, role, campaignInfo }) {
  const { color, label } = ROLE_CONFIG[role] || ROLE_CONFIG.clipper;
  const navigate = useNavigate();

  const [step, setStep]           = useState("register"); // register | verify | done
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [displayName, setName]    = useState("");
  const [code, setCode]           = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [joinResult, setJoinResult] = useState(null);

  // Étape 1 — Inscription + envoi code email
  const handleRegister = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, display_name: displayName, role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Erreur"); return; }
      setStep("verify");
      toast.success("Code envoyé par email !");
    } catch { setError("Erreur de connexion"); }
    finally { setLoading(false); }
  };

  // Étape 2 — Vérification du code → création compte → join campaign
  const handleVerify = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      // Vérifier le code et créer le compte
      const vres = await fetch(`${API}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code }),
      });
      const vdata = await vres.json();
      if (!vres.ok) { setError(vdata.detail || "Code invalide"); return; }

      // Rejoindre la campagne avec le token (le cookie de session vient d'être créé)
      const jres = await fetch(`${API}/campaigns/join/${token}`, {
        method: "POST",
        credentials: "include",
      });
      const jdata = await jres.json();
      if (!jres.ok) { setError(jdata.detail || "Erreur lors de la jonction"); return; }

      setJoinResult(jdata);
      setStep("done");

      if (role === "clipper") {
        toast.success("Candidature envoyée — en attente d'approbation de l'agence !");
        setTimeout(() => navigate("/clipper"), 2500);
      } else {
        toast.success("Candidature envoyée — en attente d'approbation !");
      }
    } catch { setError("Erreur de connexion"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
      <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} className="w-full max-w-md space-y-4">

        {/* Info campagne */}
        {campaignInfo && (
          <div className="bg-[#121212] border border-white/10 rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
              <Video className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className="text-white font-semibold">{campaignInfo.name}</p>
              <p className="text-xs text-white/40">{campaignInfo.rpm}€ / 1 000 vues · {campaignInfo.clipper_count} clippeurs actifs</p>
            </div>
            <span className="ml-auto text-xs px-2 py-1 rounded-full font-bold border" style={{ color, borderColor: `${color}40`, background: `${color}15` }}>
              {label}
            </span>
          </div>
        )}

        <Card className="bg-[#121212] border-white/10">
          <CardContent className="p-8">
            <AnimatePresence mode="wait">

              {/* ── Étape 1 : Inscription ── */}
              {step === "register" && (
                <motion.div key="register" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                      <Lock className="w-5 h-5" style={{ color }} />
                    </div>
                    <div>
                      <h2 className="font-bold text-white text-lg">Créer votre compte</h2>
                      <p className="text-white/40 text-xs">
                        {role === "clipper" ? "Vous rejoindrez la campagne automatiquement"
                          : "Votre candidature sera soumise à l'agence"}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleRegister} className="space-y-4">
                    <Input value={displayName} onChange={e => setName(e.target.value)}
                      placeholder="Votre nom complet" required
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="Adresse email" required
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Mot de passe (6 caractères min.)" required minLength={6}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />

                    {error && <p className="text-red-400 text-sm">{error}</p>}

                    <Button type="submit" disabled={loading} className="w-full py-5 font-bold text-black"
                      style={{ backgroundColor: color }}>
                      {loading ? "Envoi..." : "Continuer →"}
                    </Button>
                  </form>

                  <p className="text-center text-white/30 text-xs mt-4">
                    Déjà un compte ?{" "}
                    <a href="/login" className="underline" style={{ color }}>Se connecter</a>
                  </p>
                </motion.div>
              )}

              {/* ── Étape 2 : Code email ── */}
              {step === "verify" && (
                <motion.div key="verify" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
                  <div className="text-center mb-6">
                    <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: `${color}20` }}>
                      <Star className="w-7 h-7" style={{ color }} />
                    </div>
                    <h2 className="font-bold text-white text-xl mb-1">Vérifiez votre email</h2>
                    <p className="text-white/40 text-sm">Code envoyé à <span className="text-white">{email}</span></p>
                  </div>

                  <form onSubmit={handleVerify} className="space-y-4">
                    <Input value={code} onChange={e => setCode(e.target.value)}
                      placeholder="Code à 6 chiffres" required maxLength={6}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-center text-xl tracking-widest" />

                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                    <Button type="submit" disabled={loading} className="w-full py-5 font-bold text-black"
                      style={{ backgroundColor: color }}>
                      {loading ? "Vérification..." : role === "clipper" ? "Rejoindre la campagne ✓" : "Envoyer ma candidature ✓"}
                    </Button>
                  </form>

                  <button onClick={() => { setStep("register"); setError(""); }}
                    className="w-full text-center text-white/30 text-xs mt-3 hover:text-white/60">
                    ← Modifier mon email
                  </button>
                </motion.div>
              )}

              {/* ── Étape 3 : Succès ── */}
              {step === "done" && (
                <motion.div key="done" initial={{ opacity:0 }} animate={{ opacity:1 }} className="text-center py-4">
                  <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: `${color}20` }}>
                    <Check className="w-8 h-8" style={{ color }} />
                  </div>
                  {role === "clipper" ? (
                    <>
                      <h2 className="font-bold text-white text-2xl mb-2">Bienvenue !</h2>
                      <p className="text-white/60 mb-1">Vous avez rejoint</p>
                      <p className="font-bold text-white mb-4">{campaignInfo?.name}</p>
                      <p className="text-white/30 text-sm flex items-center justify-center gap-2">
                        <Clock className="w-3 h-3" /> Redirection vers votre dashboard...
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className="font-bold text-white text-2xl mb-2">Candidature envoyée !</h2>
                      <p className="text-white/60 mb-4">
                        L'agence va examiner votre candidature en tant que <span className="font-bold" style={{ color }}>Manager</span>.<br />
                        Vous recevrez une notification à <span className="text-white">{email}</span>.
                      </p>
                      <a href="/login" className="text-sm underline" style={{ color }}>
                        Se connecter →
                      </a>
                    </>
                  )}
                </motion.div>
              )}

            </AnimatePresence>
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

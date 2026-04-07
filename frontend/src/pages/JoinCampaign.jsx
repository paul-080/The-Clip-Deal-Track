import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth, API } from "../App";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video, Check, AlertCircle, Eye, TrendingUp, Users,
  Clock, Star, Lock, ChevronRight
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { toast } from "sonner";

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

// ─── Page stats publique Client ──────────────────────────────────────────────
function ClientStatsPage({ token }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    fetch(`${API}/campaigns/public-stats/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail)))
      .then(setStats)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [token]);

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

  const platforms = stats.platforms || {};

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="border-b border-white/5 px-6 py-4 flex items-center gap-3">
        <img src="/logo.svg" alt="" className="w-8 h-8" onError={e => e.target.style.display="none"} />
        <span className="font-bold text-white">The Clip Deal Track</span>
        <span className="ml-auto text-xs bg-[#FFB300]/20 text-[#FFB300] px-2 py-1 rounded-full font-medium">
          Vue client
        </span>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div>
          <p className="text-white/40 text-sm mb-1">Campagne</p>
          <h1 className="font-bold text-3xl text-white">{stats.campaign_name}</h1>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Vues totales",   value: fmt(stats.total_views),  color: "#FFB300", icon: Eye },
            { label: "Vidéos trackées",value: fmt(stats.total_videos), color: "#00E5FF", icon: Video },
            { label: "Clippeurs actifs",value: stats.clipper_count,   color: "#39FF14", icon: Users },
            { label: "RPM",            value: `${stats.rpm}€/1K`,      color: "#FF007F", icon: TrendingUp },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-[#121212] border border-white/10 rounded-xl p-5">
              <Icon className="w-4 h-4 mb-2" style={{ color }} />
              <p className="font-mono font-black text-2xl text-white">{value}</p>
              <p className="text-xs text-white/40 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Plateformes */}
        {Object.keys(platforms).length > 0 && (
          <div className="bg-[#121212] border border-white/10 rounded-xl p-6">
            <h2 className="font-bold text-white mb-4">Par plateforme</h2>
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(platforms).map(([plat, d]) => (
                <div key={plat} className="text-center">
                  <p className="text-sm font-medium text-white capitalize">{plat}</p>
                  <p className="font-mono font-bold text-[#FFB300] text-lg">{fmt(d.views)}</p>
                  <p className="text-xs text-white/40">{d.count} vidéos</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top vidéos */}
        {stats.top_videos?.length > 0 && (
          <div className="bg-[#121212] border border-white/10 rounded-xl p-6">
            <h2 className="font-bold text-white mb-4">Top vidéos</h2>
            <div className="space-y-2">
              {stats.top_videos.slice(0, 8).map((v, i) => (
                <a key={i} href={v.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors group">
                  <span className="text-white/30 text-xs w-4">{i+1}</span>
                  <span className="flex-1 text-white/80 text-sm truncate group-hover:text-white">
                    {v.title || v.url}
                  </span>
                  <span className="text-xs font-mono text-[#FFB300]">{fmt(v.views)}</span>
                  <span className="text-xs text-white/30 capitalize">{v.platform}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-white/20 text-xs">
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
        toast.success("Bienvenue ! Vous avez rejoint la campagne ✓");
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

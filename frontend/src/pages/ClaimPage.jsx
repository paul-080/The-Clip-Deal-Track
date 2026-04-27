import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { GoogleLogin } from "@react-oauth/google";

const API = process.env.REACT_APP_BACKEND_URL || "";

export default function ClaimPage({ type = "agency" }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    display_name: "",
    discord_username: "",
  });
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/claim/info/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => setInfo(d))
      .catch(() => toast.error("Lien invalide ou expiré"))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!form.email || !form.password) { toast.error("Email + mot de passe requis"); return; }
    if (type === "clipper" && !form.discord_username) { toast.error("Pseudo Discord requis"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/claim/${type}/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const d = await res.json();
        // Stocke le session_token et redirige
        if (d.session_token) {
          document.cookie = `session_token=${d.session_token}; path=/; max-age=691200; SameSite=Lax`;
          localStorage.setItem("session_token", d.session_token);
        }
        if (type === "clipper" && d.linked_count > 0) {
          toast.success(`✓ Compte créé — ${d.linked_count} compte${d.linked_count>1?"s":""} social${d.linked_count>1?"aux":""} auto-lié${d.linked_count>1?"s":""}`);
        } else {
          toast.success("✓ Compte créé !");
        }
        setTimeout(() => navigate(type === "agency" ? "/agency" : "/clipper"), 1000);
      } else {
        const e = await res.json();
        toast.error(e.detail || "Erreur");
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#FF007F] border-t-transparent rounded-full animate-spin" />
    </div>;
  }
  if (!info) {
    return <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-white/40 text-center p-8">
      <div>
        <p className="text-2xl mb-3">⚠️</p>
        <p>Lien invalide ou déjà utilisé</p>
      </div>
    </div>;
  }

  const isAgency = type === "agency";
  const accent = isAgency ? "#FF007F" : "#00E5FF";

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-[#121212] border border-white/10 rounded-2xl p-8 space-y-6">
          <div className="text-center">
            <div className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-3" style={{ background: accent + "20", color: accent }}>
              {isAgency ? "ACCÈS AGENCE" : "ACCÈS CLIPPER"}
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {isAgency ? "Récupère ta campagne" : "Rejoins la campagne"}
            </h1>
            <p className="text-white/50 text-sm">
              <span className="font-medium text-white">{info.campaign_name}</span><br/>
              <span className="text-white/40">par {info.agency_name}</span><br/>
              <span className="text-xs text-white/30 mt-1 block">
                {info.payment_model === "clicks" ? `Tarif : ${info.rate_per_click}€/1000 clics` : `RPM : ${info.rpm}€/1000 vues`}
              </span>
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">Nom / pseudo affiché</label>
              <input value={form.display_name} onChange={e => setForm(p => ({...p, display_name: e.target.value}))}
                placeholder={isAgency ? "Ton agence" : "Ton pseudo"}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none" style={{ borderColor: form.display_name ? accent + "40" : undefined }} />
            </div>
            {!isAgency && (
              <div>
                <label className="text-xs text-white/50 block mb-1">Pseudo Discord *</label>
                <input value={form.discord_username} onChange={e => setForm(p => ({...p, discord_username: e.target.value}))}
                  placeholder="ton_pseudo (sans #1234)"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none" />
                <p className="text-[10px] text-white/30 mt-1">Permet de récupérer auto les comptes que tu utilisais déjà</p>
              </div>
            )}
            <div>
              <label className="text-xs text-white/50 block mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))}
                placeholder="ton@email.com"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">Mot de passe *</label>
              <div className="relative">
                <input type={showPwd ? "text" : "password"} value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))}
                  placeholder="6 chars, 1 majuscule, 1 spécial"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none pr-12" />
                <button onClick={() => setShowPwd(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40 hover:text-white">{showPwd ? "Cacher" : "Voir"}</button>
              </div>
            </div>
          </div>

          <button onClick={submit} disabled={submitting}
            className="w-full py-3 rounded-xl text-black font-bold text-sm transition disabled:opacity-50"
            style={{ background: accent }}>
            {submitting ? "Création..." : `Créer mon compte ${isAgency ? "agence" : "clipper"} et accéder`}
          </button>

          {/* Separator + Google OAuth */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/30">ou</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <div className="flex flex-col items-center gap-2">
            {!isAgency && !form.discord_username && (
              <p className="text-amber-400 text-[11px] text-center">⚠ Renseigne ton pseudo Discord ci-dessus AVANT d'utiliser Google (sinon les comptes ne seront pas auto-liés)</p>
            )}
            <GoogleLogin
              onSuccess={async (cred) => {
                if (!isAgency && !form.discord_username) {
                  toast.error("Renseigne ton pseudo Discord d'abord");
                  return;
                }
                setSubmitting(true);
                try {
                  // 1. Auth via Google -> cree le user + session
                  const r = await fetch(`${API}/api/auth/google`, {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id_token: cred.credential, role: type, display_name: form.display_name || (isAgency ? info.agency_name : form.discord_username) }),
                  });
                  if (!r.ok) { const d = await r.json(); toast.error(d.detail || "Erreur Google"); return; }
                  // 2. Finalise le claim avec ce user
                  const finalizeBody = isAgency ? {} : { discord_username: form.discord_username };
                  const r2 = await fetch(`${API}/api/claim/${type}/${token}/finalize`, {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(finalizeBody),
                  });
                  if (!r2.ok) { const d = await r2.json(); toast.error(d.detail || "Erreur claim"); return; }
                  const d2 = await r2.json();
                  if (!isAgency && d2.linked_count > 0) {
                    toast.success(`✓ ${d2.linked_count} compte(s) auto-lié(s)`);
                  } else {
                    toast.success("✓ Compte connecté !");
                  }
                  setTimeout(() => navigate(isAgency ? "/agency" : "/clipper"), 1000);
                } catch (e) { toast.error(e.message); }
                finally { setSubmitting(false); }
              }}
              onError={() => toast.error("Connexion Google échouée")}
              theme="filled_black" shape="pill" text="continue_with" locale="fr" useOneTap={false}
            />
          </div>

          <p className="text-center text-[11px] text-white/30">Inscription instantanée, sans email de vérification</p>
        </div>
      </div>
    </div>
  );
}

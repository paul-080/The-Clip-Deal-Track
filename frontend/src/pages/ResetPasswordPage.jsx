import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Eye, EyeOff, CheckCircle, XCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // Redirect if no token
  useEffect(() => {
    if (!token) {
      toast.error("Lien invalide");
      navigate("/");
    }
  }, [token, navigate]);

  const handleSubmit = async () => {
    if (password.length < 6) { toast.error("Minimum 6 caractères"); return; }
    if (password !== confirmPassword) { toast.error("Les mots de passe ne correspondent pas"); return; }
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.detail || "Une erreur est survenue");
      } else {
        setDone(true);
      }
    } catch {
      setError("Erreur réseau — réessayez");
    } finally {
      setLoading(false);
    }
  };

  const strength = password.length === 0 ? null : password.length < 6 ? "weak" : password.length < 10 ? "ok" : "strong";

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-white">The <span className="text-[#f0c040]">Clip</span> Deal</span>
        </div>

        <div className="bg-[#121212] border border-white/10 rounded-2xl p-8">
          {done ? (
            /* ── Succès ── */
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-[#39FF14]/10 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-[#39FF14]" />
              </div>
              <div>
                <p className="text-white text-lg font-semibold">Mot de passe mis à jour !</p>
                <p className="text-white/40 text-sm mt-1">Tu peux maintenant te connecter avec ton nouveau mot de passe.</p>
              </div>
              <button
                onClick={() => navigate("/")}
                className="w-full py-3 rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-colors"
              >
                Se connecter
              </button>
            </div>
          ) : (
            /* ── Formulaire ── */
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-[#f0c040]/10 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-[#f0c040]" />
                </div>
                <div>
                  <p className="text-white font-semibold">Nouveau mot de passe</p>
                  <p className="text-white/40 text-xs">Choisissez un mot de passe sécurisé</p>
                </div>
              </div>

              {/* Erreur globale */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Mot de passe */}
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    placeholder="Minimum 6 caractères"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 pr-10 outline-none focus:border-white/25 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Barre de force */}
                {strength && (
                  <div className="flex gap-1 mt-1.5">
                    <div className={`h-1 flex-1 rounded-full transition-colors ${strength === "weak" ? "bg-red-500" : "bg-[#39FF14]"}`} />
                    <div className={`h-1 flex-1 rounded-full transition-colors ${strength === "ok" || strength === "strong" ? "bg-[#39FF14]" : "bg-white/10"}`} />
                    <div className={`h-1 flex-1 rounded-full transition-colors ${strength === "strong" ? "bg-[#39FF14]" : "bg-white/10"}`} />
                  </div>
                )}
              </div>

              {/* Confirmation */}
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Confirmer le mot de passe</label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    placeholder="Répétez le mot de passe"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-white placeholder:text-white/20 pr-10 outline-none transition-colors ${
                      confirmPassword && password !== confirmPassword
                        ? "border-red-500/50 focus:border-red-500/70"
                        : "border-white/10 focus:border-white/25"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-red-400 text-xs mt-1">Les mots de passe ne correspondent pas</p>
                )}
              </div>

              {/* Bouton */}
              <button
                onClick={handleSubmit}
                disabled={loading || password.length < 6 || password !== confirmPassword}
                className="w-full py-3 rounded-xl bg-[#f0c040] text-black font-semibold hover:bg-[#f0c040]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Mise à jour..." : "Mettre à jour le mot de passe"}
              </button>

              {/* Retour */}
              <button
                onClick={() => navigate("/")}
                className="w-full flex items-center justify-center gap-2 text-sm text-white/30 hover:text-white/60 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Retour à la connexion
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

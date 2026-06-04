import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../App";
import { toast } from "sonner";
import { Lock, Check, CreditCard, LogOut } from "lucide-react";
import { Button } from "../components/ui/button";

const PLANS = [
  {
    id: "plan_small",
    name: "Starter",
    price: "149€",
    color: "white/10",
    features: [
      "1 campagne active",
      "30 comptes trackés",
      "Tracking vues 1×/jour à 23h30 Paris",
      "Striking automatique",
      "Support standard",
    ],
  },
  {
    id: "plan_medium",
    name: "Pro",
    price: "349€",
    color: "#39FF14",
    featured: false,
    features: [
      "3 campagnes actives",
      "100 comptes trackés",
      "Tracking vues 1×/jour à 23h30 Paris",
      "Striking automatique",
      "Support prioritaire",
    ],
  },
  {
    id: "plan_unlimited",
    name: "Business",
    price: "449€",
    color: "#FF007F",
    featured: true,
    features: [
      "Campagnes illimitées",
      "400 comptes trackés",
      "Tracking vues 3×/jour (08h30, 15h30, 23h30 Paris)",
      "Striking automatique",
      "Support premium 24/7",
      "Accès API",
    ],
  },
];

export default function SubscriptionRequired({ reason = "trial_expired", currentTrialDaysRemaining = 0 }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);

  const handleSubscribe = async (planId) => {
    try {
      setLoading(planId);
      const res = await fetch(`${API}/subscription/checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail || "Erreur lors de la création de l'abonnement");
        setLoading(null);
        return;
      }
      // Backend renvoie : { url, direct?: true, session_id? }
      // - direct=true : mandat déjà signé, subscription créée directement → redirect interne
      // - sinon : GoCardless redirect flow URL (signature mandat SEPA)
      if (data.direct) {
        toast.success("Abonnement activé !");
        window.location.href = data.url;
      } else if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Réponse inattendue du serveur");
        setLoading(null);
      }
    } catch (e) {
      toast.error("Erreur réseau : " + (e?.message || ""));
      setLoading(null);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {}
    navigate("/");
  };

  const headline =
    reason === "trial_expired"
      ? "Votre essai gratuit de 14 jours est terminé"
      : reason === "no_subscription"
      ? "Aucun abonnement actif"
      : "Souscrivez à un abonnement pour continuer";

  const subline =
    reason === "trial_expired"
      ? "Pour continuer à utiliser The Clip Deal Track, choisissez un abonnement ci-dessous."
      : "Choisissez le plan adapté à votre activité pour débloquer toutes les fonctionnalités.";

  return (
    <div className="min-h-screen bg-[#0E0D0B] text-[#F5F4F1] p-6 md:p-10 relative">
      <div className="bg-warm-radial absolute inset-0 pointer-events-none" />
      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-12 pb-4 border-b border-warm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#FF007F]/10 border border-[#FF007F]/30 flex items-center justify-center">
              <Lock className="w-4.5 h-4.5 text-[#FF007F]" />
            </div>
            <span className="text-base font-display font-semibold tracking-tight">The Clip Deal Track</span>
          </div>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="text-[#F5F4F1]/55 hover:text-[#F5F4F1] hover:bg-[#1C1A17] rounded-lg"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Se déconnecter
          </Button>
        </div>

        {/* Headline */}
        <div className="text-center mb-12 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-[#1C1A17]/80 border border-red-500/30 rounded-full px-3.5 py-1.5 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 text-[11px] font-semibold uppercase tracking-widest">Compte bloqué</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-semibold mb-3 tracking-tight leading-tight">{headline}</h1>
          <p className="text-[#F5F4F1]/60 text-base leading-relaxed">{subline}</p>
          {reason === "trial_expired" && currentTrialDaysRemaining <= 0 && (
            <p className="text-[#F5F4F1]/40 text-sm mt-2">
              Vos données sont conservées. Une fois abonné, vous retrouvez l'accès complet.
            </p>
          )}
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl p-6 border space-y-5 flex flex-col transition-all duration-200 ${
                plan.featured
                  ? "border-[#FF007F]/55 bg-[#1C1A17]/95 relative shadow-[0_0_0_1px_rgba(255,0,127,0.10)]"
                  : "border-warm bg-[#1C1A17]/85 hover:border-[#F5F4F1]/14 hover:-translate-y-0.5"
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FF007F] text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Recommandé
                </div>
              )}
              <div>
                <p className={`text-sm font-medium mb-1.5 tracking-wide ${plan.featured ? "text-[#FF007F]" : "text-[#F5F4F1]/55"}`}>{plan.name}</p>
                <p className="text-4xl font-display font-semibold tabular-nums tracking-tight">
                  {plan.price}
                  <span className="text-base text-[#F5F4F1]/40 font-normal ml-0.5">/mois</span>
                </p>
                <p className="text-[#F5F4F1]/30 text-xs mt-1">HT</p>
              </div>
              <ul className="space-y-2 text-sm text-[#F5F4F1]/70 flex-1">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#39FF14] flex-shrink-0 mt-1" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handleSubscribe(plan.id)}
                disabled={loading === plan.id}
                className={`w-full py-2.5 text-sm font-semibold rounded-lg transition-all ${
                  plan.featured
                    ? "bg-[#FF007F] hover:bg-[#E50073] text-white"
                    : "bg-[#0E0D0B] hover:bg-[#262320] text-[#F5F4F1] border border-warm"
                }`}
              >
                {loading === plan.id ? (
                  <span>Redirection...</span>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Souscrire à {plan.name}
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>

        {/* Contact enterprise */}
        <div className="text-center mt-10 text-sm text-[#F5F4F1]/45">
          Besoin d'un plan sur mesure ?{" "}
          <button
            onClick={() => navigate("/contact-devis")}
            className="text-[#00E5FF] hover:underline"
          >
            Nous contacter
          </button>
        </div>
      </div>
    </div>
  );
}

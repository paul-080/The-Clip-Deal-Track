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
    price: "249€",
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
    price: "549€",
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
    price: "749€",
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
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else if (data.mandate_used) {
        toast.success("Abonnement activé !");
        setTimeout(() => window.location.reload(), 1500);
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
    <div className="min-h-screen bg-[#0A0A0A] text-white p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF007F]/20 border border-[#FF007F]/40 flex items-center justify-center">
              <Lock className="w-5 h-5 text-[#FF007F]" />
            </div>
            <span className="text-lg font-semibold">The Clip Deal Track</span>
          </div>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="text-white/50 hover:text-white hover:bg-white/5"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Se déconnecter
          </Button>
        </div>

        {/* Headline */}
        <div className="text-center mb-12 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-full px-4 py-1.5 mb-5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 text-xs font-medium">Compte bloqué</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">{headline}</h1>
          <p className="text-white/60 text-base">{subline}</p>
          {reason === "trial_expired" && currentTrialDaysRemaining <= 0 && (
            <p className="text-white/40 text-sm mt-2">
              Vos données sont conservées. Une fois abonné, vous retrouvez l'accès complet.
            </p>
          )}
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-6xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl p-6 border space-y-5 flex flex-col ${
                plan.featured
                  ? "border-[#FF007F]/60 bg-[#FF007F]/5 relative"
                  : "border-white/10 bg-white/3"
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FF007F] text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Recommandé
                </div>
              )}
              <div>
                <p className="text-white/50 text-sm font-medium mb-2">{plan.name}</p>
                <p className="text-4xl font-bold">
                  {plan.price}
                  <span className="text-base text-white/40 font-normal">/mois</span>
                </p>
                <p className="text-white/30 text-xs mt-1">HT</p>
              </div>
              <ul className="space-y-2 text-sm text-white/70 flex-1">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#39FF14] flex-shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handleSubscribe(plan.id)}
                disabled={loading === plan.id}
                className={`w-full py-2.5 text-sm font-semibold transition-all ${
                  plan.featured
                    ? "bg-[#FF007F] hover:bg-[#FF007F]/90 text-white"
                    : "bg-white/10 hover:bg-white/20 text-white border border-white/10"
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
        <div className="text-center mt-10 text-sm text-white/40">
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

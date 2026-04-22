import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const TOURS = {
  agency: [
    { icon: "🏠", title: "Vue d'ensemble", desc: "Suivez vos campagnes, vos clippeurs et vos gains en temps réel depuis votre tableau de bord." },
    { icon: "🎬", title: "Créer une campagne", desc: "Lancez une campagne en quelques clics — choisissez le RPM ou le tarif au clic, le budget, les plateformes ciblées et les règles de candidature." },
    { icon: "👥", title: "Gérer les clippeurs", desc: "Vos clippeurs postulent via un lien unique. Acceptez ou refusez leurs candidatures, suivez leurs strikes et retirez-les si besoin." },
    { icon: "📊", title: "Vidéos & Analytics", desc: "Toutes les vidéos trackées automatiquement : vues, likes, commentaires, gains par vidéo et par clippeur. Courbe d'évolution par période." },
    { icon: "💬", title: "Chat de campagne", desc: "Communiquez directement avec vos clippeurs dans chaque campagne. Onglet Questions, Conseils et Paiement intégrés." },
    { icon: "💰", title: "Paiement & Portefeuille", desc: "Visualisez ce que vous devez à chaque clippeur (vues × RPM). Marquez comme payé une fois le virement effectué — aucune transaction ne passe par le site." },
    { icon: "⚙️", title: "Paramètres & Abonnement", desc: "Gérez votre profil, votre abonnement (Starter 150€ ou Full 350€) et vos préférences de strikes automatiques." },
  ],
  clipper: [
    { icon: "👤", title: "Mes comptes sociaux", desc: "Ajoutez vos comptes TikTok, Instagram ou YouTube. Ils seront vérifiés et trackés automatiquement dès que vous rejoignez une campagne." },
    { icon: "🔍", title: "Découvrir des campagnes", desc: "Parcourez toutes les campagnes disponibles. Filtrez par plateforme, RPM ou agence. Postulez en quelques secondes via le formulaire de candidature." },
    { icon: "📋", title: "Mes campagnes", desc: "Suivez votre statut dans chaque campagne : en attente, actif ou suspendu. Accédez aux détails et au chat de chaque campagne rejointe." },
    { icon: "🎥", title: "Mes vidéos trackées", desc: "Toutes vos vidéos détectées automatiquement : vues en temps réel, likes, commentaires et gains générés au RPM de la campagne." },
    { icon: "💬", title: "Messages", desc: "Restez en contact avec l'agence ou le manager de chaque campagne. Chat intégré avec onglet Paiement pour voir ce qui vous est dû." },
    { icon: "💰", title: "Mes paiements", desc: "Consultez vos gains par campagne et renseignez vos coordonnées de paiement (IBAN ou PayPal) pour que l'agence puisse vous virer." },
  ],
  manager: [
    { icon: "🏠", title: "Dashboard manager", desc: "Supervise les campagnes qui vous sont confiées par l'agence. Vue globale des clippeurs actifs, des vues et des gains." },
    { icon: "📋", title: "Gérer les campagnes", desc: "Acceptez ou refusez les candidatures de clippeurs, suivez leurs stats et gérez les strikes au nom de l'agence." },
    { icon: "📊", title: "Analytics", desc: "Vues, gains et performances par clippeur et par vidéo sur toutes vos campagnes gérées." },
    { icon: "💬", title: "Chat de campagne", desc: "Communiquez avec les clippeurs de chaque campagne. Onglet Paiement pour suivre les montants dus." },
  ],
  client: [
    { icon: "🏠", title: "Vue d'ensemble", desc: "Suivez les performances globales de vos campagnes : vues totales, clippeurs actifs et vidéos publiées en temps réel." },
    { icon: "🎬", title: "Mes campagnes", desc: "Accédez aux détails de chaque campagne — vidéos trackées, clippeurs actifs, analytics par plateforme." },
    { icon: "💬", title: "Messages", desc: "Échangez directement avec l'agence qui gère vos campagnes. Toutes les communications centralisées." },
  ],
};

export default function OnboardingTour({ role }) {
  const steps = TOURS[role] || [];
  const storageKey = `tour_seen_${role}`;
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(storageKey)) {
      // Small delay so the dashboard loads first
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [storageKey]);

  const dismiss = () => {
    localStorage.setItem(storageKey, "1");
    setVisible(false);
  };

  if (!visible || steps.length === 0) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="bg-[#141414] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <p className="text-white/40 text-xs font-medium uppercase tracking-wider">Bienvenue 👋</p>
              <button onClick={dismiss} className="text-white/30 hover:text-white/70 text-xl leading-none transition-colors">✕</button>
            </div>

            {/* Step content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-[#FF007F]/10 border border-[#FF007F]/20 flex items-center justify-center text-2xl flex-shrink-0">
                    {current.icon}
                  </div>
                  <div>
                    <p className="text-white font-semibold text-base mb-1">{current.title}</p>
                    <p className="text-white/50 text-sm leading-relaxed">{current.desc}</p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Step dots */}
            <div className="flex items-center justify-center gap-1.5 mb-5">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={`rounded-full transition-all ${i === step ? "w-4 h-1.5 bg-[#FF007F]" : "w-1.5 h-1.5 bg-white/20 hover:bg-white/40"}`}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-3">
              <button onClick={dismiss} className="text-white/30 hover:text-white/60 text-sm transition-colors">
                Passer le tour
              </button>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    onClick={() => setStep(s => s - 1)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-sm transition-colors"
                  >← Précédent</button>
                )}
                <button
                  onClick={() => isLast ? dismiss() : setStep(s => s + 1)}
                  className="px-4 py-1.5 rounded-lg bg-[#FF007F] hover:bg-[#FF007F]/80 text-white text-sm font-semibold transition-colors"
                >
                  {isLast ? "C'est parti 🚀" : "Suivant →"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

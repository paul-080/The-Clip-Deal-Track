import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, ChevronRight, Building2, Video, Users, User,
  TrendingUp, DollarSign, Shield, MessageCircle, BarChart3,
  MousePointerClick, Eye, Trophy, AlertTriangle, Clock, Settings,
  CheckCircle2, Zap, Search, Link2, CreditCard,
} from "lucide-react";
import { Button } from "../components/ui/button";

const ROLE_COLORS = {
  agency: "#FF007F",
  clipper: "#00E5FF",
  manager: "#39FF14",
  client: "#FFB300",
};

const Section = ({ children, className = "" }) => (
  <section className={`max-w-6xl mx-auto px-6 lg:px-8 py-14 ${className}`}>
    {children}
  </section>
);

const Card = ({ icon: Icon, color, title, desc, list }) => (
  <div
    className="bg-[#1C1A17]/85 border rounded-xl p-5 hover:-translate-y-0.5 transition-all duration-200"
    style={{ borderColor: `${color}28` }}
  >
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center mb-3.5 border"
      style={{ background: `${color}12`, borderColor: `${color}30`, color }}
    >
      <Icon className="w-5 h-5" />
    </div>
    <h3 className="font-display font-semibold text-[#F5F4F1] text-[15px] mb-1.5 tracking-tight">{title}</h3>
    {desc && <p className="text-[#F5F4F1]/55 text-sm mb-3 leading-relaxed">{desc}</p>}
    {list && (
      <ul className="space-y-1.5">
        {list.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[#F5F4F1]/70 text-sm leading-snug">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const RoleHeader = ({ icon: Icon, color, role, tagline }) => (
  <div className="flex items-center gap-4 mb-7">
    <div
      className="w-14 h-14 rounded-xl flex items-center justify-center"
      style={{ background: `${color}14`, border: `1px solid ${color}40` }}
    >
      <Icon className="w-7 h-7" style={{ color }} />
    </div>
    <div>
      <h2 className="text-2xl lg:text-3xl font-display font-semibold text-[#F5F4F1] tracking-tight">{role}</h2>
      <p className="text-[#F5F4F1]/55 text-sm mt-0.5">{tagline}</p>
    </div>
  </div>
);

const StepCard = ({ num, title, desc }) => (
  <div className="flex gap-4">
    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#00E5FF]/10 border border-[#00E5FF]/30 flex items-center justify-center font-display font-semibold text-sm text-[#00E5FF] tabular-nums">
      {num}
    </div>
    <div>
      <h4 className="text-[#F5F4F1] font-display font-semibold mb-1 text-[15px]">{title}</h4>
      <p className="text-[#F5F4F1]/55 text-sm leading-relaxed">{desc}</p>
    </div>
  </div>
);

export default function Features() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0E0D0B] text-[#F5F4F1] relative">
      {/* Background warm radial */}
      <div className="bg-warm-radial absolute inset-0 pointer-events-none" />
      <div className="noise-bg absolute inset-0 pointer-events-none" />

      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0E0D0B]/85 backdrop-blur-md border-b border-warm">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <Button
            onClick={() => navigate("/")}
            variant="ghost"
            className="text-[#F5F4F1]/65 hover:text-[#F5F4F1] hover:bg-[#1C1A17] rounded-lg"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <Button
            onClick={() => navigate("/")}
            className="bg-[#F5F4F1] hover:bg-white text-[#0E0D0B] rounded-lg px-4 py-2 font-semibold text-sm shadow-sm"
          >
            Commencer 14j gratuits
          </Button>
        </div>
      </div>

      {/* Hero */}
      <Section className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="text-center max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 bg-[#1C1A17]/60 border border-[#FF007F]/30 rounded-full px-3.5 py-1.5 mb-6 backdrop-blur-sm">
            <Zap className="w-3 h-3 text-[#FF007F]" />
            <span className="text-[#FF007F] text-[11px] font-semibold uppercase tracking-widest">
              Toutes les fonctionnalités
            </span>
          </div>
          <h1 className="text-[clamp(2.25rem,5vw,4rem)] font-display font-semibold mb-6 leading-[1.05] tracking-[-0.03em]">
            Le clipping,<br />
            <span className="bg-gradient-to-r from-[#FF007F] via-[#F5F4F1] to-[#00E5FF] bg-clip-text text-transparent">
              automatisé de bout en bout
            </span>
          </h1>
          <p className="text-[#F5F4F1]/60 text-base lg:text-lg leading-relaxed">
            4 rôles, 1 plateforme. Tracking auto TikTok / Instagram / YouTube,
            paiements aux clippeurs en 1 clic, anti-fraude intégré, chat temps réel.
          </p>
        </motion.div>
      </Section>

      {/* Fonctionnalités phares */}
      <Section className="relative z-10">
        <h2 className="text-2xl md:text-3xl font-display font-semibold mb-2 text-center tracking-tight">
          Les 6 fonctionnalités phares
        </h2>
        <p className="text-[#F5F4F1]/55 text-center mb-10 text-sm">Ce qui nous différencie</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card
            icon={Eye}
            color="#00E5FF"
            title="Tracking vues automatique"
            desc="Vues récupérées directement depuis TikTok, Instagram et YouTube. Pas d'estimation."
            list={[
              "Starter & Pro : 1× / jour (23h30 Paris)",
              "Business : 3× / jour (08h30, 15h30, 23h30)",
              "Seules les vidéos publiées après assignation comptent",
            ]}
          />
          <Card
            icon={MousePointerClick}
            color="#FF007F"
            title="Tracking clics"
            desc="Lien tracké unique par clippeur. Paiement au clic possible."
            list={[
              "Anti-fraude bots (50+ signatures)",
              "Rate-limit IP (10 clics/min max)",
              "Détection burst CIDR /24",
              "3 modes : tous / unique 24h / unique lifetime",
            ]}
          />
          <Card
            icon={Shield}
            color="#FFB300"
            title="Strikes automatiques"
            desc="Inactivité détectée, sanction appliquée sans intervention."
            list={[
              "Configurable : nb strikes + jours d'inactivité",
              "3 strikes = exclu (par défaut)",
              "Notification WebSocket en temps réel",
              "L'agence valide l'exclusion finale",
            ]}
          />
          <Card
            icon={MessageCircle}
            color="#39FF14"
            title="Chat intégré"
            desc="Communication centralisée. Plus de DMs perdus."
            list={[
              "1 chat par campagne (général + privé)",
              "Onglets : Questions, Conseils, Paiement",
              "Réactions emoji, mentions",
              "WebSocket temps réel",
            ]}
          />
          <Card
            icon={DollarSign}
            color="#f0c040"
            title="Paiement aux clippeurs"
            desc="Calcul auto, virement direct hors plateforme."
            list={[
              "RPM × vues = montant calculé auto",
              "1 clic pour valider un paiement",
              "Suivi 'dû / payé' par clippeur",
              "IBAN/PayPal masqué (blur)",
            ]}
          />
          <Card
            icon={BarChart3}
            color="#00E5FF"
            title="Statistiques + Clip Winner"
            desc="Courbes journalières, top clips, ranking clippeurs."
            list={[
              "Courbe vues quotidiennes (snapshots immutables)",
              "Top 10 clips de la campagne",
              "Stats par clippeur, par vidéo",
              "Période : 24h / 7j / 30j / tout",
            ]}
          />
        </div>
      </Section>

      {/* Les 4 rôles — détaillés */}
      <Section className="relative z-10">
        <h2 className="text-2xl md:text-3xl font-display font-semibold mb-2 text-center tracking-tight">
          Les 4 rôles
        </h2>
        <p className="text-[#F5F4F1]/55 text-center mb-10 text-sm">
          Chaque utilisateur a son propre dashboard
        </p>

        {/* AGENCE */}
        <div className="mb-10 bg-[#1C1A17]/85 border border-[#FF007F]/25 rounded-2xl p-6 md:p-8">
          <RoleHeader
            icon={Building2}
            color={ROLE_COLORS.agency}
            role="Agence"
            tagline="Pilote toutes les campagnes — payante (149€ / 349€ / 449€)"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              icon={Settings}
              color={ROLE_COLORS.agency}
              title="Créer & configurer"
              list={[
                "Modèle au RPM (€/1 000 vues) ou au clic",
                "Budget total (ou illimité)",
                "Plateformes : TikTok, Insta, YouTube",
                "Strikes auto configurables",
                "URL destination + tarif au clic",
              ]}
            />
            <Card
              icon={Users}
              color={ROLE_COLORS.agency}
              title="Gérer les clippeurs"
              list={[
                "Approuver / refuser les candidatures",
                "Ajouter des comptes pour un clippeur",
                "Réassigner un compte d'un clippeur à un autre",
                "Strike manuel ou auto",
                "Exclure (avec validation)",
              ]}
            />
            <Card
              icon={DollarSign}
              color={ROLE_COLORS.agency}
              title="Valider les paiements"
              list={[
                "Liste auto de ce qui est dû à chaque clippeur",
                "IBAN/PayPal du clippeur (masqué)",
                "Bouton 'Virement effectué' = 1 clic",
                "Historique des paiements",
              ]}
            />
            <Card
              icon={TrendingUp}
              color={ROLE_COLORS.agency}
              title="Suivre les performances"
              list={[
                "Vue d'ensemble : total vues, likes, comments",
                "Courbe quotidienne (snapshots immutables)",
                "Top clips, ranking clippeurs",
                "Onglet Scraping : détail par compte",
              ]}
            />
          </div>
        </div>

        {/* CLIPPER */}
        <div className="mb-10 bg-[#1C1A17]/85 border border-[#00E5FF]/25 rounded-2xl p-6 md:p-8">
          <RoleHeader
            icon={Video}
            color={ROLE_COLORS.clipper}
            role="Clippeur"
            tagline="100% gratuit — gagne des sous en clippant"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              icon={Search}
              color={ROLE_COLORS.clipper}
              title="Découvrir les campagnes"
              list={[
                "Feed des campagnes ouvertes (filtré par plateforme)",
                "Voir RPM, budget restant, règles",
                "Candidater en 1 clic",
                "Statut de candidature : en attente / accepté",
              ]}
            />
            <Card
              icon={Link2}
              color={ROLE_COLORS.clipper}
              title="Ajouter ses comptes sociaux"
              list={[
                "TikTok / Instagram / YouTube",
                "Vérification automatique (compte existe ?)",
                "1 compte = 1 seule campagne à la fois",
                "Seules les vidéos après ajout comptent",
              ]}
            />
            <Card
              icon={Eye}
              color={ROLE_COLORS.clipper}
              title="Suivre ses vues & gains"
              list={[
                "Vues récupérées auto via API officielle",
                "Gains calculés en temps réel (€)",
                "Courbe perso quotidienne",
                "Top clips personnels",
              ]}
            />
            <Card
              icon={CreditCard}
              color={ROLE_COLORS.clipper}
              title="Demander son paiement"
              list={[
                "Renseigner IBAN ou PayPal une fois",
                "Bouton '💰 Percevoir' quand le compteur > 0€",
                "Réclamation envoyée auto à l'agence",
                "Historique des paiements reçus",
              ]}
            />
          </div>
        </div>

        {/* MANAGER */}
        <div className="mb-10 bg-[#1C1A17]/85 border border-[#39FF14]/25 rounded-2xl p-6 md:p-8">
          <RoleHeader
            icon={User}
            color={ROLE_COLORS.manager}
            role="Manager"
            tagline="100% gratuit — délégué par l'agence (pouvoirs = agence sauf paiements)"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              icon={Users}
              color={ROLE_COLORS.manager}
              title="Gérer plusieurs campagnes"
              list={[
                "Mêmes droits que l'agence sur les campagnes assignées",
                "Approuver / refuser les clippeurs",
                "Ajouter ou retirer des comptes",
                "Mettre en pause / reprendre une campagne",
              ]}
            />
            <Card
              icon={MessageCircle}
              color={ROLE_COLORS.manager}
              title="Chat avec clippeurs & agence"
              list={[
                "Onglet privé agence ↔ manager",
                "Discussion avec chaque clippeur",
                "Conseils + Questions traitées en direct",
              ]}
            />
            <Card
              icon={BarChart3}
              color={ROLE_COLORS.manager}
              title="Voir toutes les stats"
              list={[
                "Identique à la vue agence",
                "Courbes, top clips, classements",
                "Détail scraping par compte",
              ]}
            />
            <Card
              icon={AlertTriangle}
              color={ROLE_COLORS.manager}
              title="Ce qu'il NE peut PAS faire"
              desc="Limite volontaire — sécurité financière"
              list={[
                "Pas valider de paiement (réservé agence)",
                "Pas créer de campagne (réservé agence)",
                "Pas modifier le RPM / budget",
              ]}
            />
          </div>
        </div>

        {/* CLIENT */}
        <div className="bg-[#1C1A17]/85 border border-[#FFB300]/25 rounded-2xl p-6 md:p-8">
          <RoleHeader
            icon={Users}
            color={ROLE_COLORS.client}
            role="Client"
            tagline="100% gratuit — lecture seule (artiste, marque, ayant-droit)"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              icon={Eye}
              color={ROLE_COLORS.client}
              title="Visualiser les résultats"
              list={[
                "Total vues, engagement, croissance",
                "Courbe quotidienne d'évolution",
                "Top clips de la campagne",
                "Évolution par clippeur",
              ]}
            />
            <Card
              icon={Trophy}
              color={ROLE_COLORS.client}
              title="Clip Winner"
              list={[
                "Top 10 clips les plus vus",
                "Périodes : 24h / 7j / 30j / tout",
                "Voir directement le clippeur derrière",
              ]}
            />
            <Card
              icon={Shield}
              color={ROLE_COLORS.client}
              title="Aucune info commerciale"
              desc="Le client ne voit JAMAIS"
              list={[
                "RPM (combien paie l'agence par 1 000 vues)",
                "Budget total / restant",
                "Tarif au clic",
                "Calcul des gains des clippeurs",
              ]}
            />
            <Card
              icon={Clock}
              color={ROLE_COLORS.client}
              title="Accès via lien dédié"
              list={[
                "L'agence génère un lien unique pour le client",
                "Pas besoin d'inscription",
                "Connexion par email + code de vérification",
              ]}
            />
          </div>
        </div>
      </Section>

      {/* Mode d'emploi */}
      <Section className="relative z-10">
        <div className="bg-[#1C1A17]/85 border border-warm rounded-2xl p-7 md:p-10 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-60 bg-[radial-gradient(ellipse_500px_300px_at_0%_0%,rgba(255,0,127,0.06),transparent_60%),radial-gradient(ellipse_500px_300px_at_100%_100%,rgba(0,229,255,0.06),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-2xl md:text-3xl font-display font-semibold mb-2 text-center tracking-tight">
              Mode d'emploi
            </h2>
            <p className="text-[#F5F4F1]/55 text-center mb-10 text-sm">
              De l'inscription au premier paiement, 6 étapes
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <StepCard
              num={1}
              title="Inscription (gratuit)"
              desc="Email + mot de passe ou Google. Tu choisis ton rôle (agence / clippeur / manager / client)."
            />
            <StepCard
              num={2}
              title="Essai 14 jours auto"
              desc="L'agence reçoit automatiquement 14 jours d'accès au plan Business 449€/mois sans carte bancaire."
            />
            <StepCard
              num={3}
              title="Crée ta campagne"
              desc="Nom, plateformes, RPM ou clic, budget. Tu génères un lien à partager aux clippeurs."
            />
            <StepCard
              num={4}
              title="Les clippeurs candidatent"
              desc="Tu valides, ils ajoutent leurs comptes TikTok/Insta/YouTube. Le scraping démarre auto à l'heure dite."
            />
            <StepCard
              num={5}
              title="Tu valides les paiements"
              desc="Le système calcule combien tu dois à chaque clippeur. 1 clic pour confirmer un virement effectué."
            />
            <StepCard
              num={6}
              title="(Bonus) Délégation"
              desc="Tu peux inviter un manager pour gérer, et un client (artiste/marque) en lecture seule."
            />
            </div>
          </div>
        </div>
      </Section>

      {/* Sécurité & fiabilité */}
      <Section className="relative z-10">
        <h2 className="text-2xl md:text-3xl font-display font-semibold mb-2 text-center tracking-tight">
          Sécurité & fiabilité
        </h2>
        <p className="text-[#F5F4F1]/55 text-center mb-10 text-sm">
          Ce qui rend la plateforme robuste
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            icon={Shield}
            color="#FF007F"
            title="Anti-fraude clics"
            list={[
              "Détection bots via User-Agent",
              "Rate-limit IP",
              "Détection burst CIDR /24",
              "Re-calcul earnings sans fraude",
            ]}
          />
          <Card
            icon={CheckCircle2}
            color="#39FF14"
            title="Vérification comptes"
            list={[
              "2-4 sources indépendantes",
              "Marquage 'introuvable' uniquement si 2+ sources confirment 404",
              "Aucune suppression auto en DB",
            ]}
          />
          <Card
            icon={Clock}
            color="#00E5FF"
            title="Snapshots immutables"
            list={[
              "Les vues d'hier ne changent jamais",
              "Pas de plafonnement rétroactif",
              "Convention jour Paris (pas UTC)",
            ]}
          />
        </div>
      </Section>

      {/* Final CTA */}
      <Section className="text-center py-20 relative z-10">
        <h2 className="text-3xl md:text-4xl font-display font-semibold mb-4 tracking-tight">
          Prêt à lancer ta première campagne ?
        </h2>
        <p className="text-[#F5F4F1]/60 text-base lg:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
          14 jours gratuits, sans carte bancaire, sur le plan le plus complet (Business).
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Button
            onClick={() => navigate("/")}
            className="bg-[#F5F4F1] hover:bg-white text-[#0E0D0B] font-semibold rounded-lg px-7 py-6 text-base flex items-center gap-2 shadow-sm"
          >
            Commencer gratuitement
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            onClick={() => navigate("/contact-devis")}
            variant="outline"
            className="bg-transparent border border-warm hover:bg-[#1C1A17] text-[#F5F4F1] rounded-lg px-7 py-6 text-base"
          >
            Nous contacter
          </Button>
        </div>
      </Section>
    </div>
  );
}

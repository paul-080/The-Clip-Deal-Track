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
  <section className={`max-w-6xl mx-auto px-6 lg:px-8 py-12 ${className}`}>
    {children}
  </section>
);

const Card = ({ icon: Icon, color, title, desc, list }) => (
  <div
    className="bg-[#121212] border border-white/10 rounded-2xl p-6 hover:border-white/25 transition-all"
    style={{ borderColor: `${color}33` }}
  >
    <div
      className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
      style={{ background: `${color}20`, color }}
    >
      <Icon className="w-6 h-6" />
    </div>
    <h3 className="font-semibold text-white text-base mb-2">{title}</h3>
    {desc && <p className="text-white/60 text-sm mb-3">{desc}</p>}
    {list && (
      <ul className="space-y-1.5">
        {list.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-white/70 text-sm">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const RoleHeader = ({ icon: Icon, color, role, tagline }) => (
  <div className="flex items-center gap-4 mb-8">
    <div
      className="w-16 h-16 rounded-2xl flex items-center justify-center"
      style={{ background: `${color}20`, border: `1px solid ${color}40` }}
    >
      <Icon className="w-8 h-8" style={{ color }} />
    </div>
    <div>
      <h2 className="text-3xl font-bold text-white">{role}</h2>
      <p className="text-white/50 text-sm">{tagline}</p>
    </div>
  </div>
);

const StepCard = ({ num, title, desc }) => (
  <div className="flex gap-4">
    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#00E5FF]/15 border border-[#00E5FF]/30 flex items-center justify-center font-bold text-[#00E5FF]">
      {num}
    </div>
    <div>
      <h4 className="text-white font-semibold mb-1">{title}</h4>
      <p className="text-white/60 text-sm">{desc}</p>
    </div>
  </div>
);

export default function Features() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0A0A0A]/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-4 flex items-center justify-between">
          <Button
            onClick={() => navigate("/")}
            variant="ghost"
            className="text-white/60 hover:text-white hover:bg-white/5"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <Button
            onClick={() => navigate("/")}
            className="bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-black rounded-full px-5 font-semibold"
          >
            Commencer 14j gratuits
          </Button>
        </div>
      </div>

      {/* Hero */}
      <Section>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 bg-[#FF007F]/10 border border-[#FF007F]/30 rounded-full px-4 py-1.5 mb-6">
            <Zap className="w-3.5 h-3.5 text-[#FF007F]" />
            <span className="text-[#FF007F] text-xs font-semibold uppercase tracking-wider">
              Toutes les fonctionnalités
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            Le clipping,<br />
            <span className="bg-gradient-to-r from-[#FF007F] to-[#00E5FF] bg-clip-text text-transparent">
              automatisé de bout en bout
            </span>
          </h1>
          <p className="text-white/60 text-lg leading-relaxed">
            4 rôles, 1 plateforme. Tracking auto TikTok / Instagram / YouTube,
            paiements aux clippeurs en 1 clic, anti-fraude intégré, chat temps réel.
          </p>
        </motion.div>
      </Section>

      {/* Fonctionnalités phares */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold mb-2 text-center">
          Les 6 fonctionnalités phares
        </h2>
        <p className="text-white/50 text-center mb-10">Ce qui nous différencie</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold mb-2 text-center">
          Les 4 rôles
        </h2>
        <p className="text-white/50 text-center mb-10">
          Chaque utilisateur a son propre dashboard
        </p>

        {/* AGENCE */}
        <div className="mb-12 bg-[#121212] border border-[#FF007F]/30 rounded-3xl p-6 md:p-8">
          <RoleHeader
            icon={Building2}
            color={ROLE_COLORS.agency}
            role="Agence"
            tagline="Pilote toutes les campagnes — payante (249€ / 549€ / 749€)"
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
        <div className="mb-12 bg-[#121212] border border-[#00E5FF]/30 rounded-3xl p-6 md:p-8">
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
        <div className="mb-12 bg-[#121212] border border-[#39FF14]/30 rounded-3xl p-6 md:p-8">
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
        <div className="bg-[#121212] border border-[#FFB300]/30 rounded-3xl p-6 md:p-8">
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
      <Section>
        <div className="bg-gradient-to-br from-[#FF007F]/5 to-[#00E5FF]/5 border border-white/10 rounded-3xl p-6 md:p-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-2 text-center">
            Mode d'emploi
          </h2>
          <p className="text-white/50 text-center mb-10">
            De l'inscription au premier paiement, 5 étapes
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
              desc="L'agence reçoit automatiquement 14 jours d'accès au plan Business 749€/mois sans carte bancaire."
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
      </Section>

      {/* Sécurité & fiabilité */}
      <Section>
        <h2 className="text-2xl md:text-3xl font-bold mb-2 text-center">
          Sécurité & fiabilité
        </h2>
        <p className="text-white/50 text-center mb-10">
          Ce qui rend la plateforme robuste
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
      <Section className="text-center py-20">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          Prêt à lancer ta première campagne ?
        </h2>
        <p className="text-white/60 text-lg mb-8 max-w-xl mx-auto">
          14 jours gratuits, sans carte bancaire, sur le plan le plus complet (Business).
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button
            onClick={() => navigate("/")}
            className="bg-[#00E5FF] hover:bg-[#00d4eb] text-black font-bold rounded-full px-8 py-6 text-lg flex items-center gap-2"
          >
            Commencer gratuitement
            <ChevronRight className="w-5 h-5" />
          </Button>
          <Button
            onClick={() => navigate("/contact-devis")}
            variant="outline"
            className="bg-transparent border-white/20 hover:bg-white/5 text-white rounded-full px-8 py-6 text-lg"
          >
            Nous contacter
          </Button>
        </div>
      </Section>
    </div>
  );
}

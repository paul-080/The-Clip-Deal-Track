import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, FileText, Users, CreditCard, AlertTriangle, Lock, Globe } from "lucide-react";

const Section = ({ icon: Icon, title, children }) => (
  <div className="mb-10">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-[#f0c040]/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-[#f0c040]" />
      </div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
    </div>
    <div className="text-white/70 text-sm leading-relaxed space-y-3 pl-11">{children}</div>
  </div>
);

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#0d0d0d]/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#f0c040]" />
            <span className="text-white font-medium text-sm">Conditions Générales d'Utilisation</span>
          </div>
          <span className="ml-auto text-white/30 text-xs">Dernière mise à jour : avril 2025</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Intro */}
        <div className="mb-10 p-6 rounded-2xl border border-[#f0c040]/20 bg-[#f0c040]/5">
          <p className="text-white/80 text-sm leading-relaxed">
            Les présentes Conditions Générales d'Utilisation (« CGU ») régissent l'accès et l'utilisation de la plateforme <strong className="text-white">The Clip Deal</strong> (accessible à l'adresse <strong className="text-white">theclipdealtrack.com</strong>), éditée et exploitée par <strong className="text-white">The Clip Deal SAS</strong>. En vous inscrivant, vous déclarez avoir lu, compris et accepté l'intégralité des présentes CGU. Si vous n'acceptez pas ces conditions, vous ne devez pas utiliser la plateforme.
          </p>
        </div>

        <Section icon={Globe} title="Article 1 — Objet et définitions">
          <p><strong className="text-white">The Clip Deal</strong> est une plateforme SaaS de mise en relation entre :</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li><strong className="text-white/90">Agences</strong> : entités créant et gérant des campagnes de clipping vidéo.</li>
            <li><strong className="text-white/90">Clippers</strong> : créateurs de contenu indépendants publiant des vidéos courtes sur les réseaux sociaux.</li>
            <li><strong className="text-white/90">Managers</strong> : intermédiaires gérant les relations entre agences et clippers.</li>
            <li><strong className="text-white/90">Clients</strong> : commanditaires finaux des campagnes.</li>
          </ul>
          <p className="mt-3">La plateforme est un <strong className="text-white/90">outil de mise en relation et de suivi de performance</strong>. The Clip Deal n'est pas partie aux contrats conclus entre agences et clippers, et n'est pas responsable des contenus publiés par ces derniers.</p>
        </Section>

        <Section icon={Users} title="Article 2 — Inscription et compte utilisateur">
          <p>L'inscription est ouverte à toute personne physique majeure (18 ans ou plus) ou morale. En créant un compte, vous certifiez que :</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>Les informations fournies sont exactes et à jour.</li>
            <li>Vous avez la capacité juridique de conclure un contrat.</li>
            <li>Vous êtes autorisé à utiliser l'adresse e-mail fournie.</li>
          </ul>
          <p className="mt-3">Vous êtes seul responsable de la confidentialité de vos identifiants. Tout accès à votre compte avec vos identifiants est réputé effectué par vous. En cas de suspicion d'utilisation non autorisée, vous devez nous contacter immédiatement.</p>
          <p className="mt-3">The Clip Deal se réserve le droit de suspendre ou supprimer tout compte sans préavis en cas de violation des présentes CGU.</p>
        </Section>

        <Section icon={FileText} title="Article 3 — Conditions d'utilisation de la plateforme">
          <p>Vous vous engagez à utiliser la plateforme conformément aux présentes CGU et à la législation applicable. Sont strictement interdits :</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>Toute tentative de fraude, manipulation de vues ou de statistiques.</li>
            <li>La création de faux comptes ou l'usurpation d'identité.</li>
            <li>La publication de contenus illicites, diffamatoires, haineux ou contraires aux conditions d'utilisation des plateformes tierces (TikTok, Instagram, YouTube).</li>
            <li>L'utilisation de bots, scripts ou tout moyen automatisé pour gonfler artificiellement les métriques.</li>
            <li>Le contournement des systèmes de sécurité de la plateforme.</li>
            <li>La revente ou la sous-licence des accès à des tiers.</li>
          </ul>
          <p className="mt-3">Tout manquement entraîne la suspension immédiate du compte et peut donner lieu à des poursuites judiciaires.</p>
        </Section>

        <Section icon={CreditCard} title="Article 4 — Rémunération et paiements">
          <p><strong className="text-white/90">Principes de rémunération des clippers</strong></p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>La rémunération est calculée sur la base des vues générées sur les vidéos publiées <strong className="text-white/90">après la date d'inscription à la campagne</strong>. Les vidéos publiées avant l'adhésion ne sont pas comptabilisées, sauf dérogation expresse accordée par l'agence.</li>
            <li>Le taux de rémunération (RPM) est fixé par l'agence lors de la création de la campagne et exprimé en euros pour 1 000 vues.</li>
            <li>Les statistiques de vues sont collectées automatiquement depuis les plateformes tierces. The Clip Deal ne garantit pas l'exactitude des données issues de TikTok, Instagram ou YouTube.</li>
          </ul>
          <p className="mt-3"><strong className="text-white/90">Modalités de paiement</strong></p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>Les paiements sont effectués directement par les agences aux clippers, hors de la plateforme (virement bancaire, PayPal, etc.).</li>
            <li>The Clip Deal ne détient pas les fonds des agences ni des clippers et n'est pas responsable des défauts de paiement.</li>
            <li>Le montant minimal de demande de virement est de <strong className="text-white/90">50 EUR</strong>.</li>
            <li>L'agence peut marquer un paiement comme « confirmé » sur la plateforme à titre de justificatif, sans que cela ne constitue une preuve de virement effectif.</li>
          </ul>
          <p className="mt-3"><strong className="text-white/90">Abonnements agence</strong></p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>L'accès aux fonctionnalités avancées est soumis à un abonnement mensuel payant dont les tarifs sont affichés sur la page Tarifs.</li>
            <li>Les abonnements sont sans engagement et résiliables à tout moment, avec prise d'effet à la fin de la période en cours.</li>
            <li>Aucun remboursement n'est accordé pour les périodes entamées.</li>
          </ul>
        </Section>

        <Section icon={AlertTriangle} title="Article 5 — Système de strikes et suspensions">
          <p>Pour maintenir la qualité des campagnes, un système de <strong className="text-white/90">strikes automatiques</strong> est en place :</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>Un strike est attribué automatiquement lorsqu'un clipper ne respecte pas le nombre minimal de publications par jour fixé par l'agence.</li>
            <li>À l'atteinte du nombre de strikes défini par l'agence, le clipper est automatiquement suspendu de la campagne.</li>
            <li>Les strikes peuvent également être attribués manuellement par l'agence ou le manager.</li>
            <li>Un clipper suspendu perd l'accès à la campagne mais conserve ses gains calculés jusqu'à la date de suspension.</li>
          </ul>
          <p className="mt-3">The Clip Deal ne peut être tenu responsable des décisions de suspension prises par les agences dans le cadre de leurs campagnes.</p>
        </Section>

        <Section icon={Lock} title="Article 6 — Protection des données personnelles (RGPD)">
          <p>Conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés, vous disposez des droits suivants sur vos données personnelles :</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li><strong className="text-white/90">Droit d'accès</strong> : obtenir la confirmation que vos données sont traitées et en obtenir une copie.</li>
            <li><strong className="text-white/90">Droit de rectification</strong> : corriger vos données inexactes ou incomplètes.</li>
            <li><strong className="text-white/90">Droit à l'effacement</strong> (« droit à l'oubli ») : demander la suppression de vos données.</li>
            <li><strong className="text-white/90">Droit à la portabilité</strong> : recevoir vos données dans un format structuré.</li>
            <li><strong className="text-white/90">Droit d'opposition</strong> : vous opposer au traitement de vos données à des fins de prospection.</li>
          </ul>
          <p className="mt-3"><strong className="text-white/90">Données collectées</strong> : adresse e-mail, nom, photo de profil, handles de réseaux sociaux, statistiques de performance, informations de paiement (IBAN ou PayPal, stockés en clair — ne partagez pas d'informations sensibles).</p>
          <p className="mt-3"><strong className="text-white/90">Durée de conservation</strong> : vos données sont conservées pendant la durée de votre compte et 3 ans après sa suppression.</p>
          <p className="mt-3"><strong className="text-white/90">Hébergement</strong> : les données sont hébergées sur Railway (États-Unis) et MongoDB Atlas (Union Européenne). Des garanties contractuelles (clauses contractuelles types) encadrent les transferts hors UE.</p>
          <p className="mt-3">Pour exercer vos droits : <strong className="text-white/90">privacy@theclipdealtrack.com</strong></p>
        </Section>

        <Section icon={Shield} title="Article 7 — Propriété intellectuelle">
          <p>L'ensemble des éléments composant la plateforme (logo, design, code source, textes, algorithmes) est protégé par le droit de la propriété intellectuelle et est la propriété exclusive de The Clip Deal SAS.</p>
          <p className="mt-3">En publiant du contenu sur la plateforme, vous accordez à The Clip Deal une licence non exclusive, mondiale et gratuite pour afficher, reproduire et diffuser ce contenu dans le cadre du service (ex : aperçu de campagne, statistiques, rapports agence).</p>
          <p className="mt-3">Vous déclarez être titulaire de tous les droits sur les contenus que vous publiez et garantissez The Clip Deal contre toute réclamation de tiers.</p>
        </Section>

        <Section icon={AlertTriangle} title="Article 8 — Limitation de responsabilité">
          <p>The Clip Deal est un outil de mise en relation. À ce titre :</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>The Clip Deal n'est pas responsable des contenus publiés par les clippers sur les réseaux sociaux.</li>
            <li>The Clip Deal n'est pas responsable des défauts ou retards de paiement entre agences et clippers.</li>
            <li>The Clip Deal n'est pas responsable des interruptions de service des plateformes tierces (TikTok, Instagram, YouTube) affectant la collecte des statistiques.</li>
            <li>La responsabilité de The Clip Deal est limitée au montant des abonnements versés au cours des 3 derniers mois.</li>
          </ul>
          <p className="mt-3">The Clip Deal met tout en œuvre pour assurer la disponibilité de la plateforme mais ne garantit pas un accès ininterrompu.</p>
        </Section>

        <Section icon={FileText} title="Article 9 — Résiliation">
          <p><strong className="text-white/90">Par l'utilisateur</strong> : vous pouvez supprimer votre compte à tout moment depuis les paramètres de votre tableau de bord. La suppression entraîne la perte définitive de vos données.</p>
          <p className="mt-3"><strong className="text-white/90">Par The Clip Deal</strong> : nous pouvons résilier votre accès sans préavis en cas de violation des présentes CGU, d'activité frauduleuse, ou pour tout motif légitime. En cas de résiliation pour manquement, aucun remboursement n'est dû.</p>
        </Section>

        <Section icon={Globe} title="Article 10 — Droit applicable et litiges">
          <p>Les présentes CGU sont régies par le droit français. En cas de litige, les parties s'engagent à rechercher une solution amiable. À défaut, les tribunaux compétents du ressort du siège social de The Clip Deal SAS seront seuls compétents.</p>
          <p className="mt-3">Pour toute question : <strong className="text-white/90">legal@theclipdealtrack.com</strong></p>
        </Section>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-white/10 text-center">
          <p className="text-white/30 text-xs">The Clip Deal SAS — Version des CGU du 1er avril 2025</p>
          <p className="text-white/20 text-xs mt-1">En cas de modification des CGU, vous serez notifié par e-mail 30 jours avant leur entrée en vigueur.</p>
          <button onClick={() => navigate(-1)} className="mt-6 inline-flex items-center gap-2 text-[#f0c040] text-sm hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour à l'inscription
          </button>
        </div>
      </div>
    </div>
  );
}

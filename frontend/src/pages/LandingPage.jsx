import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "../App";
import { toast } from "sonner";
import { GoogleLogin } from "@react-oauth/google";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Users, Zap, TrendingUp, ChevronRight, Video, DollarSign, BarChart3, Building2, Eye, X, ArrowLeft, Mail, Lock, LogIn } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [step, setStep] = useState(1); // 1 = role selection, 2 = form

  // Form fields
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    pseudo: "",
    agencyName: "",
  });
  const [profilePicture, setProfilePicture] = useState(null); // base64
  const [cguAccepted, setCguAccepted] = useState(false);

  // Email auth states
  const [authMethod, setAuthMethod] = useState(null); // null | "email"
  const [emailForm, setEmailForm] = useState({ email: "", password: "", confirmPassword: "" });
  const [verificationCode, setVerificationCode] = useState("");
  const [emailPending, setEmailPending] = useState(""); // email awaiting verification
  const [emailLoading, setEmailLoading] = useState(false);

  // Login modal (existing users)
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginLoading, setLoginLoading] = useState(false);

  const roles = [
    {
      id: "clipper",
      title: "Clippeur",
      icon: Video,
      color: "#00E5FF",
      description: "Je crée des clips et je veux être rémunéré selon mes vues",
    },
    {
      id: "agency",
      title: "Agence",
      icon: Building2,
      color: "#FF007F",
      description: "Je gère des campagnes de clipping et des équipes de clippeurs",
    },
    {
      id: "manager",
      title: "Manager",
      icon: Users,
      color: "#39FF14",
      description: "Je supervise des clippeurs et je donne des conseils",
    },
    {
      id: "client",
      title: "Client",
      icon: Eye,
      color: "#FFB300",
      description: "Je suis créateur/influenceur et je veux suivre mes campagnes",
    },
  ];

  const handleGetStarted = () => {
    if (user) {
      if (user.role) {
        navigate(`/${user.role}`);
      } else {
        navigate("/select-role");
      }
    } else {
      setShowRoleModal(true);
      setStep(1);
      setSelectedRole(null);
      setFormData({ firstName: "", lastName: "", pseudo: "", agencyName: "" });
      setProfilePicture(null);
      setAuthMethod(null);
      setEmailForm({ email: "", password: "", confirmPassword: "" });
      setVerificationCode("");
      setEmailPending("");
      setCguAccepted(false);
    }
  };

  const handleRoleSelect = (roleId) => {
    setSelectedRole(roleId);
  };

  const handleNextStep = () => {
    if (selectedRole) {
      setStep(2);
    }
  };

  const handleBackStep = () => {
    setStep(1);
    setCguAccepted(false);
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isFormValid = () => {
    const baseValid = formData.firstName.trim().length > 0 && formData.lastName.trim().length > 0;
    if (selectedRole === "agency") return formData.agencyName.trim().length > 0 && baseValid;
    return baseValid;
  };

  const getDisplayName = () => {
    if (selectedRole === "agency") return formData.agencyName.trim() || `${formData.firstName} ${formData.lastName}`.trim();
    return formData.pseudo.trim() || `${formData.firstName} ${formData.lastName}`.trim();
  };


  const handleGoogleSuccess = async (credentialResponse) => {
    if (!selectedRole || !isFormValid()) {
      toast.error("Veuillez remplir tous les champs d'abord");
      return;
    }
    if (!cguAccepted) {
      toast.error("Veuillez accepter les Conditions Générales d'Utilisation");
      return;
    }
    const displayName = getDisplayName();

    try {
      const r = await fetch(`${API}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id_token: credentialResponse.credential,
          role: selectedRole,
          display_name: displayName,
          first_name: formData.firstName,
          last_name: formData.lastName,
          agency_name: formData.agencyName,
          profile_picture: profilePicture || undefined,
          password: emailForm.password || undefined,
        }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.detail || "Connexion Google échouée");
      }
      const data = await r.json();
      setUser(data.user);
      toast.success(`Bienvenue ${displayName} !`);
      setShowRoleModal(false);
      navigate(`/${selectedRole}`);
    } catch (e) {
      toast.error(e.message || "Erreur de connexion Google");
    }
  };

  const handleEmailRegister = async () => {
    if (!isFormValid() || !cguAccepted) return;
    if (emailForm.password.length < 6) { toast.error("Mot de passe trop court (6 caractères minimum)"); return; }
    if (emailForm.password !== emailForm.confirmPassword) { toast.error("Les mots de passe ne correspondent pas"); return; }
    setEmailLoading(true);
    try {
      const r = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: emailForm.email.trim().toLowerCase(),
          password: emailForm.password,
          role: selectedRole,
          display_name: getDisplayName(),
          first_name: formData.firstName,
          last_name: formData.lastName,
          agency_name: formData.agencyName,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur lors de l'inscription");

      // Backend sends verification email → go to step 3
      const email = emailForm.email.trim().toLowerCase();
      setEmailPending(email);
      setVerificationCode("");
      toast.success(`Code envoyé à ${email} — vérifiez vos mails (et les spams)`);
      setStep(3);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) { toast.error("Entrez le code à 6 chiffres"); return; }
    setEmailLoading(true);
    try {
      const r = await fetch(`${API}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: emailPending, code: verificationCode }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Code invalide");
      setUser(data.user);
      toast.success(`Bienvenue ${data.user.display_name} !`);
      setShowRoleModal(false);
      navigate(`/${data.user.role}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!loginForm.email || !loginForm.password) { toast.error("Remplissez tous les champs"); return; }
    setLoginLoading(true);
    try {
      const r = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: loginForm.email.trim().toLowerCase(), password: loginForm.password }),
      });
      const data = await r.json();
      if (r.status === 403 && data.detail === "email_not_verified") {
        // Redirect to email verification flow
        setShowLoginModal(false);
        setEmailPending(loginForm.email.trim().toLowerCase());
        setEmailForm(f => ({ ...f, email: loginForm.email.trim().toLowerCase(), password: loginForm.password }));
        setVerificationCode("");
        setShowRoleModal(true);
        setStep(3);
        toast.info("Vérifiez votre email — entrez le code reçu");
        return;
      }
      if (!r.ok) throw new Error(data.detail || "Connexion échouée");
      setUser(data.user);
      toast.success(`Bon retour, ${data.user.display_name} !`);
      setShowLoginModal(false);
      navigate(`/${data.user.role}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const selectedRoleData = roles.find(r => r.id === selectedRole);

  return (
    <div className="min-h-screen bg-[#0A0A0A] overflow-hidden relative">
      {/* Background grain texture */}
      <div className="grain absolute inset-0 pointer-events-none" />
      
      {/* Hero Section */}
      <header className="relative">
        {/* Navigation */}
        <nav className="relative z-20 flex items-center justify-between px-6 lg:px-16 py-6">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <img
              src={process.env.PUBLIC_URL + "/logo.svg"}
              alt="The Clip Deal Track"
              className="w-10 h-10 rounded-lg"
            />
            <span className="font-display font-bold text-xl tracking-tight text-white">
              The Clip Deal Track
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            {user ? (
              <Button
                onClick={handleGetStarted}
                data-testid="nav-login-btn"
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-full px-6 py-2 font-medium transition-colors duration-200"
              >
                Dashboard
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => setShowLoginModal(true)}
                  variant="ghost"
                  data-testid="nav-login-btn"
                  className="text-white/70 hover:text-white hover:bg-white/10 rounded-full px-5 py-2 font-medium transition-colors duration-200"
                >
                  Se connecter
                </Button>
                <Button
                  onClick={handleGetStarted}
                  className="bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-black rounded-full px-5 py-2 font-semibold transition-colors duration-200"
                >
                  Créer un compte
                </Button>
              </>
            )}
          </motion.div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 px-6 lg:px-16 pt-16 lg:pt-24 pb-32">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 mb-8"
            >
              <span className="w-2 h-2 rounded-full bg-[#39FF14] animate-pulse" />
              <span className="text-sm text-white/70">En route pour devenir l'app #1 du clipping</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="font-display font-black text-5xl sm:text-6xl lg:text-7xl tracking-tighter text-white mb-6 leading-[1.1]"
            >
              Gérez vos campagnes
              <br />
              <span className="gradient-text">de clipping vidéo</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-lg text-white/60 max-w-xl mb-10 leading-relaxed"
            >
              Connectez agences, clippeurs et créateurs. Rémunération au RPM, 
              suivi en temps réel, gestion des équipes simplifiée.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Button
                onClick={handleGetStarted}
                data-testid="hero-cta-btn"
                className="bg-[#00E5FF] hover:bg-[#00d4eb] text-black font-bold rounded-full px-8 py-6 text-lg transition-colors duration-200 flex items-center gap-2"
              >
                Commencer ici
                <ChevronRight className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                data-testid="hero-learn-more-btn"
                className="bg-transparent border-white/20 hover:bg-white/5 text-white rounded-full px-8 py-6 text-lg transition-colors duration-200"
              >
                En savoir plus
              </Button>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="grid grid-cols-3 gap-8 mt-20 max-w-2xl"
            >
              {[
                { value: "🚀", label: "Lancement en cours" },
                { value: "100%", label: "Tracking automatique" },
                { value: "0€", label: "Commission plateforme" },
              ].map((stat, i) => (
                <div key={i} className="text-left">
                  <div className="font-display font-black text-3xl lg:text-4xl text-white tracking-tight">
                    {stat.value}
                  </div>
                  <div className="text-sm text-white/50 mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Gradient orbs */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#00E5FF]/20 rounded-full blur-[150px] -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#FF007F]/20 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/3" />
      </header>

      {/* Features Section */}
      <section className="relative z-10 px-6 lg:px-16 py-24 bg-[#0A0A0A]">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-display font-bold text-3xl lg:text-4xl text-white tracking-tight mb-4">
              Comment ça fonctionne
            </h2>
            <p className="text-white/50 max-w-lg mx-auto">
              Une plateforme conçue pour simplifier la gestion de vos campagnes de clipping
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Users,
                title: "Agences",
                description: "Créez des campagnes, gérez vos clippeurs et suivez les performances",
                color: "#FF007F",
                gradient: "from-[#FF007F]/20 to-transparent",
              },
              {
                icon: Video,
                title: "Clippeurs",
                description: "Rejoignez des campagnes, postez vos clips et soyez rémunérés",
                color: "#00E5FF",
                gradient: "from-[#00E5FF]/20 to-transparent",
              },
              {
                icon: BarChart3,
                title: "Managers",
                description: "Supervisez les équipes et envoyez des conseils personnalisés",
                color: "#39FF14",
                gradient: "from-[#39FF14]/20 to-transparent",
              },
              {
                icon: TrendingUp,
                title: "Clients",
                description: "Suivez vos campagnes et communiquez avec les agences",
                color: "#FFB300",
                gradient: "from-[#FFB300]/20 to-transparent",
              },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group relative bg-[#121212] border border-white/5 rounded-xl p-6 hover:border-white/10 transition-colors duration-200"
              >
                <div className={`absolute inset-0 bg-gradient-to-b ${feature.gradient} rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                <div className="relative">
                  <div 
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: `${feature.color}20` }}
                  >
                    <feature.icon className="w-6 h-6" style={{ color: feature.color }} />
                  </div>
                  <h3 className="font-display font-bold text-lg text-white mb-2">{feature.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* RPM Section */}
      <section className="relative z-10 px-6 lg:px-16 py-24 bg-[#0d0d0d]">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="inline-flex items-center gap-2 bg-[#00E5FF]/10 border border-[#00E5FF]/20 rounded-full px-4 py-2 mb-6">
                <DollarSign className="w-4 h-4 text-[#00E5FF]" />
                <span className="text-sm text-[#00E5FF]">Système RPM</span>
              </div>
              <h2 className="font-display font-bold text-3xl lg:text-4xl text-white tracking-tight mb-6">
                Rémunération transparente
                <br />
                <span className="text-[#00E5FF]">au nombre de vues</span>
              </h2>
              <p className="text-white/50 mb-8 leading-relaxed">
                Les clippeurs sont payés selon leurs performances. Chaque campagne définit 
                un RPM (revenu par 1000 vues), un seuil minimum et un plafond maximum.
              </p>
              <ul className="space-y-4">
                {[
                  "RPM personnalisable par campagne",
                  "Suivi des vues en temps réel",
                  "Paiements automatiques",
                  "Historique détaillé des gains",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/70">
                    <div className="w-5 h-5 rounded-full bg-[#00E5FF]/20 flex items-center justify-center">
                      <Zap className="w-3 h-3 text-[#00E5FF]" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="bg-[#121212] border border-white/10 rounded-2xl p-8">
                <div className="flex items-center justify-between mb-8">
                  <span className="text-white/50 text-sm">Exemple de campagne</span>
                  <span className="bg-[#39FF14]/20 text-[#39FF14] text-xs font-medium px-3 py-1 rounded-full">Active</span>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <div className="text-sm text-white/50 mb-2">RPM configuré</div>
                    <div className="font-mono font-bold text-4xl text-white">€3.50</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="text-xs text-white/50 mb-1">Vues totales</div>
                      <div className="font-mono font-bold text-xl text-white">1.2M</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="text-xs text-white/50 mb-1">Gains distribués</div>
                      <div className="font-mono font-bold text-xl text-[#00E5FF]">€4,200</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-white/50">Budget utilisé</span>
                      <span className="text-white">84%</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full w-[84%] bg-gradient-to-r from-[#00E5FF] to-[#FF007F] rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating cards */}
              <div className="absolute -top-4 -right-4 bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-2 shadow-xl">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#FF007F]" />
                  <span className="text-sm text-white">+12 clippeurs</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 px-6 lg:px-16 py-24">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display font-bold text-3xl lg:text-5xl text-white tracking-tight mb-6">
              Prêt à commencer ?
            </h2>
            <p className="text-white/50 mb-10 max-w-lg mx-auto">
              Rejoignez la plateforme et commencez à gérer vos campagnes de clipping dès aujourd'hui.
            </p>
            <Button
              onClick={handleGetStarted}
              data-testid="cta-start-btn"
              className="bg-[#00E5FF] hover:bg-[#00d4eb] text-black font-bold rounded-full px-10 py-6 text-lg transition-colors duration-200"
            >
              Commencer gratuitement
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-6 lg:px-16 bg-[#0A0A0A] border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-3">
              Tarifs <span className="text-[#f0c040]">agence</span>
            </h2>
            <p className="text-white/50 text-base">HT · 2 semaines offertes à l'inscription</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center max-w-2xl mx-auto">
            {/* Starter */}
            <div className="bg-[#121212] border border-white/10 rounded-2xl p-6 space-y-4 hover:border-white/20 transition-all">
              <div>
                <p className="text-white/50 text-sm font-medium mb-1">Starter</p>
                <p className="text-3xl font-bold text-white">150€<span className="text-base text-white/40 font-normal">/mois</span></p>
                <p className="text-white/30 text-xs mt-1">HT · 14 jours gratuits</p>
              </div>
              <ul className="space-y-2 text-sm text-white/60">
                <li className="flex items-center gap-2"><span className="text-[#39FF14]">✓</span> 1 campagne active</li>
                <li className="flex items-center gap-2"><span className="text-[#39FF14]">✓</span> Jusqu'à 15 clippers</li>
                <li className="flex items-center gap-2"><span className="text-[#39FF14]">✓</span> Tracking automatique</li>
                <li className="flex items-center gap-2"><span className="text-[#39FF14]">✓</span> Chat avec les clippeurs</li>
                <li className="flex items-center gap-2"><span className="text-[#39FF14]">✓</span> Support standard</li>
              </ul>
              <Button onClick={handleGetStarted} className="w-full bg-white/10 hover:bg-white/20 text-white rounded-lg py-2 text-sm font-medium transition-colors border border-white/10">
                Commencer l'essai gratuit
              </Button>
            </div>
            {/* Full — FEATURED */}
            <div className="bg-[#121212] border-2 border-[#FF007F] rounded-2xl p-6 space-y-4 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FF007F] text-white text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap">
                Recommandé
              </div>
              <div>
                <p className="text-white/50 text-sm font-medium mb-1">Full</p>
                <p className="text-3xl font-bold text-white">350€<span className="text-base text-white/40 font-normal">/mois</span></p>
                <p className="text-white/30 text-xs mt-1">HT · 14 jours gratuits</p>
              </div>
              <ul className="space-y-2 text-sm text-white/60">
                <li className="flex items-center gap-2"><span className="text-[#39FF14]">✓</span> Campagnes illimitées</li>
                <li className="flex items-center gap-2"><span className="text-[#39FF14]">✓</span> Clippers illimités</li>
                <li className="flex items-center gap-2"><span className="text-[#39FF14]">✓</span> Tracking automatique</li>
                <li className="flex items-center gap-2"><span className="text-[#39FF14]">✓</span> Analytics avancés</li>
                <li className="flex items-center gap-2"><span className="text-[#39FF14]">✓</span> Support prioritaire</li>
                <li className="flex items-center gap-2"><span className="text-[#39FF14]">✓</span> Liens de tracking bio</li>
              </ul>
              <Button onClick={handleGetStarted} className="w-full bg-[#FF007F] hover:bg-[#FF007F]/80 text-white rounded-lg py-2 text-sm font-semibold transition-colors">
                Commencer l'essai gratuit
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 lg:px-16 py-8 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={process.env.PUBLIC_URL + "/logo.svg"}
              alt="The Clip Deal Track"
              className="w-8 h-8 rounded-lg"
            />
            <span className="font-display font-bold text-white">The Clip Deal Track</span>
          </div>
          <p className="text-sm text-white/40">© 2025 The Clip Deal Track. Tous droits réservés.</p>
        </div>
      </footer>

      {/* Role Selection Modal */}
      <Dialog open={showRoleModal} onOpenChange={setShowRoleModal}>
        <DialogContent className="bg-[#121212] border-white/10 max-w-2xl">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <DialogHeader>
                  <DialogTitle className="font-display font-bold text-2xl text-white text-center">
                    Qui êtes-vous ?
                  </DialogTitle>
                  <p className="text-white/50 text-center mt-2">
                    Choisissez votre rôle pour commencer
                  </p>
                </DialogHeader>
                
                <div className="grid sm:grid-cols-2 gap-4 mt-6">
                  {roles.map((role) => (
                    <button
                      key={role.id}
                      onClick={() => handleRoleSelect(role.id)}
                      data-testid={`modal-role-${role.id}`}
                      className={`relative p-5 rounded-xl border text-left transition-all duration-200 ${
                        selectedRole === role.id
                          ? "bg-white/10 scale-[1.02]"
                          : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.07]"
                      }`}
                      style={{
                        borderColor: selectedRole === role.id ? role.color : undefined,
                        boxShadow: selectedRole === role.id ? `0 0 20px ${role.color}30` : undefined,
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                        style={{ backgroundColor: `${role.color}20` }}
                      >
                        <role.icon className="w-5 h-5" style={{ color: role.color }} />
                      </div>
                      <h3 className="font-display font-bold text-white mb-1">
                        {role.title}
                      </h3>
                      <p className="text-sm text-white/50 leading-relaxed">
                        {role.description}
                      </p>
                      {selectedRole === role.id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: role.color }}
                        >
                          <ChevronRight className="w-3 h-3 text-black" />
                        </motion.div>
                      )}
                    </button>
                  ))}
                </div>

                <Button
                  onClick={handleNextStep}
                  disabled={!selectedRole}
                  data-testid="modal-next-btn"
                  className={`w-full mt-6 py-6 font-bold rounded-xl text-lg transition-all duration-200 ${
                    selectedRole 
                      ? "bg-white text-black hover:bg-white/90" 
                      : "bg-white/10 text-white/50 cursor-not-allowed"
                  }`}
                >
                  Suivant
                  <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              </motion.div>
            ) : step === 2 ? (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <DialogHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={handleBackStep}
                      className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${selectedRoleData?.color}20` }}
                    >
                      {selectedRoleData && <selectedRoleData.icon className="w-5 h-5" style={{ color: selectedRoleData.color }} />}
                    </div>
                    <DialogTitle className="font-display font-bold text-xl text-white">
                      Inscription {selectedRoleData?.title}
                    </DialogTitle>
                  </div>
                  <p className="text-white/50 text-sm ml-14">
                    Complétez vos informations pour continuer
                  </p>
                </DialogHeader>
                
                <div className="space-y-3 mt-6">
                  {/* Photo de profil */}
                  <div className="flex flex-col items-center gap-3 mb-2">
                    <label className="cursor-pointer group relative">
                      <div className="w-20 h-20 rounded-full bg-white/10 border-2 border-dashed border-white/20 group-hover:border-white/40 transition-colors flex items-center justify-center overflow-hidden">
                        {profilePicture ? (
                          <img src={profilePicture} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white/30 text-3xl">+</span>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => setProfilePicture(ev.target.result);
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    <p className="text-xs text-white/40">Photo de profil (optionnel)</p>
                  </div>

                  {/* Nom de l'agence (agency only) */}
                  {selectedRole === "agency" && (
                    <div>
                      <label className="block text-sm text-white/70 mb-2">Nom de l'agence *</label>
                      <Input
                        value={formData.agencyName}
                        onChange={(e) => handleFormChange("agencyName", e.target.value)}
                        placeholder="Ex: Clip Factory"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 py-6"
                        data-testid="input-agency-name"
                      />
                    </div>
                  )}

                  {/* Prénom + Nom — tous les rôles */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-white/70 mb-2">Prénom *</label>
                      <Input
                        value={formData.firstName}
                        onChange={(e) => handleFormChange("firstName", e.target.value)}
                        placeholder="Jean"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 py-6"
                        data-testid="input-first-name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-white/70 mb-2">Nom *</label>
                      <Input
                        value={formData.lastName}
                        onChange={(e) => handleFormChange("lastName", e.target.value)}
                        placeholder="Dupont"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 py-6"
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>
                </div>

                {/* Mot de passe commun (Google + Email) */}
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-sm text-white/70 mb-2">Mot de passe *</label>
                    <Input
                      type="password"
                      placeholder="Minimum 6 caractères"
                      value={emailForm.password}
                      onChange={(e) => setEmailForm(f => ({ ...f, password: e.target.value }))}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/70 mb-2">Confirmer le mot de passe *</label>
                    <Input
                      type="password"
                      placeholder="Répétez votre mot de passe"
                      value={emailForm.confirmPassword}
                      onChange={(e) => setEmailForm(f => ({ ...f, confirmPassword: e.target.value }))}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                    />
                  </div>
                </div>

                {/* CGU checkbox */}
                <label className="flex items-start gap-2 cursor-pointer text-xs text-white/50 mt-4">
                  <input
                    type="checkbox"
                    checked={cguAccepted}
                    onChange={(e) => setCguAccepted(e.target.checked)}
                    className="mt-0.5 w-3.5 h-3.5 accent-[#00E5FF] flex-shrink-0"
                  />
                  <span>
                    J'accepte les{" "}
                    <a href="/cgu" target="_blank" rel="noopener noreferrer" className="text-[#00E5FF] underline hover:text-[#00E5FF]/80" onClick={e => e.stopPropagation()}>Conditions Générales d'Utilisation</a>
                    {" "}et la{" "}
                    <a href="/cgu" target="_blank" rel="noopener noreferrer" className="text-[#00E5FF] underline hover:text-[#00E5FF]/80" onClick={e => e.stopPropagation()}>Politique de confidentialité</a>
                    . Je reconnais que The Clip Deal est un outil de mise en relation et n'est pas responsable des contenus publiés par les clippers.
                  </span>
                </label>

                {/* Méthodes de connexion */}
                {(() => {
                  const passwordValid = emailForm.password.length >= 6 && emailForm.password === emailForm.confirmPassword;
                  const allValid = isFormValid() && cguAccepted && passwordValid;
                  return allValid ? (
                  <div className="mt-5 space-y-3">
                    {/* Option Google */}
                    <div className="flex justify-center">
                      <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => toast.error("Connexion Google échouée")}
                        theme="filled_black"
                        shape="pill"
                        text="continue_with"
                        locale="fr"
                        useOneTap={false}
                      />
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-white/10" />
                      <span className="text-xs text-white/30">ou</span>
                      <div className="flex-1 h-px bg-white/10" />
                    </div>

                    {/* Option Email avec code */}
                    <div className="space-y-3">
                      <Input
                        type="email"
                        placeholder="votre@email.com"
                        value={emailForm.email}
                        onChange={(e) => setEmailForm(f => ({ ...f, email: e.target.value }))}
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                      />
                      <Button
                        onClick={handleEmailRegister}
                        disabled={emailLoading || !emailForm.email}
                        className="w-full bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-black font-semibold"
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        {emailLoading ? "Envoi en cours..." : "Continuer avec Email"}
                      </Button>
                    </div>
                  </div>
                  ) : (
                  <div className="w-full py-4 rounded-xl text-center text-sm text-white/30 border border-white/10 mt-4">
                    {!isFormValid() ? "Remplissez tous les champs pour continuer" :
                     !cguAccepted ? "Acceptez les CGU pour continuer" :
                     emailForm.password.length < 6 ? "Mot de passe trop court (6 caractères min.)" :
                     "Les mots de passe ne correspondent pas"}
                  </div>
                  );
                })()}
              </motion.div>
            ) : step === 3 ? (
              /* ── STEP 3 : Vérification email ── */
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <DialogHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={() => setStep(2)}
                      className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="w-10 h-10 rounded-lg bg-[#00E5FF]/20 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-[#00E5FF]" />
                    </div>
                    <DialogTitle className="font-display font-bold text-xl text-white">
                      Vérification email
                    </DialogTitle>
                  </div>
                </DialogHeader>
                <div className="mt-3 ml-14 mb-6">
                  <p className="text-white/50 text-sm">
                    Un code à 6 chiffres a été envoyé à
                  </p>
                  <p className="text-white font-medium text-sm mt-1">{emailPending}</p>
                  <p className="text-white/30 text-xs mt-2">Vérifiez aussi votre dossier Spam.</p>
                </div>
                <div className="space-y-4">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="_ _ _ _ _ _"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-center text-3xl tracking-[1rem] font-mono h-16"
                  />
                  <Button
                    onClick={handleVerifyCode}
                    disabled={emailLoading || verificationCode.length !== 6}
                    className="w-full bg-[#00E5FF] hover:bg-[#00E5FF]/90 text-black font-semibold py-6"
                  >
                    {emailLoading ? "Vérification..." : "Confirmer mon compte"}
                  </Button>
                  <button
                    onClick={async () => {
                      try {
                        const r = await fetch(`${API}/auth/resend-code`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({ email: emailPending }),
                        });
                        const data = await r.json();
                        if (!r.ok) throw new Error(data.detail);
                        setVerificationCode("");
                        toast.success("Nouveau code envoyé !");
                      } catch (e) {
                        toast.error(e.message || "Erreur lors du renvoi");
                      }
                    }}
                    className="w-full text-center text-sm text-white/40 hover:text-white/70 transition-colors"
                  >
                    Renvoyer le code
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      {/* ── Modal Se connecter ── */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="bg-[#121212] border-white/10 max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-[#00E5FF]/20 flex items-center justify-center">
                <LogIn className="w-5 h-5 text-[#00E5FF]" />
              </div>
              <DialogTitle className="font-display font-bold text-xl text-white">
                Se connecter
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">Email</label>
              <Input
                type="email"
                placeholder="votre@email.com"
                value={loginForm.email}
                onChange={(e) => setLoginForm(f => ({ ...f, email: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 py-5"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">Mot de passe</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={(e) => setLoginForm(f => ({ ...f, password: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 py-5"
              />
            </div>
            <Button
              onClick={handleLogin}
              disabled={loginLoading || !loginForm.email || !loginForm.password}
              className="w-full bg-white text-black hover:bg-white/90 font-semibold py-6 mt-2"
            >
              {loginLoading ? "Connexion..." : "Se connecter"}
            </Button>
            <p className="text-center text-sm text-white/40">
              Pas encore de compte ?{" "}
              <button
                onClick={() => { setShowLoginModal(false); handleGetStarted(); }}
                className="text-[#00E5FF] hover:underline"
              >
                Créer un compte
              </button>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

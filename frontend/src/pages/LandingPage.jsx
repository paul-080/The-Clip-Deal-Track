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
  const [pricingMode, setPricingMode] = useState("full"); // "full" | "click"

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
  const [loginView, setLoginView] = useState("login"); // "login" | "forgot" | "forgot_sent"
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

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
      // Use the backend-confirmed role (existing user keeps their original role)
      const finalRole = data.user?.role || selectedRole;
      const welcomeName = data.user?.display_name || displayName;
      toast.success(`Bienvenue ${welcomeName} !`);
      setShowRoleModal(false);
      navigate(`/${finalRole}`);
    } catch (e) {
      toast.error(e.message || "Erreur de connexion Google");
    }
  };

  // Password rules checker (inline helper used by form + button)
  const pwdRules = (pwd) => ({
    length:  pwd.length >= 6,
    upper:   /[A-Z]/.test(pwd),
    special: /[^A-Za-z0-9]/.test(pwd),
  });
  const pwdValid = (pwd) => { const r = pwdRules(pwd); return r.length && r.upper && r.special; };

  const handleEmailRegister = async () => {
    if (!isFormValid() || !cguAccepted) return;
    if (!pwdValid(emailForm.password)) { toast.error("Le mot de passe ne respecte pas les règles de sécurité"); return; }
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

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) { toast.error("Entrez votre adresse email"); return; }
    setForgotLoading(true);
    try {
      const r = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      if (r.status === 429) {
        const data = await r.json().catch(() => ({}));
        toast.error(data.detail || "Trop de tentatives — réessayez plus tard");
        return;
      }
      // Backend renvoie toujours {sent:true} pour ne pas leaker l'existence de l'email
      setLoginView("forgot_sent");
    } catch {
      toast.error("Erreur réseau — réessayez");
    } finally {
      setForgotLoading(false);
    }
  };

  const selectedRoleData = roles.find(r => r.id === selectedRole);

  return (
    <div className="min-h-screen bg-[#0E0D0B] overflow-hidden relative">
      {/* Background warm radial + grain subtle */}
      <div className="bg-warm-radial absolute inset-0 pointer-events-none" />
      <div className="noise-bg absolute inset-0 pointer-events-none" />

      {/* Hero Section */}
      <header className="relative">
        {/* Navigation */}
        <nav className="relative z-20 flex items-center justify-between gap-2 px-4 sm:px-6 lg:px-16 py-4 sm:py-6 border-b border-warm">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink"
          >
            <img
              src={process.env.PUBLIC_URL + "/logo.svg"}
              alt="The Clip Deal Track"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex-shrink-0"
            />
            <span className="font-display font-semibold text-base sm:text-lg tracking-tight text-[#F5F4F1] truncate">
              <span className="hidden sm:inline">The Clip Deal Track</span>
              <span className="sm:hidden">Clip Deal</span>
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 sm:gap-3 flex-shrink-0"
          >
            {user ? (
              <Button
                onClick={handleGetStarted}
                data-testid="nav-login-btn"
                className="bg-[#1C1A17] hover:bg-[#262320] text-[#F5F4F1] border border-warm rounded-lg px-4 sm:px-5 py-2 text-sm font-medium transition-all duration-200"
              >
                Dashboard
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => setShowLoginModal(true)}
                  variant="ghost"
                  data-testid="nav-login-btn"
                  className="hidden sm:inline-flex text-[#F5F4F1]/70 hover:text-[#F5F4F1] hover:bg-white/[0.04] rounded-lg px-4 py-2 font-medium transition-colors duration-200"
                >
                  Se connecter
                </Button>
                <Button
                  onClick={handleGetStarted}
                  className="bg-[#F5F4F1] hover:bg-white text-[#0E0D0B] rounded-lg px-4 sm:px-5 py-2 text-sm font-semibold transition-all duration-200 whitespace-nowrap shadow-sm"
                >
                  <span className="hidden sm:inline">Créer un compte</span>
                  <span className="sm:hidden">S'inscrire</span>
                </Button>
              </>
            )}
          </motion.div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 px-6 lg:px-16 pt-20 lg:pt-28 pb-32">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.5 }}
              className="inline-flex items-center gap-2 bg-[#1C1A17]/60 border border-warm rounded-full px-3.5 py-1.5 mb-8 backdrop-blur-sm"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse" />
              <span className="text-xs font-medium text-[#F5F4F1]/70 tracking-wide">En route pour devenir l'app #1 du clipping</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.55 }}
              className="font-display font-bold text-[clamp(2.5rem,7vw,5.5rem)] tracking-[-0.035em] text-[#F5F4F1] mb-6 leading-[1.02]"
            >
              Gérez vos campagnes
              <br />
              <span className="bg-gradient-to-r from-[#00E5FF] via-[#F5F4F1] to-[#FF007F] bg-clip-text text-transparent">
                de clipping vidéo
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.55 }}
              className="text-base sm:text-lg text-[#F5F4F1]/60 max-w-xl mb-10 leading-relaxed"
            >
              Tracking auto TikTok / Instagram / YouTube, paiement aux clippeurs en 1 clic, anti-fraude intégré.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              className="flex flex-col sm:flex-row gap-3"
            >
              <Button
                onClick={handleGetStarted}
                data-testid="hero-cta-btn"
                className="bg-[#F5F4F1] hover:bg-white text-[#0E0D0B] font-semibold rounded-lg px-7 py-6 text-base transition-all duration-200 flex items-center gap-2 shadow-sm hover:shadow-md"
              >
                Commencer maintenant
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => navigate("/decouvrir")}
                variant="outline"
                data-testid="hero-learn-more-btn"
                className="bg-transparent border border-warm hover:bg-[#1C1A17] text-[#F5F4F1] rounded-lg px-7 py-6 text-base transition-all duration-200 flex items-center gap-2"
              >
                Voir les fonctionnalités
                <ChevronRight className="w-4 h-4" />
              </Button>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.55 }}
              className="grid grid-cols-3 gap-6 mt-24 max-w-2xl"
            >
              {[
                { value: "Beta", label: "Lancement en cours" },
                { value: "100%", label: "Tracking automatique" },
                { value: "0€", label: "Commission plateforme" },
              ].map((stat, i) => (
                <div key={i} className="text-left">
                  <div className="font-display font-semibold text-2xl lg:text-3xl text-[#F5F4F1] tracking-tight tabular-nums">
                    {stat.value}
                  </div>
                  <div className="text-xs text-[#F5F4F1]/50 mt-1 tracking-wide">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </header>

      {/* Video Section — Lancement SaaS */}
      <section className="relative z-10 px-6 lg:px-16 py-20 bg-[#0E0D0B] border-t border-warm">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <h2 className="text-3xl lg:text-4xl font-display font-semibold text-[#F5F4F1] mb-3 tracking-tight">
              Voir la plateforme en action
            </h2>
            <p className="text-[#F5F4F1]/55 text-base">
              2 minutes, tout est dit.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55 }}
            className="relative w-full aspect-video rounded-2xl overflow-hidden border border-warm bg-[#1C1A17]"
          >
            <iframe
              src="https://www.youtube.com/embed/sWCEX7Q8gDo?rel=0&modestbranding=1"
              title="The Clip Deal Track — Présentation"
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 px-6 lg:px-16 py-24 bg-[#0E0D0B] border-t border-warm">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <h2 className="font-display font-semibold text-3xl lg:text-4xl text-[#F5F4F1] tracking-tight mb-3">
              4 rôles, 1 plateforme
            </h2>
            <p className="text-[#F5F4F1]/55 max-w-lg mx-auto text-base">
              Chaque acteur du clipping a son espace dédié.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: Users,
                title: "Agences",
                description: "Créez des campagnes, gérez vos clippeurs et suivez les performances",
                color: "#FF007F",
              },
              {
                icon: Video,
                title: "Clippeurs",
                description: "Rejoignez des campagnes, postez vos clips et soyez rémunérés",
                color: "#00E5FF",
              },
              {
                icon: BarChart3,
                title: "Managers",
                description: "Supervisez les équipes et envoyez des conseils personnalisés",
                color: "#39FF14",
              },
              {
                icon: TrendingUp,
                title: "Clients",
                description: "Suivez vos campagnes et communiquez avec les agences",
                color: "#FFB300",
              },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.45 }}
                className="group relative bg-[#1C1A17]/85 border border-warm rounded-xl p-6 hover:border-[#F5F4F1]/14 hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="relative">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 border"
                    style={{
                      backgroundColor: `${feature.color}10`,
                      borderColor: `${feature.color}24`,
                    }}
                  >
                    <feature.icon className="w-5 h-5" style={{ color: feature.color }} />
                  </div>
                  <h3 className="font-display font-semibold text-base text-[#F5F4F1] mb-1.5">{feature.title}</h3>
                  <p className="text-sm text-[#F5F4F1]/55 leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* RPM Section */}
      <section className="relative z-10 px-6 lg:px-16 py-24 bg-[#0A0907] border-t border-warm">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55 }}
            >
              <div className="inline-flex items-center gap-2 bg-[#1C1A17]/80 border border-warm rounded-full px-3.5 py-1.5 mb-6">
                <DollarSign className="w-3.5 h-3.5 text-[#00E5FF]" />
                <span className="text-xs font-medium text-[#F5F4F1]/75 tracking-wide">Système RPM</span>
              </div>
              <h2 className="font-display font-semibold text-3xl lg:text-4xl text-[#F5F4F1] tracking-tight mb-5 leading-[1.1]">
                Payé au RPM,
                <br />
                <span className="text-[#00E5FF]">pas à l'estimation</span>
              </h2>
              <p className="text-[#F5F4F1]/55 mb-8 leading-relaxed text-base">
                Vues récupérées direct depuis TikTok, Instagram, YouTube. Tu fixes le RPM, on calcule, tu valides.
              </p>
              <ul className="space-y-3">
                {[
                  "RPM personnalisable par campagne",
                  "Tracking vues 1× ou 3×/jour",
                  "Paiement validé en 1 clic",
                  "Historique détaillé des gains",
                ].map((item, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 + i * 0.07 }}
                    className="flex items-center gap-3 text-[#F5F4F1]/75 text-sm"
                  >
                    <div className="w-5 h-5 rounded-md bg-[#00E5FF]/10 border border-[#00E5FF]/25 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-3 h-3 text-[#00E5FF]" />
                    </div>
                    {item}
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.1 }}
              className="relative"
            >
              <div className="bg-[#1C1A17]/85 border border-warm rounded-2xl p-7">
                <div className="flex items-center justify-between mb-7">
                  <span className="text-[#F5F4F1]/50 text-xs uppercase tracking-wide">Exemple de campagne</span>
                  <span className="inline-flex items-center gap-1.5 border border-[#39FF14]/30 bg-[#39FF14]/10 text-[#39FF14] text-[11px] font-medium px-2.5 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14]" />
                    Active
                  </span>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="text-xs text-[#F5F4F1]/50 mb-1.5 tracking-wide">RPM configuré</div>
                    <div className="font-display font-semibold text-4xl text-[#F5F4F1] tabular-nums tracking-tight">€3,50</div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0E0D0B]/60 border border-warm rounded-lg p-3.5">
                      <div className="text-[11px] text-[#F5F4F1]/50 mb-1 tracking-wide">Vues totales</div>
                      <div className="font-mono font-semibold text-lg text-[#F5F4F1] tabular-nums">1,2M</div>
                    </div>
                    <div className="bg-[#0E0D0B]/60 border border-warm rounded-lg p-3.5">
                      <div className="text-[11px] text-[#F5F4F1]/50 mb-1 tracking-wide">Gains distribués</div>
                      <div className="font-mono font-semibold text-lg text-[#00E5FF] tabular-nums">€4 200</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-[#F5F4F1]/50 tracking-wide">Budget utilisé</span>
                      <span className="text-[#F5F4F1] font-medium tabular-nums">84%</span>
                    </div>
                    <div className="h-1.5 bg-[#0E0D0B] border border-warm rounded-full overflow-hidden">
                      <div className="h-full w-[84%] bg-gradient-to-r from-[#00E5FF] to-[#FF007F] rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating card */}
              <div className="absolute -top-3 -right-3 bg-[#1C1A17] border border-warm rounded-lg px-3 py-1.5 shadow-lg">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-[#FF007F]/20 border border-[#FF007F]/40" />
                  <span className="text-xs text-[#F5F4F1] font-medium">+12 clippeurs</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Coming Soon Section — Roadmap */}
      <section className="relative z-10 px-6 lg:px-16 py-20 border-t border-warm">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1C1A17]/60 border border-warm mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse" />
              <span className="text-[11px] uppercase tracking-widest text-[#F5F4F1]/60 font-medium">À venir prochainement</span>
            </div>
            <h2 className="font-display font-semibold text-3xl lg:text-4xl text-[#F5F4F1] tracking-tight mb-3">
              Notre roadmap
            </h2>
            <p className="text-[#F5F4F1]/55 text-base">
              Les prochaines features qui arrivent sur The Clip Deal Track.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* App mobile */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.05, duration: 0.5 }}
              className="relative overflow-hidden rounded-2xl bg-[#1C1A17]/85 border border-warm hover:border-[#00E5FF]/30 hover:-translate-y-0.5 transition-all duration-200 p-6"
            >
              <div className="absolute top-5 right-5">
                <span className="text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-md bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30">
                  Soon
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#00E5FF]/10 border border-[#00E5FF]/24 flex items-center justify-center mb-4">
                <Video className="w-5 h-5 text-[#00E5FF]" />
              </div>
              <h3 className="text-lg lg:text-xl font-display font-semibold text-[#F5F4F1] mb-1.5 tracking-tight">
                Application mobile
              </h3>
              <p className="text-[#F5F4F1]/55 text-sm leading-relaxed">
                iOS et Android. Suivre tes campagnes, valider tes clips, et toucher tes paiements
                directement depuis ton téléphone. Notifications push en temps réel.
              </p>
            </motion.div>

            {/* Paiement automatique clippeurs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.12, duration: 0.5 }}
              className="relative overflow-hidden rounded-2xl bg-[#1C1A17]/85 border border-warm hover:border-[#39FF14]/30 hover:-translate-y-0.5 transition-all duration-200 p-6"
            >
              <div className="absolute top-5 right-5">
                <span className="text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-md bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/30">
                  Soon
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#39FF14]/10 border border-[#39FF14]/24 flex items-center justify-center mb-4">
                <Zap className="w-5 h-5 text-[#39FF14]" />
              </div>
              <h3 className="text-lg lg:text-xl font-display font-semibold text-[#F5F4F1] mb-1.5 tracking-tight">
                Paiement automatique aux clippeurs
              </h3>
              <p className="text-[#F5F4F1]/55 text-sm leading-relaxed">
                Virement automatique aux clippeurs quand les paliers sont atteints. Plus de relances,
                plus de fichiers Excel. L'agence valide une fois, on s'occupe du reste.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 px-6 lg:px-16 bg-[#0E0D0B] border-t border-warm">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl lg:text-4xl font-display font-semibold text-[#F5F4F1] mb-3 tracking-tight">
              Tarifs <span className="text-[#f0c040]">agence</span>
            </h2>
            <p className="text-[#F5F4F1]/55 text-base mb-7">HT · 2 semaines offertes à l'inscription</p>
            {/* Toggle Vues & Clics / Clics */}
            <div className="inline-flex bg-[#1C1A17]/60 border border-warm rounded-lg p-1 gap-1">
              <button onClick={() => setPricingMode("full")}
                className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${pricingMode === "full" ? "bg-[#FF007F] text-white" : "text-[#F5F4F1]/55 hover:text-[#F5F4F1]"}`}>
                Vues & Clics
              </button>
              <button onClick={() => setPricingMode("click")}
                className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${pricingMode === "click" ? "bg-[#f0c040] text-black" : "text-[#F5F4F1]/55 hover:text-[#F5F4F1]"}`}>
                Au clic uniquement
              </button>
            </div>
            <p className="text-[#F5F4F1]/40 text-xs mt-3 max-w-md mx-auto">
              {pricingMode === "full"
                ? "Tracking complet : vues, likes, commentaires, gains au RPM + clics"
                : "Tracking au clic uniquement (sans suivi des vues) — moins cher, idéal pour campagnes focus liens en bio"}
            </p>
          </div>
          {pricingMode === "click" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
              {/* Starter Click */}
              <div className="bg-[#1C1A17]/85 border border-warm rounded-2xl p-6 space-y-4 hover:border-[#F5F4F1]/14 hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
                <div>
                  <p className="text-[#F5F4F1]/55 text-sm font-medium mb-1.5 tracking-wide">Starter Clic</p>
                  <p className="text-3xl font-display font-semibold text-[#F5F4F1] tabular-nums tracking-tight">89€<span className="text-base text-[#F5F4F1]/40 font-normal ml-0.5">/mois</span></p>
                  <p className="text-[#F5F4F1]/35 text-xs mt-1">HT · Au clic uniquement</p>
                </div>
                <ul className="space-y-2 text-sm text-[#F5F4F1]/65 flex-1">
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> 1 campagne active</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Jusqu'à 15 clippeurs</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Tracking clics temps réel</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Liens bio personnalisés</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Support standard</li>
                  <li className="flex items-start gap-2"><span className="text-[#F5F4F1]/30 flex-shrink-0 mt-px">×</span> <span className="text-[#F5F4F1]/40">Pas de tracking vues ni striking auto</span></li>
                </ul>
                <Button onClick={handleGetStarted} className="w-full bg-[#1C1A17] hover:bg-[#262320] text-[#F5F4F1] rounded-lg py-2.5 text-sm font-medium transition-colors border border-warm">
                  Choisir ce plan
                </Button>
              </div>
              {/* Pro Click — Featured */}
              <div className="bg-[#1C1A17]/95 border border-[#f0c040]/60 rounded-2xl p-6 space-y-4 relative flex flex-col shadow-[0_0_0_1px_rgba(240,192,64,0.10)]">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#f0c040] text-black text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap">
                  Recommandé
                </div>
                <div>
                  <p className="text-[#f0c040] text-sm font-medium mb-1.5 tracking-wide">Pro Clic</p>
                  <p className="text-3xl font-display font-semibold text-[#F5F4F1] tabular-nums tracking-tight">149€<span className="text-base text-[#F5F4F1]/40 font-normal ml-0.5">/mois</span></p>
                  <p className="text-[#F5F4F1]/35 text-xs mt-1">HT · Au clic uniquement</p>
                </div>
                <ul className="space-y-2 text-sm text-[#F5F4F1]/65 flex-1">
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> 3 campagnes actives</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Jusqu'à 45 clippeurs (total)</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Tracking clics temps réel</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Liens bio personnalisés</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Analytics clics avancés</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Support prioritaire</li>
                  <li className="flex items-start gap-2"><span className="text-[#F5F4F1]/30 flex-shrink-0 mt-px">×</span> <span className="text-[#F5F4F1]/40">Pas de tracking vues ni striking auto</span></li>
                </ul>
                <Button onClick={handleGetStarted} className="w-full bg-[#f0c040] hover:bg-[#e6b630] text-black rounded-lg py-2.5 text-sm font-semibold transition-colors">
                  Choisir ce plan
                </Button>
              </div>
              {/* Business Click */}
              <div className="bg-[#1C1A17]/85 border border-warm rounded-2xl p-6 space-y-4 hover:border-[#F5F4F1]/14 hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
                <div>
                  <p className="text-[#F5F4F1]/55 text-sm font-medium mb-1.5 tracking-wide">Business Clic</p>
                  <p className="text-3xl font-display font-semibold text-[#F5F4F1] tabular-nums tracking-tight">225€<span className="text-base text-[#F5F4F1]/40 font-normal ml-0.5">/mois</span></p>
                  <p className="text-[#F5F4F1]/35 text-xs mt-1">HT · Au clic uniquement</p>
                </div>
                <ul className="space-y-2 text-sm text-[#F5F4F1]/65 flex-1">
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Campagnes illimitées</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Jusqu'à 200 clippeurs</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Tracking clics temps réel</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Liens bio personnalisés</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Analytics clics avancés</li>
                  <li className="flex items-start gap-2"><span className="text-[#f0c040] flex-shrink-0 mt-px">✓</span> Support premium 24/7</li>
                  <li className="flex items-start gap-2"><span className="text-[#F5F4F1]/30 flex-shrink-0 mt-px">×</span> <span className="text-[#F5F4F1]/40">Pas de tracking vues ni striking auto</span></li>
                </ul>
                <Button onClick={handleGetStarted} className="w-full bg-[#1C1A17] hover:bg-[#262320] text-[#F5F4F1] rounded-lg py-2.5 text-sm font-medium transition-colors border border-warm">
                  Choisir ce plan
                </Button>
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-7xl mx-auto">
            {/* Starter */}
            <div className="bg-[#1C1A17]/85 border border-warm rounded-2xl p-6 space-y-4 hover:border-[#F5F4F1]/14 hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
              <div>
                <p className="text-[#F5F4F1]/55 text-sm font-medium mb-1.5 tracking-wide">Starter</p>
                <p className="text-3xl font-display font-semibold text-[#F5F4F1] tabular-nums tracking-tight">149€<span className="text-base text-[#F5F4F1]/40 font-normal ml-0.5">/mois</span></p>
                <p className="text-[#F5F4F1]/35 text-xs mt-1">HT · 14j gratuits en Business</p>
              </div>
              <ul className="space-y-2 text-sm text-[#F5F4F1]/65 flex-1">
                <li className="flex items-start gap-2"><span className="text-[#39FF14] flex-shrink-0 mt-px">✓</span> 1 campagne active</li>
                <li className="flex items-start gap-2"><span className="text-[#39FF14] flex-shrink-0 mt-px">✓</span> Jusqu'à 15 clippeurs</li>
                <li className="flex items-start gap-2"><span className="text-[#39FF14] flex-shrink-0 mt-px">✓</span> Tracking vues 1×/jour à 23h30</li>
                <li className="flex items-start gap-2"><span className="text-[#39FF14] flex-shrink-0 mt-px">✓</span> Striking automatique</li>
                <li className="flex items-start gap-2"><span className="text-[#39FF14] flex-shrink-0 mt-px">✓</span> Chat avec les clippeurs</li>
                <li className="flex items-start gap-2"><span className="text-[#39FF14] flex-shrink-0 mt-px">✓</span> Support standard</li>
              </ul>
              <Button onClick={handleGetStarted} className="w-full bg-[#1C1A17] hover:bg-[#262320] text-[#F5F4F1] rounded-lg py-2.5 text-sm font-medium transition-colors border border-warm">
                Commencer l'essai gratuit
              </Button>
            </div>

            {/* Pro */}
            <div className="bg-[#1C1A17]/85 border border-warm rounded-2xl p-6 space-y-4 hover:border-[#F5F4F1]/14 hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
              <div>
                <p className="text-[#F5F4F1]/55 text-sm font-medium mb-1.5 tracking-wide">Pro</p>
                <p className="text-3xl font-display font-semibold text-[#F5F4F1] tabular-nums tracking-tight">349€<span className="text-base text-[#F5F4F1]/40 font-normal ml-0.5">/mois</span></p>
                <p className="text-[#F5F4F1]/35 text-xs mt-1">HT · 14j gratuits en Business</p>
              </div>
              <ul className="space-y-2 text-sm text-[#F5F4F1]/65 flex-1">
                <li className="flex items-start gap-2"><span className="text-[#39FF14] flex-shrink-0 mt-px">✓</span> 3 campagnes actives</li>
                <li className="flex items-start gap-2"><span className="text-[#39FF14] flex-shrink-0 mt-px">✓</span> Jusqu'à 45 clippeurs (total)</li>
                <li className="flex items-start gap-2"><span className="text-[#39FF14] flex-shrink-0 mt-px">✓</span> Tracking vues 1×/jour à 23h30 Paris</li>
                <li className="flex items-start gap-2"><span className="text-[#39FF14] flex-shrink-0 mt-px">✓</span> Striking automatique</li>
                <li className="flex items-start gap-2"><span className="text-[#39FF14] flex-shrink-0 mt-px">✓</span> Analytics avancés</li>
                <li className="flex items-start gap-2"><span className="text-[#39FF14] flex-shrink-0 mt-px">✓</span> Liens de tracking bio</li>
                <li className="flex items-start gap-2"><span className="text-[#39FF14] flex-shrink-0 mt-px">✓</span> Support prioritaire</li>
              </ul>
              <Button onClick={handleGetStarted} className="w-full bg-[#1C1A17] hover:bg-[#262320] text-[#F5F4F1] rounded-lg py-2.5 text-sm font-medium transition-colors border border-warm">
                Commencer l'essai gratuit
              </Button>
            </div>

            {/* Business — FEATURED */}
            <div className="bg-[#1C1A17]/95 border border-[#FF007F]/60 rounded-2xl p-6 space-y-4 relative flex flex-col shadow-[0_0_0_1px_rgba(255,0,127,0.10)]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FF007F] text-white text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap">
                Recommandé · Essai 14j
              </div>
              <div>
                <p className="text-[#FF007F] text-sm font-medium mb-1.5 tracking-wide">Business</p>
                <p className="text-3xl font-display font-semibold text-[#F5F4F1] tabular-nums tracking-tight">449€<span className="text-base text-[#F5F4F1]/40 font-normal ml-0.5">/mois</span></p>
                <p className="text-[#F5F4F1]/35 text-xs mt-1">HT · 14 jours gratuits ici</p>
              </div>
              <ul className="space-y-2 text-sm text-[#F5F4F1]/65 flex-1">
                <li className="flex items-start gap-2"><span className="text-[#FF007F] flex-shrink-0 mt-px">✓</span> Campagnes illimitées</li>
                <li className="flex items-start gap-2"><span className="text-[#FF007F] flex-shrink-0 mt-px">✓</span> Jusqu'à 400 comptes trackés</li>
                <li className="flex items-start gap-2"><span className="text-[#FF007F] flex-shrink-0 mt-px">✓</span> Tracking vues 3×/jour (08h30, 15h30, 23h30 Paris)</li>
                <li className="flex items-start gap-2"><span className="text-[#FF007F] flex-shrink-0 mt-px">✓</span> Striking automatique</li>
                <li className="flex items-start gap-2"><span className="text-[#FF007F] flex-shrink-0 mt-px">✓</span> Analytics avancés</li>
                <li className="flex items-start gap-2"><span className="text-[#FF007F] flex-shrink-0 mt-px">✓</span> Liens de tracking bio</li>
                <li className="flex items-start gap-2"><span className="text-[#FF007F] flex-shrink-0 mt-px">✓</span> Support premium 24/7</li>
                <li className="flex items-start gap-2"><span className="text-[#FF007F] flex-shrink-0 mt-px">✓</span> Accès API</li>
              </ul>
              <Button onClick={handleGetStarted} className="w-full bg-[#FF007F] hover:bg-[#E50073] text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                Commencer l'essai gratuit
              </Button>
            </div>

            {/* Enterprise */}
            <div className="bg-[#1C1A17]/85 border border-[#00E5FF]/35 rounded-2xl p-6 space-y-4 hover:border-[#00E5FF]/60 hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
              <div>
                <p className="text-[#00E5FF] text-sm font-medium mb-1.5 tracking-wide">Enterprise</p>
                <p className="text-3xl font-display font-semibold text-[#F5F4F1] tracking-tight">Sur devis</p>
                <p className="text-[#F5F4F1]/35 text-xs mt-1">Serveur dédié sur mesure</p>
              </div>
              <ul className="space-y-2 text-sm text-[#F5F4F1]/65 flex-1">
                <li className="flex items-start gap-2"><span className="text-[#00E5FF] flex-shrink-0 mt-px">✓</span> Campagnes illimitées</li>
                <li className="flex items-start gap-2"><span className="text-[#00E5FF] flex-shrink-0 mt-px">✓</span> Clippeurs illimités</li>
                <li className="flex items-start gap-2"><span className="text-[#00E5FF] flex-shrink-0 mt-px">✓</span> Serveur dédié sur mesure</li>
                <li className="flex items-start gap-2"><span className="text-[#00E5FF] flex-shrink-0 mt-px">✓</span> Tracking personnalisé</li>
                <li className="flex items-start gap-2"><span className="text-[#00E5FF] flex-shrink-0 mt-px">✓</span> Striking automatique</li>
                <li className="flex items-start gap-2"><span className="text-[#00E5FF] flex-shrink-0 mt-px">✓</span> Intégrations sur mesure</li>
                <li className="flex items-start gap-2"><span className="text-[#00E5FF] flex-shrink-0 mt-px">✓</span> Account manager dédié</li>
                <li className="flex items-start gap-2"><span className="text-[#00E5FF] flex-shrink-0 mt-px">✓</span> SLA garanti</li>
              </ul>
              <Button onClick={() => navigate("/contact-devis")} className="w-full bg-[#00E5FF] hover:bg-[#00d4eb] text-black rounded-lg py-2.5 text-sm font-semibold transition-colors">
                Nous contacter
              </Button>
            </div>
          </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 lg:px-16 py-10 border-t border-warm bg-[#0A0907]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={process.env.PUBLIC_URL + "/logo.svg"}
              alt="The Clip Deal Track"
              className="w-8 h-8 rounded-lg"
            />
            <span className="font-display font-semibold text-[#F5F4F1] tracking-tight">The Clip Deal Track</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#F5F4F1]/45">
            <button onClick={() => navigate("/features")} className="hover:text-[#F5F4F1] transition-colors">Fonctionnalités</button>
            <button onClick={() => navigate("/contact-devis")} className="hover:text-[#F5F4F1] transition-colors">Contact</button>
            <button onClick={() => navigate("/cgu")} className="hover:text-[#F5F4F1] transition-colors">CGU</button>
            <span className="text-[#F5F4F1]/30">© 2026</span>
          </div>
        </div>
      </footer>

      {/* Role Selection Modal */}
      <Dialog open={showRoleModal} onOpenChange={setShowRoleModal}>
        <DialogContent className="bg-[#1C1A17] border-warm max-w-2xl">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <DialogHeader>
                  <DialogTitle className="font-display font-semibold text-2xl text-[#F5F4F1] text-center tracking-tight">
                    Qui êtes-vous ?
                  </DialogTitle>
                  <p className="text-[#F5F4F1]/55 text-center text-sm mt-2">
                    Choisissez votre rôle pour commencer
                  </p>
                </DialogHeader>

                <div className="grid sm:grid-cols-2 gap-3 mt-6">
                  {roles.map((role) => (
                    <button
                      key={role.id}
                      onClick={() => handleRoleSelect(role.id)}
                      data-testid={`modal-role-${role.id}`}
                      className={`relative p-4 rounded-xl border text-left transition-all duration-200 ${
                        selectedRole === role.id
                          ? "bg-[#262320]"
                          : "bg-[#0E0D0B]/60 border-warm hover:border-[#F5F4F1]/16 hover:bg-[#1C1A17]"
                      }`}
                      style={{
                        borderColor: selectedRole === role.id ? `${role.color}80` : undefined,
                        boxShadow: selectedRole === role.id ? `0 0 0 1px ${role.color}40` : undefined,
                      }}
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 border"
                        style={{ backgroundColor: `${role.color}14`, borderColor: `${role.color}30` }}
                      >
                        <role.icon className="w-4.5 h-4.5" style={{ color: role.color }} />
                      </div>
                      <h3 className="font-display font-semibold text-[#F5F4F1] text-sm mb-1">
                        {role.title}
                      </h3>
                      <p className="text-xs text-[#F5F4F1]/55 leading-relaxed">
                        {role.description}
                      </p>
                      {selectedRole === role.id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center"
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
                  className={`w-full mt-6 py-5 font-semibold rounded-lg text-base transition-all duration-200 ${
                    selectedRole
                      ? "bg-[#F5F4F1] text-[#0E0D0B] hover:bg-white shadow-sm"
                      : "bg-[#1C1A17] text-[#F5F4F1]/40 cursor-not-allowed border border-warm"
                  }`}
                >
                  Suivant
                  <ChevronRight className="w-4 h-4 ml-1.5" />
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
                      className="p-2 rounded-md hover:bg-[#262320] text-[#F5F4F1]/55 hover:text-[#F5F4F1] transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center border"
                      style={{
                        backgroundColor: `${selectedRoleData?.color}14`,
                        borderColor: `${selectedRoleData?.color}30`,
                      }}
                    >
                      {selectedRoleData && <selectedRoleData.icon className="w-4.5 h-4.5" style={{ color: selectedRoleData.color }} />}
                    </div>
                    <DialogTitle className="font-display font-semibold text-lg text-[#F5F4F1] tracking-tight">
                      Inscription {selectedRoleData?.title}
                    </DialogTitle>
                  </div>
                  <p className="text-[#F5F4F1]/55 text-xs ml-14">
                    Complétez vos informations pour continuer
                  </p>
                </DialogHeader>

                <div className="space-y-3 mt-6">
                  {/* Photo de profil */}
                  <div className="flex flex-col items-center gap-2 mb-3">
                    <label className="cursor-pointer group relative">
                      <div className="w-20 h-20 rounded-full bg-[#0E0D0B] border-2 border-dashed border-[#F5F4F1]/20 group-hover:border-[#F5F4F1]/35 transition-colors flex items-center justify-center overflow-hidden">
                        {profilePicture ? (
                          <img src={profilePicture} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[#F5F4F1]/30 text-2xl font-light">+</span>
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
                    <p className="text-xs text-[#F5F4F1]/40">Photo de profil (optionnel)</p>
                  </div>

                  {/* Nom de l'agence (agency only) */}
                  {selectedRole === "agency" && (
                    <div>
                      <label className="block text-xs font-medium text-[#F5F4F1]/70 mb-1.5 tracking-wide">Nom de l'agence *</label>
                      <Input
                        value={formData.agencyName}
                        onChange={(e) => handleFormChange("agencyName", e.target.value)}
                        placeholder="Ex: Clip Factory"
                        className="bg-[#0E0D0B] border-warm text-[#F5F4F1] placeholder:text-[#F5F4F1]/30 py-5 rounded-lg"
                        data-testid="input-agency-name"
                      />
                    </div>
                  )}

                  {/* Prénom + Nom — tous les rôles */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#F5F4F1]/70 mb-1.5 tracking-wide">Prénom *</label>
                      <Input
                        value={formData.firstName}
                        onChange={(e) => handleFormChange("firstName", e.target.value)}
                        placeholder="Jean"
                        className="bg-[#0E0D0B] border-warm text-[#F5F4F1] placeholder:text-[#F5F4F1]/30 py-5 rounded-lg"
                        data-testid="input-first-name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#F5F4F1]/70 mb-1.5 tracking-wide">Nom *</label>
                      <Input
                        value={formData.lastName}
                        onChange={(e) => handleFormChange("lastName", e.target.value)}
                        placeholder="Dupont"
                        className="bg-[#0E0D0B] border-warm text-[#F5F4F1] placeholder:text-[#F5F4F1]/30 py-5 rounded-lg"
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>
                </div>

                {/* Mot de passe commun (Google + Email) */}
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-[#F5F4F1]/70 mb-1.5 tracking-wide">Mot de passe *</label>
                    <Input
                      type="password"
                      placeholder="Ex: MonMotDePasse1!"
                      value={emailForm.password}
                      onChange={(e) => setEmailForm(f => ({ ...f, password: e.target.value }))}
                      className="bg-[#0E0D0B] border-warm text-[#F5F4F1] placeholder:text-[#F5F4F1]/30 py-5 rounded-lg"
                    />
                    {/* Checklist des règles — visible dès qu'on commence à taper */}
                    {emailForm.password.length > 0 && (() => {
                      const r = pwdRules(emailForm.password);
                      return (
                        <div className="mt-2 space-y-1">
                          {[
                            { ok: r.length,  label: "6 caractères minimum" },
                            { ok: r.upper,   label: "1 lettre majuscule (A-Z)" },
                            { ok: r.special, label: "1 caractère spécial (!@#$%...)" },
                          ].map(({ ok, label }) => (
                            <div key={label} className="flex items-center gap-1.5">
                              <span className={`text-xs font-bold ${ok ? "text-[#39FF14]" : "text-[#F5F4F1]/25"}`}>
                                {ok ? "✓" : "×"}
                              </span>
                              <span className={`text-xs ${ok ? "text-[#39FF14]/80" : "text-[#F5F4F1]/35"}`}>{label}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#F5F4F1]/70 mb-1.5 tracking-wide">Confirmer le mot de passe *</label>
                    <Input
                      type="password"
                      placeholder="Répétez votre mot de passe"
                      value={emailForm.confirmPassword}
                      onChange={(e) => setEmailForm(f => ({ ...f, confirmPassword: e.target.value }))}
                      className="bg-[#0E0D0B] border-warm text-[#F5F4F1] placeholder:text-[#F5F4F1]/30 py-5 rounded-lg"
                    />
                    {emailForm.confirmPassword && emailForm.password !== emailForm.confirmPassword && (
                      <p className="text-red-400 text-xs mt-1">Les mots de passe ne correspondent pas</p>
                    )}
                  </div>
                </div>

                {/* CGU checkbox */}
                <label className="flex items-start gap-2 cursor-pointer text-xs text-[#F5F4F1]/50 mt-4">
                  <input
                    type="checkbox"
                    checked={cguAccepted}
                    onChange={(e) => setCguAccepted(e.target.checked)}
                    className="mt-0.5 w-3.5 h-3.5 accent-[#00E5FF] flex-shrink-0"
                  />
                  <span>
                    J'accepte les{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#00E5FF] underline hover:text-[#00E5FF]/80" onClick={e => e.stopPropagation()}>Conditions Générales d'Utilisation</a>
                    {" "}et la{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#00E5FF] underline hover:text-[#00E5FF]/80" onClick={e => e.stopPropagation()}>Politique de confidentialité</a>
                    . Je reconnais que The Clip Deal est un outil de mise en relation et n'est pas responsable des contenus publiés par les clippers.
                  </span>
                </label>

                {/* Méthodes de connexion */}
                {(() => {
                  const passwordValid = pwdValid(emailForm.password) && emailForm.password === emailForm.confirmPassword;
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
                      <div className="flex-1 h-px bg-[#F5F4F1]/10" />
                      <span className="text-xs text-[#F5F4F1]/30">ou</span>
                      <div className="flex-1 h-px bg-[#F5F4F1]/10" />
                    </div>

                    {/* Option Email avec code */}
                    <div className="space-y-3">
                      <Input
                        type="email"
                        placeholder="votre@email.com"
                        value={emailForm.email}
                        onChange={(e) => setEmailForm(f => ({ ...f, email: e.target.value }))}
                        className="bg-[#0E0D0B] border-warm text-[#F5F4F1] placeholder:text-[#F5F4F1]/30 py-5 rounded-lg"
                      />
                      <Button
                        onClick={handleEmailRegister}
                        disabled={emailLoading || !emailForm.email}
                        className="w-full bg-[#00E5FF] hover:bg-[#00d4eb] text-black font-semibold py-5 rounded-lg"
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        {emailLoading ? "Envoi en cours..." : "Continuer avec Email"}
                      </Button>
                    </div>
                  </div>
                  ) : (
                  <div className="w-full py-3.5 rounded-lg text-center text-xs text-[#F5F4F1]/40 border border-warm bg-[#0E0D0B] mt-4">
                    {!isFormValid() ? "Remplissez tous les champs pour continuer" :
                     !cguAccepted ? "Acceptez les CGU pour continuer" :
                     !pwdValid(emailForm.password) ? "Mot de passe non conforme (voir règles ci-dessus)" :
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
                      className="p-2 rounded-md hover:bg-[#262320] text-[#F5F4F1]/55 hover:text-[#F5F4F1] transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="w-9 h-9 rounded-lg bg-[#00E5FF]/10 border border-[#00E5FF]/30 flex items-center justify-center">
                      <Mail className="w-4.5 h-4.5 text-[#00E5FF]" />
                    </div>
                    <DialogTitle className="font-display font-semibold text-lg text-[#F5F4F1] tracking-tight">
                      Vérification email
                    </DialogTitle>
                  </div>
                </DialogHeader>
                <div className="mt-3 ml-14 mb-6">
                  <p className="text-[#F5F4F1]/55 text-xs">
                    Un code à 6 chiffres a été envoyé à
                  </p>
                  <p className="text-[#F5F4F1] font-medium text-sm mt-0.5">{emailPending}</p>
                  <p className="text-[#F5F4F1]/35 text-xs mt-2">Vérifiez aussi votre dossier Spam.</p>
                </div>
                <div className="space-y-3">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="_ _ _ _ _ _"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="bg-[#0E0D0B] border-warm text-[#F5F4F1] placeholder:text-[#F5F4F1]/20 text-center text-3xl tracking-[1rem] font-mono h-16 rounded-lg"
                  />
                  <Button
                    onClick={handleVerifyCode}
                    disabled={emailLoading || verificationCode.length !== 6}
                    className="w-full bg-[#00E5FF] hover:bg-[#00d4eb] text-black font-semibold py-5 rounded-lg"
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
                    className="w-full text-center text-xs text-[#F5F4F1]/45 hover:text-[#F5F4F1]/70 transition-colors py-1"
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
      <Dialog open={showLoginModal} onOpenChange={(o) => { setShowLoginModal(o); if (!o) { setLoginView("login"); setForgotEmail(""); } }}>
        <DialogContent className="bg-[#1C1A17] border-warm max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-lg bg-[#00E5FF]/10 border border-[#00E5FF]/30 flex items-center justify-center">
                <LogIn className="w-4.5 h-4.5 text-[#00E5FF]" />
              </div>
              <DialogTitle className="font-display font-semibold text-lg text-[#F5F4F1] tracking-tight">
                Se connecter
              </DialogTitle>
            </div>
          </DialogHeader>
          {loginView === "forgot_sent" ? (
            /* ── Email envoyé ── */
            <div className="mt-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-[#39FF14]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-[#F5F4F1] font-medium">Email envoyé !</p>
              <p className="text-[#F5F4F1]/40 text-sm">Vérifie ta boîte <span className="text-[#F5F4F1]/75">{forgotEmail}</span> (et les spams). Le lien expire dans 1 heure.</p>
              <button onClick={() => { setLoginView("login"); setForgotEmail(""); }} className="text-sm text-[#00E5FF] hover:underline">
                Retour à la connexion
              </button>
            </div>
          ) : loginView === "forgot" ? (
            /* ── Mot de passe oublié ── */
            <div className="space-y-3 mt-4">
              <p className="text-[#F5F4F1]/55 text-sm">Entre ton email — tu recevras un lien pour choisir un nouveau mot de passe.</p>
              <div>
                <label className="block text-xs font-medium text-[#F5F4F1]/70 mb-1.5 tracking-wide">Email</label>
                <Input
                  type="email"
                  placeholder="votre@email.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
                  className="bg-[#0E0D0B] border-warm text-[#F5F4F1] placeholder:text-[#F5F4F1]/30 py-5 rounded-lg"
                  autoFocus
                />
              </div>
              <Button
                onClick={handleForgotPassword}
                disabled={forgotLoading || !forgotEmail.trim()}
                className="w-full bg-[#f0c040] text-black hover:bg-[#e6b630] font-semibold py-5 rounded-lg"
              >
                {forgotLoading ? "Envoi..." : "Envoyer le lien"}
              </Button>
              <button onClick={() => setLoginView("login")} className="w-full text-center text-xs text-[#F5F4F1]/45 hover:text-[#F5F4F1]/70 transition-colors py-1">
                ← Retour à la connexion
              </button>
            </div>
          ) : (
          /* ── Connexion normale ── */
          <div className="space-y-3 mt-4">
            <div>
              <label className="block text-xs font-medium text-[#F5F4F1]/70 mb-1.5 tracking-wide">Email</label>
              <Input
                type="email"
                placeholder="votre@email.com"
                value={loginForm.email}
                onChange={(e) => setLoginForm(f => ({ ...f, email: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="bg-[#0E0D0B] border-warm text-[#F5F4F1] placeholder:text-[#F5F4F1]/30 py-5 rounded-lg"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[#F5F4F1]/70 tracking-wide">Mot de passe</label>
                <button
                  onClick={() => { setForgotEmail(loginForm.email); setLoginView("forgot"); }}
                  className="text-xs text-[#F5F4F1]/40 hover:text-[#00E5FF] transition-colors"
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <Input
                type="password"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={(e) => setLoginForm(f => ({ ...f, password: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="bg-[#0E0D0B] border-warm text-[#F5F4F1] placeholder:text-[#F5F4F1]/30 py-5 rounded-lg"
              />
            </div>
            <Button
              onClick={handleLogin}
              disabled={loginLoading || !loginForm.email || !loginForm.password}
              className="w-full bg-[#F5F4F1] text-[#0E0D0B] hover:bg-white font-semibold py-5 mt-2 rounded-lg shadow-sm"
            >
              {loginLoading ? "Connexion..." : "Se connecter"}
            </Button>
            <p className="text-center text-sm text-[#F5F4F1]/45">
              Pas encore de compte ?{" "}
              <button
                onClick={() => { setShowLoginModal(false); handleGetStarted(); }}
                className="text-[#00E5FF] hover:underline"
              >
                Créer un compte
              </button>
            </p>
          </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

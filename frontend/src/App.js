import { useEffect, useRef, useState, createContext, useContext, useCallback } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "@/App.css";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { Toaster, toast } from "sonner";

// Pages
import LandingPage from "./pages/LandingPage";
import AuthCallback from "./pages/AuthCallback";
import RoleSelection from "./pages/RoleSelection";
import ClipperDashboard from "./pages/ClipperDashboard";
import AgencyDashboard from "./pages/AgencyDashboard";
import ManagerDashboard from "./pages/ManagerDashboard";
import ClientDashboard from "./pages/ClientDashboard";
import JoinCampaign from "./pages/JoinCampaign";
import AdminDashboard from "./pages/AdminDashboard";
import ClaimPage from "./pages/ClaimPage";
import TermsPage from "./pages/TermsPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
export const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [emailNotVerified, setEmailNotVerified] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const bearer = localStorage.getItem("preview_bearer");
      const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
      const response = await fetch(`${API}/auth/me`, {
        credentials: "include",
        headers,
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setEmailNotVerified(false);
      } else if (response.status === 403) {
        const data = await response.json().catch(() => ({}));
        if (data.detail === "email_not_verified") {
          setEmailNotVerified(true);
        }
        setUser(null);
      } else {
        setUser(null);
        setEmailNotVerified(false);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // CRITICAL: If returning from OAuth callback, skip the /me check.
    // AuthCallback will exchange the session_id and establish the session first.
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    // Admin preview: if URL has ?session=TOKEN, inject it as session cookie via API
    const params = new URLSearchParams(window.location.search);
    const previewSession = params.get("session");
    const isAdminPreview = params.get("admin_preview") === "1";
    if (isAdminPreview && previewSession) {
      // Sauvegarde le bearer + monkey-patch window.fetch pour injecter Bearer dans TOUS les fetch
      // Sinon les fetch suivants utilisent les cookies (session admin) au lieu du bearer impersonate
      sessionStorage.setItem("preview_bearer", previewSession);
      try {
        if (!window.__originalFetch) {
          window.__originalFetch = window.fetch.bind(window);
          window.fetch = function (url, opts) {
            const b = sessionStorage.getItem("preview_bearer");
            if (b) {
              opts = opts || {};
              opts.headers = { ...(opts.headers || {}), Authorization: `Bearer ${b}` };
            }
            return window.__originalFetch(url, opts);
          };
        }
      } catch (e) { console.warn("Monkey-patch fetch failed:", e); }
      // Use Bearer token auth (server already supports it)
      fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${previewSession}` },
        credentials: "include",
      }).then(async (r) => {
        if (r.ok) {
          const userData = await r.json();
          setUser(userData);
          // Store for subsequent requests (kept for retro-compat)
          localStorage.setItem("preview_bearer", previewSession);
        }
      }).finally(() => setLoading(false));
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const login = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const logout = async () => {
    try {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.error("Logout error:", e);
    }
    setUser(null);
  };

  const selectRole = async (role, displayName) => {
    try {
      const response = await fetch(`${API}/auth/select-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role, display_name: displayName }),
      });
      if (response.ok) {
        const updatedUser = await response.json();
        setUser(updatedUser);
        return updatedUser;
      }
    } catch (error) {
      console.error("Role selection failed:", error);
      toast.error("Failed to select role");
    }
    return null;
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout, selectRole, checkAuth, emailNotVerified, setEmailNotVerified }}>
      {children}
    </AuthContext.Provider>
  );
};

// Protected Route
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return children;
};

// Role-based Route
const RoleRoute = ({ allowedRoles, children }) => {
  const { user } = useAuth();
  
  if (!user?.role) {
    return <Navigate to="/select-role" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={`/${user.role}`} replace />;
  }

  return children;
};

// Dashboard Router
const DashboardRouter = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      if (!user.role) {
        navigate("/select-role");
      } else {
        navigate(`/${user.role}`);
      }
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return null;
};

// Email not verified screen
const EmailVerificationGate = () => {
  const { setEmailNotVerified } = useAuth();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async () => {
    if (code.length !== 6 || !email) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.toLowerCase().trim(), code }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Code invalide");
      // Reload page — user is now verified
      window.location.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) { toast.error("Entrez votre adresse email d'abord"); return; }
    setResending(true);
    try {
      const r = await fetch(`${API}/auth/resend-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Erreur lors du renvoi");
      setCode("");
      toast.success("Nouveau code envoyé — vérifiez vos mails (et spams)");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[#121212] border border-white/10 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#00E5FF]/20 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">✉️</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Vérifiez votre email</h1>
        <p className="text-white/50 text-sm mb-2">
          Un code à 6 chiffres a été envoyé à votre adresse email.
        </p>
        <p className="text-white/30 text-xs mb-8">Vérifiez aussi votre dossier Spam.</p>
        <div className="space-y-4 text-left">
          <div>
            <label className="block text-sm text-white/60 mb-2">Votre email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.com"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-[#00E5FF]/50"
            />
          </div>
          <div>
            <label className="block text-sm text-white/60 mb-2">Code à 6 chiffres</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={e => e.key === "Enter" && handleVerify()}
              placeholder="_ _ _ _ _ _"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/20 text-center text-2xl tracking-widest font-mono outline-none focus:border-[#00E5FF]/50"
            />
          </div>
          <button
            onClick={handleVerify}
            disabled={loading || code.length !== 6 || !email}
            className="w-full py-3 rounded-xl bg-[#00E5FF] text-black font-semibold hover:bg-[#00E5FF]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? "Vérification..." : "Confirmer mon compte"}
          </button>
          <button
            onClick={handleResend}
            disabled={resending || !email}
            className="w-full py-2 text-sm text-white/40 hover:text-white/70 disabled:opacity-30 transition-colors"
          >
            {resending ? "Envoi en cours..." : "Renvoyer un nouveau code"}
          </button>
        </div>
        <button
          onClick={() => { setEmailNotVerified(false); window.location.href = "/"; }}
          className="mt-4 text-sm text-white/30 hover:text-white/60 transition-colors"
        >
          Retour à l'accueil
        </button>
      </div>
    </div>
  );
};

// App Router with session_id detection
const AppRouter = () => {
  const { emailNotVerified } = useAuth();
  const location = useLocation();

  // Check URL fragment for session_id synchronously during render
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }

  // Block access until email verified
  if (emailNotVerified) {
    return <EmailVerificationGate />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <DashboardRouter />
        </ProtectedRoute>
      } />
      <Route path="/select-role" element={
        <ProtectedRoute>
          <RoleSelection />
        </ProtectedRoute>
      } />
      <Route path="/join/:role/:token" element={<JoinCampaign />} />
      
      {/* Clipper Routes */}
      <Route path="/clipper/*" element={
        <ProtectedRoute>
          <RoleRoute allowedRoles={["clipper"]}>
            <ClipperDashboard />
          </RoleRoute>
        </ProtectedRoute>
      } />
      
      {/* Agency Routes */}
      <Route path="/agency/*" element={
        <ProtectedRoute>
          <RoleRoute allowedRoles={["agency"]}>
            <AgencyDashboard />
          </RoleRoute>
        </ProtectedRoute>
      } />
      
      {/* Manager Routes */}
      <Route path="/manager/*" element={
        <ProtectedRoute>
          <RoleRoute allowedRoles={["manager"]}>
            <ManagerDashboard />
          </RoleRoute>
        </ProtectedRoute>
      } />
      
      {/* Client Routes */}
      <Route path="/client/*" element={
        <ProtectedRoute>
          <RoleRoute allowedRoles={["client"]}>
            <ClientDashboard />
          </RoleRoute>
        </ProtectedRoute>
      } />
      
      {/* Admin — protected by code only, no auth required */}
      <Route path="/admin" element={<AdminDashboard />} />

      {/* Legal — public */}
      <Route path="/cgu" element={<TermsPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/claim/agency/:token" element={<ClaimPage type="agency" />} />
      <Route path="/claim/clipper/:token" element={<ClaimPage type="clipper" />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

// ─── Admin Right-Click Context Menu ────────────────────────────────────────
// Active in all dashboards when admin_code is in localStorage (preview mode)

const AdminContextMenu = () => {
  const [menu, setMenu] = useState(null); // { x, y, campaignId, videoId, label }
  const menuRef = useRef(null);

  useEffect(() => {
    const handleContextMenu = (e) => {
      // Only active in admin preview mode
      if (!localStorage.getItem("admin_code")) return;
      if (window.location.pathname === "/admin") return;

      // Walk up DOM to find a campaign or video element
      let el = e.target;
      let campaignId = null;
      let videoId = null;
      let label = "";

      while (el && el !== document.body) {
        if (el.dataset?.campaignId) { campaignId = el.dataset.campaignId; label = el.dataset.campaignName || "cette campagne"; break; }
        if (el.dataset?.videoId) { videoId = el.dataset.videoId; label = "cette vidéo"; break; }
        el = el.parentElement;
      }

      if (!campaignId && !videoId) return;

      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, campaignId, videoId, label });
    };

    const handleClick = () => setMenu(null);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("click", handleClick);
    };
  }, []);

  const handleDelete = async () => {
    const adminCode = localStorage.getItem("admin_code");
    const headers = { "Content-Type": "application/json", "X-Admin-Code": adminCode };
    try {
      if (menu.campaignId) {
        const r = await fetch(`${API}/admin/campaigns/${menu.campaignId}`, { method: "DELETE", headers, credentials: "include" });
        if (!r.ok) throw new Error("Erreur");
        toast.success("Campagne supprimée + message envoyé à l'agence");
      } else if (menu.videoId) {
        const r = await fetch(`${API}/admin/videos/${menu.videoId}`, { method: "DELETE", headers, credentials: "include" });
        if (!r.ok) throw new Error("Erreur");
        toast.success("Vidéo supprimée + message envoyé au clipper");
      }
    } catch (e) {
      toast.error("Échec de la suppression");
    }
    setMenu(null);
  };

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      style={{ position: "fixed", top: menu.y, left: menu.x, zIndex: 9999 }}
      className="bg-[#1a1a1a] border border-white/20 rounded-lg shadow-2xl py-1 min-w-48"
    >
      <div className="px-3 py-2 text-xs text-white/30 border-b border-white/10">
        🛡️ Admin — Modération
      </div>
      <button
        onClick={handleDelete}
        className="w-full text-left px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
      >
        <span>🗑️</span>
        Supprimer {menu.label}
      </button>
      <div className="px-3 py-1.5 text-xs text-white/20">
        Message auto envoyé au créateur
      </div>
    </div>
  );
};

// ─── Security: disable right-click on images, block common copy shortcuts ─────
function useSecurityGuard() {
  useEffect(() => {
    // Disable right-click on images only
    const blockImgCtx = (e) => {
      if (e.target.tagName === "IMG") e.preventDefault();
    };
    document.addEventListener("contextmenu", blockImgCtx);
    return () => document.removeEventListener("contextmenu", blockImgCtx);
  }, []);
}

function App() {
  useSecurityGuard();
  return (
    <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID || ""}>
      <div className="min-h-screen bg-[#0A0A0A]">
        <BrowserRouter>
          <AuthProvider>
            <AppRouter />
            <AdminContextMenu />
            <Toaster
              position="top-right"
              theme="dark"
              toastOptions={{
                style: {
                  background: '#121212',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                },
              }}
            />
          </AuthProvider>
        </BrowserRouter>
      </div>
    </GoogleOAuthProvider>
  );
}

export default App;

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
      } else {
        setUser(null);
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
      // Use Bearer token auth (server already supports it)
      fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${previewSession}` },
        credentials: "include",
      }).then(async (r) => {
        if (r.ok) {
          const userData = await r.json();
          setUser(userData);
          // Store for subsequent requests
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
    <AuthContext.Provider value={{ user, setUser, loading, login, logout, selectRole, checkAuth }}>
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

// App Router with session_id detection
const AppRouter = () => {
  const location = useLocation();

  // Check URL fragment for session_id synchronously during render
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
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

function App() {
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

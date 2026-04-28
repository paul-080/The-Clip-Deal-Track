import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, ChevronDown, ChevronRight, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

export default function Sidebar({ items, accentColor, role }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [expandedItems, setExpandedItems] = useState({});
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll when drawer open on mobile
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const toggleExpand = (id) => {
    setExpandedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const isActive = (path) => location.pathname === path;
  const isParentActive = (item) => {
    if (isActive(item.path)) return true;
    if (item.children) {
      return item.children.some((child) => isActive(child.path));
    }
    return false;
  };

  const renderItem = (item, depth = 0, itemIndex = 0) => {
    if (item.type === "divider") {
      return <div key={`divider-${itemIndex}`} className="h-px bg-white/10 my-3" />;
    }

    if (item.type === "section") {
      return (
        <div key={item.label} className="px-4 py-2 text-[10px] text-white/35 uppercase tracking-widest font-medium">
          {item.label}
        </div>
      );
    }

    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems[item.id] ?? isParentActive(item);
    const active = isActive(item.path);

    const itemBadge = item.badge || 0;
    const childrenBadgeTotal = hasChildren
      ? item.children.reduce((sum, c) => sum + (c.badge || 0), 0)
      : 0;
    const totalBadge = itemBadge + (isExpanded ? 0 : childrenBadgeTotal);

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleExpand(item.id);
            }
            navigate(item.path);
          }}
          className={`
            w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left
            transition-all duration-150 relative
            ${depth > 0 ? "ml-3 pl-5" : ""}
            ${active ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"}
          `}
          style={{
            borderLeft: active ? `2px solid ${accentColor}` : depth > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
          }}
          data-testid={`sidebar-${item.id}`}
        >
          <item.icon
            className="w-[18px] h-[18px] flex-shrink-0"
            style={{ color: active ? accentColor : "rgba(255,255,255,0.55)" }}
          />
          <span
            className={`flex-1 truncate text-[13px] ${
              active ? "text-white font-medium" : "text-white/70"
            }`}
          >
            {item.label}
          </span>
          {totalBadge > 0 && (
            <span
              className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1"
              style={{ backgroundColor: accentColor }}
            >
              {totalBadge > 99 ? "99+" : totalBadge}
            </span>
          )}
          {hasChildren && (
            <span className="text-white/40 ml-1">
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </span>
          )}
        </button>

        {hasChildren && isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {item.children.map((child) => renderItem(child, depth + 1))}
          </motion.div>
        )}
      </div>
    );
  };

  const roleLabels = {
    clipper: "Clippeur",
    agency: "Agence",
    manager: "Manager",
    client: "Client",
  };

  // Sidebar content (réutilisé pour desktop fixed + mobile drawer)
  const sidebarContent = (
    <>
      {/* Header */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <img
            src={process.env.PUBLIC_URL + "/logo.svg"}
            alt="The Clip Deal Track"
            className="w-9 h-9 rounded-lg flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm truncate tracking-tight">
              The Clip Deal Track
            </p>
            <p className="text-[11px] text-white/40 truncate">{roleLabels[role]}</p>
          </div>
          {/* Bouton fermeture mobile */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-lg hover:bg-white/5 text-white/50"
            aria-label="Fermer le menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {items.map((item, idx) => renderItem(item, 0, idx))}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/50 text-xs font-medium">
                {user?.name?.[0]?.toUpperCase() || "U"}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-white font-medium truncate">
              {user?.display_name || user?.name}
            </p>
            <p className="text-[10px] text-white/40 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
            data-testid="sidebar-logout"
            aria-label="Se déconnecter"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ── BOUTON HAMBURGER MOBILE (fixe en haut à gauche) ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 w-10 h-10 rounded-xl bg-[#1a1a1a]/95 backdrop-blur border border-white/10 flex items-center justify-center text-white/80 shadow-lg"
        aria-label="Ouvrir le menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ── SIDEBAR DESKTOP (fixe à gauche, masqué sur mobile) ── */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-60 bg-[#0d0d0d] border-r border-white/5 flex-col z-50">
        {sidebarContent}
      </aside>

      {/* ── DRAWER MOBILE (overlay + panneau slide-in) ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setMobileOpen(false)}
            />
            {/* Panel */}
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
              className="md:hidden fixed left-0 top-0 bottom-0 w-[85vw] max-w-[300px] bg-[#0d0d0d] border-r border-white/8 flex flex-col z-[60] shadow-2xl"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

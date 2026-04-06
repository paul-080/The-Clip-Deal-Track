import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import { motion } from "framer-motion";
import { Play, LogOut, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

export default function Sidebar({ items, accentColor, role }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [expandedItems, setExpandedItems] = useState({});

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

  const renderItem = (item, depth = 0) => {
    if (item.type === "divider") {
      return <div key={`divider-${Math.random()}`} className="h-px bg-white/10 my-4" />;
    }

    if (item.type === "section") {
      return (
        <div key={item.label} className="px-4 py-2 text-xs text-white/40 uppercase tracking-wider font-medium">
          {item.label}
        </div>
      );
    }

    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems[item.id] ?? isParentActive(item);
    const active = isActive(item.path);

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
            w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left
            transition-colors duration-200 relative
            ${depth > 0 ? "ml-4 pl-6" : ""}
            ${active ? "bg-white/10" : "hover:bg-white/5"}
          `}
          style={{
            borderLeft: active ? `3px solid ${accentColor}` : depth > 0 ? "1px solid rgba(255,255,255,0.1)" : "none",
          }}
          data-testid={`sidebar-${item.id}`}
        >
          {item.notification && (
            <span className="notification-dot" />
          )}
          <item.icon
            className="w-5 h-5 flex-shrink-0"
            style={{ color: active ? accentColor : "rgba(255,255,255,0.6)" }}
          />
          <span
            className={`flex-1 truncate text-sm ${
              active ? "text-white font-medium" : "text-white/70"
            }`}
          >
            {item.label}
          </span>
          {hasChildren && (
            <span className="text-white/40">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
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

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#0d0d0d] border-r border-white/5 flex flex-col z-50">
      {/* Header */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${accentColor}20` }}
          >
            <Play className="w-5 h-5 fill-current" style={{ color: accentColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-sm truncate">
              The Clip Deal Track
            </p>
            <p className="text-xs text-white/40 truncate">{roleLabels[role]}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {items.map((item) => renderItem(item))}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/50 text-sm font-medium">
                {user?.name?.[0]?.toUpperCase() || "U"}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium truncate">
              {user?.display_name || user?.name}
            </p>
            <p className="text-xs text-white/40 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
            data-testid="sidebar-logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

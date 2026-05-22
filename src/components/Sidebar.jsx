// src/components/Sidebar.jsx
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Sidebar({ isOpen, onClose, activePage, onNavigate }) {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = userProfile?.role === "admin";

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  function handleNavClick(page, path) {
    if (onNavigate) onNavigate(page);
    if (path) navigate(path);
    onClose();
  }

  return (
    <>
      {isOpen && (
        <div className="sidebar-overlay" onClick={onClose} />
      )}
      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        <button className="sidebar-close-btn" onClick={onClose}>✕</button>
        <div className="sidebar-brand">
          <span className="brand-icon">⏱</span>
          <span>MiniHCM Time Tracking </span>
        </div>
        <nav className="sidebar-nav">
          {/* ── Employee nav ── */}
          {!isAdmin && (
            <>
              <a
                className={`nav-link ${activePage === "dashboard" ? "active" : ""}`}
                href="#"
                onClick={(e) => { e.preventDefault(); handleNavClick("dashboard", "/dashboard"); }}
              >
                📊 Dashboard
              </a>
              <a
                className={`nav-link ${activePage === "attendance-history" ? "active" : ""}`}
                href="#"
                onClick={(e) => { e.preventDefault(); handleNavClick("attendance-history"); }}
              >
                📋 Attendance History
              </a>
            </>
          )}

          {/* ── Admin nav ── */}
          {isAdmin && (
            <>
              <a
                className={`nav-link ${activePage === "dashboard" ? "active" : ""}`}
                href="#"
                onClick={(e) => { e.preventDefault(); handleNavClick("dashboard", "/dashboard"); }}
              >
                📊 Dashboard
              </a>
              <a
                className={`nav-link ${activePage === "admin" ? "active" : ""}`}
                href="#"
                onClick={(e) => { e.preventDefault(); handleNavClick("admin", "/admin"); }}
              >
                🔧 Admin Panel
              </a>
              <a
                className={`nav-link ${activePage === "employee-list" ? "active" : ""}`}
                href="#"
                onClick={(e) => { e.preventDefault(); handleNavClick("employee-list", "/admin?tab=employees"); }}
              >
                👥 Employee List
              </a>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{userProfile?.name?.[0]?.toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div className="user-name">{userProfile?.name}</div>
              <div className="user-role">{userProfile?.role}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>
    </>
  );
}

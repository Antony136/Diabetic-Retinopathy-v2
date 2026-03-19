import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { APP_NAME } from "../../utils/constants";
import { clearAuthToken, getAuthToken } from "../../services/authStorage";
import { listNotifications } from "../../services/notifications";
import { getAppSettings } from "../../services/appSettings";
import { getRoleFromToken } from "../../services/jwt";

export default function Navbar() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const role = getRoleFromToken(getAuthToken());

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const alertSettings = getAppSettings();
        const items = await listNotifications();
        if (!active) return;
        const filtered = items.filter((n) => {
          if (n.type === "HIGH_RISK" || n.type === "FOLLOW_UP" || n.type === "MANUAL_REVIEW")
            return alertSettings.notificationsHighRisk;
          if (n.type === "DAILY_SUMMARY") return alertSettings.notificationsDailySummary;
          return true;
        });
        setUnread(filtered.filter((n) => !n.is_read).length);
      } catch {
        // ignore
      }
    };

    load();
    const id = window.setInterval(load, 30000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-[60] bg-transparent font-headline font-semibold tracking-tight">
      <div className="flex justify-between items-center w-full px-8 py-4">
        <div 
          className="text-xl font-bold text-on-surface cursor-pointer"
          onClick={() => navigate(role === "admin" ? "/admin/overview" : "/")}
        >
          {APP_NAME}
        </div>
        <div className="flex items-center gap-6">
          <button
            onClick={() => {
              clearAuthToken();
              navigate("/login", { replace: true });
            }}
            className="text-on-surface-variant hover:text-primary transition-colors scale-95 active:scale-90 transition-transform flex items-center justify-center"
            title="Logout"
            aria-label="Logout"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
          {role !== "admin" && (
            <>
              <button
                onClick={() => navigate("/notifications")}
                className="text-on-surface-variant hover:text-primary transition-colors scale-95 active:scale-90 transition-transform flex items-center justify-center"
              >
                <span className="material-symbols-outlined relative">
                  notifications
                  {unread > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1 rounded-full bg-primary text-on-primary text-[10px] leading-4 text-center font-bold">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
              </button>
              <button
                onClick={() => navigate("/profile")}
                className="text-on-surface-variant hover:text-primary transition-colors scale-95 active:scale-90 transition-transform flex items-center justify-center"
              >
                <span className="material-symbols-outlined">account_circle</span>
              </button>
            </>
          )}
          {role === "admin" && (
            <>
              <button
                onClick={() => navigate("/admin/notifications")}
                className="text-on-surface-variant hover:text-primary transition-colors scale-95 active:scale-90 transition-transform flex items-center justify-center"
                title="Notifications"
                aria-label="Notifications"
              >
                <span className="material-symbols-outlined relative">
                  notifications
                  {unread > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1 rounded-full bg-primary text-on-primary text-[10px] leading-4 text-center font-bold">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
              </button>
              <button
                onClick={() => navigate("/admin/settings")}
                className="text-on-surface-variant hover:text-primary transition-colors scale-95 active:scale-90 transition-transform flex items-center justify-center"
                title="Settings"
                aria-label="Settings"
              >
                <span className="material-symbols-outlined">settings</span>
              </button>
              <button
                onClick={() => navigate("/admin/profile")}
                className="text-on-surface-variant hover:text-primary transition-colors scale-95 active:scale-90 transition-transform flex items-center justify-center"
                title="Profile"
                aria-label="Profile"
              >
                <span className="material-symbols-outlined">account_circle</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

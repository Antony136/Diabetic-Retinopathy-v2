import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { APP_NAME } from "../../utils/constants";
import { clearAuthToken, getAuthToken } from "../../services/authStorage";
import { listNotifications } from "../../services/notifications";
import { getAppSettings } from "../../services/appSettings";
import { getRoleFromToken } from "../../services/jwt";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { runSync } from "../../services/sync";

export default function Navbar() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [useCloudBackend, setUseCloudBackend] = useState(() => localStorage.getItem("retina_use_cloud_backend") === "1");
  const role = getRoleFromToken(getAuthToken());
  const online = useOnlineStatus();
  const [backendStatus, setBackendStatus] = useState<{ ready: boolean; port?: number } | null>(null);

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

  useEffect(() => {
    // Auto-sync when connectivity returns (desktop/offline-first mode).
    if (!online) return;
    if (!window.__LOCAL_API_BASE__) return; // avoid syncing on web deploy (cloud-only)
    if (!getAuthToken()) return;

    setSyncError(null);
    setSyncBusy(true);
    runSync()
      .catch((e) => setSyncError(String(e?.message || e)))
      .finally(() => setSyncBusy(false));
  }, [online]);

  useEffect(() => {
    const loadBackendStatus = async () => {
      if (!window.electronAPI?.backendStatus) {
        setBackendStatus(null);
        return;
      }
      try {
        const status = await window.electronAPI.backendStatus();
        setBackendStatus(status);
      } catch {
        setBackendStatus({ ready: false });
      }
    };

    loadBackendStatus();
    const id = window.setInterval(loadBackendStatus, 5000);
    return () => window.clearInterval(id);
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
          {!online && (
            <div className="px-3 py-1 rounded-full bg-error-container text-on-error-container text-xs font-bold tracking-wide">
              Offline Mode
            </div>
          )}
          {backendStatus && !backendStatus.ready && (
            <button
              onClick={async () => {
                if (!window.electronAPI?.backendRestart) return;
                setSyncError(null);
                setSyncBusy(true);
                try {
                  const result = await window.electronAPI.backendRestart();
                  if (!result.ok) setSyncError(result.message || "Backend restart failed");
                } catch (e: any) {
                  setSyncError(String(e?.message || e));
                } finally {
                  setSyncBusy(false);
                }
              }}
              disabled={syncBusy}
              className="px-2 py-1 rounded bg-warning-container text-warning text-xs font-bold"
              title="Attempt to restart local backend"
            >
              Restart backend
            </button>
          )}
          {window.__LOCAL_API_BASE__ && (
            <button
              onClick={() => {
                const next = !useCloudBackend;
                setUseCloudBackend(next);
                localStorage.setItem("retina_use_cloud_backend", next ? "1" : "0");
              }}
              disabled={!online}
              className="text-on-surface-variant hover:text-primary transition-colors scale-95 active:scale-90 transition-transform flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              title={useCloudBackend ? "Using cloud backend (online)" : "Using local backend (offline-first)"}
              aria-label="Toggle cloud backend"
            >
              <span className="material-symbols-outlined">{useCloudBackend ? "cloud" : "cloud_off"}</span>
            </button>
          )}
          {window.__LOCAL_API_BASE__ && (
            <button
              onClick={async () => {
                try {
                  setSyncError(null);
                  setSyncBusy(true);
                  await runSync();
                } catch (e: any) {
                  setSyncError(String(e?.message || e));
                } finally {
                  setSyncBusy(false);
                }
              }}
              disabled={syncBusy || !online}
              className="text-on-surface-variant hover:text-primary transition-colors scale-95 active:scale-90 transition-transform flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              title={syncError ? `Sync error: ${syncError}` : syncBusy ? "Syncing…" : "Sync offline data"}
              aria-label="Sync"
            >
              <span className="material-symbols-outlined">{syncBusy ? "sync" : "sync"}</span>
            </button>
          )}
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

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { APP_NAME } from "../../utils/constants";
import { getAuthToken } from "../../services/authStorage";
import { logoutUser } from "../../services/auth";
import { listNotifications } from "../../services/notifications";
import { getAppSettings } from "../../services/appSettings";
import { getRoleFromToken } from "../../services/jwt";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { runSync, getSyncStatus } from "../../services/sync";
import type { SyncStatus } from "../../services/sync";
import { getLocalApiBaseUrl } from "../../services/apiBase";

export default function Navbar() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [useCloudBackend, setUseCloudBackend] = useState(() => localStorage.getItem("retina_use_cloud_backend") === "1");
  const role = getRoleFromToken(getAuthToken());
  const online = useOnlineStatus();
  const [backendStatus, setBackendStatus] = useState<{ ready: boolean; port?: number } | null>(null);
  const hasLocalBackend = Boolean(getLocalApiBaseUrl());

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
    const status = getSyncStatus();
    setSyncStatus(status.status);
  }, []);

  useEffect(() => {
    if (!online) return;
    if (!hasLocalBackend) return;
    if (!getAuthToken()) return;

    setSyncError(null);
    setSyncBusy(true);
    runSync()
      .then(() => {
        const status = getSyncStatus();
        setSyncStatus(status.status);
      })
      .catch((e) => {
        setSyncError(String(e?.message || e));
        const status = getSyncStatus();
        setSyncStatus(status.status);
      })
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
    <header className="fixed top-0 left-0 right-0 z-[60] bg-black/40 backdrop-blur-md border-b border-white/5 font-mono">
      <div className="flex justify-between items-center w-full px-8 py-4">
        {/* Logo - matching NEXUS template style */}
        <div
          className="text-lg font-bold text-white tracking-[0.3em] cursor-pointer hover:text-[#C87CFF] transition-colors duration-300 uppercase"
          onClick={() => navigate(role === "admin" ? "/admin/overview" : "/")}
        >
          {APP_NAME}
        </div>

        {/* Right side nav items */}
        <div className="flex items-center gap-5">
          {/* Status indicators */}
          {!online && (
            <div className="px-3 py-1 border border-red-500/30 text-red-400 text-[10px] font-mono tracking-widest uppercase">
              OFFLINE
            </div>
          )}
          {hasLocalBackend && (
            <div className="text-[10px] font-mono tracking-widest uppercase text-white/30">
              SYNC: {syncStatus === "synced" ? <span className="text-[#5efdba]">OK</span> : syncStatus === "failed" ? <span className="text-red-400">FAIL</span> : <span className="text-white/50">{syncStatus.toUpperCase()}</span>}
            </div>
          )}
          {backendStatus && !backendStatus.ready && (
            <button
              onClick={async () => {
                if (!window.electronAPI?.backendRestart) return;
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
              className="text-[10px] font-mono tracking-widest uppercase text-yellow-400/70 border border-yellow-400/20 px-2 py-1 hover:bg-yellow-400/5 transition-colors"
            >
              RESTART_BACKEND
            </button>
          )}
          {hasLocalBackend && (
            <button
              onClick={() => {
                const next = !useCloudBackend;
                setUseCloudBackend(next);
                localStorage.setItem("retina_use_cloud_backend", next ? "1" : "0");
              }}
              disabled={!online}
              className="text-white/30 hover:text-[#C87CFF] transition-colors duration-300 disabled:opacity-20"
              title={useCloudBackend ? "Using cloud backend" : "Using local backend"}
            >
              <span className="material-symbols-outlined text-lg">{useCloudBackend ? "cloud" : "cloud_off"}</span>
            </button>
          )}
          {hasLocalBackend && (
            <button
              onClick={async () => {
                try {
                  setSyncError(null);
                  setSyncBusy(true);
                  await runSync();
                  setSyncStatus(getSyncStatus().status);
                } catch (e: any) {
                  setSyncError(String(e?.message || e));
                  setSyncStatus(getSyncStatus().status);
                } finally {
                  setSyncBusy(false);
                }
              }}
              disabled={syncBusy || !online}
              className="text-white/30 hover:text-[#5efdba] transition-colors duration-300 disabled:opacity-20"
              title={syncError ? `Sync error: ${syncError}` : "Sync"}
            >
              <span className="material-symbols-outlined text-lg">sync</span>
            </button>
          )}

          {/* Logout */}
          <button
            onClick={async () => {
              try { await logoutUser(); } catch {}
              navigate("/login", { replace: true });
            }}
            className="text-white/30 hover:text-red-400 transition-colors duration-300"
            title="Logout"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
          </button>

          {/* Role-specific nav */}
          {role !== "admin" && (
            <>
              <button
                onClick={() => navigate("/notifications")}
                className="text-white/30 hover:text-[#C87CFF] transition-colors duration-300 relative"
              >
                <span className="material-symbols-outlined text-lg">notifications</span>
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-3 h-3 px-0.5 rounded-full bg-[#C87CFF] text-black text-[8px] leading-3 text-center font-bold">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
              <button
                onClick={() => navigate("/profile")}
                className="text-white/30 hover:text-[#C87CFF] transition-colors duration-300"
              >
                <span className="material-symbols-outlined text-lg">account_circle</span>
              </button>
            </>
          )}
          {role === "admin" && (
            <>
              <button
                onClick={() => navigate("/admin/notifications")}
                className="text-white/30 hover:text-[#C87CFF] transition-colors duration-300 relative"
              >
                <span className="material-symbols-outlined text-lg">notifications</span>
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-3 h-3 px-0.5 rounded-full bg-[#C87CFF] text-black text-[8px] leading-3 text-center font-bold">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
              <button
                onClick={() => navigate("/admin/settings")}
                className="text-white/30 hover:text-[#C87CFF] transition-colors duration-300"
              >
                <span className="material-symbols-outlined text-lg">settings</span>
              </button>
              <button
                onClick={() => navigate("/admin/profile")}
                className="text-white/30 hover:text-[#C87CFF] transition-colors duration-300"
              >
                <span className="material-symbols-outlined text-lg">account_circle</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

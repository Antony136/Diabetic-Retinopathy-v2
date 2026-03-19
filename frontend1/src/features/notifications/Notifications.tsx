import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { getAppSettings } from "../../services/appSettings";
import {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationResponse,
} from "../../services/notifications";

function formatRelative(iso: string) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 30) return "Just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}

function typeMeta(type: string) {
  if (type === "HIGH_RISK")
    return { dot: "bg-error", icon: "emergency", label: "High risk" };
  if (type === "FOLLOW_UP")
    return { dot: "bg-tertiary", icon: "event", label: "Follow-up" };
  if (type === "REPORT_READY")
    return { dot: "bg-primary", icon: "check_circle", label: "Report ready" };
  if (type === "NEW_PATIENT_ASSIGNED")
    return { dot: "bg-secondary", icon: "person_add", label: "New patient" };
  return { dot: "bg-outline/60", icon: "notifications", label: "Notification" };
}

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(() => getAppSettings());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.startsWith("retinamax_app_settings")) setSettings(getAppSettings());
    };
    const onFocus = () => setSettings(getAppSettings());
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (n.type === "HIGH_RISK" || n.type === "FOLLOW_UP") return settings.notificationsHighRisk;
      if (n.type === "DAILY_SUMMARY") return settings.notificationsDailySummary;
      return true;
    });
  }, [items, settings.notificationsDailySummary, settings.notificationsHighRisk]);

  const unreadCount = useMemo(() => filtered.filter((n) => !n.is_read).length, [filtered]);

  const load = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const data = await listNotifications();
      setItems(data);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to load notifications";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // ignore
    }
  }

  async function onOpen(item: NotificationResponse) {
    if (!item.is_read) {
      try {
        await markNotificationRead(item.id);
        setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
      } catch {
        // ignore
      }
    }

    if (item.report_id) return navigate("/records");
    if (item.patient_id) return navigate("/records");
  }

  async function onDelete(id: number) {
    try {
      await deleteNotification(id);
      setItems((prev) => prev.filter((n) => n.id !== id));
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-screen pt-24 pb-32 px-6 md:px-12 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">
            Notifications
          </h1>
          <p className="text-on-surface-variant text-lg">
            Event-based alerts linked to your patients and reports.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon="refresh" onClick={load} disabled={isLoading}>
            Refresh
          </Button>
          <Button variant="secondary" icon="done_all" onClick={onMarkAllRead} disabled={filtered.length === 0}>
            Mark all read
          </Button>
        </div>
      </div>

      <div className="mb-5 flex items-center justify-between">
        <div className="text-sm text-on-surface-variant">
          {isLoading ? "Loading…" : `${unreadCount} unread · ${filtered.length} total`}
        </div>
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="text-sm font-bold text-primary hover:opacity-90 transition-opacity"
        >
          Notification settings
        </button>
      </div>

      {!settings.notificationsHighRisk && (
        <Card className="p-4 mb-4 border border-tertiary/20 bg-tertiary-container/10">
          <div className="text-sm text-on-surface">
            High-risk alerts are disabled in Settings. Severe/Moderate alerts are hidden here.
          </div>
        </Card>
      )}

      {error && (
        <Card className="p-5 mb-6 border border-error/25 bg-error-container/20">
          <div className="text-error font-semibold">{error}</div>
          <div className="text-on-surface-variant text-sm mt-1">
            Make sure the backend is running and you&apos;re logged in.
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {!isLoading && filtered.length === 0 && !error && (
          <Card className="p-8 text-center text-on-surface-variant">
            No notifications yet. Create a patient or run a screening to generate alerts.
          </Card>
        )}

        {filtered.map((item) => {
          const meta = typeMeta(item.type);
          return (
            <Card
              key={item.id}
              onClick={() => onOpen(item)}
              className={`p-5 hover:bg-surface-container-high transition-all cursor-pointer group relative ${
                item.is_read ? "" : "ring-1 ring-primary/20"
              }`}
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex gap-4">
                  <div
                    className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      item.is_read ? "bg-transparent" : `${meta.dot} animate-pulse`
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-base text-on-surface-variant">
                        {meta.icon}
                      </span>
                      <div className="text-[11px] uppercase tracking-widest text-on-surface-variant font-bold">
                        {meta.label}
                      </div>
                    </div>
                    <h3
                      className={`font-headline font-bold mt-1 mb-1 ${
                        item.is_read ? "text-on-surface-variant" : "text-on-surface"
                      }`}
                    >
                      {item.title}
                    </h3>
                    <p className="text-on-surface-variant text-sm leading-relaxed mb-2">
                      {item.message}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-outline font-medium">
                      <span>{formatRelative(item.created_at)}</span>
                      <span className="opacity-70">•</span>
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="text-outline hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Delete notification"
                  title="Delete"
                >
                  <span className="material-symbols-outlined text-xl">delete</span>
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}

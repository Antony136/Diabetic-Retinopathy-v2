import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import api from "../../services/api";

type AdminUser = { id: number; name: string; email: string; role: string; is_active?: boolean };
type NotificationItem = {
  id: number;
  user_id: number;
  patient_id: number | null;
  report_id: number | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

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

export default function AdminNotifications() {
  const [doctors, setDoctors] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createType, setCreateType] = useState("SYSTEM_ALERT");
  const [createTitle, setCreateTitle] = useState("");
  const [createMessage, setCreateMessage] = useState("");
  const [createPatientId, setCreatePatientId] = useState<string>("");
  const [createReportId, setCreateReportId] = useState<string>("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadDoctors = useCallback(async () => {
    const res = await api.get<AdminUser[]>("/admin/doctors");
    setDoctors(res.data.filter((d) => d.role === "doctor"));
    if (!selectedUserId && res.data.length > 0) setSelectedUserId(res.data[0]!.id);
  }, [selectedUserId]);

  const loadNotifications = useCallback(async () => {
    if (!selectedUserId) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await api.get<NotificationItem[]>("/admin/notifications", { params: { user_id: selectedUserId } });
      setItems(res.data);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to load notifications";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedUserId]);

  useEffect(() => {
    loadDoctors().catch(() => undefined);
  }, [loadDoctors]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const unread = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  async function onCreate() {
    if (!selectedUserId) return;
    setCreateError(null);
    if (!createTitle.trim() || !createMessage.trim()) return setCreateError("Title and message are required.");
    setCreateLoading(true);
    try {
      const res = await api.post<NotificationItem>("/admin/notifications", {
        user_id: selectedUserId,
        type: createType,
        title: createTitle.trim(),
        message: createMessage.trim(),
        patient_id: createPatientId ? Number(createPatientId) : null,
        report_id: createReportId ? Number(createReportId) : null,
      });
      setItems((prev) => [res.data, ...prev]);
      setCreateTitle("");
      setCreateMessage("");
      setCreatePatientId("");
      setCreateReportId("");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to create notification";
      setCreateError(message);
    } finally {
      setCreateLoading(false);
    }
  }

  async function onReadAll() {
    if (!selectedUserId) return;
    await api.put("/admin/notifications/read-all", null, { params: { user_id: selectedUserId } });
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function onMarkRead(id: number) {
    const res = await api.put<NotificationItem>(`/admin/notifications/${id}/read`);
    setItems((prev) => prev.map((n) => (n.id === id ? res.data : n)));
  }

  async function onDelete(id: number) {
    await api.delete(`/admin/notifications/${id}`);
    setItems((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <main className="min-h-screen pt-24 pb-32 px-6 md:px-12 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">Notifications</h1>
          <p className="text-on-surface-variant text-lg">View and send notifications to doctors.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon="refresh" onClick={loadNotifications} disabled={isLoading || !selectedUserId}>
            Refresh
          </Button>
          <Button variant="secondary" icon="done_all" onClick={onReadAll} disabled={items.length === 0 || !selectedUserId}>
            Mark all read
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-4 p-6">
          <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-2">Target doctor</div>
          <select
            value={selectedUserId ?? ""}
            onChange={(e) => setSelectedUserId(Number(e.target.value))}
            className="w-full bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
          >
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} (#{d.id}){d.is_active === false ? " — disabled" : ""}
              </option>
            ))}
          </select>

          <div className="mt-6 text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-2">Create notification</div>
          <div className="space-y-3">
            <select
              value={createType}
              onChange={(e) => setCreateType(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
            >
              <option value="HIGH_RISK">HIGH_RISK</option>
              <option value="REPORT_READY">REPORT_READY</option>
              <option value="SYSTEM_ALERT">SYSTEM_ALERT</option>
              <option value="NEW_PATIENT_ASSIGNED">NEW_PATIENT_ASSIGNED</option>
            </select>
            <input
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="Title"
              className="w-full bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
            />
            <textarea
              value={createMessage}
              onChange={(e) => setCreateMessage(e.target.value)}
              placeholder="Message"
              rows={4}
              className="w-full bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-1 focus:ring-primary/40 resize-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={createPatientId}
                onChange={(e) => setCreatePatientId(e.target.value)}
                placeholder="Patient ID (optional)"
                className="w-full bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
              />
              <input
                value={createReportId}
                onChange={(e) => setCreateReportId(e.target.value)}
                placeholder="Report ID (optional)"
                className="w-full bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            {createError && <div className="rounded-xl bg-error-container/30 text-error px-4 py-3 text-sm">{createError}</div>}
            <Button onClick={onCreate} disabled={createLoading || !selectedUserId} icon="send" className="w-full">
              {createLoading ? "Sending..." : "Send"}
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-8 p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="font-headline font-bold text-xl">Inbox</div>
            <div className="text-xs text-on-surface-variant">{isLoading ? "Loading…" : `${unread} unread · ${items.length} total`}</div>
          </div>

          {error && (
            <div className="rounded-xl bg-error-container/30 text-error px-4 py-3 text-sm mb-4">{error}</div>
          )}

          <div className="space-y-4">
            {!isLoading && items.length === 0 && (
              <div className="py-12 text-center text-on-surface-variant">No notifications for this doctor.</div>
            )}
            {items.map((n) => (
              <Card
                key={n.id}
                className={`p-5 hover:bg-surface-container-high transition-all group relative ${
                  n.is_read ? "" : "ring-1 ring-primary/20"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-widest text-on-surface-variant font-bold">
                      {n.type} {n.patient_id ? `· Patient #${n.patient_id}` : ""} {n.report_id ? `· Report #${n.report_id}` : ""}
                    </div>
                    <div className={`font-headline font-bold mt-1 ${n.is_read ? "text-on-surface-variant" : "text-on-surface"}`}>
                      {n.title}
                    </div>
                    <div className="text-sm text-on-surface-variant mt-1 leading-relaxed">{n.message}</div>
                    <div className="text-xs text-outline mt-2">{formatRelative(n.created_at)} · {new Date(n.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex gap-2">
                    {!n.is_read && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(n.id)}
                        className="text-outline hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                        title="Mark read"
                      >
                        <span className="material-symbols-outlined">done</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(n.id)}
                      className="text-outline hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}


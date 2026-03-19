import api from "./api";

export type NotificationType =
  | "HIGH_RISK"
  | "FOLLOW_UP"
  | "REPORT_READY"
  | "NEW_PATIENT_ASSIGNED"
  | string;

export type NotificationResponse = {
  id: number;
  user_id: number;
  patient_id: number | null;
  report_id: number | null;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export async function listNotifications() {
  const { data } = await api.get<NotificationResponse[]>("/notifications");
  return data;
}

export async function markNotificationRead(id: number) {
  const { data } = await api.put<NotificationResponse>(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead() {
  await api.put("/notifications/read-all");
}

export async function deleteNotification(id: number) {
  await api.delete(`/notifications/${id}`);
}


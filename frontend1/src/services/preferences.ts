import api from "./api";

export type PreferencesResponse = {
  notifications_high_risk: boolean;
  notifications_daily_summary: boolean;
  follow_up_days_moderate: number;
  urgent_review_hours: number;
  min_confidence_threshold: number; // 0..1
};

export type PreferencesUpdate = Partial<PreferencesResponse>;

export async function getPreferences() {
  const { data } = await api.get<PreferencesResponse>("/preferences");
  return data;
}

export async function updatePreferences(update: PreferencesUpdate) {
  const { data } = await api.put<PreferencesResponse>("/preferences", update);
  return data;
}

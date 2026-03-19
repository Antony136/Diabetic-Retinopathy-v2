import api from "./api";

export type ProfileStats = {
  patients: number;
  reports: number;
  critical_cases: number;
  avg_confidence: number; // 0..1
};

export type ProfileResponse = {
  id: number;
  name: string;
  email: string;
  title: string;
  hospital_name: string;
  phone: string;
  board_certified: boolean;
  avatar_url: string;
  stats: ProfileStats;
};

export type ProfileUpdate = Partial<Pick<ProfileResponse, "name" | "title" | "hospital_name" | "phone" | "board_certified">>;

export async function getProfile() {
  const { data } = await api.get<ProfileResponse>("/profile");
  return data;
}

export async function updateProfile(update: ProfileUpdate) {
  const { data } = await api.put<ProfileResponse>("/profile", update);
  return data;
}

export async function changePassword(params: { current_password: string; new_password: string }) {
  await api.put("/profile/password", params);
}

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<{ avatar_url: string }>("/profile/avatar", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}


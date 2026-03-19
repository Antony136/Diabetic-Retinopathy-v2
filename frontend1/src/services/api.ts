import axios from "axios";
import { API_BASE_URL } from "../utils/constants";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

/** Upload a retinal image for AI analysis */
export async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append("image", file);
  const { data } = await api.post("/screening/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/** Retrieve prediction results */
export async function getPredictions() {
  const { data } = await api.get("/screening/predictions");
  return data;
}

/** Retrieve patient records with optional filters */
export async function getRecords(params?: { search?: string; severity?: string; page?: number }) {
  const { data } = await api.get("/records", { params });
  return data;
}

/** Retrieve triage cases */
export async function getTriageCases() {
  const { data } = await api.get("/triage");
  return data;
}

export default api;

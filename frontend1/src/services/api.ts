import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { getActiveApiBaseUrl, getCloudApiBaseUrl } from "./apiBase";
import { getAuthToken, getCloudAuthToken } from "./authStorage";

const api = axios.create({
  headers: { "Content-Type": "application/json" },
  // Prevent "infinite loading" when the backend/DB is slow or waking up.
  timeout: 60000,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const baseURL = getActiveApiBaseUrl();
  config.baseURL = baseURL;
  console.debug("API request", config.method, baseURL, config.url);

  const cloudBase = getCloudApiBaseUrl();
  const isCloud = Boolean(cloudBase) && baseURL === cloudBase;
  const token = isCloud ? getCloudAuthToken() : getAuthToken();
  if (!token) return config;

  const headers = AxiosHeaders.from(config.headers);
  headers.set("Authorization", `Bearer ${token}`);
  config.headers = headers;

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      import("./authStorage").then(({ clearAuthToken }) => {
        clearAuthToken();
        // Use hash for HashRouter redirection from outside of React components
        window.location.hash = "#/login";
      });
    }
    return Promise.reject(error);
  }
);

/** Upload a retinal image for AI analysis */
export async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append("image", file);
  const { data } = await api.post("/screening/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    // Upload + inference can legitimately take longer than normal API calls.
    timeout: 120000,
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
  const { data } = await api.get("/patients", { params });
  return data;
}

/** Retrieve triage cases */
export async function getTriageCases(params?: {
  timeframe?: "today" | "1d" | "7d" | "30d" | "custom" | "all";
  start_date?: string;
  end_date?: string;
  latest_per_patient?: boolean;
}) {
  const { data } = await api.get("/reports", { params });
  return data;
}

export default api;

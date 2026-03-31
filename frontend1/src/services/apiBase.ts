import { API_BASE_URL } from "../utils/constants";

export function getLocalApiBaseUrl() {
  return (window.__LOCAL_API_BASE__ || window.electronAPI?.getLocalApiBase?.() || "").trim();
}

export function getCloudApiBaseUrl() {
  return (
    (window.__CLOUD_API_BASE__ || window.electronAPI?.getCloudApiBase?.() || import.meta.env.VITE_CLOUD_API_BASE_URL || "").trim() ||
    API_BASE_URL
  );
}

export function getActiveApiBaseUrl() {
  // In Electron, prefer local backend even when online (offline-first).
  const local = getLocalApiBaseUrl();
  if (local) {
    const useCloud = localStorage.getItem("retina_use_cloud_backend") === "1";
    const cloud = getCloudApiBaseUrl();
    if (useCloud && navigator.onLine && cloud && cloud !== local) return cloud;
    return local;
  }
  return API_BASE_URL;
}

export function getActiveBackendOrigin() {
  return getActiveApiBaseUrl().replace(/\/api\/?$/, "");
}

import { API_BASE_URL } from "../utils/constants";
import { getCachedImageUrl, cacheRemoteImage, setCachedImageUrl } from "./imageCache";

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

export function resolveBackendImageUrl(pathOrUrl: string) {
  if (!pathOrUrl) return "";

  if (pathOrUrl.startsWith("data:")) return pathOrUrl;

  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    const cached = getCachedImageUrl(pathOrUrl);
    if (cached) return cached;

    // Kick off background cache of known remote images (first access path)
    cacheRemoteImage(pathOrUrl).then((local) => {
      if (local) {
        setCachedImageUrl(pathOrUrl, local);
      }
    }).catch(() => {
      // ignore caching errors
    });

    return pathOrUrl;
  }

  const normalized = pathOrUrl.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${getActiveBackendOrigin()}/${normalized}`;
}

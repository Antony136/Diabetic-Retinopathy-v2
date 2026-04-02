import { getAuthToken } from "./authStorage";

const PREFIX = "retina_img_cache:";

function key(remoteUrl: string) {
  return `${PREFIX}${remoteUrl}`;
}

function getLocalApiBase() {
  return (window.__LOCAL_API_BASE__ || window.electronAPI?.getLocalApiBase?.() || "").trim();
}

function getLocalOrigin() {
  const base = getLocalApiBase();
  if (!base) return "";
  return base.replace(/\/api\/?$/, "");
}

export function getCachedImageUrl(remoteUrl: string) {
  const localPath = localStorage.getItem(key(remoteUrl)) || "";
  if (!localPath) return "";
  const origin = getLocalOrigin();
  if (!origin) return "";
  const normalized = localPath.replace(/\\/g, "/");
  if (normalized.startsWith("http")) return normalized;
  if (normalized.startsWith("/")) return `${origin}${normalized}`;
  return `${origin}/${normalized}`;
}

export function setCachedImageUrl(remoteUrl: string, localUrlOrPath: string) {
  if (!remoteUrl || !localUrlOrPath) return;
  // Store as path when possible to keep it portable across ports.
  const origin = getLocalOrigin();
  const v =
    origin && localUrlOrPath.startsWith(origin)
      ? localUrlOrPath.slice(origin.length)
      : localUrlOrPath;
  localStorage.setItem(key(remoteUrl), v);
}

export async function cacheRemoteImage(remoteUrl: string) {
  const base = getLocalApiBase();
  const origin = getLocalOrigin();
  if (!base || !origin) return "";
  if (!navigator.onLine) return "";

  const token = getAuthToken();
  if (!token) return "";

  const url = `${base.replace(/\/$/, "")}/cache/resolve?url=${encodeURIComponent(remoteUrl)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return "";
  const data = (await res.json()) as { local_url?: string | null };
  const local = (data?.local_url || "").trim();
  if (!local) return "";

  setCachedImageUrl(remoteUrl, local);
  const normalized = local.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return `${origin}${normalized}`;
  return `${origin}/${normalized}`;
}

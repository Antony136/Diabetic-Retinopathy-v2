import axios from "axios";
import { getAuthToken, getCloudAuthToken } from "./authStorage";
import { getCloudApiBaseUrl, getLocalApiBaseUrl } from "./apiBase";
import { getUserIdFromToken } from "./jwt";

const LAST_SYNC_KEY = "retina_sync_last";
const SYNC_STATUS_KEY = "retina_sync_status";

function syncStorageKey() {
  const userId = getUserIdFromToken(getAuthToken());
  return userId ? `${LAST_SYNC_KEY}_${userId}` : LAST_SYNC_KEY;
}

function syncStatusKey() {
  const userId = getUserIdFromToken(getAuthToken());
  return userId ? `${SYNC_STATUS_KEY}_${userId}` : SYNC_STATUS_KEY;
}

export type SyncStatus = "idle" | "pending" | "synced" | "failed";

function getLastSync() {
  return localStorage.getItem(syncStorageKey()) || "";
}

function setLastSync(value: string) {
  if (!value) return;
  localStorage.setItem(syncStorageKey(), value);
}

export function getSyncStatus(): { status: SyncStatus; reason?: string } {
  try {
    const raw = localStorage.getItem(syncStatusKey());
    if (!raw) return { status: "idle" };
    return JSON.parse(raw) as { status: SyncStatus; reason?: string };
  } catch {
    return { status: "idle" };
  }
}

export function clearSyncState() {
  try {
    localStorage.removeItem(syncStatusKey());
    localStorage.removeItem(syncStorageKey());
  } catch {
    // fallback: ignore
  }
}

function setSyncStatus(status: SyncStatus, reason?: string) {
  try {
    localStorage.setItem(syncStatusKey(), JSON.stringify({ status, reason }));
  } catch {
    // fallback: no-op
  }
}

function makeClient(baseURL: string, token?: string | null) {
  const authToken = token ?? getAuthToken();
  return axios.create({
    baseURL,
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    timeout: 120000,
  });
}

async function fetchAsFile(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "application/octet-stream" });
}

export async function runSync() {
  setSyncStatus("pending");
  try {
    if (!navigator.onLine) {
      setSyncStatus("failed", "offline");
      return { ok: false, reason: "offline" };
    }

    const localBase = getLocalApiBaseUrl();
    const cloudBase = getCloudApiBaseUrl();
    if (!localBase || !cloudBase || localBase === cloudBase) {
      setSyncStatus("failed", "not_configured");
      return { ok: false, reason: "not_configured" };
    }

    const localToken = getAuthToken();
    const cloudToken = getCloudAuthToken();
    if (!cloudToken) {
      setSyncStatus("failed", "cloud_auth_missing");
      return { ok: false, reason: "cloud_auth_missing" };
    }

    const local = makeClient(localBase, localToken);
    const cloud = makeClient(cloudBase, cloudToken);
    const localOrigin = localBase.replace(/\/api\/?$/, "");

    const since = getLastSync();
    const localExport = await local.get("/sync/export", { params: since ? { since } : undefined });

  // 1) Push patients + cloud-friendly reports metadata
  const patients = localExport.data?.patients || [];
  const reports = (localExport.data?.reports || []).filter((r: any) => {
    const imageUrl = String(r?.image_url || "");
    // Local /uploads paths must be pushed as multipart via /reports/import.
    return !imageUrl.startsWith("/uploads/");
  });

  await cloud.post("/sync/import", { patients, reports });

  // 2) Push reports with local images as multipart (preserves offline inference results)
  const missingLocalAssets: string[] = [];
  for (const r of localExport.data?.reports || []) {
    const imageUrl = String(r?.image_url || "");
    if (!imageUrl.startsWith("/uploads/")) continue;

    const form = new FormData();
    form.append("client_uuid", r.client_uuid);
    form.append("prediction", r.prediction);
    form.append("confidence", String(r.confidence));
    if (r.description) form.append("description", r.description);
    if (r.created_at) form.append("created_at", r.created_at);
    if (r.updated_at) form.append("updated_at", r.updated_at);

    try {
      const imageFile = await fetchAsFile(`${localOrigin.replace(/\/$/, "")}${imageUrl}`, r.filename || "retina.png");
      form.append("file", imageFile);
    } catch (e) {
      missingLocalAssets.push(imageUrl);
      continue; // cannot sync this report without the original image bytes
    }

    const heatmapUrl = String(r?.heatmap_url || "");
    if (heatmapUrl.startsWith("/uploads/")) {
      try {
        const hm = await fetchAsFile(`${localOrigin.replace(/\/$/, "")}${heatmapUrl}`, "heatmap.png");
        form.append("heatmap", hm);
      } catch {
        // heatmap is optional; still sync the report image + metadata
      }
    }

    await cloud.post("/reports/import", form, {
      params: { patient_client_uuid: r.patient_client_uuid },
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
  }

  // 3) Pull cloud changes back to local (patients + reports metadata)
  const cloudExport = await cloud.get("/sync/export", { params: since ? { since } : undefined });
    const cloudOrigin = cloudBase.replace(/\/api\/?$/, "");
    await local.post(`/sync/import?cloud_base=${encodeURIComponent(cloudOrigin)}`, cloudExport.data);
  setLastSync(cloudExport.data?.server_time || localExport.data?.server_time || "");
  if (missingLocalAssets.length > 0) {
    setSyncStatus("failed", `missing_local_assets:${missingLocalAssets.length}`);
    return { ok: false, reason: "missing_local_assets" };
  }
  setSyncStatus("synced");
  return { ok: true };
  } catch (error) {
    setSyncStatus("failed", String(error));
    throw error;
  }
}

import axios from "axios";
import { getAuthToken } from "./authStorage";
import { getCloudApiBaseUrl, getLocalApiBaseUrl } from "./apiBase";

const LAST_SYNC_KEY = "retina_sync_last";

function getLastSync() {
  return localStorage.getItem(LAST_SYNC_KEY) || "";
}

function setLastSync(value: string) {
  if (!value) return;
  localStorage.setItem(LAST_SYNC_KEY, value);
}

function makeClient(baseURL: string) {
  const token = getAuthToken();
  return axios.create({
    baseURL,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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
  if (!navigator.onLine) return { ok: false, reason: "offline" };

  const localBase = getLocalApiBaseUrl();
  const cloudBase = getCloudApiBaseUrl();
  if (!localBase || !cloudBase || localBase === cloudBase) return { ok: false, reason: "not_configured" };

  const local = makeClient(localBase);
  const cloud = makeClient(cloudBase);

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

    const imageFile = await fetchAsFile(`${localBase.replace(/\/$/, "")}${imageUrl}`, r.filename || "retina.png");
    form.append("file", imageFile);

    const heatmapUrl = String(r?.heatmap_url || "");
    if (heatmapUrl.startsWith("/uploads/")) {
      const hm = await fetchAsFile(`${localBase.replace(/\/$/, "")}${heatmapUrl}`, "heatmap.png");
      form.append("heatmap", hm);
    }

    await cloud.post("/reports/import", form, {
      params: { patient_client_uuid: r.patient_client_uuid },
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
  }

  // 3) Pull cloud changes back to local (patients + reports metadata)
  const cloudExport = await cloud.get("/sync/export", { params: since ? { since } : undefined });
  await local.post("/sync/import", cloudExport.data);

  setLastSync(cloudExport.data?.server_time || localExport.data?.server_time || "");
  return { ok: true };
}


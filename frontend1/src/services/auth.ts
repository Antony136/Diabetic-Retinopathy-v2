import api from "./api";
import axios from "axios";
import { getCloudApiBaseUrl, getLocalApiBaseUrl } from "./apiBase";
import { runSync, clearSyncState } from "./sync";
import { getUserIdFromToken } from "./jwt";
import { clearAuthToken, getAuthToken, setAuthToken, getCloudAuthToken, setCloudAuthToken } from "./authStorage";

const CURRENT_USER_KEY = "retina_current_user_id";

function getLocalCurrentUserId(): number | null {
  try {
    const value = localStorage.getItem(CURRENT_USER_KEY);
    if (!value) return null;
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function setLocalCurrentUserId(userId: number | null) {
  try {
    if (userId == null) {
      localStorage.removeItem(CURRENT_USER_KEY);
    } else {
      localStorage.setItem(CURRENT_USER_KEY, String(userId));
    }
  } catch {
    // ignore
  }
}

async function clearLocalDoctorData() {
  try {
    await api.post("/auth/clear-local-data");
  } catch {
    // fallback: continue
  }
}

export async function logoutUser() {
  const token = getAuthToken();
  const userId = getUserIdFromToken(token);

  try {
    await clearLocalDoctorData();
  } catch {
    // ignore
  }

  clearAuthToken();
  setLocalCurrentUserId(null);
  clearSyncState();

  if (typeof window !== "undefined" && (window.electronAPI as any)?.setActiveDoctor) {
    (window.electronAPI as any).setActiveDoctor(null);
  }

  if (userId) {
    localStorage.removeItem(`retina_sync_last_${userId}`);
    localStorage.removeItem(`retina_sync_status_${userId}`);
  }
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserResponse {
  id: number;
  name: string;
  email: string;
  role: "doctor" | "admin" | string;
}

export async function registerUser(request: RegisterRequest) {
  const { data } = await api.post<UserResponse>("/auth/register", request);
  return data;
}

function getPinnedLocalApiBase() {
  // In desktop, always use the local backend for local auth/session (even if "use cloud backend" toggle is on).
  return getLocalApiBaseUrl() || api.defaults.baseURL || "";
}

function makePinnedLocalClient() {
  const baseURL = getPinnedLocalApiBase();
  return axios.create({ baseURL, timeout: 20000 });
}

async function loginLocal(request: LoginRequest): Promise<TokenResponse> {
  const localClient = makePinnedLocalClient();
  const { data } = await localClient.post<TokenResponse>("/auth/login", request);
  return data;
}

async function loginCloud(request: LoginRequest): Promise<TokenResponse> {
  const cloudBase = getCloudApiBaseUrl();
  const localBase = getLocalApiBaseUrl();
  console.log("auth: cloudBase", cloudBase, "localBase", localBase);

  if (!cloudBase) {
    throw new Error("Cloud API base URL is not configured. Set VITE_CLOUD_API_BASE_URL or window.__CLOUD_API_BASE__.");
  }
  if (cloudBase === localBase) {
    throw new Error("Cloud API base URL matches local backend. Provide a separate cloud endpoint.");
  }

  const cloudClient = axios.create({ baseURL: cloudBase, timeout: 20000 });
  const { data } = await cloudClient.post<TokenResponse>("/auth/login", request);

  setCloudAuthToken(data.access_token);
  return data;
}

async function registerCloudIfMissing(request: RegisterRequest): Promise<void> {
  const cloudBase = getCloudApiBaseUrl();
  const cloudClient = axios.create({ baseURL: cloudBase, timeout: 20000 });
  try {
    await cloudClient.post<UserResponse>("/auth/register", request);
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
      if (typeof detail === "string" && detail.includes("Email already registered")) {
        return;
      }
    }
    throw err;
  }
}

async function registerLocalIfMissing(request: RegisterRequest): Promise<void> {
  const localClient = makePinnedLocalClient();
  try {
    await localClient.post<UserResponse>("/auth/register", request);
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
      if (typeof detail === "string" && detail.includes("Email already registered")) {
        return;
      }
    }
    throw err;
  }
}


async function prepareDoctorSession(accessToken: string | null) {
  const userId = getUserIdFromToken(accessToken);
  const previousUserId = getLocalCurrentUserId();

  if (previousUserId && userId && previousUserId !== userId) {
    await clearLocalDoctorData();
    clearSyncState();
  }

  if (userId) {
    setLocalCurrentUserId(userId);
    if (typeof window !== "undefined" && (window.electronAPI as any)?.setActiveDoctor) {
      (window.electronAPI as any).setActiveDoctor(userId);
    }
  }
}

async function ensureCloudAuth(request: LoginRequest) {
  // Only meaningful in desktop (needs both local + cloud endpoints).
  if (!getLocalApiBaseUrl()) return;

  const cloudToken = getCloudAuthToken();
  if (cloudToken) return;

  try {
    await loginCloud(request);
    console.log("auth: cloud login ensured after local login");
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      try {
        await registerCloudIfMissing({ name: request.email.split("@")[0], email: request.email, password: request.password });
        await loginCloud(request);
        console.log("auth: cloud register+login ensured after local login");
        return;
      } catch (err2) {
        console.warn("auth: cloud register+login failed; cannot sync to cloud", err2);
        return;
      }
    }
    console.warn("auth: cloud login during local path failed; cannot sync to cloud", err);
  }
}

export async function loginUser(request: LoginRequest) {
  console.log("auth: attempting local login");
  try {
    const localToken = await loginLocal(request);
    setAuthToken(localToken.access_token);
    console.log("auth: local login successful");

    await prepareDoctorSession(localToken.access_token);

    // Desktop sync only (cloud website has no local backend, so sync is not configured there).
    if (navigator.onLine && getLocalApiBaseUrl()) {
      await ensureCloudAuth(request);
      console.log("auth: online -> running sync");
      try {
        await runSync();
        console.log("auth: sync successful");
      } catch (syncErr) {
        console.warn("auth: sync failed after local login", syncErr);
      }
    }

    return localToken;
  } catch (localError) {
    if (axios.isAxiosError(localError) && localError.response?.status === 401 && navigator.onLine) {
      console.log("auth: local login 401, falling back to cloud login");
      await loginCloud(request);
      console.log("auth: cloud login successful");

      await registerLocalIfMissing({ name: request.email.split("@")[0], email: request.email, password: request.password });
      console.log("auth: local register/idempotent apply done");

      const localTokenAfterRegister = await loginLocal(request);
      setAuthToken(localTokenAfterRegister.access_token);
      console.log("auth: local login after cloud register successful");

      await prepareDoctorSession(localTokenAfterRegister.access_token);

      console.log("auth: running sync after fallback login");
      try {
        await runSync();
        console.log("auth: sync successful after fallback login");
      } catch (syncErr) {
        console.warn("auth: sync failed after fallback login", syncErr);
      }
      return localTokenAfterRegister;
    }

    console.warn("auth: local login failed and cannot fallback", localError);
    throw localError;
  }
}

export async function getMe() {
  const { data } = await api.get<UserResponse>("/auth/me");
  return data;
}

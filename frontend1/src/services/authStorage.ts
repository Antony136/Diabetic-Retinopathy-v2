export const AUTH_TOKEN_STORAGE_KEY = "retinamax_auth_token";
export const CLOUD_AUTH_TOKEN_STORAGE_KEY = "retinamax_cloud_auth_token";

export async function syncAuthFromSecureStore() {
  if (typeof window !== "undefined" && (window.electronAPI as any)?.getSecureToken) {
    try {
      const secure = await (window.electronAPI as any).getSecureToken(AUTH_TOKEN_STORAGE_KEY);
      if (secure) {
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, secure);
      }
      const cloudSecure = await (window.electronAPI as any).getSecureToken(CLOUD_AUTH_TOKEN_STORAGE_KEY);
      if (cloudSecure) {
        localStorage.setItem(CLOUD_AUTH_TOKEN_STORAGE_KEY, cloudSecure);
      }
    } catch {
      // ignore
    }
  }
}

export function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    return stored ? stored : null;
  } catch {
    return null;
  }
}

export function getCloudAuthToken(): string | null {
  try {
    const stored = localStorage.getItem(CLOUD_AUTH_TOKEN_STORAGE_KEY);
    return stored ? stored : null;
  } catch {
    return null;
  }
}

export function setAuthToken(token: string) {
  try {
    if (typeof window !== "undefined" && (window.electronAPI as any)?.setSecureToken) {
      (window.electronAPI as any).setSecureToken(AUTH_TOKEN_STORAGE_KEY, token).catch(() => {
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
      });
    } else {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    }

    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  }
}

export function setCloudAuthToken(token: string) {
  try {
    if (typeof window !== "undefined" && (window.electronAPI as any)?.setSecureToken) {
      (window.electronAPI as any).setSecureToken(CLOUD_AUTH_TOKEN_STORAGE_KEY, token).catch(() => {
        localStorage.setItem(CLOUD_AUTH_TOKEN_STORAGE_KEY, token);
      });
    } else {
      localStorage.setItem(CLOUD_AUTH_TOKEN_STORAGE_KEY, token);
    }

    localStorage.setItem(CLOUD_AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    localStorage.setItem(CLOUD_AUTH_TOKEN_STORAGE_KEY, token);
  }
}

export function clearAuthToken() {
  if (typeof window !== "undefined" && (window.electronAPI as any)?.clearSecureToken) {
    (window.electronAPI as any).clearSecureToken(AUTH_TOKEN_STORAGE_KEY).catch(() => {
      /* ignore */
    });
    (window.electronAPI as any).clearSecureToken(CLOUD_AUTH_TOKEN_STORAGE_KEY).catch(() => {
      /* ignore */
    });
  }

  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(CLOUD_AUTH_TOKEN_STORAGE_KEY);
}




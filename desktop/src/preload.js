const { contextBridge, ipcRenderer } = require("electron");

function getBackendBase() {
  const arg = (process.argv || []).find((a) => a.startsWith("--retinaBackendPort="));
  const portStr = arg ? arg.split("=", 2)[1] : process.env.RETINA_MAX_BACKEND_PORT || "8000";
  const port = Number(portStr) || 8000;
  return `http://127.0.0.1:${port}`;
}

const api = {
  isElectron: true,
  getLocalApiBase: () => `${getBackendBase()}/api`,
  getCloudApiBase: () => {
    const arg = (process.argv || []).find((a) => a.startsWith("--retinaCloudApiBase="));
    const v = arg ? arg.split("=", 2)[1] : "";
    return v || process.env.CLOUD_API_BASE_URL || process.env.VITE_CLOUD_API_BASE_URL || "";
  },
  getBackendBase: () => getBackendBase(),
  backendStatus: () => ipcRenderer.invoke("backend-status"),
  backendRestart: () => ipcRenderer.invoke("backend-restart"),
};

contextBridge.exposeInMainWorld("electronAPI", api);

// Convenience globals for existing frontend code
try {
  // eslint-disable-next-line no-undef
  window.__ELECTRON__ = true;
  // eslint-disable-next-line no-undef
  window.__LOCAL_API_BASE__ = api.getLocalApiBase();
  // eslint-disable-next-line no-undef
  window.__CLOUD_API_BASE__ = api.getCloudApiBase();
} catch {}

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const log = require("electron-log");
const http = require("http");
const keytar = require("keytar");

const KEYTAR_SERVICE = "retina-max-desktop";
let activeDoctorId = null;


// get-port v8 is ESM-only; import dynamically from CommonJS.
async function getPortAsync(options) {
  const getPortModule = await import("get-port");
  return getPortModule.default(options);
}

let backendProcess = null;
let backendPort = null;
let backendReady = false;

// Returns path to resources (frontend, backend) in both dev and packaged mode
function resourcePath(...parts) {
  if (!app.isPackaged) return path.join(__dirname, "..", "..", ...parts);
  return path.join(process.resourcesPath, ...parts);
}

// Get Python path for dev backend
function getEnvBackendPython() {
  const envPath = process.env.RETINA_BACKEND_PYTHON || process.env.BACKEND_PYTHON_PATH;
  if (envPath) return envPath;

  const venvPath = path.join(__dirname, "..", "..", "backend", "venv");
  if (process.platform === "win32") return path.join(venvPath, "Scripts", "python.exe");
  return path.join(venvPath, "bin", "python");
}

// Get backend command (Python in dev, executable in packaged mode)
function getBackendCommand() {
  if (!app.isPackaged) {
    const venvPython = getEnvBackendPython();
    const pyCmd = venvPython || "python";
    return { cmd: pyCmd, args: [resourcePath("backend", "desktop_server.py")] };
  }

  const candidates = process.platform === "win32"
    ? ["desktop_server.exe", "retina-max-backend.exe"]
    : ["desktop_server", "retina-max-backend"];
  for (const name of candidates) {
    const candidatePath = resourcePath("backend", name);
    if (fs.existsSync(candidatePath)) {
      log.info("Using backend executable", candidatePath);
      return { cmd: candidatePath, args: [] };
    }
  }

  const fallbackName = process.platform === "win32" ? "desktop_server.exe" : "desktop_server";
  const fallbackPath = resourcePath("backend", fallbackName);
  log.warn("No backend executable found among candidates; using fallback path", fallbackPath);
  return { cmd: fallbackPath, args: [] };
}

// Start backend process
async function startBackend() {
  backendPort = await getPortAsync({ port: [8000, 8001, 8002, 0] });

  const { cmd, args } = getBackendCommand();
  const userDataDir = app.getPath("userData");
  const dbPath = activeDoctorId
    ? path.join(userDataDir, `retina-max-user-${activeDoctorId}.sqlite3`)
    : path.join(userDataDir, "retina-max.sqlite3");
  const modelPath = app.isPackaged
    ? resourcePath("backend", "model_b3.pth")
    : resourcePath("backend", "app", "checkpoints", "model_b3.pth");

  const env = {
    ...process.env,
    PORT: String(backendPort),
    HOST: "127.0.0.1",
    AI_PROVIDER: "local",
    MODEL_PATH: modelPath,
    DATABASE_URL: `sqlite:///${dbPath.replace(/\\\\/g, "/")}`,
    ALLOWED_ORIGINS: "*",
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
    GROQ_API_KEY: process.env.GROQ_API_KEY || "",
    LLM_PROVIDER: process.env.LLM_PROVIDER || "ollama",
    OLLAMA_URL: process.env.OLLAMA_URL || "http://localhost:11434"
  };

  log.info("Starting backend", { cmd, args, backendPort, dbPath, modelPath, exists: fs.existsSync(cmd) });

  if (!fs.existsSync(cmd)) {
    throw new Error(`Backend executable not found at ${cmd}`);
  }

  backendProcess = spawn(cmd, [...args], {
    cwd: userDataDir,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  backendProcess.stdout.on("data", (d) => log.info(String(d).trimEnd()));
  backendProcess.stderr.on("data", (d) => log.error(String(d).trimEnd()));

  backendProcess.on("exit", (code, signal) => {
    log.error("Backend exited", { code, signal });
    backendProcess = null;
  });
}

// Wait until backend responds to /health
async function waitForBackend(timeoutMs = 180000) {
  const started = Date.now();
  const url = `http://127.0.0.1:${backendPort}/health`;

  while (Date.now() - started < timeoutMs) {
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 300);
        });
        req.on("error", () => resolve(false));
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });
      if (ok) {
        backendReady = true;
        return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }

  backendReady = false;
  return false;
}

// Create main BrowserWindow
function createWindow() {
  const cloudApiBase = process.env.CLOUD_API_BASE_URL || process.env.VITE_CLOUD_API_BASE_URL || "";
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        `--retinaBackendPort=${backendPort || 8000}`,
        `--retinaCloudApiBase=${cloudApiBase}`
      ]
    }
  });

  win.once("ready-to-show", () => win.show());

  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
  } else {
    const indexPath = path.join(process.resourcesPath, "frontend", "index.html");
    if (!fs.existsSync(indexPath)) {
      log.error("Missing frontend index.html", indexPath);
      dialog.showErrorBox("App load error", `Cannot find built frontend at: ${indexPath}`);
    } else {
      win.loadFile(indexPath);
    }
  }

  return win;
}

// App events
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  try { if (backendProcess) backendProcess.kill(); } catch {}
});

// IPC handlers
ipcMain.handle("backend-status", async () => ({ ready: backendReady, port: backendPort }));

ipcMain.handle("backend-restart", async () => {
  if (backendProcess) {
    try { backendProcess.kill(); } catch {}
    backendProcess = null;
  }

  try {
    await startBackend();
    const ok = await waitForBackend();
    return { ok, message: ok ? "Backend is ready" : "Backend start failed" };
  } catch (e) {
    log.error("backend-restart error", e);
    return { ok: false, message: String(e) };
  }
});

ipcMain.handle("set-active-doctor", async (_, userId) => {
  const parsed = userId === null || userId === undefined ? null : Number(userId);
  if (parsed && Number.isNaN(parsed)) {
    return { ok: false, message: "invalid userId" };
  }

  if (parsed === activeDoctorId) {
    return { ok: true, message: "doctor already active" };
  }

  activeDoctorId = parsed;

  if (backendProcess) {
    try { backendProcess.kill(); } catch {}
    backendProcess = null;
  }

  try {
    await startBackend();
    const ok = await waitForBackend();
    return { ok, message: ok ? "Backend switched" : "Backend switch failed" };
  } catch (e) {
    log.error("set-active-doctor error", e);
    return { ok: false, message: String(e) };
  }
});

ipcMain.handle("secure-token-get", async (_, key) => {
  try {
    const value = await keytar.getPassword(KEYTAR_SERVICE, key);
    return value || null;
  } catch (err) {
    log.error("keytar get error", err);
    return null;
  }
});

ipcMain.handle("secure-token-set", async (_, key, value) => {
  try {
    await keytar.setPassword(KEYTAR_SERVICE, key, value);
    return true;
  } catch (err) {
    log.error("keytar set error", err);
    return false;
  }
});

ipcMain.handle("secure-token-clear", async (_, key) => {
  try {
    await keytar.deletePassword(KEYTAR_SERVICE, key);
    return true;
  } catch (err) {
    log.error("keytar clear error", err);
    return false;
  }
});

// Main startup
app.whenReady().then(async () => {
  try {
    await startBackend();
    const ok = await waitForBackend();
    if (!ok) {
      dialog.showErrorBox(
        "Backend failed to start",
        "The local AI server did not become ready in time. You can still use the app in limited mode, but AI analysis may fail."
      );
    }
  } catch (e) {
    log.error("Failed to start backend", e);
    dialog.showErrorBox("Backend error", String(e));
  }

  createWindow();
});

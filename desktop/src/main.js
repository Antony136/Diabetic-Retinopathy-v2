const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const log = require("electron-log");
const http = require("http");

// get-port v8 is ESM-only; import dynamically from CommonJS.
async function getPortAsync(options) {
  const getPortModule = await import("get-port");
  return getPortModule.default(options);
}

let backendProcess = null;
let backendPort = null;
let backendReady = false;

function resourcePath(...parts) {
  // In dev, __dirname is desktop/src; resources are in repo root.
  if (!app.isPackaged) return path.join(__dirname, "..", "..", ...parts);
  return path.join(process.resourcesPath, ...parts);
}

function getEnvBackendPython() {
  const envPath = process.env.RETINA_BACKEND_PYTHON || process.env.BACKEND_PYTHON_PATH;
  if (envPath) return envPath;

  const venvPath = path.join(__dirname, "..", "..", "backend", "venv");
  if (process.platform === "win32") {
    const candidate = path.join(venvPath, "Scripts", "python.exe");
    return candidate;
  }
  const candidate = path.join(venvPath, "bin", "python");
  return candidate;
}

function getBackendCommand() {
  if (!app.isPackaged) {
    // Prefer dedicated venv Python for dev to satisfy dependencies like sqlalchemy.
    const venvPython = getEnvBackendPython();
    const pyCmd = venvPython || "python";
    return { cmd: pyCmd, args: [resourcePath("backend", "desktop_server.py")] };
  }

  // Packaged: PyInstaller output is copied into resources/backend
  const exeName = process.platform === "win32" ? "retina-max-backend.exe" : "retina-max-backend";
  return { cmd: resourcePath("backend", exeName), args: [] };
}

async function startBackend() {
  backendPort = await getPortAsync({ port: [8000, 8001, 8002, 0] });

  const { cmd, args } = getBackendCommand();
  const userDataDir = app.getPath("userData");
  const dbPath = path.join(userDataDir, "retina-max.sqlite3");
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
    // Optional: allow cloud sync + Groq when available
    GROQ_API_KEY: process.env.GROQ_API_KEY || "",
    LLM_PROVIDER: process.env.LLM_PROVIDER || "ollama",
    OLLAMA_URL: process.env.OLLAMA_URL || "http://localhost:11434"
  };

  log.info("Starting backend", { cmd, args, backendPort, dbPath, modelPath });

  backendProcess = spawn(cmd, [...args], {
    // Keep the desktop app self-contained: DB + uploads live under userData.
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

async function waitForBackend(timeoutMs = 30000) {
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
    const indexPath = resourcePath("frontend", "index.html");
    win.loadFile(indexPath);
  }

  return win;
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  try {
    if (backendProcess) backendProcess.kill();
  } catch {}
});

ipcMain.handle("backend-status", async () => {
  return { ready: backendReady, port: backendPort };
});

ipcMain.handle("backend-restart", async () => {
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch {}
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

  // Expose port to preload via global state.
  createWindow();
});

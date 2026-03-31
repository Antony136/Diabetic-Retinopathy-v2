# Retina Max Desktop (Electron + Offline Backend)

This folder contains the **offline-capable desktop build** of the Doctor Assistant web app.

- The **frontend** is the existing `frontend1` React app (packaged into Electron).
- A **local FastAPI backend** is started automatically (SQLite + local ML inference).
- When internet is restored, you can **sync** local/offline data to the deployed backend.

## What Works Offline

- Patient CRUD (stored in local SQLite)
- DR screening reports (local Torch inference using `model_b3.pth`, Grad-CAM heatmap)
- Triage views / today's reports (from local SQLite)
- Doctor Assistant chat via **Ollama** (if installed locally); otherwise the backend returns rule-based fallbacks

## Configuration (Optional)

Set these environment variables before launching the desktop app:

- `CLOUD_API_BASE_URL` (example: `https://your-render-backend.example.com/api`)  
  Used for sync + (optional) switching to cloud backend when online.
- `GROQ_API_KEY`  
  Enables Groq when online (same behavior as the web backend).
- `LLM_PROVIDER` (`ollama` or `groq`)  
  Default is `ollama`.
- `OLLAMA_URL` (default `http://localhost:11434`)

## Local Data Location

Electron stores local data under Electron’s `userData` directory:

- `retina-max.sqlite3` (local DB)
- `uploads/` (local images + heatmaps)

## Dev Run (Electron + Vite)

Prereqs: Node 18+, Python 3.10+

```powershell
cd frontend1
npm install

cd ..\backend
python -m pip install -r requirements-desktop.txt

cd ..\desktop
npm install
npm run dev
```

## Production Build (Standalone Installer)

Packaging is done in 3 steps: build frontend, build Python backend with PyInstaller, then build Electron.

Important: **PyInstaller + Electron builds are OS-specific**. Build on Windows for Windows, macOS for macOS, Linux for Linux.

```powershell
cd desktop
npm run build
```

This produces installers under `desktop/release/`.

## Using Sync

- The UI shows an **Offline Mode** badge when internet is down.
- Click the **sync** button in the top bar to push offline data to the cloud.
- When online, you can toggle **cloud/local backend** with the cloud icon.


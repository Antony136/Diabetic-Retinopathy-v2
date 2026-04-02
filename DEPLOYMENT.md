# 🚀 Production & Deployment Guide

This guide provides step-by-step instructions for packaging and deploying the **Retina Max Desktop** application.

---

## 🛠️ Production Build Workflow

To create a standalone, offline-capable installer, follow these three stages in order.

### Phase 1: Frontend Production Build
Convert the React 19 source code into optimized static assets.
```bash
cd frontend1
npm install
npm run build
```
- **Output**: `frontend1/dist/`
- **Note**: Ensure `vite.config.js` has the correct base path for Electron (usually `./`).

### Phase 2: Backend PyInstaller Build
Bundle the Python interpreter, FastAPI app, and ML models into a single executable.
```powershell
cd backend
# 1. Activate venv
.\venv\Scripts\activate
# 2. Install desktop-specific dependencies (Torch, Timm, etc.)
pip install -r requirements-desktop.txt
# 3. Run the build script
powershell -File ./scripts/build_desktop_backend.ps1
```
- **Output**: `backend/dist/desktop_server.exe`
- **Bundled Model**: The script expects the model checkpoint at `backend/app/checkpoints/model_b3.pth`.

### Phase 3: Electron Packaging
The final stage that combines the frontend `dist` and backend `exe` into an MSI/NSIS installer.
```bash
cd desktop
npm install
npm run build
```
- **Output**: `desktop/release/Retina Max Desktop Setup [version].exe`
- **Config**: Settings are managed in `desktop/package.json` under the `"build"` key.

---

## 📦 Running the Packaged App

Once installed, the application performs the following "Cold Start" sequence:
1. **Port Discovery**: Electron finds a free local port (starting from 8000).
2. **Backend Spawning**: Electron launches `desktop_server.exe` as a background process.
3. **Environment Injection**: Electron passes the local DB path and `AI_PROVIDER=local` to the backend.
4. **Health Check**: Electron waits for the backend to respond on `/health` before showing the UI.

### Local Data Locations
- **Database**: `%APPDATA%/retina-max-desktop/retina-max.sqlite3`
- **Logs**: `%APPDATA%/retina-max-desktop/logs/main.log`
- **Uploads**: Local screenshots and heatmaps are stored in the user data directory.

---

## 🌩️ Deployment to Cloud (Optional)

If you wish to deploy the backend to a cloud provider like **Render** or **Railway**:
1. **Dockerize**: Use the `backend/Dockerfile` (if present) or `render.yaml`.
2. **Environment**: Set `AI_PROVIDER=gradio` or `AI_PROVIDER=huggingface` to use cloud-scale inference.
3. **Storage**: Configure `SUPABASE_URL` and `SUPABASE_KEY` for image hosting.

### Vercel (Frontend Only)
The frontend can be deployed to Vercel for web access:
- Use the configuration in `frontend1/vercel.json`.
- Point the API base URL to your cloud backend.

---

## 🔍 Troubleshooting Production Issues

### 1. Backend Fails to Start
- Check if `desktop_server.exe` exists in the `resources/backend` folder inside the installation directory.
- Verify that `torch` and `torchvision` were correctly bundled (PyInstaller can sometimes miss hidden imports).

### 2. Missing Heatmaps
- Ensure the backend has write permissions to its own `uploads/` directory or the user data path.

### 3. Sync Errors
- Ensure the `CLOUD_API_BASE_URL` is set correctly in settings.
- Check for SSL certificate issues if using a local self-signed dev server.

---

## 📝 Future deployment enhancements
- [ ] Implement **Auto-Updates** via `electron-updater`.
- [ ] Code sign the Windows installer to avoid "Windows Protected Your PC" warnings.
- [ ] Add Mac/Linux CI/CD pipelines via GitHub Actions.

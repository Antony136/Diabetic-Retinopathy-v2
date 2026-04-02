$ErrorActionPreference = "Stop"

Write-Host "Building Retina Max backend (desktop) via PyInstaller..."

$backendRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $backendRoot

$venvPython = Join-Path $backendRoot "venv\Scripts\python.exe"
if (Test-Path $venvPython) {
  Write-Host "Using venv Python: $venvPython"
  $python = $venvPython
} else {
  Write-Host "venv Python not found; falling back to system python"
  $python = "python"
}

try {
  Write-Host "Installing desktop requirements using: $python"
  & $python -m pip install -r requirements-desktop.txt

  if (Test-Path "dist") {
    Get-ChildItem -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
      try { $_.Attributes = 'Normal' } catch {}
    }
    Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue
  }
  if (Test-Path "build") {
    Get-ChildItem -Path "build" -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
      try { $_.Attributes = 'Normal' } catch {}
    }
    Remove-Item -Recurse -Force "build" -ErrorAction SilentlyContinue
  }

  Write-Host "Running PyInstaller via: $python -m PyInstaller"
& $python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --name "desktop_server" `
    --hidden-import=passlib.handlers.bcrypt `
    --hidden-import=passlib.handlers.pbkdf2_sha256 `
    --hidden-import=passlib.handlers.argon2 `
    "desktop_server.py"

  Write-Host "Backend build output: $backendRoot\\dist"

  # Ensure we have a backwards-compatible name for optional old path.
  $sourceExe = Join-Path "dist" "desktop_server.exe"
  $legacyExe = Join-Path "dist" "retina-max-backend.exe"
  if ((Test-Path $sourceExe) -and -not (Test-Path $legacyExe)) {
    Copy-Item $sourceExe $legacyExe -Force
    Write-Host "Created legacy backend executable name: retina-max-backend.exe"
  }
} finally {
  Pop-Location
}


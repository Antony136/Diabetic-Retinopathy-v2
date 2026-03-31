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

  if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
  if (Test-Path "build") { Remove-Item -Recurse -Force "build" }

  Write-Host "Running PyInstaller via: $python -m pyinstaller"
  & $python -m pyinstaller `
    --noconfirm `
    --clean `
    --onefile `
    --name "retina-max-backend" `
    "desktop_server.py"

  Write-Host "Backend build output: $backendRoot\\dist"
} finally {
  Pop-Location
}


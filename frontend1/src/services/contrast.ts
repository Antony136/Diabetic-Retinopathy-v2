import { getAppSettings } from "./appSettings";

const CONTRAST_CLASS = "contrast-high";

export function applyHighContrastEnabled(enabled: boolean) {
  document.documentElement.classList.toggle(CONTRAST_CLASS, enabled);
}

export function initHighContrastEnabled() {
  try {
    const settings = getAppSettings();
    applyHighContrastEnabled(settings.highContrastEnabled);
  } catch {
    // ignore
  }
}


import { getAppSettings } from "./appSettings";

const ANIMATIONS_OFF_CLASS = "animations-off";

export function applyAnimationsEnabled(enabled: boolean) {
  document.documentElement.classList.toggle(ANIMATIONS_OFF_CLASS, !enabled);
}

export function initAnimationsEnabled() {
  try {
    const settings = getAppSettings();
    applyAnimationsEnabled(settings.animationsEnabled);
  } catch {
    // ignore
  }
}


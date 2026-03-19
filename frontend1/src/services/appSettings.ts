export type AppSettings = {
  confidenceThreshold: number; // 0..100
  animationsEnabled: boolean;
  highContrastEnabled: boolean;
  notificationsHighRisk: boolean;
  notificationsDailySummary: boolean;
  pdfPaperSize: "a4" | "letter";
  pdfIncludeHeatmap: boolean;
  pdfIncludePatientContact: boolean;
  followUpDaysModerate: number;
  urgentReviewHours: number;
};

const STORAGE_KEY = "retinamax_app_settings_v1";

const DEFAULT_SETTINGS: AppSettings = {
  confidenceThreshold: 85,
  animationsEnabled: true,
  highContrastEnabled: false,
  notificationsHighRisk: true,
  notificationsDailySummary: false,
  pdfPaperSize: "a4",
  pdfIncludeHeatmap: true,
  pdfIncludePatientContact: true,
  followUpDaysModerate: 14,
  urgentReviewHours: 24,
};

export function getAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      confidenceThreshold:
        typeof parsed.confidenceThreshold === "number"
          ? parsed.confidenceThreshold
          : DEFAULT_SETTINGS.confidenceThreshold,
      animationsEnabled:
        typeof parsed.animationsEnabled === "boolean"
          ? parsed.animationsEnabled
          : DEFAULT_SETTINGS.animationsEnabled,
      highContrastEnabled:
        typeof parsed.highContrastEnabled === "boolean"
          ? parsed.highContrastEnabled
          : DEFAULT_SETTINGS.highContrastEnabled,
      notificationsHighRisk:
        typeof parsed.notificationsHighRisk === "boolean"
          ? parsed.notificationsHighRisk
          : DEFAULT_SETTINGS.notificationsHighRisk,
      notificationsDailySummary:
        typeof parsed.notificationsDailySummary === "boolean"
          ? parsed.notificationsDailySummary
          : DEFAULT_SETTINGS.notificationsDailySummary,
      pdfPaperSize:
        parsed.pdfPaperSize === "letter" || parsed.pdfPaperSize === "a4"
          ? parsed.pdfPaperSize
          : DEFAULT_SETTINGS.pdfPaperSize,
      pdfIncludeHeatmap:
        typeof parsed.pdfIncludeHeatmap === "boolean"
          ? parsed.pdfIncludeHeatmap
          : DEFAULT_SETTINGS.pdfIncludeHeatmap,
      pdfIncludePatientContact:
        typeof parsed.pdfIncludePatientContact === "boolean"
          ? parsed.pdfIncludePatientContact
          : DEFAULT_SETTINGS.pdfIncludePatientContact,
      followUpDaysModerate:
        typeof parsed.followUpDaysModerate === "number"
          ? parsed.followUpDaysModerate
          : DEFAULT_SETTINGS.followUpDaysModerate,
      urgentReviewHours:
        typeof parsed.urgentReviewHours === "number"
          ? parsed.urgentReviewHours
          : DEFAULT_SETTINGS.urgentReviewHours,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function setAppSettings(next: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

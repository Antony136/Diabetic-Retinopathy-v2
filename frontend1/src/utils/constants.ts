export const APP_NAME = "Retina Max";

export const DOCTOR_NAV_ITEMS = [
  { label: "Dashboard", icon: "grid_view", path: "/" },
  { label: "Screening", icon: "visibility", path: "/screening" },
  { label: "Records", icon: "folder_shared", path: "/records" },
  { label: "Timeline", icon: "timeline", path: "/timeline" },
  { label: "Triage", icon: "medical_services", path: "/triage" },
  { label: "Assistant", icon: "chat", path: "/assistant" },
  { label: "Batch", icon: "rocket_launch", path: "/batch-screening" },
  { label: "Settings", icon: "settings", path: "/settings" },
] as const;

export const ADMIN_NAV_ITEMS = [
  { label: "Overview", icon: "grid_view", path: "/admin/overview" },
  { label: "Doctors", icon: "clinical_notes", path: "/admin/doctors" },
  { label: "Patients", icon: "group", path: "/admin/patients" },
  { label: "Reports", icon: "summarize", path: "/admin/reports" },
] as const;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

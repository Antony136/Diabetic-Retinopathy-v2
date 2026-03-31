import api from "./api";

export type DoctorAssistantContextType = "patient" | "today_reports" | "reports_range" | "general";
export type DoctorAssistantPriority = "high" | "medium" | "low";
export type DoctorAssistantTask = "answer" | "triage_queue" | "draft_referral_letter" | "draft_followup_plan";
export type DoctorAssistantTimeframe = "today" | "7d" | "30d" | "90d" | "all" | "custom";

export interface DoctorAssistantExplainRequest {
  patient_id?: number | null;
  doctor_query: string;
  context_type: DoctorAssistantContextType;
  task?: DoctorAssistantTask;
  timeframe?: DoctorAssistantTimeframe | null;
  start_date?: string | null; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD
}

export interface DoctorAssistantExplainResponse {
  status: "success" | "error";
  answer?: string | null;
  priority?: DoctorAssistantPriority | null;
  summary?: string | null;

  message?: string | null;
  fallback?: string | null;

  priority_reason?: string | null;
  worsening_detected?: boolean | null;
  provider_used?: string | null;
}

export async function explainDoctorQuery(payload: DoctorAssistantExplainRequest) {
  const { data } = await api.post<DoctorAssistantExplainResponse>("/doctor-assistant/explain", payload);
  return data;
}

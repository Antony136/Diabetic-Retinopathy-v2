import api from "./api";

export type DoctorAssistantContextType = "patient" | "today_reports" | "general";
export type DoctorAssistantPriority = "high" | "medium" | "low";

export interface DoctorAssistantExplainRequest {
  patient_id?: number | null;
  doctor_query: string;
  context_type: DoctorAssistantContextType;
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


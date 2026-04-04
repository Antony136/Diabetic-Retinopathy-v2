import api from "./api";

export interface ReportResponse {
  id: number;
  patient_id: number;
  patient_name?: string;
  image_url: string;
  heatmap_url: string;
  prediction: string;
  confidence: number;
  description?: string | null;
  image_observations?: string | null;
  image_explanation?: string | null;
  
  // Adaptive Screening Mode
  risk_score?: number | null;
  risk_level?: string | null;
  decision?: string | null; // "Refer" or "Normal"
  mode?: string | null; // "standard" or "high_sensitivity"
  adaptive_explanation?: string | null;
  override_applied?: boolean;

  created_at: string;
  updated_at?: string;
}

export type AdaptiveScreeningMode = "standard" | "high_sensitivity";

export async function createReport(params: { 
  patientId: number; 
  file: File; 
  mode?: AdaptiveScreeningMode 
}) {
  const formData = new FormData();
  formData.append("file", params.file);

  const { data } = await api.post<ReportResponse>("/reports/", formData, {
    params: { 
      patient_id: params.patientId,
      mode: params.mode || "standard"
    },
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });
  return data;
}

export async function listReports() {
  const { data } = await api.get<ReportResponse[]>("/reports/");
  return data;
}

export async function listPatientReports(patientId: number) {
  const { data } = await api.get<ReportResponse[]>(`/reports/patient/${patientId}`);
  return data;
}

export async function createManualReport(params: {
  patient_id: number;
  prediction: string;
  confidence: number;
  description?: string;
}) {
  const { data } = await api.post<ReportResponse>("/reports/manual", params);
  return data;
}

export async function generateImageExplanation(reportId: number, force = false) {
  const { data } = await api.post<{ image_observations: string | null; image_explanation: string | null }>(
    `/reports/${reportId}/image-explanation`,
    null,
    { params: { force: force ? "1" : "0" } }
  );
  return data;
}

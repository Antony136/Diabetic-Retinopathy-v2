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

export interface BatchResultItem {
  status: "success" | "failed";
  name: string;
  image_url?: string;
  heatmap_url?: string;
  prediction?: string;
  confidence?: number;
  risk_score?: number;
  decision?: string;
  explanation?: string;
  clinical_summary?: string;
  reason?: string;
  metadata?: any;
}

export interface BatchReportResponse {
  total: number;
  successful: number;
  failed: number;
  results: BatchResultItem[];
  failed_items: { name: string; reason: string }[];
  batch_pdf_url: string;
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

export async function createBatchReports(params: {
  files: File[];
  csvFile?: File;
  mode?: AdaptiveScreeningMode;
  batchId?: string;
}) {
  const formData = new FormData();
  params.files.forEach((f) => formData.append("files", f));
  if (params.csvFile) formData.append("csv_file", params.csvFile);

  const { data } = await api.post<BatchReportResponse>("/reports/batch", formData, {
    params: { 
      mode: params.mode || "standard",
      batch_id: params.batchId
    },
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000, // 5 minutes for large batches
  });
  return data;
}

export async function getBatchProgress(batchId: string) {
  const { data } = await api.get<{ done: number; total: number }>(`/reports/batch/progress/${batchId}`);
  return data;
}


import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { resolveBackendImageUrl } from "../../services/apiBase";
import {
  createPatient,
  listPatients,
  type PatientResponse,
} from "../../services/patients";
import {
  createReport,
  generateImageExplanation,
  type ReportResponse,
} from "../../services/reports";
import { severityFromStage, stageDescription, getTreatmentWindow, getLesionRegion } from "./mockAnalysis";

import { getAppSettings } from "../../services/appSettings";
import { useScreeningMode } from "../../contexts/ScreeningModeContext";

type ReportRow = ReportResponse & { priority_score: 1 | 2 | 3 | 4 | 5 };


function toReportRow(report: ReportResponse): ReportRow {
  return { ...report, priority_score: severityFromStage(report.prediction) };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function formatPercent(confidence: number) {
  return `${(confidence * 100).toFixed(1)}%`;
}

interface StructuredExplanation {
  severity?: string;
  reasonings?: string[];
  lesions?: string;
  recommendations?: string;
}

function parseStructuredExplanation(jsonStr: string | null | undefined): StructuredExplanation | null {
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export default function Screening() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  const [patients, setPatients] = useState<PatientResponse[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [newName, setNewName] = useState("");
  const [newAge, setNewAge] = useState<number>(35);
  const [newGender, setNewGender] = useState("Male");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [report, setReport] = useState<ReportRow | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [imageExplainLoading, setImageExplainLoading] = useState(false);
  const [imageExplainError, setImageExplainError] = useState<string | null>(null);

  const { adaptiveMode, setAdaptiveMode } = useScreeningMode();

  const patientsById = useMemo(
    () => new Map(patients.map((p) => [p.id, p])),
    [patients],
  );
  
  const filteredPatients = useMemo(() => {
    if (!searchQuery) return patients;
    const lowerQuery = searchQuery.toLowerCase();
    return patients.filter((p) =>
      p.name.toLowerCase().includes(lowerQuery) || p.id.toString().includes(lowerQuery)
    );
  }, [patients, searchQuery]);

  const selectedPatient = selectedPatientId
    ? patientsById.get(selectedPatientId)
    : undefined;

  async function refreshPatients() {
    setPatientsError(null);
    setPatientsLoading(true);
    try {
      const data = await listPatients();
      setPatients(data);
      if (!selectedPatientId && data.length > 0) setSelectedPatientId(data[0]!.id);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to load patients";
      setPatientsError(message);
    } finally {
      setPatientsLoading(false);
    }
  }

  useEffect(() => {
    refreshPatients();
    
    // Add global paste listener for fundus images
    const handlePaste = (e: ClipboardEvent) => {
      // Don't paste if we're in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.includes("image")) {
          // Strict Rejection: GIFs (often used for testing or animations) are forbidden.
          if (item.type.includes("gif")) {
            setAnalysisError("Invalid image. Please upload a retinal fundus image (JPG/PNG only).");
            break;
          }
          const pastedFile = item.getAsFile();
          if (pastedFile) {
            onPickFile(pastedFile);
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreatePatient(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      const patient = await createPatient({
        name: newName.trim(),
        age: Number(newAge),
        gender: newGender,
        phone: newPhone.trim(),
        address: newAddress.trim(),
      });
      setPatients([patient, ...patients]);
      setSelectedPatientId(patient.id);
      setMode("existing");
      setNewName("");
      setNewPhone("");
      setNewAddress("");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to create patient";
      setCreateError(message);
    } finally {
      setCreateLoading(false);
    }
  }

  async function onPickFile(picked: File | null) {
    setAnalysisError(null);
    setReport(null);
    if (!picked) {
      setFile(null);
      setImagePreview(null);
      return;
    }

    // Strict Validation: Only allow JPG/JPEG/PNG (No GIF)
    const validExtensions = [".jpg", ".jpeg", ".png"];
    const filename = picked.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => filename.endsWith(ext));
    const hasValidMime = ["image/jpeg", "image/jpg", "image/png"].includes(picked.type);

    if (!hasValidExt || !hasValidMime) {
      setFile(null);
      setImagePreview(null);
      setAnalysisError("Invalid image. Please upload a retinal fundus image (JPG/PNG only).");
      return;
    }

    setFile(picked);
    const dataUrl = await readFileAsDataUrl(picked);
    setImagePreview(dataUrl);
  }

  async function onRunAnalysis() {
    setAnalysisError(null);
    setImageExplainError(null);
    if (!selectedPatientId) return setAnalysisError("No patient selected.");
    if (!file) return setAnalysisError("Please upload an image first.");

    setIsAnalyzing(true);
    try {
      const created = await createReport({ 
        patientId: selectedPatientId, 
        file,
        mode: adaptiveMode
      });
      setReport(toReportRow(created));
    } catch (error: unknown) {
      console.error("Analysis request failed", error);
      let message = "Failed to run analysis";
      if (error && typeof error === "object") {
        if ("response" in error) {
          const resp = (error as Record<string, unknown>).response;
          if (resp && typeof resp === "object") {
            const respObj = resp as Record<string, unknown>;
            if (respObj?.data) {
              const data = respObj.data as Record<string, unknown>;
              if (data?.detail) message = String(data.detail);
              else if (data?.error) message = String(data.error);
            }
            if (respObj?.statusText) message = `${respObj.statusText} (${respObj?.status})`;
          }
        }
        if ("message" in error && error.message) message = String(error.message);
      }
      setAnalysisError(message);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function onGenerateImageExplanation(force = false) {
    if (!report) return;
    setImageExplainError(null);
    setImageExplainLoading(true);
    try {
      const data = await generateImageExplanation(report.id, force);
      setReport((prev) => (prev ? { ...prev, ...data } : prev));
    } catch (error: unknown) {
      let message = "Failed to generate image explanation";
      if (error && typeof error === "object") {
        if ("response" in error) {
          const resp = (error as Record<string, unknown>).response;
          if (resp && typeof resp === "object") {
            const respObj = resp as Record<string, unknown>;
            if (respObj?.data) {
              const data = respObj.data as Record<string, unknown>;
              if (data?.detail) message = String(data.detail);
            }
          }
        }
        if ("message" in error && error.message) message = String(error.message);
      }
      setImageExplainError(message);
    } finally {
      setImageExplainLoading(false);
    }
  }

  function onReset() {
    setFile(null);
    setImagePreview(null);
    setReport(null);
    setAnalysisError(null);
    setDragActive(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onExportPdf() {
    if (!report || !selectedPatient) return;
    const frame = printFrameRef.current;
    if (!frame) return;

    const pdfSettings = getAppSettings();
    const imageUrl = resolveBackendImageUrl(report.image_url);
    const heatmapUrl = resolveBackendImageUrl(report.heatmap_url);
    const createdAt = new Date(report.created_at).toLocaleString();
    const paperSizeCss = pdfSettings.pdfPaperSize === "letter" ? "Letter" : "A4";

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Retina Max Report</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 18px; color: #111827; }
    h1 { margin: 0 0 6px; font-size: 20px; }
    .muted { color: #6b7280; font-size: 12px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px; }
    .card { border:1px solid #e5e7eb; border-radius:10px; padding:12px; }
    .row { display:grid; grid-template-columns:120px 1fr; gap:8px; margin:4px 0; font-size: 12px; }
    .k { color:#6b7280; }
    img { width: 100%; border-radius: 10px; border: 1px solid #e5e7eb; }
    @page { size: ${paperSizeCss}; margin: 12mm; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Retina Max - Diabetic Retinopathy Report</h1>
  <div class="muted">Generated: ${createdAt}</div>
  <div class="grid">
    <div class="card">
      <div style="font-weight:700; margin-bottom:6px;">Patient</div>
      <div class="row"><div class="k">ID</div><div>${selectedPatient.id}</div></div>
      <div class="row"><div class="k">Name</div><div>${selectedPatient.name}</div></div>
      <div class="row"><div class="k">Age</div><div>${selectedPatient.age}</div></div>
      <div class="row"><div class="k">Gender</div><div>${selectedPatient.gender}</div></div>
      ${
        pdfSettings.pdfIncludePatientContact
          ? `<div class="row"><div class="k">Phone</div><div>${selectedPatient.phone}</div></div>
      <div class="row"><div class="k">Address</div><div>${selectedPatient.address}</div></div>`
          : ""
      }
    </div>
    <div class="card">
      <div style="font-weight:700; margin-bottom:6px;">Report</div>
      <div class="row"><div class="k">Report ID</div><div>${report.id}</div></div>
      <div class="row"><div class="k">Prediction</div><div><b>${report.prediction}</b></div></div>
      <div class="row"><div class="k">Confidence</div><div>${formatPercent(report.confidence)}</div></div>
      <div class="row"><div class="k">Priority</div><div>${report.priority_score}/5</div></div>
      <div class="row"><div class="k">Summary</div><div>${stageDescription(report.prediction)}</div></div>
      <div class="row"><div class="k">Best Treatment Period</div><div style="color:#d946ef; font-weight:700;">${getTreatmentWindow(report.prediction)}</div></div>
      <div class="row"><div class="k">Affected Lesion Region</div><div>${getLesionRegion(report.prediction)}</div></div>
      <div class="row"><div class="k">Diagnostic System</div><div>Retina Max AI v2.0</div></div>
      <div class="row"><div class="k">AI Model</div><div>EfficientNet-B3 (PyTorch)</div></div>
    </div>
  </div>
  <div class="grid">
    <div class="card">
      <div style="font-weight:700; margin-bottom:6px;">Input Image</div>
      <img src="${imageUrl}" crossorigin="anonymous" />
    </div>
    ${
      pdfSettings.pdfIncludeHeatmap
        ? `<div class="card">
      <div style="font-weight:700; margin-bottom:6px;">Heatmap</div>
      <img src="${heatmapUrl}" crossorigin="anonymous" />
    </div>`
        : ""
    }
  </div>
  <div class="card" style="margin-top:12px; border-color:#fee2e2; background:#fef2f2;">
    <div style="color:#b91c1c; font-weight:800; font-size:10px; text-transform:uppercase; margin-bottom:4px;">⚠️ Medical Disclaimer & Risk Warning</div>
    <div style="font-size:10px; color:#7f1d1d; line-height:1.4;">
      This report is generated by an AI system (EfficientNet-B3). AI predictions are prone to errors and must NOT be used as the sole basis for diagnosis. 
      The heatmap indicates focus areas but may include artifacts. Final clinical decisions must be made by a qualified ophthalmologist after a physical examination.
    </div>
  </div>
</body>
</html>`;

    frame.onload = async () => {
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      if (!win || !doc) return;
      const images = Array.from(doc.images);
      await Promise.all(
        images.map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.onload = () => resolve();
                  img.onerror = () => resolve();
                }),
        ),
      );
      win.focus();
      // Final layout settle delay
      setTimeout(() => {
        win.print();
      }, 500);
    };

    frame.srcdoc = html;
  }

  const resolvedHeatmap = report ? resolveBackendImageUrl(report.heatmap_url) : "";
  const confidencePct = report ? Math.min(100, Math.max(0, report.confidence * 100)) : 0;

  const inputClass =
    "block w-full px-4 py-3 bg-surface-container-lowest border border-outline/10 rounded-xl font-body text-on-surface focus:ring-1 focus:ring-primary/40 focus:border-transparent transition-all outline-none";

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-32">
      <iframe ref={printFrameRef} title="print" className="absolute w-0 h-0 opacity-0 pointer-events-none" />

      <div className="mb-10">
        <h1 className="font-headline text-4xl font-extrabold tracking-tight mb-2">Patient Screening</h1>
        <p className="text-on-surface-variant max-w-2xl">
          Select a patient, upload a fundus image, run analysis, and export a PDF report.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <Card className="p-6 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between gap-3 mb-5">
              <h3 className="font-headline font-semibold text-lg">Patient</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("existing")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    mode === "existing"
                      ? "bg-primary/20 border-primary/30 text-primary"
                      : "border-outline/30 text-text-variant hover:bg-surface-container-high"
                  }`}
                >
                  Existing
                </button>
                <button
                  type="button"
                  onClick={() => setMode("new")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    mode === "new"
                      ? "bg-primary/20 border-primary/30 text-primary"
                      : "border-outline/30 text-text-variant hover:bg-surface-container-high"
                  }`}
                >
                  New
                </button>
              </div>
            </div>

            {patientsError && (
              <div className="rounded-xl bg-error-container/30 text-error px-4 py-3 text-sm mb-4">
                {patientsError}
              </div>
            )}

            {mode === "existing" ? (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-8 relative z-[100]">
                  <label className="block text-sm font-label text-on-surface-variant mb-2">
                    Search & Select Patient
                  </label>
                  <ul className="menu w-full">
                    <li className={`item w-full ${isDropdownOpen ? 'is-open' : ''}`}>
                      <div className="link w-full">
                        <input
                          type="text"
                          placeholder={patientsLoading ? "Loading patients..." : "Type patient name or ID..."}
                          value={searchQuery}
                          onFocus={() => setIsDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setIsDropdownOpen(true);
                            if (selectedPatientId) setSelectedPatientId(null);
                          }}
                          disabled={patientsLoading}
                          className="w-full bg-transparent outline-none text-white placeholder-white/80 font-bold"
                        />
                        <svg viewBox="0 0 360 360" xmlSpace="preserve" className="shrink-0 pointer-events-none">
                          <g id="SVGRepo_iconCarrier">
                            <path id="XMLID_225_" d="M325.607,79.046H34.393C15.401,79.046,0,94.448,0,113.439v133.122c0,18.991,15.401,34.393,34.393,34.393 h291.214c18.991,0,34.393-15.402,34.393-34.393V113.439C360,94.448,344.599,79.046,325.607,79.046z M300,165.733H193.303V133.2h106.697V165.733z M240.231,230.147H102.766V197.618h137.465V230.147z"></path>
                          </g>
                        </svg>
                      </div>
                      <ul className="submenu w-full border-t-0 shadow-2xl custom-scrollbar">
                        {filteredPatients.length === 0 ? (
                          <li className="submenu-item py-4 text-center text-text-variant text-sm">
                            No matching patients found.
                          </li>
                        ) : (
                          filteredPatients.map((p) => (
                            <li className="submenu-item" key={p.id}>
                              <button
                                type="button"
                                className="submenu-link"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setSelectedPatientId(p.id);
                                  setSearchQuery(p.name);
                                  setIsDropdownOpen(false);
                                }}
                              >
                                <span className="font-bold text-text-primary">{p.name}</span> <span className="opacity-50 text-xs">(#{p.id})</span>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </li>
                  </ul>
                </div>
                <div className="md:col-span-4">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    icon="refresh"
                    disabled={patientsLoading}
                    onClick={refreshPatients}
                  >
                    Refresh
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={onCreatePatient} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-label text-on-surface-variant mb-2">
                      Name
                    </label>
                    <input className={inputClass} value={newName} onChange={(e) => setNewName(e.target.value)} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-label text-on-surface-variant mb-2">
                        Age
                      </label>
                      <input className={inputClass} type="number" min={0} value={newAge} onChange={(e) => setNewAge(Number(e.target.value))} required />
                    </div>
                    <div>
                      <label className="block text-sm font-label text-on-surface-variant mb-2">
                        Gender
                      </label>
                      <select className={inputClass} value={newGender} onChange={(e) => setNewGender(e.target.value)}>
                        <option className="bg-surface text-secondary-bright font-extrabold py-2">Male</option>
                        <option className="bg-surface text-secondary-bright font-extrabold py-2">Female</option>
                        <option className="bg-surface text-secondary-bright font-extrabold py-2">Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-label text-on-surface-variant mb-2">Phone</label>
                    <input className={inputClass} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} required />
                  </div>
                  <div>
                    <label className="block text-sm font-label text-on-surface-variant mb-2">Address</label>
                    <input className={inputClass} value={newAddress} onChange={(e) => setNewAddress(e.target.value)} required />
                  </div>
                </div>

                {createError && <div className="rounded-xl bg-error-container/30 text-error px-4 py-3 text-sm">{createError}</div>}

                <div className="flex gap-3 justify-end pt-1">
                  <Button type="button" variant="ghost" onClick={() => setMode("existing")}>Cancel</Button>
                  <Button type="submit" disabled={createLoading} icon="person_add">{createLoading ? "Creating..." : "Create Patient"}</Button>
                </div>
              </form>
            )}
          </Card>

          <section
            className={`rounded-xl p-8 flex flex-col items-center justify-center border-2 border-dashed transition-all duration-300 cursor-pointer h-[280px] ${
              dragActive ? "bg-primary/10 border-primary/60" : "bg-surface-container-low border-outline-variant/20 hover:border-primary/40"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => { e.preventDefault(); setDragActive(false); void onPickFile(e.dataTransfer.files?.[0] ?? null); }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            <div className="bg-surface-container-high w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-primary text-3xl">upload_file</span>
            </div>
            <h3 className="font-headline text-xl font-bold mb-2">Upload Retinal Image</h3>
            <p className="text-on-surface-variant text-sm text-center max-w-xs mb-5">Drag & drop, browse, or paste (Ctrl+V). PNG/JPG supported.</p>
            <button type="button" className="bg-gradient-to-r from-primary to-primary-container text-on-primary-container font-bold px-6 py-2.5 rounded-lg transition-transform active:scale-95 shadow-lg shadow-primary/10 hover:scale-[1.02]">
              Browse Files
            </button>
            {file && <div className="mt-4 text-xs text-on-surface-variant">Selected: <span className="font-semibold">{file.name}</span></div>}
          </section>

          <section className="bg-surface-container-low rounded-xl overflow-hidden relative shadow-2xl shadow-black/10">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
              <h3 className="font-headline font-semibold text-lg">Input Preview</h3>
              <span className="text-xs font-medium text-on-surface-variant px-2 py-1 bg-surface-container rounded-md">
                Patient: {selectedPatient ? `#${selectedPatient.id}` : "—"}
              </span>
            </div>
            <div className="aspect-video w-full bg-surface-container-lowest relative overflow-hidden flex items-center justify-center">
              {imagePreview ? (
                <>
                  <img
                    alt="Uploaded fundus photograph"
                    className={`w-full h-full object-cover transition-all duration-500 ${isAnalyzing ? "opacity-70 blur-[1px]" : "opacity-100"}`}
                    src={imagePreview}
                  />
                  {isAnalyzing && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-surface/80 backdrop-blur-md border border-border">
                        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        <span className="text-sm font-bold text-text-primary">Analyzing…</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-on-surface-variant text-sm">No image selected</div>
              )}
            </div>
            <div className="p-6 flex flex-col gap-5 border-t border-outline-variant/10">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase tracking-widest text-on-surface-variant font-bold block mb-1">Screening Mode</span>
                  <p className="text-[11px] text-on-surface-variant/70 italic">Adjust sensitivity for early detection vs camp efficiency.</p>
                </div>
                <div className="flex p-1 bg-surface-container-high rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => setAdaptiveMode("standard")}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                      adaptiveMode === "standard"
                        ? "bg-surface-container-lowest text-primary shadow-sm ring-1 ring-black/5"
                        : "text-on-surface-variant hover:text-on-surface bg-transparent"
                    }`}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdaptiveMode("high_sensitivity")}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                      adaptiveMode === "high_sensitivity"
                        ? "bg-surface-container-lowest text-secondary shadow-sm ring-1 ring-black/5"
                        : "text-on-surface-variant hover:text-on-surface bg-transparent"
                    }`}
                  >
                    High Sensitivity
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={onReset} disabled={isAnalyzing}>Clear</Button>
                <Button type="button" onClick={onRunAnalysis} disabled={isAnalyzing || !selectedPatientId || !file} icon="auto_awesome">
                  {isAnalyzing ? "Analyzing..." : "Run Analysis"}
                </Button>
              </div>
            </div>
            {analysisError && (
              <div className="px-6 pb-6 -mt-3">
                <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-3 border transition-all duration-500 ${
                  analysisError.includes("retinal fundus image")
                    ? "bg-primary/5 border-primary/20 text-text-primary animate-in fade-in slide-in-from-top-2"
                    : "bg-error/5 border-error/20 text-error"
                }`}>
                  <span className={`material-symbols-outlined text-lg ${
                    analysisError.includes("retinal fundus image") ? "text-primary" : "text-error"
                  }`}>
                    {analysisError.includes("retinal fundus image") ? "info_i" : "error"}
                  </span>
                  <span className="font-medium tracking-tight">{analysisError}</span>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Results Section - Split Layout */}
        {report && (
          <div className="lg:col-span-12 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Quick Analysis */}
              <section className="bg-surface-container-low rounded-xl p-6 shadow-2xl shadow-black/20">
                <h3 className="font-headline text-xl font-bold mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">analytics</span>
                  Analysis Results
                  <span className={`w-2 h-2 rounded-full ${report ? "bg-primary animate-pulse" : "bg-outline/40"}`} />
                </h3>

                <div className="space-y-5">
                  {/* Prediction Card */}
                  <div className="space-y-2">
                    <span className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Prediction</span>
                    <div className="bg-tertiary-container/10 border border-tertiary-container/20 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-2xl font-bold text-tertiary">{report.prediction}</h4>
                        <span className="text-xs font-bold px-2 py-1 rounded-md bg-surface-container-high text-on-surface-variant">
                          Priority {report.priority_score}/5
                        </span>
                      </div>
                      <p className="text-sm text-on-surface-variant leading-relaxed">{stageDescription(report.prediction)}</p>
                    </div>
                  </div>

                  {/* Quick Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black">Treatment Window</span>
                      <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                        <div className="text-xs font-bold text-primary">{getTreatmentWindow(report.prediction)}</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black">Focal Point</span>
                      <div className="bg-orange-500/5 border border-orange-500/10 rounded-lg p-3">
                        <div className="text-xs font-bold text-orange-500">{getLesionRegion(report.prediction)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Confidence Score */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Confidence</span>
                      <span className="text-2xl font-headline font-extrabold text-primary">
                        {confidencePct.toFixed(1)}<span className="text-sm">%</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-[width] duration-700 ease-out" style={{ width: `${confidencePct}%` }} />
                    </div>
                  </div>

                  {/* Heatmap */}
                  <div className="space-y-2">
                    <span className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Heatmap</span>
                    <div className="aspect-square w-full rounded-xl bg-surface-container-lowest relative overflow-hidden">
                      {resolvedHeatmap ? (
                        <img alt="Heatmap visualization" className="w-full h-full object-cover opacity-90" src={resolvedHeatmap} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-on-surface-variant text-sm">No heatmap</div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent" />
                    </div>
                  </div>

                  {/* Clinical Decision */}
                  {report.decision && (
                    <div className="space-y-3">
                      <span className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Clinical Decision</span>
                      <div 
                        className={`rounded-xl p-4 border-2 flex flex-col gap-3 transition-all ${
                          report.decision === "Refer" 
                            ? "bg-error-container/10 border-error/20" 
                            : "bg-success-container/10 border-success/20"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined text-2xl ${
                            report.decision === "Refer" ? "text-error" : "text-success"
                          }`}>
                            {report.decision === "Refer" ? "emergency_home" : "check_circle"}
                          </span>
                          <h4 className={`font-bold ${
                            report.decision === "Refer" ? "text-error" : "text-success"
                          }`}>
                            {report.decision === "Refer" ? "REFER FOR CARE" : "NORMAL / MONITOR"}
                          </h4>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[10px] text-on-surface-variant uppercase font-bold">Risk Score</p>
                            <p className="text-lg font-headline font-black text-on-surface">{(report.risk_score || 0).toFixed(3)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-on-surface-variant uppercase font-bold">Risk Level</p>
                            <p className={`font-bold ${
                              report.override_applied ? "text-error" : report.risk_level === "High" ? "text-error" : report.risk_level === "Moderate" ? "text-primary" : "text-success"
                            }`}>
                              {report.override_applied ? "CRITICAL" : (report.risk_level || "Low")}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Right Column: Structured Explanation */}
              <section className="bg-surface-container-low rounded-xl p-6 shadow-2xl shadow-black/20">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <h3 className="font-headline text-xl font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary">description</span>
                    Details
                  </h3>
                  <button
                    type="button"
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors disabled:opacity-50"
                    disabled={!report || imageExplainLoading}
                    onClick={() => onGenerateImageExplanation(Boolean(report?.image_explanation))}
                    title="Generate or refresh explanations"
                  >
                    {imageExplainLoading ? "Generating..." : report?.image_explanation ? "Refresh" : "Generate"}
                  </button>
                </div>

                {imageExplainError && (
                  <div className="rounded-xl bg-error-container/30 text-error px-4 py-3 text-sm mb-4">{imageExplainError}</div>
                )}

                {report.image_explanation ? (
                  <div className="space-y-4">
                    {/* Summary */}
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                      <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Summary</p>
                      <p className="text-sm font-semibold text-on-surface leading-snug">
                        {report.image_explanation_summary || "Analyzing patterns..."}
                      </p>
                    </div>

                    {/* Structured Components */}
                    {(() => {
                      const structured = parseStructuredExplanation(report.image_explanation_structured);
                      if (!structured) return null;

                      return (
                        <div className="space-y-4">
                          {/* Severity */}
                          {structured.severity && (
                            <div className="rounded-lg border border-secondary/20 bg-secondary/5 p-4">
                              <p className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Severity Level</p>
                              <p className={`text-lg font-bold ${
                                structured.severity === "High" ? "text-error" :
                                structured.severity === "Moderate" ? "text-warning" :
                                "text-success"
                              }`}>
                                {structured.severity}
                              </p>
                            </div>
                          )}

                          {/* Reasonings */}
                          {structured.reasonings && structured.reasonings.length > 0 && (
                            <div className="rounded-lg border border-tertiary/20 bg-tertiary/5 p-4">
                              <p className="text-[10px] font-bold text-tertiary uppercase tracking-wider mb-3">Key Findings</p>
                              <ul className="space-y-2">
                                {structured.reasonings.map((reason, idx) => (
                                  <li key={idx} className="text-xs text-on-surface-variant leading-relaxed flex gap-2">
                                    <span className="text-tertiary font-bold">•</span>
                                    <span>{reason}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Lesions */}
                          {structured.lesions && (
                            <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
                              <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-2">Lesion Analysis</p>
                              <p className="text-xs text-on-surface-variant leading-relaxed">
                                {structured.lesions}
                              </p>
                            </div>
                          )}

                          {/* Recommendations */}
                          {structured.recommendations && (
                            <div className="rounded-lg border border-success/20 bg-success/5 p-4">
                              <p className="text-[10px] font-bold text-success uppercase tracking-wider mb-2">Recommendations</p>
                              <p className="text-xs text-on-surface-variant leading-relaxed">
                                {structured.recommendations}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Full Detailed Text */}
                    {report.image_explanation && (
                      <div className="rounded-lg border border-outline/20 bg-surface-container-lowest p-4 text-xs text-on-surface-variant">
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Full Analysis</p>
                        <p className="leading-relaxed whitespace-pre-line">
                          {report.image_explanation}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-outline/10 bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
                    No details yet. Click Generate to create detailed analysis.
                  </div>
                )}
              </section>
            </div>

            {/* Export Buttons */}
            <div className="flex gap-4">
              <button
                type="button"
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-on-primary rounded-lg text-sm font-bold hover:bg-primary-container transition-colors disabled:opacity-50"
                disabled={!report || !selectedPatient}
                onClick={onExportPdf}
              >
                <span className="material-symbols-outlined text-sm">print</span>
                Export PDF
              </button>
              <button
                type="button"
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-surface-container-high rounded-lg text-sm font-bold hover:text-primary transition-colors"
                onClick={onReset}
              >
                <span className="material-symbols-outlined text-sm">restart_alt</span>
                New Scan
              </button>
            </div>
          </div>
        )}

        {/* No Report Placeholder */}
        {!report && (
          <div className="lg:col-span-12 text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <span className="material-symbols-outlined text-6xl text-on-surface-variant/30">description</span>
              <p className="text-on-surface-variant">Upload an image and run analysis to see results.</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
import Card from "../../components/ui/Card";
import { getRecords, getTriageCases } from "../../services/api";
import PatientDetailsModal from "../../components/patients/PatientDetailsModal";
import { API_BASE_URL } from "../../utils/constants";
import { getAppSettings } from "../../services/appSettings";
import { severityFromStage, stageDescription, getTreatmentWindow, getLesionRegion } from "../screening/mockAnalysis";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';


interface PatientRecord {
  id: number;
  name: string;
  age?: number;
  gender?: string;
  phone?: string;
  address?: string;
  created_at: string;
  latest_prediction?: string;
  latest_confidence?: number;
}

const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

function resolveBackendUrl(pathOrUrl: string) {
  if (!pathOrUrl) return "";
  if (
    pathOrUrl.startsWith("http://") ||
    pathOrUrl.startsWith("https://") ||
    pathOrUrl.startsWith("data:")
  ) {
    return pathOrUrl;
  }
  const normalized = pathOrUrl.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${BACKEND_ORIGIN}/${normalized}`;
}

function formatPercent(confidence: number) {
  return `${(confidence * 100).toFixed(1)}%`;
}

function getInitials(name: string) {
  if (!name) return "?";
  return name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
}

function getSeverityStyles(prediction?: string) {
  if (!prediction) return "bg-surface-container-high text-on-surface-variant";
  if (["Severe", "Proliferative DR"].includes(prediction)) return "bg-error-container/20 text-error";
  if (["Moderate", "Mild"].includes(prediction)) return "bg-tertiary-container/20 text-tertiary-dim";
  if (prediction === "No DR") return "bg-primary-container/20 text-primary";
  return "bg-surface-container-high text-on-surface-variant";
}

export default function Records() {
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [patientModalId, setPatientModalId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("All Severities");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const pageSize = 10;

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params: { search?: string; severity?: string } = {};
      if (search) params.search = search;
      if (severity !== "All Severities") params.severity = severity;
      const data = await getRecords(params);
      setPatients(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, severity]);

  useEffect(() => {
    setCurrentPage(1);
    const timer = setTimeout(() => {
      fetchRecords();
    }, 500);
    return () => clearTimeout(timer);
  }, [fetchRecords]);

  const totalPages = Math.ceil(patients.length / pageSize) || 1;
  const displayedPatients = patients.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleDownloadReport = async (patient: PatientRecord) => {
    if (downloadingId) return;
    setDownloadingId(patient.id);
    
    try {
      // Find the latest report for this patient
      const reports = await getTriageCases(); 
      // TriageCases actually returns all reports for the current doctor. 
      // We'll use this since we just need the report data.
      const patientReports = reports.filter((r: { patient_id: number; created_at: string }) => r.patient_id === patient.id);
      
      if (patientReports.length === 0) {
        alert("No complete report found for this patient.");
        setDownloadingId(null);
        return;
      }
      
      // Get the most recent report
      const report = patientReports.sort((a: { created_at: string }, b: { created_at: string }) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      const frame = printFrameRef.current;
      if (!frame) return;

      const pdfSettings = getAppSettings();
      const imageUrl = resolveBackendUrl(report.image_url);
      const heatmapUrl = resolveBackendUrl(report.heatmap_url);
      const createdAt = new Date(report.created_at).toLocaleString();
      const paperSizeCss = pdfSettings.pdfPaperSize === "letter" ? "Letter" : "A4";
      const priorityScore = severityFromStage(report.prediction);

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
      <div class="row"><div class="k">ID</div><div>${patient.id}</div></div>
      <div class="row"><div class="k">Name</div><div>${patient.name}</div></div>
      <div class="row"><div class="k">Age</div><div>${patient.age || 'N/A'}</div></div>
      <div class="row"><div class="k">Gender</div><div>${patient.gender || 'N/A'}</div></div>
      ${pdfSettings.pdfIncludePatientContact ? `
        <div class="row"><div class="k">Phone</div><div>${patient.phone || 'N/A'}</div></div>
        <div class="row"><div class="k">Address</div><div>${patient.address || 'N/A'}</div></div>
      ` : ''}
    </div>
    <div class="card">
      <div style="font-weight:700; margin-bottom:6px;">Report</div>
      <div class="row"><div class="k">Report ID</div><div>${report.id}</div></div>
      <div class="row"><div class="k">Prediction</div><div><b>${report.prediction}</b></div></div>
      <div class="row"><div class="k">Confidence</div><div>${formatPercent(report.confidence)}</div></div>
      <div class="row"><div class="k">Priority</div><div>${priorityScore}/5</div></div>
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
        if (!win || !doc) {
          setDownloadingId(null);
          return;
        }
        
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
          setDownloadingId(null);
        }, 500);
      };

      frame.srcdoc = html;

    } catch (e) {
      console.error(e);
      alert("Failed to generate report PDF.");
      setDownloadingId(null);
    }
  };

  // 1. STATS CALCULATION
  const severityCounts = [
    { name: 'No DR', value: patients.filter(p => p.latest_prediction === 'No DR').length, color: '#3b82f6' },
    { name: 'Mild', value: patients.filter(p => p.latest_prediction === 'Mild').length, color: '#0ea5e9' },
    { name: 'Moderate', value: patients.filter(p => p.latest_prediction === 'Moderate').length, color: '#8b5cf6' },
    { name: 'Severe', value: patients.filter(p => p.latest_prediction === 'Severe').length, color: '#f43f5e' },
    { name: 'Proliferative DR', value: patients.filter(p => p.latest_prediction === 'Proliferative DR').length, color: '#e11d48' },
  ].filter(s => s.value > 0);

  // 2. CSV EXPORT
  const handleExportCSV = () => {
    if (patients.length === 0) {
      alert("No data available to export.");
      return;
    }
    const headers = "ID,Patient Name,Screening Date,Prediction,Confidence,Created At\n";
    const rows = patients.map(p => {
      const idStr = `RET-${p.id.toString().padStart(4, '0')}`;
      const name = `"${p.name.replace(/"/g, '""')}"`;
      const date = new Date(p.created_at).toLocaleDateString();
      const pred = p.latest_prediction || 'Pending';
      const conf = p.latest_confidence ? (p.latest_confidence * 100).toFixed(1) + '%' : 'N/A';
      return `${idStr},${name},${date},${pred},${conf},${p.created_at}`;
    }).join("\n");

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `RetinaMax_Records_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. BATCH PDF GENERATION (Summary Report)
  const handleGenerateSummaryPDF = () => {
    if (patients.length === 0) {
      alert("No data available to generate report.");
      return;
    }
    const frame = printFrameRef.current;
    if (!frame) return;

    const rowsHtml = patients.map((p, idx) => `
      <tr style="background: ${idx % 2 === 0 ? '#f9fafb' : '#ffffff'}; border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 10px; font-size: 11px;">RET-${p.id.toString().padStart(4, '0')}</td>
        <td style="padding: 10px; font-size: 11px;">${p.name}</td>
        <td style="padding: 10px; font-size: 11px;">${new Date(p.created_at).toLocaleDateString()}</td>
        <td style="padding: 10px; font-size: 11px; font-weight:700;">${p.latest_prediction || 'N/A'}</td>
        <td style="padding: 10px; font-size: 11px;">${p.latest_confidence ? (p.latest_confidence * 100).toFixed(1) + '%' : 'N/A'}</td>
      </tr>
    `).join("");

    const statsSummary = severityCounts.map(s => `
      <div style="padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px; text-align:center;">
        <div style="font-size: 10px; color:#6b7280; text-transform:uppercase;">${s.name}</div>
        <div style="font-size: 16px; font-weight:700; color:${s.color};">${s.value}</div>
      </div>
    `).join("");

    const html = `<!doctype html>
<html>
<head>
  <style>
    body { font-family: sans-serif; padding: 20px; color: #111827; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .header { border-bottom: 2px solid #ef4444; padding-bottom: 12px; margin-bottom: 20px; }
    .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #f3f4f6; padding: 10px; font-size: 12px; color: #4b5563; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Retina Max - Records Summary Report</h1>
    <div style="color: #6b7280; font-size: 12px;">Generated on: ${new Date().toLocaleString()}</div>
  </div>
  
  <div style="font-size: 14px; font-weight:700; margin-bottom: 8px;">Severity Distribution</div>
  <div class="stats-grid">${statsSummary}</div>

  <div style="font-size: 14px; font-weight:700; margin-bottom: 8px;">Patient Screening Logs</div>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Patient Name</th>
        <th>Screen Date</th>
        <th>Result</th>
        <th>Confidence</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <div style="margin-top: 24px; font-size: 10px; color:#9ca3af; text-align:center;">
    This is an automated report generated by the Retina Max AI Screening System.
  </div>
</body>
</html>`;

    frame.srcdoc = html;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    };
  };


  return (
    <main className="pt-24 pb-32 px-8 max-w-7xl mx-auto">
      <iframe ref={printFrameRef} title="print" className="absolute w-0 h-0 opacity-0 pointer-events-none" />
      {/* Header */}
      <div className="mb-10">
        <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface mb-2">
          Records
        </h1>
        <p className="font-body text-on-surface-variant text-lg">
          Centralized historical patient screening database and AI diagnostics.
        </p>
      </div>

      {/* Filter & Search */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
        <div className="md:col-span-8">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-outline">search</span>
            </div>
            <input
              className="block w-full pl-12 pr-4 py-4 bg-surface-container-lowest border border-outline/10 rounded-xl font-body text-on-surface focus:ring-1 focus:ring-primary/40 focus:border-transparent transition-all outline-none"
              placeholder="Search by patient name, ID or specialist..."
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="md:col-span-4 flex gap-4">
          <div className="relative w-full">
            <select 
              className="appearance-none w-full bg-surface-container-low border-none rounded-xl px-4 py-4 pr-10 font-label text-on-surface-variant focus:ring-1 focus:ring-primary/40 outline-none"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option>All Severities</option>
              <option>Critical</option>
              <option>Moderate</option>
              <option>Stable</option>
            </select>
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-outline">filter_list</span>
            </div>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <Card className="overflow-hidden shadow-2xl">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-high">
                {["Patient Name", "Date", "Result", "Confidence", "Actions"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-6 py-5 font-headline text-sm font-semibold text-on-surface-variant uppercase tracking-wider ${
                      i === 3 ? "text-center" : i === 4 ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-on-surface-variant">Loading...</td>
                </tr>
              ) : displayedPatients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-on-surface-variant">No records found.</td>
                </tr>
              ) : displayedPatients.map((p) => (
                <tr key={p.id} className="hover:bg-surface-container-highest transition-colors">
                  <td className="px-6 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-primary font-bold">
                        {getInitials(p.name)}
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => setPatientModalId(p.id)}
                          className="font-body font-semibold text-on-surface hover:text-primary transition-colors text-left"
                          title="View patient details"
                        >
                          {p.name}
                        </button>
                        <div className="text-xs text-on-surface-variant">ID: #RET-{(p.id).toString().padStart(4, '0')}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6 font-body text-on-surface-variant">
                    {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-6 py-6">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${getSeverityStyles(p.latest_prediction)}`}>
                      {p.latest_prediction || "Pending Assessment"}
                    </span>
                  </td>
                  <td className="px-6 py-6 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-headline font-bold text-primary">
                        {p.latest_confidence ? `${(p.latest_confidence * 100).toFixed(1)}%` : "N/A"}
                      </span>
                      {p.latest_confidence && (
                        <div className="w-20 h-1 bg-surface-container rounded-full overflow-hidden">
                          <div className="bg-primary h-full" style={{ width: `${(p.latest_confidence || 0) * 100}%` }} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-6 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setPatientModalId(p.id)}
                        className="p-2 text-on-surface-variant hover:text-primary transition-colors"
                        title="View"
                        aria-label="View"
                      >
                        <span className="material-symbols-outlined">visibility</span>
                      </button>
                      <button 
                        onClick={() => handleDownloadReport(p)}
                        disabled={downloadingId === p.id}
                        className="p-2 text-on-surface-variant hover:text-primary transition-colors disabled:opacity-50">
                        {downloadingId === p.id ? (
                          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        ) : (
                          <span className="material-symbols-outlined">download</span>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-surface-container-low flex items-center justify-between border-t border-outline-variant/10">
          <span className="font-label text-sm text-on-surface-variant">
            Showing {displayedPatients.length} of {patients.length} {patients.length === 1 ? 'record' : 'records'}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-primary/20 hover:text-primary transition-all disabled:opacity-30">
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button 
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                    currentPage === page 
                      ? "bg-primary-container text-on-primary-container" 
                      : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="p-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-primary/20 hover:text-primary transition-all disabled:opacity-30">
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Bottom Section */}
      <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Data Insights replacing Historical Trends */}
        <div className="lg:col-span-2 bg-surface-container-low rounded-2xl p-8 border border-outline-variant/10 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-headline text-xl font-bold flex items-center gap-2 text-on-surface">
              <span className="material-symbols-outlined text-primary">analytics</span>
              Severity Analysis
            </h3>
            <div className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full uppercase tracking-wider">
              Real-time Insights
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {/* Recharts Pie */}
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={severityCounts}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {severityCounts.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Stats Summary Card */}
            <div className="space-y-4">
              <div className="p-4 bg-surface-container-high rounded-xl border border-outline/5">
                <div className="text-on-surface-variant text-sm font-label mb-1">Total Screenings</div>
                <div className="text-3xl font-headline font-extrabold text-primary">{patients.length}</div>
              </div>
              <div className="p-4 bg-error-container/10 rounded-xl border border-error/5">
                <div className="text-error/80 text-sm font-label mb-1">Critical Cases (High Risk)</div>
                <div className="text-3xl font-headline font-extrabold text-error">
                  {patients.filter(p => ["Severe", "Proliferative DR"].includes(p.latest_prediction || '')).length}
                </div>
              </div>
              <div className="p-4 bg-primary-container/10 rounded-xl border border-primary/5">
                <div className="text-primary/80 text-sm font-label mb-1">Stable / Clear</div>
                <div className="text-3xl font-headline font-extrabold text-primary">
                  {patients.filter(p => !p.latest_prediction || p.latest_prediction === 'No DR' || p.latest_prediction === 'Mild').length}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Export Controls */}
        <div className="bg-gradient-to-br from-surface-container-high to-surface-container border border-outline-variant/10 rounded-2xl p-8 shadow-sm flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-primary">ios_share</span>
            </div>
            <h3 className="font-headline text-2xl font-black mb-3 text-on-surface">Export Center</h3>
            <p className="font-body text-on-surface-variant mb-8 text-sm leading-relaxed">
              Generate legal documentation and portable data formats for medical compliance or further research.
            </p>
          </div>
          
          <div className="space-y-4">
            <button 
              onClick={handleGenerateSummaryPDF}
              className="w-full py-4 bg-primary text-on-primary font-headline font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-[0.98]">
              <span className="material-symbols-outlined text-[20px]">print</span>
              Full Summary (PDF)
            </button>
            <button 
              onClick={handleExportCSV}
              className="w-full py-4 bg-surface-container-highest text-on-surface font-headline font-bold border border-outline/10 rounded-xl flex items-center justify-center gap-2 hover:bg-surface-container transition-all active:scale-[0.98]">
              <span className="material-symbols-outlined text-[20px]">csv</span>
              Dataset Export (CSV)
            </button>
          </div>
        </div>
      </div>

      <PatientDetailsModal patientId={patientModalId} onClose={() => setPatientModalId(null)} />

    </main>
  );
}

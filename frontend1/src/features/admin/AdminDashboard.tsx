import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import api from "../../services/api";
import { getActiveBackendOrigin } from "../../services/apiBase";
import { severityFromStage, stageDescription } from "../screening/mockAnalysis";

type AdminUser = { id: number; name: string; email: string; role: string; is_active?: boolean; created_at?: string };
type AdminPatient = {
  id: number;
  name: string;
  age: number;
  gender: string;
  phone: string;
  address: string;
  created_at: string;
  doctor_id: number;
};
type AdminReport = {
  id: number;
  patient_id: number;
  image_url: string;
  heatmap_url: string;
  prediction: string;
  confidence: number;
  created_at: string;
};

const BACKEND_ORIGIN = getActiveBackendOrigin();

function resolveBackendUrl(pathOrUrl: string) {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://") || pathOrUrl.startsWith("data:")) return pathOrUrl;
  const normalized = pathOrUrl.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${BACKEND_ORIGIN}/${normalized}`;
}

function sameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatCompact(n: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(n);
}

function formatPercent(confidence: number) {
  return `${(confidence * 100).toFixed(1)}%`;
}

function SvgBars(props: {
  labels: string[];
  values: number[];
  xLabel: string;
  yLabel: string;
  yUnit?: string;
  colors?: string[];
}) {
  const { labels, values, xLabel, yLabel, yUnit } = props;
  const width = 720;
  const height = 240;
  const axisLeft = 52;
  const axisBottom = 52;
  const paddingRight = 16;
  const paddingTop = 16;
  const plotW = width - axisLeft - paddingRight;
  const plotH = height - paddingTop - axisBottom;
  const max = Math.max(1, ...values);
  const barW = plotW / Math.max(1, values.length);

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-on-surface-variant mb-3">
        <span>X: {xLabel}</span>
        <span>Y: {yLabel}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-72 text-on-surface-variant">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = paddingTop + plotH * (1 - t);
          const v = Math.round(max * t);
          return (
            <g key={t}>
              <line
                x1={axisLeft}
                x2={width - paddingRight}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.14"
                strokeWidth="1"
              />
              <text x={axisLeft - 10} y={y + 5} textAnchor="end" fontSize="16" fill="currentColor" fillOpacity="0.85">
                {v}
              </text>
            </g>
          );
        })}
        <line x1={axisLeft} x2={axisLeft} y1={paddingTop} y2={paddingTop + plotH} stroke="currentColor" strokeOpacity="0.35" />
        <line
          x1={axisLeft}
          x2={width - paddingRight}
          y1={paddingTop + plotH}
          y2={paddingTop + plotH}
          stroke="currentColor"
          strokeOpacity="0.35"
        />

        {values.map((v, i) => {
          const h = (plotH * v) / max;
          const x = axisLeft + i * barW + 10;
          const y = paddingTop + plotH - h;
          const w = Math.max(12, barW - 20);
          const fill = props.colors?.[i] ?? "rgb(148,34,156)";
          return (
            <g key={labels[i] ?? i}>
              <rect x={x} y={y} width={w} height={h} rx="10" fill={fill} fillOpacity="0.86" />
              <text x={x + w / 2} y={y - 8} textAnchor="middle" fontSize="16" fontWeight="700" fill="currentColor" fillOpacity="0.9">
                {v}
              </text>
              <text x={x + w / 2} y={height - 16} textAnchor="middle" fontSize="16" fill="currentColor" fillOpacity="0.9">
                {labels[i]}
              </text>
            </g>
          );
        })}

        {yUnit && (
          <text x={axisLeft} y={12} textAnchor="start" fontSize="16" fill="currentColor" fillOpacity="0.75">
            {yUnit}
          </text>
        )}
      </svg>
    </div>
  );
}

function SvgLine(props: { values: number[]; xLabel: string; yLabel: string; yUnit?: string; xStartLabel?: string; xEndLabel?: string }) {
  const width = 740;
  const height = 240;
  const axisLeft = 52;
  const axisBottom = 52;
  const paddingRight = 16;
  const paddingTop = 16;
  const plotW = width - axisLeft - paddingRight;
  const plotH = height - paddingTop - axisBottom;

  const max = Math.max(1, ...props.values);
  const min = Math.min(0, ...props.values);
  const span = Math.max(1, max - min);
  const stepX = plotW / Math.max(1, props.values.length - 1);

  const points = props.values
    .map((v, i) => {
      const x = axisLeft + i * stepX;
      const y = paddingTop + (plotH * (max - v)) / span;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-on-surface-variant mb-3">
        <span>X: {props.xLabel}</span>
        <span>Y: {props.yLabel}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-72 text-on-surface-variant">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = paddingTop + plotH * (1 - t);
          const v = Math.round(min + (max - min) * t);
          return (
            <g key={t}>
              <line x1={axisLeft} x2={width - paddingRight} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.14" />
              <text x={axisLeft - 10} y={y + 5} textAnchor="end" fontSize="16" fill="currentColor" fillOpacity="0.85">
                {v}
              </text>
            </g>
          );
        })}
        <line x1={axisLeft} x2={axisLeft} y1={paddingTop} y2={paddingTop + plotH} stroke="currentColor" strokeOpacity="0.35" />
        <line
          x1={axisLeft}
          x2={width - paddingRight}
          y1={paddingTop + plotH}
          y2={paddingTop + plotH}
          stroke="currentColor"
          strokeOpacity="0.35"
        />

        <polyline fill="none" stroke="rgb(251,130,253)" strokeWidth="3" points={points} strokeLinejoin="round" strokeLinecap="round" />
        {props.values.map((v, i) => {
          const x = axisLeft + i * stepX;
          const y = paddingTop + (plotH * (max - v)) / span;
          return <circle key={i} cx={x} cy={y} r="4.5" fill="rgb(148,34,156)" opacity={0.9} />;
        })}

        {props.xStartLabel && (
          <text x={axisLeft} y={height - 16} textAnchor="start" fontSize="16" fill="currentColor" fillOpacity="0.85">
            {props.xStartLabel}
          </text>
        )}
        {props.xEndLabel && (
          <text x={width - paddingRight} y={height - 16} textAnchor="end" fontSize="16" fill="currentColor" fillOpacity="0.85">
            {props.xEndLabel}
          </text>
        )}
        {props.yUnit && (
          <text x={axisLeft} y={12} textAnchor="start" fontSize="16" fill="currentColor" fillOpacity="0.75">
            {props.yUnit}
          </text>
        )}
      </svg>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const params = useParams();
  const section = String(params.section || "overview");
  const [tab, setTab] = useState<"overview" | "doctors" | "patients" | "reports">("overview");
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [doctors, setDoctors] = useState<AdminUser[]>([]);
  const [patients, setPatients] = useState<AdminPatient[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);

  const [doctorSearch, setDoctorSearch] = useState("");
  const [doctorStatus, setDoctorStatus] = useState<"all" | "active" | "inactive">("all");
  const [patientSearch, setPatientSearch] = useState("");
  const [patientDoctorFilter, setPatientDoctorFilter] = useState<number | "all">("all");
  const [reportSort, setReportSort] = useState<"date" | "priority">("priority");
  const [reportSearch, setReportSearch] = useState("");
  const [reportCriticalOnly, setReportCriticalOnly] = useState(false);
  const [reportModal, setReportModal] = useState<{ report: AdminReport; patient?: AdminPatient } | null>(null);
  const [doctorModalId, setDoctorModalId] = useState<number | null>(null);
  const [patientModalId, setPatientModalId] = useState<number | null>(null);

  const [health, setHealth] = useState<{ ok: boolean; latencyMs: number | null } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const [doctorsRes, patientsRes, reportsRes] = await Promise.all([
        api.get<AdminUser[]>("/admin/doctors"),
        api.get<AdminPatient[]>("/admin/patients"),
        api.get<AdminReport[]>("/admin/reports"),
      ]);
      setDoctors(doctorsRes.data);
      setPatients(patientsRes.data);
      setReports(reportsRes.data);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to load admin data";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const t0 = performance.now();
        const res = await fetch(`${BACKEND_ORIGIN}/health`, { cache: "no-store" });
        const latencyMs = Math.round(performance.now() - t0);
        if (!active) return;
        setHealth({ ok: res.ok, latencyMs });
      } catch {
        if (!active) return;
        setHealth({ ok: false, latencyMs: null });
      }
    };
    run();
    const id = window.setInterval(run, 30000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (section === "overview" || section === "doctors" || section === "patients" || section === "reports") {
      setTab(section);
    } else {
      navigate("/admin/overview", { replace: true });
    }
  }, [navigate, section]);

  const stats = useMemo(() => {
    const critical = reports.filter((r) => r.prediction === "Severe" || r.prediction === "Proliferative DR").length;
    const avgConfidence = reports.length === 0 ? 0 : reports.reduce((a, r) => a + r.confidence, 0) / reports.length;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayScans = reports.filter((r) => new Date(r.created_at).getTime() >= todayStart.getTime()).length;
    const activeDoctors = doctors.filter((d) => d.is_active !== false).length;
    const activeDoctorsToday = (() => {
      const todayReports = reports.filter((r) => new Date(r.created_at).getTime() >= todayStart.getTime());
      const doctorIds = new Set<number>();
      for (const r of todayReports) {
        const p = patients.find((pp) => pp.id === r.patient_id);
        if (!p) continue;
        doctorIds.add(p.doctor_id);
      }
      return doctorIds.size;
    })();
    const pendingCritical = (() => {
      const now = Date.now();
      const windowMs = 24 * 60 * 60 * 1000;
      return reports.filter((r) => severityFromStage(r.prediction) >= 4 && now - new Date(r.created_at).getTime() <= windowMs).length;
    })();
    return {
      doctors: doctors.length,
      activeDoctors,
      activeDoctorsToday,
      patients: patients.length,
      reports: reports.length,
      todayScans,
      critical,
      pendingCritical,
      avgConfidence,
    };
  }, [doctors, patients.length, reports]);

  const severityDist = useMemo(() => {
    const stages = ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"] as const;
    const counts = stages.map((s) => reports.filter((r) => r.prediction === s).length);
    return { stages, counts };
  }, [reports]);

  const confidenceHistogram = useMemo(() => {
    const bins = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.01];
    const labels = ["70", "75", "80", "85", "90", "95"];
    const counts = new Array(labels.length).fill(0) as number[];
    for (const r of reports) {
      const c = r.confidence;
      let idx = labels.length - 1;
      for (let i = 0; i < labels.length; i++) {
        if (c >= bins[i]! && c < bins[i + 1]!) {
          idx = i;
          break;
        }
      }
      counts[idx]! += 1;
    }
    return { labels, counts };
  }, [reports]);

  const reportsLast14Days = useMemo(() => {
    const days = 14;
    const today = new Date();
    const series: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const count = reports.filter((r) => sameLocalDay(new Date(r.created_at), d)).length;
      series.push(count);
    }
    return series;
  }, [reports]);

  const reportsWeekDelta = useMemo(() => {
    const today = new Date();
    const countForRange = (startOffsetDays: number, endOffsetDays: number) => {
      let total = 0;
      for (let i = startOffsetDays; i <= endOffsetDays; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        total += reports.filter((r) => sameLocalDay(new Date(r.created_at), d)).length;
      }
      return total;
    };
    const last7 = countForRange(0, 6);
    const prev7 = countForRange(7, 13);
    const pct = prev7 === 0 ? (last7 > 0 ? 100 : 0) : ((last7 - prev7) / prev7) * 100;
    return { last7, prev7, pct };
  }, [reports]);

  const criticalLast14Days = useMemo(() => {
    const days = 14;
    const today = new Date();
    const series: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const count = reports.filter((r) => {
        const pr = severityFromStage(r.prediction);
        return pr >= 4 && sameLocalDay(new Date(r.created_at), d);
      }).length;
      series.push(count);
    }
    return series;
  }, [reports]);

  const doctorRows = useMemo(() => {
    return doctors
      .filter((d) => d.role === "doctor")
      .map((d) => {
        const pIds = new Set(patients.filter((p) => p.doctor_id === d.id).map((p) => p.id));
        const drReports = reports
          .filter((r) => pIds.has(r.patient_id))
          .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
        const lastActive = drReports[0]?.created_at ?? null;
        return {
          id: d.id,
          name: d.name,
          email: d.email,
          is_active: d.is_active !== false,
          reports: drReports.length,
          critical: drReports.filter((r) => severityFromStage(r.prediction) >= 4).length,
          lastActive,
        };
      })
      .sort((a, b) => b.reports - a.reports);
  }, [doctors, patients, reports]);

  const lowConfidenceCount = useMemo(() => reports.filter((r) => r.confidence < 0.8).length, [reports]);

  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const doctorById = useMemo(() => new Map(doctors.map((d) => [d.id, d])), [doctors]);

  const doctorModal = useMemo(() => (doctorModalId ? doctorById.get(doctorModalId) ?? null : null), [doctorById, doctorModalId]);
  const patientModal = useMemo(() => (patientModalId ? patientById.get(patientModalId) ?? null : null), [patientById, patientModalId]);

  const reportsForDoctorModal = useMemo(() => {
    if (!doctorModal) return [];
    const pIds = new Set(patients.filter((p) => p.doctor_id === doctorModal.id).map((p) => p.id));
    return reports
      .filter((r) => pIds.has(r.patient_id))
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 12);
  }, [doctorModal, patients, reports]);

  const doctorSeries14 = useMemo(() => {
    if (!doctorModal) return { reports: new Array(14).fill(0) as number[], critical: new Array(14).fill(0) as number[] };
    const pIds = new Set(patients.filter((p) => p.doctor_id === doctorModal.id).map((p) => p.id));
    const days = 14;
    const today = new Date();
    const reportsSeries: number[] = [];
    const criticalSeries: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayReports = reports.filter((r) => pIds.has(r.patient_id) && sameLocalDay(new Date(r.created_at), d));
      reportsSeries.push(dayReports.length);
      criticalSeries.push(dayReports.filter((r) => severityFromStage(r.prediction) >= 4).length);
    }
    return { reports: reportsSeries, critical: criticalSeries };
  }, [doctorModal, patients, reports]);

  const doctorTotals = useMemo(() => {
    if (!doctorModal) return { patients: 0, reports: 0, critical: 0, avgConfidence: 0 };
    const pIds = new Set(patients.filter((p) => p.doctor_id === doctorModal.id).map((p) => p.id));
    const doctorReports = reports.filter((r) => pIds.has(r.patient_id));
    const critical = doctorReports.filter((r) => severityFromStage(r.prediction) >= 4).length;
    const avgConfidence = doctorReports.length ? doctorReports.reduce((a, r) => a + r.confidence, 0) / doctorReports.length : 0;
    return { patients: pIds.size, reports: doctorReports.length, critical, avgConfidence };
  }, [doctorModal, patients, reports]);

  const reportsForPatientModal = useMemo(() => {
    if (!patientModal) return [];
    return reports
      .filter((r) => r.patient_id === patientModal.id)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [patientModal, reports]);

  async function onCreateDoctor() {
    setCreateError(null);
    if (!createName.trim() || !createEmail.trim() || !createPassword) {
      return setCreateError("Name, email, and password are required.");
    }
    setCreateLoading(true);
    try {
      const res = await api.post<AdminUser>("/admin/doctors", {
        name: createName.trim(),
        email: createEmail.trim(),
        password: createPassword,
      });
      setDoctors((prev) => [...prev, res.data].sort((a, b) => a.id - b.id));
      setCreateOpen(false);
      setCreateName("");
      setCreateEmail("");
      setCreatePassword("");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to create doctor";
      setCreateError(message);
    } finally {
      setCreateLoading(false);
    }
  }

  async function onAssignPatient(patientId: number, doctorId: number) {
    try {
      const res = await api.put<AdminPatient>(`/admin/patients/${patientId}/assign`, null, {
        params: { doctor_id: doctorId },
      });
      setPatients((prev) => prev.map((p) => (p.id === patientId ? res.data : p)));
    } catch {
      // ignore
    }
  }

  async function onToggleDoctorActive(userId: number, nextActive: boolean) {
    try {
      const res = await api.put<AdminUser>(`/admin/users/${userId}/status`, { is_active: nextActive });
      setDoctors((prev) => prev.map((d) => (d.id === userId ? res.data : d)));
    } catch {
      // ignore
    }
  }

  function exportReportPdf(report: AdminReport, patient?: AdminPatient) {
    const frame = printFrameRef.current;
    if (!frame) return;

    const imageUrl = resolveBackendUrl(report.image_url);
    const heatmapUrl = resolveBackendUrl(report.heatmap_url);
    const createdAt = new Date(report.created_at).toLocaleString();
    const priority = severityFromStage(report.prediction);

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
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Retina Max - Diabetic Retinopathy Report</h1>
  <div class="muted">Generated: ${createdAt}</div>
  <div class="grid">
    <div class="card">
      <div style="font-weight:700; margin-bottom:6px;">Patient</div>
      <div class="row"><div class="k">ID</div><div>${patient?.id ?? report.patient_id}</div></div>
      <div class="row"><div class="k">Name</div><div>${patient?.name ?? `Patient #${report.patient_id}`}</div></div>
      ${patient ? `<div class="row"><div class="k">Age</div><div>${patient.age}</div></div>
      <div class="row"><div class="k">Gender</div><div>${patient.gender}</div></div>` : ""}
    </div>
    <div class="card">
      <div style="font-weight:700; margin-bottom:6px;">Report</div>
      <div class="row"><div class="k">Report ID</div><div>${report.id}</div></div>
      <div class="row"><div class="k">Prediction</div><div><b>${report.prediction}</b></div></div>
      <div class="row"><div class="k">Confidence</div><div>${formatPercent(report.confidence)}</div></div>
      <div class="row"><div class="k">Priority</div><div>${priority}/5</div></div>
      <div class="row"><div class="k">Summary</div><div>${stageDescription(report.prediction)}</div></div>
    </div>
  </div>
  <div class="grid">
    <div class="card">
      <div style="font-weight:700; margin-bottom:6px;">Input Image</div>
      <img src="${imageUrl}" />
    </div>
    <div class="card">
      <div style="font-weight:700; margin-bottom:6px;">Heatmap</div>
      <img src="${heatmapUrl}" />
    </div>
  </div>
  <script>
    (function () {
      const imgs = Array.from(document.images || []);
      Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })))
        .then(() => { window.focus(); window.print(); });
    })();
  </script>
</body>
</html>`;

    frame.srcdoc = html;
  }

  return (
    <main className="min-h-screen pt-24 pb-32 px-6 md:px-12 max-w-7xl mx-auto">
      <iframe ref={printFrameRef} title="print" className="absolute -left-[10000px] top-0 w-[1px] h-[1px] opacity-0 pointer-events-none" />
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">Admin</h1>
          <p className="text-on-surface-variant text-lg">Centralized access to doctors, patients, and reports.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon="refresh" onClick={load} disabled={isLoading}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-5 mb-8 border border-error/25 bg-error-container/20">
          <div className="text-error font-semibold">{error}</div>
          <div className="text-on-surface-variant text-sm mt-1">Verify backend is running and you are an admin.</div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: "overview", label: "Overview", icon: "grid_view" },
          { id: "doctors", label: "Doctors", icon: "clinical_notes" },
          { id: "patients", label: "Patients", icon: "group" },
          { id: "reports", label: "Reports", icon: "summarize" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id as typeof tab);
              navigate(`/admin/${t.id}`);
            }}
            className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors flex items-center gap-2 ${
              tab === t.id
                ? "bg-primary/15 border-primary/30 text-primary"
                : "border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-6">
            <Card className="p-6">
              <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Doctors</div>
              <div className="text-3xl font-headline font-extrabold mt-2">{formatCompact(stats.doctors)}</div>
            </Card>
            <Card className="p-6">
              <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Active Doctors</div>
              <div className="text-3xl font-headline font-extrabold mt-2">{formatCompact(stats.activeDoctors)}</div>
              <div className="text-xs text-on-surface-variant mt-1">{formatCompact(stats.activeDoctorsToday)} active today</div>
            </Card>
            <Card className="p-6">
              <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Patients</div>
              <div className="text-3xl font-headline font-extrabold mt-2">{formatCompact(stats.patients)}</div>
            </Card>
            <Card className="p-6">
              <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Reports</div>
              <div className="text-3xl font-headline font-extrabold mt-2">{formatCompact(stats.reports)}</div>
            </Card>
            <Card className="p-6">
              <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Today’s scans</div>
              <div className="text-3xl font-headline font-extrabold mt-2">{formatCompact(stats.todayScans)}</div>
            </Card>
            <Card className="p-6">
              <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Critical</div>
              <div className="text-3xl font-headline font-extrabold mt-2">{formatCompact(stats.critical)}</div>
            </Card>
            <Card className="p-6">
              <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Pending Critical Cases</div>
              <div className="text-3xl font-headline font-extrabold mt-2">{formatCompact(stats.pendingCritical)}</div>
              <div className="text-xs text-on-surface-variant mt-1">last 24 hours</div>
            </Card>
            <Card className="p-6 col-span-2 lg:col-span-1">
              <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Avg confidence</div>
              <div className="text-3xl font-headline font-extrabold mt-2">{formatPercent(stats.avgConfidence)}</div>
              <div className="text-xs text-on-surface-variant mt-1">{formatCompact(lowConfidenceCount)} below 80%</div>
            </Card>
            <Card className="p-6 col-span-2 lg:col-span-1 border border-outline-variant/10 bg-surface-container-lowest">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">System Health</div>
                <span className={`text-xs font-bold ${health?.ok ? "text-primary" : "text-error"}`}>
                  {health?.ok ? "✅ Healthy" : "⚠️ Degraded"}
                </span>
              </div>
              <div className="text-sm text-on-surface-variant space-y-1">
                <div className="flex items-center justify-between">
                  <span>Model status</span>
                  <span className="text-on-surface font-semibold">✅ Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>API latency</span>
                  <span className="text-on-surface font-semibold">
                    {health?.latencyMs != null ? `${health.latencyMs}ms` : "—"}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-8 space-y-6">
            <Card className="p-5 border border-error/20 bg-error-container/10">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-error text-2xl">warning</span>
                  <div>
                    <div className="font-headline font-extrabold text-lg text-on-surface">
                      🚨 {stats.pendingCritical} critical cases need immediate attention
                    </div>
                    <div className="text-sm text-on-surface-variant mt-1">
                      Reports created in the last 24 hours with priority 4–5.
                    </div>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  icon="visibility"
                  onClick={() => {
                    setTab("reports");
                    navigate("/admin/reports");
                    setReportCriticalOnly(true);
                    setReportSort("priority");
                  }}
                >
                  View Cases
                </Button>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="font-headline font-bold text-xl">Reports (14 days)</div>
                <div className="text-xs text-on-surface-variant">
                  {reportsLast14Days.reduce((a, b) => a + b, 0)} total ·{" "}
                  <span className={reportsWeekDelta.pct >= 0 ? "text-primary" : "text-error"}>
                    {reportsWeekDelta.pct >= 0 ? "↑" : "↓"} {Math.abs(reportsWeekDelta.pct).toFixed(0)}% vs last week
                  </span>
                </div>
              </div>
              <SvgLine
                values={reportsLast14Days}
                xLabel="Days (old → new)"
                yLabel="Reports (count)"
                yUnit="Reports"
                xStartLabel="14d ago"
                xEndLabel="Today"
              />
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="font-headline font-bold text-xl">Critical cases over time (14 days)</div>
                <div className="text-xs text-on-surface-variant">Priority 4–5</div>
              </div>
              <SvgLine
                values={criticalLast14Days}
                xLabel="Days (old → new)"
                yLabel="High-risk (count)"
                yUnit="Reports"
                xStartLabel="14d ago"
                xEndLabel="Today"
              />
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="font-headline font-bold text-xl">Reports by Doctor</div>
                <div className="text-xs text-on-surface-variant">X: Doctor · Y: Reports</div>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                      <th className="py-3 pr-4">Doctor</th>
                      <th className="py-3 pr-4 text-center">Reports</th>
                      <th className="py-3 pr-4 text-center">Status</th>
                      <th className="py-3 text-right">Last active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {doctorRows.slice(0, 10).map((d) => (
                      <tr key={d.id} className="text-sm hover:bg-surface-container-high transition-colors">
                        <td className="py-4 pr-4 font-semibold">
                          <button
                            type="button"
                            className="hover:text-primary transition-colors"
                            onClick={() => setDoctorModalId(d.id)}
                          >
                            {d.name}
                          </button>
                        </td>
                        <td className="py-4 pr-4 text-center text-on-surface-variant">{d.reports}</td>
                        <td className="py-4 pr-4 text-center">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-bold border ${
                              d.is_active ? "border-primary/30 text-primary" : "border-error/30 text-error"
                            }`}
                          >
                            {d.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="py-4 text-right text-on-surface-variant">
                          {d.lastActive ? new Date(d.lastActive).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card className="p-6">
              <div className="font-headline font-bold text-xl mb-4">DR Severity Distribution</div>
              <SvgBars
                labels={["0", "1", "2", "3", "4"]}
                values={severityDist.counts}
                xLabel="DR stage (0–4)"
                yLabel="Reports (count)"
                yUnit="Reports"
                colors={["#22c55e", "#a3e635", "#fbbf24", "#f97316", "#ef4444"]}
              />
            </Card>
            <Card className="p-6">
              <div className="font-headline font-bold text-xl mb-4">Confidence Histogram</div>
              <SvgBars labels={confidenceHistogram.labels} values={confidenceHistogram.counts} xLabel="Confidence (%) bins" yLabel="Reports (count)" yUnit="Reports" />
              <div className="text-xs text-on-surface-variant mt-2">
                Low confidence (&lt;80%): <span className="font-bold text-on-surface">{lowConfidenceCount}</span> reports
              </div>
            </Card>
            <Card className="p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="font-headline font-bold text-xl">Recent High-Priority Cases</div>
                <div className="text-xs text-on-surface-variant">Priority 4–5</div>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                      <th className="py-3 pr-4">Report</th>
                      <th className="py-3 pr-4">Patient</th>
                      <th className="py-3 pr-4">Prediction</th>
                      <th className="py-3 pr-4 text-center">Priority</th>
                      <th className="py-3 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {reports
                      .map((r) => ({ r, p: patients.find((pp) => pp.id === r.patient_id) }))
                      .map(({ r, p }) => ({ r, p, pr: severityFromStage(r.prediction) }))
                      .filter((x) => x.pr >= 4)
                      .sort((a, b) => b.pr - a.pr || +new Date(b.r.created_at) - +new Date(a.r.created_at))
                      .slice(0, 6)
                      .map(({ r, p, pr }) => (
                        <tr key={r.id} className="text-sm hover:bg-surface-container-high transition-colors">
                          <td className="py-4 pr-4 font-semibold">#{r.id}</td>
                          <td className="py-4 pr-4 text-on-surface-variant">{p?.name ?? `Patient #${r.patient_id}`}</td>
                          <td className="py-4 pr-4 text-on-surface-variant">{r.prediction}</td>
                          <td className="py-4 pr-4 text-center font-bold text-primary">{pr}/5</td>
                          <td className="py-4 text-right text-on-surface-variant">{new Date(r.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    {!isLoading && reports.filter((r) => severityFromStage(r.prediction) >= 4).length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-on-surface-variant">
                          No high-priority cases yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "doctors" && (
        <Card className="p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="font-headline font-bold text-xl">Doctors</div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-on-surface-variant">{doctors.length} total</div>
              <Button icon="person_add" onClick={() => setCreateOpen(true)}>
                New Doctor
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <input
              value={doctorSearch}
              onChange={(e) => setDoctorSearch(e.target.value)}
              placeholder="Search name/email…"
              className="bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
            />
            <select
              value={doctorStatus}
              onChange={(e) => setDoctorStatus(e.target.value as typeof doctorStatus)}
              className="bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <div className="text-sm text-on-surface-variant flex items-center justify-between rounded-xl border border-outline/10 bg-surface-container-lowest px-4 py-3">
              <span>Active doctors</span>
              <span className="font-bold text-on-surface">{stats.activeDoctors}</span>
            </div>
          </div>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4 text-center">Status</th>
                  <th className="py-3 pr-4 text-center">Created</th>
                  <th className="py-3 pr-4 text-center">Patients</th>
                  <th className="py-3 pr-4 text-center">Reports</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {doctors
                  .filter((d) => {
                    const q = doctorSearch.trim().toLowerCase();
                    if (q) {
                      const hay = `${d.name} ${d.email}`.toLowerCase();
                      if (!hay.includes(q)) return false;
                    }
                    if (doctorStatus === "active") return d.is_active !== false;
                    if (doctorStatus === "inactive") return d.is_active === false;
                    return true;
                  })
                  .map((d) => {
                    const pCount = patients.filter((p) => p.doctor_id === d.id).length;
                    const rCount = reports.filter((r) => {
                      const p = patients.find((pp) => pp.id === r.patient_id);
                      return p?.doctor_id === d.id;
                    }).length;
                    return (
                      <tr key={d.id} className="text-sm hover:bg-surface-container-high transition-colors">
                        <td className="py-4 pr-4 font-semibold">
                          <button
                            type="button"
                            onClick={() => setDoctorModalId(d.id)}
                            className="hover:text-primary transition-colors"
                            title="View doctor activity"
                          >
                            {d.name}
                          </button>
                        </td>
                        <td className="py-4 pr-4 text-on-surface-variant">{d.email}</td>
                        <td className="py-4 pr-4 text-center">
                          <button
                            type="button"
                            onClick={() => onToggleDoctorActive(d.id, d.is_active === false)}
                            className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                              d.is_active === false
                                ? "border-error/30 text-error hover:bg-error/10"
                                : "border-primary/30 text-primary hover:bg-primary/10"
                            }`}
                            title="Toggle active status"
                          >
                            {d.is_active === false ? "Inactive" : "Active"}
                          </button>
                        </td>
                        <td className="py-4 pr-4 text-center text-on-surface-variant">
                          {d.created_at ? new Date(d.created_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-4 pr-4 text-center text-on-surface-variant">{pCount}</td>
                        <td className="py-4 pr-4 text-center text-on-surface-variant">{rCount}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "patients" && (
        <Card className="p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="font-headline font-bold text-xl">Patients</div>
            <div className="text-xs text-on-surface-variant">{patients.length} total</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <input
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder="Search by name/phone…"
              className="bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
            />
            <select
              value={patientDoctorFilter}
              onChange={(e) => setPatientDoctorFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
            >
              <option value="all">All doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} (#{d.id})
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4 text-center">Age</th>
                  <th className="py-3 pr-4">Gender</th>
                  <th className="py-3 pr-4">Assigned Doctor</th>
                  <th className="py-3 pr-4 text-right">Last report</th>
                  <th className="py-3 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {patients
                  .filter((p) => {
                    const q = patientSearch.trim().toLowerCase();
                    if (q) {
                      const hay = `${p.name} ${p.phone}`.toLowerCase();
                      if (!hay.includes(q)) return false;
                    }
                    if (patientDoctorFilter !== "all" && p.doctor_id !== patientDoctorFilter) return false;
                    return true;
                  })
                  .map((p) => {
                    const last = reports
                      .filter((r) => r.patient_id === p.id)
                      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0];
                    return (
                      <tr key={p.id} className="text-sm hover:bg-surface-container-high transition-colors">
                        <td className="py-4 pr-4 font-semibold">
                          <button
                            type="button"
                            onClick={() => setPatientModalId(p.id)}
                            className="hover:text-primary transition-colors"
                            title="View patient details"
                          >
                            {p.name}
                          </button>
                        </td>
                        <td className="py-4 pr-4 text-center text-on-surface-variant">{p.age}</td>
                        <td className="py-4 pr-4 text-on-surface-variant">{p.gender}</td>
                        <td className="py-4 pr-4">
                          <select
                            value={p.doctor_id}
                            onChange={(e) => onAssignPatient(p.id, Number(e.target.value))}
                            className="bg-surface-container-lowest border border-outline/10 rounded-lg px-3 py-2 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
                          >
                            {doctors.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name} (#{d.id})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-4 pr-4 text-right text-on-surface-variant">
                          {last ? new Date(last.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="py-4 text-right text-on-surface-variant">{new Date(p.created_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "reports" && (
        <Card className="p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="font-headline font-bold text-xl">Reports</div>
            <div className="text-xs text-on-surface-variant">{reports.length} total</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <select
              value={reportSort}
              onChange={(e) => setReportSort(e.target.value as typeof reportSort)}
              className="bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
            >
              <option value="priority">Sort: Priority</option>
              <option value="date">Sort: Date</option>
            </select>
            <input
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              placeholder="Search patient/prediction…"
              className="bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
            />
            <div className="text-sm text-on-surface-variant flex items-center justify-between gap-3 rounded-xl border border-outline/10 bg-surface-container-lowest px-4 py-3">
              <div>
                <div className="font-bold text-on-surface-variant">
                  {reportCriticalOnly ? "Critical only" : "High-risk"}
                </div>
                <div className="text-[11px] text-on-surface-variant mt-0.5">
                  {reportCriticalOnly ? "Filtering priority 4–5" : "Total critical cases"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-on-surface">{stats.critical}</span>
                <button
                  type="button"
                  onClick={() => setReportCriticalOnly((v) => !v)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                    reportCriticalOnly
                      ? "border-primary/30 text-primary hover:bg-primary/10"
                      : "border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                  title="Toggle critical-only filter"
                >
                  {reportCriticalOnly ? "On" : "Off"}
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                  <th className="py-3 pr-4">Report</th>
                  <th className="py-3 pr-4">Patient</th>
                  <th className="py-3 pr-4">Prediction</th>
                  <th className="py-3 pr-4 text-center">Confidence</th>
                  <th className="py-3 pr-4 text-center">Priority</th>
                  <th className="py-3 pr-4 text-right">Actions</th>
                  <th className="py-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {[...reports]
                  .map((r) => ({
                    r,
                    p: patients.find((pp) => pp.id === r.patient_id),
                    pr: severityFromStage(r.prediction),
                  }))
                  .filter(({ pr }) => (!reportCriticalOnly ? true : pr >= 4))
                  .filter(({ r, p }) => {
                    const q = reportSearch.trim().toLowerCase();
                    if (!q) return true;
                    const hay = `${p?.name ?? ""} ${r.prediction} #${r.id} #${r.patient_id}`.toLowerCase();
                    return hay.includes(q);
                  })
                  .sort((a, b) =>
                    reportSort === "date"
                      ? +new Date(b.r.created_at) - +new Date(a.r.created_at)
                      : b.pr - a.pr || +new Date(b.r.created_at) - +new Date(a.r.created_at),
                  )
                  .slice(0, 250)
                  .map(({ r, p, pr }) => (
                    <tr key={r.id} className="text-sm hover:bg-surface-container-high transition-colors">
                      <td className="py-4 pr-4 font-semibold">#{r.id}</td>
                      <td className="py-4 pr-4 text-on-surface-variant">{p?.name ?? `Patient #${r.patient_id}`}</td>
                      <td className="py-4 pr-4 text-on-surface-variant">{r.prediction}</td>
                      <td className="py-4 pr-4 text-center text-on-surface-variant">{formatPercent(r.confidence)}</td>
                      <td className="py-4 pr-4 text-center font-bold text-primary">{pr}/5</td>
                      <td className="py-4 pr-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="px-3 py-1 rounded-lg bg-surface-container-high text-on-surface-variant text-xs font-bold hover:text-primary transition-colors"
                            onClick={() => setReportModal({ report: r, patient: p })}
                          >
                            View
                          </button>
                          <a
                            className="px-3 py-1 rounded-lg bg-surface-container-high text-on-surface-variant text-xs font-bold hover:text-primary transition-colors"
                            href={resolveBackendUrl(r.heatmap_url)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Heatmap
                          </a>
                          <button
                            type="button"
                            className="px-3 py-1 rounded-lg bg-surface-container-high text-on-surface-variant text-xs font-bold hover:text-primary transition-colors"
                            onClick={() => exportReportPdf(r, p)}
                          >
                            PDF
                          </button>
                        </div>
                      </td>
                      <td className="py-4 text-right text-on-surface-variant">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                {!isLoading && reports.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-on-surface-variant">
                      No reports yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {doctorModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDoctorModalId(null)}
            aria-label="Close dialog"
          />
          <div className="relative w-full max-w-5xl">
            <Card className="p-6 md:p-7 shadow-2xl shadow-black/40 border border-outline-variant/15">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="font-headline font-extrabold text-xl text-on-surface">{doctorModal.name}</div>
                  <div className="text-sm text-on-surface-variant mt-1">
                    {doctorModal.email} · {doctorModal.is_active === false ? "Inactive" : "Active"}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-on-surface-variant hover:text-primary transition-colors"
                  onClick={() => setDoctorModalId(null)}
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-4">
                  <Card className="p-5 bg-surface-container-lowest border border-outline/10">
                    <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Patients</div>
                    <div className="text-3xl font-headline font-extrabold mt-2">
                      {doctorTotals.patients}
                    </div>
                  </Card>
                  <Card className="p-5 bg-surface-container-lowest border border-outline/10">
                    <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Reports</div>
                    <div className="text-3xl font-headline font-extrabold mt-2">
                      {doctorTotals.reports}
                    </div>
                    <div className="text-xs text-on-surface-variant mt-1">{doctorTotals.critical} high-risk</div>
                  </Card>
                  <Card className="p-5 bg-surface-container-lowest border border-outline/10 col-span-2 lg:col-span-1">
                    <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Recent Activity</div>
                    <div className="text-sm text-on-surface-variant mt-2 leading-relaxed">
                      {reportsForDoctorModal[0]
                        ? `Last report: ${new Date(reportsForDoctorModal[0].created_at).toLocaleString()}`
                        : "No reports yet."}
                    </div>
                  </Card>
                </div>

                <div className="lg:col-span-8 space-y-6">
                  <Card className="p-5 bg-surface-container-lowest border border-outline/10">
                    <div className="font-headline font-bold text-lg mb-3">Reports (14 days)</div>
                    <SvgLine
                      values={doctorSeries14.reports}
                      xLabel="Days (old → new)"
                      yLabel="Reports (count)"
                      yUnit="Reports"
                      xStartLabel="14d ago"
                      xEndLabel="Today"
                    />
                    <div className="text-xs text-on-surface-variant mt-2">
                      Tip: filter by this doctor from the Doctors/Patients tabs for more detail.
                    </div>
                  </Card>

                  <Card className="p-5 bg-surface-container-lowest border border-outline/10 overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-headline font-bold text-lg">Recent Reports</div>
                      <div className="text-xs text-on-surface-variant">Newest first</div>
                    </div>
                    <div className="overflow-x-auto no-scrollbar">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                            <th className="py-3 pr-4">Report</th>
                            <th className="py-3 pr-4">Patient</th>
                            <th className="py-3 pr-4">Prediction</th>
                            <th className="py-3 pr-4 text-center">Priority</th>
                            <th className="py-3 text-right">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/10">
                          {reportsForDoctorModal.map((r) => (
                            <tr key={r.id} className="text-sm hover:bg-surface-container-high transition-colors">
                              <td className="py-4 pr-4 font-semibold">#{r.id}</td>
                              <td className="py-4 pr-4 text-on-surface-variant">
                                {patientById.get(r.patient_id)?.name ?? `Patient #${r.patient_id}`}
                              </td>
                              <td className="py-4 pr-4 text-on-surface-variant">{r.prediction}</td>
                              <td className="py-4 pr-4 text-center font-bold text-primary">
                                {severityFromStage(r.prediction)}/5
                              </td>
                              <td className="py-4 text-right text-on-surface-variant">{new Date(r.created_at).toLocaleString()}</td>
                            </tr>
                          ))}
                          {reportsForDoctorModal.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-on-surface-variant">
                                No activity yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {patientModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setPatientModalId(null)}
            aria-label="Close dialog"
          />
          <div className="relative w-full max-w-5xl">
            <Card className="p-6 md:p-7 shadow-2xl shadow-black/40 border border-outline-variant/15">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="font-headline font-extrabold text-xl text-on-surface">{patientModal.name}</div>
                  <div className="text-sm text-on-surface-variant mt-1">
                    {patientModal.gender} · {patientModal.age}y · Doctor: {doctorById.get(patientModal.doctor_id)?.name ?? `#${patientModal.doctor_id}`}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-on-surface-variant hover:text-primary transition-colors"
                  onClick={() => setPatientModalId(null)}
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4 space-y-4">
                  <Card className="p-5 bg-surface-container-lowest border border-outline/10">
                    <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Contact</div>
                    <div className="text-sm text-on-surface-variant mt-2">{patientModal.phone || "—"}</div>
                    <div className="text-sm text-on-surface-variant mt-1">{patientModal.address || "—"}</div>
                  </Card>
                  <Card className="p-5 bg-surface-container-lowest border border-outline/10">
                    <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Created</div>
                    <div className="text-sm text-on-surface-variant mt-2">{new Date(patientModal.created_at).toLocaleString()}</div>
                  </Card>
                </div>

                <div className="lg:col-span-8">
                  <Card className="p-5 bg-surface-container-lowest border border-outline/10 overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-headline font-bold text-lg">Reports</div>
                      <div className="text-xs text-on-surface-variant">{reportsForPatientModal.length} total</div>
                    </div>
                    <div className="overflow-x-auto no-scrollbar">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                            <th className="py-3 pr-4">Report</th>
                            <th className="py-3 pr-4">Prediction</th>
                            <th className="py-3 pr-4 text-center">Confidence</th>
                            <th className="py-3 pr-4 text-center">Priority</th>
                            <th className="py-3 text-right">Actions</th>
                            <th className="py-3 text-right">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/10">
                          {reportsForPatientModal.map((r) => (
                            <tr key={r.id} className="text-sm hover:bg-surface-container-high transition-colors">
                              <td className="py-4 pr-4 font-semibold">#{r.id}</td>
                              <td className="py-4 pr-4 text-on-surface-variant">{r.prediction}</td>
                              <td className="py-4 pr-4 text-center text-on-surface-variant">{formatPercent(r.confidence)}</td>
                              <td className="py-4 pr-4 text-center font-bold text-primary">{severityFromStage(r.prediction)}/5</td>
                              <td className="py-4 pr-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    className="px-3 py-1 rounded-lg bg-surface-container-high text-on-surface-variant text-xs font-bold hover:text-primary transition-colors"
                                    onClick={() => setReportModal({ report: r, patient: patientModal })}
                                  >
                                    View
                                  </button>
                                  <a
                                    className="px-3 py-1 rounded-lg bg-surface-container-high text-on-surface-variant text-xs font-bold hover:text-primary transition-colors"
                                    href={resolveBackendUrl(r.heatmap_url)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Heatmap
                                  </a>
                                  <button
                                    type="button"
                                    className="px-3 py-1 rounded-lg bg-surface-container-high text-on-surface-variant text-xs font-bold hover:text-primary transition-colors"
                                    onClick={() => exportReportPdf(r, patientModal)}
                                  >
                                    PDF
                                  </button>
                                </div>
                              </td>
                              <td className="py-4 text-right text-on-surface-variant">{new Date(r.created_at).toLocaleString()}</td>
                            </tr>
                          ))}
                          {reportsForPatientModal.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-10 text-center text-on-surface-variant">
                                No reports for this patient yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {reportModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setReportModal(null)}
            aria-label="Close dialog"
          />
          <div className="relative w-full max-w-4xl">
            <Card className="p-6 md:p-7 shadow-2xl shadow-black/40 border border-outline-variant/15">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="font-headline font-extrabold text-xl text-on-surface">Report #{reportModal.report.id}</div>
                  <div className="text-sm text-on-surface-variant mt-1">
                    {reportModal.patient?.name ?? `Patient #${reportModal.report.patient_id}`} ·{" "}
                    {new Date(reportModal.report.created_at).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-on-surface-variant hover:text-primary transition-colors"
                  onClick={() => setReportModal(null)}
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl overflow-hidden border border-outline/10 bg-surface-container-lowest">
                  <div className="px-4 py-3 text-xs uppercase tracking-widest text-on-surface-variant font-bold border-b border-outline/10">
                    Input image
                  </div>
                  <img className="w-full aspect-square object-cover" src={resolveBackendUrl(reportModal.report.image_url)} alt="Input" />
                </div>
                <div className="rounded-xl overflow-hidden border border-outline/10 bg-surface-container-lowest">
                  <div className="px-4 py-3 text-xs uppercase tracking-widest text-on-surface-variant font-bold border-b border-outline/10">
                    Heatmap
                  </div>
                  <img className="w-full aspect-square object-cover" src={resolveBackendUrl(reportModal.report.heatmap_url)} alt="Heatmap" />
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-surface-container-lowest border border-outline/10 p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Prediction</div>
                    <div className="text-xl font-headline font-extrabold text-on-surface mt-1">{reportModal.report.prediction}</div>
                    <div className="text-sm text-on-surface-variant mt-1">{stageDescription(reportModal.report.prediction)}</div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="secondary" icon="picture_as_pdf" onClick={() => exportReportPdf(reportModal.report, reportModal.patient)}>
                      PDF
                    </Button>
                    <a
                      className="px-6 py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm active:scale-95 transition-transform bg-surface-container-highest text-on-surface font-bold hover:bg-surface-container transition-colors"
                      href={resolveBackendUrl(reportModal.report.heatmap_url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                      Open heatmap
                    </a>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setCreateOpen(false)}
            aria-label="Close dialog"
          />
          <div className="relative w-full max-w-lg">
            <Card className="p-6 md:p-7 shadow-2xl shadow-black/40 border border-outline-variant/15">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="font-headline font-extrabold text-xl text-on-surface">Create doctor</div>
                  <div className="text-sm text-on-surface-variant mt-1">Creates a doctor user account.</div>
                </div>
                <button
                  type="button"
                  className="text-on-surface-variant hover:text-primary transition-colors"
                  onClick={() => setCreateOpen(false)}
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="space-y-3">
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="block w-full px-4 py-3 bg-surface-container-lowest border border-outline/10 rounded-xl text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
                  placeholder="Doctor name"
                />
                <input
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="block w-full px-4 py-3 bg-surface-container-lowest border border-outline/10 rounded-xl text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
                  placeholder="Email"
                />
                <input
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="block w-full px-4 py-3 bg-surface-container-lowest border border-outline/10 rounded-xl text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
                  placeholder="Temporary password"
                />
                {createError && <div className="rounded-xl bg-error-container/30 text-error px-4 py-3 text-sm">{createError}</div>}
              </div>

              <div className="mt-6 flex flex-col-reverse md:flex-row gap-3 md:justify-end">
                <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={createLoading} icon="close">
                  Cancel
                </Button>
                <Button onClick={onCreateDoctor} disabled={createLoading} icon="person_add">
                  {createLoading ? "Creating..." : "Create"}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}

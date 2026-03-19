import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import api from "../../services/api";

type AdminUser = { id: number; name: string; email: string; role: string };
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

function formatCompact(n: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(n);
}

function formatPercent(confidence: number) {
  return `${(confidence * 100).toFixed(1)}%`;
}

function SvgBars(props: { labels: string[]; values: number[]; xLabel: string; yLabel: string; yUnit?: string }) {
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
          return (
            <g key={labels[i] ?? i}>
              <rect x={x} y={y} width={w} height={h} rx="10" fill="rgb(148,34,156)" fillOpacity="0.82" />
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

export default function AdminDashboard() {
  const navigate = useNavigate();
  const params = useParams();
  const section = String(params.section || "overview");
  const [tab, setTab] = useState<"overview" | "doctors" | "patients" | "reports">("overview");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [doctors, setDoctors] = useState<AdminUser[]>([]);
  const [patients, setPatients] = useState<AdminPatient[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);

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
    if (section === "overview" || section === "doctors" || section === "patients" || section === "reports") {
      setTab(section);
    } else {
      navigate("/admin/overview", { replace: true });
    }
  }, [navigate, section]);

  const stats = useMemo(() => {
    const critical = reports.filter((r) => r.prediction === "Severe" || r.prediction === "Proliferative DR").length;
    const avgConfidence = reports.length === 0 ? 0 : reports.reduce((a, r) => a + r.confidence, 0) / reports.length;
    return {
      doctors: doctors.length,
      patients: patients.length,
      reports: reports.length,
      critical,
      avgConfidence,
    };
  }, [doctors.length, patients.length, reports]);

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

  return (
    <main className="min-h-screen pt-24 pb-32 px-6 md:px-12 max-w-7xl mx-auto">
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
              <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Patients</div>
              <div className="text-3xl font-headline font-extrabold mt-2">{formatCompact(stats.patients)}</div>
            </Card>
            <Card className="p-6">
              <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Reports</div>
              <div className="text-3xl font-headline font-extrabold mt-2">{formatCompact(stats.reports)}</div>
            </Card>
            <Card className="p-6">
              <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Critical</div>
              <div className="text-3xl font-headline font-extrabold mt-2">{formatCompact(stats.critical)}</div>
            </Card>
            <Card className="p-6 col-span-2 lg:col-span-1">
              <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Avg confidence</div>
              <div className="text-3xl font-headline font-extrabold mt-2">{formatPercent(stats.avgConfidence)}</div>
            </Card>
          </div>

          <div className="lg:col-span-8 space-y-6">
            <Card className="p-6">
              <div className="font-headline font-bold text-xl mb-4">Severity Distribution</div>
              <SvgBars labels={["0", "1", "2", "3", "4"]} values={severityDist.counts} xLabel="DR stage (0–4)" yLabel="Reports (count)" yUnit="Reports" />
            </Card>
            <Card className="p-6">
              <div className="font-headline font-bold text-xl mb-4">Confidence Histogram</div>
              <SvgBars labels={confidenceHistogram.labels} values={confidenceHistogram.counts} xLabel="Confidence (%) bins" yLabel="Reports (count)" yUnit="Reports" />
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
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4 text-center">Patients</th>
                  <th className="py-3 pr-4 text-center">Reports</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {doctors.map((d) => {
                  const pCount = patients.filter((p) => p.doctor_id === d.id).length;
                  const rCount = reports.filter((r) => {
                    const p = patients.find((pp) => pp.id === r.patient_id);
                    return p?.doctor_id === d.id;
                  }).length;
                  return (
                    <tr key={d.id} className="text-sm hover:bg-surface-container-high transition-colors">
                      <td className="py-4 pr-4 font-semibold">{d.name}</td>
                      <td className="py-4 pr-4 text-on-surface-variant">{d.email}</td>
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
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4 text-center">Age</th>
                  <th className="py-3 pr-4">Gender</th>
                  <th className="py-3 pr-4">Assigned Doctor</th>
                  <th className="py-3 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {patients.map((p) => (
                  <tr key={p.id} className="text-sm hover:bg-surface-container-high transition-colors">
                    <td className="py-4 pr-4 font-semibold">{p.name}</td>
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
                    <td className="py-4 text-right text-on-surface-variant">{new Date(p.created_at).toLocaleString()}</td>
                  </tr>
                ))}
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
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                  <th className="py-3 pr-4">Report</th>
                  <th className="py-3 pr-4">Patient</th>
                  <th className="py-3 pr-4">Prediction</th>
                  <th className="py-3 pr-4 text-center">Confidence</th>
                  <th className="py-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {reports.slice(0, 200).map((r) => (
                  <tr key={r.id} className="text-sm hover:bg-surface-container-high transition-colors">
                    <td className="py-4 pr-4 font-semibold">#{r.id}</td>
                    <td className="py-4 pr-4 text-on-surface-variant">#{r.patient_id}</td>
                    <td className="py-4 pr-4 text-on-surface-variant">{r.prediction}</td>
                    <td className="py-4 pr-4 text-center text-on-surface-variant">{formatPercent(r.confidence)}</td>
                    <td className="py-4 text-right text-on-surface-variant">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {!isLoading && reports.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-on-surface-variant">
                      No reports yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
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

import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { listPatients, getPatient, type PatientResponse } from "../../services/patients";
import { listPatientReports, type ReportResponse } from "../../services/reports";
import { resolveBackendImageUrl } from "../../services/apiBase";
import { severityFromStage } from "../screening/mockAnalysis";
import { explainDoctorQuery, type DoctorAssistantExplainResponse } from "../../services/doctorAssistant";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatPercent(confidence: number) {
  return `${(confidence * 100).toFixed(1)}%`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function stageLabelFromScore(score: number) {
  if (score <= 1) return "No DR";
  if (score === 2) return "Mild";
  if (score === 3) return "Moderate";
  if (score === 4) return "Severe";
  return "Proliferative DR";
}

function worseningBadge(reportsAsc: ReportResponse[]) {
  if (reportsAsc.length < 2) return { label: "INSUFFICIENT_DATA", cls: "bg-surface-container text-text-variant border border-border" };
  const a = severityFromStage(reportsAsc[reportsAsc.length - 2]!.prediction);
  const b = severityFromStage(reportsAsc[reportsAsc.length - 1]!.prediction);
  if (b > a) return { label: "WORSENING", cls: "bg-red-500/15 text-red-200 border border-red-500/30" };
  if (b < a) return { label: "IMPROVING", cls: "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30" };
  return { label: "STABLE", cls: "bg-amber-500/15 text-amber-200 border border-amber-500/30" };
}

export default function PatientTimeline() {
  const [patients, setPatients] = useState<PatientResponse[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [patient, setPatient] = useState<PatientResponse | null>(null);
  const [reports, setReports] = useState<ReportResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [llmResult, setLlmResult] = useState<DoctorAssistantExplainResponse | null>(null);

  const filteredPatients = useMemo(() => {
    if (!searchQuery) return patients;
    const lower = searchQuery.toLowerCase();
    return patients.filter((p) => p.name.toLowerCase().includes(lower) || p.id.toString().includes(lower));
  }, [patients, searchQuery]);

  const reportsAsc = useMemo(() => {
    return [...reports].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [reports]);

  const latestReport = useMemo(() => {
    if (!reportsAsc.length) return null;
    return reportsAsc[reportsAsc.length - 1]!;
  }, [reportsAsc]);

  const worsening = useMemo(() => worseningBadge(reportsAsc), [reportsAsc]);

  const chartData = useMemo(() => {
    return reportsAsc.map((r) => ({
      t: new Date(r.created_at).getTime(),
      date: new Date(r.created_at).toLocaleDateString(),
      severity: severityFromStage(r.prediction),
      confidence: Number.isFinite(r.confidence) ? Math.round(r.confidence * 1000) / 10 : null,
      prediction: r.prediction,
    }));
  }, [reportsAsc]);

  useEffect(() => {
    let active = true;
    const refreshPatients = async () => {
      try {
        setPatientsLoading(true);
        const data = await listPatients();
        if (!active) return;
        setPatients(data);
        if (data.length > 0) {
          setPatientId(data[0]!.id);
          setSearchQuery(data[0]!.name);
        } else {
          setPatientId(null);
        }
      } catch {
        // ignore
      } finally {
        if (active) setPatientsLoading(false);
      }
    };
    void refreshPatients();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!patientId) {
        setPatient(null);
        setReports([]);
        setLlmResult(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg(null);
      setLlmResult(null);
      setLlmError(null);
      try {
        const [p, r] = await Promise.all([getPatient(patientId), listPatientReports(patientId)]);
        if (!active) return;
        setPatient(p);
        setReports(r || []);
      } catch (err: any) {
        if (!active) return;
        setErrorMsg(err?.response?.data?.detail || err?.message || "Failed to load patient timeline");
        setPatient(null);
        setReports([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [patientId]);

  const runLlmSummary = async () => {
    if (!patientId) return;
    setLlmLoading(true);
    setLlmError(null);
    setLlmResult(null);
    try {
      const data = await explainDoctorQuery({
        context_type: "patient",
        patient_id: patientId,
        task: "answer",
        doctor_query:
          "Summarize this patient's diabetic retinopathy progression over time based on the report history. " +
          "Highlight whether the trend is worsening/stable/improving, note any severe/proliferative risk, and suggest a safe follow-up interval and red flags.",
      });
      setLlmResult(data);
    } catch (err: any) {
      setLlmError(err?.response?.data?.detail || err?.message || "Failed to generate AI summary");
    } finally {
      setLlmLoading(false);
    }
  };

  return (
    <main className="pt-24 pb-28 px-6 md:px-12 max-w-[1600px] mx-auto">
      <div className="mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h1 className="font-headline text-4xl font-extrabold text-on-surface tracking-tight mb-2">Patient Timeline</h1>
          <p className="text-on-surface-variant text-lg tracking-wide">
            Select a patient to view demographics, report history, evolution charts, and an AI-generated summary.
          </p>
        </div>

        <div className="w-full max-w-xl">
          <span className="text-sm text-on-surface-variant">Patient</span>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-8 relative z-[100]">
              <label className="block text-sm font-label text-on-surface-variant mb-2">Search & Select Patient</label>
              <ul className="menu w-full">
                <li className={`item w-full ${isDropdownOpen ? "is-open" : ""}`}>
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
                        if (patientId) setPatientId(null);
                      }}
                      disabled={patientsLoading}
                      className="w-full bg-transparent outline-none text-white placeholder-white/80 font-bold"
                    />
                    <svg viewBox="0 0 360 360" xmlSpace="preserve" className="shrink-0 pointer-events-none">
                      <g id="SVGRepo_iconCarrier">
                        <path
                          id="XMLID_225_"
                          d="M325.607,79.046H34.393C15.401,79.046,0,94.448,0,113.439v133.122c0,18.991,15.401,34.393,34.393,34.393 h291.214c18.991,0,34.393-15.402,34.393-34.393V113.439C360,94.448,344.599,79.046,325.607,79.046z M300,165.733H193.303V133.2h106.697V165.733z M240.231,230.147H102.766V197.618h137.465V230.147z"
                        ></path>
                      </g>
                    </svg>
                  </div>
                  <ul className="submenu w-full border-t-0 shadow-2xl custom-scrollbar">
                    {filteredPatients.length === 0 ? (
                      <li className="submenu-item py-4 text-center text-text-variant text-sm">No matching patients found.</li>
                    ) : (
                      filteredPatients.map((p) => (
                        <li className="submenu-item" key={p.id}>
                          <button
                            type="button"
                            className="submenu-link"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setPatientId(p.id);
                              setSearchQuery(p.name);
                              setIsDropdownOpen(false);
                            }}
                          >
                            <span className="font-bold text-text-primary">{p.name}</span>{" "}
                            <span className="opacity-50 text-xs">(#{p.id})</span>
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
                onClick={async () => {
                  try {
                    setPatientsLoading(true);
                    const data = await listPatients();
                    setPatients(data);
                  } finally {
                    setPatientsLoading(false);
                  }
                }}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : errorMsg ? (
        <Card className="p-6 border border-red-500/30 bg-red-500/5">
          <div className="text-red-200 font-bold mb-1">Failed to load</div>
          <div className="text-red-200/80 text-sm">{errorMsg}</div>
        </Card>
      ) : !patient ? (
        <Card className="p-6">
          <div className="text-on-surface-variant">No patient selected.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1 space-y-6">
            <Card className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl font-bold text-on-surface">{patient.name}</div>
                  <div className="text-on-surface-variant text-sm mt-1">
                    Patient #{patient.id} • Added {new Date(patient.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-widest uppercase ${worsening.cls}`}>
                  {worsening.label}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-text-variant text-[11px] tracking-widest uppercase">Age</div>
                  <div className="text-on-surface font-bold">{patient.age ?? "—"}</div>
                </div>
                <div>
                  <div className="text-text-variant text-[11px] tracking-widest uppercase">Gender</div>
                  <div className="text-on-surface font-bold">{patient.gender || "—"}</div>
                </div>
                <div>
                  <div className="text-text-variant text-[11px] tracking-widest uppercase">Phone</div>
                  <div className="text-on-surface font-bold">{patient.phone || "—"}</div>
                </div>
                <div>
                  <div className="text-text-variant text-[11px] tracking-widest uppercase">Address</div>
                  <div className="text-on-surface font-bold truncate" title={patient.address || ""}>
                    {patient.address || "—"}
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-border pt-4">
                <div className="text-text-variant text-[11px] tracking-widest uppercase mb-2">Latest</div>
                {latestReport ? (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-on-surface font-bold">{latestReport.prediction}</div>
                      <div className="text-on-surface-variant text-sm">
                        {formatDateTime(latestReport.created_at)} • {formatPercent(latestReport.confidence)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-text-variant text-[11px] tracking-widest uppercase">Reports</div>
                      <div className="text-on-surface font-bold">{reports.length}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-on-surface-variant">No reports yet.</div>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-on-surface">AI Summary</div>
                  <div className="text-on-surface-variant text-sm">Generated from existing report history.</div>
                </div>
                <Button onClick={runLlmSummary} disabled={llmLoading || reportsAsc.length === 0}>
                  {llmLoading ? "Generating…" : llmResult?.answer ? "Regenerate" : "Generate"}
                </Button>
              </div>

              {reportsAsc.length === 0 ? (
                <div className="mt-4 text-on-surface-variant text-sm">Add at least one report to generate a summary.</div>
              ) : llmError ? (
                <div className="mt-4 text-red-200 text-sm">{llmError}</div>
              ) : llmResult?.answer ? (
                <div className="mt-4 whitespace-pre-wrap text-on-surface text-sm leading-relaxed">{llmResult.answer}</div>
              ) : (
                <div className="mt-4 text-on-surface-variant text-sm">
                  Click Generate to create a patient-friendly clinical summary (with safe fallback if LLM is unavailable).
                </div>
              )}
            </Card>
          </div>

          <div className="xl:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-lg font-bold text-on-surface">Evolution</div>
                  <div className="text-on-surface-variant text-sm">Severity score (1–5) and confidence over time.</div>
                </div>
                <div className="text-text-variant text-xs">
                  Severity: {stageLabelFromScore(1)} → {stageLabelFromScore(5)}
                </div>
              </div>

              <div className="h-[320px]">
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: 8, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="t"
                        type="number"
                        scale="time"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(t) => new Date(t).toLocaleDateString()}
                        stroke="rgba(255,255,255,0.55)"
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        yAxisId="sev"
                        domain={[1, 5]}
                        ticks={[1, 2, 3, 4, 5]}
                        tickFormatter={(v) => `${v}`}
                        stroke="rgba(255,255,255,0.55)"
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        yAxisId="conf"
                        orientation="right"
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                        tickFormatter={(v) => `${v}%`}
                        stroke="rgba(255,255,255,0.55)"
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{ background: "rgba(15, 15, 25, 0.95)", border: "1px solid rgba(255,255,255,0.12)" }}
                        labelFormatter={(label) => new Date(Number(label)).toLocaleString()}
                        formatter={(value: any, name) => {
                          if (name === "Severity") return [String(value), "Severity"];
                          return [`${value}%`, "Confidence"];
                        }}
                      />
                      <Legend />
                      <Line yAxisId="sev" type="monotone" dataKey="severity" name="Severity" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 3 }} />
                      <Line yAxisId="conf" type="monotone" dataKey="confidence" name="Confidence" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-on-surface-variant">No report history.</div>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-lg font-bold text-on-surface">Reports</div>
                  <div className="text-on-surface-variant text-sm">Chronological history (latest first).</div>
                </div>
              </div>

              {!reports.length ? (
                <div className="text-on-surface-variant">No reports yet for this patient.</div>
              ) : (
                <div className="space-y-3">
                  {[...reportsAsc].reverse().map((r) => {
                    const img = resolveBackendImageUrl(r.image_url);
                    const heat = resolveBackendImageUrl(r.heatmap_url);
                    return (
                      <div
                        key={r.id}
                        className="p-4 rounded-2xl border border-border bg-surface-container-lowest/40 hover:bg-surface-container-lowest/70 transition-colors"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-on-surface font-bold">{r.prediction}</div>
                              <div className="text-text-variant text-xs">•</div>
                              <div className="text-on-surface-variant text-sm">{formatDateTime(r.created_at)}</div>
                              <div className="text-text-variant text-xs">•</div>
                              <div className="text-on-surface-variant text-sm">{formatPercent(r.confidence)}</div>
                            </div>
                            {(r.decision || r.risk_level || r.risk_score != null) && (
                              <div className="mt-2 text-on-surface-variant text-sm">
                                {r.decision ? <span className="mr-3">Decision: <span className="text-on-surface font-bold">{r.decision}</span></span> : null}
                                {r.risk_level ? <span className="mr-3">Risk: <span className="text-on-surface font-bold">{r.risk_level}</span></span> : null}
                                {typeof r.risk_score === "number" ? <span>Score: <span className="text-on-surface font-bold">{r.risk_score.toFixed(3)}</span></span> : null}
                              </div>
                            )}
                            {r.description ? (
                              <div className="mt-2 text-on-surface text-sm whitespace-pre-wrap">{r.description}</div>
                            ) : null}
                            {r.image_explanation ? (
                              <div className="mt-3 text-on-surface-variant text-sm whitespace-pre-wrap">
                                <span className="text-text-variant text-[11px] tracking-widest uppercase mr-2">XAI</span>
                                {r.image_explanation}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex gap-3 shrink-0">
                            {img ? (
                              <a href={img} target="_blank" rel="noreferrer" className="block">
                                <img
                                  src={img}
                                  alt="Fundus"
                                  className="w-24 h-24 object-cover rounded-xl border border-border"
                                />
                              </a>
                            ) : null}
                            {heat ? (
                              <a href={heat} target="_blank" rel="noreferrer" className="block">
                                <img
                                  src={heat}
                                  alt="Heatmap"
                                  className="w-24 h-24 object-cover rounded-xl border border-border"
                                />
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { listPatients, type PatientResponse } from "../../services/patients";
import {
  explainDoctorQuery,
  type DoctorAssistantContextType,
  type DoctorAssistantExplainResponse,
  type DoctorAssistantTask,
  type DoctorAssistantTimeframe,
} from "../../services/doctorAssistant";

function priorityClasses(priority?: string | null) {
  if (priority === "high") return "bg-red-500/15 text-red-200 border border-red-500/30";
  if (priority === "medium") return "bg-amber-500/15 text-amber-200 border border-amber-500/30";
  return "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30";
}

export default function DoctorAssistant() {
  const [contextType, setContextType] = useState<DoctorAssistantContextType>("patient");
  const [task, setTask] = useState<DoctorAssistantTask>("answer");
  const [patients, setPatients] = useState<PatientResponse[]>([]);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [timeframe, setTimeframe] = useState<DoctorAssistantTimeframe | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<DoctorAssistantExplainResponse | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await listPatients();
        if (!active) return;
        setPatients(data);
        if (data.length > 0) setPatientId(data[0].id);
      } catch {
        // ignore
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const canSubmit = useMemo(() => {
    if (!query.trim()) return false;
    if (contextType === "patient") return !!patientId;
    if (timeframe === "custom") return !!startDate && !!endDate;
    return true;
  }, [contextType, patientId, query, timeframe, startDate, endDate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const data = await explainDoctorQuery({
        patient_id: contextType === "patient" ? patientId : null,
        doctor_query: query.trim(),
        context_type: contextType,
        task,
        timeframe: contextType === "general" ? null : timeframe,
        start_date: timeframe === "custom" ? startDate : null,
        end_date: timeframe === "custom" ? endDate : null,
      });
      setResult(data);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || err?.message || "Failed to reach Doctor Assistant API");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-6 pt-24 pb-24 max-w-5xl mx-auto">
      <div className="mb-10 flex items-start gap-4">
        <div className="p-3 rounded-2xl" style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', boxShadow: '0 8px 20px #0d948855' }}>
          <span className="material-symbols-outlined text-[32px] text-white">magic_button</span>
        </div>
        <div>
          <h1 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">Doctor Assistant</h1>
          <p className="text-on-surface-variant text-lg tracking-wide mt-1">
            Ask patient-specific questions, summarize reports, or get general AI diagnostics guidance.
          </p>
        </div>
      </div>

      <Card className="p-0 overflow-hidden shadow-xl border-y border-x border-border">
        <div className="px-8 py-5 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)' }}>
          <span className="material-symbols-outlined text-white text-[24px]">forum</span>
          <h3 className="text-xl font-bold text-white tracking-wide">Assistant Interface</h3>
        </div>
        <div className="p-8 bg-surface">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              setContextType("reports_range");
              setTask("triage_queue");
              setTimeframe("7d");
              setQuery("Recommend a triage queue for the last 7 days and justify the urgency for each patient.");
            }}
            className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface border border-outline/30 hover:border-primary/60 text-sm"
          >
            Triage Queue (7d)
          </button>
          <button
            type="button"
            onClick={() => {
              setContextType("patient");
              setTask("draft_referral_letter");
              setQuery("Draft a retina specialist referral letter for this patient based on the latest report.");
            }}
            className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface border border-outline/30 hover:border-primary/60 text-sm"
          >
            Draft Referral Letter
          </button>
          <button
            type="button"
            onClick={() => {
              setContextType("patient");
              setTask("draft_followup_plan");
              setQuery("Draft a follow-up plan (tests, follow-up interval, red flags) for this patient.");
            }}
            className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface border border-outline/30 hover:border-primary/60 text-sm"
          >
            Draft Follow-up Plan
          </button>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResult(null);
              setErrorMsg(null);
            }}
            className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface border border-outline/30 hover:border-primary/60 text-sm"
          >
            Clear
          </button>
          {result?.answer && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(result.answer || "");
                } catch {
                  // ignore
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface border border-outline/30 hover:border-primary/60 text-sm"
            >
              Copy Answer
            </button>
          )}
        </div>

        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-on-surface-variant">Context</span>
            <select
              value={contextType}
              onChange={(e) => {
                const v = e.target.value as DoctorAssistantContextType;
                setContextType(v);
                setResult(null);
                if (v === "general") {
                  setTask("answer");
                  setTimeframe(null);
                  setStartDate("");
                  setEndDate("");
                }
                if (v === "today_reports") {
                  setTask((t) => (t === "draft_referral_letter" || t === "draft_followup_plan" ? "answer" : t));
                  setTimeframe("today");
                  setStartDate("");
                  setEndDate("");
                }
                if (v === "reports_range") {
                  setTask((t) => (t === "draft_referral_letter" || t === "draft_followup_plan" ? "triage_queue" : t));
                  setTimeframe((tf) => tf || "7d");
                }
              }}
              className="bg-surface-container-high text-on-surface rounded-lg px-3 py-2 outline-none border border-outline/30 focus:border-primary/60"
            >
              <option value="patient">Patient</option>
              <option value="today_reports">Today Reports</option>
              <option value="reports_range">Reports (Range)</option>
              <option value="general">General</option>
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-on-surface-variant">Task</span>
            <select
              value={task}
              onChange={(e) => setTask(e.target.value as DoctorAssistantTask)}
              className="bg-surface-container-high text-on-surface rounded-lg px-3 py-2 outline-none border border-outline/30 focus:border-primary/60"
            >
              <option value="answer">Answer</option>
              <option value="triage_queue">Triage Queue</option>
              <option value="draft_referral_letter" disabled={contextType !== "patient"}>
                Draft Referral Letter
              </option>
              <option value="draft_followup_plan" disabled={contextType !== "patient"}>
                Draft Follow-up Plan
              </option>
            </select>
          </label>

          <label className="flex flex-col gap-2 md:col-span-2">
            <span className="text-sm text-on-surface-variant">Patient</span>
            <select
              value={patientId ?? ""}
              onChange={(e) => setPatientId(e.target.value ? Number(e.target.value) : null)}
              disabled={contextType !== "patient"}
              className="bg-surface-container-high text-on-surface rounded-lg px-3 py-2 outline-none border border-outline/30 focus:border-primary/60 disabled:opacity-60"
            >
              {patients.length === 0 && <option value="">No patients found</option>}
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (#{p.id})
                </option>
              ))}
            </select>
          </label>

          {(contextType === "today_reports" || contextType === "reports_range" || contextType === "patient") && (
            <div className="md:col-span-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-on-surface-variant mr-1">Timeframe</span>
                {(["today", "7d", "30d", "90d", "all"] as DoctorAssistantTimeframe[]).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => {
                      setTimeframe(tf);
                      setStartDate("");
                      setEndDate("");
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${
                      timeframe === tf
                        ? "bg-primary/15 text-on-surface border-primary/50"
                        : "bg-surface-container-high text-on-surface border-outline/30 hover:border-primary/60"
                    }`}
                  >
                    {tf.toUpperCase()}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setTimeframe("custom")}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    timeframe === "custom"
                      ? "bg-primary/15 text-on-surface border-primary/50"
                      : "bg-surface-container-high text-on-surface border-outline/30 hover:border-primary/60"
                  }`}
                >
                  CUSTOM
                </button>
              </div>

              {timeframe === "custom" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-on-surface-variant">Start date</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-surface-container-high text-on-surface rounded-lg px-3 py-2 outline-none border border-outline/30 focus:border-primary/60"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-on-surface-variant">End date</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-surface-container-high text-on-surface rounded-lg px-3 py-2 outline-none border border-outline/30 focus:border-primary/60"
                    />
                  </label>
                  <div className="text-xs text-on-surface-variant self-end pb-2">
                    Uses backend UTC dates.
                  </div>
                </div>
              )}
            </div>
          )}

          <label className="flex flex-col gap-2 md:col-span-3">
            <span className="text-sm text-on-surface-variant">Doctor query</span>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={4}
              placeholder={
                contextType === "today_reports"
                  ? "Summarize today’s severe cases and suggested next steps…"
                  : contextType === "reports_range"
                  ? "Summarize the selected period and suggest triage priorities…"
                  : contextType === "general"
                  ? "What is diabetic retinopathy? How to treat grade 3 DR?"
                  : "Explain current stage and risk; is the patient worsening compared to last visit?"
              }
              className="bg-surface-container-high text-on-surface rounded-lg px-3 py-2 outline-none border border-outline/30 focus:border-primary/60"
            />
          </label>

          <div className="md:col-span-3 flex items-center gap-3">
            <Button type="submit" disabled={!canSubmit || loading}>
              {loading ? "Asking…" : "Ask Assistant"}
            </Button>
            {(contextType === "today_reports" || contextType === "reports_range") && (
              <span className="text-xs text-on-surface-variant">
                Time filtering uses backend UTC dates.
              </span>
            )}
          </div>
        </form>
        </div>
      </Card>

      {errorMsg && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
          {errorMsg}
        </div>
      )}

      {result && (
        <Card className="mt-8 p-0 overflow-hidden border-0 shadow-lg">
           <div className="px-8 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #4f46e5, #2563eb)' }}>
            <div className="flex items-center gap-3 text-white">
              <span className="material-symbols-outlined text-white text-[22px]">auto_awesome</span>
              <h3 className="text-lg font-bold tracking-wide">AI Analysis</h3>
            </div>
            {result.provider_used && (
              <div className="text-xs bg-white/20 px-2 py-1 rounded font-mono font-bold text-white tracking-widest uppercase shadow-inner">
                {result.provider_used}
              </div>
            )}
          </div>
          <div className="p-8 bg-surface">
            <div className="flex flex-wrap items-center gap-3 mb-6">
              {result.priority && (
                <span className={`px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-widest font-mono font-bold shadow-sm ${priorityClasses(result.priority)}`}>
                  Priority: {result.priority}
                </span>
              )}
              {result.worsening_detected && (
                <span className="px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-widest font-mono font-bold bg-[#B26357] text-white shadow-sm shadow-[#B26357]/30">
                  Worsening detected
                </span>
              )}
              {result.status === "error" && (
                <span className="px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-widest font-mono font-bold bg-surface-container-high text-on-surface border border-outline/30">
                  Fallback: {result.fallback || "rule-based"}
                </span>
              )}
            </div>

            {result.summary && (
              <p className="text-sm border border-border bg-surface-container/40 p-4 rounded-xl text-on-surface leading-relaxed mb-6">
                {result.summary}
              </p>
            )}

            {result.priority_reason && (
              <p className="mb-3 text-sm text-on-surface-variant flex gap-2">
                <span className="font-bold font-mono text-[11px] uppercase tracking-widest px-2 py-0.5 rounded bg-surface-container border border-border shrink-0 mt-0.5 max-h-5 flex items-center">Reason</span> 
                {result.priority_reason}
              </p>
            )}

            {result.message && (
              <p className="mb-4 text-sm text-on-surface-variant flex gap-2">
                <span className="font-bold font-mono text-[11px] uppercase tracking-widest px-2 py-0.5 rounded bg-surface-container border border-border shrink-0 mt-0.5 max-h-5 flex items-center">System msg</span>
                {result.message}
              </p>
            )}

            <div className="mt-6 pt-6 border-t border-border">
              <div className="text-xs font-mono font-bold uppercase tracking-widest text-text-variant mb-3">Response</div>
              <pre className="whitespace-pre-wrap text-[15px] font-body leading-[1.8] text-on-surface">
                {result.answer || "(no answer)"}
              </pre>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

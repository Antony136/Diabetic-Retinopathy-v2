import { useEffect, useMemo, useState, type FormEvent } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { listPatients, type PatientResponse } from "../../services/patients";
import {
  explainDoctorQuery,
  type DoctorAssistantContextType,
  type DoctorAssistantExplainResponse,
} from "../../services/doctorAssistant";

function priorityClasses(priority?: string | null) {
  if (priority === "high") return "bg-red-500/15 text-red-200 border border-red-500/30";
  if (priority === "medium") return "bg-amber-500/15 text-amber-200 border border-amber-500/30";
  return "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30";
}

export default function DoctorAssistant() {
  const [contextType, setContextType] = useState<DoctorAssistantContextType>("patient");
  const [patients, setPatients] = useState<PatientResponse[]>([]);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

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
    return true;
  }, [contextType, patientId, query]);

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
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Doctor Assistant</h1>
          <p className="text-on-surface-variant mt-1">
            Ask patient-specific questions, summarize today’s reports, or get general DR guidance.
          </p>
        </div>
      </div>

      <Card className="p-5">
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-on-surface-variant">Context</span>
            <select
              value={contextType}
              onChange={(e) => setContextType(e.target.value as DoctorAssistantContextType)}
              className="bg-surface-container-high text-on-surface rounded-lg px-3 py-2 outline-none border border-outline/30 focus:border-primary/60"
            >
              <option value="patient">Patient</option>
              <option value="today_reports">Today Reports</option>
              <option value="general">General</option>
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

          <label className="flex flex-col gap-2 md:col-span-3">
            <span className="text-sm text-on-surface-variant">Doctor query</span>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={4}
              placeholder={
                contextType === "today_reports"
                  ? "Summarize today’s severe cases and suggested next steps…"
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
            {contextType === "today_reports" && (
              <span className="text-xs text-on-surface-variant">
                Uses today’s UTC date from the backend.
              </span>
            )}
          </div>
        </form>
      </Card>

      {errorMsg && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
          {errorMsg}
        </div>
      )}

      {result && (
        <Card className="mt-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${priorityClasses(
                  result.priority
                )}`}
              >
                Priority: {result.priority || "n/a"}
              </span>
              {result.worsening_detected && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-500/30">
                  Worsening detected
                </span>
              )}
              {result.status === "error" && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-container-high text-on-surface border border-outline/30">
                  Fallback: {result.fallback || "rule-based"}
                </span>
              )}
            </div>
            {result.provider_used && (
              <div className="text-xs text-on-surface-variant">Provider: {result.provider_used}</div>
            )}
          </div>

          {result.summary && <p className="mt-4 text-on-surface-variant">{result.summary}</p>}

          {result.priority_reason && (
            <p className="mt-2 text-sm text-on-surface-variant">
              <span className="font-semibold text-on-surface">Priority reason:</span> {result.priority_reason}
            </p>
          )}

          {result.message && (
            <p className="mt-3 text-sm text-on-surface-variant">
              <span className="font-semibold text-on-surface">Backend:</span> {result.message}
            </p>
          )}

          <pre className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-on-surface">
            {result.answer || "(no answer)"}
          </pre>
        </Card>
      )}
    </div>
  );
}


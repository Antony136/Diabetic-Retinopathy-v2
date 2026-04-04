import { useState, useEffect, type FormEvent } from "react";
import { getTriageCases } from "../../services/api";
import { listPatients, createPatient, type PatientResponse } from "../../services/patients";
import { createManualReport } from "../../services/reports";
import PatientDetailsModal from "../../components/patients/PatientDetailsModal";
import Card from "../../components/ui/Card";
import { useScreeningMode } from "../../contexts/ScreeningModeContext";
import FadeInReveal from "../../components/ui/FadeInReveal";

type ReportData = {
  id: number;
  patient_id: number;
  patient_name: string;
  image_url: string;
  heatmap_url: string;
  prediction: string;
  confidence: number;
  created_at: string;
};

function timeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes || 1}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return `Yesterday`;
  return `${days}d ago`;
}


export default function Triage() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [patientModalId, setPatientModalId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [timeframe, setTimeframe] = useState<"1d" | "7d" | "30d" | "custom" | "all">("7d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");

  // Manual Entry Modal States
  const [showModal, setShowModal] = useState(false);
  const [patients, setPatients] = useState<PatientResponse[]>([]);
  const [patientMode, setPatientMode] = useState<"existing" | "new">("existing");
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);

  const [newName, setNewName] = useState("");
  const [newAge, setNewAge] = useState<number>(35);
  const [newGender, setNewGender] = useState("Male");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");

  const [severity, setSeverity] = useState("Critical"); // Critical, High Risk, Moderate, Stable
  const [description, setDescription] = useState("");
  
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { adaptiveMode, setAdaptiveMode } = useScreeningMode();

  useEffect(() => {
    fetchTriageCases();
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const data = await listPatients();
      setPatients(data);
      if (data.length > 0) setSelectedPatientId(data[0].id);
    } catch {
      // Handle silently
    }
  };

  const fetchTriageCases = async () => {
    try {
      const params: any = { latest_per_patient: true, timeframe };
      if (timeframe === "custom") {
        params.start_date = startDate;
        params.end_date = endDate;
      }
      const data = await getTriageCases(params);
      const items: ReportData[] = (data || []).filter((r: ReportData) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        const hay = `${r.patient_name ?? ""} ${r.prediction ?? ""} #${r.patient_id} #${r.id}`.toLowerCase();
        return hay.includes(q);
      });
      setReports(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const id = window.setTimeout(() => {
      fetchTriageCases();
    }, 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, startDate, endDate, search]);

  const mapSeverityToPrediction = (sev: string) => {
    if (sev === "Critical") return "Severe";
    if (sev === "High Risk") return "Moderate";
    if (sev === "Moderate") return "Mild";
    return "No DR";
  };

  const handleSubmitManualEntry = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      let finalPatientId = selectedPatientId;

      if (patientMode === "new") {
        if (!newName.trim()) throw new Error("Patient name is required.");
        const newPatient = await createPatient({
          name: newName.trim(),
          age: Number(newAge),
          gender: newGender,
          phone: newPhone.trim(),
          address: newAddress.trim(),
        });
        setPatients([newPatient, ...patients]);
        finalPatientId = newPatient.id;
        setSelectedPatientId(newPatient.id);
      }

      if (!finalPatientId) throw new Error("Please select or create a patient.");

      await createManualReport({
        patient_id: finalPatientId,
        prediction: mapSeverityToPrediction(severity),
        confidence: 1.0,
        description: description.trim() || undefined,
      });

      // Refresh triage board
      await fetchTriageCases();
      
      // Reset and close modal
      setShowModal(false);
      setPatientMode("existing");
      setSeverity("Critical");
      setDescription("");
      setNewName("");
      setNewPhone("");
      setNewAddress("");

    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create manual entry.");
    } finally {
      setSubmitting(false);
    }
  };

  const categorizedData = {
    "Proliferative DR": reports.filter(r => r.prediction === "Proliferative DR"),
    "Severe": reports.filter(r => r.prediction === "Severe"),
    "Moderate": reports.filter(r => r.prediction === "Moderate"),
    "Mild": reports.filter(r => r.prediction === "Mild"),
  };

  // Column color config: gradient, card left-border color, card bg tint
  const columnMeta: Record<string, { gradFrom: string; gradTo: string; cardBorder: string; cardBg: string; labelChip: string }> = {
    "Proliferative DR": { gradFrom: '#b91c1c', gradTo: '#7f1d1d', cardBorder: '#ef4444', cardBg: 'rgba(239, 68, 68, 0.07)', labelChip: 'bg-red-600 text-white' },
    'Severe':           { gradFrom: '#B26357', gradTo: '#8b2e22', cardBorder: '#B26357', cardBg: 'rgba(178,99,87,0.07)',   labelChip: 'bg-[#B26357] text-white' },
    'Moderate':         { gradFrom: '#C4812A', gradTo: '#92400e', cardBorder: '#C4812A', cardBg: 'rgba(196,129,42,0.07)',  labelChip: 'bg-[#C4812A] text-white' },
    'Mild':             { gradFrom: '#4f46e5', gradTo: '#3730a3', cardBorder: '#6366f1', cardBg: 'rgba(99, 102, 241, 0.07)', labelChip: 'bg-indigo-600 text-white' },
  };

  const triageColumns = [
    {
      title: "Proliferative DR",
      count: categorizedData["Proliferative DR"].length,
      label: "URGENT_TREATMENT",
      icon: "bolt",
      cards: categorizedData["Proliferative DR"].map(r => ({
        id: r.id,
        patientId: r.patient_id,
        name: r.patient_name || 'Unknown',
        pid: `#RET-${r.patient_id.toString().padStart(4, '0')}`,
        insight: `Advanced Neovascularization Suspected`,
        timeAgo: timeAgo(r.created_at),
      }))
    },
    {
      title: "Severe",
      count: categorizedData.Severe.length,
      label: "IMMINENT_THREAT",
      icon: "priority_high",
      cards: categorizedData.Severe.map(r => ({
        id: r.id,
        patientId: r.patient_id,
        name: r.patient_name || 'Unknown',
        pid: `#RET-${r.patient_id.toString().padStart(4, '0')}`,
        insight: `Significant NPDR changes detected`,
        timeAgo: timeAgo(r.created_at),
      }))
    },
    {
      title: "Moderate",
      count: categorizedData.Moderate.length,
      label: "MONITORING_REQUIRED",
      icon: "warning",
      cards: categorizedData.Moderate.map(r => ({
        id: r.id,
        patientId: r.patient_id,
        name: r.patient_name || 'Unknown',
        pid: `#RET-${r.patient_id.toString().padStart(4, '0')}`,
        insight: `Review within 3-6 months`,
        timeAgo: timeAgo(r.created_at),
      }))
    },
    {
      title: "Mild",
      count: categorizedData.Mild.length,
      label: "PREVENTATIVE_FOLLOWUP",
      icon: "schedule",
      cards: categorizedData.Mild.map(r => ({
        id: r.id,
        patientId: r.patient_id,
        name: r.patient_name || 'Unknown',
        pid: `#RET-${r.patient_id.toString().padStart(4, '0')}`,
        insight: `Early progression noted`,
        timeAgo: timeAgo(r.created_at),
      }))
    }
  ].filter(col => {
    if (adaptiveMode === 'standard') {
        return col.title === "Proliferative DR" || col.title === "Severe";
    }
    return true; // High sensitivity shows all 4
  });
  return (
    <main className="pt-24 pb-32 px-6 md:px-12 max-w-[1600px] mx-auto">
      <div className="mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h1 className="font-headline text-4xl font-extrabold text-on-surface tracking-tight mb-4">
            Triage Queue
          </h1>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
            <div className="flex flex-col pr-4 border-r border-white/10">
              <span className="text-[10px] text-text-variant font-mono uppercase tracking-widest mb-1">Adaptive Mode</span>
              <span className="text-xs text-text-primary font-mono font-bold tracking-tight">{adaptiveMode === 'high_sensitivity' ? 'SENSITIVITY_PRIORITY' : 'EFFICIENCY_TRIAGE'}</span>
            </div>
            <div className="flex bg-black/40 p-1 rounded-xl gap-1">
              <button 
                onClick={() => setAdaptiveMode('standard')}
                className={`px-4 py-2 rounded-lg text-[10px] font-mono font-bold transition-all tracking-widest ${adaptiveMode === 'standard' ? 'bg-primary-bright text-black shadow-[0_0_15px_rgba(200,124,255,0.4)]' : 'text-text-variant hover:text-text-primary'}`}
              >
                STANDARD
              </button>
              <button 
                onClick={() => setAdaptiveMode('high_sensitivity')}
                className={`px-4 py-2 rounded-lg text-[10px] font-mono font-bold transition-all tracking-widest ${adaptiveMode === 'high_sensitivity' ? 'bg-secondary-bright text-black shadow-[0_0_15px_rgba(255,100,200,0.4)]' : 'text-text-variant hover:text-text-primary'}`}
              >
                HIGH_SENSITIVITY
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <div className="flex flex-nowrap items-center gap-2 min-w-max">
            <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline/10 rounded-xl px-2 py-1.5">
              <span className="material-symbols-outlined text-outline text-[16px]">search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="bg-transparent outline-none text-xs text-on-surface w-[180px]"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-surface-container-lowest border border-outline/10 rounded-xl px-1.5 py-1.5">
            {(["1d", "7d", "30d", "all"] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => {
                  setTimeframe(tf);
                  setStartDate("");
                  setEndDate("");
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                  timeframe === tf
                    ? "border-primary/40 text-primary bg-primary/10"
                    : "border-outline/10 text-on-surface-variant hover:text-primary hover:border-primary/30"
                }`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTimeframe("custom")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                timeframe === "custom"
                  ? "border-primary/40 text-primary bg-primary/10"
                  : "border-outline/10 text-on-surface-variant hover:text-primary hover:border-primary/30"
              }`}
            >
              CUSTOM
            </button>
            </div>

            <div className="flex items-center gap-1.5 bg-surface-container-lowest border border-outline/10 rounded-xl px-1.5 py-1.5">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                viewMode === "kanban"
                  ? "border-primary/40 text-primary bg-primary/10"
                  : "border-outline/10 text-on-surface-variant hover:text-primary hover:border-primary/30"
              }`}
            >
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                viewMode === "list"
                  ? "border-primary/40 text-primary bg-primary/10"
                  : "border-outline/10 text-on-surface-variant hover:text-primary hover:border-primary/30"
              }`}
            >
              List
            </button>
            </div>

            <button 
              onClick={() => setShowModal(true)}
              className="shrink-0 bg-gradient-to-r from-primary to-primary-container px-4 py-2 rounded-xl text-on-primary-container font-bold font-label flex items-center gap-2 shadow-lg shadow-primary/10 hover:opacity-90 transition-opacity text-sm">
              <span className="material-symbols-outlined text-[18px]">add</span>
              Manual Entry
            </button>
          </div>
        </div>
      </div>

      {timeframe === "custom" && (
        <div className="mb-8 bg-surface-container-lowest border border-outline/10 rounded-2xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-surface border border-border text-text-primary px-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">End date</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-surface border border-border text-text-primary px-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-primary/40"
              />
            </label>
            <button
              type="button"
              onClick={() => fetchTriageCases()}
              disabled={!startDate || !endDate}
              className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Apply
            </button>
          </div>
          <div className="text-xs text-on-surface-variant mt-3">Filtering uses backend UTC timestamps.</div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 font-body text-on-surface-variant">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mr-3" />
          Loading triage queue...
        </div>
      ) : viewMode === "list" ? (
        <Card className="p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="font-headline font-bold text-lg">Ranked patients</div>
            <div className="text-xs text-on-surface-variant">{reports.length} patients</div>
          </div>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                  <th className="py-3 pr-4">Patient</th>
                  <th className="py-3 pr-4">Prediction</th>
                  <th className="py-3 pr-4 text-center">Confidence</th>
                  <th className="py-3 pr-4 text-right">Time</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {[...reports]
                  .filter(r => {
                    if (adaptiveMode === 'standard') {
                        return ["Proliferative DR", "Severe"].includes(r.prediction);
                    }
                    return r.prediction !== "No DR";
                  })
                  .sort((a, b) => {
                    const rank = (p: string) => {
                        if (p === "Proliferative DR") return 4;
                        if (p === "Severe") return 3;
                        if (p === "Moderate") return 2;
                        if (p === "Mild") return 1;
                        return 0;
                    };
                    return rank(b.prediction) - rank(a.prediction) || +new Date(b.created_at) - +new Date(a.created_at);
                  })
                    .map((r) => {
                      const meta = columnMeta[r.prediction];
                      const badgeStyle: React.CSSProperties = meta ? { background: meta.gradFrom, color: '#fff' } : { background: '#334155', color: '#fff' };
                      const viewBg = meta ? meta.gradFrom : '#334155';
                      return (
                    <tr key={r.id} className="text-sm border-t border-border/40 hover:bg-surface-container transition-colors">
                      <td className="px-4 py-3.5 font-semibold">
                        <button
                          type="button"
                          onClick={() => setPatientModalId(r.patient_id)}
                          className="hover:text-primary-bright transition-colors text-left text-text-primary"
                        >
                          {r.patient_name || `Patient #${r.patient_id}`}
                        </button>
                        <div className="text-[11px] text-text-variant font-mono">#RET-{r.patient_id.toString().padStart(4,'0')}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                          style={badgeStyle}
                        >
                          {r.prediction}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold" style={{ color: 'var(--primary)' }}>
                        {(r.confidence * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3.5 text-right text-text-variant text-[11px] font-mono">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          className="px-3 py-1 rounded-lg text-white text-xs font-bold transition-all hover:brightness-110 active:scale-95"
                          style={{ background: `${viewBg}cc` }}
                          onClick={() => setPatientModalId(r.patient_id)}
                        >
                          View →
                        </button>
                      </td>
                    </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className={`grid grid-cols-1 md:grid-cols-2 ${adaptiveMode === 'standard' ? 'xl:grid-cols-2 max-w-4xl mx-auto' : 'xl:grid-cols-4'} gap-5 items-start`}>
          {triageColumns.map((col, idx) => {
            const meta = columnMeta[col.title]!;
            return (
              <FadeInReveal key={col.title} delay={idx * 0.1}>
                <div className="flex flex-col gap-3">
                  {/* Bold gradient column header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{
                      background: `linear-gradient(135deg, ${meta.gradFrom} 0%, ${meta.gradTo} 100%)`,
                      boxShadow: `0 3px 12px ${meta.gradFrom}55`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="material-symbols-outlined text-white text-[18px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        {col.icon}
                      </span>
                      <h2 className="font-mono font-bold text-sm uppercase tracking-widest text-white">{col.title}</h2>
                    </div>
                    <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                      {col.count}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-3">
                    {col.cards.length === 0 && (
                      <div className="text-center text-text-variant text-xs font-mono py-12 border border-dashed border-border rounded-xl opacity-30">
                        No patients in queue
                      </div>
                    )}
                    {col.cards.map((card) => (
                      <div
                        key={card.id}
                        className="relative overflow-hidden rounded-xl p-4 transition-all duration-200 group hover:-translate-y-0.5"
                        style={{
                          background: meta.cardBg,
                          borderLeft: `3px solid ${meta.cardBorder}`,
                          backgroundColor: `var(--surface)`,
                          backgroundImage: `linear-gradient(135deg, ${meta.cardBg} 0%, transparent 100%)`,
                          boxShadow: `0 2px 8px rgba(0,0,0,0.08), 2px 0 0 ${meta.cardBorder} inset`,
                        }}
                      >
                        {/* Label chip */}
                        <div className="mb-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-widest ${meta.labelChip}`}>
                            {col.label}
                          </span>
                        </div>

                        <h3 className="font-semibold text-text-primary text-base mb-0.5 group-hover:text-primary-bright transition-colors">
                          <button
                            type="button"
                            onClick={() => setPatientModalId(card.patientId)}
                            className="text-left"
                          >
                            {card.name}
                          </button>
                        </h3>
                        <p className="text-[11px] text-text-variant font-mono mb-3">{card.pid}</p>

                        <p className="text-xs text-text-secondary bg-surface/60 rounded-lg px-3 py-2 border border-border/40 mb-3">
                          {card.insight}
                        </p>

                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-text-variant font-mono">{card.timeAgo}</span>
                          <button
                            type="button"
                            onClick={() => setPatientModalId(card.patientId)}
                            className="text-[11px] font-bold px-3 py-1 rounded-lg text-white transition-all hover:brightness-110 active:scale-95"
                            style={{ background: `${meta.gradFrom}cc` }}
                          >
                            View →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </FadeInReveal>
            );
          })}
        </div>
      )}

      {/* Manual Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-surface/80 p-4 pt-20 pb-12 transition-opacity">
          <div className="bg-surface-container rounded-3xl w-full max-w-xl max-h-full flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-5 border-b border-outline/10">
              <h2 className="text-xl font-headline font-bold text-on-surface">Add Manual Triage Entry</h2>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container-highest transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSubmitManualEntry} className="overflow-y-auto p-5 flex flex-col gap-5">
              {errorMsg && (
                <div className="bg-error-container/20 text-error px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined">error</span>
                  {errorMsg}
                </div>
              )}

              {/* Patient Selection Segmented Buttons */}
              <div>
                <label className="block text-sm font-label font-bold text-on-surface-variant mb-2 uppercase tracking-wide">Patient Selection</label>
                <div className="flex bg-surface-container-highest p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setPatientMode("existing")}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${
                      patientMode === "existing"
                        ? "bg-primary text-on-primary shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    Existing Patient
                  </button>
                  <button
                    type="button"
                    onClick={() => setPatientMode("new")}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${
                      patientMode === "new"
                        ? "bg-primary text-on-primary shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    New Patient
                  </button>
                </div>
              </div>

              {/* Patient Fields */}
              {patientMode === "existing" ? (
                <div>
                  <label className="block text-sm font-label font-bold text-on-surface-variant mb-2">Select Account</label>
                  {patients.length === 0 ? (
                    <p className="text-sm text-on-surface-variant bg-surface-container-high p-4 rounded-xl">No existing patients found. Please add a new one.</p>
                  ) : (
                    <select
                      value={selectedPatientId || ""}
                      onChange={(e) => setSelectedPatientId(Number(e.target.value))}
                      className="w-full bg-surface border border-border text-text-primary px-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-primary/40 appearance-none transition-shadow"
                      required
                    >
                      <option value="" disabled>Select patient...</option>
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (ID: {p.id})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-4 bg-surface-container-high p-5 rounded-2xl border border-outline/5">
                  <input
                    placeholder="Full Name *"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="bg-surface border border-border text-text-primary px-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-primary/40 w-full"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="number"
                      min="0"
                      max="120"
                      placeholder="Age *"
                      required
                      value={newAge || ""}
                      onChange={(e) => setNewAge(Number(e.target.value))}
                      className="bg-surface border border-border text-text-primary px-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    <select
                      value={newGender}
                      onChange={(e) => setNewGender(e.target.value)}
                      className="bg-surface border border-border text-text-primary px-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-primary/40 appearance-none"
                    >
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <input
                    placeholder="Phone Number"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="bg-surface border border-border text-text-primary px-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <textarea
                    placeholder="Address"
                    rows={2}
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    className="bg-surface border border-border text-text-primary px-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-primary/40 resize-none"
                  />
                </div>
              )}

              {/* Triage Details */}
              <div className="flex flex-col gap-4 border-t border-outline/10 pt-6">
                <div>
                  <label className="block text-sm font-label font-bold text-on-surface-variant mb-2">Severity Level *</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    className="w-full bg-surface border border-border text-text-primary px-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-primary/40 appearance-none"
                    required
                  >
                    <option value="Critical">Critical (Severe/Proliferative)</option>
                    <option value="High Risk">High Risk (Moderate)</option>
                    <option value="Moderate">Moderate (Mild)</option>
                    <option value="Stable">Stable (No DR)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-label font-bold text-on-surface-variant mb-2">Description / Findings</label>
                  <textarea
                    placeholder="Provide diagnostic notes or reasons for manual triage..."
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-surface border border-border text-text-primary px-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-primary/40 resize-none"
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-outline/10">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2.5 rounded-xl font-bold text-on-surface hover:bg-surface-container-high transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || (patientMode === "existing" && !selectedPatientId)}
                  className="bg-primary text-on-primary px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {submitting ? (
                    <div className="w-5 h-5 rounded-full border-2 border-on-primary border-t-transparent animate-spin" />
                  ) : (
                    "Save Entry"
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      <PatientDetailsModal patientId={patientModalId} onClose={() => setPatientModalId(null)} />

    </main>
  );
}

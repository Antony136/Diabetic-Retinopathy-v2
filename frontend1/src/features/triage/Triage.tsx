import { useState, useEffect, type FormEvent } from "react";
import { getTriageCases } from "../../services/api";
import { listPatients, createPatient, type PatientResponse } from "../../services/patients";
import { createManualReport } from "../../services/reports";

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

function getCategory(prediction: string) {
  if (["Severe", "Proliferative DR"].includes(prediction)) return "Critical";
  if (["Moderate"].includes(prediction)) return "High Risk";
  if (["Mild"].includes(prediction)) return "Moderate";
  return "Stable";
}

export default function Triage() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);

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
      const data = await getTriageCases();
      setReports(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

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
    Critical: reports.filter(r => getCategory(r.prediction) === "Critical"),
    "High Risk": reports.filter(r => getCategory(r.prediction) === "High Risk"),
    Moderate: reports.filter(r => getCategory(r.prediction) === "Moderate"),
    Stable: reports.filter(r => getCategory(r.prediction) === "Stable"),
  };

  const triageColumns = [
    {
      title: "Critical",
      count: categorizedData.Critical.length.toString().padStart(2, '0'),
      barColor: "bg-error",
      badgeClass: "bg-error-container text-on-error-container",
      cards: categorizedData.Critical.map(r => ({
        id: r.id, // Using report ID as unique key
        label: "Imminent Threat",
        labelColor: "text-error",
        name: r.patient_name || 'Unknown',
        pid: `#RET-${r.patient_id.toString().padStart(4, '0')}`,
        insight: `AI detected ${r.prediction} with ${(r.confidence * 100).toFixed(1)}% confidence.`,
        timeAgo: timeAgo(r.created_at),
        footer: (
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>
              priority_high
            </span>
            <span className="text-xs font-bold text-error">Tier 1</span>
          </div>
        )
      }))
    },
    {
      title: "High Risk",
      count: categorizedData["High Risk"].length.toString().padStart(2, '0'),
      barColor: "bg-tertiary",
      badgeClass: "bg-tertiary-container text-on-tertiary-container",
      cards: categorizedData["High Risk"].map(r => ({
        id: r.id,
        label: "Monitoring Needed",
        labelColor: "text-tertiary",
        name: r.patient_name || 'Unknown',
        pid: `#RET-${r.patient_id.toString().padStart(4, '0')}`,
        insight: `AI detected ${r.prediction} with ${(r.confidence * 100).toFixed(1)}% confidence.`,
        timeAgo: timeAgo(r.created_at),
        footer: (
          <div className="bg-primary-container/10 px-3 py-1 rounded-full flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-bold text-primary">AI ANALYZED</span>
          </div>
        )
      }))
    },
    {
      title: "Moderate",
      count: categorizedData.Moderate.length.toString().padStart(2, '0'),
      barColor: "bg-primary",
      badgeClass: "bg-primary-container text-on-primary-container",
      cards: categorizedData.Moderate.map(r => ({
        id: r.id,
        label: "Follow-Up",
        labelColor: "text-primary",
        name: r.patient_name || 'Unknown',
        pid: `#RET-${r.patient_id.toString().padStart(4, '0')}`,
        insight: `AI detected ${r.prediction} with ${(r.confidence * 100).toFixed(1)}% confidence.`,
        timeAgo: timeAgo(r.created_at),
        footer: (
          <span className="text-xs text-on-surface-variant font-label flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">schedule</span>
             Review Suggested
          </span>
        )
      }))
    },
    {
      title: "Stable",
      count: categorizedData.Stable.length.toString().padStart(2, '0'),
      barColor: "bg-outline",
      badgeClass: "bg-surface-container-high text-on-surface-variant",
      cards: categorizedData.Stable.map(r => ({
        id: r.id,
        label: "Routine Clear",
        labelColor: "text-on-surface-variant",
        name: r.patient_name || 'Unknown',
        pid: `#RET-${r.patient_id.toString().padStart(4, '0')}`,
        insight: `No acute findings (${(r.confidence * 100).toFixed(1)}% conf).`,
        timeAgo: timeAgo(r.created_at),
        footer: (
          <div className="flex items-center gap-1 text-primary text-xs font-bold">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
            STABLE
          </div>
        )
      }))
    }
  ];
  return (
    <main className="pt-24 pb-32 px-6 md:px-12 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="font-headline text-4xl font-extrabold text-on-surface tracking-tight mb-2">
            Triage Queue
          </h1>
          <p className="text-on-surface-variant font-body">
            Real-time patient prioritization based on AI-detected retinal pathologies.
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowModal(true)}
            className="bg-gradient-to-r from-primary to-primary-container px-6 py-2.5 rounded-xl text-on-primary-container font-bold font-label flex items-center gap-2 shadow-lg shadow-primary/10 hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined text-xl">add</span>
            Manual Entry
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 font-body text-on-surface-variant">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mr-3" />
          Loading triage queue...
        </div>
      ) : (
        /* Kanban Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
        {triageColumns.map((col) => (
          <div key={col.title} className="flex flex-col gap-4">
            {/* Column header */}
            <div className="flex items-center justify-between px-2 mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-6 ${col.barColor} rounded-full`} />
                <h2 className="font-headline text-lg font-bold text-on-surface">{col.title}</h2>
              </div>
              <span className={`${col.badgeClass} px-2 py-0.5 rounded-md text-xs font-bold`}>
                {col.count}
              </span>
            </div>

            {/* Cards */}
            <div className={`space-y-4 ${col.title === "Stable" ? "opacity-70" : ""}`}>
              {col.cards.map((card) => (
                <div
                  key={card.id}
                  className="bg-surface-container-low p-5 rounded-xl hover:bg-surface-container-high transition-all duration-300 group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className={`text-xs font-label ${card.labelColor} uppercase tracking-widest font-bold`}>
                      {card.label}
                    </div>
                  </div>
                  <h3 className="font-headline text-xl font-semibold mb-1">{card.name}</h3>
                  <p className="text-xs text-on-surface-variant font-label mb-4">ID: {card.pid}</p>
                  <div className="bg-surface-container-lowest p-3 rounded-lg mb-4 outline outline-1 outline-outline/10">
                    {card.label !== "Routine Clear" && (
                      <p className="text-xs text-on-surface-variant mb-1">AI INSIGHT</p>
                    )}
                    <p className="text-sm font-body">{card.insight}</p>
                  </div>
                  <div className="flex items-center justify-between mt-6 pt-4">
                    {card.footer}
                    <span className="text-xs text-on-surface-variant font-label">{card.timeAgo}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Manual Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 pt-20 pb-12 transition-opacity">
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
                      className="w-full bg-surface-container-highest text-on-surface px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-primary appearance-none transition-shadow"
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
                    className="bg-surface-container-highest text-on-surface px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-primary w-full"
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
                      className="bg-surface-container-highest text-on-surface px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-primary"
                    />
                    <select
                      value={newGender}
                      onChange={(e) => setNewGender(e.target.value)}
                      className="bg-surface-container-highest text-on-surface px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-primary appearance-none"
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
                    className="bg-surface-container-highest text-on-surface px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-primary"
                  />
                  <textarea
                    placeholder="Address"
                    rows={2}
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    className="bg-surface-container-highest text-on-surface px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-primary resize-none"
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
                    className="w-full bg-surface-container-highest text-on-surface px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-primary appearance-none"
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
                    className="w-full bg-surface-container-highest text-on-surface px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-primary resize-none"
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

    </main>
  );
}

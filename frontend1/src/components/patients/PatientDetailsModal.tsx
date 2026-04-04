import { useEffect, useMemo, useState } from "react";
import Card from "../ui/Card";
import Button from "../ui/Button";
import { getPatient, type PatientResponse } from "../../services/patients";
import { generateImageExplanation, listPatientReports, type ReportResponse } from "../../services/reports";
import { resolveBackendImageUrl } from "../../services/apiBase";

function formatPercent(confidence: number) {
  return `${(confidence * 100).toFixed(1)}%`;
}

export default function PatientDetailsModal(props: {
  patientId: number | null;
  onClose: () => void;
}) {
  const { patientId, onClose } = props;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientResponse | null>(null);
  const [reports, setReports] = useState<ReportResponse[]>([]);
  const [reportModal, setReportModal] = useState<ReportResponse | null>(null);
  const [imageExplainLoading, setImageExplainLoading] = useState(false);
  const [imageExplainError, setImageExplainError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!patientId) return;
      setLoading(true);
      setError(null);
      try {
        const [p, r] = await Promise.all([getPatient(patientId), listPatientReports(patientId)]);
        if (!active) return;
        setPatient(p);
        setReports(r || []);
      } catch (e: any) {
        if (!active) return;
        setError(e?.response?.data?.detail || e?.message || "Failed to load patient details");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [patientId]);

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [reports]);

  if (!patientId) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-surface/80 p-4 pt-20 pb-12">
      <Card className="w-full max-w-4xl p-0 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline/10 bg-surface-container-low">
          <div>
            <div className="text-lg font-headline font-bold text-on-surface">
              {patient ? patient.name : "Patient details"}
            </div>
            <div className="text-xs text-on-surface-variant">
              {patient ? `ID #${patient.id}` : `ID #${patientId}`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-2 rounded-full hover:bg-surface-container-high transition-colors"
            aria-label="Close"
            title="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6">
          {loading && (
            <div className="flex items-center gap-3 text-on-surface-variant">
              <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              Loading patient details…
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
              {error}
            </div>
          )}

          {patient && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl border border-outline/10 bg-surface-container-lowest p-4">
                <div className="text-xs uppercase tracking-wider text-on-surface-variant font-bold mb-2">Demographics</div>
                <div className="text-sm text-on-surface-variant">Age: {patient.age ?? "—"}</div>
                <div className="text-sm text-on-surface-variant">Gender: {patient.gender ?? "—"}</div>
                <div className="text-sm text-on-surface-variant">Created: {new Date(patient.created_at).toLocaleString()}</div>
              </div>
              <div className="rounded-xl border border-outline/10 bg-surface-container-lowest p-4">
                <div className="text-xs uppercase tracking-wider text-on-surface-variant font-bold mb-2">Contact</div>
                <div className="text-sm text-on-surface-variant">Phone: {patient.phone || "—"}</div>
                <div className="text-sm text-on-surface-variant">Address: {patient.address || "—"}</div>
              </div>
              <div className="rounded-xl border border-outline/10 bg-surface-container-lowest p-4">
                <div className="text-xs uppercase tracking-wider text-on-surface-variant font-bold mb-2">Reports</div>
                <div className="text-sm text-on-surface-variant">Total: {sortedReports.length}</div>
                <div className="mt-3">
                  <Button
                    type="button"
                    disabled={!sortedReports[0]}
                    onClick={() => {
                      const r = sortedReports[0];
                      if (!r) return;
                      const url = resolveBackendImageUrl(r.image_url);
                      if (url) window.open(url, "_blank", "noreferrer");
                    }}
                  >
                    Open Latest Image
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-outline/10 overflow-hidden">
            <div className="px-5 py-3 bg-surface-container-lowest text-sm font-bold text-on-surface-variant">
              Report History
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-on-surface-variant bg-surface-container-low">
                    <th className="px-5 py-3">Report</th>
                    <th className="px-5 py-3">Prediction</th>
                    <th className="px-5 py-3 text-center">Confidence</th>
                    <th className="px-5 py-3 text-right">Time</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {!loading && sortedReports.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-on-surface-variant">
                        No reports found.
                      </td>
                    </tr>
                  )}
                  {sortedReports.slice(0, 50).map((r) => (
                    <tr key={r.id} className="text-sm hover:bg-surface-container-high transition-colors">
                      <td className="px-5 py-4 font-semibold">#{r.id}</td>
                      <td className="px-5 py-4 text-on-surface-variant">{r.prediction}</td>
                      <td className="px-5 py-4 text-center text-on-surface-variant">{formatPercent(r.confidence)}</td>
                      <td className="px-5 py-4 text-right text-on-surface-variant">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="px-3 py-1 rounded-lg bg-surface-container-high text-on-surface-variant text-xs font-bold hover:text-primary transition-colors"
                            onClick={() => setReportModal(r)}
                          >
                            View
                          </button>
                          <a
                            className="px-3 py-1 rounded-lg bg-surface-container-high text-on-surface-variant text-xs font-bold hover:text-primary transition-colors"
                            href={resolveBackendImageUrl(r.image_url)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Image
                          </a>
                          <a
                            className="px-3 py-1 rounded-lg bg-surface-container-high text-on-surface-variant text-xs font-bold hover:text-primary transition-colors"
                            href={resolveBackendImageUrl(r.heatmap_url)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Heatmap
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>

      {reportModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            onClick={() => setReportModal(null)}
            aria-label="Close dialog"
          />
          <div className="relative w-full max-w-4xl">
            <Card className="p-6 md:p-7 shadow-2xl shadow-black/40 border border-outline-variant/15">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="font-headline font-extrabold text-xl text-on-surface">Report #{reportModal.id}</div>
                  <div className="text-sm text-on-surface-variant mt-1">
                    {patient?.name ?? `Patient #${reportModal.patient_id}`} · {new Date(reportModal.created_at).toLocaleString()}
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
                  <img className="w-full aspect-square object-cover" src={resolveBackendImageUrl(reportModal.image_url)} alt="Input" />
                </div>
                <div className="rounded-xl overflow-hidden border border-outline/10 bg-surface-container-lowest">
                  <div className="px-4 py-3 text-xs uppercase tracking-widest text-on-surface-variant font-bold border-b border-outline/10">
                    Heatmap
                  </div>
                  <img className="w-full aspect-square object-cover" src={resolveBackendImageUrl(reportModal.heatmap_url)} alt="Heatmap" />
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-surface-container-lowest border border-outline/10 p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Prediction</div>
                    <div className="text-xl font-headline font-extrabold text-on-surface mt-1">{reportModal.prediction}</div>
                    <div className="text-sm text-on-surface-variant mt-1">Confidence: {formatPercent(reportModal.confidence)}</div>
                  </div>
                  <div className="flex gap-3">
                    <a
                      className="px-6 py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm active:scale-95 transition-transform bg-surface-container-highest text-on-surface font-bold hover:bg-surface-container transition-colors"
                      href={resolveBackendImageUrl(reportModal.image_url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                      Open image
                    </a>
                    <a
                      className="px-6 py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm active:scale-95 transition-transform bg-surface-container-highest text-on-surface font-bold hover:bg-surface-container transition-colors"
                      href={resolveBackendImageUrl(reportModal.heatmap_url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                      Open heatmap
                    </a>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-surface-container-lowest border border-outline/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">AI Image Explanation</div>
                  <button
                    type="button"
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors disabled:opacity-50"
                    disabled={imageExplainLoading}
                    onClick={async () => {
                      if (!reportModal) return;
                      setImageExplainError(null);
                      setImageExplainLoading(true);
                      try {
                        const data = await generateImageExplanation(reportModal.id, Boolean(reportModal.image_explanation));
                        setReportModal((prev) => (prev ? { ...prev, ...data } : prev));
                      } catch (e: any) {
                        setImageExplainError(e?.response?.data?.detail || e?.message || "Failed to generate image explanation");
                      } finally {
                        setImageExplainLoading(false);
                      }
                    }}
                  >
                    {imageExplainLoading ? "Generating..." : reportModal.image_explanation ? "Refresh" : "Generate"}
                  </button>
                </div>

                {imageExplainError && (
                  <div className="mt-3 rounded-xl bg-error-container/30 text-error px-4 py-3 text-sm">{imageExplainError}</div>
                )}

                {reportModal.image_explanation ? (
                  <div className="mt-3 text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">
                    {reportModal.image_explanation}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-on-surface-variant">
                    No image explanation yet.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

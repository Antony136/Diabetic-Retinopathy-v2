import Card from "../../components/ui/Card";
import { useEffect, useRef, useState } from "react";
import { getThemeMode, setThemeMode, type ThemeMode } from "../../services/theme";
import {
  getAppSettings,
  setAppSettings,
  type AppSettings,
} from "../../services/appSettings";
import { applyAnimationsEnabled } from "../../services/animations";
import { applyHighContrastEnabled } from "../../services/contrast";
import { listPatients } from "../../services/patients";
import { listReports } from "../../services/reports";
import { severityFromStage } from "../screening/mockAnalysis";
import { getPreferences, updatePreferences } from "../../services/preferences";

type ToggleProps = {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
};

function Toggle(props: ToggleProps) {
  const { value, onChange, label } = props;
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${
        value ? "bg-primary" : "bg-surface-container-highest"
      }`}
      aria-label={label}
      aria-pressed={value}
    >
      <div
        className={`absolute top-1 w-4 h-4 rounded-full shadow-sm transition-transform duration-300 ${
          value ? "bg-white translate-x-6" : "bg-outline translate-x-1"
        }`}
      />
    </button>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function svgBars(opts: {
  title: string;
  labels: string[];
  values: number[];
  xLabel: string;
  yLabel: string;
  yUnit?: string;
}) {
  const width = 900;
  const height = 320;
  const axisLeft = 64;
  const axisBottom = 64;
  const paddingRight = 20;
  const paddingTop = 48;
  const plotW = width - axisLeft - paddingRight;
  const plotH = height - paddingTop - axisBottom;
  const max = Math.max(1, ...opts.values);
  const barW = plotW / Math.max(1, opts.values.length);

  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const y = paddingTop + plotH * (1 - t);
    const v = Math.round(max * t);
    return `
      <g>
        <line x1="${axisLeft}" x2="${width - paddingRight}" y1="${y}" y2="${y}" stroke="currentColor" stroke-opacity="0.15" stroke-width="1" />
        <text x="${axisLeft - 12}" y="${y + 6}" text-anchor="end" font-size="16" fill="currentColor" fill-opacity="0.85">${v}</text>
      </g>
    `;
  });

  const bars = opts.values
    .map((v, i) => {
      const h = (plotH * v) / max;
      const x = axisLeft + i * barW + 10;
      const y = paddingTop + plotH - h;
      const w = Math.max(18, barW - 20);
      const label = escapeHtml(opts.labels[i] ?? "");
      return `
        <g>
          <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#94229c" fill-opacity="0.85" />
          <text x="${x + w / 2}" y="${y - 10}" text-anchor="middle" font-size="16" font-weight="700" fill="currentColor" fill-opacity="0.9">${v}</text>
          <text x="${x + w / 2}" y="${height - 18}" text-anchor="middle" font-size="16" fill="currentColor" fill-opacity="0.9">${label}</text>
        </g>
      `;
    })
    .join("");

  const yUnitText = opts.yUnit
    ? `<text x="${axisLeft}" y="24" text-anchor="start" font-size="16" fill="currentColor" fill-opacity="0.8">${escapeHtml(opts.yUnit)}</text>`
    : "";

  return `
    <div class="chart">
      <div class="chart-title">${escapeHtml(opts.title)}</div>
      <div class="chart-sub">X: ${escapeHtml(opts.xLabel)} · Y: ${escapeHtml(opts.yLabel)}</div>
      <svg viewBox="0 0 ${width} ${height}" class="svg">
        ${yUnitText}
        ${grid.join("")}
        <line x1="${axisLeft}" x2="${axisLeft}" y1="${paddingTop}" y2="${paddingTop + plotH}" stroke="currentColor" stroke-opacity="0.35" stroke-width="1" />
        <line x1="${axisLeft}" x2="${width - paddingRight}" y1="${paddingTop + plotH}" y2="${paddingTop + plotH}" stroke="currentColor" stroke-opacity="0.35" stroke-width="1" />
        ${bars}
      </svg>
    </div>
  `;
}

function localDayRange(offsetDaysFromToday: number) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() + offsetDaysFromToday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}

function buildYesterdaySummaryHtml(params: {
  title: string;
  generatedAt: string;
  dateLabel: string;
  paperSize: "a4" | "letter";
  stats: {
    newPatients: number;
    reports: number;
    highPriority: number;
    avgConfidencePct: number;
  };
  severityCounts: number[];
  confidenceLabels: string[];
  confidenceCounts: number[];
  hourlyCounts: number[];
  topRows: Array<{
    patientName: string;
    prediction: string;
    confidencePct: number;
    priority: number;
    at: string;
  }>;
}) {
  const { title, generatedAt, dateLabel } = params;
  const paperSizeCss = params.paperSize === "letter" ? "Letter" : "A4";
  const stat = (label: string, value: string) =>
    `<div class="stat"><div class="k">${escapeHtml(label)}</div><div class="v">${escapeHtml(value)}</div></div>`;

  const severityChart = svgBars({
    title: "Severity Distribution",
    labels: ["0", "1", "2", "3", "4"],
    values: params.severityCounts,
    xLabel: "DR stage (0–4)",
    yLabel: "Reports (count)",
    yUnit: "Reports",
  });

  const confChart = svgBars({
    title: "Confidence Histogram",
    labels: params.confidenceLabels,
    values: params.confidenceCounts,
    xLabel: "Confidence (%) bins",
    yLabel: "Reports (count)",
    yUnit: "Reports",
  });

  const hoursLabels = Array.from({ length: 24 }, (_, i) => String(i));
  const hourlyChart = svgBars({
    title: "Scans by Hour",
    labels: hoursLabels,
    values: params.hourlyCounts,
    xLabel: "Hour of day (0–23, local time)",
    yLabel: "Reports (count)",
    yUnit: "Reports",
  });

  const rowsHtml =
    params.topRows.length === 0
      ? `<tr><td colspan="5" class="muted" style="padding:14px; text-align:center;">No reports for this day.</td></tr>`
      : params.topRows
          .map((r) => {
            return `<tr>
              <td>${escapeHtml(r.patientName)}</td>
              <td>${escapeHtml(r.prediction)}</td>
              <td style="text-align:center;">${r.confidencePct.toFixed(1)}%</td>
              <td style="text-align:center; font-weight:700;">${r.priority}/5</td>
              <td style="text-align:right;">${escapeHtml(r.at)}</td>
            </tr>`;
          })
          .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { font-family: Inter, Arial, sans-serif; margin: 22px; color: #111827; background: #ffffff; }
      h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: -0.02em; }
      .muted { color: #6b7280; font-size: 12px; }
      .section { margin-top: 16px; }
      .stats { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
      .stat { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
      .k { font-size: 12px; color: #6b7280; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; }
      .v { margin-top: 6px; font-size: 22px; font-weight: 800; color: #111827; letter-spacing: -0.03em; }
      .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; }
      .card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px; overflow: hidden; }
      .chart { width: 100%; }
      .chart-title { font-size: 16px; font-weight: 800; margin-bottom: 4px; }
      .chart-sub { font-size: 12px; color: #6b7280; margin-bottom: 10px; }
      .svg { width: 100%; height: 320px; color: #111827; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      thead th { text-align: left; font-size: 12px; color:#6b7280; text-transform: uppercase; letter-spacing: 0.08em; padding: 10px 8px; border-bottom: 1px solid #e5e7eb; }
      tbody td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
      @page { size: ${paperSizeCss}; margin: 12mm; }
      @media print { body { margin: 0; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <div class="muted">${escapeHtml(dateLabel)} · Generated: ${escapeHtml(generatedAt)}</div>

    <div class="stats">
      ${stat("New patients", String(params.stats.newPatients))}
      ${stat("Reports (scans)", String(params.stats.reports))}
      ${stat("High priority (4–5)", String(params.stats.highPriority))}
      ${stat("Avg confidence", `${params.stats.avgConfidencePct.toFixed(1)}%`)}
    </div>

    <div class="section grid2">
      <div class="card">${severityChart}</div>
      <div class="card">${confChart}</div>
    </div>

    <div class="section">
      <div class="card">${hourlyChart}</div>
    </div>

    <div class="section">
      <div style="font-size:16px; font-weight:800;">Top Reports (Highest Priority)</div>
      <div class="muted" style="margin-top:4px;">Sorted by priority then confidence.</div>
      <table>
        <thead>
          <tr>
            <th>Patient</th>
            <th>Prediction</th>
            <th style="text-align:center;">Confidence</th>
            <th style="text-align:center;">Priority</th>
            <th style="text-align:right;">Time</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>

    <script>
      (function () {
        if (window.__retinaMaxPrinted) return;
        const waitImages = () => {
          const imgs = Array.from(document.images || []);
          return Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })));
        };
        window.__retinaMaxPrint = function () {
          if (window.__retinaMaxPrinted) return;
          window.__retinaMaxPrinted = true;
          waitImages().then(() => {
            window.focus();
            window.print();
          });
        };
        window.__retinaMaxPrint();
      })();
    </script>
  </body>
</html>`;
}

export default function Settings() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getThemeMode());
  const [settings, setSettingsState] = useState<AppSettings>(() => getAppSettings());
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  function persistSettings(next: AppSettings) {
    setSettingsState(next);
    setAppSettings(next);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const pref = await getPreferences();
        if (!active) return;
        const merged: AppSettings = {
          ...getAppSettings(),
          ...settings,
          notificationsHighRisk: pref.notifications_high_risk,
          notificationsDailySummary: pref.notifications_daily_summary,
          followUpDaysModerate: pref.follow_up_days_moderate,
          urgentReviewHours: pref.urgent_review_hours,
          confidenceThreshold: clamp(Math.round(pref.min_confidence_threshold * 100), 0, 100),
        };
        setSettingsState(merged);
        setAppSettings(merged);
      } catch {
        // ignore (offline / not logged in)
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onDownloadYesterdayDashboard() {
    const frame = printFrameRef.current;
    if (!frame) return;

    setSummaryError(null);
    setSummaryLoading(true);
    try {
      const [{ start, end }, patients, reports] = await Promise.all([
        Promise.resolve(localDayRange(-1)),
        listPatients(),
        listReports(),
      ]);

      const yPatients = patients.filter((p) => {
        const d = new Date(p.created_at);
        return d >= start && d < end;
      });

      const yReports = reports.filter((r) => {
        const d = new Date(r.created_at);
        return d >= start && d < end;
      });

      const byPatientId = new Map(patients.map((p) => [p.id, p.name]));

      const priority = (prediction: string) => severityFromStage(prediction);
      const highPriority = yReports.filter((r) => priority(r.prediction) >= 4).length;
      const avgConfidencePct =
        yReports.length === 0
          ? 0
          : (yReports.reduce((acc, r) => acc + r.confidence, 0) / yReports.length) * 100;

      const stages = ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"] as const;
      const severityCounts = stages.map((s) => yReports.filter((r) => r.prediction === s).length);

      const bins = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.01];
      const confidenceLabels = ["70", "75", "80", "85", "90", "95"];
      const confidenceCounts = new Array(confidenceLabels.length).fill(0) as number[];
      for (const r of yReports) {
        const c = r.confidence;
        let idx = confidenceLabels.length - 1;
        for (let i = 0; i < confidenceLabels.length; i++) {
          if (c >= bins[i]! && c < bins[i + 1]!) {
            idx = i;
            break;
          }
        }
        confidenceCounts[idx]! += 1;
      }

      const hourlyCounts = new Array(24).fill(0) as number[];
      for (const r of yReports) {
        const d = new Date(r.created_at);
        const h = clamp(d.getHours(), 0, 23);
        hourlyCounts[h]! += 1;
      }

      const topRows = [...yReports]
        .map((r) => ({
          patientName: byPatientId.get(r.patient_id) ?? `Patient #${r.patient_id}`,
          prediction: r.prediction,
          confidencePct: r.confidence * 100,
          priority: priority(r.prediction),
          at: new Date(r.created_at).toLocaleString(),
        }))
        .sort((a, b) => b.priority - a.priority || b.confidencePct - a.confidencePct)
        .slice(0, 20);

      const dateLabel = `${start.toLocaleDateString()} (yesterday)`;
      const html = buildYesterdaySummaryHtml({
        title: "Retina Max - Daily Summary",
        generatedAt: new Date().toLocaleString(),
        dateLabel,
        paperSize: settings.pdfPaperSize,
        stats: {
          newPatients: yPatients.length,
          reports: yReports.length,
          highPriority,
          avgConfidencePct,
        },
        severityCounts,
        confidenceLabels,
        confidenceCounts,
        hourlyCounts,
        topRows,
      });

      frame.onload = () => {
        const win = frame.contentWindow as (Window & { __retinaMaxPrint?: () => void }) | null;
        if (win?.__retinaMaxPrint) win.__retinaMaxPrint();
      };
      frame.srcdoc = html;
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to generate daily summary";
      setSummaryError(message);
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <main className="min-h-screen pt-24 pb-32 px-6 md:px-12 max-w-4xl mx-auto">
      <iframe
        ref={printFrameRef}
        title="print"
        className="absolute -left-[10000px] top-0 w-[1px] h-[1px] opacity-0 pointer-events-none"
      />
      <div className="mb-10">
        <h1 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">
          Settings
        </h1>
        <p className="text-on-surface-variant text-lg">
          Configure application preferences and AI diagnostics parameters.
        </p>
      </div>

      <div className="space-y-8">
        {/* B. System Preferences */}
        <Card className="p-8">
          <h3 className="text-xl font-headline font-bold mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">display_settings</span>
            System Preferences
          </h3>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-on-surface">Dark Mode</p>
                <p className="text-xs text-on-surface-variant">Switch between dark and light themes.</p>
              </div>
              <Toggle
                value={themeMode === "dark"}
                onChange={(next) => {
                  const mode: ThemeMode = next ? "dark" : "light";
                  setThemeMode(mode);
                  setThemeModeState(mode);
                }}
                label="Toggle dark mode"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-on-surface">Enable Animations</p>
                <p className="text-xs text-on-surface-variant">Smoother transitions and UI interactions.</p>
              </div>
              <Toggle
                value={settings.animationsEnabled}
                onChange={(next) => {
                  applyAnimationsEnabled(next);
                  persistSettings({ ...settings, animationsEnabled: next });
                }}
                label="Toggle animations"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-on-surface">High Contrast</p>
                <p className="text-xs text-on-surface-variant">Improves readability, especially in light mode.</p>
              </div>
              <Toggle
                value={settings.highContrastEnabled}
                onChange={(next) => {
                  applyHighContrastEnabled(next);
                  persistSettings({ ...settings, highContrastEnabled: next });
                }}
                label="Toggle high contrast"
              />
            </div>
          </div>
        </Card>

        {/* C. Notifications Settings */}
        <Card className="p-8">
          <h3 className="text-xl font-headline font-bold mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">notifications</span>
            Notification Preferences
          </h3>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-on-surface">High-risk alerts</p>
                <p className="text-xs text-on-surface-variant">Instant alerts when critical pathology is detected.</p>
              </div>
              <Toggle
                value={settings.notificationsHighRisk}
                onChange={(next) => {
                  persistSettings({ ...settings, notificationsHighRisk: next });
                  updatePreferences({ notifications_high_risk: next }).catch(() => undefined);
                }}
                label="Toggle high-risk alerts"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-on-surface">Daily summary</p>
                <p className="text-xs text-on-surface-variant">Get a digest of daily screening performance.</p>
              </div>
              <Toggle
                value={settings.notificationsDailySummary}
                onChange={(next) => {
                  persistSettings({ ...settings, notificationsDailySummary: next });
                  updatePreferences({ notifications_daily_summary: next }).catch(() => undefined);
                }}
                label="Toggle daily summary notifications"
              />
            </div>

            <div className="pt-2 border-t border-outline-variant/10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-on-surface">Daily summary download</p>
                  <p className="text-xs text-on-surface-variant">
                    Download yesterday&apos;s dashboard summary (reports, scans, and visualizations) as a PDF.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onDownloadYesterdayDashboard}
                  disabled={summaryLoading}
                  className="px-5 py-2.5 rounded-lg bg-primary text-on-primary font-bold hover:opacity-95 transition-opacity disabled:opacity-60 whitespace-nowrap"
                >
                  {summaryLoading ? "Preparing..." : "Download Yesterday PDF"}
                </button>
              </div>
              {summaryError && (
                <div className="mt-3 rounded-xl bg-error-container/30 text-error px-4 py-3 text-sm">
                  {summaryError}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* D. Report & Export */}
        <Card className="p-8">
          <h3 className="text-xl font-headline font-bold mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">print</span>
            Report &amp; Export
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">PDF Paper Size</label>
              <select
                value={settings.pdfPaperSize}
                onChange={(e) =>
                  persistSettings({
                    ...settings,
                    pdfPaperSize: (e.target.value === "letter" ? "letter" : "a4") as "a4" | "letter",
                  })
                }
                className="w-full bg-surface-container-lowest border border-outline/10 rounded-xl px-4 py-3 text-on-surface outline-none focus:ring-1 focus:ring-primary/40"
              >
                <option value="a4">A4</option>
                <option value="letter">Letter (US)</option>
              </select>
              <p className="text-[10px] text-on-surface-variant mt-1">Used for Screening and Daily Summary PDFs.</p>
            </div>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-on-surface">Include heatmap in PDF</p>
                  <p className="text-xs text-on-surface-variant">Adds the stored heatmap image to exports.</p>
                </div>
                <Toggle
                  value={settings.pdfIncludeHeatmap}
                  onChange={(next) => persistSettings({ ...settings, pdfIncludeHeatmap: next })}
                  label="Toggle include heatmap"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-on-surface">Include patient contact</p>
                  <p className="text-xs text-on-surface-variant">Shows phone and address in the PDF header.</p>
                </div>
                <Toggle
                  value={settings.pdfIncludePatientContact}
                  onChange={(next) => persistSettings({ ...settings, pdfIncludePatientContact: next })}
                  label="Toggle include patient contact"
                />
              </div>
            </div>
          </div>
        </Card>

      </div>
    </main>
  );
}

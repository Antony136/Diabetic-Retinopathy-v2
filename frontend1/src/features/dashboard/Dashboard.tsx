import { useCallback, useEffect, useMemo, useState } from "react";
import NexusEye from "../../components/eye/NexusEye";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { getMe, type UserResponse } from "../../services/auth";
import { listPatients, type PatientResponse } from "../../services/patients";
import { listReports, type ReportResponse } from "../../services/reports";
import { severityFromStage } from "../screening/mockAnalysis";

type ReportWithPriority = ReportResponse & { priority_score: 1 | 2 | 3 | 4 | 5 };

function formatPercent(confidence: number) {
  return `${(confidence * 100).toFixed(1)}%`;
}

function formatCompact(n: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(n);
}

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function SvgBars(props: { labels: string[]; values: number[]; yUnit?: string }) {
  const { labels, values, yUnit } = props;
  const width = 600;
  const height = 200;
  const axisLeft = 46;
  const axisBottom = 38;
  const paddingRight = 14;
  const paddingTop = 14;
  const plotW = width - axisLeft - paddingRight;
  const plotH = height - paddingTop - axisBottom;

  const max = Math.max(1, ...values);
  const barW = plotW / values.length;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-72 text-text-variant"
    >
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(200,124,255)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="rgb(46,24,61)" stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {/* grid + y ticks */}
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
              strokeOpacity="0.16"
              strokeWidth="1"
            />
            <text
              x={axisLeft - 10}
              y={y + 4}
              textAnchor="end"
              fontSize="16"
              fill="currentColor"
              fillOpacity="0.8"
            >
              {v}
            </text>
          </g>
        );
      })}

      {/* axes */}
      <line
        x1={axisLeft}
        x2={axisLeft}
        y1={paddingTop}
        y2={paddingTop + plotH}
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      <line
        x1={axisLeft}
        x2={width - paddingRight}
        y1={paddingTop + plotH}
        y2={paddingTop + plotH}
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
      />

      {values.map((v, i) => {
        const h = (plotH * v) / max;
        const x = axisLeft + i * barW + 10;
        const y = paddingTop + plotH - h;
        const w = Math.max(10, barW - 20);
        return (
          <g key={labels[i] ?? i}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx="10"
              fill="url(#barGrad)"
              opacity={0.9}
            />
            <text
              x={x + w / 2}
              y={y - 8}
              textAnchor="middle"
              fontSize="16"
              fontWeight="700"
              fill="currentColor"
              fillOpacity="0.9"
            >
              {v}
            </text>
            <text
              x={x + w / 2}
              y={height - 14}
              textAnchor="middle"
              fontSize="16"
              fill="currentColor"
              fillOpacity="0.85"
            >
              {labels[i]}
            </text>
          </g>
        );
      })}

      {yUnit && (
        <text
          x={axisLeft}
          y={12}
          textAnchor="start"
          fontSize="16"
          fill="currentColor"
          fillOpacity="0.75"
        >
          {yUnit}
        </text>
      )}
    </svg>
  );
}

function SvgLine(props: { values: number[]; yUnit?: string; xStartLabel?: string; xEndLabel?: string }) {
  const width = 620;
  const height = 200;
  const axisLeft = 46;
  const axisBottom = 38;
  const paddingRight = 14;
  const paddingTop = 14;
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
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-72 text-text-variant"
    >
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(46,24,61)" stopOpacity="0.55" />
          <stop offset="60%" stopColor="rgb(200,124,255)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="rgb(200,124,255)" stopOpacity="0.35" />
        </linearGradient>
      </defs>
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
              strokeOpacity="0.16"
              strokeWidth="1"
            />
            <text
              x={axisLeft - 10}
              y={y + 4}
              textAnchor="end"
              fontSize="16"
              fill="currentColor"
              fillOpacity="0.8"
            >
              {v}
            </text>
          </g>
        );
      })}
      <line
        x1={axisLeft}
        x2={axisLeft}
        y1={paddingTop}
        y2={paddingTop + plotH}
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      <line
        x1={axisLeft}
        x2={width - paddingRight}
        y1={paddingTop + plotH}
        y2={paddingTop + plotH}
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
      />

      <polyline
        points={points}
        fill="none"
        stroke="url(#lineGrad)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {props.values.map((v, i) => {
        const x = axisLeft + i * stepX;
        const y = paddingTop + (plotH * (max - v)) / span;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="4.5" fill="rgb(200,124,255)" opacity={0.9} />
          </g>
        );
      })}

      <text
        x={axisLeft}
        y={height - 12}
        textAnchor="start"
        fontSize="16"
        fill="currentColor"
        fillOpacity="0.8"
      >
        {props.xStartLabel ?? ""}
      </text>
      <text
        x={width - paddingRight}
        y={height - 12}
        textAnchor="end"
        fontSize="16"
        fill="currentColor"
        fillOpacity="0.8"
      >
        {props.xEndLabel ?? ""}
      </text>
      {props.yUnit && (
        <text
          x={axisLeft}
          y={12}
          textAnchor="start"
          fontSize="16"
          fill="currentColor"
          fillOpacity="0.75"
        >
          {props.yUnit}
        </text>
      )}
    </svg>
  );
}

import FadeInReveal from "../../components/ui/FadeInReveal";

function StatCard({ label, value, hint, icon, index = 0, colorClass = "text-primary-bright" }: { label: string; value: string; hint?: string; icon: string, index?: number, colorClass?: string }) {
  return (
    <FadeInReveal delay={index * 0.1}>
      <Card className="p-6 space-y-3 relative group">
        
        <div className="flex items-center justify-between relative z-10">
          <span className="text-text-variant font-mono text-xs uppercase tracking-widest">{label}</span>
          <span className={`material-symbols-outlined text-xl transition-all ${colorClass} opacity-70 group-hover:opacity-100 group-hover:drop-shadow-md`}>{icon}</span>
        </div>
        <div className="flex items-baseline gap-2 relative z-10">
          <span className="text-3xl font-mono font-bold text-text-primary group-hover:opacity-90 transition-all">{value}</span>
          {hint && <span className={`text-xs font-mono mb-1 ${colorClass} opacity-90`}>{hint}</span>}
        </div>
      </Card>
    </FadeInReveal>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [patients, setPatients] = useState<PatientResponse[]>([]);
  const [reports, setReports] = useState<ReportWithPriority[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    const [meRes, patientsRes, reportsRes] = await Promise.allSettled([
      getMe(),
      listPatients(),
      listReports(),
    ]);

    if (meRes.status === "fulfilled") setUser(meRes.value);
    if (patientsRes.status === "fulfilled") setPatients(patientsRes.value);
    if (reportsRes.status === "fulfilled") {
      const sorted = reportsRes.value
        .slice()
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
        .map((r) => ({ ...r, priority_score: severityFromStage(r.prediction) as 1 | 2 | 3 | 4 | 5 }));
      setReports(sorted);
    }

    if (
      patientsRes.status === "rejected" ||
      reportsRes.status === "rejected"
    ) {
      setError("Failed to load dashboard data.");
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const now = new Date();
    const todayReports = reports.filter((r) => sameLocalDay(new Date(r.created_at), now));
    const avgConfidence =
      reports.length === 0
        ? 0
        : reports.reduce((acc, r) => acc + r.confidence, 0) / reports.length;
    const highPriority = reports.filter((r) => r.priority_score >= 4).length;
    const lastReportAt = reports[0]?.created_at ? new Date(reports[0].created_at) : null;

    return {
      patientCount: patients.length,
      reportCount: reports.length,
      todayCount: todayReports.length,
      avgConfidence,
      highPriority,
      lastReportAt,
    };
  }, [patients.length, reports]);

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

  const recent = useMemo(() => reports.slice(0, 8), [reports]);
  const patientNameById = useMemo(() => new Map(patients.map((p) => [p.id, p.name])), [patients]);

  return (
    <main className="min-h-screen pt-24 pb-32 px-6 md:px-12 max-w-7xl mx-auto relative z-10">
      <FadeInReveal delay={0}>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
          <div>
            <h1 className="text-4xl font-mono font-extrabold text-text-primary tracking-[0.2em] uppercase glow-text-primary">
              {user ? `[USER_ID: ${user.name}]` : "DASHBOARD"}
            </h1>
            <div className="text-primary-bright/70 font-mono text-sm mt-2 uppercase tracking-widest">
              {'// System Status: NORMAL_OPERATION'}
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" icon="refresh" onClick={load} disabled={isLoading}>
              SYNC_DATA
            </Button>
          </div>
        </div>
      </FadeInReveal>

      {error && (
        <FadeInReveal delay={0.1}>
          <Card className="p-5 mb-8 border border-error/50 bg-error/10">
            <div className="text-error font-mono font-bold tracking-widest uppercase">[{error}]</div>
            <div className="text-text-variant text-sm mt-1 font-mono uppercase tracking-widest">
              Please verify backend connectivity and token status.
            </div>
          </Card>
        </FadeInReveal>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-6">
          <StatCard label="Patients" value={formatCompact(stats.patientCount)} icon="group" index={1} colorClass="text-records" />
          <StatCard label="Total Reports" value={formatCompact(stats.reportCount)} icon="summarize" index={2} />
          <StatCard label="Reports Today" value={formatCompact(stats.todayCount)} icon="today" index={3} />
          <StatCard label="High Priority" value={formatCompact(stats.highPriority)} hint="(LVL 4–5)" icon="priority_high" index={4} colorClass="text-high-risk" />
          <StatCard label="Avg Confidence" value={`${(stats.avgConfidence * 100).toFixed(1)}%`} icon="analytics" index={5} colorClass="text-low-risk" />
          <StatCard label="Last Analysis" value={stats.lastReportAt ? stats.lastReportAt.toLocaleTimeString() : "—"} hint={stats.lastReportAt ? stats.lastReportAt.toLocaleDateString() : undefined} icon="schedule" index={6} colorClass="text-text-variant" />
        </div>

        <FadeInReveal delay={0.5} className="lg:col-span-5 flex flex-col items-center justify-center">
          <div className="w-full flex items-center justify-center py-6">
            <NexusEye size={450} />
          </div>
          <Card className="w-full p-6 group">
            <div className="flex items-center justify-between mb-3 relative z-10">
              <div className="font-mono font-bold tracking-widest uppercase text-text-primary group-hover:glow-text-primary transition-all">REPORTS_TREND [14_DAYS]</div>
              <div className="text-xs text-text-variant font-mono tracking-widest">
                {isLoading ? "CALCULATING…" : `${reportsLast14Days.reduce((a, b) => a + b, 0)} TOTAL`}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-text-variant mb-3 font-mono tracking-widest relative z-10">
              <span>X: DAYS</span>
              <span>Y: COUNT</span>
            </div>
            <div className="relative z-10">
              <SvgLine
                values={reportsLast14Days}
                yUnit="COUNT"
                xStartLabel="-14D"
                xEndLabel="NOW"
              />
            </div>
          </Card>
        </FadeInReveal>
        <div className="lg:col-span-3 space-y-6">
          <FadeInReveal delay={0.6}>
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono font-bold tracking-widest uppercase text-text-primary">SEVERITY_DISTRIBUTION</div>
                <div className="text-xs text-text-variant font-mono tracking-widest">{reports.length} REPORTS</div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-text-variant mb-3 font-mono tracking-widest">
                <span>X: STAGE</span>
                <span>Y: COUNT</span>
              </div>
              <SvgBars labels={["0", "1", "2", "3", "4"]} values={severityDist.counts} yUnit="COUNT" />
              <div className="grid grid-cols-5 gap-2 mt-2 text-[10px] text-text-variant font-mono tracking-widest uppercase">
                {["No DR", "Mild", "Mod", "Sev", "Prolif"].map((t) => (
                  <div key={t} className="text-center">
                    {t}
                  </div>
                ))}
              </div>
            </Card>
          </FadeInReveal>

          <FadeInReveal delay={0.7}>
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono font-bold tracking-widest uppercase text-text-primary">CONFIDENCE_BINS</div>
                <div className="text-xs text-text-variant font-mono tracking-widest">(%)</div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-text-variant mb-3 font-mono tracking-widest">
                <span>X: PERCENT</span>
                <span>Y: COUNT</span>
              </div>
              <SvgBars labels={confidenceHistogram.labels} values={confidenceHistogram.counts} yUnit="COUNT" />
            </Card>
          </FadeInReveal>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        <FadeInReveal delay={0.8} className="lg:col-span-12">
          <Card className="p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-mono font-bold text-xl tracking-widest uppercase text-text-primary">SYSTEM_LOGS // RECENT_REPORTS</h2>
              <div className="text-xs text-text-variant font-mono tracking-widest">
                {isLoading ? "LOADING…" : "LATEST"}
              </div>
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-text-variant font-mono border-b border-border">
                    <th className="py-3 pr-4">SUBJECT_ID</th>
                    <th className="py-3 pr-4">PREDICTION_STATE</th>
                    <th className="py-3 pr-4 text-center">CONFIDENCE</th>
                    <th className="py-3 pr-4 text-center">PRIORITY</th>
                    <th className="py-3 text-right">TIMESTAMP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-sm">
                  {recent.map((r) => (
                    <tr key={r.id} className="hover:bg-white/5 transition-colors group cursor-pointer text-text-variant hover:text-text-primary">
                      <td className="py-4 pr-4 font-bold tracking-widest group-hover:glow-text-primary transition-all">
                        {patientNameById.get(r.patient_id) ?? `SUB_${r.patient_id}`}
                      </td>
                      <td className="py-4 pr-4">{r.prediction}</td>
                      <td className="py-4 pr-4 text-center text-primary-bright/80 font-bold">{formatPercent(r.confidence)}</td>
                      <td className={`py-4 pr-4 text-center font-bold text-[10px] tracking-widest`}>
                        <span className={`px-2 py-1 border rounded-md ${
                          r.priority_score >= 4 ? 'border-high-risk text-high-risk bg-high-risk/10' : 
                          r.priority_score === 3 ? 'border-medium-risk text-medium-risk bg-medium-risk/10' : 
                          'border-low-risk text-low-risk bg-low-risk/10'
                        }`}>LVL_{r.priority_score}</span>
                      </td>
                      <td className="py-4 text-right text-xs text-text-variant">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {!isLoading && recent.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-text-variant tracking-widest uppercase text-xs">
                        {">"} TERMINAL_EMPTY // NO_LOGS_FOUND 
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </FadeInReveal>
      </div>
    </main>
  );
}

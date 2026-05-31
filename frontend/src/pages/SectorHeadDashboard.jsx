import { createElement, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, CheckCircle2, Database, FileText, Layers3, ShieldCheck, Sparkles, Target, UploadCloud } from "lucide-react";
import { getRoleInsights } from "../services/api";
import RoleDashboardHero from "../components/RoleDashboardKit";

const qualityTrend = [
  { label: "Upload", score: 62 },
  { label: "Profile", score: 74 },
  { label: "Clean", score: 88 },
  { label: "Validate", score: 92 },
  { label: "Report", score: 95 },
];

const sectorPipeline = [
  { stage: "Uploaded", count: 12 },
  { stage: "Cleaned", count: 8 },
  { stage: "Visualized", count: 6 },
  { stage: "Reported", count: 4 },
];

function SectorMetric({ title, value, hint, icon: Icon }) {
  return (
    <div className="rounded-lg border border-theme-light bg-theme-card p-4 shadow-theme">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-theme-muted">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-theme-primary">{value}</p>
          <p className="mt-1 text-xs text-theme-muted">{hint}</p>
        </div>
        <div className="rounded-lg bg-teal-50 p-2 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200">
          {createElement(Icon, { className: "h-5 w-5" })}
        </div>
      </div>
    </div>
  );
}

function SectorPanel({ title, subtitle, icon: Icon, children }) {
  return (
    <section className="rounded-lg border border-theme-light bg-theme-card p-5 shadow-theme">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-teal-50 p-2 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200">
          {createElement(Icon, { className: "h-5 w-5" })}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-theme-primary">{title}</h3>
          <p className="mt-1 text-xs text-theme-muted">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function SectorHeadDashboard() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await getRoleInsights();
        if (alive) setInsights(response);
      } catch (err) {
        if (alive) setError(err?.message || "Failed to load sector dashboard.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  const kpis = Array.isArray(insights?.kpis) ? insights.kpis : [];
  const metricMap = useMemo(() => {
    const map = {};
    kpis.forEach((item) => {
      map[item.title] = item.unit ? `${item.value}${item.unit}` : item.value;
    });
    return map;
  }, [kpis]);

  const actions = Array.isArray(insights?.actions) && insights.actions.length
    ? insights.actions
    : ["Upload updated sector data", "Run full cleaning pipeline", "Review visual trends", "Generate sector report"];
  const recommendations = Array.isArray(insights?.recommendations) && insights.recommendations.length
    ? insights.recommendations.map((item) => item.text)
    : ["Keep sector datasets clean before reports", "Validate anomalies before sharing with CEO"];

  return (
    <div className="space-y-6">
      <RoleDashboardHero role="Sector Head" />

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}

      <section className="rounded-lg border border-theme-light bg-theme-card p-6 shadow-theme">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Sector Command Center
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-theme-primary">Sector data readiness and performance</h1>
            <p className="mt-2 max-w-3xl text-sm text-theme-muted">
              Track your sector uploads, cleaning coverage, quality, visual readiness, and reporting tasks.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[520px]">
            <SectorMetric title="Datasets" value={metricMap["Your Datasets"] ?? (loading ? "..." : 0)} hint="In your scope" icon={Database} />
            <SectorMetric title="Cleaned" value={metricMap.Cleaned ?? (loading ? "..." : 0)} hint="Ready outputs" icon={CheckCircle2} />
            <SectorMetric title="Quality" value={metricMap.Quality ?? (loading ? "..." : "0%")} hint="Sector trust score" icon={Target} />
            <SectorMetric title="Insights" value={metricMap["Insights Ready"] ?? 0} hint="Ready to share" icon={Sparkles} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <SectorPanel title="Sector Pipeline" subtitle="Progress from upload to report" icon={Layers3}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sectorPipeline}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.14)" vertical={false} />
              <XAxis dataKey="stage" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#14B8A6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectorPanel>

        <SectorPanel title="Sector Actions" subtitle="Recommended next steps" icon={UploadCloud}>
          <div className="space-y-3">
            {actions.slice(0, 5).map((action, index) => (
              <div key={`${action}-${index}`} className="rounded-lg border border-theme-light bg-theme-secondary p-3">
                <p className="text-sm font-semibold text-theme-primary">{action}</p>
              </div>
            ))}
          </div>
        </SectorPanel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectorPanel title="Quality Trend" subtitle="Expected improvement across sector workflow" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={qualityTrend}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.14)" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#14B8A6" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </SectorPanel>

        <SectorPanel title="Report Readiness" subtitle="Items to verify before sharing sector data" icon={FileText}>
          <div className="grid grid-cols-1 gap-3">
            {recommendations.slice(0, 5).map((item, index) => (
              <div key={`${item}-${index}`} className="flex items-start gap-3 rounded-lg bg-theme-secondary p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-teal-600" />
                <p className="text-sm text-theme-secondary">{item}</p>
              </div>
            ))}
          </div>
        </SectorPanel>
      </div>
    </div>
  );
}

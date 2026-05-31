import { createElement } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Database,
  FileText,
  Gauge,
  Layers3,
  Lightbulb,
  PieChart as PieChartIcon,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

const palette = ["#2563eb", "#22c55e", "#8b5cf6", "#f97316", "#06b6d4"];
const chartGrid = "rgba(148, 163, 184, 0.16)";
const chartText = "#94a3b8";

export const roleDashboardPresets = {
  CEO: {
    eyebrow: "Executive Command Center",
    title: "Welcome back, CEO",
    subtitle: "Company health, growth signals, governance, and data operations in one decision view.",
    cta: "New Analysis",
    metrics: [
      { title: "Datasets", value: "24", trend: "+12% this week", icon: Database, color: "#2563eb" },
      { title: "Quality Score", value: "96.4%", trend: "+8.7% improved", icon: ShieldCheck, color: "#22c55e" },
      { title: "AI Signals", value: "58", trend: "+18% generated", icon: BrainCircuit, color: "#8b5cf6" },
      { title: "Reports", value: "36", trend: "+10% completed", icon: FileText, color: "#06b6d4" },
    ],
    quality: [
      { name: "Completeness", value: 97 },
      { name: "Consistency", value: 95 },
      { name: "Accuracy", value: 96 },
      { name: "Timeliness", value: 94 },
      { name: "Validity", value: 99 },
    ],
    performance: [
      { label: "Mean", score: 72 },
      { label: "Median", score: 81 },
      { label: "KNN", score: 94 },
      { label: "Regression", score: 89 },
    ],
    distribution: [
      { name: "Invest", value: 44 },
      { name: "Watch", value: 33 },
      { name: "Avoid", value: 17 },
      { name: "No Signal", value: 6 },
    ],
    insights: [
      "Sales increased by 18.6% compared to last quarter.",
      "Customer satisfaction is strongest in the 25-35 age group.",
      "Missing values detected in 3 high-priority datasets.",
      "Cluster 2 shows high purchase probability.",
    ],
  },
  "Data Analyst": {
    eyebrow: "Analyst Quality Studio",
    title: "Data quality, profiling, and model readiness",
    subtitle: "Inspect dirty data, compare cleaning algorithms, and publish reliable datasets for analytics.",
    cta: "Profile Dataset",
    metrics: [
      { title: "Records", value: "1.2M", trend: "+15.2% processed", icon: Database, color: "#2563eb" },
      { title: "Quality Score", value: "92.4%", trend: "+2.1% improved", icon: ShieldCheck, color: "#22c55e" },
      { title: "Outliers", value: "1,892", trend: "needs review", icon: Gauge, color: "#f97316" },
      { title: "Correlations", value: "12", trend: "strong pairs", icon: BarChart3, color: "#8b5cf6" },
    ],
    quality: [
      { name: "Completeness", value: 94 },
      { name: "Accuracy", value: 88 },
      { name: "Consistency", value: 92 },
      { name: "Uniqueness", value: 96 },
      { name: "Validity", value: 90 },
    ],
    performance: [
      { label: "Mean", score: 76 },
      { label: "Median", score: 84 },
      { label: "KNN", score: 91 },
      { label: "Predictive", score: 88 },
    ],
    distribution: [
      { name: "Numeric", value: 44 },
      { name: "Categorical", value: 33 },
      { name: "Text", value: 17 },
      { name: "Date", value: 6 },
    ],
    insights: [
      "Run full pipeline on uploads with shifted columns.",
      "Validate numeric extremes before model training.",
      "Publish clean outputs above 90% quality.",
      "Review missing-value columns before predictive fill.",
    ],
  },
  "Sales Manager": {
    eyebrow: "Sales Intelligence Center",
    title: "Revenue, pipeline, and customer signals",
    subtitle: "Track demand trends, customer mix, regional performance, and recommended sales actions.",
    cta: "Open Forecast",
    metrics: [
      { title: "Daily Sales", value: "$16.8k", trend: "+12.5% today", icon: TrendingUp, color: "#2563eb" },
      { title: "Target", value: "78%", trend: "monthly progress", icon: Gauge, color: "#22c55e" },
      { title: "Segments", value: "4", trend: "active groups", icon: Layers3, color: "#8b5cf6" },
      { title: "Forecast", value: "$205k", trend: "next high point", icon: BrainCircuit, color: "#f97316" },
    ],
    quality: [
      { name: "Lead Quality", value: 91 },
      { name: "Conversion", value: 78 },
      { name: "Retention", value: 87 },
      { name: "Forecast Fit", value: 89 },
      { name: "Coverage", value: 94 },
    ],
    performance: [
      { label: "Mon", score: 73 },
      { label: "Tue", score: 88 },
      { label: "Wed", score: 69 },
      { label: "Thu", score: 96 },
      { label: "Fri", score: 82 },
    ],
    distribution: [
      { name: "Enterprise", value: 45 },
      { name: "SMB", value: 30 },
      { name: "Startup", value: 15 },
      { name: "Individual", value: 10 },
    ],
    insights: [
      "Protect the target gap with high-value follow-ups.",
      "North America enterprise segment is the strongest opportunity.",
      "Review forecast risk every week before campaign changes.",
      "Prioritize leads with repeat purchase patterns.",
    ],
  },
  "Sector Head": {
    eyebrow: "Sector Performance Hub",
    title: "Sector readiness, quality, and reporting",
    subtitle: "Monitor your sector uploads, cleaning status, visual readiness, and report actions.",
    cta: "Review Sector",
    metrics: [
      { title: "Datasets", value: "12", trend: "in your scope", icon: Database, color: "#2563eb" },
      { title: "Cleaned", value: "8", trend: "ready outputs", icon: CheckCircle2, color: "#22c55e" },
      { title: "Quality", value: "95%", trend: "sector trust", icon: ShieldCheck, color: "#8b5cf6" },
      { title: "Reports", value: "4", trend: "shared with CEO", icon: FileText, color: "#06b6d4" },
    ],
    quality: [
      { name: "Upload", value: 62 },
      { name: "Profile", value: 74 },
      { name: "Clean", value: 88 },
      { name: "Validate", value: 92 },
      { name: "Report", value: 95 },
    ],
    performance: [
      { label: "Uploaded", score: 12 },
      { label: "Cleaned", score: 8 },
      { label: "Visualized", score: 6 },
      { label: "Reported", score: 4 },
    ],
    distribution: [
      { name: "Ready", value: 50 },
      { name: "Cleaning", value: 25 },
      { name: "Review", value: 15 },
      { name: "Blocked", value: 10 },
    ],
    insights: [
      "Upload updated sector data before monthly review.",
      "Run full cleaning pipeline for pending sector files.",
      "Validate anomalies before sharing with CEO.",
      "Generate reports only from saved cleaned datasets.",
    ],
  },
};

function MetricCard({ item }) {
  const Icon = item.icon;
  return (
    <div className="rounded-lg border border-theme-light bg-theme-card p-4 shadow-theme">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${item.color}22`, color: item.color }}>
          {createElement(Icon, { className: "h-7 w-7" })}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-theme-muted">{item.title}</p>
          <p className="mt-1 text-2xl font-semibold text-theme-primary">{item.value}</p>
          <p className="mt-1 text-xs font-semibold text-emerald-600">{item.trend}</p>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, children }) {
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

function QualityOverview({ data }) {
  const average = Math.round(data.reduce((sum, item) => sum + item.value, 0) / Math.max(data.length, 1));
  const pieData = data.map((item, index) => ({ ...item, color: palette[index % palette.length] }));
  return (
    <Panel title="Data Quality Overview" subtitle="Completeness, accuracy, and readiness signals" icon={ShieldCheck}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[210px_1fr]">
        <div className="relative h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} innerRadius={58} outerRadius={88} paddingAngle={2} dataKey="value">
                {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-3xl font-semibold text-theme-primary">{average}%</p>
            <p className="text-xs text-theme-muted">Overall</p>
          </div>
        </div>
        <div className="space-y-3 self-center">
          {pieData.map((item) => (
            <div key={item.name}>
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-theme-secondary">{item.name}</span>
                <span className="text-theme-primary">{item.value}%</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-theme-secondary">
                <div className="h-2 rounded-full" style={{ width: `${item.value}%`, backgroundColor: item.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function Heatmap() {
  const rows = ["Age", "Gender", "Income", "Education", "Region", "Purchase"];
  const cells = Array.from({ length: 66 }, (_, index) => ((index * 17 + 23) % 100));
  return (
    <Panel title="Missing Values Heatmap" subtitle="Column-level gap pattern for selected datasets" icon={Activity}>
      <div className="grid grid-cols-[76px_1fr] gap-2">
        <div className="space-y-1 pt-5">
          {rows.map((row) => <p key={row} className="h-5 text-right text-xs text-theme-muted">{row}</p>)}
        </div>
        <div>
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, index) => <p key={index} className="text-center text-[10px] text-theme-muted">{index + 1}</p>)}
            {cells.map((value, index) => (
              <div
                key={index}
                className="h-5 rounded-sm"
                style={{ backgroundColor: value > 82 ? "#f97316" : value > 62 ? "#ec4899" : value > 35 ? "#7c3aed" : "#312e81" }}
                title={`${value}% missing intensity`}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-theme-muted">
            <span>Low Missing</span>
            <div className="h-2 w-32 rounded-full bg-gradient-to-r from-indigo-900 via-purple-600 to-orange-400" />
            <span>High Missing</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function SystemPipeline() {
  const steps = [
    ["Ingestion", Database],
    ["Profiling", Gauge],
    ["Cleaning", Sparkles],
    ["AI Selection", BrainCircuit],
    ["Analysis", BarChart3],
    ["Visualization", TrendingUp],
    ["Report", FileText],
  ];
  return (
    <section className="rounded-lg border border-theme-light bg-theme-card p-5 shadow-theme">
      <h3 className="text-lg font-semibold text-theme-primary">System Pipeline</h3>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {steps.map(([label, Icon], index) => (
          <div key={label} className="relative rounded-lg bg-theme-secondary p-3 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ backgroundColor: palette[index % palette.length] }}>
              {createElement(Icon, { className: "h-5 w-5" })}
            </div>
            <p className="mt-2 text-xs font-semibold text-theme-primary">{index + 1}. {label}</p>
            <p className="mt-1 text-[11px] text-theme-muted">{index < 2 ? "Active" : "Ready"}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function RoleDashboardHero({ role, children }) {
  const preset = roleDashboardPresets[role] || roleDashboardPresets.CEO;
  const barData = preset.performance.map((item, index) => ({ ...item, fill: palette[index % palette.length] }));
  const distribution = preset.distribution.map((item, index) => ({ ...item, color: palette[index % palette.length] }));

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-theme-light bg-theme-card shadow-theme">
        <div className="grid grid-cols-1 gap-0 xl:grid-cols-[1fr_360px]">
          <div className="p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
              <Layers3 className="h-3.5 w-3.5" />
              {preset.eyebrow}
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-theme-primary">{preset.title}</h1>
            <p className="mt-2 max-w-3xl text-sm text-theme-muted">{preset.subtitle}</p>
          </div>
          <div className="border-t border-theme-light bg-theme-secondary p-5 xl:border-l xl:border-t-0">
            <button type="button" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700">
              <Sparkles className="h-4 w-4" />
              {preset.cta}
            </button>
            <div className="mt-4 rounded-lg border border-theme-light bg-theme-card p-4">
              <p className="text-xs font-semibold uppercase text-theme-muted">Operational Status</p>
              <p className="mt-2 text-2xl font-semibold text-theme-primary">Live</p>
              <p className="mt-1 text-xs text-theme-muted">Role-specific dashboard is reading the latest available system signals.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {preset.metrics.map((item) => <MetricCard key={item.title} item={item} />)}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr_360px]">
        <QualityOverview data={preset.quality} />
        <Panel title="Confidence Score" subtitle="Algorithm or operational performance by role" icon={BrainCircuit}>
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={barData}>
              <CartesianGrid stroke={chartGrid} vertical={false} />
              <XAxis dataKey="label" stroke={chartText} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <YAxis stroke={chartText} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                {barData.map((entry) => <Cell key={entry.label} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Insights Summary" subtitle="Highest-priority role recommendations" icon={Lightbulb}>
          <div className="space-y-3">
            {preset.insights.map((insight, index) => (
              <div key={insight} className="flex gap-3 rounded-lg bg-theme-secondary p-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${palette[index % palette.length]}22`, color: palette[index % palette.length] }}>
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm text-theme-secondary">{insight}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr_360px]">
        <Heatmap />
        <Panel title="Data Distribution" subtitle="Dataset shape available to this role" icon={PieChartIcon}>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={distribution} innerRadius={62} outerRadius={92} paddingAngle={3} dataKey="value">
                {distribution.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2">
            {distribution.map((entry) => (
              <span key={entry.name} className="inline-flex items-center gap-2 text-xs font-semibold text-theme-muted">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.name} {entry.value}%
              </span>
            ))}
          </div>
        </Panel>
        <Panel title="Recent Datasets" subtitle="Latest files available for this role" icon={Database}>
          <div className="space-y-3">
            {["Sales_Data_2024.csv", "Customer_Reviews.pdf", "Financial_Report.xlsx", "Survey_Responses.csv"].map((name, index) => (
              <div key={name} className="flex items-center justify-between gap-3 rounded-lg bg-theme-secondary p-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-teal-600" />
                  <div>
                    <p className="text-sm font-semibold text-theme-primary">{name}</p>
                    <p className="text-xs text-theme-muted">{index + 2},{index}50 rows</p>
                  </div>
                </div>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <SystemPipeline />
      {children}
    </div>
  );
}

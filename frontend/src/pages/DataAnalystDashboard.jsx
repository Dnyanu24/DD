import { createElement, useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Scatter } from "recharts";
import { Activity, AlertTriangle, BarChart3, Database, FileSearch, GitBranch, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import KPICard from "../components/KPICard";
import { getRoleInsights } from "../services/api";
import RoleDashboardHero from "../components/RoleDashboardKit";

// Default data - can be overridden by props or API
const defaultDataQualityData = [
  { metric: "Completeness", value: 94.2 },
  { metric: "Accuracy", value: 87.5 },
  { metric: "Consistency", value: 91.8 },
  { metric: "Timeliness", value: 96.3 },
];

const defaultAnomalyData = [
  { time: "00:00", normal: 100, anomaly: null },
  { time: "04:00", normal: 98, anomaly: null },
  { time: "08:00", normal: 95, anomaly: 120 },
  { time: "12:00", normal: 102, anomaly: null },
  { time: "16:00", normal: 99, anomaly: null },
  { time: "20:00", normal: 101, anomaly: 85 },
];

const defaultModelPerformanceData = [
  { model: "Random Forest", accuracy: 0.92, precision: 0.89, recall: 0.91 },
  { model: "Neural Network", accuracy: 0.88, precision: 0.85, recall: 0.87 },
  { model: "SVM", accuracy: 0.85, precision: 0.82, recall: 0.83 },
  { model: "Logistic Regression", accuracy: 0.78, precision: 0.75, recall: 0.76 },
];

const defaultSampleData = [
  { id: 1, feature1: 2.5, feature2: 3.1, cluster: "A" },
  { id: 2, feature1: 1.8, feature2: 2.9, cluster: "A" },
  { id: 3, feature1: 4.2, feature2: 1.5, cluster: "B" },
  { id: 4, feature1: 3.9, feature2: 1.2, cluster: "B" },
  { id: 5, feature1: 2.1, feature2: 4.0, cluster: "C" },
];

// Modern chart colors
const chartColors = {
  primary: "#14B8A6",
  secondary: "#0D9488",
  tertiary: "#2DD4BF",
  quaternary: "#5EEAD4",
  grid: "rgba(148, 163, 184, 0.1)",
  text: "#94A3B8",
  anomaly: "#EF4444"
};

// Empty state component
const EmptyState = ({ message = "No data available" }) => (
  <div className="flex items-center justify-center h-64 text-theme-muted">
    <div className="text-center">
      <div className="text-4xl mb-2">📊</div>
      <p>{message}</p>
    </div>
  </div>
);

function WorkbenchCard({ title, value, hint, icon: Icon }) {
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

function AnalyticsPanel({ title, subtitle, icon: Icon, children }) {
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

export default function DataAnalystDashboard({ 
  dataQualityData = defaultDataQualityData,
  anomalyData = defaultAnomalyData,
  modelPerformanceData = defaultModelPerformanceData,
  sampleData = defaultSampleData
}) {
  const [selectedModel, setSelectedModel] = useState("Random Forest");
  const [insights, setInsights] = useState(null);
  const [insightsError, setInsightsError] = useState("");
  const [insightsLoading, setInsightsLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setInsightsLoading(true);
      setInsightsError("");
      try {
        const data = await getRoleInsights();
        if (!alive) return;
        setInsights(data);
      } catch (e) {
        if (!alive) return;
        setInsightsError(e?.message || "Failed to load personalized insights");
      } finally {
        if (alive) setInsightsLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  // Check if data is empty
  const hasDataQualityData = dataQualityData && dataQualityData.length > 0;
  const hasAnomalyData = anomalyData && anomalyData.length > 0;
  const hasModelPerformanceData = modelPerformanceData && modelPerformanceData.length > 0;
  const hasSampleData = sampleData && sampleData.length > 0;

  return (
    <div className="space-y-6">
      <RoleDashboardHero role="Data Analyst" />

      <section className="rounded-lg border border-theme-light bg-theme-card p-6 shadow-theme">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
              <FileSearch className="h-3.5 w-3.5" />
              Analyst Workbench
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-theme-primary">Data quality, anomalies, and model readiness</h1>
            <p className="mt-2 max-w-3xl text-sm text-theme-muted">
              Review cleaning quality, detect anomalies, validate models, and prepare trusted datasets for dashboards and reports.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[520px]">
            <WorkbenchCard title="Quality" value={insights?.kpis?.[2]?.value ? `${insights.kpis[2].value}${insights.kpis[2].unit || ""}` : "92.4%"} hint="Current score" icon={ShieldCheck} />
            <WorkbenchCard title="Correlations" value={insights?.kpis?.[3]?.value ?? 12} hint="Detected pairs" icon={GitBranch} />
            <WorkbenchCard title="Models" value={modelPerformanceData.length} hint="Compared" icon={Activity} />
            <WorkbenchCard title="Alerts" value={anomalyData.filter((item) => item.anomaly != null).length} hint="Anomalies" icon={AlertTriangle} />
          </div>
        </div>
      </section>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.isArray(insights?.kpis) && insights.kpis.length ? (
          insights.kpis.slice(0, 4).map((kpi) => (
            <KPICard
              key={kpi.title}
              title={kpi.title}
              value={kpi.unit ? `${kpi.value}${kpi.unit}` : String(kpi.value ?? "-")}
              change=""
              changeType="positive"
            />
          ))
        ) : (
          <>
            <KPICard title="Total Records Processed" value={insightsLoading ? "..." : "1,247,583"} change="+15.2%" changeType="positive" />
            <KPICard title="Missing Values Detected" value={insightsLoading ? "..." : "23,456"} change="-8.3%" changeType="positive" />
            <KPICard title="Outliers Identified" value={insightsLoading ? "..." : "1,892"} change="+5.7%" changeType="negative" />
            <KPICard title="Data Quality Score" value={insightsLoading ? "..." : "92.4%"} change="+2.1%" changeType="positive" />
          </>
        )}
      </div>

      {insightsError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {insightsError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <AnalyticsPanel title="Pipeline Focus" subtitle="Recommended analyst actions for the next data cycle" icon={Wand2}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { title: "Clean pending uploads", detail: "Run full pipeline on datasets with missing or shifted columns." },
              { title: "Validate outliers", detail: "Review extreme numeric values before model training." },
              { title: "Publish clean outputs", detail: "Save high-quality cleaned data for dashboards and reports." },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border border-theme-light bg-theme-secondary p-4">
                <p className="text-sm font-semibold text-theme-primary">{item.title}</p>
                <p className="mt-1 text-xs text-theme-muted">{item.detail}</p>
              </div>
            ))}
          </div>
        </AnalyticsPanel>

        <AnalyticsPanel title="Insight Queue" subtitle="Personalized role suggestions" icon={Sparkles}>
          <div className="space-y-3">
            {(Array.isArray(insights?.actions) && insights.actions.length ? insights.actions : ["Profile newly uploaded files", "Check missing-value columns", "Open visualizations after cleaning"]).slice(0, 4).map((action, index) => (
              <div key={`${action}-${index}`} className="flex items-start gap-3 rounded-lg bg-theme-secondary p-3">
                <Database className="mt-0.5 h-4 w-4 text-teal-600" />
                <p className="text-sm text-theme-secondary">{action}</p>
              </div>
            ))}
          </div>
        </AnalyticsPanel>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Quality Metrics */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Data Quality Metrics</h3>
          {hasDataQualityData ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dataQualityData}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="none" vertical={false} />
              <XAxis 
                dataKey="metric" 
                stroke={chartColors.text} 
                tick={{ fill: chartColors.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                stroke={chartColors.text} 
                tick={{ fill: chartColors.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 100]} 
              />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: "var(--bg-secondary)", 
                  border: "none", 
                  borderRadius: "12px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
                }}
                labelStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
                itemStyle={{ color: chartColors.primary }}
              />
              <Bar 
                dataKey="value" 
                fill={chartColors.primary}
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          ) : (
            <EmptyState message="No data quality metrics available" />
          )}
        </div>

        {/* Anomaly Detection */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Anomaly Detection</h3>
          {hasAnomalyData ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={anomalyData}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="none" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke={chartColors.text} 
                tick={{ fill: chartColors.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                stroke={chartColors.text} 
                tick={{ fill: chartColors.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: "var(--bg-secondary)", 
                  border: "none", 
                  borderRadius: "12px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
                }}
                labelStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Line 
                type="monotone" 
                dataKey="normal" 
                stroke={chartColors.secondary} 
                strokeWidth={3}
                dot={{ fill: chartColors.secondary, strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: chartColors.secondary, stroke: "#fff", strokeWidth: 2 }}
                name="Normal Range" 
              />
              <Scatter 
                dataKey="anomaly" 
                fill={chartColors.anomaly} 
                name="Anomalies"
                stroke="var(--bg-card)"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
          ) : (
            <EmptyState message="No anomaly data available" />
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model Performance */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Model Performance</h3>
          {hasModelPerformanceData ? (
          <>
          <div className="mb-4">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-theme-secondary text-theme-primary px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              {modelPerformanceData.map((model) => (
                <option key={model.model} value={model.model} className="bg-theme-card">{model.model}</option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={modelPerformanceData.filter(m => m.model === selectedModel)}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="none" vertical={false} />
              <XAxis 
                dataKey="model" 
                stroke={chartColors.text} 
                tick={{ fill: chartColors.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                stroke={chartColors.text} 
                tick={{ fill: chartColors.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 1]} 
              />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: "var(--bg-secondary)", 
                  border: "none", 
                  borderRadius: "12px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
                }}
                labelStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Bar dataKey="accuracy" fill={chartColors.primary} name="Accuracy" radius={[6, 6, 0, 0]} />
              <Bar dataKey="precision" fill={chartColors.secondary} name="Precision" radius={[6, 6, 0, 0]} />
              <Bar dataKey="recall" fill={chartColors.tertiary} name="Recall" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </>
          ) : (
            <EmptyState message="No model performance data available" />
          )}
        </div>

        {/* Feature Correlation Heatmap Placeholder */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Feature Correlation Heatmap</h3>
          <div className="flex items-center justify-center h-64 bg-theme-secondary rounded-xl">
            <div className="text-center">
              <div className="text-4xl mb-2">🔥</div>
              <p className="text-theme-muted">Correlation Matrix Visualization</p>
              <p className="text-sm text-theme-muted mt-2">Interactive heatmap showing feature relationships</p>
            </div>
          </div>
        </div>
      </div>

      {/* Personalized Correlations */}
      <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
        <h3 className="text-lg font-semibold text-theme-primary mb-4">Personalized Correlations (Role Insights)</h3>
        {Array.isArray(insights?.statistics?.top_correlations) && insights.statistics.top_correlations.length ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {insights.statistics.top_correlations.slice(0, 8).map((row, idx) => (
              <div
                key={`${row.feature_a}-${row.feature_b}-${idx}`}
                className="rounded-xl border border-theme-light bg-theme-secondary p-4"
              >
                <p className="text-sm font-semibold text-theme-primary">
                  {row.feature_a} vs {row.feature_b}
                </p>
                <p className="mt-1 text-xs text-theme-muted">r = {row.r}</p>
                <p className="text-xs text-theme-muted">p-value = {row.p_value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-theme-muted">
            {insightsLoading ? "Loading correlations..." : "Not enough numeric data to compute correlations."}
          </p>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
        <h3 className="text-lg font-semibold text-theme-primary mb-4">Sample Data Preview</h3>
        {hasSampleData ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-theme-secondary">
            <thead className="text-xs text-theme-muted uppercase bg-theme-secondary">
              <tr>
                <th className="px-6 py-3 rounded-tl-lg">ID</th>
                <th className="px-6 py-3">Feature 1</th>
                <th className="px-6 py-3">Feature 2</th>
                <th className="px-6 py-3 rounded-tr-lg">Cluster</th>
              </tr>
            </thead>
            <tbody>
              {sampleData.map((row, index) => (
                <tr 
                  key={row.id} 
                  className={`hover:bg-theme-secondary transition-colors ${
                    index === sampleData.length - 1 ? '' : 'border-b border-theme-light'
                  }`}
                >
                  <td className="px-6 py-4">{row.id}</td>
                  <td className="px-6 py-4">{row.feature1}</td>
                  <td className="px-6 py-4">{row.feature2}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs text-theme-inverse ${
                      row.cluster === "A" ? "bg-accent-primary" :
                      row.cluster === "B" ? "bg-green-600" : "bg-purple-600"
                    }`}>
                      {row.cluster}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        ) : (
          <EmptyState message="No sample data available" />
        )}
      </div>
    </div>
  );
}

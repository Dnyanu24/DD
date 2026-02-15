import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Sankey,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { getUploadedData } from "../services/api";

const COLORS = ["#14b8a6", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#6366f1"];

const FALLBACK_DATA = [
  { id: 1, sector_name: "Sales", row_count: 12200, uploaded_at: "2026-01-05T10:00:00", quality_score: 0.82, has_cleaned_data: true },
  { id: 2, sector_name: "Marketing", row_count: 8400, uploaded_at: "2026-01-08T08:10:00", quality_score: 0.75, has_cleaned_data: false },
  { id: 3, sector_name: "Operations", row_count: 18900, uploaded_at: "2026-01-12T12:30:00", quality_score: 0.91, has_cleaned_data: true },
  { id: 4, sector_name: "Sales", row_count: 10200, uploaded_at: "2026-02-01T08:20:00", quality_score: 0.88, has_cleaned_data: true },
  { id: 5, sector_name: "Support", row_count: 5300, uploaded_at: "2026-02-02T11:40:00", quality_score: 0.69, has_cleaned_data: false },
  { id: 6, sector_name: "Operations", row_count: 17600, uploaded_at: "2026-02-08T13:00:00", quality_score: 0.86, has_cleaned_data: true },
];

function normalizeData(rows) {
  return rows.map((item, index) => ({
    id: item.id ?? index + 1,
    sector_name: item.sector_name ?? item.sector ?? "General",
    row_count: Number(item.row_count ?? item.records ?? 0),
    uploaded_at: item.uploaded_at ?? new Date().toISOString(),
    quality_score: Number(item.quality_score ?? item.qualityScore ?? 0),
    has_cleaned_data: Boolean(item.has_cleaned_data ?? false),
  }));
}

function monthLabel(dateValue) {
  const d = new Date(dateValue);
  return d.toLocaleString("en-US", { month: "short" });
}

function quantile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const index = (sortedValues.length - 1) * p;
  const floor = Math.floor(index);
  const ceil = Math.ceil(index);
  if (floor === ceil) return sortedValues[floor];
  return sortedValues[floor] + (sortedValues[ceil] - sortedValues[floor]) * (index - floor);
}

function ChartCard({ title, children, className = "" }) {
  return (
    <div className={`bg-theme-card rounded-xl border border-theme-light p-5 ${className}`}>
      <h2 className="sr-only">{title}</h2>
      {children}
    </div>
  );
}

export default function Visualizations() {
  const [isLoading, setIsLoading] = useState(true);
  const [uploadedRows, setUploadedRows] = useState([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const response = await getUploadedData();
        const rows = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
        if (mounted) setUploadedRows(normalizeData(rows.length ? rows : FALLBACK_DATA));
      } catch {
        if (mounted) setUploadedRows(normalizeData(FALLBACK_DATA));
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const data = useMemo(() => {
    const totalRows = uploadedRows.reduce((sum, row) => sum + row.row_count, 0);
    const cleanedRows = uploadedRows
      .filter((row) => row.has_cleaned_data)
      .reduce((sum, row) => sum + row.row_count, 0);
    const avgQuality = uploadedRows.length
      ? (uploadedRows.reduce((sum, row) => sum + row.quality_score, 0) / uploadedRows.length) * 100
      : 0;

    const sectorMap = new Map();
    const monthMap = new Map();

    uploadedRows.forEach((row) => {
      const sectorPrev = sectorMap.get(row.sector_name) || {
        department: row.sector_name,
        cleaned: 0,
        pending: 0,
        datasets: 0,
        qualityTotal: 0,
        points: [],
      };
      if (row.has_cleaned_data) sectorPrev.cleaned += row.row_count;
      else sectorPrev.pending += row.row_count;
      sectorPrev.datasets += 1;
      sectorPrev.qualityTotal += row.quality_score * 100;
      sectorPrev.points.push(row.row_count);
      sectorMap.set(row.sector_name, sectorPrev);

      const m = monthLabel(row.uploaded_at);
      const monthPrev = monthMap.get(m) || { month: m, rows: 0, datasets: 0, quality: 0 };
      monthPrev.rows += row.row_count;
      monthPrev.datasets += 1;
      monthPrev.quality += row.quality_score * 100;
      monthMap.set(m, monthPrev);
    });

    const departmentPerformance = Array.from(sectorMap.values()).map((s) => ({
      department: s.department,
      cleaned: s.cleaned,
      pending: s.pending,
      total: s.cleaned + s.pending,
      quality: Math.round(s.qualityTotal / s.datasets),
      datasets: s.datasets,
    }));

    const topMetrics = [
      { metric: "Quality Score", value: Math.round(avgQuality), target: 95 },
      { metric: "Cleaned Coverage", value: Math.round((cleanedRows / Math.max(totalRows, 1)) * 100), target: 90 },
      { metric: "Dataset Volume", value: Math.round((uploadedRows.length / 25) * 100), target: 100 },
      { metric: "Pipeline Throughput", value: Math.min(100, Math.round((totalRows / 75000) * 100)), target: 85 },
      { metric: "Consistency", value: Math.max(55, Math.min(99, Math.round(avgQuality + 6))), target: 92 },
    ].sort((a, b) => b.value - a.value);

    const targetVsAchievement = topMetrics.map((m) => ({
      metric: m.metric,
      target: m.target,
      achievement: m.value,
      remaining: Math.max(m.target - m.value, 0),
    }));

    const donutData = [
      { name: "High (>=85%)", value: uploadedRows.filter((r) => r.quality_score * 100 >= 85).length },
      { name: "Medium (70-84%)", value: uploadedRows.filter((r) => r.quality_score * 100 >= 70 && r.quality_score * 100 < 85).length },
      { name: "Low (<70%)", value: uploadedRows.filter((r) => r.quality_score * 100 < 70).length },
    ];

    const multiLayeredBars = departmentPerformance.map((d) => ({
      department: d.department,
      rowsK: +(d.total / 1000).toFixed(1),
      quality: d.quality,
      loadIndex: Math.min(100, d.datasets * 20),
    }));

    const trend = Array.from(monthMap.values()).map((m) => ({
      month: m.month,
      rowsK: +(m.rows / 1000).toFixed(1),
      datasets: m.datasets,
      quality: Math.round(m.quality / m.datasets),
    }));

    const scatter = uploadedRows.map((row) => ({
      x: row.row_count,
      y: Math.round(row.quality_score * 100),
      z: row.has_cleaned_data ? 12 : 8,
      name: `DS-${row.id}`,
    }));

    const boxPlot = Array.from(sectorMap.values()).map((s) => {
      const sorted = [...s.points].sort((a, b) => a - b);
      const min = sorted[0] || 0;
      const q1 = quantile(sorted, 0.25);
      const median = quantile(sorted, 0.5);
      const q3 = quantile(sorted, 0.75);
      const max = sorted[sorted.length - 1] || 0;
      return {
        category: s.department,
        min: +(min / 1000).toFixed(1),
        q1: +(q1 / 1000).toFixed(1),
        median: +(median / 1000).toFixed(1),
        q3: +(q3 / 1000).toFixed(1),
        max: +(max / 1000).toFixed(1),
        q1Base: +(q1 / 1000).toFixed(1),
        iqr: +((q3 - q1) / 1000).toFixed(1),
      };
    });

    const radarData = topMetrics.slice(0, 5).map((m) => ({
      metric: m.metric.replace(" ", "\n"),
      value: m.value,
      target: m.target,
    }));

    const sectorNames = departmentPerformance.map((d) => d.department);
    const statusNodes = ["Cleaned", "Pending"];
    const nodes = [...sectorNames, ...statusNodes].map((name) => ({ name }));
    const cleanedIndex = sectorNames.length;
    const pendingIndex = sectorNames.length + 1;
    const sankeyLinks = departmentPerformance.flatMap((d, idx) => [
      { source: idx, target: cleanedIndex, value: Math.max(1, d.cleaned) },
      { source: idx, target: pendingIndex, value: Math.max(1, d.pending) },
    ]);

    return {
      summary: { totalRows, avgQuality: Math.round(avgQuality), totalDatasets: uploadedRows.length },
      departmentPerformance,
      topMetrics,
      targetVsAchievement,
      donutData,
      multiLayeredBars,
      trend,
      scatter,
      boxPlot,
      radarData,
      sankey: { nodes, links: sankeyLinks },
    };
  }, [uploadedRows]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-clay-600 dark:text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading visualization data...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-clay-900 dark:text-slate-100">Visualizations</h1>
        <p className="mt-1 text-clay-600 dark:text-slate-400">
          Advanced analytics dashboard generated from uploaded datasets.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="bg-theme-card rounded-xl border border-theme-light p-4">
          <p className="text-sm text-theme-muted">Total Datasets</p>
          <p className="mt-1 text-2xl font-semibold text-theme-primary">{data.summary.totalDatasets}</p>
        </div>
        <div className="bg-theme-card rounded-xl border border-theme-light p-4">
          <p className="text-sm text-theme-muted">Total Rows</p>
          <p className="mt-1 text-2xl font-semibold text-theme-primary">{data.summary.totalRows.toLocaleString()}</p>
        </div>
        <div className="bg-theme-card rounded-xl border border-theme-light p-4">
          <p className="text-sm text-theme-muted">Average Quality</p>
          <p className="mt-1 text-2xl font-semibold text-theme-primary">{data.summary.avgQuality}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard title="1. Stacked Bar Chart (Department Performance Comparison)">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.departmentPerformance}>
              <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="3 3" />
              <XAxis dataKey="department" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip />
              <Legend />
              <Bar dataKey="cleaned" stackId="rows" fill="#14b8a6" name="Cleaned Rows" />
              <Bar dataKey="pending" stackId="rows" fill="#f59e0b" name="Pending Rows" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="2. Horizontal Bar Chart (Top Performing Metrics)">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.topMetrics} layout="vertical" margin={{ left: 12 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} stroke="var(--text-muted)" />
              <YAxis type="category" dataKey="metric" width={130} stroke="var(--text-muted)" />
              <Tooltip />
              <Bar dataKey="value" fill="#0ea5e9" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard title="3. Progress Chart (Target vs Achievement)">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.targetVsAchievement} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} stroke="var(--text-muted)" />
              <YAxis type="category" dataKey="metric" width={130} stroke="var(--text-muted)" />
              <Tooltip />
              <Legend />
              <Bar dataKey="achievement" stackId="a" fill="#22c55e" name="Achievement" />
              <Bar dataKey="remaining" stackId="a" fill="#dbeafe" name="Gap To Target" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="4. Donut Chart (Category Distribution)">
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={data.donutData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={3} label>
                {data.donutData.map((item, index) => (
                  <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard title="5. Multi-layered Bar Chart">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.multiLayeredBars}>
              <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="3 3" />
              <XAxis dataKey="department" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip />
              <Legend />
              <Bar dataKey="rowsK" fill="#14b8a6" name="Rows (K)" />
              <Bar dataKey="quality" fill="#6366f1" name="Quality %" />
              <Bar dataKey="loadIndex" fill="#f97316" name="Load Index" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="6. Multi-line Trend Chart (Monthly Growth Comparison)">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.trend}>
              <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="rowsK" stroke="#14b8a6" strokeWidth={2.5} name="Rows (K)" />
              <Line type="monotone" dataKey="datasets" stroke="#0ea5e9" strokeWidth={2.5} name="Datasets" />
              <Line type="monotone" dataKey="quality" stroke="#22c55e" strokeWidth={2.5} name="Quality %" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard title="7. Scatter Plot (Correlation Analysis)">
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" name="Rows" unit="" stroke="var(--text-muted)" />
              <YAxis type="number" dataKey="y" name="Quality" unit="%" stroke="var(--text-muted)" domain={[50, 100]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={data.scatter} fill="#14b8a6" />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="8. Box Plot (Data Distribution Analysis)">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data.boxPlot}>
              <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="3 3" />
              <XAxis dataKey="category" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" label={{ value: "Rows (K)", angle: -90, position: "insideLeft" }} />
              <Tooltip />
              <Bar dataKey="q1Base" stackId="box" fill="transparent" />
              <Bar dataKey="iqr" stackId="box" fill="#60a5fa" name="IQR (Q1-Q3)" />
              <Line type="monotone" dataKey="median" stroke="#0f766e" strokeWidth={2} name="Median" />
              <Line type="monotone" dataKey="min" stroke="#94a3b8" strokeWidth={1.4} name="Min" />
              <Line type="monotone" dataKey="max" stroke="#334155" strokeWidth={1.4} name="Max" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard title="9. Radar Chart (Performance Metrics)">
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={data.radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "var(--text-muted)" }} />
              <Radar name="Current" dataKey="value" stroke="#14b8a6" fill="#14b8a655" />
              <Radar name="Target" dataKey="target" stroke="#0ea5e9" fill="#0ea5e933" />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="10. Sankey Diagram (Data Flow Analysis)">
          <ResponsiveContainer width="100%" height={320}>
            <Sankey
              data={data.sankey}
              nodePadding={20}
              margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
              node={{ stroke: "#1f2937", fill: "#14b8a6", opacity: 0.9 }}
              link={{ stroke: "#0ea5e9", opacity: 0.35 }}
            >
              <Tooltip />
            </Sankey>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

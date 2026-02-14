import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Database, Loader2 } from "lucide-react";
import { getUploadedData } from "../services/api";

const CHART_COLORS = ["#14b8a6", "#06b6d4", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444"];

const FALLBACK_DATA = [
  { id: 1, sector_name: "Sales", row_count: 12200, uploaded_at: "2026-01-05T10:00:00", quality_score: 0.82, has_cleaned_data: true },
  { id: 2, sector_name: "Marketing", row_count: 8400, uploaded_at: "2026-01-08T08:10:00", quality_score: 0.75, has_cleaned_data: false },
  { id: 3, sector_name: "Operations", row_count: 18900, uploaded_at: "2026-01-12T12:30:00", quality_score: 0.91, has_cleaned_data: true },
  { id: 4, sector_name: "Sales", row_count: 10200, uploaded_at: "2026-02-01T08:20:00", quality_score: 0.88, has_cleaned_data: true },
  { id: 5, sector_name: "Support", row_count: 5300, uploaded_at: "2026-02-02T11:40:00", quality_score: 0.69, has_cleaned_data: false },
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
        const normalized = normalizeData(rows.length ? rows : FALLBACK_DATA);
        if (mounted) setUploadedRows(normalized);
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

  const graphData = useMemo(() => {
    const totalRows = uploadedRows.reduce((sum, row) => sum + row.row_count, 0);
    const cleanedCount = uploadedRows.filter((row) => row.has_cleaned_data).length;
    const pendingCount = uploadedRows.length - cleanedCount;
    const avgQuality = uploadedRows.length
      ? (uploadedRows.reduce((sum, row) => sum + row.quality_score, 0) / uploadedRows.length) * 100
      : 0;

    const bySectorMap = new Map();
    uploadedRows.forEach((row) => {
      const prev = bySectorMap.get(row.sector_name) || { sector: row.sector_name, rows: 0, datasets: 0, qualityTotal: 0 };
      prev.rows += row.row_count;
      prev.datasets += 1;
      prev.qualityTotal += row.quality_score * 100;
      bySectorMap.set(row.sector_name, prev);
    });
    const bySector = Array.from(bySectorMap.values()).map((v) => ({
      sector: v.sector,
      rows: v.rows,
      datasets: v.datasets,
      avgQuality: Math.round(v.qualityTotal / v.datasets),
    }));

    const byMonthMap = new Map();
    uploadedRows.forEach((row) => {
      const key = monthLabel(row.uploaded_at);
      const prev = byMonthMap.get(key) || { month: key, rows: 0, datasets: 0 };
      prev.rows += row.row_count;
      prev.datasets += 1;
      byMonthMap.set(key, prev);
    });
    const byMonth = Array.from(byMonthMap.values());

    const qualityBands = [
      { name: "High (>=85%)", value: 0 },
      { name: "Medium (70-84%)", value: 0 },
      { name: "Low (<70%)", value: 0 },
    ];
    uploadedRows.forEach((row) => {
      const q = row.quality_score * 100;
      if (q >= 85) qualityBands[0].value += 1;
      else if (q >= 70) qualityBands[1].value += 1;
      else qualityBands[2].value += 1;
    });

    const statusSplit = [
      { name: "Cleaned", value: cleanedCount },
      { name: "Pending", value: pendingCount },
    ];

    const datasetRows = uploadedRows
      .map((row) => ({ name: `DS-${row.id}`, rows: row.row_count, quality: Math.round(row.quality_score * 100) }))
      .sort((a, b) => b.rows - a.rows)
      .slice(0, 8);

    return {
      totalRows,
      totalDatasets: uploadedRows.length,
      avgQuality: Math.round(avgQuality),
      cleanedCount,
      bySector,
      byMonth,
      qualityBands,
      statusSplit,
      datasetRows,
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
          Dashboard-level analytics generated from uploaded datasets.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="bg-theme-card rounded-xl border border-theme-light p-4">
          <p className="text-sm text-theme-muted">Total Datasets</p>
          <p className="mt-1 text-2xl font-semibold text-theme-primary">{graphData.totalDatasets}</p>
        </div>
        <div className="bg-theme-card rounded-xl border border-theme-light p-4">
          <p className="text-sm text-theme-muted">Total Rows</p>
          <p className="mt-1 text-2xl font-semibold text-theme-primary">{graphData.totalRows.toLocaleString()}</p>
        </div>
        <div className="bg-theme-card rounded-xl border border-theme-light p-4">
          <p className="text-sm text-theme-muted">Average Quality</p>
          <p className="mt-1 text-2xl font-semibold text-theme-primary">{graphData.avgQuality}%</p>
        </div>
        <div className="bg-theme-card rounded-xl border border-theme-light p-4">
          <p className="text-sm text-theme-muted">Cleaned Datasets</p>
          <p className="mt-1 text-2xl font-semibold text-theme-primary">{graphData.cleanedCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="bg-theme-card rounded-xl border border-theme-light p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-theme-primary">
            <BarChart3 className="h-5 w-5 text-teal-500" />
            Rows By Sector
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={graphData.bySector}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="sector" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip />
              <Legend />
              <Bar dataKey="rows" fill="#14b8a6" name="Rows" radius={[6, 6, 0, 0]} />
              <Bar dataKey="datasets" fill="#06b6d4" name="Datasets" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-theme-card rounded-xl border border-theme-light p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-theme-primary">
            <Database className="h-5 w-5 text-teal-500" />
            Monthly Upload Trend
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={graphData.byMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="month" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip />
              <Area type="monotone" dataKey="rows" stroke="#14b8a6" fill="#14b8a644" name="Rows Uploaded" />
              <Line type="monotone" dataKey="datasets" stroke="#0891b2" strokeWidth={2} name="Datasets" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="bg-theme-card rounded-xl border border-theme-light p-5">
          <h2 className="mb-4 text-lg font-semibold text-theme-primary">Quality Distribution</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={graphData.qualityBands} dataKey="value" nameKey="name" outerRadius={88} label>
                {graphData.qualityBands.map((entry, index) => (
                  <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-theme-card rounded-xl border border-theme-light p-5">
          <h2 className="mb-4 text-lg font-semibold text-theme-primary">Cleaning Status Split</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={graphData.statusSplit} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} label>
                <Cell fill="#10b981" />
                <Cell fill="#f59e0b" />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-theme-card rounded-xl border border-theme-light p-5">
          <h2 className="mb-4 text-lg font-semibold text-theme-primary">Top Datasets By Rows</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={graphData.datasetRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="name" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip />
              <Bar dataKey="rows" fill="#14b8a6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

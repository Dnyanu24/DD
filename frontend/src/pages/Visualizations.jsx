import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Filter, Layers3, Loader2, Package2, SlidersHorizontal, Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { getCleanedDatasetPreview, getCleanedDatasets, getVisualizationData } from "../services/api";

const C = { primary: "#14b8a6", secondary: "#0ea5e9", tertiary: "#22c55e", warning: "#f59e0b", danger: "#ef4444", deep: "#0f766e" };

const GROUPS = [{ value: "sector_name", label: "Sector" }, { value: "product_name", label: "Product" }, { value: "status", label: "Status" }];
const GRAINS = [{ value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }, { value: "weekly", label: "Weekly" }];
const METRICS = [{ value: "row_count", label: "Rows" }, { value: "dataset_count", label: "Datasets" }, { value: "quality", label: "Quality" }];

function normalize(rows) {
  return rows.map((item, index) => ({
    id: item.id ?? index + 1,
    sector_name: item.sector_name ?? item.sector ?? "General",
    product_name: item.product_name ?? item.product ?? "Unassigned",
    row_count: Number(item.row_count ?? item.records ?? 0),
    uploaded_at: item.uploaded_at ?? item.time_reference ?? new Date().toISOString(),
    cleaned_at: item.cleaned_at ?? null,
    time_reference: item.time_reference ?? item.cleaned_at ?? item.uploaded_at ?? new Date().toISOString(),
    quality_score: Number(item.quality_score ?? item.qualityScore ?? 0),
    has_cleaned_data: Boolean(item.has_cleaned_data ?? false),
    status: item.status ?? (item.has_cleaned_data ? "Cleaned" : "Pending"),
    source: item.source ?? (item.has_cleaned_data ? "cleaned_data" : "raw_data"),
    column_count: Number(item.column_count ?? 0),
  }));
}

function bucket(dateValue, grain) {
  const date = new Date(dateValue);
  if (grain === "quarterly") return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
  if (grain === "weekly") {
    const start = new Date(date.getFullYear(), 0, 1);
    const week = Math.ceil((((date - start) / 86400000) + start.getDay() + 1) / 7);
    return `W${week} ${date.getFullYear()}`;
  }
  return date.toLocaleString("en-US", { month: "short", year: "numeric" });
}

function buildMonthlyWaveSeries(rows, dateCol, valueCol) {
  if (!dateCol || !valueCol) return [];
  const map = new Map();

  for (const row of rows) {
    const date = toDate(row?.[dateCol]);
    if (!date) continue;
    const value = toNumber(row?.[valueCol]);
    if (value == null) continue;

    const key = (date.getFullYear() * 12) + date.getMonth();
    const bucketLabel = date.toLocaleString("en-US", { month: "short", year: "numeric" });
    const current = map.get(key) || { key, bucket: bucketLabel, value: 0 };
    current.value += value;
    map.set(key, current);
  }

  const series = Array.from(map.values()).sort((a, b) => a.key - b.key);
  if (series.length === 0) return [];

  // Smooth with a simple moving average for the "wave" feel.
  const windowSize = 3;
  const smoothed = series.map((point, idx) => {
    const start = Math.max(0, idx - (windowSize - 1));
    const slice = series.slice(start, idx + 1);
    const ma = slice.reduce((sum, p) => sum + p.value, 0) / Math.max(slice.length, 1);
    return { ...point, ma: Number.isFinite(ma) ? ma : point.value };
  });

  const baseline = smoothed[0]?.value;
  return smoothed.map((point) => {
    const growthPct = baseline && Number.isFinite(baseline)
      ? ((point.value - baseline) / Math.abs(baseline)) * 100
      : 0;
    return { ...point, growthPct: Math.round(growthPct * 10) / 10 };
  });
}

function qualityBand(score) {
  const pct = (score || 0) * 100;
  if (pct >= 85) return "High";
  if (pct >= 70) return "Medium";
  return "Low";
}

function palette(index) {
  return [C.primary, C.secondary, C.tertiary, C.warning, C.danger, C.deep][index % 6];
}

function chartTooltip() {
  return {
    backgroundColor: "var(--bg-card)",
    border: "1px solid var(--border-light)",
    borderRadius: "18px",
    boxShadow: "0 14px 40px -24px rgba(15, 23, 42, 0.35)",
  };
}

function isMissing(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return typeof value === "number" && Number.isNaN(value);
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const pctMatch = trimmed.match(/^(-?\d+(\.\d+)?)\s*%$/);
  if (pctMatch) {
    const num = Number(pctMatch[1]);
    return Number.isFinite(num) ? num : null;
  }
  const normalized = trimmed
    .replace(/[,$₹€£]/g, "")
    .replace(/,/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function toDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const time = Date.parse(trimmed);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  return Number.isFinite(date.getTime()) ? date : null;
}

function inferColumnTypes(rows, columns) {
  const sample = rows.slice(0, 300);
  const numeric = [];
  const datetime = [];
  const categorical = [];

  columns.forEach((col) => {
    let seen = 0;
    let numericCount = 0;
    let dateCount = 0;

    for (const row of sample) {
      const value = row?.[col];
      if (isMissing(value)) continue;
      seen += 1;
      if (toNumber(value) != null) numericCount += 1;
      if (toDate(value) != null) dateCount += 1;
    }

    if (seen === 0) {
      categorical.push(col);
      return;
    }

    const numericRatio = numericCount / seen;
    const dateRatio = dateCount / seen;
    if (numericRatio >= 0.85) numeric.push(col);
    else if (dateRatio >= 0.75) datetime.push(col);
    else categorical.push(col);
  });

  return { numeric, datetime, categorical };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function stddev(values, mean) {
  if (!values.length) return null;
  const m = typeof mean === "number" ? mean : values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function uniqueCount(rows, column, limit = 5000) {
  const set = new Set();
  for (const row of rows) {
    const value = row?.[column];
    if (isMissing(value)) continue;
    const key = typeof value === "string" ? value.trim() : String(value);
    if (!key) continue;
    set.add(key);
    if (set.size >= limit) break;
  }
  return set.size;
}

function duplicateRowCount(rows, columns) {
  if (!rows.length || !columns.length) return 0;
  const seen = new Set();
  let dupes = 0;
  for (const row of rows) {
    const key = columns.map((col) => {
      const v = row?.[col];
      if (v === null || v === undefined) return "__null__";
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    }).join("|");
    if (seen.has(key)) dupes += 1;
    else seen.add(key);
  }
  return dupes;
}

function pearsonCorrelation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i += 1) {
    const x = xs[i];
    const y = ys[i];
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
  }
  const num = (n * sumXY) - (sumX * sumY);
  const den = Math.sqrt(((n * sumXX) - (sumX * sumX)) * ((n * sumYY) - (sumY * sumY)));
  if (!Number.isFinite(den) || den === 0) return null;
  const r = num / den;
  if (!Number.isFinite(r)) return null;
  return Math.max(-1, Math.min(1, r));
}

function formatBucketLabel(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "-";
  const compact = (n) => (Math.abs(n) >= 1000 ? n.toLocaleString() : String(Math.round(n * 100) / 100));
  return `${compact(min)} to ${compact(max)}`;
}

function buildHistogram(values, bins = 12) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return [];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) {
    return [{ bucket: formatBucketLabel(min, max), count: nums.length, min, max }];
  }
  const safeBins = Math.max(5, Math.min(20, bins));
  const width = (max - min) / safeBins;
  const counts = Array.from({ length: safeBins }, () => 0);
  for (const v of nums) {
    const idx = Math.min(safeBins - 1, Math.max(0, Math.floor((v - min) / width)));
    counts[idx] += 1;
  }
  return counts.map((count, idx) => {
    const bMin = min + idx * width;
    const bMax = idx === safeBins - 1 ? max : min + (idx + 1) * width;
    return { bucket: formatBucketLabel(bMin, bMax), count, min: bMin, max: bMax };
  });
}

function pickByName(candidates, patterns) {
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const lower = candidates.map((col) => ({ col, lower: String(col).toLowerCase() }));
  for (const pattern of patterns) {
    const p = String(pattern).toLowerCase();
    const exact = lower.find((item) => item.lower === p);
    if (exact?.col) return exact.col;
    const partial = lower.find((item) => item.lower.includes(p));
    if (partial?.col) return partial.col;
  }
  return candidates[0] || "";
}

function countByCategory(rows, col, topN = 10) {
  if (!col) return [];
  const counts = new Map();
  for (const row of rows) {
    const raw = row?.[col];
    if (isMissing(raw)) continue;
    const name = String(raw).trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

function aggregateNumericByCategory(rows, catCol, numCol, agg = "sum", topN = 10) {
  if (!catCol || !numCol) return [];
  const map = new Map();
  for (const row of rows) {
    const catRaw = row?.[catCol];
    if (isMissing(catRaw)) continue;
    const name = String(catRaw).trim();
    if (!name) continue;
    const v = toNumber(row?.[numCol]);
    if (v == null) continue;
    const current = map.get(name) || { sum: 0, count: 0 };
    current.sum += v;
    current.count += 1;
    map.set(name, current);
  }
  return Array.from(map.entries())
    .map(([name, stat]) => ({ name, value: agg === "avg" ? (stat.count ? stat.sum / stat.count : 0) : stat.sum }))
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

function topValueCounts(rows, column, limit = 10) {
  const map = new Map();
  for (const row of rows) {
    const value = row?.[column];
    if (isMissing(value)) continue;
    const key = typeof value === "string" ? value.trim() : String(value);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function missingByColumn(rows, columns) {
  const total = Math.max(rows.length, 1);
  return columns
    .map((col) => {
      let missing = 0;
      for (const row of rows) {
        if (isMissing(row?.[col])) missing += 1;
      }
      return { name: col, missing, missingPercent: Math.round((missing / total) * 1000) / 10 };
    })
    .sort((a, b) => b.missingPercent - a.missingPercent);
}

function numericStats(rows, column) {
  const values = [];
  for (const row of rows) {
    const num = toNumber(row?.[column]);
    if (num == null) continue;
    values.push(num);
  }
  if (values.length === 0) {
    return { count: 0, min: null, max: null, mean: null };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return { count: values.length, min, max, mean: Math.round(mean * 1000) / 1000, values };
}

function SelectChip({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-2 rounded-full border border-theme-light bg-theme-secondary px-3 py-2 text-xs font-semibold text-theme-muted">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="bg-transparent text-theme-primary">
        {options.map((option) => <option key={option.value ?? option} value={option.value ?? option}>{option.label ?? option}</option>)}
      </select>
    </label>
  );
}

function Tabs({ value, onChange, options }) {
  return (
    <div className="inline-flex flex-wrap gap-2 rounded-full bg-theme-secondary p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${value === option.value ? "bg-white text-slate-900 dark:bg-slate-900 dark:text-white" : "text-theme-muted hover:text-theme-primary"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Card({ title, subtitle, action, children }) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-theme-light bg-theme-card shadow-theme">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-theme-light px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold text-theme-primary">{title}</h2>
          <p className="mt-1 text-sm text-theme-muted">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Stat({ label, value, hint, icon }) {
  const Icon = icon;
  return (
    <div className="rounded-[24px] border border-theme-light bg-theme-card p-5 shadow-theme">
      <div className="flex items-center justify-between">
        <span className="text-sm text-theme-muted">{label}</span>
        <span className="rounded-xl bg-theme-secondary p-2 text-theme-primary"><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-4 text-3xl font-semibold text-theme-primary">{value}</p>
      <p className="mt-1 text-sm text-theme-muted">{hint}</p>
    </div>
  );
}

export default function Visualizations() {
  const location = useLocation();
  const navigate = useNavigate();
  const fileKey = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const key = params.get("fileKey");
    return key && key.trim() ? key.trim() : null;
  }, [location.search]);
  const cleanedDataId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get("cleanedDataId");
    return value && value.trim() ? value.trim() : null;
  }, [location.search]);
  const studioMode = useMemo(() => {
    const params = new URLSearchParams(location.search);
    // Default to "PowerBI-style overview" mode. Use `studio=0` only if we ever need a non-studio view.
    return params.get("studio") !== "0";
  }, [location.search]);

  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetError, setDatasetError] = useState("");
  const [datasetFile, setDatasetFile] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [studioError, setStudioError] = useState("");
  const [rows, setRows] = useState([]);
  const [groupBy, setGroupBy] = useState("product_name");
  const [granularity, setGranularity] = useState("monthly");
  const [metric, setMetric] = useState("row_count");
  const [sector, setSector] = useState("all");
  const [product, setProduct] = useState("all");
  const [pipeline, setPipeline] = useState("all");
  const [quality, setQuality] = useState("all");
  const [trendStyle, setTrendStyle] = useState("area");
  const [compareStyle, setCompareStyle] = useState("stacked");
  const [distributionStyle, setDistributionStyle] = useState("donut");
  const [rankMetric, setRankMetric] = useState("row_count");
  const [scatterColorBy, setScatterColorBy] = useState("status");
  const [matrixMetric, setMatrixMetric] = useState("quality");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!studioMode || fileKey || cleanedDataId) return;
      setStudioError("");
      setIsLoading(true);
      try {
        const response = await getVisualizationData();
        const data = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
        if (mounted) setRows(normalize(data));
      } catch (err) {
        if (mounted) setStudioError(err?.message || "Failed to load visualization data.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [cleanedDataId, fileKey, studioMode]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!fileKey && !cleanedDataId) {
        if (mounted) {
          setDatasetFile(null);
          setDatasetError("");
          setDatasetLoading(false);
        }
        return;
      }
      setDatasetError("");
      setDatasetLoading(true);
      try {
        if (cleanedDataId) {
          const preview = await getCleanedDatasetPreview(cleanedDataId, { limit: 5000, offset: 0 });
          const payload = {
            source: "database_preview",
            cleanedDataId: preview?.cleaned_data_id,
            rawDataId: preview?.raw_data_id,
            filename: preview?.filename || `cleaned_dataset_${preview?.cleaned_data_id}`,
            totalRows: Number(preview?.row_count ?? 0),
            previewRows: Number(preview?.preview_row_count ?? 0),
            columns: Array.isArray(preview?.columns) ? preview.columns : [],
            rows: Array.isArray(preview?.rows) ? preview.rows : [],
            qualityScore: preview?.quality_score,
            algorithm: preview?.algorithm,
            sectorLabel: preview?.sector_label,
            cleanedAt: preview?.cleaned_at,
            loadedAt: new Date().toISOString(),
          };
          if (mounted) setDatasetFile(payload);
          return;
        }

        const raw = sessionStorage.getItem(fileKey);
        if (!raw) throw new Error("Visualization file not found. Please open it again from the cleaned dataset list.");
        const parsed = JSON.parse(raw);
        if (mounted) setDatasetFile(parsed);
      } catch (err) {
        if (mounted) setDatasetError(err?.message || "Failed to load cleaned dataset");
      } finally {
        if (mounted) setDatasetLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [cleanedDataId, fileKey]);

  const [cleanedListLoading, setCleanedListLoading] = useState(false);
  const [cleanedListError, setCleanedListError] = useState("");
  const [cleanedList, setCleanedList] = useState([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [globalFile, setGlobalFile] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!studioMode || fileKey || cleanedDataId) return;
      setCleanedListError("");
      setCleanedListLoading(true);
      try {
        const res = await getCleanedDatasets();
        const data = Array.isArray(res?.data) ? res.data : [];
        if (mounted) setCleanedList(data);
      } catch (err) {
        if (mounted) setCleanedListError(err?.message || "Failed to load cleaned datasets");
      } finally {
        if (mounted) setCleanedListLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [cleanedDataId, fileKey, studioMode]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!studioMode || fileKey || cleanedDataId) return;
      setGlobalError("");
      setGlobalLoading(true);
      try {
        const res = await getCleanedDatasets();
        const datasets = Array.isArray(res?.data) ? res.data : [];
        const selected = datasets.slice(0, 6); // keep it fast; we merge previews

        const previews = [];
        for (const item of selected) {
          if (!item?.cleaned_data_id) continue;
          // eslint-disable-next-line no-await-in-loop
          const preview = await getCleanedDatasetPreview(item.cleaned_data_id, { limit: 2000, offset: 0 });
          previews.push({ item, preview });
        }

        const rowsMerged = [];
        const colSet = new Set();
        for (const entry of previews) {
          const previewRows = Array.isArray(entry?.preview?.rows) ? entry.preview.rows : [];
          for (const row of previewRows) {
            if (row && typeof row === "object") rowsMerged.push(row);
          }
          const cols = Array.isArray(entry?.preview?.columns) ? entry.preview.columns : [];
          for (const col of cols) colSet.add(col);
          if (rowsMerged.length >= 12000) break;
        }
        const columns = Array.from(colSet);

        const payload = {
          source: "database_merged_preview",
          filename: "All Cleaned Datasets (Preview)",
          totalRows: rowsMerged.length,
          previewRows: rowsMerged.length,
          columns,
          rows: rowsMerged,
          loadedAt: new Date().toISOString(),
        };
        if (mounted) setGlobalFile(payload);
      } catch (err) {
        if (mounted) setGlobalError(err?.message || "Failed to load global cleaned data preview.");
      } finally {
        if (mounted) setGlobalLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [cleanedDataId, fileKey, studioMode]);

  const datasetRows = useMemo(() => (Array.isArray(datasetFile?.rows) ? datasetFile.rows : []), [datasetFile]);
  const datasetColumns = useMemo(() => (Array.isArray(datasetFile?.columns) ? datasetFile.columns : []), [datasetFile]);
  const datasetTypes = useMemo(() => inferColumnTypes(datasetRows, datasetColumns), [datasetColumns, datasetRows]);

  const datasetMissing = useMemo(() => missingByColumn(datasetRows, datasetColumns), [datasetColumns, datasetRows]);
  const datasetMissingTop = useMemo(() => datasetMissing.slice(0, 14), [datasetMissing]);
  const datasetOverallMissingPct = useMemo(() => {
    return datasetMissing.length
      ? Math.round((datasetMissing.reduce((sum, item) => sum + item.missingPercent, 0) / datasetMissing.length) * 10) / 10
      : 0;
  }, [datasetMissing]);
  const datasetDuplicateCount = useMemo(() => duplicateRowCount(datasetRows, datasetColumns), [datasetColumns, datasetRows]);
  const datasetCellMissing = useMemo(() => {
    const rowCount = datasetRows.length;
    const colCount = datasetColumns.length;
    const totalCells = Math.max(rowCount * colCount, 1);
    let missingCells = 0;
    if (rowCount && colCount) {
      for (const row of datasetRows) {
        for (const col of datasetColumns) {
          if (isMissing(row?.[col])) missingCells += 1;
        }
      }
    }
    const missingPct = Math.round((missingCells / totalCells) * 1000) / 10;
    return { rowCount, colCount, totalCells, missingCells, missingPct, filledPct: Math.round((100 - missingPct) * 10) / 10 };
  }, [datasetColumns, datasetRows]);

  const datasetSuggested = useMemo(() => {
    const sales = pickByName(datasetTypes.numeric, ["sales", "revenue", "turnover", "amount"]);
    const profit = pickByName(datasetTypes.numeric, ["profit", "margin", "income"]);
    const employees = pickByName(datasetTypes.numeric, ["employees", "employee", "headcount", "staff"]);
    const sectorCol = pickByName(datasetTypes.categorical, ["sector", "industry", "category", "type"]);
    const regionCol = pickByName(datasetTypes.categorical, ["region", "location", "state", "country", "area"]);
    return { sales, profit, employees, sectorCol, regionCol };
  }, [datasetTypes.categorical, datasetTypes.numeric]);

  const datasetKpis = useMemo(() => {
    const totalRecords = Number(datasetFile?.totalRows ?? datasetRows.length ?? 0);
    const qualityScore = datasetFile?.qualityScore != null ? Number(datasetFile.qualityScore) : null;
    const qualityPct = qualityScore != null && Number.isFinite(qualityScore)
      ? Math.round(Math.max(0, Math.min(1, qualityScore)) * 1000) / 10
      : Math.max(0, Math.round((100 - datasetOverallMissingPct) * 10) / 10);

    const avgSales = datasetSuggested.sales ? numericStats(datasetRows, datasetSuggested.sales).mean : null;
    const totalProfit = datasetSuggested.profit
      ? datasetRows.reduce((sum, row) => {
        const v = toNumber(row?.[datasetSuggested.profit]);
        return v == null ? sum : sum + v;
      }, 0)
      : null;

    return {
      totalRecords,
      qualityPct,
      avgSales,
      totalProfit,
    };
  }, [datasetFile, datasetOverallMissingPct, datasetRows, datasetSuggested.profit, datasetSuggested.sales]);

  const sectorSales = useMemo(() => {
    if (!datasetSuggested.sectorCol || !datasetSuggested.sales) return [];
    return aggregateNumericByCategory(datasetRows, datasetSuggested.sectorCol, datasetSuggested.sales, "sum", 10)
      .map((item, idx) => ({ ...item, fill: palette(idx) }));
  }, [datasetRows, datasetSuggested.sales, datasetSuggested.sectorCol]);

  const regionDistribution = useMemo(() => {
    const col = datasetSuggested.regionCol || datasetSuggested.sectorCol;
    return countByCategory(datasetRows, col, 10).map((item, idx) => ({ ...item, fill: palette(idx) }));
  }, [datasetRows, datasetSuggested.regionCol, datasetSuggested.sectorCol]);

  const salesProfitScatter = useMemo(() => {
    const xCol = datasetSuggested.sales;
    const yCol = datasetSuggested.profit;
    if (!xCol || !yCol) return [];
    const points = [];
    for (const row of datasetRows) {
      const x = toNumber(row?.[xCol]);
      const y = toNumber(row?.[yCol]);
      if (x == null || y == null) continue;
      points.push({ x, y });
      if (points.length >= 1800) break;
    }
    return points;
  }, [datasetRows, datasetSuggested.profit, datasetSuggested.sales]);

  const employeesHistogram = useMemo(() => {
    const col = datasetSuggested.employees || datasetSuggested.sales || "";
    if (!col) return { col: "", data: [] };
    const values = datasetRows.map((row) => toNumber(row?.[col])).filter((v) => v != null);
    return { col, data: buildHistogram(values, 12) };
  }, [datasetRows, datasetSuggested.employees, datasetSuggested.sales]);

  const globalRows = useMemo(() => (Array.isArray(globalFile?.rows) ? globalFile.rows : []), [globalFile]);
  const globalColumns = useMemo(() => (Array.isArray(globalFile?.columns) ? globalFile.columns : []), [globalFile]);
  const globalTypes = useMemo(() => inferColumnTypes(globalRows, globalColumns), [globalColumns, globalRows]);
  const globalSuggested = useMemo(() => {
    const sales = pickByName(globalTypes.numeric, ["sales", "revenue", "turnover", "amount"]);
    const profit = pickByName(globalTypes.numeric, ["profit", "margin", "income"]);
    const employees = pickByName(globalTypes.numeric, ["employees", "employee", "headcount", "staff"]);
    const sectorCol = pickByName(globalTypes.categorical, ["sector", "industry", "category", "type"]);
    const regionCol = pickByName(globalTypes.categorical, ["region", "location", "state", "country", "area"]);
    return { sales, profit, employees, sectorCol, regionCol };
  }, [globalTypes.categorical, globalTypes.numeric]);
  const globalKpis = useMemo(() => {
    const totalRecords = globalRows.length;
    const avgSales = globalSuggested.sales ? numericStats(globalRows, globalSuggested.sales).mean : null;
    const totalProfit = globalSuggested.profit
      ? globalRows.reduce((sum, row) => {
        const v = toNumber(row?.[globalSuggested.profit]);
        return v == null ? sum : sum + v;
      }, 0)
      : null;
    return { totalRecords, avgSales, totalProfit };
  }, [globalRows, globalSuggested.profit, globalSuggested.sales]);
  const globalSectorSales = useMemo(() => {
    if (!globalSuggested.sectorCol || !globalSuggested.sales) return [];
    return aggregateNumericByCategory(globalRows, globalSuggested.sectorCol, globalSuggested.sales, "sum", 10)
      .map((item, idx) => ({ ...item, fill: palette(idx) }));
  }, [globalRows, globalSuggested.sales, globalSuggested.sectorCol]);
  const globalRegionDist = useMemo(() => {
    const col = globalSuggested.regionCol || globalSuggested.sectorCol;
    return countByCategory(globalRows, col, 10).map((item, idx) => ({ ...item, fill: palette(idx) }));
  }, [globalRows, globalSuggested.regionCol, globalSuggested.sectorCol]);
  const globalScatter = useMemo(() => {
    if (!globalSuggested.sales || !globalSuggested.profit) return [];
    const points = [];
    for (const row of globalRows) {
      const x = toNumber(row?.[globalSuggested.sales]);
      const y = toNumber(row?.[globalSuggested.profit]);
      if (x == null || y == null) continue;
      points.push({ x, y });
      if (points.length >= 2000) break;
    }
    return points;
  }, [globalRows, globalSuggested.profit, globalSuggested.sales]);

  const globalWave = useMemo(() => {
    const dateCol = (globalTypes.datetime && globalTypes.datetime.length)
      ? globalTypes.datetime[0]
      : pickByName(globalColumns, ["date", "time", "timestamp", "created", "updated"]);
    const valueCol = globalSuggested.sales || globalSuggested.profit || globalSuggested.employees || (globalTypes.numeric?.[0] || "");
    const data = buildMonthlyWaveSeries(globalRows, dateCol, valueCol);
    return { dateCol, valueCol, data };
  }, [globalColumns, globalRows, globalSuggested.employees, globalSuggested.profit, globalSuggested.sales, globalTypes.datetime, globalTypes.numeric]);

  const datasetNumericCandidates = useMemo(() => {
    return datasetTypes.numeric
      .map((col) => {
        const stats = numericStats(datasetRows, col);
        const uniq = uniqueCount(datasetRows, col, 2000);
        const spread = stats.max != null && stats.min != null ? Math.abs(stats.max - stats.min) : 0;
        return { col, stats, uniq, spread };
      })
      .filter((item) => item.stats.count >= 8)
      .sort((a, b) => (b.spread - a.spread) || (b.uniq - a.uniq));
  }, [datasetRows, datasetTypes.numeric]);

  const datasetTopNumeric = useMemo(() => datasetNumericCandidates.slice(0, 3), [datasetNumericCandidates]);

  const datasetCategoricalCandidates = useMemo(() => {
    return datasetTypes.categorical
      .map((col) => ({ col, uniq: uniqueCount(datasetRows, col, 5000) }))
      .filter((item) => item.uniq >= 2)
      .sort((a, b) => {
        const score = (x) => {
          if (x.uniq <= 12) return 200 - x.uniq;
          if (x.uniq <= 50) return 160 - x.uniq;
          return 50 - Math.min(x.uniq, 250) * 0.1;
        };
        return score(b) - score(a);
      });
  }, [datasetRows, datasetTypes.categorical]);

  const datasetTopCategorical = useMemo(() => datasetCategoricalCandidates.slice(0, 2).map((item) => item.col), [datasetCategoricalCandidates]);
  const datasetDateColumn = useMemo(() => datasetTypes.datetime[0] || "", [datasetTypes.datetime]);

  const datasetWave = useMemo(() => {
    const dateCol = datasetDateColumn;
    const valueCol = datasetSuggested.sales || datasetSuggested.profit || datasetSuggested.employees || "";
    const data = buildMonthlyWaveSeries(datasetRows, dateCol, valueCol);
    return { dateCol, valueCol, data };
  }, [datasetDateColumn, datasetRows, datasetSuggested.employees, datasetSuggested.profit, datasetSuggested.sales]);

  const datasetBestCorrelation = useMemo(() => {
    const cols = datasetTypes.numeric.slice(0, 8);
    let best = null;
    for (let i = 0; i < cols.length; i += 1) {
      for (let j = i + 1; j < cols.length; j += 1) {
        const a = cols[i];
        const b = cols[j];
        const xs = [];
        const ys = [];
        for (const row of datasetRows) {
          const x = toNumber(row?.[a]);
          const y = toNumber(row?.[b]);
          if (x == null || y == null) continue;
          xs.push(x);
          ys.push(y);
          if (xs.length >= 1200) break;
        }
        const r = pearsonCorrelation(xs, ys);
        if (r == null) continue;
        const abs = Math.abs(r);
        if (!best || abs > best.abs) {
          best = { a, b, r, abs };
        }
      }
    }
    return best;
  }, [datasetRows, datasetTypes.numeric]);

  const datasetCorrelationScatter = useMemo(() => {
    if (!datasetBestCorrelation) return [];
    const pts = [];
    for (const row of datasetRows) {
      const x = toNumber(row?.[datasetBestCorrelation.a]);
      const y = toNumber(row?.[datasetBestCorrelation.b]);
      if (x == null || y == null) continue;
      pts.push({ x, y });
      if (pts.length >= 1200) break;
    }
    return pts;
  }, [datasetBestCorrelation, datasetRows]);

  const datasetTimeCountSeries = useMemo(() => {
    if (!datasetDateColumn) return [];
    const map = new Map();
    for (const row of datasetRows) {
      const date = toDate(row?.[datasetDateColumn]);
      if (!date) continue;
      const key = date.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-120);
  }, [datasetRows, datasetDateColumn]);

  const sectorOptions = useMemo(() => ["all", ...new Set(rows.map((row) => row.sector_name).filter(Boolean))], [rows]);
  const productOptions = useMemo(() => ["all", ...new Set(rows.map((row) => row.product_name).filter(Boolean))], [rows]);

  const filtered = useMemo(() => rows.filter((row) => {
    if (sector !== "all" && row.sector_name !== sector) return false;
    if (product !== "all" && row.product_name !== product) return false;
    if (pipeline === "cleaned" && !row.has_cleaned_data) return false;
    if (pipeline === "pending" && row.has_cleaned_data) return false;
    if (quality !== "all" && qualityBand(row.quality_score) !== quality) return false;
    return true;
  }), [pipeline, product, quality, rows, sector]);

  const data = useMemo(() => {
    const totalRows = filtered.reduce((sum, row) => sum + row.row_count, 0);
    const totalDatasets = filtered.length;
    const avgQuality = totalDatasets ? Math.round((filtered.reduce((sum, row) => sum + row.quality_score, 0) / totalDatasets) * 100) : 0;
    const cleanedCoverage = totalDatasets ? Math.round((filtered.filter((row) => row.has_cleaned_data).length / totalDatasets) * 100) : 0;
    const trendMap = new Map();
    const groupMap = new Map();

    filtered.forEach((row) => {
      const key = bucket(row.time_reference, granularity);
      const t = trendMap.get(key) || { bucket: key, row_count: 0, dataset_count: 0, qualityTotal: 0 };
      t.row_count += row.row_count;
      t.dataset_count += 1;
      t.qualityTotal += row.quality_score * 100;
      trendMap.set(key, t);

      const gk = groupBy === "status" ? row.status : row[groupBy] || "Unknown";
      const g = groupMap.get(gk) || { name: gk, row_count: 0, dataset_count: 0, qualityTotal: 0, cleanedRows: 0, pendingRows: 0 };
      g.row_count += row.row_count;
      g.dataset_count += 1;
      g.qualityTotal += row.quality_score * 100;
      if (row.has_cleaned_data) g.cleanedRows += row.row_count; else g.pendingRows += row.row_count;
      groupMap.set(gk, g);
    });

    const trend = Array.from(trendMap.values()).map((item) => ({
      ...item,
      quality: item.dataset_count ? Math.round(item.qualityTotal / item.dataset_count) : 0,
      metricValue: metric === "row_count" ? item.row_count : metric === "dataset_count" ? item.dataset_count : item.dataset_count ? Math.round(item.qualityTotal / item.dataset_count) : 0,
    }));

    const groups = Array.from(groupMap.values()).map((item) => ({
      ...item,
      quality: item.dataset_count ? Math.round(item.qualityTotal / item.dataset_count) : 0,
    }));

    const qualityMix = [
      { name: "High", value: filtered.filter((row) => qualityBand(row.quality_score) === "High").length, fill: C.tertiary },
      { name: "Medium", value: filtered.filter((row) => qualityBand(row.quality_score) === "Medium").length, fill: C.warning },
      { name: "Low", value: filtered.filter((row) => qualityBand(row.quality_score) === "Low").length, fill: C.danger },
    ];

    const ranked = groups
      .map((item, index) => ({
        ...item,
        metricValue: rankMetric === "row_count" ? item.row_count : rankMetric === "dataset_count" ? item.dataset_count : item.quality,
        fill: palette(index),
      }))
      .sort((a, b) => b.metricValue - a.metricValue)
      .slice(0, 6);

    const scatter = filtered.map((row) => ({
      x: row.row_count,
      y: Math.round(row.quality_score * 100),
      fill: scatterColorBy === "status" ? (row.status === "Cleaned" ? C.primary : C.danger) : scatterColorBy === "sector" ? palette(sectorOptions.indexOf(row.sector_name)) : palette(productOptions.indexOf(row.product_name)),
    }));

    const buckets = Array.from(new Set(trend.map((item) => item.bucket)));
    const products = Array.from(new Set(filtered.map((row) => row.product_name))).slice(0, 6);
    const matrix = products.map((name) => ({
      name,
      cells: buckets.map((item) => {
        const slice = filtered.filter((row) => row.product_name === name && bucket(row.time_reference, granularity) === item);
        const value = matrixMetric === "quality"
          ? Math.round((slice.reduce((sum, row) => sum + row.quality_score, 0) / Math.max(slice.length, 1)) * 100)
          : slice.reduce((sum, row) => sum + row.row_count, 0);
        return { item, value };
      }),
    }));
    const matrixMax = Math.max(1, ...matrix.flatMap((row) => row.cells.map((cell) => cell.value)));

    return { totalRows, totalDatasets, avgQuality, cleanedCoverage, trend, groups, qualityMix, ranked, scatter, matrix, buckets, matrixMax };
  }, [filtered, granularity, groupBy, matrixMetric, metric, productOptions, rankMetric, scatterColorBy, sectorOptions]);

  if (fileKey || cleanedDataId) {
    if (datasetLoading) {
      return <div className="flex min-h-[60vh] items-center justify-center text-theme-muted"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading cleaned dataset...</div>;
    }

    if (datasetError) {
      return (
        <div className="space-y-4">
          <section className="rounded-[30px] border border-theme-light bg-theme-card p-6 shadow-theme">
            <p className="text-sm font-semibold text-theme-primary">Unable to load cleaned dataset</p>
            <p className="mt-2 text-sm text-theme-muted">{datasetError}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate("/cleaning")}
                className="rounded-full border border-theme-light bg-theme-secondary px-4 py-2 text-xs font-semibold text-theme-primary hover:bg-theme-tertiary"
              >
                Back to Cleaning
              </button>
              <button
                type="button"
                onClick={() => navigate("/visualizations")}
                className="rounded-full px-4 py-2 text-xs font-semibold text-theme-inverse accent-primary hover:accent-hover"
              >
                Choose Dataset
              </button>
              <button
                type="button"
                onClick={() => navigate("/visualizations?studio=1")}
                className="rounded-full border border-theme-light bg-theme-secondary px-4 py-2 text-xs font-semibold text-theme-primary hover:bg-theme-tertiary"
              >
                Open Chart Studio
              </button>
            </div>
          </section>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[34px] border border-theme-light bg-theme-card shadow-theme">
          <div className="relative px-6 py-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.12),transparent_28%)]" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-theme-secondary">
                  <Package2 className="h-3.5 w-3.5" />
                  Dataset Patterns
                </div>
                <h1 className="mt-4 text-3xl font-semibold text-theme-primary md:text-4xl">
                  Visual patterns for {datasetFile?.filename ? datasetFile.filename : "cleaned dataset"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-theme-muted md:text-base">
                  Auto-generated distributions, missingness, category mix, and optional time trends from your cleaned dataset preview. Showing {datasetFile?.previewRows ?? datasetRows.length} rows (of {datasetFile?.totalRows ?? datasetRows.length}) for performance.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/cleaning")}
                  className="rounded-full border border-theme-light bg-theme-secondary px-4 py-2 text-xs font-semibold text-theme-primary hover:bg-theme-tertiary"
                >
                  Back to Cleaning
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/visualizations")}
                  className="rounded-full px-4 py-2 text-xs font-semibold text-theme-inverse accent-primary hover:accent-hover"
                >
                  Choose Dataset
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/visualizations?studio=1")}
                  className="rounded-full border border-theme-light bg-theme-secondary px-4 py-2 text-xs font-semibold text-theme-primary hover:bg-theme-tertiary"
                >
                  Open Chart Studio
                </button>
                {fileKey ? (
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        sessionStorage.removeItem(fileKey);
                      } catch (err) {
                        console.warn("Failed to clear visualization file:", err);
                      }
                      navigate("/visualizations");
                    }}
                    className="rounded-full border border-theme-light bg-theme-secondary px-4 py-2 text-xs font-semibold text-theme-primary hover:bg-theme-tertiary"
                  >
                    Clear File
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat label="Rows" value={(datasetKpis.totalRecords ?? datasetRows.length).toLocaleString()} hint="Total cleaned rows" icon={Layers3} />
          <Stat label="Columns" value={(datasetColumns.length).toLocaleString()} hint="Detected columns" icon={BarChart3} />
          <Stat label="Preview Rows" value={(datasetRows.length).toLocaleString()} hint="Used for charts" icon={Sparkles} />
          <Stat label="Avg Missing" value={`${datasetOverallMissingPct}%`} hint={`Duplicates ${datasetDuplicateCount.toLocaleString()}`} icon={Filter} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat label="Data Quality" value={`${datasetKpis.qualityPct}%`} hint="Quality score or missingness estimate" icon={Sparkles} />
          <Stat
            label={datasetSuggested.sales ? `Avg ${datasetSuggested.sales}` : "Avg Sales"}
            value={datasetKpis.avgSales != null && Number.isFinite(datasetKpis.avgSales) ? Math.round(datasetKpis.avgSales * 100) / 100 : "-"}
            hint="Mean over preview rows"
            icon={BarChart3}
          />
          <Stat
            label={datasetSuggested.profit ? `Total ${datasetSuggested.profit}` : "Total Profit"}
            value={datasetKpis.totalProfit != null && Number.isFinite(datasetKpis.totalProfit) ? Math.round(datasetKpis.totalProfit * 100) / 100 : "-"}
            hint="Sum over preview rows"
            icon={Layers3}
          />
          <Stat label="Duplicates" value={datasetDuplicateCount.toLocaleString()} hint="Exact duplicates in preview" icon={Filter} />
        </div>

        <Card
          title="Smart Business Patterns"
          subtitle="Charts are auto-selected from real dataset columns (sector/region/sales/profit/employees). Missing columns are skipped."
          action={<div className="inline-flex items-center gap-2 rounded-full border border-theme-light bg-theme-secondary px-3 py-2 text-xs font-semibold text-theme-muted"><span>Preview {datasetRows.length.toLocaleString()} rows</span></div>}
        >
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="h-[320px]">
              {sectorSales.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-theme-muted">Sector vs Sales needs a sector column and a sales numeric column.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sectorSales} margin={{ left: 12, right: 12, top: 10, bottom: 6 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--text-muted)" tickLine={false} axisLine={false} interval={0} angle={-14} height={70} textAnchor="end" />
                    <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltip()} />
                    <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                      {sectorSales.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="h-[320px]">
              {regionDistribution.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-theme-muted">Region distribution needs a region (or sector) column.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip contentStyle={chartTooltip()} />
                    <Pie data={regionDistribution} dataKey="value" nameKey="name" outerRadius={110} innerRadius={58}>
                      {regionDistribution.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="h-[320px]">
              {salesProfitScatter.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-theme-muted">Sales vs Profit needs both numeric columns.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ left: 8, right: 8, top: 12, bottom: 4 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.16)" />
                    <XAxis type="number" dataKey="x" stroke="var(--text-muted)" tickLine={false} axisLine={false} name={datasetSuggested.sales || "sales"} />
                    <YAxis type="number" dataKey="y" stroke="var(--text-muted)" tickLine={false} axisLine={false} name={datasetSuggested.profit || "profit"} />
                    <Tooltip contentStyle={chartTooltip()} />
                    <Scatter data={salesProfitScatter} fill={C.primary} />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="h-[320px]">
              {employeesHistogram.data.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-theme-muted">No numeric distribution available.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={employeesHistogram.data} margin={{ left: 12, right: 12, top: 10, bottom: 6 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                    <XAxis dataKey="bucket" stroke="var(--text-muted)" tickLine={false} axisLine={false} interval={0} angle={-14} height={70} textAnchor="end" />
                    <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltip()} />
                    <Bar dataKey="count" fill={C.deep} radius={[12, 12, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </Card>

        <Card
          title="Data Quality Snapshot"
          subtitle="Overall missingness in the preview (filled vs missing cells)."
          action={<div className="inline-flex items-center gap-2 rounded-full border border-theme-light bg-theme-secondary px-3 py-2 text-xs font-semibold text-theme-muted"><span>Missing {datasetCellMissing.missingPct}%</span></div>}
        >
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_1fr]">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip contentStyle={chartTooltip()} />
                  <Pie
                    data={[
                      { name: "Filled", value: Math.max(0, datasetCellMissing.filledPct), fill: C.primary },
                      { name: "Missing", value: Math.max(0, datasetCellMissing.missingPct), fill: C.warning },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={98}
                    innerRadius={56}
                  >
                    <Cell fill={C.primary} />
                    <Cell fill={C.warning} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-theme-light bg-theme-secondary p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-theme-muted">Rows</p>
                <p className="mt-2 text-2xl font-semibold text-theme-primary">{datasetCellMissing.rowCount.toLocaleString()}</p>
              </div>
              <div className="rounded-[22px] border border-theme-light bg-theme-secondary p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-theme-muted">Columns</p>
                <p className="mt-2 text-2xl font-semibold text-theme-primary">{datasetCellMissing.colCount.toLocaleString()}</p>
              </div>
              <div className="rounded-[22px] border border-theme-light bg-theme-secondary p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-theme-muted">Cells</p>
                <p className="mt-2 text-2xl font-semibold text-theme-primary">{datasetCellMissing.totalCells.toLocaleString()}</p>
              </div>
              <div className="rounded-[22px] border border-theme-light bg-theme-secondary p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-theme-muted">Missing Cells</p>
                <p className="mt-2 text-2xl font-semibold text-theme-primary">{datasetCellMissing.missingCells.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card
          title="Dataset Profile"
          subtitle="Detected types, missingness, and uniqueness. This helps explain why certain patterns appear."
          action={<div className="inline-flex items-center gap-2 rounded-full border border-theme-light bg-theme-secondary px-3 py-2 text-xs font-semibold text-theme-muted"><span>Avg missing {datasetOverallMissingPct}%</span></div>}
        >
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-theme-muted">
                  <th className="px-3 py-2">Column</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Missing %</th>
                  <th className="px-3 py-2">Unique</th>
                  <th className="px-3 py-2">Top value</th>
                </tr>
              </thead>
              <tbody>
                {datasetColumns.slice(0, 18).map((col) => {
                  const type = datasetTypes.numeric.includes(col) ? "numeric" : datasetTypes.datetime.includes(col) ? "datetime" : "categorical";
                  const miss = datasetMissing.find((item) => item.name === col)?.missingPercent ?? 0;
                  const uniq = uniqueCount(datasetRows, col, 5000);
                  const top = topValueCounts(datasetRows, col, 1)[0]?.name ?? "-";
                  return (
                    <tr key={col} className="border-t border-theme-light">
                      <td className="px-3 py-2 font-semibold text-theme-primary">{col}</td>
                      <td className="px-3 py-2 text-theme-secondary">{type}</td>
                      <td className="px-3 py-2 text-theme-secondary">{miss}%</td>
                      <td className="px-3 py-2 text-theme-secondary">{uniq.toLocaleString()}</td>
                      <td className="px-3 py-2 text-theme-muted">{String(top).slice(0, 80)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Missingness By Column"
          subtitle="Columns with the highest missing percentage in the cleaned preview."
          action={<div className="inline-flex items-center gap-2 rounded-full border border-theme-light bg-theme-secondary px-3 py-2 text-xs font-semibold text-theme-muted"><span>{datasetRows.length.toLocaleString()} rows sampled</span></div>}
        >
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={datasetMissingTop} margin={{ left: 12, right: 12, top: 10, bottom: 6 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-muted)" tickLine={false} axisLine={false} interval={0} angle={-18} height={70} textAnchor="end" />
              <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={chartTooltip()} />
              <Bar dataKey="missingPercent" fill={C.warning} radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {datasetTopNumeric.length === 0 ? (
            <Card title="Numeric Patterns" subtitle="No numeric columns detected." action={null}>
              <div className="flex h-[260px] items-center justify-center text-sm text-theme-muted">No numeric values available.</div>
            </Card>
          ) : (
            datasetTopNumeric.map(({ col, stats }) => {
              const values = Array.isArray(stats.values) ? stats.values : [];
              const mean = stats.mean;
              const med = median(values);
              const sd = stddev(values, typeof mean === "number" ? mean : null);
              const histogram = buildHistogram(values, 12);
              return (
                <Card
                  key={col}
                  title={`Numeric Distribution: ${col}`}
                  subtitle="Histogram with summary statistics (min, median, mean, max, std)."
                  action={
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">n {stats.count.toLocaleString()}</span>
                      <span className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">min {stats.min ?? "-"}</span>
                      <span className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">median {med == null ? "-" : Math.round(med * 1000) / 1000}</span>
                      <span className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">mean {mean == null ? "-" : mean}</span>
                      <span className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">max {stats.max ?? "-"}</span>
                      <span className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">std {sd == null ? "-" : Math.round(sd * 1000) / 1000}</span>
                    </div>
                  }
                >
                  {histogram.length === 0 ? (
                    <div className="flex h-[320px] items-center justify-center text-sm text-theme-muted">Not enough values to chart.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={histogram} margin={{ left: 10, right: 10, top: 12, bottom: 12 }}>
                        <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                        <XAxis dataKey="bucket" stroke="var(--text-muted)" tickLine={false} axisLine={false} interval={1} />
                        <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={chartTooltip()} />
                        <Bar dataKey="count" fill={C.primary} radius={[10, 10, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              );
            })
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {datasetTopCategorical.length === 0 ? (
            <Card title="Category Patterns" subtitle="No categorical columns detected." action={null}>
              <div className="flex h-[260px] items-center justify-center text-sm text-theme-muted">No categorical values available.</div>
            </Card>
          ) : (
            datasetTopCategorical.map((col, idx) => {
              const top = topValueCounts(datasetRows, col, 10);
              const other = Math.max(0, datasetRows.length - top.reduce((s, r) => s + r.count, 0));
              const pieData = [...top.map((t, i) => ({ name: t.name, value: t.count, fill: palette(i) }))];
              if (other > 0) pieData.push({ name: "Other", value: other, fill: "rgba(148,163,184,0.55)" });
              return (
                <Card
                  key={col}
                  title={`Top Categories: ${col}`}
                  subtitle="Most frequent values (top 10) plus an 'Other' group."
                  action={<span className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">unique {uniqueCount(datasetRows, col, 5000).toLocaleString()}</span>}
                >
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={top} margin={{ left: 18, right: 10, top: 10, bottom: 10 }}>
                          <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                          <XAxis type="number" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                          <YAxis dataKey="name" type="category" width={160} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={chartTooltip()} />
                          <Bar dataKey="count" fill={idx === 0 ? C.secondary : C.tertiary} radius={[0, 12, 12, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip contentStyle={chartTooltip()} />
                          <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={110} innerRadius={58}>
                            {pieData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <Card
          title="Growth Wave"
          subtitle="Monthly growth curve for the best-guess business metric (sales/profit/employees)."
          action={<span className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">{datasetWave.valueCol ? datasetWave.valueCol : "metric"}</span>}
        >
          {datasetWave.data.length < 3 ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-theme-muted">Needs a datetime column and a numeric metric to compute growth.</div>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={datasetWave.data} margin={{ left: 12, right: 12, top: 10, bottom: 6 }}>
                  <defs>
                    <linearGradient id="datasetWaveFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.tertiary} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={C.tertiary} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                  <XAxis dataKey="bucket" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={chartTooltip()} />
                  <Area type="monotone" dataKey="value" stroke={C.tertiary} fill="url(#datasetWaveFill)" strokeWidth={2.4} />
                  <Line type="natural" dataKey="ma" stroke={C.deep} strokeWidth={2.6} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-2 text-xs text-theme-muted">Using {datasetWave.dateCol ? datasetWave.dateCol : "datetime"} for time buckets.</p>
        </Card>

        {datasetBestCorrelation ? (
          <Card
            title={`Strongest Relationship: ${datasetBestCorrelation.a} vs ${datasetBestCorrelation.b}`}
            subtitle="Correlation is computed from rows where both values exist (numeric-only)."
            action={<span className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">r {Math.round(datasetBestCorrelation.r * 1000) / 1000}</span>}
          >
            {datasetCorrelationScatter.length === 0 ? (
              <div className="flex h-[340px] items-center justify-center text-sm text-theme-muted">Not enough paired values to chart.</div>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <ScatterChart margin={{ left: 8, right: 8, top: 12, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.16)" />
                  <XAxis type="number" dataKey="x" stroke="var(--text-muted)" tickLine={false} axisLine={false} name={datasetBestCorrelation.a} />
                  <YAxis type="number" dataKey="y" stroke="var(--text-muted)" tickLine={false} axisLine={false} name={datasetBestCorrelation.b} />
                  <Tooltip contentStyle={chartTooltip()} />
                  <Scatter data={datasetCorrelationScatter} fill={C.primary} />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </Card>
        ) : null}

        {datasetDateColumn ? (
          <Card
            title={`Activity Over Time: ${datasetDateColumn}`}
            subtitle="Row counts per day (last 120 buckets)."
            action={<span className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">{datasetTimeCountSeries.length} points</span>}
          >
            {datasetTimeCountSeries.length === 0 ? (
              <div className="flex h-[320px] items-center justify-center text-sm text-theme-muted">No valid dates found.</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={datasetTimeCountSeries} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={chartTooltip()} />
                  <Line type="monotone" dataKey="count" stroke={C.deep} strokeWidth={2.6} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        ) : null}
      </div>
    );
  }

  if (studioError) {
    return (
      <div className="space-y-6">
        <section className="rounded-[30px] border border-theme-light bg-theme-card p-6 shadow-theme">
          <p className="text-sm font-semibold text-theme-primary">Chart Studio Error</p>
          <p className="mt-2 text-sm text-theme-muted">{studioError}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("/visualizations")}
              className="rounded-full px-4 py-2 text-xs font-semibold text-theme-inverse accent-primary hover:accent-hover"
            >
              Back to Datasets
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-theme-muted"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading visualization data...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[34px] border border-theme-light bg-theme-card shadow-theme">
        <div className="relative px-6 py-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_28%)]" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-theme-secondary"><Sparkles className="h-3.5 w-3.5" />Chart Studio</div>
              <h1 className="mt-4 text-3xl font-semibold text-theme-primary md:text-4xl">Customizable Modern Visualizations</h1>
              <p className="mt-2 text-sm leading-6 text-theme-muted md:text-base">PowerBI-style overview by default. The visuals below are generated from real SQLite data and update automatically.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:w-[560px]">
              <SelectChip label="Scope By" value={groupBy} onChange={setGroupBy} options={GROUPS} />
              <SelectChip label="Time Grain" value={granularity} onChange={setGranularity} options={GRAINS} />
              <SelectChip label="Metric" value={metric} onChange={setMetric} options={METRICS} />
              <div className="flex items-center gap-2 rounded-full border border-theme-light bg-theme-secondary px-3 py-2 text-xs font-semibold text-theme-muted"><SlidersHorizontal className="h-3.5 w-3.5" /><span>Studio controls active</span></div>
            </div>
          </div>
          <div className="relative mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SelectChip label="Sector" value={sector} onChange={setSector} options={sectorOptions} />
            <SelectChip label="Product" value={product} onChange={setProduct} options={productOptions} />
            <SelectChip label="Pipeline" value={pipeline} onChange={setPipeline} options={["all", "cleaned", "pending"]} />
            <SelectChip label="Quality" value={quality} onChange={setQuality} options={["all", "High", "Medium", "Low"]} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Datasets In View" value={data.totalDatasets} hint="Current scoped workspace" icon={Layers3} />
        <Stat label="Rows Aggregated" value={data.totalRows.toLocaleString()} hint="Volume under current scope" icon={BarChart3} />
        <Stat label="Average Quality" value={`${data.avgQuality}%`} hint="Average quality in scope" icon={Sparkles} />
        <Stat label="Cleaned Coverage" value={`${data.cleanedCoverage}%`} hint="Pipeline completion ratio" icon={Filter} />
      </div>

      <Card
        title="PowerBI Overview (Cleaned Data Preview)"
        subtitle="Merged preview from recent cleaned datasets in SQLite (auto-detected columns and charts)."
        action={<div className="inline-flex items-center gap-2 rounded-full border border-theme-light bg-theme-secondary px-3 py-2 text-xs font-semibold text-theme-muted"><span>{globalLoading ? "Loading..." : `${globalRows.length.toLocaleString()} rows`}</span></div>}
      >
        {globalError ? (
          <div className="text-sm text-rose-700">{globalError}</div>
        ) : globalLoading ? (
          <div className="flex h-[220px] items-center justify-center text-theme-muted"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading cleaned dataset previews...</div>
        ) : globalRows.length === 0 ? (
          <div className="text-sm text-theme-muted">No cleaned rows available yet. Run cleaning to generate cleaned datasets, then return here.</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Stat label="Total Records" value={globalKpis.totalRecords.toLocaleString()} hint="Merged preview rows" icon={Layers3} />
              <Stat label={globalSuggested.sales ? `Avg ${globalSuggested.sales}` : "Avg Sales"} value={globalKpis.avgSales != null ? Math.round(globalKpis.avgSales * 100) / 100 : "-"} hint="Mean over preview" icon={BarChart3} />
              <Stat label={globalSuggested.profit ? `Total ${globalSuggested.profit}` : "Total Profit"} value={globalKpis.totalProfit != null ? Math.round(globalKpis.totalProfit * 100) / 100 : "-"} hint="Sum over preview" icon={Sparkles} />
              <Stat label="Columns" value={globalColumns.length.toLocaleString()} hint="Detected columns" icon={Filter} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="h-[320px] xl:col-span-2">
                {globalWave.data.length < 3 ? (
                  <div className="flex h-full items-center justify-center text-sm text-theme-muted">Growth Wave needs a datetime column and at least one numeric column.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={globalWave.data} margin={{ left: 12, right: 12, top: 10, bottom: 6 }}>
                      <defs>
                        <linearGradient id="waveFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.primary} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={C.primary} stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                      <XAxis dataKey="bucket" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={chartTooltip()} />
                      <Area type="monotone" dataKey="value" stroke={C.primary} fill="url(#waveFill)" strokeWidth={2.4} />
                      <Line type="natural" dataKey="ma" stroke={C.deep} strokeWidth={2.6} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
                <p className="mt-2 text-xs text-theme-muted">
                  Growth Wave: {globalWave.valueCol ? globalWave.valueCol : "numeric"} over time{globalWave.dateCol ? ` (${globalWave.dateCol})` : ""}.
                </p>
              </div>

              <div className="h-[320px]">
                {globalSectorSales.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-theme-muted">No sector and sales numeric columns found.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={globalSectorSales} margin={{ left: 12, right: 12, top: 10, bottom: 6 }}>
                      <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--text-muted)" tickLine={false} axisLine={false} interval={0} angle={-14} height={70} textAnchor="end" />
                      <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={chartTooltip()} />
                      <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                        {globalSectorSales.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="h-[320px]">
                {globalRegionDist.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-theme-muted">No region/sector distribution to plot.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip contentStyle={chartTooltip()} />
                      <Pie data={globalRegionDist} dataKey="value" nameKey="name" outerRadius={110} innerRadius={58}>
                        {globalRegionDist.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="h-[320px] xl:col-span-2">
                {globalScatter.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-theme-muted">Sales vs Profit needs both numeric columns.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ left: 8, right: 8, top: 12, bottom: 4 }}>
                      <CartesianGrid stroke="rgba(148,163,184,0.16)" />
                      <XAxis type="number" dataKey="x" stroke="var(--text-muted)" tickLine={false} axisLine={false} name={globalSuggested.sales || "sales"} />
                      <YAxis type="number" dataKey="y" stroke="var(--text-muted)" tickLine={false} axisLine={false} name={globalSuggested.profit || "profit"} />
                      <Tooltip contentStyle={chartTooltip()} />
                      <Scatter data={globalScatter} fill={C.primary} />
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {cleanedListLoading ? null : cleanedListError ? (
              <div className="text-xs text-rose-700">{cleanedListError}</div>
            ) : cleanedList.length ? (
              <div className="rounded-[24px] border border-theme-light bg-theme-secondary p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-theme-muted">Drill Down</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {cleanedList.slice(0, 10).map((item) => (
                    <button
                      key={item.cleaned_data_id}
                      type="button"
                      onClick={() => navigate(`/visualizations?cleanedDataId=${encodeURIComponent(String(item.cleaned_data_id))}`)}
                      className="rounded-full border border-theme-light bg-white px-3 py-1.5 text-xs font-semibold text-theme-primary hover:bg-theme-tertiary"
                    >
                      Dataset {item.cleaned_data_id}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_0.95fr]">
        <Card title="Trend Explorer" subtitle="Wave-style growth view (switch area/line/bar for the same series)." action={<Tabs value={trendStyle} onChange={setTrendStyle} options={[{ value: "area", label: "Area" }, { value: "line", label: "Line" }, { value: "bar", label: "Bar" }]} />}>
          <ResponsiveContainer width="100%" height={360}>
            {trendStyle === "area" ? (
              <AreaChart data={data.trend}>
                <defs><linearGradient id="vf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.primary} stopOpacity={0.42} /><stop offset="95%" stopColor={C.primary} stopOpacity={0.04} /></linearGradient></defs>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                <XAxis dataKey="bucket" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltip()} />
                <Area type="natural" dataKey="metricValue" stroke={C.primary} fill="url(#vf)" strokeWidth={3} />
                <Line type="natural" dataKey="quality" stroke={C.secondary} strokeWidth={2.2} dot={false} />
              </AreaChart>
            ) : trendStyle === "line" ? (
              <LineChart data={data.trend}>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                <XAxis dataKey="bucket" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltip()} />
                <Line type="natural" dataKey="metricValue" stroke={C.primary} strokeWidth={3} dot={{ r: 3 }} />
                <Line type="natural" dataKey="quality" stroke={C.secondary} strokeWidth={2.2} dot={false} />
              </LineChart>
            ) : (
              <BarChart data={data.trend}>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                <XAxis dataKey="bucket" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltip()} />
                <Bar dataKey="metricValue" fill={C.primary} radius={[10, 10, 0, 0]} />
                <Bar dataKey="quality" fill={C.secondary} radius={[10, 10, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </Card>

        <Card title="Distribution Studio" subtitle="Toggle the quality distribution between donut and bars." action={<Tabs value={distributionStyle} onChange={setDistributionStyle} options={[{ value: "donut", label: "Donut" }, { value: "bars", label: "Bars" }]} />}>
          <ResponsiveContainer width="100%" height={360}>
            {distributionStyle === "donut" ? (
              <PieChart>
                <Pie data={data.qualityMix} dataKey="value" nameKey="name" innerRadius={74} outerRadius={122} paddingAngle={4}>
                  {data.qualityMix.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltip()} />
              </PieChart>
            ) : (
              <BarChart data={data.qualityMix} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" horizontal={false} />
                <XAxis type="number" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltip()} />
                <Bar dataKey="value" radius={[0, 10, 10, 0]}>{data.qualityMix.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}</Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_1.1fr]">
        <Card title="Comparison Builder" subtitle="This chart has its own style mode separate from page filters." action={<Tabs value={compareStyle} onChange={setCompareStyle} options={[{ value: "stacked", label: "Stacked" }, { value: "quality", label: "Quality" }, { value: "mixed", label: "Mixed" }]} />}>
          <ResponsiveContainer width="100%" height={360}>
            {compareStyle === "stacked" ? (
              <BarChart data={data.groups.slice(0, 8)}>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltip()} />
                <Bar dataKey="cleanedRows" stackId="a" fill={C.primary} radius={[8, 8, 0, 0]} />
                <Bar dataKey="pendingRows" stackId="a" fill={C.warning} radius={[8, 8, 0, 0]} />
              </BarChart>
            ) : compareStyle === "quality" ? (
              <BarChart data={data.groups.slice(0, 8)} layout="vertical" margin={{ left: 18 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis dataKey="name" width={120} type="category" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltip()} />
                <Bar dataKey="quality" fill={C.secondary} radius={[0, 10, 10, 0]} />
              </BarChart>
            ) : (
              <ComposedChart data={data.groups.slice(0, 8)}>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltip()} />
                <Bar yAxisId="left" dataKey="row_count" fill={C.primary} radius={[8, 8, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="quality" stroke={C.secondary} strokeWidth={2.4} />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </Card>

        <Card title="Scatter Lab" subtitle="This graph can recolor by status, sector, or product." action={<SelectChip label="Color By" value={scatterColorBy} onChange={setScatterColorBy} options={[{ value: "status", label: "Status" }, { value: "sector", label: "Sector" }, { value: "product", label: "Product" }]} />}>
          <ResponsiveContainer width="100%" height={360}>
            <ScatterChart margin={{ left: 8, right: 8, top: 12, bottom: 4 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.16)" />
              <XAxis type="number" dataKey="x" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
              <YAxis type="number" dataKey="y" domain={[50, 100]} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={chartTooltip()} />
              <Scatter data={data.scatter}>{data.scatter.map((point, index) => <Cell key={index} fill={point.fill} />)}</Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.25fr]">
        <Card title="Top Performer Ranking" subtitle="Choose what the leaderboard ranks by." action={<SelectChip label="Rank By" value={rankMetric} onChange={setRankMetric} options={METRICS} />}>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={data.ranked} layout="vertical" margin={{ left: 18 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.16)" horizontal={false} />
              <XAxis type="number" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
              <YAxis dataKey="name" width={120} type="category" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={chartTooltip()} />
              <Bar dataKey="metricValue" radius={[0, 12, 12, 0]}>{data.ranked.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Product-Time Matrix" subtitle="A heatmap-style chart for product-wise monthly or quarterly intensity." action={<SelectChip label="Cell Metric" value={matrixMetric} onChange={setMatrixMetric} options={[{ value: "quality", label: "Quality" }, { value: "row_count", label: "Rows" }]} />}>
          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              <div className="mb-3 grid gap-2" style={{ gridTemplateColumns: `180px repeat(${Math.max(data.buckets.length, 1)}, minmax(82px, 1fr))` }}>
                <div className="px-3 text-xs font-semibold uppercase tracking-[0.18em] text-theme-muted">Product</div>
                {data.buckets.map((item) => <div key={item} className="px-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-theme-muted">{item}</div>)}
              </div>
              <div className="space-y-2">
                {data.matrix.map((row) => (
                  <div key={row.name} className="grid gap-2" style={{ gridTemplateColumns: `180px repeat(${Math.max(data.buckets.length, 1)}, minmax(82px, 1fr))` }}>
                    <div className="flex items-center rounded-2xl border border-theme-light bg-theme-secondary px-3 py-3 text-sm font-semibold text-theme-primary">{row.name}</div>
                    {row.cells.map((cell, index) => {
                      const intensity = Math.max(0.08, cell.value / data.matrixMax);
                      const background = matrixMetric === "quality" ? `rgba(20, 184, 166, ${Math.min(0.9, intensity)})` : `rgba(14, 165, 233, ${Math.min(0.9, intensity)})`;
                      return <div key={`${row.name}_${index}`} className="flex h-[58px] items-center justify-center rounded-2xl border border-theme-light text-sm font-semibold" style={{ background, color: intensity > 0.45 ? "#fff" : "var(--text-primary)" }}>{cell.value}</div>;
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Filter, Layers3, Loader2, Package2, SlidersHorizontal, Sparkles } from "lucide-react";
import { getVisualizationData } from "../services/api";

const C = { primary: "#14b8a6", secondary: "#0ea5e9", tertiary: "#22c55e", warning: "#f59e0b", danger: "#ef4444", deep: "#0f766e" };
const FALLBACK = [
  { id: 1, sector_name: "Sales", product_name: "Product A", row_count: 12200, uploaded_at: "2026-01-05T10:00:00", quality_score: 0.82, has_cleaned_data: true },
  { id: 2, sector_name: "Marketing", product_name: "Campaign X", row_count: 8400, uploaded_at: "2026-01-08T08:10:00", quality_score: 0.75, has_cleaned_data: false },
  { id: 3, sector_name: "Operations", product_name: "Service Ops", row_count: 18900, uploaded_at: "2026-01-12T12:30:00", quality_score: 0.91, has_cleaned_data: true },
  { id: 4, sector_name: "Sales", product_name: "Product B", row_count: 10200, uploaded_at: "2026-02-01T08:20:00", quality_score: 0.88, has_cleaned_data: true },
  { id: 5, sector_name: "Support", product_name: "Tickets", row_count: 5300, uploaded_at: "2026-02-02T11:40:00", quality_score: 0.69, has_cleaned_data: false },
  { id: 6, sector_name: "Operations", product_name: "Warehouse", row_count: 17600, uploaded_at: "2026-02-08T13:00:00", quality_score: 0.86, has_cleaned_data: true },
  { id: 7, sector_name: "Finance", product_name: "Ledger", row_count: 9600, uploaded_at: "2026-03-01T10:20:00", quality_score: 0.8, has_cleaned_data: true },
  { id: 8, sector_name: "Sales", product_name: "Product A", row_count: 14800, uploaded_at: "2026-03-04T15:00:00", quality_score: 0.93, has_cleaned_data: true },
];

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
  const [isLoading, setIsLoading] = useState(true);
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
      setIsLoading(true);
      try {
        const response = await getVisualizationData();
        const data = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : FALLBACK;
        if (mounted) setRows(normalize(data.length ? data : FALLBACK));
      } catch {
        if (mounted) setRows(normalize(FALLBACK));
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

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
              <p className="mt-2 text-sm leading-6 text-theme-muted md:text-base">Global scope filters control the dataset set. Each chart below has its own display mode, so customization is not limited to simple filters.</p>
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_0.95fr]">
        <Card title="Trend Explorer" subtitle="Change the chart style for the same monthly or quarterly series." action={<Tabs value={trendStyle} onChange={setTrendStyle} options={[{ value: "area", label: "Area" }, { value: "line", label: "Line" }, { value: "bar", label: "Bar" }]} />}>
          <ResponsiveContainer width="100%" height={360}>
            {trendStyle === "area" ? (
              <AreaChart data={data.trend}>
                <defs><linearGradient id="vf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.primary} stopOpacity={0.42} /><stop offset="95%" stopColor={C.primary} stopOpacity={0.04} /></linearGradient></defs>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                <XAxis dataKey="bucket" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltip()} />
                <Area type="monotone" dataKey="metricValue" stroke={C.primary} fill="url(#vf)" strokeWidth={3} />
                <Line type="monotone" dataKey="quality" stroke={C.secondary} strokeWidth={2.2} dot={false} />
              </AreaChart>
            ) : trendStyle === "line" ? (
              <LineChart data={data.trend}>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                <XAxis dataKey="bucket" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chartTooltip()} />
                <Line type="monotone" dataKey="metricValue" stroke={C.primary} strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="quality" stroke={C.secondary} strokeWidth={2.2} dot={false} />
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

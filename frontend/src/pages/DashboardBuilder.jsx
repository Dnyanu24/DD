import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BarChart3,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  GripVertical,
  Grid2X2,
  Layers3,
  LayoutTemplate,
  Loader2,
  MousePointer2,
  PanelRight,
  Plus,
  Save,
  Search,
  Sparkles,
  SlidersHorizontal,
  Table2,
  Trash2,
} from "lucide-react";
import {
  createDashboardLayout,
  deleteDashboardLayout,
  getCleanedDatasetPreview,
  getCleanedDatasets,
  getDashboardLayouts,
  updateDashboardLayout,
} from "../services/api";

const CHART_TYPES = [
  { value: "bar", label: "Bar", icon: BarChart3 },
  { value: "line", label: "Line", icon: Activity },
  { value: "area", label: "Area", icon: Activity },
  { value: "pie", label: "Pie", icon: Grid2X2 },
  { value: "scatter", label: "Scatter", icon: MousePointer2 },
  { value: "kpi", label: "KPI", icon: LayoutTemplate },
  { value: "table", label: "Table", icon: Table2 },
];

const AGGREGATIONS = [
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "count", label: "Count" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
];

const PALETTES = {
  teal: ["#14b8a6", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#6366f1"],
  executive: ["#0f766e", "#2563eb", "#7c3aed", "#ca8a04", "#dc2626", "#475569"],
  fresh: ["#16a34a", "#0891b2", "#f97316", "#9333ea", "#e11d48", "#0f172a"],
};

const TILE_SIZES = {
  sm: "xl:col-span-1",
  md: "xl:col-span-2",
  lg: "xl:col-span-3",
};

const TILE_HEIGHTS = {
  sm: 230,
  md: 300,
  lg: 380,
};

function isMissing(value) {
  return value == null || String(value).trim() === "";
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[,$%]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferColumns(rows, columns) {
  const sample = rows.slice(0, 250);
  const numeric = [];
  const categorical = [];

  columns.forEach((column) => {
    let seen = 0;
    let numericCount = 0;
    sample.forEach((row) => {
      const value = row?.[column];
      if (isMissing(value)) return;
      seen += 1;
      if (toNumber(value) != null) numericCount += 1;
    });
    if (seen > 0 && numericCount / seen >= 0.65) numeric.push(column);
    else categorical.push(column);
  });

  return { numeric, categorical };
}

function filterRows(rows, filters) {
  return rows.filter((row) => {
    return filters.every((filter) => {
      if (!filter.column || !filter.value) return true;
      return String(row?.[filter.column] ?? "").toLowerCase().includes(String(filter.value).toLowerCase());
    });
  });
}

function aggregateRows(rows, config) {
  const { xColumn, yColumn, aggregation, chartType, topN = 12 } = config;
  if (chartType === "table") return rows.slice(0, 30);
  if (chartType === "kpi") {
    if (aggregation === "count" || !yColumn) return [{ label: "Rows", value: rows.length }];
    const values = rows.map((row) => toNumber(row?.[yColumn])).filter((value) => value != null);
    if (!values.length) return [{ label: yColumn || "Value", value: 0 }];
    const sum = values.reduce((acc, value) => acc + value, 0);
    const value = aggregation === "avg" ? sum / values.length : aggregation === "min" ? Math.min(...values) : aggregation === "max" ? Math.max(...values) : sum;
    return [{ label: yColumn, value: Math.round(value * 100) / 100 }];
  }

  if (chartType === "scatter") {
    if (!xColumn || !yColumn) return [];
    return rows
      .map((row, index) => ({ name: String(row?.[xColumn] ?? index + 1), x: toNumber(row?.[xColumn]), value: toNumber(row?.[yColumn]) }))
      .filter((point) => point.x != null && point.value != null)
      .slice(0, 250);
  }

  if (!xColumn) return [];
  const groups = new Map();
  rows.forEach((row) => {
    const key = isMissing(row?.[xColumn]) ? "Blank" : String(row[xColumn]);
    const current = groups.get(key) || { name: key, values: [], count: 0 };
    current.count += 1;
    const value = yColumn ? toNumber(row?.[yColumn]) : null;
    if (value != null) current.values.push(value);
    groups.set(key, current);
  });

  return Array.from(groups.values())
    .map((group) => {
      const sum = group.values.reduce((acc, value) => acc + value, 0);
      let value = group.count;
      if (aggregation === "sum") value = sum;
      if (aggregation === "avg") value = group.values.length ? sum / group.values.length : 0;
      if (aggregation === "min") value = group.values.length ? Math.min(...group.values) : 0;
      if (aggregation === "max") value = group.values.length ? Math.max(...group.values) : 0;
      if (aggregation === "count") value = group.count;
      return { name: group.name, value: Math.round(value * 100) / 100 };
    })
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, Math.max(3, Math.min(Number(topN) || 12, 30)));
}

function ChartPreview({ tile, rows, filters, paletteName }) {
  const filteredRows = filterRows(rows, filters);
  const data = aggregateRows(filteredRows, tile);
  const colors = PALETTES[paletteName] || PALETTES.teal;
  const height = TILE_HEIGHTS[tile.size || "md"] || 300;

  if (tile.chartType === "kpi") {
    return (
      <div className="flex items-center justify-center rounded-lg bg-theme-secondary" style={{ height }}>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase text-theme-muted">{data[0]?.label || "Value"}</p>
          <p className="mt-3 text-5xl font-bold text-theme-primary">{data[0]?.value?.toLocaleString?.() ?? data[0]?.value ?? 0}</p>
          <p className="mt-2 text-xs text-theme-muted">{filteredRows.length.toLocaleString()} filtered rows</p>
        </div>
      </div>
    );
  }

  if (tile.chartType === "table") {
    const tableColumns = Object.keys(data[0] || {}).slice(0, 8);
    return (
      <div className="overflow-auto rounded-lg border border-theme-light" style={{ height }}>
        <table className="min-w-full text-left text-xs">
          <thead className="sticky top-0 bg-theme-secondary text-theme-muted">
            <tr>{tableColumns.map((column) => <th key={column} className="px-3 py-2">{column}</th>)}</tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={index} className="border-t border-theme-light">
                {tableColumns.map((column) => <td key={column} className="px-3 py-2 text-theme-primary">{String(row[column] ?? "")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!data.length) {
    return <div className="flex items-center justify-center rounded-lg bg-theme-secondary text-sm text-theme-muted" style={{ height }}>Select valid columns to preview this chart.</div>;
  }

  if (tile.chartType === "pie") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip />
          <Pie data={data} dataKey="value" nameKey="name" outerRadius={Math.min(120, height / 2.6)} label>
            {data.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (tile.chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke={colors[0]} strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (tile.chartType === "area") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Area type="monotone" dataKey="value" stroke={colors[0]} fill={colors[0]} fillOpacity={0.25} strokeWidth={3} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (tile.chartType === "scatter") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="x" tick={{ fontSize: 11 }} name={tile.xColumn} />
          <YAxis dataKey="value" tick={{ fontSize: 11 }} name={tile.yColumn} />
          <Tooltip />
          <Scatter data={data} fill={colors[0]} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="value" fill={colors[0]} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function DashboardBuilder() {
  const [datasets, setDatasets] = useState([]);
  const [layouts, setLayouts] = useState([]);
  const [selectedCleanedId, setSelectedCleanedId] = useState("");
  const [datasetPreview, setDatasetPreview] = useState(null);
  const [activeLayoutId, setActiveLayoutId] = useState(null);
  const [dashboardTitle, setDashboardTitle] = useState("Executive Dashboard");
  const [tabs, setTabs] = useState([{ id: "overview", name: "Overview", tiles: [] }]);
  const [activeTabId, setActiveTabId] = useState("overview");
  const [filters, setFilters] = useState([]);
  const [paletteName, setPaletteName] = useState("teal");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const [draggedTileId, setDraggedTileId] = useState(null);
  const [tileConfig, setTileConfig] = useState({
    title: "New Chart",
    chartType: "bar",
    xColumn: "",
    yColumn: "",
    aggregation: "sum",
    size: "md",
    topN: 12,
  });

  const rows = datasetPreview?.rows || [];
  const columns = datasetPreview?.columns || [];
  const typedColumns = useMemo(() => inferColumns(rows, columns), [rows, columns]);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];
  const activeTiles = activeTab?.tiles || [];
  const filteredRows = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const selectedDataset = useMemo(
    () => datasets.find((dataset) => String(dataset.cleaned_data_id) === String(selectedCleanedId)) || null,
    [datasets, selectedCleanedId]
  );
  const totalTileCount = useMemo(
    () => tabs.reduce((sum, tab) => sum + (tab.tiles?.length || 0), 0),
    [tabs]
  );
  const visibleFields = useMemo(() => {
    const query = fieldSearch.trim().toLowerCase();
    return columns.filter((column) => !query || column.toLowerCase().includes(query));
  }, [columns, fieldSearch]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [datasetResponse, layoutResponse] = await Promise.all([getCleanedDatasets(), getDashboardLayouts()]);
        if (!mounted) return;
        const cleanedList = Array.isArray(datasetResponse?.data) ? datasetResponse.data : Array.isArray(datasetResponse) ? datasetResponse : [];
        setDatasets(cleanedList);
        setLayouts(Array.isArray(layoutResponse) ? layoutResponse : []);
        const first = cleanedList[0] || null;
        if (first?.cleaned_data_id) setSelectedCleanedId(String(first.cleaned_data_id));
      } catch (error) {
        if (mounted) setMessage(error.message || "Failed to load dashboard builder.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!selectedCleanedId) {
      setDatasetPreview(null);
      return;
    }
    let mounted = true;
    async function loadPreview() {
      try {
        const preview = await getCleanedDatasetPreview(selectedCleanedId, { limit: 3000 });
        if (!mounted) return;
        setDatasetPreview(preview);
        const inferred = inferColumns(preview.rows || [], preview.columns || []);
        setTileConfig((prev) => ({
          ...prev,
          xColumn: inferred.categorical[0] || preview.columns?.[0] || "",
          yColumn: inferred.numeric[0] || "",
        }));
      } catch (error) {
        if (mounted) setMessage(error.message || "Failed to load dataset preview.");
      }
    }
    loadPreview();
    return () => { mounted = false; };
  }, [selectedCleanedId]);

  const currentTile = useMemo(() => ({
    id: "preview",
    datasetId: selectedCleanedId,
    ...tileConfig,
  }), [selectedCleanedId, tileConfig]);

  const updateActiveTiles = (updater) => {
    setTabs((prev) => prev.map((tab) => (
      tab.id === activeTabId ? { ...tab, tiles: typeof updater === "function" ? updater(tab.tiles || []) : updater } : tab
    )));
  };

  const addTile = () => {
    if (!selectedCleanedId) {
      setMessage("Select a cleaned dataset first.");
      return;
    }
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    updateActiveTiles((prev) => [...prev, { ...currentTile, id, title: tileConfig.title || "Chart" }]);
    setMessage("Chart added to dashboard.");
  };

  const addPresetTile = (preset) => {
    if (!selectedCleanedId) {
      setMessage("Select a cleaned dataset first.");
      return;
    }
    const category = typedColumns.categorical[0] || columns[0] || "";
    const numeric = typedColumns.numeric[0] || "";
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const presets = {
      kpi: {
        title: numeric ? `Total ${numeric}` : "Total Rows",
        chartType: "kpi",
        aggregation: numeric ? "sum" : "count",
        xColumn: category,
        yColumn: numeric,
        size: "sm",
        topN: 12,
      },
      compare: {
        title: numeric && category ? `${numeric} by ${category}` : "Compare Categories",
        chartType: "bar",
        aggregation: numeric ? "sum" : "count",
        xColumn: category,
        yColumn: numeric,
        size: "md",
        topN: 10,
      },
      share: {
        title: category ? `Share by ${category}` : "Category Share",
        chartType: "pie",
        aggregation: "count",
        xColumn: category,
        yColumn: "",
        size: "sm",
        topN: 6,
      },
      table: {
        title: "Data Table",
        chartType: "table",
        aggregation: "count",
        xColumn: category,
        yColumn: numeric,
        size: "lg",
        topN: 12,
      },
    };
    const tile = presets[preset] || presets.compare;
    updateActiveTiles((prev) => [...prev, { ...tile, id, datasetId: selectedCleanedId }]);
    setTileConfig((prev) => ({ ...prev, ...tile }));
    setMessage(`${tile.title} added.`);
  };

  const removeTile = (tileId) => {
    updateActiveTiles((prev) => prev.filter((tile) => tile.id !== tileId));
  };

  const duplicateTile = (tile) => {
    updateActiveTiles((prev) => [...prev, { ...tile, id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, title: `${tile.title} Copy` }]);
  };

  const moveTile = (tileId, direction) => {
    updateActiveTiles((prev) => {
      const index = prev.findIndex((tile) => tile.id === tileId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  };

  const resizeTile = (tileId, size) => {
    updateActiveTiles((prev) => prev.map((tile) => tile.id === tileId ? { ...tile, size } : tile));
  };

  const reorderTile = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    updateActiveTiles((prev) => {
      const sourceIndex = prev.findIndex((tile) => tile.id === sourceId);
      const targetIndex = prev.findIndex((tile) => tile.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const addTab = () => {
    const id = `tab_${Date.now()}`;
    setTabs((prev) => [...prev, { id, name: `Page ${prev.length + 1}`, tiles: [] }]);
    setActiveTabId(id);
  };

  const addFilter = () => {
    const firstColumn = typedColumns.categorical[0] || columns[0] || "";
    setFilters((prev) => [...prev, { id: `${Date.now()}`, column: firstColumn, value: "" }]);
  };

  const updateFilter = (id, patch) => {
    setFilters((prev) => prev.map((filter) => filter.id === id ? { ...filter, ...patch } : filter));
  };

  const removeFilter = (id) => {
    setFilters((prev) => prev.filter((filter) => filter.id !== id));
  };

  const generateDashboard = () => {
    if (!selectedCleanedId || !rows.length) {
      setMessage("Select a cleaned dataset before auto-generating.");
      return;
    }
    const category = typedColumns.categorical[0] || columns[0] || "";
    const secondCategory = typedColumns.categorical[1] || category;
    const numeric = typedColumns.numeric[0] || "";
    const secondNumeric = typedColumns.numeric[1] || numeric;
    const generated = [
      { id: `auto_${Date.now()}_kpi`, datasetId: selectedCleanedId, title: "Rows Processed", chartType: "kpi", aggregation: "count", xColumn: category, yColumn: "", size: "sm", topN: 12 },
      { id: `auto_${Date.now()}_bar`, datasetId: selectedCleanedId, title: numeric ? `${numeric} by ${category}` : `Rows by ${category}`, chartType: "bar", aggregation: numeric ? "sum" : "count", xColumn: category, yColumn: numeric, size: "md", topN: 10 },
      { id: `auto_${Date.now()}_area`, datasetId: selectedCleanedId, title: secondNumeric ? `${secondNumeric} profile` : "Category profile", chartType: "area", aggregation: secondNumeric ? "avg" : "count", xColumn: secondCategory, yColumn: secondNumeric, size: "md", topN: 12 },
      { id: `auto_${Date.now()}_pie`, datasetId: selectedCleanedId, title: `Share by ${secondCategory}`, chartType: "pie", aggregation: "count", xColumn: secondCategory, yColumn: "", size: "sm", topN: 6 },
      { id: `auto_${Date.now()}_table`, datasetId: selectedCleanedId, title: "Data Preview", chartType: "table", aggregation: "count", xColumn: category, yColumn: numeric, size: "lg", topN: 12 },
    ];
    updateActiveTiles(generated);
    setMessage("Auto dashboard generated from detected columns.");
  };

  const saveDashboard = async () => {
    if (!dashboardTitle.trim()) {
      setMessage("Add a dashboard title before saving.");
      return;
    }
    setSaving(true);
    try {
      const payload = { title: dashboardTitle.trim(), layout: { tabs, activeTabId, filters, paletteName, selectedCleanedId } };
      const saved = activeLayoutId ? await updateDashboardLayout(activeLayoutId, payload) : await createDashboardLayout(payload);
      setActiveLayoutId(saved.id);
      setLayouts(await getDashboardLayouts());
      setMessage("Dashboard saved.");
    } catch (error) {
      setMessage(error.message || "Failed to save dashboard.");
    } finally {
      setSaving(false);
    }
  };

  const loadLayout = (layout) => {
    const layoutData = layout.layout || {};
    const nextTabs = Array.isArray(layoutData.tabs)
      ? layoutData.tabs
      : [{ id: "overview", name: "Overview", tiles: Array.isArray(layoutData.tiles) ? layoutData.tiles : [] }];
    setActiveLayoutId(layout.id);
    setDashboardTitle(layout.title);
    setTabs(nextTabs.length ? nextTabs : [{ id: "overview", name: "Overview", tiles: [] }]);
    setActiveTabId(layoutData.activeTabId || nextTabs[0]?.id || "overview");
    setFilters(Array.isArray(layoutData.filters) ? layoutData.filters : []);
    setPaletteName(layoutData.paletteName || "teal");
    const firstTile = nextTabs.flatMap((tab) => tab.tiles || [])[0];
    if (layoutData.selectedCleanedId || firstTile?.datasetId) setSelectedCleanedId(String(layoutData.selectedCleanedId || firstTile.datasetId));
    setMessage(`Loaded ${layout.title}.`);
  };

  const deleteLayout = async (layoutId) => {
    try {
      await deleteDashboardLayout(layoutId);
      setLayouts(await getDashboardLayouts());
      if (activeLayoutId === layoutId) {
        setActiveLayoutId(null);
        setTabs([{ id: "overview", name: "Overview", tiles: [] }]);
        setActiveTabId("overview");
      }
      setMessage("Dashboard deleted.");
    } catch (error) {
      setMessage(error.message || "Failed to delete dashboard.");
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-theme-muted"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading dashboard builder...</div>;
  }

  return (
    <div className="-m-6 min-h-[calc(100vh-4rem)] bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <section className="border-b border-slate-300 bg-slate-950 text-white shadow-theme dark:border-slate-800">
        <div className="border-b border-white/10 bg-white/5 px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-300">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-teal-500 text-white">BI</span>
              <span>SDAS Analytics Studio</span>
              <span className="rounded-full bg-white/10 px-2 py-1">{selectedDataset ? `Cleaned #${selectedDataset.cleaned_data_id}` : "No dataset selected"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>{tabs.length} pages</span>
              <span className="h-1 w-1 rounded-full bg-slate-500" />
              <span>{totalTileCount} visuals</span>
              <span className="h-1 w-1 rounded-full bg-slate-500" />
              <span>{filteredRows.length.toLocaleString()} visible rows</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/30 bg-teal-400/10 px-3 py-1 text-xs font-semibold uppercase text-teal-200">
              <Grid2X2 className="h-3.5 w-3.5" />
              Interactive Dashboard Builder
            </div>
            <input
              value={dashboardTitle}
              onChange={(event) => setDashboardTitle(event.target.value)}
              className="mt-3 w-full max-w-2xl bg-transparent text-3xl font-semibold text-white outline-none placeholder:text-slate-500"
            />
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              Design executive-ready dashboards from cleaned datasets with pages, filters, palettes, auto visuals, and reusable layouts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={generateDashboard} title="Auto generate dashboard" className="inline-flex h-10 items-center gap-2 rounded-md border border-teal-300/40 bg-teal-400/10 px-3 text-sm font-semibold text-teal-100 hover:bg-teal-400/20">
              <Sparkles className="h-4 w-4" />
              <span>Auto</span>
            </button>
            <button type="button" onClick={addTab} title="Add dashboard page" className="inline-flex h-10 items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/15">
              <Layers3 className="h-4 w-4" />
              <span>Page</span>
            </button>
            <button type="button" onClick={saveDashboard} disabled={saving} title="Save dashboard" className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-500 px-3 text-sm font-semibold text-white shadow-lg shadow-teal-950/30 hover:bg-teal-400 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Save</span>
            </button>
          </div>
        </div>
        {message && <div className="mx-5 mb-5 rounded-md border border-teal-300/40 bg-teal-400/10 px-4 py-3 text-sm font-semibold text-teal-100">{message}</div>}
      </section>

      <section className="grid grid-cols-2 gap-3 px-6 py-4 lg:grid-cols-4">
        {[
          { label: "Loaded Rows", value: rows.length.toLocaleString(), hint: selectedDataset ? `Raw #${selectedDataset.raw_data_id}` : "No dataset" },
          { label: "Visible Rows", value: filteredRows.length.toLocaleString(), hint: `${filters.length} active filters` },
          { label: "Fields", value: columns.length.toLocaleString(), hint: `${typedColumns.numeric.length} numeric` },
          { label: "Dashboard Tiles", value: totalTileCount.toLocaleString(), hint: `${tabs.length} pages` },
        ].map((item) => (
          <div key={item.label} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase text-theme-muted">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-theme-primary">{item.value}</p>
            <p className="mt-1 text-xs text-theme-muted">{item.hint}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-0 border-y border-slate-300 bg-slate-200 dark:border-slate-800 dark:bg-slate-950 xl:grid-cols-[260px_minmax(0,1fr)_300px] 2xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        <aside className="space-y-4 border-r border-slate-300 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 xl:sticky xl:top-0 xl:max-h-screen xl:overflow-y-auto 2xl:p-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase text-theme-muted"><Database className="h-4 w-4 text-teal-500" /> Data Model</h2>
            <select
              value={selectedCleanedId}
              onChange={(event) => setSelectedCleanedId(event.target.value)}
              className="mt-3 w-full rounded-md border border-theme-light bg-theme-secondary px-3 py-2 text-sm font-semibold text-theme-primary"
            >
              <option value="">Select cleaned dataset</option>
              {datasets.map((dataset) => (
                <option key={dataset.cleaned_data_id} value={dataset.cleaned_data_id}>
                  Raw #{dataset.raw_data_id} - {dataset.sector_label || "all"} - {dataset.row_count} rows
                </option>
              ))}
            </select>
            {selectedDataset && (
              <div className="mt-3 rounded-md border border-theme-light bg-theme-secondary p-3">
                <p className="text-sm font-semibold text-theme-primary">Cleaned #{selectedDataset.cleaned_data_id}</p>
                <p className="mt-1 text-xs text-theme-muted">{selectedDataset.row_count?.toLocaleString?.() || selectedDataset.row_count} rows - {selectedDataset.column_count} columns</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-theme-card">
                  <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, Math.round((selectedDataset.quality_score || 0) * 100))}%` }} />
                </div>
                <p className="mt-1 text-xs text-theme-muted">Quality {Math.round((selectedDataset.quality_score || 0) * 100)}%</p>
              </div>
            )}
          </div>

          <div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-theme-muted" />
              <input
                value={fieldSearch}
                onChange={(event) => setFieldSearch(event.target.value)}
                placeholder="Search fields"
                className="w-full rounded-md border border-theme-light bg-theme-secondary py-2 pl-9 pr-3 text-sm text-theme-primary"
              />
            </div>
            <div className="mt-3 max-h-[34rem] space-y-1.5 overflow-y-auto pr-1">
              {visibleFields.map((field) => {
                const isNumeric = typedColumns.numeric.includes(field);
                return (
                  <button
                    key={field}
                    type="button"
                    onClick={() => setTileConfig((prev) => isNumeric ? { ...prev, yColumn: field } : { ...prev, xColumn: field })}
                    className="group flex w-full items-center justify-between rounded-md border border-theme-light bg-theme-secondary px-3 py-2 text-left text-xs font-semibold text-theme-primary transition hover:border-teal-400 hover:bg-theme-card"
                  >
                    <span className="truncate">{field}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] uppercase ${isNumeric ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}`}>{isNumeric ? "num" : "cat"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="overflow-hidden bg-slate-200 dark:bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold ${tab.id === activeTabId ? "bg-teal-600 text-white shadow-sm" : "bg-theme-card text-theme-primary hover:bg-theme-tertiary"}`}
                >
                  {tab.name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-theme-muted">
              <MousePointer2 className="h-4 w-4" />
              Drag visuals to arrange. Use S/M/L to resize.
            </div>
          </div>

          <div
            className="min-h-[46rem] p-6"
            style={{
              backgroundImage:
                "linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          >
          <div className="mx-auto min-h-[40rem] max-w-7xl rounded-sm border border-slate-300 bg-white p-6 shadow-[0_32px_90px_-50px_rgba(15,23,42,0.9)] dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-5 flex items-start justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
            <div>
              <p className="text-xs font-semibold uppercase text-teal-600 dark:text-teal-300">Report Page</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">{activeTab?.name || "Overview"}</h2>
            </div>
            <div className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">
              <p>{dashboardTitle}</p>
              <p>{new Date().toLocaleDateString()}</p>
            </div>
          </div>
          {activeTiles.length === 0 ? (
            <div className="flex min-h-[32rem] items-center justify-center rounded-lg border border-dashed border-theme-light bg-theme-secondary/70 text-center">
              <div>
                <BarChart3 className="mx-auto h-10 w-10 text-teal-500" />
                <p className="mt-3 text-lg font-semibold text-theme-primary">No tiles yet</p>
                <p className="mt-1 text-sm text-theme-muted">Use Auto Generate or add a tile from the configuration panel.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {activeTiles.map((tile, index) => (
                <section
                  key={tile.id}
                  draggable
                  onDragStart={() => setDraggedTileId(tile.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    reorderTile(draggedTileId, tile.id);
                    setDraggedTileId(null);
                  }}
                  onDragEnd={() => setDraggedTileId(null)}
                  className={`${TILE_SIZES[tile.size || "md"] || TILE_SIZES.md} group relative overflow-hidden rounded-sm border border-slate-300 bg-white shadow-[0_10px_30px_-22px_rgba(15,23,42,0.8)] transition hover:border-teal-400 hover:shadow-[0_18px_45px_-28px_rgba(15,23,42,0.85)] dark:border-slate-700 dark:bg-slate-950 ${draggedTileId === tile.id ? "opacity-60" : ""}`}
                >
                  <div className="absolute inset-0 pointer-events-none opacity-0 ring-2 ring-inset ring-teal-400 transition group-hover:opacity-100" />
                  <div className="h-1 bg-gradient-to-r from-teal-500 via-sky-500 to-emerald-500" />
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-theme-light px-4 py-3">
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 h-4 w-4 cursor-grab text-slate-400" />
                      <div>
                      <h3 className="text-base font-semibold text-theme-primary">{tile.title}</h3>
                      <p className="mt-1 text-xs text-theme-muted">{tile.chartType} - {tile.aggregation} - {tile.xColumn || "all rows"}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" onClick={() => moveTile(tile.id, -1)} disabled={index === 0} className="rounded-md border border-theme-light p-1.5 text-theme-muted hover:text-theme-primary disabled:opacity-40" aria-label="Move left"><ChevronLeft className="h-4 w-4" /></button>
                      <button type="button" onClick={() => moveTile(tile.id, 1)} disabled={index === activeTiles.length - 1} className="rounded-md border border-theme-light p-1.5 text-theme-muted hover:text-theme-primary disabled:opacity-40" aria-label="Move right"><ChevronRight className="h-4 w-4" /></button>
                      <button type="button" onClick={() => duplicateTile(tile)} className="rounded-md border border-theme-light p-1.5 text-theme-muted hover:text-theme-primary" aria-label="Duplicate"><Copy className="h-4 w-4" /></button>
                      <button type="button" onClick={() => removeTile(tile.id)} className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="rounded-full bg-theme-secondary px-2 py-1 text-[10px] font-semibold uppercase text-theme-muted">{tile.size || "md"} tile</span>
                    <div className="flex gap-1">
                    {["sm", "md", "lg"].map((size) => (
                      <button key={size} type="button" onClick={() => resizeTile(tile.id, size)} className={`rounded-md px-2 py-1 text-xs font-semibold ${tile.size === size ? "bg-teal-600 text-white" : "bg-theme-card text-theme-muted"}`}>{size.toUpperCase()}</button>
                    ))}
                    </div>
                  </div>
                  <div className="px-4 pb-4">
                  <ChartPreview tile={tile} rows={rows} filters={filters} paletteName={paletteName} />
                  </div>
                </section>
              ))}
            </div>
          )}
          </div>
          </div>
        </main>

        <aside className="space-y-3 border-l border-slate-300 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 xl:sticky xl:top-0 xl:max-h-screen xl:overflow-y-auto 2xl:p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase text-theme-muted"><PanelRight className="h-4 w-4 text-teal-500" /> Create Tile</h2>

          <div className="rounded-lg border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-3 dark:border-teal-900 dark:from-teal-950/40 dark:to-slate-900">
            <p className="text-xs font-semibold uppercase text-teal-700 dark:text-teal-300">Quick Add</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { id: "kpi", label: "Number", icon: Grid2X2 },
                { id: "compare", label: "Compare", icon: BarChart3 },
                { id: "share", label: "Share", icon: LayoutTemplate },
                { id: "table", label: "Table", icon: Table2 },
              ].map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => addPresetTile(preset.id)}
                    className="flex h-20 flex-col items-center justify-center gap-2 rounded-lg border border-teal-200 bg-white text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-500 hover:shadow-md dark:border-teal-900 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <Icon className="h-5 w-5 text-teal-600" />
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-theme-light bg-theme-secondary p-3">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">1</span>
              <p className="text-sm font-semibold text-theme-primary">Choose visual type</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {CHART_TYPES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setTileConfig((prev) => ({ ...prev, chartType: item.value }))}
                    className={`flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] font-semibold transition ${tileConfig.chartType === item.value ? "border-teal-500 bg-teal-50 text-teal-700 shadow-sm dark:bg-teal-950 dark:text-teal-200" : "border-theme-light bg-theme-card text-theme-muted hover:border-teal-400 hover:text-theme-primary"}`}
                    title={item.label}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-theme-light bg-theme-secondary p-3">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">2</span>
              <p className="text-sm font-semibold text-theme-primary">Pick the data</p>
            </div>

            <label className="block text-xs font-semibold uppercase text-theme-muted">
              Group by
              <select value={tileConfig.xColumn} onChange={(event) => setTileConfig((prev) => ({ ...prev, xColumn: event.target.value }))} className="mt-1 w-full rounded-md border border-theme-light bg-theme-card px-3 py-2 text-sm font-semibold text-theme-primary">
                <option value="">No group</option>
                {[...typedColumns.categorical, ...typedColumns.numeric].map((column) => <option key={column} value={column}>{column}</option>)}
              </select>
            </label>

            <label className="mt-3 block text-xs font-semibold uppercase text-theme-muted">
              Measure
              <select value={tileConfig.yColumn} onChange={(event) => setTileConfig((prev) => ({ ...prev, yColumn: event.target.value }))} className="mt-1 w-full rounded-md border border-theme-light bg-theme-card px-3 py-2 text-sm font-semibold text-theme-primary">
                <option value="">Count rows</option>
                {typedColumns.numeric.map((column) => <option key={column} value={column}>{column}</option>)}
              </select>
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {AGGREGATIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setTileConfig((prev) => ({ ...prev, aggregation: item.value }))}
                  className={`rounded-md border px-2 py-2 text-xs font-semibold ${tileConfig.aggregation === item.value ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200" : "border-theme-light bg-theme-card text-theme-muted hover:text-theme-primary"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-theme-light bg-theme-secondary p-3">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">3</span>
              <p className="text-sm font-semibold text-theme-primary">Name and place it</p>
            </div>

            <input value={tileConfig.title} onChange={(event) => setTileConfig((prev) => ({ ...prev, title: event.target.value }))} placeholder="Tile title" className="w-full rounded-md border border-theme-light bg-theme-card px-3 py-2 text-sm font-semibold text-theme-primary" />

            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { value: "sm", label: "Small" },
                { value: "md", label: "Medium" },
                { value: "lg", label: "Wide" },
              ].map((size) => (
                <button
                  key={size.value}
                  type="button"
                  onClick={() => setTileConfig((prev) => ({ ...prev, size: size.value }))}
                  className={`rounded-md border px-2 py-2 text-xs font-semibold ${tileConfig.size === size.value ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200" : "border-theme-light bg-theme-card text-theme-muted hover:text-theme-primary"}`}
                >
                  {size.label}
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <select value={paletteName} onChange={(event) => setPaletteName(event.target.value)} className="rounded-md border border-theme-light bg-theme-card px-3 py-2 text-sm font-semibold text-theme-primary">
                <option value="teal">Teal</option>
                <option value="executive">Executive</option>
                <option value="fresh">Fresh</option>
              </select>
              <input type="number" min="3" max="30" value={tileConfig.topN} onChange={(event) => setTileConfig((prev) => ({ ...prev, topN: Number(event.target.value) }))} className="w-16 rounded-md border border-theme-light bg-theme-card px-2 py-2 text-sm font-semibold text-theme-primary" title="Top N" />
            </div>
          </div>

          <button type="button" onClick={addTile} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-teal-700 hover:shadow-lg">
            <Plus className="h-4 w-4" />
            Add to Dashboard
          </button>

          <details className="rounded-lg border border-theme-light bg-theme-secondary p-3" open>
            <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-theme-primary">
              Filters
              <ChevronDown className="h-4 w-4" />
            </summary>
            <div className="mt-3 space-y-2">
              {filters.map((filter) => (
                <div key={filter.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <select value={filter.column} onChange={(event) => updateFilter(filter.id, { column: event.target.value })} className="rounded-md border border-theme-light bg-theme-card px-2 py-1.5 text-xs text-theme-primary">
                    {columns.map((column) => <option key={column} value={column}>{column}</option>)}
                  </select>
                  <input value={filter.value} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} placeholder="contains" className="rounded-md border border-theme-light bg-theme-card px-2 py-1.5 text-xs text-theme-primary" />
                  <button type="button" onClick={() => removeFilter(filter.id)} className="rounded-md border border-red-200 p-1.5 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <button type="button" onClick={addFilter} className="w-full rounded-md border border-theme-light px-3 py-1.5 text-xs font-semibold text-theme-primary hover:bg-theme-card">Add filter</button>
            </div>
          </details>
        </aside>
      </div>

      <section className="mx-6 my-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-theme-primary">Saved Dashboards</h2>
          <span className="rounded-full bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">{layouts.length} layouts</span>
        </div>
        {layouts.length === 0 ? (
          <p className="text-sm text-theme-muted">No saved dashboards yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-theme-light">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-theme-secondary text-xs uppercase text-theme-muted">
                <tr>
                  <th className="px-4 py-3">Dashboard</th>
                  <th className="px-4 py-3">Tiles</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
            {layouts.map((layout) => (
              <tr key={layout.id} className="border-t border-theme-light">
                <td className="px-4 py-3 font-semibold text-theme-primary">{layout.title}</td>
                <td className="px-4 py-3 text-theme-muted">{(layout.layout?.tabs || []).reduce((sum, tab) => sum + (tab.tiles?.length || 0), 0) || layout.layout?.tiles?.length || 0}</td>
                <td className="px-4 py-3 text-theme-muted">{layout.updated_at ? new Date(layout.updated_at).toLocaleString() : "recently"}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => loadLayout(layout)} className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">Load</button>
                    <button type="button" onClick={() => deleteLayout(layout.id)} className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

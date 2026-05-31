import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderOpen,
  Gauge,
  Layers3,
  Loader2,
  PieChart as PieChartIcon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { analyzeDataErrors, deleteUploadedDataset, getProducts, getSectors, getUploadedData, uploadData } from "../services/api";

export default function DataUpload() {
  const [sectors, setSectors] = useState([]);
  const [products, setProducts] = useState([]);
  const [uploadedHistory, setUploadedHistory] = useState([]);
  const [selectedSector, setSelectedSector] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const selectedFileMeta = selectedFile
    ? {
        name: selectedFile.name,
        size: `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`,
        extension: selectedFile.name.split(".").pop()?.toUpperCase() || "FILE",
      }
    : null;

  const uploadStats = [
    {
      label: "Uploaded",
      value: uploadedHistory.length,
      hint: "files in workspace",
      icon: Database,
    },
    {
      label: "Clean Ready",
      value: uploadedHistory.filter((item) => item.has_cleaned_data).length,
      hint: "available for cleaning",
      icon: ShieldCheck,
    },
    {
      label: "Formats",
      value: "8",
      hint: "csv xlsx json txt pdf",
      icon: FileSpreadsheet,
    },
    {
      label: "Quality",
      value: analysisResult?.summary?.quality_score != null ? `${analysisResult.summary.quality_score}%` : "--",
      hint: analysisResult ? "latest scan" : "run analyze",
      icon: Gauge,
    },
  ];

  const pipelineSteps = [
    { label: "Select Scope", detail: selectedSector ? "Sector selected" : "Choose a sector", icon: FolderOpen, complete: Boolean(selectedSector) },
    { label: "Attach File", detail: selectedFileMeta ? selectedFileMeta.extension : "CSV, Excel, JSON, TXT, PDF", icon: UploadCloud, complete: Boolean(selectedFile) },
    { label: "Analyze Errors", detail: analysisResult ? "Profile generated" : "Optional quality scan", icon: BarChart3, complete: Boolean(analysisResult) },
    { label: "Store Dataset", detail: result ? "Database record created" : "Ready for cleaning page", icon: Database, complete: Boolean(result) },
  ];

  useEffect(() => {
    let mounted = true;

    const loadInitial = async () => {
      setIsLoading(true);
      try {
        const [sectorRows, uploaded] = await Promise.all([
          getSectors(),
          getUploadedData().catch(() => ({ data: [] })),
        ]);
        if (!mounted) return;
        setSectors(Array.isArray(sectorRows) ? sectorRows : []);
        setUploadedHistory(Array.isArray(uploaded?.data) ? uploaded.data : []);
        if (Array.isArray(sectorRows) && sectorRows.length > 0) {
          setSelectedSector(String(sectorRows[0].id));
        } else {
          setError("No sectors were returned. Upload will use your first available company sector automatically.");
        }
      } catch (loadError) {
        if (!mounted) return;
        setSectors([]);
        setUploadedHistory([]);
        setSelectedSector("");
        setError(loadError?.message || "Failed to load sectors. Upload will use your first available company sector automatically.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadInitial();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedSector) {
      setProducts([]);
      return;
    }

    let mounted = true;
    const loadProducts = async () => {
      const rows = await getProducts(selectedSector).catch(() => []);
      if (!mounted) return;
      setProducts(Array.isArray(rows) ? rows : []);
      setSelectedProduct("");
    };
    loadProducts();
    return () => {
      mounted = false;
    };
  }, [selectedSector]);

  const refreshHistory = async () => {
    const uploaded = await getUploadedData().catch(() => ({ data: [] }));
    setUploadedHistory(Array.isArray(uploaded?.data) ? uploaded.data : []);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Choose a file before uploading.");
      return;
    }
    setError("");
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("sector_id", selectedSector || "0");
      if (selectedProduct) formData.append("product_id", selectedProduct);

      const response = await uploadData(formData);
      setResult(response);
      setSelectedFile(null);
      await refreshHistory();
    } catch (uploadError) {
      setError(uploadError?.message || "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleAnalyzeErrors = async () => {
    if (!selectedFile) {
      setError("Choose a file first to analyze dataset errors.");
      return;
    }
    setError("");
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await analyzeDataErrors(formData);
      setAnalysisResult(response);
    } catch (analysisError) {
      setError(analysisError?.message || "Failed to analyze dataset errors.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeleteDataset = async (datasetId) => {
    const confirmed = window.confirm(`Delete dataset #${datasetId}? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingId(datasetId);
    setError("");
    try {
      await deleteUploadedDataset(datasetId);
      await refreshHistory();
    } catch (deleteError) {
      setError(deleteError?.message || "Failed to delete dataset.");
    } finally {
      setDeletingId(null);
    }
  };

  const renderExtractionDetails = (payload, tone = "emerald") => {
    const extraction = payload?.extraction;
    if (!extraction) return null;

    const warnings = extraction.warnings || payload.ingest_warnings || [];
    const toneClasses = tone === "amber"
      ? "border-amber-200 bg-amber-100/60 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
      : "border-emerald-200 bg-emerald-100/70 text-emerald-800";

    return (
      <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${toneClasses}`}>
        <p className="font-semibold">
          File type: {(payload.file_type || extraction.file_type || "unknown").toUpperCase()} | Extraction: {extraction.confidence_label} ({Math.round((extraction.confidence_score || 0) * 100)}%)
        </p>
        <p className="mt-1">
          Parsed {extraction.rows_extracted ?? 0} rows and {extraction.columns_extracted ?? 0} columns.
        </p>
        {warnings.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {warnings.slice(0, 4).map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-theme-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading upload configuration...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-theme-light bg-theme-card shadow-theme">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px]">
          <div className="p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
              <FileUp className="h-3.5 w-3.5" />
              Data Ingestion
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-theme-primary">Upload, profile, and prepare datasets</h1>
            <p className="mt-2 max-w-3xl text-sm text-theme-muted">
              Bring raw files into SDAS, inspect data quality before saving, and make trusted inputs available for cleaning, models, dashboards, and reports.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["CSV", "XLSX", "JSON", "TXT", "TSV", "LOG", "PDF"].map((format) => (
                <span key={format} className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">
                  {format}
                </span>
              ))}
            </div>
          </div>
          <div className="border-t border-theme-light bg-theme-secondary p-5 xl:border-l xl:border-t-0">
            <p className="text-xs font-semibold uppercase text-theme-muted">Selected File</p>
            {selectedFileMeta ? (
              <div className="mt-4 rounded-lg border border-theme-light bg-theme-card p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-teal-50 p-2 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-theme-primary">{selectedFileMeta.name}</p>
                    <p className="mt-1 text-xs text-theme-muted">{selectedFileMeta.extension} | {selectedFileMeta.size}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-theme-dark bg-theme-card p-5 text-center">
                <UploadCloud className="mx-auto h-8 w-8 text-teal-600" />
                <p className="mt-2 text-sm font-semibold text-theme-primary">No file selected</p>
                <p className="mt-1 text-xs text-theme-muted">Choose a file below to start ingestion.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {uploadStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-lg border border-theme-light bg-theme-card p-4 shadow-theme">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-theme-muted">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-theme-primary">{stat.value}</p>
                  <p className="mt-1 text-xs text-theme-muted">{stat.hint}</p>
                </div>
                <div className="rounded-lg bg-teal-50 p-2 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <section className="rounded-lg border border-theme-light bg-theme-card p-5 shadow-theme">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-theme-primary">
              <Layers3 className="h-5 w-5 text-teal-600" />
              Ingestion Pipeline
            </h2>
            <p className="mt-1 text-xs text-theme-muted">Follow these stages from raw file to dashboard-ready data.</p>
          </div>
          <button
            type="button"
            onClick={refreshHistory}
            className="inline-flex items-center gap-2 rounded-lg border border-theme-light bg-theme-secondary px-3 py-2 text-xs font-semibold text-theme-primary hover:bg-theme-tertiary"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {pipelineSteps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className={`rounded-lg border p-4 ${step.complete ? "border-teal-200 bg-teal-50/70 dark:border-teal-900 dark:bg-teal-950/30" : "border-theme-light bg-theme-secondary"}`}>
                <div className="flex items-center justify-between">
                  <Icon className={step.complete ? "h-5 w-5 text-teal-700 dark:text-teal-200" : "h-5 w-5 text-theme-muted"} />
                  {step.complete ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-theme-muted" />}
                </div>
                <p className="mt-3 text-sm font-semibold text-theme-primary">{step.label}</p>
                <p className="mt-1 text-xs text-theme-muted">{step.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <section className="bg-theme-card rounded-lg border border-theme-light p-6 shadow-theme">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-theme-primary">
            <UploadCloud className="h-5 w-5 text-teal-600" />
            Upload Dataset
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-theme-secondary">Sector</label>
              <select
                value={selectedSector}
                onChange={(event) => setSelectedSector(event.target.value)}
                className="w-full rounded-lg border border-theme-light bg-theme-secondary px-3 py-2 text-theme-primary"
              >
                <option value="">Select sector</option>
                {sectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>
                    {sector.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-theme-secondary">Product (Optional)</label>
              <select
                value={selectedProduct}
                onChange={(event) => setSelectedProduct(event.target.value)}
                className="w-full rounded-lg border border-theme-light bg-theme-secondary px-3 py-2 text-theme-primary"
              >
                <option value="">No product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-dashed border-theme-dark bg-theme-secondary p-4">
            <label className="mb-1 block text-sm font-medium text-theme-secondary">Data File</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.json,.txt,.tsv,.log,.pdf"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              className="w-full rounded-lg border border-theme-light bg-theme-card px-3 py-2 text-theme-primary"
            />
            <p className="mt-2 text-xs text-theme-muted">
              Analyze Errors reads the selected file and shows missing values, duplicate risk, type issues, and quality score before saving.
            </p>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${
                isUploading
                  ? "cursor-not-allowed bg-slate-500"
                  : "bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600"
              }`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  Upload And Store
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleAnalyzeErrors}
              disabled={isAnalyzing}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${
                isAnalyzing
                  ? "cursor-not-allowed bg-slate-500"
                  : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              }`}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4" />
                  Analyze Errors
                </>
              )}
            </button>
          </div>

          {result ? (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Stored In Database
              </h3>
              <p className="mt-2 text-sm text-emerald-700">{result.message}</p>
              <p className="mt-1 text-xs text-emerald-700">
                Raw ID: {result.raw_data_id} | Cleaned ID: {result.cleaned_data_id}
              </p>
              {renderExtractionDetails(result)}
            </div>
          ) : null}

          {analysisResult ? (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/20">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                <Sparkles className="h-4 w-4" />
                Dataset Error Analysis
              </h3>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Rows: {analysisResult.summary?.rows ?? 0} | Columns: {analysisResult.summary?.columns ?? 0} | Quality: {analysisResult.summary?.quality_score ?? 0}%
              </p>
              {renderExtractionDetails(analysisResult, "amber")}

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-amber-100 bg-white p-3 dark:border-amber-800 dark:bg-slate-900/60">
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-theme-secondary">
                    <PieChartIcon className="h-3.5 w-3.5" />
                    Issue Distribution
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={analysisResult.issues || []} dataKey="count" nameKey="name" outerRadius={80} label>
                        {(analysisResult.issues || []).map((entry, index) => (
                          <Cell key={entry.name} fill={["#ef4444", "#f97316", "#eab308", "#0ea5e9"][index % 4]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-lg border border-amber-100 bg-white p-3 dark:border-amber-800 dark:bg-slate-900/60">
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-theme-secondary">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Missing Values By Column
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={analysisResult.column_missing || []}>
                      <CartesianGrid stroke="rgba(148,163,184,0.2)" strokeDasharray="3 3" />
                      <XAxis dataKey="column" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                      <YAxis stroke="var(--text-muted)" />
                      <Tooltip />
                      <Bar dataKey="missing" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="bg-theme-card rounded-lg border border-theme-light p-6 shadow-theme">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-theme-primary">
            <Database className="h-5 w-5 text-teal-600" />
            Recently Uploaded
          </h2>
          <div className="max-h-[28rem] space-y-2 overflow-y-auto">
            {uploadedHistory.length === 0 ? (
              <p className="text-sm text-theme-muted">No uploaded datasets yet.</p>
            ) : (
              uploadedHistory.slice().reverse().map((dataset) => (
                <div key={dataset.id} className="rounded-lg border border-theme-light bg-theme-secondary p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-theme-primary">
                      {dataset.name || `Dataset #${dataset.id}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleDeleteDataset(dataset.id)}
                      disabled={deletingId === dataset.id}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-theme-muted">
                    {dataset.sector_name || "General"} | {(dataset.file_type || "unknown").toUpperCase()} | {(dataset.row_count || 0).toLocaleString()} rows
                  </p>
                  <p className="mt-1 text-xs text-theme-muted">
                    {dataset.has_cleaned_data ? "Initial cleaned" : "Pending cleaning"}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

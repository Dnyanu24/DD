import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, FileUp, Loader2, Trash2 } from "lucide-react";
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

  useEffect(() => {
    let mounted = true;

    const loadInitial = async () => {
      setIsLoading(true);
      try {
        const [sectorRows, uploaded] = await Promise.all([
          getSectors().catch(() => []),
          getUploadedData().catch(() => ({ data: [] })),
        ]);
        if (!mounted) return;
        setSectors(Array.isArray(sectorRows) ? sectorRows : []);
        setUploadedHistory(Array.isArray(uploaded?.data) ? uploaded.data : []);
        if (Array.isArray(sectorRows) && sectorRows.length > 0) {
          setSelectedSector(String(sectorRows[0].id));
        }
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
    if (!selectedFile || !selectedSector) {
      setError("Select sector and file before uploading.");
      return;
    }
    setError("");
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("sector_id", selectedSector);
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
      <div>
        <h1 className="text-3xl font-bold text-theme-primary">Data Upload</h1>
        <p className="mt-1 text-theme-muted">
          Upload file to database, run initial cleaning, and make it available in Data Cleaning.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="bg-theme-card rounded-xl border border-theme-light p-6 xl:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-theme-primary">
            <FileUp className="h-5 w-5 text-teal-500" />
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

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-theme-secondary">Data File</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              className="w-full rounded-lg border border-theme-light bg-theme-secondary px-3 py-2 text-theme-primary"
            />
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
            </div>
          ) : null}

          {analysisResult ? (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/20">
              <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">Dataset Error Analysis</h3>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Rows: {analysisResult.summary?.rows ?? 0} | Columns: {analysisResult.summary?.columns ?? 0} | Quality: {analysisResult.summary?.quality_score ?? 0}%
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-amber-100 bg-white p-3 dark:border-amber-800 dark:bg-slate-900/60">
                  <p className="mb-2 text-xs font-semibold text-theme-secondary">Issue Distribution</p>
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
                  <p className="mb-2 text-xs font-semibold text-theme-secondary">Missing Values By Column</p>
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

        <section className="bg-theme-card rounded-xl border border-theme-light p-6">
          <h2 className="mb-4 text-lg font-semibold text-theme-primary">Recently Uploaded</h2>
          <div className="max-h-[28rem] space-y-2 overflow-y-auto">
            {uploadedHistory.length === 0 ? (
              <p className="text-sm text-theme-muted">No uploaded datasets yet.</p>
            ) : (
              uploadedHistory.slice().reverse().map((dataset) => (
                <div key={dataset.id} className="rounded-lg border border-theme-light bg-theme-secondary p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-theme-primary">Dataset #{dataset.id}</p>
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
                    {dataset.sector_name || "General"} | {(dataset.row_count || 0).toLocaleString()} rows
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

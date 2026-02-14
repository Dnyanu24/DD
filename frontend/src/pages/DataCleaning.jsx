import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  PlayCircle,
  Search,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import {
  getDataCleaningStats,
  getUploadedData,
  runDataCleaning,
  streamDataCleaning,
} from "../services/api";

const CLEANING_ALGORITHMS = [
  { id: "full_pipeline", name: "Full Pipeline", description: "Dedup + imputation + outlier + typing + structuring." },
  { id: "missing_values", name: "Missing Value Imputation", description: "Fix null values with adaptive ML/median/mean strategy." },
  { id: "duplicates", name: "Duplicate Removal", description: "Remove duplicate rows and validate uniqueness." },
  { id: "outliers", name: "Outlier Detection", description: "Detect/cap outliers using adaptive statistical methods." },
  { id: "text_cleaning", name: "Text Cleaning", description: "Standardize and clean text fields with NLP normalization." },
];

function normalizeDataset(dataset, index) {
  return {
    id: dataset.id ?? index + 1,
    name: dataset.name ?? dataset.filename ?? `dataset_${dataset.id ?? index + 1}.csv`,
    sector: dataset.sector ?? dataset.sector_name ?? "General",
    records: Number(dataset.records ?? dataset.row_count ?? 0),
    qualityScore: Math.round(Number(dataset.qualityScore ?? dataset.quality_score ?? 0) * 100) / 100,
    status: dataset.has_cleaned_data ? "Cleaned" : "Pending",
    columns: Array.isArray(dataset.columns) ? dataset.columns : [],
  };
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function DataCleaning() {
  const [isLoading, setIsLoading] = useState(true);
  const [uploadedData, setUploadedData] = useState([]);
  const [cleaningStats, setCleaningStats] = useState(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("full_pipeline");
  const [query, setQuery] = useState("");
  const [isRunningCleaning, setIsRunningCleaning] = useState(false);
  const [cleaningProgress, setCleaningProgress] = useState(0);
  const [cleaningSteps, setCleaningSteps] = useState([]);
  const [cleaningLogs, setCleaningLogs] = useState([]);
  const [streamStatus, setStreamStatus] = useState("idle");

  const activeRunRef = useRef(0);
  const streamAbortRef = useRef(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statsResponse, dataResponse] = await Promise.all([
        getDataCleaningStats().catch(() => null),
        getUploadedData().catch(() => ({ data: [] })),
      ]);

      if (statsResponse) setCleaningStats(statsResponse);
      const rows = Array.isArray(dataResponse?.data) ? dataResponse.data : [];
      const normalized = rows.map(normalizeDataset);
      setUploadedData(normalized);
      if (normalized.length > 0) setSelectedDatasetId((prev) => prev ?? normalized[0].id);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    return () => {
      if (streamAbortRef.current) streamAbortRef.current.abort();
    };
  }, []);

  const filteredDatasets = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return uploadedData;
    return uploadedData.filter((dataset) =>
      dataset.name.toLowerCase().includes(lower) || dataset.sector.toLowerCase().includes(lower)
    );
  }, [query, uploadedData]);

  const selectedDataset = useMemo(
    () => uploadedData.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [uploadedData, selectedDatasetId]
  );

  const metricCards = useMemo(() => {
    const totalRows = uploadedData.reduce((sum, row) => sum + row.records, 0);
    const avgQuality = uploadedData.length
      ? Math.round(uploadedData.reduce((sum, row) => sum + Number(row.qualityScore || 0), 0) / uploadedData.length)
      : 0;
    return [
      { title: "Datasets Available", value: cleaningStats?.total_datasets ?? uploadedData.length },
      { title: "Rows Uploaded", value: (cleaningStats?.total_rows ?? totalRows).toLocaleString() },
      { title: "Average Quality", value: `${cleaningStats?.average_quality_score ?? avgQuality}%` },
      { title: "Rows Cleaned", value: (cleaningStats?.total_cleaned ?? 0).toLocaleString() },
    ];
  }, [cleaningStats, uploadedData]);

  const handleStartCleaning = async () => {
    if (!selectedDataset || isRunningCleaning) return;

    const runId = Date.now();
    activeRunRef.current = runId;
    if (streamAbortRef.current) streamAbortRef.current.abort();
    streamAbortRef.current = new AbortController();

    setIsRunningCleaning(true);
    setCleaningProgress(0);
    setCleaningSteps([]);
    setStreamStatus("connecting");
    setCleaningLogs([
      `[${formatTime(new Date())}] Selected dataset: ${selectedDataset.name}`,
      `[${formatTime(new Date())}] Algorithm: ${selectedAlgorithm}`,
    ]);

    try {
      let completeEvent = false;
      await streamDataCleaning(selectedDataset.id, selectedAlgorithm, {
        signal: streamAbortRef.current.signal,
        onEvent: ({ event, data }) => {
          if (activeRunRef.current !== runId) return;
          const now = formatTime(new Date());

          if (event === "start") {
            setStreamStatus("live");
            setCleaningLogs((prev) => [...prev, `[${now}] Real-time stream connected`]);
            if (data?.adaptive_config) {
              setCleaningLogs((prev) => [
                ...prev,
                `[${now}] Adaptive strategy => impute:${data.adaptive_config.impute_strategy}, outlier:${data.adaptive_config.outlier_method}, normalize:${Boolean(data.adaptive_config.normalize)}, standardize:${Boolean(data.adaptive_config.standardize)}`,
              ]);
            }
            if (data?.learning_feedback) {
              setCleaningLogs((prev) => [
                ...prev,
                `[${now}] Feedback learning => historical_quality:${data.learning_feedback.historical_quality_avg}, high_quality_rate:${data.learning_feedback.high_quality_rate}`,
              ]);
            }
            return;
          }

          if (event === "step") {
            const stepId = data.step_id || data.id || data.label || `step_${Date.now()}`;
            const step = {
              id: stepId,
              label: data.label || "Processing step",
              status: data.status || "running",
              stage: data.stage || "cleaning",
              technique: data.technique || "rule based",
              timestamp: data.timestamp || now,
            };

            setCleaningSteps((prev) => {
              const index = prev.findIndex((item) => item.id === step.id);
              if (index === -1) return [...prev, step];
              const next = [...prev];
              next[index] = { ...next[index], ...step };
              return next;
            });

            if (typeof data.progress === "number") {
              setCleaningProgress(Math.max(0, Math.min(100, Math.round(data.progress))));
            }
            setCleaningLogs((prev) => [
              ...prev,
              `[${now}] ${step.status === "completed" ? "Completed" : "Running"}: ${step.label} (${step.stage} / ${step.technique})`,
            ]);
            return;
          }

          if (event === "complete") {
            completeEvent = true;
            setStreamStatus("completed");
            setCleaningProgress(100);
            setCleaningLogs((prev) => [...prev, `[${now}] Cleaning completed successfully`]);
            setUploadedData((prev) =>
              prev.map((item) =>
                item.id === selectedDataset.id
                  ? {
                      ...item,
                      status: "Cleaned",
                      qualityScore: Math.round(Number(data?.quality_score ?? item.qualityScore) * 10000) / 100,
                    }
                  : item
              )
            );
            return;
          }

          if (event === "error") {
            setStreamStatus("error");
            setCleaningLogs((prev) => [...prev, `[${now}] Stream error: ${data?.message || "Unknown error"}`]);
          }
        },
      });

      if (!completeEvent) {
        setStreamStatus("fallback");
        const fallback = await runDataCleaning(selectedDataset.id, selectedAlgorithm);
        setCleaningProgress(100);
        setCleaningLogs((prev) => [...prev, `[${formatTime(new Date())}] ${fallback.message || "Fallback cleaning completed"}`]);
      }
      await loadData();
    } catch (error) {
      setStreamStatus("fallback");
      setCleaningLogs((prev) => [...prev, `[${formatTime(new Date())}] Stream failed, switching to fallback endpoint`]);
      try {
        const fallback = await runDataCleaning(selectedDataset.id, selectedAlgorithm);
        setCleaningProgress(100);
        setCleaningLogs((prev) => [...prev, `[${formatTime(new Date())}] ${fallback.message || "Fallback cleaning completed"}`]);
        await loadData();
      } catch (fallbackError) {
        setStreamStatus("error");
        setCleaningLogs((prev) => [...prev, `[${formatTime(new Date())}] Cleaning failed: ${fallbackError?.message || error?.message || "Unknown error"}`]);
      }
    } finally {
      if (activeRunRef.current === runId) setIsRunningCleaning(false);
    }
  };

  const streamStatusMeta = useMemo(() => {
    switch (streamStatus) {
      case "connecting":
        return { label: "Connecting", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" };
      case "live":
        return { label: "Live Stream", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" };
      case "fallback":
        return { label: "Fallback API", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" };
      case "error":
        return { label: "Stream Error", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" };
      case "completed":
        return { label: "Completed", className: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300" };
      default:
        return { label: "Idle", className: "bg-clay-100 text-clay-700 dark:bg-slate-800 dark:text-slate-300" };
    }
  }, [streamStatus]);

  return (
    <div className="data-cleaning-page min-h-screen p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-clay-900 dark:text-slate-100">Data Cleaning</h1>
        <p className="mt-1 text-clay-700 dark:text-slate-400">
          Choose uploaded data, run adaptive cleaning, and track real-time ML/NLP steps.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => (
          <div key={metric.title} className="clean-card rounded-xl border p-4">
            <p className="text-sm text-clay-700 dark:text-slate-400">{metric.title}</p>
            <p className="mt-1 text-2xl font-semibold text-clay-900 dark:text-slate-100">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="clean-card rounded-xl border xl:col-span-4">
          <div className="border-b border-clay-200 p-4 dark:border-slate-700">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-clay-900 dark:text-slate-100">
              <Database className="h-5 w-5 text-teal-500" />
              Uploaded Datasets
            </h2>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-clay-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
              <Search className="h-4 w-4 text-clay-500 dark:text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search datasets"
                className="w-full bg-transparent text-sm text-clay-900 outline-none placeholder:text-clay-400 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="max-h-[28rem] space-y-2 overflow-y-auto p-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-clay-500 dark:text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading datasets...
              </div>
            ) : filteredDatasets.length === 0 ? (
              <div className="py-10 text-center text-sm text-clay-500 dark:text-slate-400">
                No dataset found.
              </div>
            ) : (
              filteredDatasets.map((dataset) => {
                const selected = selectedDatasetId === dataset.id;
                return (
                  <button
                    key={dataset.id}
                    type="button"
                    onClick={() => setSelectedDatasetId(dataset.id)}
                    className={`clean-nav-item w-full rounded-lg border p-3 text-left transition ${
                      selected
                        ? "border-teal-500 bg-teal-50 dark:border-teal-400 dark:bg-teal-900/20"
                        : "border-clay-200 bg-white hover:border-teal-300 dark:border-slate-700 dark:bg-slate-900/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-clay-900 dark:text-slate-100">{dataset.name}</p>
                      <span className="rounded-full bg-clay-100 px-2 py-0.5 text-[11px] text-clay-700 dark:bg-slate-800 dark:text-slate-300">
                        {dataset.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-clay-600 dark:text-slate-400">
                      {dataset.sector} • {dataset.records.toLocaleString()} rows
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="space-y-6 xl:col-span-5">
          <div className="clean-card rounded-xl border p-5">
            <h2 className="text-lg font-semibold text-clay-900 dark:text-slate-100">Dataset And Algorithm</h2>
            {!selectedDataset ? (
              <p className="mt-4 text-sm text-clay-600 dark:text-slate-400">Select a dataset to start cleaning.</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-clay-50 p-3 dark:bg-slate-900/50">
                    <p className="text-xs text-clay-500 dark:text-slate-500">Dataset</p>
                    <p className="mt-1 text-sm font-medium text-clay-900 dark:text-slate-100">{selectedDataset.name}</p>
                  </div>
                  <div className="rounded-lg bg-clay-50 p-3 dark:bg-slate-900/50">
                    <p className="text-xs text-clay-500 dark:text-slate-500">Rows</p>
                    <p className="mt-1 text-sm font-medium text-clay-900 dark:text-slate-100">{selectedDataset.records.toLocaleString()}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {CLEANING_ALGORITHMS.map((algorithm) => {
                    const selected = selectedAlgorithm === algorithm.id;
                    return (
                      <button
                        key={algorithm.id}
                        type="button"
                        onClick={() => setSelectedAlgorithm(algorithm.id)}
                        disabled={isRunningCleaning}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          selected
                            ? "border-teal-500 bg-teal-50 dark:border-teal-400 dark:bg-teal-900/20"
                            : "border-clay-200 bg-white hover:border-teal-300 dark:border-slate-700 dark:bg-slate-900/50"
                        }`}
                      >
                        <p className="text-sm font-semibold text-clay-900 dark:text-slate-100">{algorithm.name}</p>
                        <p className="mt-1 text-xs text-clay-600 dark:text-slate-400">{algorithm.description}</p>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleStartCleaning}
                  disabled={isRunningCleaning}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white ${
                    isRunningCleaning
                      ? "cursor-not-allowed bg-slate-500"
                      : "bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600"
                  }`}
                >
                  {isRunningCleaning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cleaning...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4" />
                      Clean Data
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="clean-card rounded-xl border xl:col-span-3">
          <div className="border-b border-clay-200 p-4 dark:border-slate-700">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-clay-900 dark:text-slate-100">
                <WandSparkles className="h-5 w-5 text-teal-500" />
                Realtime Steps
              </h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${streamStatusMeta.className}`}>
                {streamStatusMeta.label}
              </span>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs text-clay-600 dark:text-slate-400">
                <span>Progress</span>
                <span>{cleaningProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-clay-200 dark:bg-slate-700">
                <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-500" style={{ width: `${cleaningProgress}%` }} />
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {cleaningSteps.length === 0 ? (
                <p className="text-sm text-clay-500 dark:text-slate-400">Step timeline appears when cleaning starts.</p>
              ) : (
                cleaningSteps.map((step) => (
                  <div key={step.id} className="rounded-lg border border-clay-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-clay-900 dark:text-slate-100">{step.label}</p>
                      {step.status === "completed" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : step.status === "running" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-teal-500" />
                      ) : (
                        <Sparkles className="h-4 w-4 text-clay-400 dark:text-slate-500" />
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-clay-500 dark:text-slate-500">
                      {step.timestamp} • {step.stage} • {step.technique}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-lg border border-clay-200 bg-clay-50 p-3 dark:border-slate-700 dark:bg-slate-950/70">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-clay-900 dark:text-slate-100">
                <FileText className="h-4 w-4 text-clay-600 dark:text-slate-400" />
                Live Logs
              </h3>
              <div className="max-h-40 space-y-1 overflow-y-auto font-mono text-xs">
                {cleaningLogs.length === 0 ? (
                  <p className="text-clay-500 dark:text-slate-500">No logs yet.</p>
                ) : (
                  cleaningLogs.map((log, index) => (
                    <p key={`${log}-${index}`} className="text-clay-700 dark:text-slate-300">
                      {log}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

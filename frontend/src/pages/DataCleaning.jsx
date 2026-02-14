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

const FALLBACK_DATASETS = [
  {
    id: 101,
    name: "sales_q1_2026.csv",
    sector: "Sales",
    records: 15420,
    qualityScore: 82,
    status: "Pending",
    columns: ["date", "invoice_id", "region", "customer", "revenue"],
  },
  {
    id: 102,
    name: "operations_log_jan.xlsx",
    sector: "Operations",
    records: 8902,
    qualityScore: 88,
    status: "Pending",
    columns: ["timestamp", "plant", "machine_id", "downtime_minutes"],
  },
  {
    id: 103,
    name: "support_tickets.json",
    sector: "Support",
    records: 6240,
    qualityScore: 79,
    status: "Pending",
    columns: ["ticket_id", "priority", "opened_at", "status", "agent"],
  },
];

const CLEANING_ALGORITHMS = [
  {
    id: "missing_values",
    name: "Missing Value Imputation",
    description: "Find null values and fill using contextual strategy.",
    steps: [
      "Scan columns for missing values",
      "Select best fill strategy per column",
      "Apply imputations",
      "Validate data consistency",
    ],
  },
  {
    id: "duplicates",
    name: "Duplicate Removal",
    description: "Detect and remove exact and fuzzy duplicate rows.",
    steps: [
      "Build row fingerprints",
      "Detect exact duplicates",
      "Detect fuzzy duplicates",
      "Remove redundant rows",
    ],
  },
  {
    id: "outliers",
    name: "Outlier Detection",
    description: "Flag extreme values with IQR and z-score checks.",
    steps: [
      "Compute distribution profile",
      "Run IQR check",
      "Run z-score check",
      "Tag outlier records",
    ],
  },
];

function normalizeDataset(dataset, index) {
  return {
    id: dataset.id ?? dataset.data_id ?? index + 1,
    name: dataset.name ?? dataset.filename ?? `dataset_${index + 1}.csv`,
    sector: dataset.sector ?? dataset.sector_name ?? "General",
    records: dataset.records ?? dataset.row_count ?? 0,
    qualityScore: dataset.qualityScore ?? dataset.quality_score ?? 0,
    status: dataset.status ?? "Pending",
    columns: dataset.columns ?? [],
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
  const [selectedAlgorithm, setSelectedAlgorithm] = useState(CLEANING_ALGORITHMS[0].id);
  const [query, setQuery] = useState("");
  const [isRunningCleaning, setIsRunningCleaning] = useState(false);
  const [cleaningProgress, setCleaningProgress] = useState(0);
  const [cleaningSteps, setCleaningSteps] = useState([]);
  const [cleaningLogs, setCleaningLogs] = useState([]);
  const [streamStatus, setStreamStatus] = useState("idle");

  const activeRunRef = useRef(0);
  const streamAbortRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setIsLoading(true);
      try {
        const [statsResponse, dataResponse] = await Promise.all([
          getDataCleaningStats().catch(() => null),
          getUploadedData().catch(() => null),
        ]);

        if (!isMounted) {
          return;
        }

        if (statsResponse) {
          setCleaningStats(statsResponse);
        }

        const rows = Array.isArray(dataResponse)
          ? dataResponse
          : Array.isArray(dataResponse?.data)
            ? dataResponse.data
            : [];

        const normalized = (rows.length > 0 ? rows : FALLBACK_DATASETS).map(normalizeDataset);
        setUploadedData(normalized);

        if (normalized.length > 0) {
          setSelectedDatasetId((previous) => previous ?? normalized[0].id);
        }
      } catch {
        if (!isMounted) {
          return;
        }
        const normalized = FALLBACK_DATASETS.map(normalizeDataset);
        setUploadedData(normalized);
        if (normalized.length > 0) {
          setSelectedDatasetId((previous) => previous ?? normalized[0].id);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
      activeRunRef.current += 1;
      if (streamAbortRef.current) {
        streamAbortRef.current.abort();
      }
    };
  }, []);

  const filteredDatasets = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) {
      return uploadedData;
    }
    return uploadedData.filter((dataset) => {
      return (
        dataset.name.toLowerCase().includes(lower) ||
        dataset.sector.toLowerCase().includes(lower)
      );
    });
  }, [query, uploadedData]);

  const selectedDataset = useMemo(() => {
    return uploadedData.find((dataset) => dataset.id === selectedDatasetId) ?? null;
  }, [uploadedData, selectedDatasetId]);

  const currentAlgorithm = useMemo(() => {
    return CLEANING_ALGORITHMS.find((algorithm) => algorithm.id === selectedAlgorithm);
  }, [selectedAlgorithm]);

  const metricCards = useMemo(() => {
    const datasetCount = uploadedData.length;
    const totalRecords = uploadedData.reduce((sum, item) => sum + item.records, 0);
    const averageQuality = uploadedData.length
      ? Math.round(
          uploadedData.reduce((sum, item) => sum + Number(item.qualityScore || 0), 0) / uploadedData.length
        )
      : 0;

    return [
      {
        title: "Datasets Available",
        value: cleaningStats?.total_datasets ?? datasetCount,
      },
      {
        title: "Rows Uploaded",
        value: (cleaningStats?.total_rows ?? totalRecords).toLocaleString(),
      },
      {
        title: "Average Quality",
        value: `${cleaningStats?.average_quality_score ?? averageQuality}%`,
      },
      {
        title: "Rows Cleaned",
        value: (cleaningStats?.total_cleaned ?? 0).toLocaleString(),
      },
    ];
  }, [cleaningStats, uploadedData]);

  const handleStartCleaning = async () => {
    if (!selectedDataset || !currentAlgorithm || isRunningCleaning) {
      return;
    }

    const runId = Date.now();
    activeRunRef.current = runId;
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
    }
    streamAbortRef.current = new AbortController();

    setIsRunningCleaning(true);
    setCleaningProgress(0);
    setCleaningSteps([]);
    setCleaningLogs([
      `[${formatTime(new Date())}] Selected dataset: ${selectedDataset.name}`,
      `[${formatTime(new Date())}] Algorithm: ${currentAlgorithm.name}`,
    ]);
    setStreamStatus("connecting");

    try {
      let streamCompleted = false;
      await streamDataCleaning(selectedDataset.id, currentAlgorithm.id, {
        signal: streamAbortRef.current.signal,
        onEvent: ({ event, data }) => {
          if (activeRunRef.current !== runId) {
            return;
          }

          const now = formatTime(new Date());
          if (event === "start") {
            setStreamStatus("live");
            setCleaningLogs((prev) => [...prev, `[${now}] Cleaning stream started`]);
            return;
          }

          if (event === "step") {
            const stepId = data.step_id || data.id || data.label;
            const label = data.label || "Processing step";
            const status = data.status || "running";
            const timestamp = data.timestamp || now;

            setCleaningSteps((prev) => {
              const index = prev.findIndex((step) => step.id === stepId);
              if (index >= 0) {
                const next = [...prev];
                next[index] = { ...next[index], label, status, timestamp };
                return next;
              }
              return [...prev, { id: stepId, label, status, timestamp }];
            });

            if (typeof data.progress === "number") {
              setCleaningProgress(Math.max(0, Math.min(100, Math.round(data.progress))));
            }
            setCleaningLogs((prev) => [...prev, `[${now}] ${status === "completed" ? "Completed" : "Running"}: ${label}`]);
            return;
          }

          if (event === "complete") {
            streamCompleted = true;
            setStreamStatus("completed");
            setCleaningProgress(100);
            setUploadedData((prev) =>
              prev.map((dataset) =>
                dataset.id === selectedDataset.id
                  ? {
                      ...dataset,
                      status: "Cleaned",
                      qualityScore: data?.quality_score
                        ? Math.round(Number(data.quality_score) * 100)
                        : Math.min(100, Math.max(dataset.qualityScore, 88)),
                    }
                  : dataset
              )
            );
            setCleaningLogs((prev) => [...prev, `[${now}] Data cleaning finished successfully.`]);
            return;
          }

          if (event === "error") {
            setStreamStatus("error");
            const message = data?.message || "Cleaning stream failed";
            setCleaningLogs((prev) => [...prev, `[${now}] Error: ${message}`]);
          }
        },
      });

      if (!streamCompleted) {
        setStreamStatus("fallback");
        const fallbackResult = await runDataCleaning(selectedDataset.id, currentAlgorithm.id);
        const doneTime = formatTime(new Date());
        setCleaningProgress(100);
        setUploadedData((prev) =>
          prev.map((dataset) =>
            dataset.id === selectedDataset.id
              ? {
                  ...dataset,
                  status: "Cleaned",
                  qualityScore: Math.min(100, Math.max(dataset.qualityScore, 88)),
                }
              : dataset
          )
        );
        setCleaningLogs((prev) => [
          ...prev,
          `[${doneTime}] ${fallbackResult?.message || "Cleaning completed with fallback API."}`,
        ]);
      }
    } catch (error) {
      setStreamStatus("fallback");
      const fallbackTime = formatTime(new Date());
      setCleaningLogs((prev) => [
        ...prev,
        `[${fallbackTime}] Streaming failed. Switching to fallback clean endpoint...`,
      ]);
      try {
        const fallbackResult = await runDataCleaning(selectedDataset.id, currentAlgorithm.id);
        setCleaningProgress(100);
        setUploadedData((prev) =>
          prev.map((dataset) =>
            dataset.id === selectedDataset.id
              ? {
                  ...dataset,
                  status: "Cleaned",
                  qualityScore: Math.min(100, Math.max(dataset.qualityScore, 88)),
                }
              : dataset
          )
        );
        setCleaningLogs((prev) => [
          ...prev,
          `[${formatTime(new Date())}] ${fallbackResult?.message || "Fallback cleaning completed."}`,
        ]);
      } catch (fallbackError) {
        setStreamStatus("error");
        const message =
          fallbackError?.message ||
          error?.message ||
          "Cleaning failed. Please retry.";
        setCleaningLogs((prev) => [...prev, `[${formatTime(new Date())}] Error: ${message}`]);
      }
    } finally {
      if (activeRunRef.current === runId) {
        setIsRunningCleaning(false);
      }
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
          Select uploaded data, choose a cleaning algorithm, and track each step in real time.
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
              Uploaded Data Navigation
            </h2>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-clay-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
              <Search className="h-4 w-4 text-clay-500 dark:text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search dataset"
                className="w-full bg-transparent text-sm text-clay-900 outline-none placeholder:text-clay-400 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="max-h-[27rem] space-y-2 overflow-y-auto p-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-clay-500 dark:text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading uploaded data...
              </div>
            ) : null}

            {!isLoading && filteredDatasets.length === 0 ? (
              <div className="py-10 text-center text-sm text-clay-500 dark:text-slate-400">
                No uploaded dataset found.
              </div>
            ) : null}

            {!isLoading &&
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
                        : "border-clay-200 bg-white hover:border-teal-300 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-teal-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-clay-900 dark:text-slate-100">
                        {dataset.name}
                      </p>
                      <span className="rounded-full bg-clay-100 px-2 py-0.5 text-[11px] text-clay-700 dark:bg-slate-800 dark:text-slate-300">
                        {dataset.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-clay-600 dark:text-slate-400">
                      {dataset.sector} • {dataset.records.toLocaleString()} rows
                    </p>
                  </button>
                );
              })}
          </div>
        </section>

        <section className="space-y-6 xl:col-span-5">
          <div className="clean-card rounded-xl border p-5">
            <h2 className="text-lg font-semibold text-clay-900 dark:text-slate-100">Selected Dataset</h2>
            {!selectedDataset ? (
              <p className="mt-4 text-sm text-clay-600 dark:text-slate-400">
                Select an uploaded dataset from navigation to start.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-clay-50 p-3 dark:bg-slate-900/50">
                    <p className="text-xs text-clay-500 dark:text-slate-500">Dataset Name</p>
                    <p className="mt-1 text-sm font-medium text-clay-900 dark:text-slate-100">{selectedDataset.name}</p>
                  </div>
                  <div className="rounded-lg bg-clay-50 p-3 dark:bg-slate-900/50">
                    <p className="text-xs text-clay-500 dark:text-slate-500">Records</p>
                    <p className="mt-1 text-sm font-medium text-clay-900 dark:text-slate-100">
                      {selectedDataset.records.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg bg-clay-50 p-3 dark:bg-slate-900/50">
                    <p className="text-xs text-clay-500 dark:text-slate-500">Quality Score</p>
                    <p className="mt-1 text-sm font-medium text-clay-900 dark:text-slate-100">
                      {selectedDataset.qualityScore}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-clay-50 p-3 dark:bg-slate-900/50">
                    <p className="text-xs text-clay-500 dark:text-slate-500">Status</p>
                    <p className="mt-1 text-sm font-medium text-clay-900 dark:text-slate-100">
                      {selectedDataset.status}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-clay-800 dark:text-slate-200">
                    Cleaning Algorithm
                  </p>
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
                              : "border-clay-200 bg-white hover:border-teal-300 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-teal-700"
                          }`}
                        >
                          <p className="text-sm font-semibold text-clay-900 dark:text-slate-100">
                            {algorithm.name}
                          </p>
                          <p className="mt-1 text-xs text-clay-600 dark:text-slate-400">
                            {algorithm.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleStartCleaning}
                  disabled={isRunningCleaning}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white transition ${
                    isRunningCleaning
                      ? "cursor-not-allowed bg-slate-500"
                      : "bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600"
                  }`}
                >
                  {isRunningCleaning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cleaning Data...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4" />
                      Clean Selected Data
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
                Realtime Cleaning Steps
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
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-500"
                  style={{ width: `${cleaningProgress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {cleaningSteps.length === 0 ? (
                <p className="text-sm text-clay-500 dark:text-slate-400">
                  Step timeline appears here when cleaning starts.
                </p>
              ) : (
                cleaningSteps.map((step) => (
                  <div
                    key={step.id || step.label}
                    className="rounded-lg border border-clay-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900/50"
                  >
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
                    {step.timestamp ? (
                      <p className="mt-1 text-[11px] text-clay-500 dark:text-slate-500">{step.timestamp}</p>
                    ) : null}
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

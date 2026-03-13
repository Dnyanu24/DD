import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  Brain,
  Building2,
  Loader2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import KPICard from "../components/KPICard";
import { getCeoGrowthOutlook, getRolePredictions } from "../services/api";
import { useAuth } from "../context/AuthContext";

const chartColors = {
  growth: "#0F766E",
  projection: "#22C55E",
  quality: "#0891B2",
  grid: "rgba(148, 163, 184, 0.16)",
  invest: "#14B8A6",
  watch: "#F59E0B",
  avoid: "#EF4444",
};

function formatCompact(value) {
  const numeric = Number(value || 0);
  if (Math.abs(numeric) >= 1000000) return `${(numeric / 1000000).toFixed(1)}M`;
  if (Math.abs(numeric) >= 1000) return `${(numeric / 1000).toFixed(1)}k`;
  return `${Math.round(numeric)}`;
}

function recommendationTone(recommendation) {
  if (recommendation === "Invest") return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (recommendation === "Watch") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function sourceTone(source) {
  if (source === "cleaned") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (source === "mixed") return "bg-cyan-50 text-cyan-700 border-cyan-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function AIModels() {
  const { user } = useAuth();
  const isCeoView = user?.role === "CEO";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState({ role: "", company_id: null, predictions: [] });
  const [outlookLoading, setOutlookLoading] = useState(false);
  const [outlookError, setOutlookError] = useState("");
  const [growthOutlook, setGrowthOutlook] = useState(null);

  const loadRolePredictions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getRolePredictions();
      setPayload({
        role: data?.role || "",
        company_id: data?.company_id ?? null,
        predictions: Array.isArray(data?.predictions) ? data.predictions : [],
      });
    } catch (err) {
      setError(err.message || "Failed to load role predictions");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGrowthOutlook = useCallback(async () => {
    if (!isCeoView) return;
    setOutlookLoading(true);
    setOutlookError("");
    try {
      const data = await getCeoGrowthOutlook();
      setGrowthOutlook(data);
    } catch (err) {
      setOutlookError(err.message || "Failed to load CEO growth outlook");
    } finally {
      setOutlookLoading(false);
    }
  }, [isCeoView]);

  useEffect(() => {
    loadRolePredictions();
  }, [loadRolePredictions]);

  useEffect(() => {
    if (!isCeoView) return;
    loadGrowthOutlook();
  }, [isCeoView, loadGrowthOutlook]);

  const summary = useMemo(() => growthOutlook?.summary || {}, [growthOutlook]);
  const timeline = useMemo(
    () => (Array.isArray(growthOutlook?.timeline) ? growthOutlook.timeline : []),
    [growthOutlook]
  );
  const sectorOutlook = useMemo(
    () => (Array.isArray(growthOutlook?.sector_outlook) ? growthOutlook.sector_outlook : []),
    [growthOutlook]
  );
  const productOpportunities = useMemo(
    () => (Array.isArray(growthOutlook?.product_opportunities) ? growthOutlook.product_opportunities : []),
    [growthOutlook]
  );
  const recommendations = useMemo(
    () => (Array.isArray(growthOutlook?.recommendations) ? growthOutlook.recommendations : []),
    [growthOutlook]
  );

  const allocationData = useMemo(
    () => [
      { name: "Invest", value: Number(summary.invest_count || 0), color: chartColors.invest },
      { name: "Watch", value: Number(summary.watch_count || 0), color: chartColors.watch },
      { name: "Avoid", value: Number(summary.avoid_count || 0), color: chartColors.avoid },
    ],
    [summary]
  );

  const topPredictionCards = useMemo(() => {
    if (isCeoView) {
      return [
        {
          title: "Projected Company Growth",
          value: `${summary.projected_growth_percent ?? 0}%`,
          change: `${summary.invest_count ?? 0} sectors ready`,
          changeType: Number(summary.projected_growth_percent || 0) >= 0 ? "positive" : "negative",
        },
        {
          title: "AI Confidence",
          value: `${summary.avg_confidence ?? 0}%`,
          change: `${summary.cleaned_datasets ?? 0} cleaned datasets`,
          changeType: "positive",
        },
        {
          title: "Best Sector",
          value: summary.top_sector || "No signal",
          change: summary.top_product ? `Lead product: ${summary.top_product}` : "Awaiting product signal",
          changeType: "positive",
        },
        {
          title: "Best Product",
          value: summary.top_product || "No signal",
          change: summary.top_product_sector ? `Sector: ${summary.top_product_sector}` : "No sector mapping",
          changeType: "positive",
        },
      ];
    }

    return payload.predictions.slice(0, 4).map((item) => ({
      title: item.title,
      value: `${item.value}${item.unit === "%" ? "%" : ""}`,
      change: item.unit === "%" ? `${item.value}%` : `${item.value} ${item.unit}`,
      changeType: "positive",
    }));
  }, [isCeoView, payload.predictions, summary]);

  const leaderboardData = sectorOutlook.slice(0, 6).map((item) => ({
    sector: item.sector_name,
    growth: item.growth_percent,
    confidence: item.confidence,
    investment: item.investment_score,
  }));

  const decisionQuadrantData = sectorOutlook.map((item) => ({
    x: item.growth_percent,
    y: item.confidence,
    z: Math.max(Number(item.investment_score || 0), 20),
    sector: item.sector_name,
    product: item.top_product,
    recommendation: item.recommendation,
  }));

  const allocationComparisonData = sectorOutlook.slice(0, 6).map((item) => ({
    sector: item.sector_name,
    growth: item.growth_percent,
    quality: item.avg_quality,
    confidence: item.confidence,
  }));

  const combinedSectorSignalData = sectorOutlook.slice(0, 6).map((item) => ({
    sector: item.sector_name,
    signal: Number(item.metric_total || 0),
    investment: Number(item.investment_score || 0),
    recommendation: item.recommendation,
  }));

  const combinedSectorNarrative = useMemo(() => {
    if (!isCeoView) return "";
    if (!sectorOutlook.length) return "No combined sector signal is available yet because the database does not have enough sector data to build the AI model.";

    const investLeads = sectorOutlook
      .filter((item) => item.recommendation === "Invest")
      .slice(0, 2)
      .map((item) => `${item.sector_name} via ${item.top_product}`)
      .join(", ");
    const cautionLeads = sectorOutlook
      .filter((item) => item.recommendation === "Do Not Invest")
      .slice(0, 2)
      .map((item) => item.sector_name)
      .join(", ");

    return `This prediction model is using the combined database data from ${summary.sector_count ?? 0} sectors. It prefers cleaned datasets and falls back to raw datasets where needed. The strongest merged growth signal is ${summary.top_sector || "not available"}${investLeads ? `, with leading investment candidates in ${investLeads}` : ""}${cautionLeads ? `. Current caution sectors are ${cautionLeads}` : ""}.`;
  }, [isCeoView, sectorOutlook, summary]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-theme-primary">{isCeoView ? "AI Growth Intelligence" : "AI Predictions"}</h1>
        <p className="mt-1 text-theme-muted">
          {isCeoView
            ? `Company-wide AI investment view using database-backed sector and product datasets from company ${payload.company_id ?? "-"}.`
            : `Role-based predictions using datasets you accessed in company ${payload.company_id ?? "-"}.`}
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-[35vh] items-center justify-center text-theme-muted">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading AI predictions...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {topPredictionCards.map((item) => (
              <KPICard
                key={item.title}
                title={item.title}
                value={item.value}
                change={item.change}
                changeType={item.changeType}
              />
            ))}
          </div>

          {isCeoView ? (
            <>
              <section className="relative overflow-hidden rounded-[28px] border border-theme-light bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.18),_transparent_36%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(240,253,250,0.98))] p-6 shadow-theme">
                <div className="absolute inset-y-0 right-0 w-80 bg-[radial-gradient(circle_at_center,_rgba(14,165,233,0.14),_transparent_62%)]" />
                <div className="relative grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_0.7fr]">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
                      <Brain className="h-3.5 w-3.5" />
                      CEO AI Model View
                    </div>
                    <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                      Predicted growth, top products, and investment signals across your sectors.
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                      This AI page uses cleaned company data from the database to estimate sector momentum, identify the products carrying that growth,
                      and recommend where the organization should invest or hold back.
                    </p>
                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Sectors Tracked</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.sector_count ?? 0}</p>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Growth Signal</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.projected_growth_percent ?? 0}%</p>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Top Product</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{summary.top_product || "No signal"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-teal-50 p-3 text-teal-700">
                          <TrendingUp className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Investment Status</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {summary.invest_count ?? 0} invest / {summary.watch_count ?? 0} watch
                          </p>
                        </div>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        Highest opportunity is currently in {summary.top_sector || "the company backlog"} with {summary.avg_confidence ?? 0}% AI confidence.
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-slate-200/80 bg-slate-900 p-5 text-white shadow-sm">
                      <p className="text-xs uppercase tracking-[0.18em] text-teal-200">Cleaned Data Coverage</p>
                      <p className="mt-3 text-3xl font-semibold">{summary.cleaned_datasets ?? 0}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        The AI model is reading sector and product combinations directly from the database using cleaned data first and raw fallback second.
                      </p>
                      {Number(summary.raw_fallback_datasets || 0) > 0 ? (
                        <p className="mt-3 text-xs text-teal-100">
                          {summary.raw_fallback_datasets} datasets are being predicted through raw-data fallback where cleaned output is not yet available.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-theme-light bg-theme-card p-6 shadow-theme">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-teal-50 p-3 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                    <Brain className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-theme-primary">Combined Sector Model Summary</h3>
                    <p className="mt-2 max-w-4xl text-sm leading-7 text-theme-muted">
                      {combinedSectorNarrative}
                    </p>
                  </div>
                </div>
              </section>

              {outlookError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{outlookError}</div>
              ) : null}

              {!outlookLoading && !outlookError && sectorOutlook.length === 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  AI prediction graphs are waiting for sector data in the database. Upload sector-linked datasets and the page will generate predictions from raw or cleaned records automatically.
                </div>
              ) : null}

              {outlookLoading ? (
                <div className="flex items-center justify-center rounded-2xl border border-theme-light bg-theme-card p-10 text-theme-muted">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading CEO growth outlook...
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.6fr]">
                    <section className="rounded-[28px] border border-theme-light bg-theme-card p-6 shadow-theme">
                      <div className="mb-6 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-semibold text-theme-primary">Growth Projection Curve</h3>
                          <p className="mt-1 text-sm text-theme-muted">Actual company signal vs AI-projected next-cycle trend from cleaned datasets.</p>
                        </div>
                        <div className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-medium text-theme-muted">
                          6-month outlook
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={320}>
                        <AreaChart data={timeline}>
                          <defs>
                            <linearGradient id="growthAreaAiPage" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={chartColors.growth} stopOpacity={0.38} />
                              <stop offset="95%" stopColor={chartColors.growth} stopOpacity={0.04} />
                            </linearGradient>
                            <linearGradient id="projectionAreaAiPage" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={chartColors.projection} stopOpacity={0.24} />
                              <stop offset="95%" stopColor={chartColors.projection} stopOpacity={0.03} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke={chartColors.grid} vertical={false} strokeDasharray="3 3" />
                          <XAxis dataKey="period" stroke="var(--text-muted)" axisLine={false} tickLine={false} />
                          <YAxis stroke="var(--text-muted)" axisLine={false} tickLine={false} tickFormatter={formatCompact} />
                          <Tooltip formatter={(value, name) => [formatCompact(value), name === "actual" ? "Actual" : "Projected"]} />
                          <Area type="monotone" dataKey="actual" stroke={chartColors.growth} fill="url(#growthAreaAiPage)" strokeWidth={3} />
                          <Area type="monotone" dataKey="projected" stroke={chartColors.projection} fill="url(#projectionAreaAiPage)" strokeWidth={2.5} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </section>

                    <section className="rounded-[28px] border border-theme-light bg-theme-card p-6 shadow-theme">
                      <div className="mb-4">
                        <h3 className="text-xl font-semibold text-theme-primary">Investment Allocation</h3>
                        <p className="mt-1 text-sm text-theme-muted">Sector recommendation split from the current AI outlook.</p>
                      </div>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={allocationData} innerRadius={62} outerRadius={96} paddingAngle={4} dataKey="value">
                            {allocationData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-4 space-y-2">
                        {allocationData.map((entry) => (
                          <div key={entry.name} className="flex items-center justify-between rounded-xl border border-theme-light bg-theme-secondary px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                              <span className="text-sm text-theme-primary">{entry.name}</span>
                            </div>
                            <span className="text-sm font-semibold text-theme-primary">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                    <section className="rounded-[28px] border border-theme-light bg-theme-card p-6 shadow-theme">
                      <div className="mb-6">
                        <h3 className="text-xl font-semibold text-theme-primary">Combined Sector Data Signal</h3>
                        <p className="mt-1 text-sm text-theme-muted">
                          This graph combines cleaned database signals from all sectors to show which sectors are contributing the most to the overall AI prediction.
                        </p>
                      </div>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={combinedSectorSignalData} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
                          <CartesianGrid stroke={chartColors.grid} horizontal={true} vertical={false} strokeDasharray="3 3" />
                          <XAxis type="number" stroke="var(--text-muted)" axisLine={false} tickLine={false} tickFormatter={formatCompact} />
                          <YAxis dataKey="sector" type="category" stroke="var(--text-muted)" axisLine={false} tickLine={false} width={90} />
                          <Tooltip formatter={(value, name) => [name === "signal" ? formatCompact(value) : value, name === "signal" ? "Combined Signal" : "Investment Score"]} />
                          <Bar dataKey="signal" radius={[0, 10, 10, 0]}>
                            {combinedSectorSignalData.map((entry) => (
                              <Cell
                                key={`${entry.sector}-signal`}
                                fill={
                                  entry.recommendation === "Invest"
                                    ? chartColors.invest
                                    : entry.recommendation === "Watch"
                                      ? chartColors.watch
                                      : chartColors.avoid
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </section>

                    <section className="rounded-[28px] border border-theme-light bg-theme-card p-6 shadow-theme">
                      <div className="mb-6">
                        <h3 className="text-xl font-semibold text-theme-primary">Database-Driven Decision Summary</h3>
                        <p className="mt-1 text-sm text-theme-muted">
                          Sector-level prediction is being generated from the combined database view of cleaned data, product mapping, and quality confidence.
                        </p>
                      </div>
                      <div className="space-y-3">
                        {sectorOutlook.slice(0, 4).map((sector) => (
                          <div key={`${sector.sector_id}-combined`} className="rounded-2xl border border-theme-light bg-theme-secondary p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-theme-primary">{sector.sector_name}</p>
                                <p className="mt-1 text-xs text-theme-muted">
                                  Combined signal {formatCompact(sector.metric_total)} | Top product {sector.top_product}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${sourceTone(sector.source)}`}>
                                  {sector.source}
                                </span>
                                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${recommendationTone(sector.recommendation)}`}>
                                  {sector.recommendation}
                                </span>
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-3">
                              <div className="rounded-xl bg-theme-card p-3">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-theme-muted">Growth</p>
                                <p className="mt-1 text-base font-semibold text-theme-primary">{sector.growth_percent}%</p>
                              </div>
                              <div className="rounded-xl bg-theme-card p-3">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-theme-muted">Confidence</p>
                                <p className="mt-1 text-base font-semibold text-theme-primary">{sector.confidence}%</p>
                              </div>
                              <div className="rounded-xl bg-theme-card p-3">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-theme-muted">Quality</p>
                                <p className="mt-1 text-base font-semibold text-theme-primary">{sector.avg_quality}%</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <section className="rounded-[28px] border border-theme-light bg-theme-card p-6 shadow-theme">
                      <div className="mb-6 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-semibold text-theme-primary">Sector Growth Ranking</h3>
                          <p className="mt-1 text-sm text-theme-muted">Growth potential, confidence, and investment score by sector.</p>
                        </div>
                        <button
                          type="button"
                          onClick={loadGrowthOutlook}
                          className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-medium text-theme-primary"
                        >
                          Refresh AI View
                        </button>
                      </div>
                      <ResponsiveContainer width="100%" height={340}>
                        <BarChart data={leaderboardData} layout="vertical" margin={{ left: 12, right: 12 }}>
                          <CartesianGrid stroke={chartColors.grid} horizontal={true} vertical={false} strokeDasharray="3 3" />
                          <XAxis type="number" stroke="var(--text-muted)" axisLine={false} tickLine={false} />
                          <YAxis dataKey="sector" type="category" stroke="var(--text-muted)" axisLine={false} tickLine={false} width={90} />
                          <Tooltip />
                          <Bar dataKey="investment" fill={chartColors.growth} radius={[0, 10, 10, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </section>

                    <section className="rounded-[28px] border border-theme-light bg-theme-card p-6 shadow-theme">
                      <div className="mb-6">
                        <h3 className="text-xl font-semibold text-theme-primary">CEO Recommendation Feed</h3>
                        <p className="mt-1 text-sm text-theme-muted">Where to invest, what to watch, and which product is carrying the signal.</p>
                      </div>
                      <div className="space-y-3">
                        {recommendations.length === 0 ? (
                          <div className="rounded-2xl border border-theme-light bg-theme-secondary p-4 text-sm text-theme-muted">
                            No recommendation signal yet.
                          </div>
                        ) : (
                          recommendations.map((item) => (
                            <div key={`${item.sector_name}-${item.product_name}`} className="rounded-2xl border border-theme-light bg-theme-secondary p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <Building2 className="h-4 w-4 text-teal-600" />
                                    <p className="text-sm font-semibold text-theme-primary">{item.sector_name}</p>
                                  </div>
                                  <p className="mt-1 text-sm text-theme-muted">Lead product: {item.product_name}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${sourceTone(sectorOutlook.find((sector) => sector.sector_name === item.sector_name)?.source)}`}>
                                    {sectorOutlook.find((sector) => sector.sector_name === item.sector_name)?.source || "raw"}
                                  </span>
                                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${recommendationTone(item.recommendation)}`}>
                                    {item.recommendation}
                                  </span>
                                </div>
                              </div>
                              <p className="mt-3 text-sm leading-6 text-theme-muted">{item.rationale}</p>
                              <div className="mt-3 flex items-center gap-2 text-xs text-theme-muted">
                                <ShieldCheck className="h-3.5 w-3.5 text-cyan-600" />
                                Confidence {item.confidence}%
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  </div>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
                    <section className="rounded-[28px] border border-theme-light bg-theme-card p-6 shadow-theme">
                      <div className="mb-6">
                        <h3 className="text-xl font-semibold text-theme-primary">Decision Quadrant</h3>
                        <p className="mt-1 text-sm text-theme-muted">
                          High-growth and high-confidence sectors are the strongest investment targets.
                        </p>
                      </div>
                      <ResponsiveContainer width="100%" height={320}>
                        <ScatterChart margin={{ top: 10, right: 18, bottom: 10, left: 10 }}>
                          <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" />
                          <XAxis
                            type="number"
                            dataKey="x"
                            name="Growth"
                            stroke="var(--text-muted)"
                            axisLine={false}
                            tickLine={false}
                            unit="%"
                          />
                          <YAxis
                            type="number"
                            dataKey="y"
                            name="Confidence"
                            stroke="var(--text-muted)"
                            axisLine={false}
                            tickLine={false}
                            unit="%"
                          />
                          <Tooltip
                            cursor={{ strokeDasharray: "3 3" }}
                            formatter={(value, name) => [`${value}%`, name === "x" ? "Growth" : "Confidence"]}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const point = payload[0].payload;
                              return (
                                <div className="rounded-xl border border-theme-light bg-white px-3 py-2 text-xs shadow-lg dark:bg-slate-900">
                                  <p className="font-semibold text-theme-primary">{point.sector}</p>
                                  <p className="mt-1 text-theme-muted">Product: {point.product}</p>
                                  <p className="text-theme-muted">Growth: {point.x}%</p>
                                  <p className="text-theme-muted">Confidence: {point.y}%</p>
                                  <p className="text-theme-muted">Decision: {point.recommendation}</p>
                                </div>
                              );
                            }}
                          />
                          <Scatter data={decisionQuadrantData} fill={chartColors.growth}>
                            {decisionQuadrantData.map((entry) => (
                              <Cell
                                key={`${entry.sector}-quadrant`}
                                fill={
                                  entry.recommendation === "Invest"
                                    ? chartColors.invest
                                    : entry.recommendation === "Watch"
                                      ? chartColors.watch
                                      : chartColors.avoid
                                }
                              />
                            ))}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </section>

                    <section className="rounded-[28px] border border-theme-light bg-theme-card p-6 shadow-theme">
                      <div className="mb-6">
                        <h3 className="text-xl font-semibold text-theme-primary">Decision Inputs By Sector</h3>
                        <p className="mt-1 text-sm text-theme-muted">
                          Compare the three main decision signals behind the recommendation engine.
                        </p>
                      </div>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={allocationComparisonData}>
                          <CartesianGrid stroke={chartColors.grid} vertical={false} strokeDasharray="3 3" />
                          <XAxis dataKey="sector" stroke="var(--text-muted)" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                          <YAxis stroke="var(--text-muted)" axisLine={false} tickLine={false} />
                          <Tooltip />
                          <Bar dataKey="growth" fill={chartColors.growth} radius={[8, 8, 0, 0]} />
                          <Bar dataKey="quality" fill={chartColors.quality} radius={[8, 8, 0, 0]} />
                          <Bar dataKey="confidence" fill={chartColors.projection} radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </section>
                  </div>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                    <section className="rounded-[28px] border border-theme-light bg-theme-card p-6 shadow-theme">
                      <div className="mb-5">
                        <h3 className="text-xl font-semibold text-theme-primary">Sector Decision Board</h3>
                        <p className="mt-1 text-sm text-theme-muted">Quality, growth, and best product recommendation for each sector.</p>
                      </div>
                      <div className="space-y-3">
                        {sectorOutlook.map((sector) => (
                          <div key={sector.sector_id} className="rounded-2xl border border-theme-light bg-theme-secondary p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-theme-primary">{sector.sector_name}</p>
                                <p className="mt-1 text-xs text-theme-muted">
                                  Top product: {sector.top_product} | Coverage {sector.coverage_percent}% | Cleaned {sector.cleaned_datasets}/{sector.source_datasets}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${sourceTone(sector.source)}`}>
                                  {sector.source}
                                </span>
                                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${recommendationTone(sector.recommendation)}`}>
                                  {sector.recommendation}
                                </span>
                              </div>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                              <div className="rounded-xl bg-theme-card p-3">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-theme-muted">Growth</p>
                                <p className="mt-1 text-lg font-semibold text-theme-primary">{sector.growth_percent}%</p>
                              </div>
                              <div className="rounded-xl bg-theme-card p-3">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-theme-muted">Quality</p>
                                <p className="mt-1 text-lg font-semibold text-theme-primary">{sector.avg_quality}%</p>
                              </div>
                              <div className="rounded-xl bg-theme-card p-3">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-theme-muted">Confidence</p>
                                <p className="mt-1 text-lg font-semibold text-theme-primary">{sector.confidence}%</p>
                              </div>
                              <div className="rounded-xl bg-theme-card p-3">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-theme-muted">Score</p>
                                <p className="mt-1 text-lg font-semibold text-theme-primary">{sector.investment_score}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-[28px] border border-theme-light bg-theme-card p-6 shadow-theme">
                      <div className="mb-6 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-semibold text-theme-primary">Product Momentum</h3>
                          <p className="mt-1 text-sm text-theme-muted">Top products across sectors ranked by AI investment score.</p>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                          <Sparkles className="h-3.5 w-3.5" />
                          Product intelligence
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={productOpportunities.slice(0, 6)}>
                          <CartesianGrid stroke={chartColors.grid} vertical={false} strokeDasharray="3 3" />
                          <XAxis dataKey="product_name" stroke="var(--text-muted)" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                          <YAxis stroke="var(--text-muted)" axisLine={false} tickLine={false} />
                          <Tooltip />
                          <Bar dataKey="growth_percent" radius={[10, 10, 0, 0]}>
                            {productOpportunities.slice(0, 6).map((entry) => (
                              <Cell
                                key={`${entry.sector_name}-${entry.product_name}`}
                                fill={
                                  entry.recommendation === "Invest"
                                    ? chartColors.invest
                                    : entry.recommendation === "Watch"
                                      ? chartColors.watch
                                      : chartColors.avoid
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>

                      <div className="mt-4 space-y-2">
                        {productOpportunities.slice(0, 4).map((product) => (
                          <div key={`${product.sector_name}-${product.product_name}-detail`} className="flex items-center justify-between rounded-xl border border-theme-light bg-theme-secondary px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-theme-primary">{product.product_name}</p>
                              <p className="text-xs text-theme-muted">{product.sector_name}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-theme-primary">{product.growth_percent}%</p>
                              <p className="text-xs text-theme-muted">{product.recommendation} | {product.source}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {payload.predictions.map((item) => (
                <div key={`${item.title}_detail`} className="rounded-xl border border-theme-light bg-theme-card p-4">
                  <p className="text-sm font-semibold text-theme-primary">{item.title}</p>
                  <p className="mt-1 text-xs text-theme-muted">{item.detail}</p>
                  <p className="mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                    Recommended: {item.recommended_action}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

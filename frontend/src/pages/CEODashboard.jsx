import { createElement, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Building2,
  CheckCircle2,
  Megaphone,
  Package,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UploadCloud,
  Users,
  XCircle,
} from "lucide-react";
import { createAnnouncement, getJoinRequests, reviewJoinRequest, getCeoGrowthOutlook, getDashboardData } from "../services/api";
import { useAuth } from "../context/AuthContext";
import RoleDashboardHero from "../components/RoleDashboardKit";

const chartColors = {
  primary: "#14B8A6",
  grid: "rgba(148, 163, 184, 0.1)",
  text: "#94A3B8",
};

function ExecutiveMetric({ title, value, hint, icon: Icon, tone = "teal" }) {
  const toneClass = {
    teal: "bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-950/40 dark:text-teal-200 dark:border-teal-900",
    blue: "bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-900",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900",
    amber: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
  }[tone];

  return (
    <div className="group rounded-lg border border-theme-light bg-theme-card p-4 shadow-theme transition hover:-translate-y-0.5 hover:border-teal-300">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-theme-muted">{title}</p>
          <p className="mt-3 text-3xl font-semibold text-theme-primary">{value}</p>
          <p className="mt-1 text-xs text-theme-muted">{hint}</p>
        </div>
        <div className={`rounded-lg border p-2.5 ${toneClass}`}>
          {createElement(Icon, { className: "h-5 w-5" })}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, action, children }) {
  return (
    <section className="rounded-lg border border-theme-light bg-theme-card p-5 shadow-theme">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon ? (
            <div className="rounded-lg bg-teal-50 p-2 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200">
              {createElement(Icon, { className: "h-5 w-5" })}
            </div>
          ) : null}
          <div>
            <h3 className="text-lg font-semibold text-theme-primary">{title}</h3>
            {subtitle ? <p className="mt-1 text-xs text-theme-muted">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}


export default function CEODashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [growthOutlook, setGrowthOutlook] = useState(null);
  const [error, setError] = useState("");
  const [joinRequests, setJoinRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [sectorSelections, setSectorSelections] = useState({});
  const [reviewingId, setReviewingId] = useState(null);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);

  const loadJoinRequests = async () => {
    setRequestsLoading(true);
    setRequestsError("");
    try {
      const rows = await getJoinRequests();
      setJoinRequests(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setRequestsError(error.message || "Failed to load join requests.");
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    loadJoinRequests();
  }, []);

  useEffect(() => {
    let alive = true;
    const loadData = async () => {
      setError("");
      try {
        const [dashRes, growthRes] = await Promise.all([
          getDashboardData(),
          getCeoGrowthOutlook()
        ]);
        if (alive) {
          setDashboard(dashRes);
          setGrowthOutlook(growthRes);
        }
      } catch (error) {
        if (alive) setError(error.message || "Failed to load CEO data.");
      }
    };
    loadData();
    return () => { alive = false; };
  }, []);

  const handleReview = async (request, action) => {
    setReviewingId(request.id);
    setRequestsError("");
    try {
      const sectorId = sectorSelections[request.id] ? Number(sectorSelections[request.id]) : null;
      await reviewJoinRequest(request.id, action, sectorId);
      await loadJoinRequests();
    } catch (error) {
      setRequestsError(error.message || "Review action failed.");
    } finally {
      setReviewingId(null);
    }
  };

  const pendingRequests = joinRequests.filter((item) => item.status === "pending");

  const computedKpis = useMemo(() => {
    const overview = dashboard?.company_overview || {};
    const sectorComparison = Array.isArray(dashboard?.sector_comparison) ? dashboard.sector_comparison : [];
    const avgQuality = sectorComparison.length ? sectorComparison.reduce((acc, row) => acc + Number(row.avg_quality || 0), 0) / sectorComparison.length : null;
    return {
      totalSectors: overview.total_sectors ?? 3,
      totalProducts: overview.total_products ?? 3,
      totalUploads: overview.total_uploads ?? 3,
      avgQuality: avgQuality != null ? Number(avgQuality).toFixed(2) : "91.5",
    };
  }, [dashboard]);

  // Dynamic chart data from growthOutlook
  const trendData = growthOutlook?.timeline?.map((p) => ({ month: p.period, revenue: p.actual })) || [
    { month: "Jan", revenue: 12500 },
    { month: "Feb", revenue: 14200 },
    // Fallback truncated
  ];

  const marketShareData = growthOutlook?.summary ? [
    { name: "Invest", value: growthOutlook.summary.invest_count || 1, color: "#14B8A6" },
    { name: "Watch", value: growthOutlook.summary.watch_count || 1, color: "#F59E0B" },
    { name: "Avoid", value: growthOutlook.summary.avoid_count || 1, color: "#EF4444" },
  ] : [
    { name: "SDAS", value: 35, color: "#14B8A6" },
    { name: "Others", value: 65, color: "#94A3B8" },
  ];

  const handlePostAnnouncement = async () => {
    if (!announcementTitle.trim() || !announcementMessage.trim()) return;
    setPostingAnnouncement(true);
    setRequestsError("");
    try {
      await createAnnouncement({
        title: announcementTitle.trim(),
        message: announcementMessage.trim(),
      });
      setAnnouncementTitle("");
      setAnnouncementMessage("");
    } catch (error) {
      setRequestsError(error.message || "Failed to post announcement.");
    } finally {
      setPostingAnnouncement(false);
    }
  };

  return (
    <div className="space-y-6">
      <RoleDashboardHero role="CEO" />

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
      {requestsError ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">{requestsError}</div> : null}

      <section className="overflow-hidden rounded-lg border border-theme-light bg-theme-card shadow-theme">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px]">
          <div className="p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              CEO Command Center
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-theme-primary">Executive overview for company performance</h1>
            <p className="mt-2 max-w-3xl text-sm text-theme-muted">
              Monitor data readiness, AI growth outlook, recommendations, and operational approvals from one dashboard.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">Role: {user?.role || "CEO"}</span>
              <span className="rounded-full bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">AI confidence {growthOutlook?.summary?.avg_confidence ?? 0}%</span>
              <span className="rounded-full bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">{pendingRequests.length} pending requests</span>
            </div>
          </div>
          <div className="border-t border-theme-light bg-theme-secondary p-5 lg:border-l lg:border-t-0">
            <p className="text-xs font-semibold uppercase text-theme-muted">Investment Status</p>
            <p className="mt-3 text-3xl font-semibold text-theme-primary">{growthOutlook?.summary?.invest_count ?? 0} invest</p>
            <p className="mt-1 text-sm text-theme-muted">
              Best sector: {growthOutlook?.summary?.top_sector || "No signal"}
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-theme-card p-3 text-center">
                <p className="text-lg font-semibold text-emerald-600">{growthOutlook?.summary?.invest_count ?? 0}</p>
                <p className="text-[11px] text-theme-muted">Invest</p>
              </div>
              <div className="rounded-lg bg-theme-card p-3 text-center">
                <p className="text-lg font-semibold text-amber-600">{growthOutlook?.summary?.watch_count ?? 0}</p>
                <p className="text-[11px] text-theme-muted">Watch</p>
              </div>
              <div className="rounded-lg bg-theme-card p-3 text-center">
                <p className="text-lg font-semibold text-red-600">{growthOutlook?.summary?.avoid_count ?? 0}</p>
                <p className="text-[11px] text-theme-muted">Avoid</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ExecutiveMetric title="Total Sectors" value={computedKpis.totalSectors} hint="Company coverage" icon={Building2} tone="teal" />
        <ExecutiveMetric title="Total Products" value={computedKpis.totalProducts} hint="Mapped product lines" icon={Package} tone="blue" />
        <ExecutiveMetric title="Total Uploads" value={computedKpis.totalUploads} hint="Datasets available" icon={UploadCloud} tone="green" />
        <ExecutiveMetric title="Avg Quality" value={`${computedKpis.avgQuality}%`} hint="Cleaned data reliability" icon={Target} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Growth Timeline" subtitle="AI outlook across upcoming periods" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="none" vertical={false} />
              <XAxis dataKey="month" stroke={chartColors.text} axisLine={false} tickLine={false} />
              <YAxis stroke={chartColors.text} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v/1000}k`} />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke={chartColors.primary} strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Recommendation Split" subtitle="Invest, watch, and avoid distribution" icon={Activity}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={marketShareData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value">
                {marketShareData.map((entry, idx) => (
                  <Cell key={`cell-${idx}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            {marketShareData.map((entry) => (
              <span key={entry.name} className="inline-flex items-center gap-2 text-xs font-semibold text-theme-muted">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.name}: {entry.value}
              </span>
            ))}
          </div>
        </Panel>
      </div>

      {growthOutlook?.recommendations && growthOutlook.recommendations.length ? (
        <Panel title="Top Recommendations" subtitle="AI-generated executive actions" icon={Sparkles}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {growthOutlook.recommendations.slice(0, 4).map((rec, idx) => (
              <div key={idx} className="rounded-lg border border-theme-light bg-theme-secondary p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-md bg-teal-100 p-1.5 text-teal-700 dark:bg-teal-950 dark:text-teal-200">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-theme-primary">{rec.recommendation}</p>
                <p className="mt-1 text-xs text-theme-muted">{rec.rationale}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Panel title="CEO Announcement" subtitle="Broadcast a message to company users" icon={Megaphone}>
          <div className="grid grid-cols-1 gap-3">
            <input
              value={announcementTitle}
              onChange={(e) => setAnnouncementTitle(e.target.value)}
              placeholder="Announcement title"
              className="rounded-lg border border-theme-light bg-theme-primary px-3 py-2 text-sm text-theme-primary"
            />
            <textarea
              value={announcementMessage}
              onChange={(e) => setAnnouncementMessage(e.target.value)}
              placeholder="Announcement message..."
              rows={4}
              className="rounded-lg border border-theme-light bg-theme-primary px-3 py-2 text-sm text-theme-primary"
            />
            <button
              type="button"
              onClick={handlePostAnnouncement}
              disabled={postingAnnouncement}
              className="inline-flex w-fit items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {postingAnnouncement ? "Posting..." : "Post Announcement"}
            </button>
          </div>
        </Panel>

        <Panel
          title="Pending Join Requests"
          subtitle="Approve or reject users waiting for access"
          icon={Users}
          action={
            <button
              type="button"
              onClick={loadJoinRequests}
              disabled={requestsLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-theme-light bg-theme-secondary px-3 py-1.5 text-xs font-semibold text-theme-primary hover:bg-theme-tertiary disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${requestsLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          }
        >
          {requestsLoading ? (
            <p className="text-sm text-theme-muted">Loading requests...</p>
          ) : pendingRequests.length === 0 ? (
            <div className="rounded-lg border border-theme-light bg-theme-secondary p-6 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="mt-2 text-sm font-semibold text-theme-primary">No pending requests</p>
              <p className="mt-1 text-xs text-theme-muted">All user access requests are handled.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <div key={request.id} className="rounded-lg border border-theme-light bg-theme-secondary p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-theme-primary">{request.username}</p>
                      <p className="text-xs text-theme-muted">
                        Role: {request.requested_role} | Company ID: {request.company_id}
                      </p>
                    </div>
                    {request.requested_role_key === "sector_head" ? (
                      <input
                        type="number"
                        min="1"
                        placeholder="Sector ID"
                        value={sectorSelections[request.id] || ""}
                        onChange={(event) =>
                          setSectorSelections((prev) => ({ ...prev, [request.id]: event.target.value }))
                        }
                        className="w-28 rounded-lg border border-theme-light bg-theme-primary px-2 py-1 text-sm text-theme-primary"
                      />
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={reviewingId === request.id}
                        onClick={() => handleReview(request, "approve")}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={reviewingId === request.id}
                        onClick={() => handleReview(request, "reject")}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

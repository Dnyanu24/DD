import { useEffect, useMemo, useState } from "react";
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
import KPICard from "../components/KPICard";
import { createAnnouncement, getAnnouncements, getJoinRequests, reviewJoinRequest, getCeoGrowthOutlook } from "../services/api";
import { useAuth } from "../context/AuthContext";

const chartColors = {
  primary: "#14B8A6",
  grid: "rgba(148, 163, 184, 0.1)",
  text: "#94A3B8",
};


export default function CEODashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [growthOutlook, setGrowthOutlook] = useState(null);
  const [loading, setLoading] = useState(false);
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

  const loadAnnouncements = async () => {
    try {
      const announcements = await getAnnouncements();
      console.log('Announcements:', announcements);
    } catch (error) {
      console.error('Announcements load failed:', error);
    }
  };

  useEffect(() => {
    loadJoinRequests();
  }, []);

  useEffect(() => {
    let alive = true;
    const loadData = async () => {
      setLoading(true);
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
      } finally {
        if (alive) setLoading(false);
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
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
  {/* CEO Sections - Always Show */}
  <div className="space-y-6">
    <div className="bg-theme-card rounded-2xl p-6 shadow-lg">
      <h3 className="mb-4 text-lg font-semibold text-theme-primary">CEO Announcement</h3>
      <div className="rounded-xl border border-theme-light bg-theme-secondary p-4">
        <p className="text-xs text-theme-muted">Post Announcement</p>
        <div className="mt-3 grid grid-cols-1 gap-3">
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
            rows={3}
            className="rounded-lg border border-theme-light bg-theme-primary px-3 py-2 text-sm text-theme-primary"
          />
          <button
            type="button"
            onClick={handlePostAnnouncement}
            disabled={postingAnnouncement}
            className="w-fit rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {postingAnnouncement ? "Posting..." : "Post Announcement"}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-theme-light bg-theme-secondary p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-theme-muted">Pending Join Requests</p>
          <button
            type="button"
            onClick={loadJoinRequests}
            disabled={requestsLoading}
            className="rounded-lg border border-theme-light bg-theme-primary px-3 py-1.5 text-xs font-semibold text-theme-primary hover:bg-theme-tertiary disabled:opacity-60"
          >
            {requestsLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {requestsLoading ? (
          <p className="mt-3 text-sm text-theme-muted">Loading requests...</p>
        ) : pendingRequests.length === 0 ? (
          <p className="mt-3 text-sm text-theme-muted">No pending requests.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {pendingRequests.map((request) => (
              <div key={request.id} className="rounded-xl border border-theme-light bg-theme-primary p-4">
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
                      className="w-28 rounded-lg border border-theme-light bg-theme-secondary px-2 py-1 text-sm text-theme-primary"
                    />
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={reviewingId === request.id}
                      onClick={() => handleReview(request, "approve")}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === request.id}
                      onClick={() => handleReview(request, "reject")}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Total Sectors" value={computedKpis.totalSectors} change="" changeType="positive" />
        <KPICard title="Total Products" value={computedKpis.totalProducts} change="" changeType="positive" />
        <KPICard title="Total Uploads" value={computedKpis.totalUploads} change="" changeType="positive" />
        <KPICard title="Avg Quality" value={`${computedKpis.avgQuality}%`} change="" changeType="positive" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-theme-card rounded-2xl p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-theme-primary">Growth Timeline (AI Outlook)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="none" vertical={false} />
              <XAxis dataKey="month" stroke={chartColors.text} axisLine={false} tickLine={false} />
              <YAxis stroke={chartColors.text} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v/1000}k`} />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke={chartColors.primary} strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-theme-card rounded-2xl p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-theme-primary">Sector Recommendation Split</h3>
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
        </div>
      </div>

      {growthOutlook?.recommendations && growthOutlook.recommendations.length ? (
        <div className="bg-theme-card rounded-2xl p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-theme-primary">Top Recommendations</h3>
          <div className="space-y-3">
            {growthOutlook.recommendations.slice(0, 4).map((rec, idx) => (
              <div key={idx} className="rounded-xl border border-theme-light bg-theme-secondary p-4">
                <p className="text-sm font-semibold">{rec.recommendation}</p>
                <p className="mt-1 text-xs text-theme-muted">{rec.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

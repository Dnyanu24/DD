import { useEffect, useState } from "react";
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
import AIInsights from "../components/AIInsights";
import { getJoinRequests, reviewJoinRequest } from "../services/api";

const defaultTrendData = [
  { month: "Jan", revenue: 120000 },
  { month: "Feb", revenue: 135000 },
  { month: "Mar", revenue: 142000 },
  { month: "Apr", revenue: 158000 },
  { month: "May", revenue: 165000 },
  { month: "Jun", revenue: 178000 },
];

const defaultMarketShareData = [
  { name: "SDAS", value: 35, color: "#14B8A6" },
  { name: "Competitor A", value: 25, color: "#0D9488" },
  { name: "Competitor B", value: 20, color: "#2DD4BF" },
  { name: "Others", value: 20, color: "#5EEAD4" },
];

const chartColors = {
  primary: "#14B8A6",
  grid: "rgba(148, 163, 184, 0.1)",
  text: "#94A3B8",
};

export default function CEODashboard({
  trendData = defaultTrendData,
  marketShareData = defaultMarketShareData,
}) {
  const [joinRequests, setJoinRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [sectorSelections, setSectorSelections] = useState({});
  const [reviewingId, setReviewingId] = useState(null);

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

  return (
    <div className="space-y-6">
      <div className="bg-theme-card rounded-2xl p-6 shadow-lg transition-colors duration-300">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-theme-primary">Company Join Requests</h3>
          <button
            type="button"
            onClick={loadJoinRequests}
            className="rounded-lg border border-theme-light bg-theme-secondary px-3 py-1.5 text-xs text-theme-primary"
          >
            Refresh
          </button>
        </div>
        {requestsError ? <p className="mb-3 text-sm text-red-600">{requestsError}</p> : null}
        {requestsLoading ? (
          <p className="text-sm text-theme-muted">Loading requests...</p>
        ) : pendingRequests.length === 0 ? (
          <p className="text-sm text-theme-muted">No pending requests.</p>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((request) => (
              <div key={request.id} className="rounded-xl border border-theme-light bg-theme-secondary p-4">
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Total Revenue" value="$1.2M" change="+12.5%" changeType="positive" />
        <KPICard title="Monthly Growth" value="7.9%" change="+2.1%" changeType="positive" />
        <KPICard title="Active Users" value="15,420" change="+8.3%" changeType="positive" />
        <KPICard title="AI Forecasted Revenue" value="$2.1M" change="+18.2%" changeType="positive" />
      </div>

      <AIInsights />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-theme-card rounded-2xl p-6 shadow-lg transition-colors duration-300">
          <h3 className="mb-4 text-lg font-semibold text-theme-primary">Strategic Trend Analysis</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="none" vertical={false} />
              <XAxis dataKey="month" stroke={chartColors.text} axisLine={false} tickLine={false} />
              <YAxis stroke={chartColors.text} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value / 1000}k`} />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke={chartColors.primary} strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-theme-card rounded-2xl p-6 shadow-lg transition-colors duration-300">
          <h3 className="mb-4 text-lg font-semibold text-theme-primary">Market Share</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={marketShareData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value">
                {marketShareData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

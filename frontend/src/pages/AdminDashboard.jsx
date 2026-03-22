import { useEffect, useState } from "react";
import KPICard from "../components/KPICard";
import { createAnnouncement, getJoinRequests, getRoleInsights, reviewJoinRequest } from "../services/api";

export default function AdminDashboard() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joinRequests, setJoinRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [sectorSelections, setSectorSelections] = useState({});
  const [reviewingId, setReviewingId] = useState(null);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getRoleInsights();
        if (!alive) return;
        setInsights(data);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "Failed to load admin insights");
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  const loadJoinRequests = async () => {
    setRequestsLoading(true);
    setRequestsError("");
    try {
      const rows = await getJoinRequests();
      setJoinRequests(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setRequestsError(e?.message || "Failed to load join requests.");
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    loadJoinRequests();
  }, []);

  const pendingRequests = joinRequests.filter((item) => item.status === "pending");

  const handleReview = async (request, action) => {
    setReviewingId(request.id);
    setRequestsError("");
    try {
      const sectorId = sectorSelections[request.id] ? Number(sectorSelections[request.id]) : null;
      await reviewJoinRequest(request.id, action, sectorId);
      await loadJoinRequests();
    } catch (e) {
      setRequestsError(e?.message || "Review action failed.");
    } finally {
      setReviewingId(null);
    }
  };

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
    } catch (e) {
      setRequestsError(e?.message || "Failed to post announcement.");
    } finally {
      setPostingAnnouncement(false);
    }
  };

  const kpis = Array.isArray(insights?.kpis) ? insights.kpis : [];
  const pipeline = insights?.pipeline_health || {};
  const recentRuns = Array.isArray(pipeline?.recent_runs) ? pipeline.recent_runs : [];

  return (
    <div className="space-y-6">
      <div className="bg-theme-card rounded-2xl p-6 shadow-lg transition-colors duration-300">
        <h3 className="mb-1 text-lg font-semibold text-theme-primary">Admin Overview</h3>
        <p className="text-sm text-theme-muted">
          Data quality metrics and pipeline health for your company.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {kpis.length ? (
          kpis.slice(0, 4).map((kpi) => (
            <KPICard
              key={kpi.title}
              title={kpi.title}
              value={kpi.unit ? `${kpi.value}${kpi.unit}` : String(kpi.value ?? "-")}
              change=""
              changeType="positive"
            />
          ))
        ) : (
          <>
            <KPICard title="Users" value={loading ? "..." : "-"} change="" changeType="positive" />
            <KPICard title="Raw Datasets" value={loading ? "..." : "-"} change="" changeType="positive" />
            <KPICard title="Cleaned Datasets" value={loading ? "..." : "-"} change="" changeType="positive" />
            <KPICard title="Avg Quality" value={loading ? "..." : "-"} change="" changeType="positive" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-theme-card rounded-2xl p-6 shadow-lg transition-colors duration-300">
          <h3 className="mb-4 text-lg font-semibold text-theme-primary">Admin Control Center</h3>
          {requestsError ? <p className="mb-3 text-sm text-red-600">{requestsError}</p> : null}

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

        <div className="bg-theme-card rounded-2xl p-6 shadow-lg transition-colors duration-300">
          <h3 className="mb-4 text-lg font-semibold text-theme-primary">Pipeline Health</h3>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-theme-light bg-theme-secondary p-4">
              <p className="text-xs text-theme-muted">Error Rate</p>
              <p className="mt-1 text-lg font-semibold text-theme-primary">
                {pipeline?.error_rate_percent ?? (loading ? "..." : "-")}%
              </p>
            </div>
            <div className="rounded-xl border border-theme-light bg-theme-secondary p-4">
              <p className="text-xs text-theme-muted">Recent Runs</p>
              <p className="mt-1 text-lg font-semibold text-theme-primary">
                {recentRuns.length || (loading ? "..." : 0)}
              </p>
            </div>
          </div>

          {recentRuns.length ? (
            <div className="space-y-3">
              {recentRuns.slice(0, 8).map((run, idx) => (
                <div
                  key={`${run.run_key}-${run.iteration}-${idx}`}
                  className="rounded-xl border border-theme-light bg-theme-secondary p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-theme-primary">
                      {run.task} #{run.iteration}
                    </p>
                    <span className="text-xs text-theme-muted">{run.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-theme-muted">
                    {run.created_at ? new Date(run.created_at).toLocaleString() : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-theme-muted">
              {loading ? "Loading pipeline runs..." : "No pipeline iteration logs yet."}
            </p>
          )}
        </div>

        <div className="bg-theme-card rounded-2xl p-6 shadow-lg transition-colors duration-300">
          <h3 className="mb-4 text-lg font-semibold text-theme-primary">Role Breakdown</h3>
          {Array.isArray(insights?.users?.by_role) && insights.users.by_role.length ? (
            <div className="space-y-3">
              {insights.users.by_role.slice(0, 12).map((row) => (
                <div key={row.role} className="flex items-center justify-between rounded-xl border border-theme-light bg-theme-secondary p-4">
                  <span className="text-sm text-theme-primary">{row.role}</span>
                  <span className="text-sm font-semibold text-theme-primary">{row.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-theme-muted">{loading ? "Loading roles..." : "No user role data available."}</p>
          )}
        </div>
      </div>
    </div>
  );
}

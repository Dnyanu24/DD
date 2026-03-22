import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCcw, Shield, User as UserIcon, XCircle } from "lucide-react";
import KPICard from "../components/KPICard";
import { getCompanyUsers, getJoinRequests, getSectors, reviewJoinRequest, updateCompanyUser, getApiBaseUrl } from "../services/api";

const ROLE_OPTIONS = [
  { value: "CEO", label: "CEO" },
  { value: "Admin", label: "Admin" },
  { value: "Sector Head", label: "Sector Head" },
  { value: "Data Analyst", label: "Data Analyst" },
  { value: "Sales Manager", label: "Sales Manager" },
  { value: "Student", label: "Student" },
  { value: "Individual", label: "Individual" },
];

function formatTime(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "-";
  }
}

export default function RoleManagement() {
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);
  const [reviewingRequestId, setReviewingRequestId] = useState(null);
  const [error, setError] = useState("");

  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sectors, setSectors] = useState([]);

  const [userDrafts, setUserDrafts] = useState({});
  const [requestSector, setRequestSector] = useState({});

  const sectorOptions = useMemo(() => {
    const rows = Array.isArray(sectors) ? sectors : [];
    return rows.map((s) => ({ value: String(s.id), label: s.name || `Sector ${s.id}` }));
  }, [sectors]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRows, joinRows, sectorRows] = await Promise.all([
        getCompanyUsers().catch(() => []),
        getJoinRequests().catch(() => []),
        getSectors().catch(() => []),
      ]);
      setUsers(Array.isArray(usersRows) ? usersRows : []);
      setRequests(Array.isArray(joinRows) ? joinRows : []);
      setSectors(Array.isArray(sectorRows) ? sectorRows : []);
      setUserDrafts({});
      setRequestSector({});
    } catch (err) {
      setError(err?.message || "Failed to load role management data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(() => {
    const totalUsers = users.length;
    const activeRoles = new Set(users.map((u) => u.role)).size;
    const pendingRequests = requests.filter((r) => r.status === "pending").length;
    const sectorHeads = users.filter((u) => u.role === "Sector Head").length;
    return [
      { title: "Total Users", value: String(totalUsers), change: `${activeRoles} roles` },
      { title: "Pending Requests", value: String(pendingRequests), change: "Join approvals" },
      { title: "Sector Heads", value: String(sectorHeads), change: "Assigned owners" },
      { title: "Active Roles", value: String(activeRoles), change: "Across company" },
    ];
  }, [requests, users]);

  const pendingRequests = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);

  const getUserDraft = (userId) => userDrafts[String(userId)] || null;

  const updateUserDraft = (userId, patch) => {
    const key = String(userId);
    setUserDrafts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), ...patch },
    }));
  };

  const handleSaveUser = async (userId) => {
    const draft = getUserDraft(userId);
    if (!draft) return;
    setSavingUserId(userId);
    setError("");
    try {
      const payload = {
        role: draft.role,
        sector_id: draft.role === "Sector Head" ? (draft.sector_id ? Number(draft.sector_id) : null) : null,
      };
      const updated = await updateCompanyUser(userId, payload);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
      setUserDrafts((prev) => {
        const next = { ...prev };
        delete next[String(userId)];
        return next;
      });
    } catch (err) {
      setError(err?.message || "Failed to update user");
    } finally {
      setSavingUserId(null);
    }
  };

  const handleReview = async (requestId, action) => {
    setReviewingRequestId(requestId);
    setError("");
    try {
      const req = requests.find((r) => r.id === requestId);
      const needsSector = req?.requested_role_key === "sector_head";
      const sectorId = needsSector ? (requestSector[String(requestId)] ? Number(requestSector[String(requestId)]) : null) : null;
      await reviewJoinRequest(requestId, action, sectorId);
      await load();
    } catch (err) {
      setError(err?.message || "Failed to review join request");
    } finally {
      setReviewingRequestId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-theme-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading role management...
      </div>
    );
  }

  const apiBase = getApiBaseUrl();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-theme-light bg-theme-card p-6 shadow-theme">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-theme-primary">Role Management</h1>
            <p className="mt-1 text-theme-muted">Approve join requests, assign roles, and manage sector ownership.</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-theme-light bg-theme-secondary px-4 py-2 text-sm font-semibold text-theme-primary hover:bg-theme-tertiary"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/25 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <KPICard key={metric.title} title={metric.title} value={metric.value} change={metric.change} changeType="neutral" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-theme-light bg-theme-card p-6 shadow-theme">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-theme-primary" />
              <h2 className="text-lg font-semibold text-theme-primary">Company Users</h2>
            </div>
            <p className="text-xs text-theme-muted">{users.length} users</p>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-theme-muted">
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Sector</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const draft = getUserDraft(u.id);
                  const roleValue = draft?.role ?? u.role;
                  const sectorValue = draft?.sector_id ?? (u.sector_id != null ? String(u.sector_id) : "");
                  const dirty = Boolean(draft);
                  const avatar = u.avatar_filename ? `${apiBase}/api/auth/profile/avatar/${encodeURIComponent(u.avatar_filename)}` : null;
                  return (
                    <tr key={u.id} className="border-t border-theme-light">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 overflow-hidden rounded-full border border-theme-light bg-theme-secondary">
                            {avatar ? <img src={avatar} alt="avatar" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-theme-muted"><UserIcon className="h-4 w-4" /></div>}
                          </div>
                          <div>
                            <p className="font-semibold text-theme-primary">{u.display_name || u.username}</p>
                            <p className="text-xs text-theme-muted">{u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={roleValue}
                          onChange={(e) => {
                            const nextRole = e.target.value;
                            updateUserDraft(u.id, { role: nextRole, sector_id: nextRole === "Sector Head" ? sectorValue : "" });
                          }}
                          className="w-full rounded-lg border border-theme-light bg-theme-secondary px-3 py-2 text-theme-primary"
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={roleValue === "Sector Head" ? (sectorValue || "") : ""}
                          onChange={(e) => updateUserDraft(u.id, { sector_id: e.target.value })}
                          disabled={roleValue !== "Sector Head"}
                          className="w-full rounded-lg border border-theme-light bg-theme-secondary px-3 py-2 text-theme-primary disabled:opacity-50"
                        >
                          <option value="">Select sector</option>
                          {sectorOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3 text-theme-muted">{formatTime(u.created_at)}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => handleSaveUser(u.id)}
                          disabled={!dirty || savingUserId === u.id || (roleValue === "Sector Head" && !sectorValue)}
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-theme-inverse accent-primary hover:accent-hover disabled:opacity-60"
                        >
                          {savingUserId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          {savingUserId === u.id ? "Saving..." : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-theme-light bg-theme-card p-6 shadow-theme">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-theme-primary">Join Requests</h2>
              <p className="mt-1 text-sm text-theme-muted">Approve or reject pending registrations.</p>
            </div>
            <div className="rounded-full border border-theme-light bg-theme-secondary px-3 py-1 text-xs font-semibold text-theme-muted">
              Pending {pendingRequests.length}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {pendingRequests.length === 0 ? (
              <div className="rounded-xl border border-theme-light bg-theme-secondary p-4 text-sm text-theme-muted">
                No pending join requests.
              </div>
            ) : (
              pendingRequests.slice(0, 20).map((req) => {
                const needsSector = req.requested_role_key === "sector_head";
                const chosenSector = requestSector[String(req.id)] || "";
                const disabledApprove = reviewingRequestId === req.id || (needsSector && !chosenSector);
                return (
                  <div key={req.id} className="rounded-xl border border-theme-light bg-theme-secondary p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-theme-primary">{req.username}</p>
                        <p className="mt-1 text-xs text-theme-muted">
                          Requested {req.requested_role} • {formatTime(req.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleReview(req.id, "approve")}
                          disabled={disabledApprove}
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-theme-inverse accent-primary hover:accent-hover disabled:opacity-60"
                        >
                          {reviewingRequestId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReview(req.id, "reject")}
                          disabled={reviewingRequestId === req.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-theme-light bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:bg-slate-950 dark:hover:bg-rose-900/20"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </button>
                      </div>
                    </div>

                    {needsSector ? (
                      <div className="mt-3">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-theme-muted">Assign sector</label>
                        <select
                          value={chosenSector}
                          onChange={(e) => setRequestSector((prev) => ({ ...prev, [String(req.id)]: e.target.value }))}
                          className="w-full rounded-lg border border-theme-light bg-white px-3 py-2 text-sm text-theme-primary dark:bg-slate-950"
                        >
                          <option value="">Select sector</option>
                          {sectorOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}


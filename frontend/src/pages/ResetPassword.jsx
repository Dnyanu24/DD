import { useMemo, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { resetPassword } from "../services/api";
import BrandLogo from "../components/BrandLogo";

function useQueryParam(key) {
  const location = useLocation();
  return useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get(key) || "";
  }, [location.search, key]);
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const tokenFromUrl = useQueryParam("token");
  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await resetPassword(token, newPassword);
      setSuccess(res?.message || "Password updated.");
      setTimeout(() => navigate("/login"), 700);
    } catch (e2) {
      setError(e2?.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-theme-primary transition-colors duration-300 py-8">
      <div className="absolute left-4 top-4 z-10">
        <BrandLogo />
      </div>

      <div className="relative w-full max-w-md p-8 space-y-6 bg-theme-card rounded-2xl shadow-theme border border-theme m-4">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <BrandLogo compact />
          </div>
          <h2 className="text-2xl font-bold text-theme-primary">Reset Password</h2>
          <p className="mt-2 text-sm text-theme-muted">Paste your reset token and set a new password.</p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <div className="p-4 text-sm text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="p-4 text-sm text-emerald-700 bg-emerald-100 rounded-lg border border-emerald-200">
              {success}
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">Reset Token</label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              className="block w-full px-3 py-2 bg-theme-secondary border border-theme-light rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-accent-primary"
              placeholder="Paste reset token"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="block w-full px-3 py-2 bg-theme-secondary border border-theme-light rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-accent-primary"
              placeholder="Enter new password"
            />
            <p className="mt-1 text-xs text-theme-muted">Minimum 6 characters.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-lg shadow-sm text-sm font-medium text-theme-inverse accent-primary hover:accent-hover disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>

        <div className="text-center">
          <Link to="/login" className="text-sm font-medium text-accent-primary hover:text-accent-hover transition-colors">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}


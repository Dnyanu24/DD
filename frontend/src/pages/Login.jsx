import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Eye, EyeOff, User, Lock, ArrowRight } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { forgotPassword } from "../services/api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await login(username, password);
      if (result.access_token) {
        navigate("/");
      } else {
        setError("Login failed. Please check your credentials.");
      }
    } catch (err) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setResetMessage("");
    setResetToken("");
    setError("");
    setResetLoading(true);

    try {
      const res = await forgotPassword(resetIdentifier || username);
      setResetMessage(res?.message || "If the account exists, a reset token was generated.");
      if (res?.reset_token) {
        setResetToken(res.reset_token);
      }
    } catch (err) {
      setResetMessage(err?.message || "Failed to start password reset");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-theme-primary transition-colors duration-300 py-8">

      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-teal-100/30 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-to-tr from-teal-200/20 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="absolute left-4 top-4 z-10">
        <BrandLogo />
      </div>

      <div className="relative w-full max-w-md p-8 space-y-6 bg-theme-card rounded-2xl shadow-theme border border-theme m-4">
        {/* Logo and Title */}
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <BrandLogo compact />
          </div>
          <h2 className="text-3xl font-bold text-theme-primary">
            SDAS
          </h2>
          <p className="mt-2 text-sm text-theme-muted">
            Smart Data Analytics System
          </p>
        </div>


        {/* Login Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="p-4 text-sm text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          {/* Username Field */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-theme-secondary mb-1">
              Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-theme-muted" />
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full pl-10 pr-4 py-3 bg-theme-secondary border border-theme-light rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all"
                placeholder="Enter your username"
              />
            </div>
          </div>


          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-theme-secondary mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-theme-muted" />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-10 pr-12 py-3 bg-theme-secondary border border-theme-light rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-theme-muted hover:text-theme-secondary transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>


          {/* Remember Me & Forgot Password */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-accent-primary focus:ring-accent-primary border-theme-light rounded bg-theme-secondary"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-theme-secondary">
                Remember me
              </label>
            </div>
            <div className="text-sm">
              <button
                type="button"
                onClick={() => {
                  setShowForgot(true);
                  setResetIdentifier(username);
                }}
                className="font-medium text-accent-primary hover:text-accent-hover transition-colors"
              >
                Forgot password?
              </button>
            </div>
          </div>


          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-theme-inverse accent-primary hover:accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {loading ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Signing in...
              </span>
            ) : (
              <span className="flex items-center">
                Sign in
                <ArrowRight className="ml-2 w-4 h-4" />
              </span>
            )}
          </button>

        </form>

        {showForgot ? (
          <div className="mt-4 rounded-2xl border border-theme-light bg-theme-secondary p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-theme-primary">Reset Password</p>
              <button
                type="button"
                onClick={() => {
                  setShowForgot(false);
                  setResetMessage("");
                  setResetToken("");
                }}
                className="text-xs font-semibold text-theme-muted hover:text-theme-primary"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleForgotPassword} className="mt-3 space-y-3">
              <input
                value={resetIdentifier}
                onChange={(e) => setResetIdentifier(e.target.value)}
                placeholder="Enter username or email"
                className="block w-full px-3 py-2 bg-theme-primary border border-theme-light rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
              <button
                type="submit"
                disabled={resetLoading}
                className="w-full rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {resetLoading ? "Generating..." : "Generate Reset Token"}
              </button>
            </form>

            {resetMessage ? <p className="mt-3 text-xs text-theme-muted">{resetMessage}</p> : null}

            {resetToken ? (
              <div className="mt-3 rounded-xl border border-theme-light bg-theme-primary p-3">
                <p className="text-xs font-semibold text-theme-primary">Reset Token</p>
                <p className="mt-2 break-all text-xs text-theme-muted">{resetToken}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={`/reset-password?token=${encodeURIComponent(resetToken)}`}
                    className="rounded-lg border border-theme-light bg-theme-secondary px-3 py-1.5 text-xs font-semibold text-theme-primary hover:bg-theme-tertiary"
                  >
                    Continue to reset
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Demo Credentials */}
        <div className="mt-6 p-4 bg-theme-secondary rounded-lg border border-theme-light">
          <p className="text-xs text-theme-muted text-center">
            <span className="font-semibold">Demo Credentials:</span>
            <br />
            Username: admin | Password: admin123
          </p>
        </div>

        {/* Sign Up Link */}
        <div className="text-center">
          <p className="text-sm text-theme-muted">
            Don't have an account?{' '}
            <Link to="/signup" className="font-medium text-accent-primary hover:text-accent-hover transition-colors">
              Sign up
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}



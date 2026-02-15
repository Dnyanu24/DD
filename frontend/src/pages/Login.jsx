import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Eye, EyeOff, User, Lock, ArrowRight } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-theme-primary transition-colors duration-300 py-8">

      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-teal-100/30 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-to-tr from-teal-200/20 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md p-8 space-y-6 bg-theme-card rounded-2xl shadow-theme border border-theme m-4">
        {/* Logo and Title */}
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl accent-primary flex items-center justify-center mb-4 shadow-lg">
            <span className="text-3xl font-bold text-white">S</span>
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
              <a href="#" className="font-medium text-accent-primary hover:text-accent-hover transition-colors">
                Forgot password?
              </a>
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



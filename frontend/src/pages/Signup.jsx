import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { register } from "../services/api";
import { Eye, EyeOff, User, Mail, Lock, Building, ArrowRight, CheckCircle } from "lucide-react";

export default function Signup() {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "ceo",
    company_id: "company_01",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Registration successful.");
  const navigate = useNavigate();

  const roles = [
    { value: "ceo", label: "CEO" },
    { value: "data_analyst", label: "Data Analyst" },
    { value: "sales_manager", label: "Sales Manager" },
    { value: "sector_head", label: "Sector Head" },
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const result = await register({
        username: formData.username,
        password: formData.password,
        role: formData.role,
        company_id: formData.company_id,
      });
      
      if (result) {
        setSuccessMessage(result.message || "Registration submitted successfully.");
        setSuccess(true);
        setTimeout(() => {
          navigate("/login");
        }, 2000);
      }
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-primary transition-colors duration-300">
        <div className="w-full max-w-md p-8 text-center bg-theme-card rounded-2xl shadow-theme border border-theme m-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-theme-primary mb-2">Registration Update</h2>
          <p className="text-theme-muted">{successMessage}</p>
        </div>
      </div>
    );
  }

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
            <span className="text-3xl font-bold text-theme-inverse">S</span>
          </div>
          <h2 className="text-3xl font-bold text-theme-primary">
            Create Account
          </h2>
          <p className="mt-2 text-sm text-theme-muted">
            Join SDAS and start analyzing your data
          </p>
        </div>

        {/* Signup Form */}
        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
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
                value={formData.username}
                onChange={handleChange}
                className="block w-full pl-10 pr-4 py-3 bg-theme-secondary border border-theme-light rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all"
                placeholder="Choose a username"
              />
            </div>
          </div>

          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-theme-secondary mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-theme-muted" />
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className="block w-full pl-10 pr-4 py-3 bg-theme-secondary border border-theme-light rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all"
                placeholder="Enter your email"
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
                value={formData.password}
                onChange={handleChange}
                className="block w-full pl-10 pr-12 py-3 bg-theme-secondary border border-theme-light rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all"
                placeholder="Create a password"
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

          {/* Confirm Password Field */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-theme-secondary mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-theme-muted" />
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                className="block w-full pl-10 pr-12 py-3 bg-theme-secondary border border-theme-light rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all"
                placeholder="Confirm your password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-theme-muted hover:text-theme-secondary transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Role Selection */}
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-theme-secondary mb-1">
              Select Role
            </label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="block w-full px-4 py-3 bg-theme-secondary border border-theme-light rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all"
            >
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          {/* Company ID */}
          <div>
            <label htmlFor="company_id" className="block text-sm font-medium text-theme-secondary mb-1">
              Company ID (Format: company_01)
            </label>
            <div className="relative">
              <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-theme-muted" />
              <input
                id="company_id"
                name="company_id"
                type="text"
                required
                value={formData.company_id}
                onChange={handleChange}
                className="block w-full pl-10 pr-4 py-3 bg-theme-secondary border border-theme-light rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all"
                placeholder="company_01"
              />
            </div>
          </div>

          {/* Terms Checkbox */}
          <div className="flex items-center">
            <input
              id="terms"
              name="terms"
              type="checkbox"
              required
              className="h-4 w-4 text-accent-primary focus:ring-accent-primary border-theme-light rounded bg-theme-secondary"
            />
            <label htmlFor="terms" className="ml-2 block text-sm text-theme-secondary">
              I agree to the{' '}
              <a href="#" className="text-accent-primary hover:text-accent-hover transition-colors">
                Terms of Service
              </a>
              {' '}and{' '}
              <a href="#" className="text-accent-primary hover:text-accent-hover transition-colors">
                Privacy Policy
              </a>
            </label>
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
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-theme-inverse"
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
                Creating account...
              </span>
            ) : (
              <span className="flex items-center">
                Create Account
                <ArrowRight className="ml-2 w-4 h-4" />
              </span>
            )}
          </button>
        </form>

        {/* Login Link */}
        <div className="text-center">
          <p className="text-sm text-theme-muted">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-accent-primary hover:text-accent-hover transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}



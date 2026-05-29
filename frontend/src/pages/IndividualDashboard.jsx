import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Sparkles, Upload, User, BarChart3Icon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import KPICard from "../components/KPICard";
import { getRoleInsights } from "../services/api";

export default function IndividualDashboard() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const loadInsights = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getRoleInsights();
        if (alive) setInsights(data);
      } catch (e) {
        if (alive) setError(e?.message || "Failed to load insights");
      } finally {
        if (alive) setLoading(false);
      }
    };
    loadInsights();
    return () => { alive = false; };
  }, []);

  const kpis = Array.isArray(insights?.kpis) ? insights.kpis.slice(0, 4) : [
    { title: "Datasets", value: loading ? "..." : "-", unit: "" },
    { title: "Cleaned", value: loading ? "..." : "-", unit: "" },
    { title: "Quality", value: loading ? "..." : "-", unit: "%" },
    { title: "Insights", value: loading ? "..." : "3", unit: "" }
  ];

  const recs = Array.isArray(insights?.recommendations) ? insights.recommendations.slice(0, 4) : [];

  const defaultChartData = [
    { metric: "Uploads", value: 3 },
    { metric: "Cleaned", value: 3 },
    { metric: "Predictions", value: 2 },
    { metric: "Quality", value: 92 }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-theme-card rounded-2xl border border-theme-light p-6 shadow-theme">
        <h1 className="text-3xl font-bold text-theme-primary">Personal Analytics</h1>
        <p className="mt-2 text-theme-muted">
          Your private SDAS workspace for uploading files, cleaning them, and exploring patterns with charts.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi, idx) => (
          <KPICard
            key={idx}
            title={kpi.title}
            value={kpi.unit ? `${kpi.value}${kpi.unit}` : kpi.value}
            change=""
            changeType="positive"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-theme-card rounded-2xl p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-theme-primary">Personal Metrics</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={defaultChartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="metric" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#14B8A6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-theme-card rounded-2xl p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-theme-primary">AI Recommendations</h3>
          {recs.length ? (
            <div className="space-y-3">
              {recs.map((rec, idx) => (
                <div key={idx} className="rounded-xl border border-theme-light bg-theme-secondary p-4">
                  <p className="text-sm font-semibold">{rec.text || rec.recommendation_text}</p>
                  <p className="mt-1 text-xs text-theme-muted">Conf: {rec.confidence || 'High'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-theme-muted">{loading ? "Loading..." : "Upload data for personalized recs."}</p>
          )}
        </div>

        <section className="rounded-2xl border border-theme-light bg-theme-card p-6 shadow-theme">
          <h2 className="text-lg font-semibold text-theme-primary">Quick Actions</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link to="/upload" className="flex items-center gap-3 rounded-xl border border-theme-light bg-theme-secondary px-4 py-3 text-sm font-semibold text-theme-primary hover:bg-theme-tertiary">
              <Upload className="h-5 w-5 text-teal-500" />
              Upload Dataset
            </Link>
            <Link to="/data-cleaning" className="flex items-center gap-3 rounded-xl border border-theme-light bg-theme-secondary px-4 py-3 text-sm font-semibold text-theme-primary hover:bg-theme-tertiary">
              <Sparkles className="h-5 w-5 text-teal-500" />
              Clean & Export
            </Link>
            <Link to="/visualizations" className="flex items-center gap-3 rounded-xl border border-theme-light bg-theme-secondary px-4 py-3 text-sm font-semibold text-theme-primary hover:bg-theme-tertiary">
              <BarChart3 className="h-5 w-5 text-teal-500" />
              Visualize Patterns
            </Link>
            <Link to="/profile" className="flex items-center gap-3 rounded-xl border border-theme-light bg-theme-secondary px-4 py-3 text-sm font-semibold text-theme-primary hover:bg-theme-tertiary">
              <User className="h-5 w-5 text-teal-500" />
              Edit Profile
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}


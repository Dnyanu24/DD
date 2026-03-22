import { Link } from "react-router-dom";
import { BarChart3, Sparkles, Upload, User } from "lucide-react";
import KPICard from "../components/KPICard";

export default function IndividualDashboard() {
  return (
    <div className="space-y-6">
      <div className="bg-theme-card rounded-2xl border border-theme-light p-6 shadow-theme">
        <h1 className="text-3xl font-bold text-theme-primary">Personal Analytics</h1>
        <p className="mt-2 text-theme-muted">
          Your private SDAS workspace for uploading files, cleaning them, and exploring patterns with charts.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <KPICard title="Workspace" value="Personal" change="Private company" changeType="positive" />
        <KPICard title="Datasets" value="-" change="Upload to begin" changeType="neutral" />
        <KPICard title="Cleaned Files" value="-" change="Run cleaning" changeType="neutral" />
        <KPICard title="Patterns" value="-" change="Auto insights" changeType="neutral" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-theme-light bg-theme-card p-6 shadow-theme">
          <h2 className="text-lg font-semibold text-theme-primary">Start Here</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link to="/upload" className="flex items-center gap-3 rounded-xl border border-theme-light bg-theme-secondary px-4 py-3 text-sm font-semibold text-theme-primary hover:bg-theme-tertiary">
              <Upload className="h-5 w-5 text-teal-500" />
              Upload Dataset
            </Link>
            <Link to="/cleaning" className="flex items-center gap-3 rounded-xl border border-theme-light bg-theme-secondary px-4 py-3 text-sm font-semibold text-theme-primary hover:bg-theme-tertiary">
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

        <section className="rounded-2xl border border-theme-light bg-theme-card p-6 shadow-theme">
          <h2 className="text-lg font-semibold text-theme-primary">What You Can Do</h2>
          <p className="mt-3 text-sm text-theme-muted">
            Use SDAS like a personal notebook for data. Save cleaned snapshots, compare datasets, and keep your charts repeatable.
          </p>
        </section>
      </div>
    </div>
  );
}


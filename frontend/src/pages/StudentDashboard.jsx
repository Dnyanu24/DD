import { Link } from "react-router-dom";
import { BarChart3, Sparkles, Upload } from "lucide-react";
import KPICard from "../components/KPICard";

export default function StudentDashboard() {
  return (
    <div className="space-y-6">
      <div className="bg-theme-card rounded-2xl border border-theme-light p-6 shadow-theme">
        <h1 className="text-3xl font-bold text-theme-primary">Student Workspace</h1>
        <p className="mt-2 text-theme-muted">
          A lightweight SDAS dashboard focused on learning, quick uploads, cleaning, and visual patterns.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <KPICard title="Datasets" value="-" change="Upload to begin" changeType="neutral" />
        <KPICard title="Cleaned Files" value="-" change="Run cleaning" changeType="neutral" />
        <KPICard title="Visual Patterns" value="-" change="Explore charts" changeType="neutral" />
        <KPICard title="Notes" value="-" change="Save insights" changeType="neutral" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-theme-light bg-theme-card p-6 shadow-theme">
          <h2 className="text-lg font-semibold text-theme-primary">Quick Actions</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link to="/upload" className="flex items-center gap-3 rounded-xl border border-theme-light bg-theme-secondary px-4 py-3 text-sm font-semibold text-theme-primary hover:bg-theme-tertiary">
              <Upload className="h-5 w-5 text-teal-500" />
              Upload Dataset
            </Link>
            <Link to="/cleaning" className="flex items-center gap-3 rounded-xl border border-theme-light bg-theme-secondary px-4 py-3 text-sm font-semibold text-theme-primary hover:bg-theme-tertiary">
              <Sparkles className="h-5 w-5 text-teal-500" />
              Clean Data
            </Link>
            <Link to="/visualizations" className="flex items-center gap-3 rounded-xl border border-theme-light bg-theme-secondary px-4 py-3 text-sm font-semibold text-theme-primary hover:bg-theme-tertiary">
              <BarChart3 className="h-5 w-5 text-teal-500" />
              Visualizations
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-theme-light bg-theme-card p-6 shadow-theme">
          <h2 className="text-lg font-semibold text-theme-primary">Tips</h2>
          <ul className="mt-4 space-y-2 text-sm text-theme-muted">
            <li>Upload small CSV/Excel files first to learn the pipeline.</li>
            <li>Use the cleaned dataset Visualize button to auto-generate patterns.</li>
            <li>Save important cleaned snapshots to the database for later.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

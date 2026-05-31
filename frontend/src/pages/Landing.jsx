import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Database,
  FileText,
  Gauge,
  Layers3,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import BrandLogo from "../components/BrandLogo";

const metrics = [
  { label: "Data Quality", value: "96.4%", icon: ShieldCheck, color: "#22c55e" },
  { label: "Datasets", value: "24", icon: Database, color: "#2563eb" },
  { label: "AI Insights", value: "58", icon: BrainCircuit, color: "#8b5cf6" },
  { label: "Reports", value: "36", icon: FileText, color: "#06b6d4" },
];

const modules = [
  { title: "Data Ingestion", detail: "Upload CSV, Excel, JSON, TXT, PDF, and log files.", icon: UploadCloud },
  { title: "Smart Cleaning", detail: "Detect missing values, shifted columns, duplicates, types, and outliers.", icon: Sparkles },
  { title: "Role Dashboards", detail: "CEO, Analyst, Sales Manager, and Sector Head views with scoped actions.", icon: Layers3 },
  { title: "Analytics Output", detail: "Visualizations, reports, dashboard builder, and AI recommendations.", icon: BarChart3 },
];

function MetricTile({ item }) {
  const Icon = item.icon;
  return (
    <div className="rounded-lg border border-theme-light bg-theme-card p-4 shadow-theme">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: `${item.color}22`, color: item.color }}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-theme-muted">{item.label}</p>
          <p className="text-2xl font-semibold text-theme-primary">{item.value}</p>
        </div>
      </div>
    </div>
  );
}

function DashboardPreview() {
  const bars = [72, 81, 94, 89];
  return (
    <div className="rounded-lg border border-theme-light bg-theme-card p-5 shadow-theme">
      <div className="flex items-center justify-between border-b border-theme-light pb-4">
        <div>
          <p className="text-xs font-semibold uppercase text-theme-muted">Live Preview</p>
          <p className="text-lg font-semibold text-theme-primary">Executive Dashboard</p>
        </div>
        <div className="rounded-lg bg-teal-50 p-2 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200">
          <Gauge className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {metrics.map((item) => <MetricTile key={item.label} item={item} />)}
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-lg border border-theme-light bg-theme-secondary p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-theme-primary">Confidence Score</p>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">KNN 94%</span>
          </div>
          <div className="flex h-48 items-end gap-4">
            {bars.map((bar, index) => (
              <div key={bar} className="flex flex-1 flex-col items-center gap-2">
                <div className="w-full rounded-t-lg" style={{ height: `${bar}%`, backgroundColor: ["#2563eb", "#22c55e", "#8b5cf6", "#f97316"][index] }} />
                <p className="text-[11px] text-theme-muted">{["Mean", "Median", "KNN", "Reg"][index]}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-theme-light bg-theme-secondary p-4">
          <p className="text-sm font-semibold text-theme-primary">Insight Summary</p>
          <div className="mt-4 space-y-3">
            {["Revenue signal improved", "3 datasets need cleaning", "Report ready for CEO", "Dashboard builder has 5 visuals"].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                <p className="text-xs text-theme-secondary">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <main className="min-h-screen bg-theme-primary text-theme-primary">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <BrandLogo />
        <nav className="hidden items-center gap-6 text-sm font-semibold text-theme-muted md:flex">
          <a href="#features" className="hover:text-theme-primary">Features</a>
          <a href="#roles" className="hover:text-theme-primary">Roles</a>
          <a href="#workflow" className="hover:text-theme-primary">Workflow</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/login" className="rounded-lg border border-theme-light bg-theme-card px-4 py-2 text-sm font-semibold text-theme-primary hover:bg-theme-secondary">
            Sign In
          </Link>
          <Link to="/signup" className="hidden rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 sm:inline-flex">
            Create Account
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 py-10 xl:grid-cols-[0.82fr_1.18fr] xl:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
            <Sparkles className="h-3.5 w-3.5" />
            Smart Data Analytics System
          </div>
          <h1 className="mt-5 text-5xl font-semibold tracking-normal text-theme-primary">
            A role-based analytics platform for clean data, AI insights, and dashboards.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-theme-muted">
            SDAS helps teams upload messy files, profile errors, clean datasets, build dashboards, generate reports, and view analytics based on their role.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/login" className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700">
              Open Software
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#features" className="inline-flex items-center gap-2 rounded-lg border border-theme-light bg-theme-card px-5 py-3 text-sm font-semibold text-theme-primary hover:bg-theme-secondary">
              Explore Features
            </a>
          </div>
        </div>
        <DashboardPreview />
      </section>

      <section id="features" className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-lg border border-theme-light bg-theme-card p-5 shadow-theme">
                <div className="w-fit rounded-lg bg-teal-50 p-2 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-theme-primary">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-theme-muted">{item.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="roles" className="mx-auto max-w-7xl px-6 py-10">
        <div className="rounded-lg border border-theme-light bg-theme-card p-6 shadow-theme">
          <p className="text-xs font-semibold uppercase text-theme-muted">Role-Based Views</p>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
            {["CEO", "Data Analyst", "Sales Manager", "Sector Head"].map((role) => (
              <div key={role} className="rounded-lg bg-theme-secondary p-4">
                <p className="text-base font-semibold text-theme-primary">{role}</p>
                <p className="mt-2 text-xs leading-5 text-theme-muted">
                  Dedicated dashboard cards, graphs, pipeline status, insights, and actions matched to this role.
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-7xl px-6 pb-14">
        <div className="rounded-lg border border-theme-light bg-theme-card p-6 shadow-theme">
          <p className="text-xs font-semibold uppercase text-theme-muted">Workflow</p>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-6">
            {["Upload", "Profile", "Clean", "Model", "Visualize", "Report"].map((step, index) => (
              <div key={step} className="rounded-lg bg-theme-secondary p-4 text-center">
                <p className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold text-white">{index + 1}</p>
                <p className="mt-3 text-sm font-semibold text-theme-primary">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

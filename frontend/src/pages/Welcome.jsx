import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Bot, Database, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import BrandLogo from "../components/BrandLogo";

const tutorialSteps = [
  {
    title: "1. Connect Your Team",
    text: "Create the company workspace, assign roles, and control access by sector so every user sees only the right data.",
    icon: ShieldCheck,
  },
  {
    title: "2. Upload And Clean",
    text: "Bring in CSV, Excel, or JSON files, profile issues, and convert raw records into trusted cleaned datasets.",
    icon: Database,
  },
  {
    title: "3. Visualize And Predict",
    text: "Turn cleaned data into sector-wise dashboards, product comparisons, trend views, and AI-supported operational insight.",
    icon: BarChart3,
  },
];

const highlights = [
  { title: "Role-Based Platform", text: "CEO, analyst, sales, and sector-head workflows inside one shared system.", icon: Workflow },
  { title: "AI-Ready Data Flow", text: "Cleaning, quality scoring, prediction, and recommendations stay linked end-to-end.", icon: Bot },
  { title: "Modern Decision Layer", text: "Dashboards, visualizations, and reports are built for operational and executive use.", icon: Sparkles },
];

export default function Welcome() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-[-8%] h-80 w-80 rounded-full bg-teal-300/20 blur-3xl" />
        <div className="absolute right-[-10%] top-16 h-96 w-96 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-300/10 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-6 xl:px-10">
        <header className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white/95 px-5 py-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.28)] backdrop-blur md:flex-row md:items-center md:justify-between">
          <BrandLogo />
          <div className="flex w-full flex-wrap items-center gap-3 md:w-auto md:justify-end">
            <Link
              to="/login"
              className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-5 py-2 text-center text-sm font-semibold text-slate-900 transition hover:border-teal-400 md:flex-none"
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="flex-1 rounded-full bg-[linear-gradient(135deg,#0f766e,#14b8a6,#22d3ee)] px-5 py-2 text-center text-sm font-semibold text-white shadow-[0_18px_34px_-20px_rgba(20,184,166,0.9)] transition hover:scale-[1.02] md:flex-none"
            >
              Sign Up
            </Link>
          </div>
        </header>

        <main className="flex-1 py-8">
          <section className="grid items-stretch gap-8 2xl:grid-cols-[1.3fr_0.7fr]">
            <div className="flex h-full flex-col rounded-[36px] border border-slate-200 bg-white p-8 shadow-[0_28px_60px_-40px_rgba(15,23,42,0.22)] md:p-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                <Sparkles className="h-3.5 w-3.5" />
                Platform Welcome
              </div>
              <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight text-slate-900 md:text-5xl xl:text-6xl">
                Build your company data platform on top of one intelligent workspace.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 md:text-lg">
                SDAS is designed as a full platform for collecting, cleaning, analyzing, and presenting sector-wise and product-wise company intelligence.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f766e,#14b8a6,#22d3ee)] px-6 py-3 text-sm font-semibold text-white shadow-[0_20px_40px_-24px_rgba(20,184,166,0.95)]"
                >
                  Start Your Workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-6 py-3 text-sm font-semibold text-slate-900"
                >
                  Open Existing Account
                </Link>
              </div>

              <div className="mt-10 grid flex-1 gap-4 lg:grid-cols-3">
                <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Modules</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-900">7+</div>
                  <p className="mt-2 text-sm text-slate-600">Upload, cleaning, AI, visualization, reporting, settings, and roles.</p>
                </div>
                <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Data Flow</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-900">Raw to Insight</div>
                  <p className="mt-2 text-sm text-slate-600">Every stage from ingestion to analytics stays in one governed pipeline.</p>
                </div>
                <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Access Model</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-900">Role Scoped</div>
                  <p className="mt-2 text-sm text-slate-600">Visibility can be controlled per company, per sector, and per responsibility.</p>
                </div>
              </div>
            </div>

            <div className="h-full rounded-[36px] border border-slate-200 bg-[linear-gradient(180deg,rgba(240,253,250,1),rgba(240,249,255,1))] p-7 shadow-[0_28px_60px_-40px_rgba(15,23,42,0.18)]">
              <div className="flex h-full flex-col rounded-[30px] border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <BrandLogo compact />
                  <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Guided Start
                  </span>
                </div>
                <div className="mt-6 grid flex-1 gap-4">
                  {highlights.map(({ title, text, icon }) => {
                    const IconComponent = icon;
                    return (
                    <div key={title} className="flex h-full flex-col rounded-3xl border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-white p-2 text-slate-900 shadow-sm">
                          <IconComponent className="h-5 w-5" />
                        </div>
                        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
                    </div>
                  );})}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8 w-full rounded-[36px] border border-slate-200 bg-white p-8 shadow-[0_28px_60px_-40px_rgba(15,23,42,0.22)] md:p-10">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Tutorial</p>
                <h2 className="mt-2 text-3xl font-semibold text-slate-900">How the platform works</h2>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                This onboarding section acts as the first tutorial screen for new users and explains the platform journey before login.
              </p>
            </div>

            <div className="mt-8 grid gap-5 xl:grid-cols-3">
              {tutorialSteps.map(({ title, text, icon }) => {
                const IconComponent = icon;
                return (
                <div key={title} className="flex h-full flex-col rounded-[30px] border border-slate-200 bg-slate-50 p-6">
                  <div className="inline-flex rounded-2xl bg-white p-3 text-slate-900 shadow-sm">
                    <IconComponent className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-slate-900">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{text}</p>
                </div>
              );})}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

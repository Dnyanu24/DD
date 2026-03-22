import { Link } from "react-router-dom";
import { BarChart3, Bot, Database, ShieldCheck } from "lucide-react";
import BrandLogo from "../components/BrandLogo";

function AnalyticsIllustration() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-theme bg-theme-card p-6 shadow-theme">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-16 -left-10 h-48 w-48 rounded-full bg-teal-200/35 blur-3xl motion-safe:animate-pulse-soft dark:bg-teal-900/25" />
        <div className="absolute -bottom-10 -right-14 h-56 w-56 rounded-full bg-cyan-200/25 blur-3xl motion-safe:animate-pulse-soft dark:bg-cyan-900/15" />
      </div>

      <div
        className="relative rounded-2xl border border-theme-light bg-theme-card p-5 shadow-theme-md motion-safe:animate-fade-up"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-theme-secondary p-2 text-accent-primary shadow-sm">
              <BarChart3 className="h-full w-full" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-theme-primary">AI Analytics Dashboard</div>
              <div className="text-xs font-medium text-theme-muted">Live signals and trends</div>
            </div>
          </div>
          <div className="rounded-full bg-theme-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-primary">
            SDAS
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-theme-light bg-theme-secondary p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-theme-muted">Accuracy</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-3xl font-semibold text-theme-primary">94%</div>
              <div className="text-xs font-semibold text-accent-primary">+6.2%</div>
            </div>
            <svg viewBox="0 0 220 74" className="mt-4 h-16 w-full" aria-hidden="true">
              <defs>
                <linearGradient id="s-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#22c55e" stopOpacity="0.25" />
                  <stop offset="0.55" stopColor="#10b981" stopOpacity="0.9" />
                  <stop offset="1" stopColor="#14b8a6" stopOpacity="0.8" />
                </linearGradient>
              </defs>
              <path d="M10 54 C 42 44, 58 18, 88 24 C 118 30, 128 52, 154 42 C 178 32, 192 18, 210 22" fill="none" stroke="url(#s-line)" strokeWidth="4" strokeLinecap="round" />
              <path d="M10 66 C 42 56, 58 30, 88 36 C 118 42, 128 64, 154 54 C 178 44, 192 30, 210 34 L210 74 L10 74 Z" fill="#10b981" opacity="0.10" />
              <circle cx="88" cy="24" r="4.5" fill="#10b981" />
              <circle cx="154" cy="42" r="4.5" fill="#14b8a6" />
              <circle cx="210" cy="22" r="4.5" fill="#22c55e" />
            </svg>
          </div>

          <div className="rounded-2xl border border-theme-light bg-theme-secondary p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-theme-muted">Insights</div>
            <div className="mt-2 text-sm font-medium text-theme-secondary">Automated summaries, anomalies, and recommendations</div>
            <div className="mt-4 grid grid-cols-6 items-end gap-2">
              {[18, 28, 22, 42, 34, 56].map((value, index) => (
                <div
                  // Deterministic values; index is safe for this static illustration.
                  key={index}
                  className="rounded-2xl bg-[linear-gradient(180deg,rgba(34,197,94,0.95),rgba(20,184,166,0.85))] shadow-[0_18px_26px_-20px_rgba(16,185,129,0.55)]"
                  style={{ height: `${value}px` }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-theme-light bg-theme-card px-3 py-2 text-xs font-medium text-theme-muted shadow-sm">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-teal-400" />
              Model: Adaptive Trend Monitor
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-5 grid gap-3 sm:grid-cols-3 motion-safe:animate-fade-up" style={{ animationDelay: "140ms" }}>
        {[
          { label: "Pipelines", value: "Automated" },
          { label: "Cleaning", value: "Smart rules" },
          { label: "Reports", value: "One click" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl border border-theme-light bg-theme-card/70 px-4 py-3 shadow-theme-md backdrop-blur">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-theme-muted">{label}</div>
            <div className="mt-1 text-sm font-semibold text-theme-primary">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const featureCards = [
  {
    title: "Automated Data Analysis",
    text: "Detect trends, anomalies, and opportunities across sectors with minimal manual effort.",
    icon: Bot,
  },
  {
    title: "Clean, Trusted Datasets",
    text: "Profile issues fast, apply intelligent fixes, and keep your pipeline audit-friendly.",
    icon: Database,
  },
  {
    title: "Secure By Design",
    text: "Role-based access and controlled visibility so the right teams see the right insights.",
    icon: ShieldCheck,
  },
];

export default function Welcome() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-theme-primary text-theme-primary transition-colors duration-300">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/2 h-full w-full rounded-full bg-gradient-to-br from-teal-100/30 to-transparent blur-3xl dark:from-teal-900/25" />
        <div className="absolute -bottom-1/2 -left-1/2 h-full w-full rounded-full bg-gradient-to-tr from-teal-200/20 to-transparent blur-3xl dark:from-teal-900/15" />
      </div>

      <div className="relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-6 lg:px-10">
        <header className="flex flex-col gap-4 rounded-2xl border border-theme bg-theme-card/90 px-5 py-4 shadow-theme backdrop-blur md:flex-row md:items-center md:justify-between">
          <BrandLogo />

          <nav className="flex flex-wrap items-center justify-center gap-2 text-sm font-semibold text-theme-secondary md:justify-start">
            <a href="#home" className="rounded-full px-4 py-2 transition hover:bg-theme-secondary hover:text-accent-primary">
              Home
            </a>
            <a href="#features" className="rounded-full px-4 py-2 transition hover:bg-theme-secondary hover:text-accent-primary">
              Features
            </a>
            <a href="#about" className="rounded-full px-4 py-2 transition hover:bg-theme-secondary hover:text-accent-primary">
              About
            </a>
            <a href="#contact" className="rounded-full px-4 py-2 transition hover:bg-theme-secondary hover:text-accent-primary">
              Contact
            </a>
          </nav>

          <div className="flex w-full flex-wrap items-center gap-3 md:w-auto md:justify-end">
            <Link
              to="/login"
              className="flex-1 rounded-full border border-theme bg-theme-card px-5 py-2 text-center text-sm font-semibold text-theme-primary shadow-theme-md transition hover:-translate-y-0.5 hover:bg-theme-secondary md:flex-none"
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="flex-1 rounded-full px-5 py-2 text-center text-sm font-semibold text-theme-inverse accent-primary shadow-theme-md transition hover:-translate-y-0.5 hover:accent-hover md:flex-none"
            >
              Get Started
            </Link>
          </div>
        </header>

        <main className="flex-1 py-10" id="home">
          <section className="grid items-center gap-10 lg:grid-cols-2">
            <div className="text-center lg:text-left motion-safe:animate-fade-up" style={{ animationDelay: "40ms" }}>
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-theme-light bg-theme-secondary px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent-primary lg:mx-0">
                Intelligent Analytics
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden="true" />
                Fresh Insights
              </div>
              <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-theme-primary sm:text-5xl xl:text-6xl">
                Smart Data Analytics System
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base font-normal leading-7 text-theme-muted sm:text-lg lg:mx-0">
                Automated data analysis and intelligent insights to help teams move from raw files to confident decisions in minutes.
              </p>

              <div className="mt-8 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center rounded-full px-7 py-3 text-sm font-semibold text-theme-inverse accent-primary shadow-theme-md transition hover:-translate-y-0.5 hover:accent-hover"
                >
                  Get Started
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-full border border-theme bg-theme-card px-7 py-3 text-sm font-semibold text-theme-primary shadow-theme-md transition hover:-translate-y-0.5 hover:bg-theme-secondary"
                >
                  Login
                </Link>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Speed", value: "Fast pipelines" },
                  { label: "Clarity", value: "Actionable KPIs" },
                  { label: "Control", value: "Role access" },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-theme bg-theme-card/80 px-5 py-4 shadow-theme-md backdrop-blur transition hover:-translate-y-0.5 hover:bg-theme-secondary"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-theme-muted">{label}</div>
                    <div className="mt-1 text-sm font-semibold text-theme-primary">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full motion-safe:animate-fade-up" style={{ animationDelay: "90ms" }}>
              <div className="motion-safe:animate-float-slow motion-reduce:animate-none">
                <AnalyticsIllustration />
              </div>
            </div>
          </section>

          <section id="features" className="mt-14 rounded-2xl border border-theme bg-theme-card/80 p-8 shadow-theme backdrop-blur md:p-10">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-theme-muted">Features</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-theme-primary sm:text-4xl">Minimal workflow, maximum insight</h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm font-normal leading-7 text-theme-muted sm:text-base">
                A clean interface that keeps the focus on automated analysis, trusted data, and business-ready intelligence.
              </p>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {featureCards.map(({ title, text, icon }) => {
                const Icon = icon;
                return (
                  <div
                    key={title}
                    className="group rounded-2xl border border-theme bg-theme-card p-6 shadow-theme-md transition hover:-translate-y-1 hover:bg-theme-secondary"
                  >
                    <div className="inline-flex rounded-2xl bg-theme-secondary p-3 text-accent-primary shadow-sm transition group-hover:scale-[1.02]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-theme-primary">{title}</h3>
                    <p className="mt-3 text-sm font-normal leading-7 text-theme-muted">{text}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section id="about" className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-theme bg-theme-card/80 p-8 shadow-theme backdrop-blur md:p-10">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-theme-muted">About</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-theme-primary sm:text-4xl">Built for real teams and real data</h2>
              <p className="mt-4 text-sm font-normal leading-7 text-theme-muted sm:text-base">
                SDAS helps organizations unify ingestion, cleaning, analytics, and reporting in one place. The goal is simple: reduce manual work and
                deliver intelligent, decision-ready insights with a modern, user-friendly experience.
              </p>
            </div>

            <div className="rounded-2xl border border-theme bg-theme-secondary p-8 shadow-theme md:p-10">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent-primary">Why SDAS</p>
              <ul className="mt-5 space-y-3 text-sm font-normal text-theme-secondary">
                <li className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-teal-400" aria-hidden="true" />
                  Soft, minimal UI with fast navigation
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-teal-400" aria-hidden="true" />
                  Automated analysis plus guided insights
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-teal-400" aria-hidden="true" />
                  Professional visuals with subtle motion
                </li>
              </ul>
            </div>
          </section>

          <section id="contact" className="mt-10 rounded-2xl border border-theme bg-theme-card/80 p-8 shadow-theme backdrop-blur md:p-10">
            <div className="flex flex-col items-center justify-between gap-5 text-center md:flex-row md:text-left">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-theme-muted">Contact</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-theme-primary sm:text-3xl">Want a quick walkthrough?</h2>
                <p className="mt-3 max-w-2xl text-sm font-normal leading-7 text-theme-muted">
                  Reach out to the team for a demo, deployment help, or integration questions.
                </p>
              </div>
              <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
                <a
                  href="mailto:support@sdas.local"
                  className="inline-flex flex-1 items-center justify-center rounded-full border border-theme bg-theme-card px-6 py-3 text-sm font-semibold text-theme-primary shadow-theme-md transition hover:-translate-y-0.5 hover:bg-theme-secondary"
                >
                  Contact Us
                </a>
                <Link
                  to="/login"
                  className="inline-flex flex-1 items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-theme-inverse accent-primary shadow-theme-md transition hover:-translate-y-0.5 hover:accent-hover"
                >
                  Login
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

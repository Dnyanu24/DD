import { Link } from "react-router-dom";

export default function BrandLogo({ to = "/", compact = false }) {
  return (
    <Link to={to} className="inline-flex items-center gap-3">
      <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-[linear-gradient(145deg,#0f766e,#14b8a6_55%,#67e8f9)] shadow-[0_18px_40px_-18px_rgba(20,184,166,0.75)]">
        <img src="/icon.svg" alt="SDAS logo" className="h-7 w-7 drop-shadow-sm" />
      </div>
      {!compact ? (
        <div className="leading-tight">
          <div className="text-lg font-semibold tracking-[0.18em] text-theme-primary">SDAS</div>
          <div className="text-xs uppercase tracking-[0.24em] text-theme-muted">Smart Data Analytics System</div>
        </div>
      ) : null}
    </Link>
  );
}

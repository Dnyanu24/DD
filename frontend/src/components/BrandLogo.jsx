import { BarChart3 } from "lucide-react";

export default function BrandLogo({ compact = false }) {
  const iconSize = compact ? "h-8 w-8" : "h-10 w-10";

  return (
    <div className="inline-flex items-center gap-3">
      <div
        className={`${iconSize} flex shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-theme-md dark:bg-teal-500 dark:text-slate-950`}
        aria-hidden="true"
      >
        <BarChart3 className={compact ? "h-5 w-5" : "h-6 w-6"} />
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="text-base font-bold text-theme-primary">SDAS</p>
          <p className="text-xs font-medium text-theme-muted">Smart Data Analytics</p>
        </div>
      )}
    </div>
  );
}

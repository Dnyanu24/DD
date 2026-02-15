import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import KPICard from "../components/KPICard";
import { getRolePredictions } from "../services/api";

export default function AIModels() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState({ role: "", company_id: null, predictions: [] });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getRolePredictions();
        setPayload({
          role: data?.role || "",
          company_id: data?.company_id ?? null,
          predictions: Array.isArray(data?.predictions) ? data.predictions : [],
        });
      } catch (err) {
        setError(err.message || "Failed to load role predictions");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-theme-primary">AI Predictions</h1>
        <p className="mt-1 text-theme-muted">
          Role-based predictions using datasets you accessed in company {payload.company_id ?? "-"}.
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-[35vh] items-center justify-center text-theme-muted">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading role predictions...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {payload.predictions.slice(0, 4).map((item) => (
              <KPICard
                key={item.title}
                title={item.title}
                value={`${item.value}${item.unit === "%" ? "%" : ""}`}
                change={item.unit === "%" ? `${item.value}%` : `${item.value} ${item.unit}`}
                changeType="positive"
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {payload.predictions.map((item) => (
              <div key={`${item.title}_detail`} className="rounded-xl border border-theme-light bg-theme-card p-4">
                <p className="text-sm font-semibold text-theme-primary">{item.title}</p>
                <p className="mt-1 text-xs text-theme-muted">{item.detail}</p>
                <p className="mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                  Recommended: {item.recommended_action}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

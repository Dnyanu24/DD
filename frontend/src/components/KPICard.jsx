import { TrendingUp, TrendingDown } from "lucide-react";

export default function KPICard({ title, value, change, changeType }) {
  const isPositive = changeType === "positive";

  return (
    <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-theme-muted text-sm font-medium">{title}</p>
          <p className="text-2xl font-bold text-theme-primary mt-1">{value}</p>
        </div>
        {change && (
          <div className={`flex items-center space-x-1 ${isPositive ? "text-green-500" : "text-red-500"}`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span className="text-sm font-medium">{change}</span>
          </div>
        )}
      </div>
    </div>
  );
}

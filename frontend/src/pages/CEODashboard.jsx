import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import KPICard from "../components/KPICard";
import AIInsights from "../components/AIInsights";
import { getDashboardData, getAIInsights } from "../services/api";

const trendData = [
  { month: "Jan", revenue: 120000, growth: 5.2 },
  { month: "Feb", revenue: 135000, growth: 12.5 },
  { month: "Mar", revenue: 142000, growth: 5.2 },
  { month: "Apr", revenue: 158000, growth: 11.3 },
  { month: "May", revenue: 165000, growth: 4.4 },
  { month: "Jun", revenue: 178000, growth: 7.9 },
];

const marketShareData = [
  { name: "SDAS", value: 35, color: "#14B8A6" },
  { name: "Competitor A", value: 25, color: "#0D9488" },
  { name: "Competitor B", value: 20, color: "#2DD4BF" },
  { name: "Others", value: 20, color: "#5EEAD4" },
];



export default function CEODashboard() {
  const [alerts] = useState([
    { id: 1, type: "warning", message: "Revenue growth slowing in Q3", time: "2 hours ago" },
    { id: 2, type: "info", message: "New market opportunity identified", time: "4 hours ago" },
    { id: 3, type: "success", message: "AI forecast accuracy improved by 15%", time: "1 day ago" },
  ]);

  return (
    <div className="space-y-6">

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard title="Total Revenue" value="$1.2M" change="+12.5%" changeType="positive" />
        <KPICard title="Monthly Growth" value="7.9%" change="+2.1%" changeType="positive" />
        <KPICard title="Active Users" value="15,420" change="+8.3%" changeType="positive" />
        <KPICard title="AI Forecasted Revenue" value="$2.1M" change="+18.2%" changeType="positive" />
      </div>

      {/* AI Insights Engine */}
      <AIInsights />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Strategic Trend Analysis */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Strategic Trend Analysis</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-medium)" />
              <XAxis dataKey="month" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-medium)", borderRadius: "8px" }}
                labelStyle={{ color: "var(--text-primary)" }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#14B8A6" strokeWidth={2} />

            </LineChart>
          </ResponsiveContainer>
        </div>


        {/* Market Share */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Market Share</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={marketShareData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {marketShareData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-medium)", borderRadius: "8px" }}
                labelStyle={{ color: "var(--text-primary)" }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk & Anomaly Alerts */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Risk & Anomaly Alerts</h3>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id} className="flex items-start space-x-3 p-3 bg-theme-secondary rounded transition-colors duration-300">
                <div className={`w-2 h-2 rounded-full mt-2 ${
                  alert.type === "warning" ? "bg-yellow-500" :
                  alert.type === "info" ? "bg-accent-primary" : "bg-green-500"
                }`} />
                <div className="flex-1">
                  <p className="text-sm text-theme-secondary">{alert.message}</p>
                  <p className="text-xs text-theme-muted mt-1">{alert.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>


        {/* Executive Summary */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Executive Summary</h3>
          <div className="text-sm text-theme-secondary space-y-2">
            <p>• Revenue growth trajectory remains strong with 7.9% monthly increase</p>
            <p>• AI forecasting models predict 18.2% Q4 revenue growth</p>
            <p>• User acquisition rate improved by 8.3% this quarter</p>
            <p>• Market share expansion continues with 35% current position</p>
            <p>• Risk mitigation protocols active - no critical alerts</p>
          </div>
        </div>

      </div>
    </div>
  );
}

import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import KPICard from "../components/KPICard";

const salesData = [
  { day: "Mon", sales: 12500, target: 12000 },
  { day: "Tue", sales: 15200, target: 13000 },
  { day: "Wed", sales: 11800, target: 12500 },
  { day: "Thu", sales: 16800, target: 14000 },
  { day: "Fri", sales: 14200, target: 13500 },
];

const regionalData = [
  { region: "North America", sales: 45000, color: "#14B8A6" },
  { region: "Europe", sales: 32000, color: "#0D9488" },
  { region: "Asia Pacific", sales: 28000, color: "#2DD4BF" },
  { region: "Latin America", sales: 18000, color: "#5EEAD4" },
];

const customerSegments = [
  { name: "Enterprise", value: 45, color: "#14B8A6" },
  { name: "SMB", value: 30, color: "#0D9488" },
  { name: "Startup", value: 15, color: "#2DD4BF" },
  { name: "Individual", value: 10, color: "#5EEAD4" },
];



const demandForecast = [
  { month: "Jul", actual: 125000, forecast: 132000 },
  { month: "Aug", actual: null, forecast: 145000 },
  { month: "Sep", actual: null, forecast: 158000 },
  { month: "Oct", actual: null, forecast: 172000 },
  { month: "Nov", actual: null, forecast: 189000 },
  { month: "Dec", actual: null, forecast: 205000 },
];

export default function SalesManagerDashboard() {
  const [alerts] = useState([
    { id: 1, type: "warning", message: "Q4 target at 78% - acceleration needed", time: "1 hour ago" },
    { id: 2, type: "info", message: "New lead from Fortune 500 company", time: "3 hours ago" },
    { id: 3, type: "success", message: "Europe region exceeded monthly target", time: "5 hours ago" },
  ]);

  const [recommendations] = useState([
    "Focus outbound efforts on North America enterprise segment",
    "Launch targeted campaign for Asia Pacific SMB market",
    "Schedule follow-ups for 15 high-value leads",
    "Optimize pricing strategy for startup segment",
  ]);

  return (
    <div className="space-y-6">

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard title="Daily Sales" value="$16,800" change="+12.5%" changeType="positive" />
        <KPICard title="Weekly Performance" value="$70,500" change="+8.7%" changeType="positive" />
        <KPICard title="Conversion Rate" value="24.3%" change="+3.2%" changeType="positive" />
        <KPICard title="Monthly Target Progress" value="78%" change="-2.1%" changeType="negative" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Sales vs Target */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Daily Sales vs Target</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-medium)" />
              <XAxis dataKey="day" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-medium)", borderRadius: "8px" }}
                labelStyle={{ color: "var(--text-primary)" }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Bar dataKey="sales" fill="#14B8A6" name="Actual Sales" />
              <Bar dataKey="target" fill="#0D9488" name="Target" />

            </BarChart>
          </ResponsiveContainer>
        </div>


        {/* Customer Segmentation */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Customer Segmentation</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={customerSegments}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {customerSegments.map((entry, index) => (
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

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demand Forecast */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Demand Forecast</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={demandForecast}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-medium)" />
              <XAxis dataKey="month" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-medium)", borderRadius: "8px" }}
                labelStyle={{ color: "var(--text-primary)" }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Line type="monotone" dataKey="actual" stroke="#14B8A6" strokeWidth={2} name="Actual" />
              <Line type="monotone" dataKey="forecast" stroke="#0D9488" strokeWidth={2} strokeDasharray="5 5" name="Forecast" />

            </LineChart>
          </ResponsiveContainer>
        </div>


        {/* Regional Performance */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Regional Performance</h3>
          <div className="space-y-4">
            {regionalData.map((region) => (
              <div key={region.region} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-4 h-4 rounded`} style={{ backgroundColor: region.color }}></div>
                  <span className="text-theme-primary">{region.region}</span>
                </div>
                <span className="text-theme-primary font-semibold">${region.sales.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <div className="w-full bg-theme-secondary rounded-full h-2">
              <div className="bg-gradient-to-r from-teal-500 to-teal-600 h-2 rounded-full" style={{ width: "75%" }}></div>

            </div>
            <p className="text-sm text-theme-muted mt-2">Overall Target Progress: 75%</p>
          </div>
        </div>

      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Operational Alerts */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Operational Alerts</h3>
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


        {/* Task Recommendations */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">AI Task Recommendations</h3>
          <div className="space-y-3">
            {recommendations.map((rec, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-theme-secondary rounded transition-colors duration-300">
                <div className="w-2 h-2 rounded-full mt-2 bg-accent-primary"></div>
                <p className="text-sm text-theme-secondary">{rec}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

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
  { region: "North America", sales: 45000, color: "#3B82F6" },
  { region: "Europe", sales: 32000, color: "#10B981" },
  { region: "Asia Pacific", sales: 28000, color: "#F59E0B" },
  { region: "Latin America", sales: 18000, color: "#EF4444" },
];

const customerSegments = [
  { name: "Enterprise", value: 45, color: "#3B82F6" },
  { name: "SMB", value: 30, color: "#10B981" },
  { name: "Startup", value: 15, color: "#F59E0B" },
  { name: "Individual", value: 10, color: "#EF4444" },
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
    <div className="p-6 space-y-6">
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
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Daily Sales vs Target</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="day" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{ backgroundColor: "#1F2937", border: "none", borderRadius: "8px" }}
                labelStyle={{ color: "#F9FAFB" }}
              />
              <Bar dataKey="sales" fill="#3B82F6" name="Actual Sales" />
              <Bar dataKey="target" fill="#10B981" name="Target" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Customer Segmentation */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Customer Segmentation</h3>
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
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demand Forecast */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Demand Forecast</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={demandForecast}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{ backgroundColor: "#1F2937", border: "none", borderRadius: "8px" }}
                labelStyle={{ color: "#F9FAFB" }}
              />
              <Line type="monotone" dataKey="actual" stroke="#3B82F6" strokeWidth={2} name="Actual" />
              <Line type="monotone" dataKey="forecast" stroke="#10B981" strokeWidth={2} strokeDasharray="5 5" name="Forecast" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Regional Performance */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Regional Performance</h3>
          <div className="space-y-4">
            {regionalData.map((region) => (
              <div key={region.region} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-4 h-4 rounded`} style={{ backgroundColor: region.color }}></div>
                  <span className="text-white">{region.region}</span>
                </div>
                <span className="text-white font-semibold">${region.sales.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full" style={{ width: "75%" }}></div>
            </div>
            <p className="text-sm text-gray-400 mt-2">Overall Target Progress: 75%</p>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Operational Alerts */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Operational Alerts</h3>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id} className="flex items-start space-x-3 p-3 bg-gray-700 rounded">
                <div className={`w-2 h-2 rounded-full mt-2 ${
                  alert.type === "warning" ? "bg-yellow-400" :
                  alert.type === "info" ? "bg-blue-400" : "bg-green-400"
                }`} />
                <div className="flex-1">
                  <p className="text-sm text-gray-300">{alert.message}</p>
                  <p className="text-xs text-gray-500 mt-1">{alert.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task Recommendations */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">AI Task Recommendations</h3>
          <div className="space-y-3">
            {recommendations.map((rec, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-gray-700 rounded">
                <div className="w-2 h-2 rounded-full mt-2 bg-purple-400"></div>
                <p className="text-sm text-gray-300">{rec}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

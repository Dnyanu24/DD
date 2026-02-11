import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, ScatterChart, Scatter } from "recharts";

export default function Visualizations() {
  const [selectedChart, setSelectedChart] = useState("revenue_trend");

  const chartData = {
    revenue_trend: [
      { month: "Jan", revenue: 120000, target: 115000 },
      { month: "Feb", revenue: 135000, target: 125000 },
      { month: "Mar", revenue: 142000, target: 130000 },
      { month: "Apr", revenue: 158000, target: 145000 },
      { month: "May", revenue: 165000, target: 150000 },
      { month: "Jun", revenue: 178000, target: 160000 },
    ],
    market_share: [
      { name: "SDAS", value: 35, color: "#3B82F6" },
      { name: "Competitor A", value: 25, color: "#10B981" },
      { name: "Competitor B", value: 20, color: "#F59E0B" },
      { name: "Others", value: 20, color: "#EF4444" },
    ],
    customer_segments: [
      { segment: "Enterprise", value: 45000 },
      { segment: "SMB", value: 32000 },
      { segment: "Startup", value: 18000 },
      { segment: "Individual", value: 12000 },
    ],
    anomaly_detection: [
      { time: "00:00", normal: 100, anomaly: null },
      { time: "04:00", normal: 98, anomaly: null },
      { time: "08:00", normal: 95, anomaly: 120 },
      { time: "12:00", normal: 102, anomaly: null },
      { time: "16:00", normal: 99, anomaly: null },
      { time: "20:00", normal: 101, anomaly: 85 },
    ]
  };

  const renderChart = () => {
    switch (selectedChart) {
      case "revenue_trend":
        return (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Revenue Trend Analysis</h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData.revenue_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1F2937", border: "none", borderRadius: "8px" }}
                  labelStyle={{ color: "#F9FAFB" }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} name="Actual Revenue" />
                <Line type="monotone" dataKey="target" stroke="#10B981" strokeWidth={2} strokeDasharray="5 5" name="Target" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

      case "market_share":
        return (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Market Share Distribution</h3>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={chartData.market_share}
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {chartData.market_share.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );

      case "customer_segments":
        return (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Customer Segments</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData.customer_segments}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="segment" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1F2937", border: "none", borderRadius: "8px" }}
                  labelStyle={{ color: "#F9FAFB" }}
                />
                <Bar dataKey="value" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case "anomaly_detection":
        return (
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Anomaly Detection</h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData.anomaly_detection}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1F2937", border: "none", borderRadius: "8px" }}
                  labelStyle={{ color: "#F9FAFB" }}
                />
                <Line type="monotone" dataKey="normal" stroke="#10B981" strokeWidth={2} name="Normal Range" />
                <Scatter dataKey="anomaly" fill="#EF4444" name="Anomalies" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Data Visualizations</h1>
      <p className="text-gray-400 mb-6">Interactive charts and analytics dashboards</p>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Chart Selector */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Chart Types</h3>
          <div className="space-y-2">
            {[
              { id: "revenue_trend", name: "Revenue Trends", icon: "📈" },
              { id: "market_share", name: "Market Share", icon: "🥧" },
              { id: "customer_segments", name: "Customer Segments", icon: "👥" },
              { id: "anomaly_detection", name: "Anomaly Detection", icon: "⚠️" },
            ].map((chart) => (
              <button
                key={chart.id}
                onClick={() => setSelectedChart(chart.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedChart === chart.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-lg">{chart.icon}</span>
                  <span className="font-medium">{chart.name}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-600">
            <h4 className="text-white font-medium mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm text-gray-300 transition-colors">
                Export Chart
              </button>
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm text-gray-300 transition-colors">
                Share Dashboard
              </button>
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm text-gray-300 transition-colors">
                Schedule Report
              </button>
            </div>
          </div>
        </div>

        {/* Chart Display */}
        <div className="lg:col-span-3">
          {renderChart()}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Scatter } from "recharts";
import KPICard from "../components/KPICard";

const dataQualityData = [
  { metric: "Completeness", value: 94.2 },
  { metric: "Accuracy", value: 87.5 },
  { metric: "Consistency", value: 91.8 },
  { metric: "Timeliness", value: 96.3 },
];

const anomalyData = [
  { time: "00:00", normal: 100, anomaly: null },
  { time: "04:00", normal: 98, anomaly: null },
  { time: "08:00", normal: 95, anomaly: 120 },
  { time: "12:00", normal: 102, anomaly: null },
  { time: "16:00", normal: 99, anomaly: null },
  { time: "20:00", normal: 101, anomaly: 85 },
];

const modelPerformanceData = [
  { model: "Random Forest", accuracy: 0.92, precision: 0.89, recall: 0.91 },
  { model: "Neural Network", accuracy: 0.88, precision: 0.85, recall: 0.87 },
  { model: "SVM", accuracy: 0.85, precision: 0.82, recall: 0.83 },
  { model: "Logistic Regression", accuracy: 0.78, precision: 0.75, recall: 0.76 },
];

const sampleData = [
  { id: 1, feature1: 2.5, feature2: 3.1, cluster: "A" },
  { id: 2, feature1: 1.8, feature2: 2.9, cluster: "A" },
  { id: 3, feature1: 4.2, feature2: 1.5, cluster: "B" },
  { id: 4, feature1: 3.9, feature2: 1.2, cluster: "B" },
  { id: 5, feature1: 2.1, feature2: 4.0, cluster: "C" },
];

// Modern chart colors
const chartColors = {
  primary: "#14B8A6",
  secondary: "#0D9488",
  tertiary: "#2DD4BF",
  quaternary: "#5EEAD4",
  grid: "rgba(148, 163, 184, 0.1)",
  text: "#94A3B8",
  anomaly: "#EF4444"
};

export default function DataAnalystDashboard() {
  const [selectedModel, setSelectedModel] = useState("Random Forest");

  return (
    <div className="space-y-6">

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard title="Total Records Processed" value="1,247,583" change="+15.2%" changeType="positive" />
        <KPICard title="Missing Values Detected" value="23,456" change="-8.3%" changeType="positive" />
        <KPICard title="Outliers Identified" value="1,892" change="+5.7%" changeType="negative" />
        <KPICard title="Data Quality Score" value="92.4%" change="+2.1%" changeType="positive" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Quality Metrics */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Data Quality Metrics</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dataQualityData}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="none" vertical={false} />
              <XAxis 
                dataKey="metric" 
                stroke={chartColors.text} 
                tick={{ fill: chartColors.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                stroke={chartColors.text} 
                tick={{ fill: chartColors.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 100]} 
              />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: "var(--bg-secondary)", 
                  border: "none", 
                  borderRadius: "12px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
                }}
                labelStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
                itemStyle={{ color: chartColors.primary }}
              />
              <Bar 
                dataKey="value" 
                fill={chartColors.primary}
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Anomaly Detection */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Anomaly Detection</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={anomalyData}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="none" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke={chartColors.text} 
                tick={{ fill: chartColors.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                stroke={chartColors.text} 
                tick={{ fill: chartColors.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: "var(--bg-secondary)", 
                  border: "none", 
                  borderRadius: "12px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
                }}
                labelStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Line 
                type="monotone" 
                dataKey="normal" 
                stroke={chartColors.secondary} 
                strokeWidth={3}
                dot={{ fill: chartColors.secondary, strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: chartColors.secondary, stroke: "#fff", strokeWidth: 2 }}
                name="Normal Range" 
              />
              <Scatter 
                dataKey="anomaly" 
                fill={chartColors.anomaly} 
                name="Anomalies"
                stroke="var(--bg-card)"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model Performance */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Model Performance</h3>
          <div className="mb-4">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-theme-secondary text-theme-primary px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              {modelPerformanceData.map((model) => (
                <option key={model.model} value={model.model} className="bg-theme-card">{model.model}</option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={modelPerformanceData.filter(m => m.model === selectedModel)}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="none" vertical={false} />
              <XAxis 
                dataKey="model" 
                stroke={chartColors.text} 
                tick={{ fill: chartColors.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                stroke={chartColors.text} 
                tick={{ fill: chartColors.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 1]} 
              />
              <Tooltip
                contentStyle={{ 
                  backgroundColor: "var(--bg-secondary)", 
                  border: "none", 
                  borderRadius: "12px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
                }}
                labelStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Bar dataKey="accuracy" fill={chartColors.primary} name="Accuracy" radius={[6, 6, 0, 0]} />
              <Bar dataKey="precision" fill={chartColors.secondary} name="Precision" radius={[6, 6, 0, 0]} />
              <Bar dataKey="recall" fill={chartColors.tertiary} name="Recall" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Feature Correlation Heatmap Placeholder */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Feature Correlation Heatmap</h3>
          <div className="flex items-center justify-center h-64 bg-theme-secondary rounded-xl">
            <div className="text-center">
              <div className="text-4xl mb-2">🔥</div>
              <p className="text-theme-muted">Correlation Matrix Visualization</p>
              <p className="text-sm text-theme-muted mt-2">Interactive heatmap showing feature relationships</p>
            </div>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
        <h3 className="text-lg font-semibold text-theme-primary mb-4">Sample Data Preview</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-theme-secondary">
            <thead className="text-xs text-theme-muted uppercase bg-theme-secondary">
              <tr>
                <th className="px-6 py-3 rounded-tl-lg">ID</th>
                <th className="px-6 py-3">Feature 1</th>
                <th className="px-6 py-3">Feature 2</th>
                <th className="px-6 py-3 rounded-tr-lg">Cluster</th>
              </tr>
            </thead>
            <tbody>
              {sampleData.map((row, index) => (
                <tr 
                  key={row.id} 
                  className={`hover:bg-theme-secondary transition-colors ${
                    index === sampleData.length - 1 ? '' : 'border-b border-theme-light'
                  }`}
                >
                  <td className="px-6 py-4">{row.id}</td>
                  <td className="px-6 py-4">{row.feature1}</td>
                  <td className="px-6 py-4">{row.feature2}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs text-theme-inverse ${
                      row.cluster === "A" ? "bg-accent-primary" :
                      row.cluster === "B" ? "bg-green-600" : "bg-purple-600"
                    }`}>
                      {row.cluster}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

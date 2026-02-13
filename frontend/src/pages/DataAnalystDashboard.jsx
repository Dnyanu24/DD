import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ScatterChart, Scatter } from "recharts";
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
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Data Quality Metrics</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dataQualityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-medium)" />
              <XAxis dataKey="metric" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-medium)", borderRadius: "8px" }}
                labelStyle={{ color: "var(--text-primary)" }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Bar dataKey="value" fill="#14B8A6" />

            </BarChart>
          </ResponsiveContainer>
        </div>


        {/* Anomaly Detection */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Anomaly Detection</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={anomalyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-medium)" />
              <XAxis dataKey="time" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-medium)", borderRadius: "8px" }}
                labelStyle={{ color: "var(--text-primary)" }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Line type="monotone" dataKey="normal" stroke="#0D9488" strokeWidth={2} name="Normal Range" />

              <Scatter dataKey="anomaly" fill="#EF4444" name="Anomalies" />
            </LineChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model Performance */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Model Performance</h3>
          <div className="mb-4">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-theme-secondary text-theme-primary px-3 py-2 rounded border border-theme-medium focus:outline-none focus:border-accent-primary"
            >
              {modelPerformanceData.map((model) => (
                <option key={model.model} value={model.model} className="bg-theme-card">{model.model}</option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={modelPerformanceData.filter(m => m.model === selectedModel)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-medium)" />
              <XAxis dataKey="model" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" domain={[0, 1]} />
              <Tooltip
                contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-medium)", borderRadius: "8px" }}
                labelStyle={{ color: "var(--text-primary)" }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Bar dataKey="accuracy" fill="#14B8A6" name="Accuracy" />
              <Bar dataKey="precision" fill="#0D9488" name="Precision" />
              <Bar dataKey="recall" fill="#2DD4BF" name="Recall" />

            </BarChart>
          </ResponsiveContainer>
        </div>


        {/* Feature Correlation Heatmap Placeholder */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Feature Correlation Heatmap</h3>
          <div className="flex items-center justify-center h-64 bg-theme-secondary rounded">
            <div className="text-center">
              <div className="text-4xl mb-2">🔥</div>
              <p className="text-theme-muted">Correlation Matrix Visualization</p>
              <p className="text-sm text-theme-muted mt-2">Interactive heatmap showing feature relationships</p>
            </div>
          </div>
        </div>

      </div>

      {/* Data Table */}
      <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
        <h3 className="text-lg font-semibold text-theme-primary mb-4">Sample Data Preview</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-theme-secondary">
            <thead className="text-xs text-theme-muted uppercase bg-theme-secondary">
              <tr>
                <th className="px-6 py-3">ID</th>
                <th className="px-6 py-3">Feature 1</th>
                <th className="px-6 py-3">Feature 2</th>
                <th className="px-6 py-3">Cluster</th>
              </tr>
            </thead>
            <tbody>
              {sampleData.map((row) => (
                <tr key={row.id} className="bg-theme-card border-b border-theme-medium hover:bg-theme-secondary transition-colors">
                  <td className="px-6 py-4">{row.id}</td>
                  <td className="px-6 py-4">{row.feature1}</td>
                  <td className="px-6 py-4">{row.feature2}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs text-theme-inverse ${
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

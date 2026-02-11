import { useState } from "react";
import KPICard from "../components/KPICard";

export default function DataCleaning() {
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("missing_values");

  const algorithms = [
    {
      id: "missing_values",
      name: "Missing Value Imputation",
      description: "Handle missing data using mean, median, or ML-based imputation",
      status: "Active",
      accuracy: "94.2%"
    },
    {
      id: "duplicates",
      name: "Duplicate Detection & Removal",
      description: "Identify and remove duplicate records",
      status: "Active",
      accuracy: "98.7%"
    },
    {
      id: "outliers",
      name: "Outlier Detection",
      description: "Detect outliers using Z-Score and IQR methods",
      status: "Active",
      accuracy: "91.5%"
    },
    {
      id: "data_types",
      name: "Data Type Correction",
      description: "Automatically correct inconsistent data types",
      status: "Active",
      accuracy: "96.8%"
    },
    {
      id: "normalization",
      name: "Data Normalization",
      description: "Scale data using Min-Max or Z-Score normalization",
      status: "Active",
      accuracy: "100%"
    },
    {
      id: "noise_reduction",
      name: "Noise Reduction",
      description: "Remove noise using moving average smoothing",
      status: "Active",
      accuracy: "89.3%"
    },
    {
      id: "text_cleaning",
      name: "Text Cleaning",
      description: "Clean and preprocess text data",
      status: "Active",
      accuracy: "92.1%"
    },
    {
      id: "validation",
      name: "Rule-based Validation",
      description: "Validate data against business rules",
      status: "Active",
      accuracy: "95.4%"
    },
    {
      id: "consistency",
      name: "Cross-table Consistency",
      description: "Ensure consistency across related tables",
      status: "Active",
      accuracy: "93.6%"
    },
    {
      id: "integration",
      name: "Multi-source Integration",
      description: "Integrate data from multiple sources",
      status: "Active",
      accuracy: "87.9%"
    }
  ];

  const qualityMetrics = [
    { title: "Overall Data Quality", value: "92.4%", change: "+2.1%" },
    { title: "Records Processed", value: "1,247,583", change: "+15.2%" },
    { title: "Missing Values Fixed", value: "23,456", change: "-8.3%" },
    { title: "Duplicates Removed", value: "1,892", change: "+5.7%" },
  ];

  const recentActivity = [
    { time: "2 min ago", action: "Processed 5,000 records", algorithm: "Missing Value Imputation" },
    { time: "15 min ago", action: "Removed 23 duplicates", algorithm: "Duplicate Detection" },
    { time: "1 hour ago", action: "Detected 156 outliers", algorithm: "Outlier Detection" },
    { time: "2 hours ago", action: "Normalized 3 datasets", algorithm: "Data Normalization" },
  ];

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Data Cleaning</h1>
      <p className="text-gray-400 mb-6">Monitor and manage ML-assisted data cleaning algorithms</p>

      {/* Quality Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {qualityMetrics.map((metric, index) => (
          <KPICard
            key={index}
            title={metric.title}
            value={metric.value}
            change={metric.change}
            changeType="positive"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Algorithms List */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Cleaning Algorithms</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {algorithms.map((algo) => (
              <div
                key={algo.id}
                onClick={() => setSelectedAlgorithm(algo.id)}
                className={`p-4 rounded-lg cursor-pointer transition-colors ${
                  selectedAlgorithm === algo.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-sm">{algo.name}</h4>
                  <span className={`px-2 py-1 rounded text-xs ${
                    algo.status === "Active" ? "bg-green-600" : "bg-yellow-600"
                  }`}>
                    {algo.status}
                  </span>
                </div>
                <p className="text-xs opacity-80 mb-2">{algo.description}</p>
                <div className="text-xs opacity-60">
                  Accuracy: {algo.accuracy}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Algorithm Details */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Algorithm Details</h3>
          {selectedAlgorithm && (
            <div className="space-y-4">
              {(() => {
                const algo = algorithms.find(a => a.id === selectedAlgorithm);
                return (
                  <>
                    <div>
                      <h4 className="font-medium text-white mb-2">{algo.name}</h4>
                      <p className="text-gray-300 text-sm mb-4">{algo.description}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-700 p-3 rounded">
                        <div className="text-xs text-gray-400">Accuracy</div>
                        <div className="text-lg font-bold text-white">{algo.accuracy}</div>
                      </div>
                      <div className="bg-gray-700 p-3 rounded">
                        <div className="text-xs text-gray-400">Status</div>
                        <div className={`text-lg font-bold ${
                          algo.status === "Active" ? "text-green-400" : "text-yellow-400"
                        }`}>
                          {algo.status}
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-700 p-4 rounded">
                      <h5 className="text-white font-medium mb-2">Performance Metrics</h5>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-300">Processing Speed:</span>
                          <span className="text-white">1.2s per 1K records</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Memory Usage:</span>
                          <span className="text-white">45 MB</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Last Updated:</span>
                          <span className="text-white">2 hours ago</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <button className="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors">
                        Run Algorithm
                      </button>
                      <button className="flex-1 bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-lg transition-colors">
                        Configure
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {recentActivity.map((activity, index) => (
              <div key={index} className="bg-gray-700 p-3 rounded">
                <div className="text-sm text-white mb-1">{activity.action}</div>
                <div className="text-xs text-gray-400 mb-1">{activity.algorithm}</div>
                <div className="text-xs text-gray-500">{activity.time}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-600">
            <h4 className="text-white font-medium mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                Run All Algorithms
              </button>
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                View Quality Report
              </button>
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                Export Logs
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

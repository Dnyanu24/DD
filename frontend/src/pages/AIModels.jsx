import { useState } from "react";
import KPICard from "../components/KPICard";

export default function AIModels() {
  const [selectedModel, setSelectedModel] = useState("forecasting");

  const models = [
    {
      id: "forecasting",
      name: "Sales Forecasting",
      description: "Predict future sales using time series analysis",
      accuracy: "92.4%",
      status: "Active"
    },
    {
      id: "anomaly",
      name: "Anomaly Detection",
      description: "Identify unusual patterns in data",
      accuracy: "88.7%",
      status: "Active"
    },
    {
      id: "clustering",
      name: "Customer Segmentation",
      description: "Group customers based on behavior patterns",
      accuracy: "85.3%",
      status: "Training"
    },
    {
      id: "recommendation",
      name: "Recommendation Engine",
      description: "Suggest optimal actions based on data insights",
      accuracy: "91.1%",
      status: "Active"
    },
  ];

  const performanceMetrics = [
    { title: "Overall Accuracy", value: "89.4%", change: "+2.3%" },
    { title: "Prediction Speed", value: "1.2s", change: "-0.3s" },
    { title: "Model Updates", value: "24", change: "+3" },
    { title: "Data Processed", value: "2.1M", change: "+15.2%" },
  ];

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">AI Models</h1>
      <p className="text-gray-400 mb-6">Manage and monitor AI prediction models</p>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {performanceMetrics.map((metric, index) => (
          <KPICard
            key={index}
            title={metric.title}
            value={metric.value}
            change={metric.change}
            changeType="positive"
          />
        ))}
      </div>

      {/* Models Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Available Models</h3>
          <div className="space-y-3">
            {models.map((model) => (
              <div
                key={model.id}
                onClick={() => setSelectedModel(model.id)}
                className={`p-4 rounded-lg cursor-pointer transition-colors ${
                  selectedModel === model.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium">{model.name}</h4>
                  <span className={`px-2 py-1 rounded text-xs ${
                    model.status === "Active" ? "bg-green-600" : "bg-yellow-600"
                  }`}>
                    {model.status}
                  </span>
                </div>
                <p className="text-sm opacity-80 mb-2">{model.description}</p>
                <div className="text-sm">
                  <span className="opacity-60">Accuracy: </span>
                  <span className="font-medium">{model.accuracy}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Model Details */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Model Details</h3>
          {selectedModel && (
            <div className="space-y-4">
              {(() => {
                const model = models.find(m => m.id === selectedModel);
                return (
                  <>
                    <div>
                      <h4 className="font-medium text-white mb-2">{model.name}</h4>
                      <p className="text-gray-300 text-sm mb-4">{model.description}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-700 p-3 rounded">
                        <div className="text-xs text-gray-400">Accuracy</div>
                        <div className="text-lg font-bold text-white">{model.accuracy}</div>
                      </div>
                      <div className="bg-gray-700 p-3 rounded">
                        <div className="text-xs text-gray-400">Status</div>
                        <div className={`text-lg font-bold ${
                          model.status === "Active" ? "text-green-400" : "text-yellow-400"
                        }`}>
                          {model.status}
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-700 p-4 rounded">
                      <h5 className="text-white font-medium mb-2">Recent Performance</h5>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-300">Last Updated:</span>
                          <span className="text-white">2 hours ago</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Training Data:</span>
                          <span className="text-white">1.2M records</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Feedback Loops:</span>
                          <span className="text-white">Active</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <button className="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors">
                        Retrain Model
                      </button>
                      <button className="flex-1 bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-lg transition-colors">
                        View Logs
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

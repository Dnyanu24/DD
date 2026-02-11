import { useState } from "react";
import KPICard from "../components/KPICard";

export default function Reports() {
  const [selectedReport, setSelectedReport] = useState("monthly_summary");

  const reports = [
    {
      id: "monthly_summary",
      name: "Monthly Summary Report",
      description: "Comprehensive monthly performance overview",
      lastGenerated: "2 hours ago",
      status: "Ready"
    },
    {
      id: "data_quality",
      name: "Data Quality Report",
      description: "Data cleaning and quality metrics analysis",
      lastGenerated: "1 day ago",
      status: "Ready"
    },
    {
      id: "ai_performance",
      name: "AI Performance Report",
      description: "AI model accuracy and prediction metrics",
      lastGenerated: "6 hours ago",
      status: "Ready"
    },
    {
      id: "forecast_accuracy",
      name: "Forecast Accuracy Report",
      description: "Analysis of prediction model performance",
      lastGenerated: "3 hours ago",
      status: "Ready"
    },
    {
      id: "user_activity",
      name: "User Activity Report",
      description: "Platform usage and engagement metrics",
      lastGenerated: "12 hours ago",
      status: "Ready"
    },
    {
      id: "anomaly_summary",
      name: "Anomaly Detection Summary",
      description: "Summary of detected anomalies and alerts",
      lastGenerated: "4 hours ago",
      status: "Ready"
    }
  ];

  const reportMetrics = [
    { title: "Reports Generated", value: "247", change: "+12" },
    { title: "Scheduled Reports", value: "15", change: "+2" },
    { title: "Average Generation Time", value: "2.3s", change: "-0.5s" },
    { title: "Report Views", value: "1,892", change: "+8.3%" },
  ];

  const scheduledReports = [
    { name: "Daily Data Quality Check", schedule: "Daily at 6:00 AM", nextRun: "Tomorrow 6:00 AM" },
    { name: "Weekly Performance Summary", schedule: "Weekly on Monday", nextRun: "Monday 9:00 AM" },
    { name: "Monthly Executive Report", schedule: "Monthly on 1st", nextRun: "Next Month 1st" },
  ];

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Reports</h1>
      <p className="text-gray-400 mb-6">Generate and manage automated analytics reports</p>

      {/* Report Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {reportMetrics.map((metric, index) => (
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
        {/* Available Reports */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Available Reports</h3>
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                onClick={() => setSelectedReport(report.id)}
                className={`p-4 rounded-lg cursor-pointer transition-colors ${
                  selectedReport === report.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium">{report.name}</h4>
                  <span className={`px-2 py-1 rounded text-xs ${
                    report.status === "Ready" ? "bg-green-600" : "bg-yellow-600"
                  }`}>
                    {report.status}
                  </span>
                </div>
                <p className="text-sm opacity-80 mb-2">{report.description}</p>
                <div className="text-xs opacity-60">
                  Last generated: {report.lastGenerated}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Report Details */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Report Details</h3>
          {selectedReport && (
            <div className="space-y-4">
              {(() => {
                const report = reports.find(r => r.id === selectedReport);
                return (
                  <>
                    <div>
                      <h4 className="font-medium text-white mb-2">{report.name}</h4>
                      <p className="text-gray-300 text-sm mb-4">{report.description}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-700 p-3 rounded">
                        <div className="text-xs text-gray-400">Status</div>
                        <div className={`text-lg font-bold ${
                          report.status === "Ready" ? "text-green-400" : "text-yellow-400"
                        }`}>
                          {report.status}
                        </div>
                      </div>
                      <div className="bg-gray-700 p-3 rounded">
                        <div className="text-xs text-gray-400">Last Generated</div>
                        <div className="text-lg font-bold text-white">{report.lastGenerated}</div>
                      </div>
                    </div>

                    <div className="bg-gray-700 p-4 rounded">
                      <h5 className="text-white font-medium mb-2">Report Contents</h5>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-300">Data Sources:</span>
                          <span className="text-white">5 datasets</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Time Range:</span>
                          <span className="text-white">Last 30 days</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">File Size:</span>
                          <span className="text-white">2.4 MB</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-300">Format:</span>
                          <span className="text-white">PDF, Excel</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <button className="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors">
                        Generate Report
                      </button>
                      <button className="flex-1 bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-lg transition-colors">
                        Download
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Scheduled Reports */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Scheduled Reports</h3>
          <div className="space-y-3 mb-6">
            {scheduledReports.map((scheduled, index) => (
              <div key={index} className="bg-gray-700 p-3 rounded">
                <div className="text-sm text-white mb-1">{scheduled.name}</div>
                <div className="text-xs text-gray-400 mb-1">{scheduled.schedule}</div>
                <div className="text-xs text-gray-500">Next: {scheduled.nextRun}</div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-gray-600">
            <h4 className="text-white font-medium mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                Schedule New Report
              </button>
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                View Report History
              </button>
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                Export All Reports
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

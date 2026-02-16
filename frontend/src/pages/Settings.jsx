import { useState } from "react";
import KPICard from "../components/KPICard";
import { Bot, Bell, Database, Lock, Settings as SettingsIcon } from "lucide-react";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("general");

  const systemMetrics = [
    { title: "System Uptime", value: "99.9%", change: "+0.1%" },
    { title: "API Response Time", value: "245ms", change: "-15ms" },
    { title: "Data Processing", value: "2.1M", change: "+15.2%" },
    { title: "Active Users", value: "16", change: "+2" },
  ];

  const tabs = [
    { id: "general", name: "General", icon: SettingsIcon },
    { id: "security", name: "Security", icon: Lock },
    { id: "data", name: "Data Management", icon: Database },
    { id: "ai", name: "AI Configuration", icon: Bot },
    { id: "notifications", name: "Notifications", icon: Bell },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "general":
        return (
          <div className="space-y-6">
            <div className="bg-gray-700 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-4">System Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">System Name</label>
                  <input
                    type="text"
                    defaultValue="SDAS - Smart Data Analytics System"
                    className="w-full bg-gray-600 text-white px-3 py-2 rounded border border-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Version</label>
                  <input
                    type="text"
                    defaultValue="1.0.0"
                    className="w-full bg-gray-600 text-white px-3 py-2 rounded border border-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Environment</label>
                  <select className="w-full bg-gray-600 text-white px-3 py-2 rounded border border-gray-500 focus:border-blue-500 focus:outline-none">
                    <option>Development</option>
                    <option>Staging</option>
                    <option>Production</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Timezone</label>
                  <select className="w-full bg-gray-600 text-white px-3 py-2 rounded border border-gray-500 focus:border-blue-500 focus:outline-none">
                    <option>UTC</option>
                    <option>EST</option>
                    <option>PST</option>
                    <option>CET</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-gray-700 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-4">Performance Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Auto-save Interval</h4>
                    <p className="text-sm text-gray-400">How often to save data automatically</p>
                  </div>
                  <select className="bg-gray-600 text-white px-3 py-2 rounded border border-gray-500">
                    <option>30 seconds</option>
                    <option>1 minute</option>
                    <option>5 minutes</option>
                    <option>10 minutes</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Cache Expiration</h4>
                    <p className="text-sm text-gray-400">How long to keep cached data</p>
                  </div>
                  <select className="bg-gray-600 text-white px-3 py-2 rounded border border-gray-500">
                    <option>1 hour</option>
                    <option>6 hours</option>
                    <option>24 hours</option>
                    <option>7 days</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );

      case "security":
        return (
          <div className="space-y-6">
            <div className="bg-gray-700 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-4">Authentication Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">JWT Token Expiration</h4>
                    <p className="text-sm text-gray-400">How long tokens remain valid</p>
                  </div>
                  <select className="bg-gray-600 text-white px-3 py-2 rounded border border-gray-500">
                    <option>1 hour</option>
                    <option>8 hours</option>
                    <option>24 hours</option>
                    <option>7 days</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Password Policy</h4>
                    <p className="text-sm text-gray-400">Minimum password requirements</p>
                  </div>
                  <select className="bg-gray-600 text-white px-3 py-2 rounded border border-gray-500">
                    <option>Basic (8 chars)</option>
                    <option>Strong (12 chars + symbols)</option>
                    <option>Enterprise (complex)</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Two-Factor Authentication</h4>
                    <p className="text-sm text-gray-400">Require 2FA for all users</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-gray-700 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-4">Access Control</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Session Timeout</h4>
                    <p className="text-sm text-gray-400">Auto-logout after inactivity</p>
                  </div>
                  <select className="bg-gray-600 text-white px-3 py-2 rounded border border-gray-500">
                    <option>15 minutes</option>
                    <option>30 minutes</option>
                    <option>1 hour</option>
                    <option>Never</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">IP Whitelisting</h4>
                    <p className="text-sm text-gray-400">Restrict access by IP address</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      case "data":
        return (
          <div className="space-y-6">
            <div className="bg-gray-700 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-4">Data Storage Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Data Retention Period</h4>
                    <p className="text-sm text-gray-400">How long to keep processed data</p>
                  </div>
                  <select className="bg-gray-600 text-white px-3 py-2 rounded border border-gray-500">
                    <option>30 days</option>
                    <option>90 days</option>
                    <option>1 year</option>
                    <option>Forever</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Backup Frequency</h4>
                    <p className="text-sm text-gray-400">How often to backup data</p>
                  </div>
                  <select className="bg-gray-600 text-white px-3 py-2 rounded border border-gray-500">
                    <option>Daily</option>
                    <option>Weekly</option>
                    <option>Monthly</option>
                    <option>Manual only</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Compression</h4>
                    <p className="text-sm text-gray-400">Compress stored data</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-gray-700 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-4">Data Quality Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Auto-cleaning Threshold</h4>
                    <p className="text-sm text-gray-400">Minimum quality score to accept data</p>
                  </div>
                  <input
                    type="number"
                    defaultValue="85"
                    min="0"
                    max="100"
                    className="bg-gray-600 text-white px-3 py-2 rounded border border-gray-500 focus:border-blue-500 focus:outline-none w-20"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Duplicate Detection</h4>
                    <p className="text-sm text-gray-400">Automatically remove duplicates</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      case "ai":
        return (
          <div className="space-y-6">
            <div className="bg-gray-700 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-4">AI Model Configuration</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Prediction Confidence Threshold</h4>
                    <p className="text-sm text-gray-400">Minimum confidence for predictions</p>
                  </div>
                  <input
                    type="number"
                    defaultValue="75"
                    min="0"
                    max="100"
                    className="bg-gray-600 text-white px-3 py-2 rounded border border-gray-500 focus:border-blue-500 focus:outline-none w-20"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Model Retraining Frequency</h4>
                    <p className="text-sm text-gray-400">How often to retrain models</p>
                  </div>
                  <select className="bg-gray-600 text-white px-3 py-2 rounded border border-gray-500">
                    <option>Daily</option>
                    <option>Weekly</option>
                    <option>Monthly</option>
                    <option>Manual</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Feedback Learning</h4>
                    <p className="text-sm text-gray-400">Learn from user corrections</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-gray-700 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-4">Algorithm Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Outlier Detection Sensitivity</h4>
                    <p className="text-sm text-gray-400">Z-score threshold for outliers</p>
                  </div>
                  <input
                    type="number"
                    defaultValue="3"
                    min="1"
                    max="5"
                    step="0.1"
                    className="bg-gray-600 text-white px-3 py-2 rounded border border-gray-500 focus:border-blue-500 focus:outline-none w-20"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Missing Value Strategy</h4>
                    <p className="text-sm text-gray-400">Default imputation method</p>
                  </div>
                  <select className="bg-gray-600 text-white px-3 py-2 rounded border border-gray-500">
                    <option>Mean</option>
                    <option>Median</option>
                    <option>Mode</option>
                    <option>ML-based</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );

      case "notifications":
        return (
          <div className="space-y-6">
            <div className="bg-gray-700 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-4">Email Notifications</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Data Processing Alerts</h4>
                    <p className="text-sm text-gray-400">Notify when data processing completes</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">AI Model Updates</h4>
                    <p className="text-sm text-gray-400">Notify when models are retrained</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">System Alerts</h4>
                    <p className="text-sm text-gray-400">Notify on system errors or warnings</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Report Generation</h4>
                    <p className="text-sm text-gray-400">Notify when scheduled reports are ready</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-gray-700 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-white mb-4">In-App Notifications</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Real-time Alerts</h4>
                    <p className="text-sm text-gray-400">Show real-time notifications in dashboard</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Weekly Digest</h4>
                    <p className="text-sm text-gray-400">Send weekly summary of activities</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Settings</h1>
      <p className="text-gray-400 mb-6">Configure system preferences and settings</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {systemMetrics.map((metric, index) => (
          <KPICard
            key={index}
            title={metric.title}
            value={metric.value}
            change={metric.change}
            changeType="positive"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Configuration</h3>
          <div className="space-y-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors flex items-center space-x-3 ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <tab.icon className="h-5 w-5" />
                <span className="font-medium">{tab.name}</span>
              </button>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-600">
            <h4 className="text-white font-medium mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                Save All Settings
              </button>
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                Reset to Defaults
              </button>
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                Export Settings
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}

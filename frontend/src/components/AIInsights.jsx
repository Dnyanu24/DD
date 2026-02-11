import { useState } from "react";
import { Brain, TrendingUp, AlertTriangle, Lightbulb, Send } from "lucide-react";

export default function AIInsights() {
  const [query, setQuery] = useState("");
  const [insights] = useState([
    {
      type: "forecast",
      icon: TrendingUp,
      title: "Revenue Forecast",
      content: "Q4 revenue projected to increase by 18.2% based on current trends and market analysis.",
      confidence: "92%"
    },
    {
      type: "anomaly",
      icon: AlertTriangle,
      title: "Anomaly Detected",
      content: "Unusual spike in user engagement detected in the Asia-Pacific region. Potential market opportunity.",
      severity: "medium"
    },
    {
      type: "recommendation",
      icon: Lightbulb,
      title: "Smart Recommendation",
      content: "Consider increasing marketing budget for enterprise segment. ROI potential: 340%.",
      impact: "high"
    }
  ]);

  const handleQuerySubmit = (e) => {
    e.preventDefault();
    // Handle AI query submission
    console.log("AI Query:", query);
    setQuery("");
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
      <div className="flex items-center space-x-3 mb-6">
        <Brain className="w-6 h-6 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">AI Insights Engine</h3>
      </div>

      {/* AI Query Box */}
      <div className="mb-6">
        <form onSubmit={handleQuerySubmit} className="flex space-x-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask AI about your data..."
            className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-purple-400"
          />
          <button
            type="submit"
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
          >
            <Send className="w-4 h-4" />
            <span>Ask</span>
          </button>
        </form>
      </div>

      {/* Insights List */}
      <div className="space-y-4">
        {insights.map((insight, index) => {
          const Icon = insight.icon;
          return (
            <div key={index} className="bg-gray-700 p-4 rounded-lg border border-gray-600">
              <div className="flex items-start space-x-3">
                <div className={`p-2 rounded-lg ${
                  insight.type === "forecast" ? "bg-blue-600" :
                  insight.type === "anomaly" ? "bg-yellow-600" : "bg-green-600"
                }`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-white mb-1">{insight.title}</h4>
                  <p className="text-sm text-gray-300 mb-2">{insight.content}</p>
                  <div className="flex items-center space-x-4 text-xs">
                    {insight.confidence && (
                      <span className="text-green-400">Confidence: {insight.confidence}</span>
                    )}
                    {insight.severity && (
                      <span className={`${
                        insight.severity === "high" ? "text-red-400" :
                        insight.severity === "medium" ? "text-yellow-400" : "text-green-400"
                      }`}>
                        Severity: {insight.severity}
                      </span>
                    )}
                    {insight.impact && (
                      <span className={`${
                        insight.impact === "high" ? "text-green-400" :
                        insight.impact === "medium" ? "text-yellow-400" : "text-blue-400"
                      }`}>
                        Impact: {insight.impact}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="mt-6 pt-4 border-t border-gray-600">
        <h4 className="text-sm font-semibold text-white mb-3">Quick Actions</h4>
        <div className="grid grid-cols-2 gap-2">
          <button className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm text-gray-300 transition-colors">
            Generate Report
          </button>
          <button className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm text-gray-300 transition-colors">
            Export Insights
          </button>
          <button className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm text-gray-300 transition-colors">
            Schedule Alert
          </button>
          <button className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm text-gray-300 transition-colors">
            View Trends
          </button>
        </div>
      </div>
    </div>
  );
}

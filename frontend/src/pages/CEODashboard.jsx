import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import KPICard from "../components/KPICard";
import AIInsights from "../components/AIInsights";

// Default data - can be overridden by props or API
const defaultTrendData = [
  { month: "Jan", revenue: 120000, growth: 5.2 },
  { month: "Feb", revenue: 135000, growth: 12.5 },
  { month: "Mar", revenue: 142000, growth: 5.2 },
  { month: "Apr", revenue: 158000, growth: 11.3 },
  { month: "May", revenue: 165000, growth: 4.4 },
  { month: "Jun", revenue: 178000, growth: 7.9 },
];

const defaultMarketShareData = [
  { name: "SDAS", value: 35, color: "#14B8A6" },
  { name: "Competitor A", value: 25, color: "#0D9488" },
  { name: "Competitor B", value: 20, color: "#2DD4BF" },
  { name: "Others", value: 20, color: "#5EEAD4" },
];

// Modern chart colors with glow effect
const chartColors = {
  primary: "#14B8A6",
  secondary: "#0D9488",
  tertiary: "#2DD4BF",
  quaternary: "#5EEAD4",
  grid: "rgba(148, 163, 184, 0.1)",
  text: "#94A3B8"
};

// Empty state component
const EmptyState = ({ message = "No data available" }) => (
  <div className="flex items-center justify-center h-64 text-theme-muted">
    <div className="text-center">
      <div className="text-4xl mb-2">ðŸ“Š</div>
      <p>{message}</p>
    </div>
  </div>
);





export default function CEODashboard({ trendData = defaultTrendData, marketShareData = defaultMarketShareData, alerts: propAlerts }) {
  const [defaultAlerts] = useState([
    { id: 1, type: "warning", message: "Revenue growth slowing in Q3", time: "2 hours ago" },
    { id: 2, type: "info", message: "New market opportunity identified", time: "4 hours ago" },
    { id: 3, type: "success", message: "AI forecast accuracy improved by 15%", time: "1 day ago" },
  ]);

  // Use prop data if provided, otherwise use defaults
  const alerts = propAlerts || defaultAlerts;
  
  // Check if data is empty
  const hasTrendData = trendData && trendData.length > 0;
  const hasMarketShareData = marketShareData && marketShareData.length > 0;
  const hasAlerts = alerts && alerts.length > 0;

  return (

    <div className="space-y-6">

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard title="Total Revenue" value="$1.2M" change="+12.5%" changeType="positive" />
        <KPICard title="Monthly Growth" value="7.9%" change="+2.1%" changeType="positive" />
        <KPICard title="Active Users" value="15,420" change="+8.3%" changeType="positive" />
        <KPICard title="AI Forecasted Revenue" value="$2.1M" change="+18.2%" changeType="positive" />
      </div>

      {/* AI Insights Engine */}
      <AIInsights />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Strategic Trend Analysis */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Strategic Trend Analysis</h3>
          {hasTrendData ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>

              <CartesianGrid stroke={chartColors.grid} strokeDasharray="none" vertical={false} />
              <XAxis 
                dataKey="month" 
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
                tickFormatter={(value) => `$${value/1000}k`}
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
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke={chartColors.primary} 
                strokeWidth={3}
                dot={{ fill: chartColors.primary, strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: chartColors.primary, stroke: "#fff", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
          ) : (
            <EmptyState message="No trend data available" />
          )}
        </div>




        {/* Market Share */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Market Share</h3>
          {hasMarketShareData ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={marketShareData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelStyle={{ fill: "var(--text-secondary)", fontSize: 12 }}
              >
                {marketShareData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.color}
                    stroke="var(--bg-card)"
                    strokeWidth={3}
                  />
                ))}
              </Pie>
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
            </PieChart>
          </ResponsiveContainer>
          ) : (
            <EmptyState message="No market share data available" />
          )}
        </div>



      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk & Anomaly Alerts */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Risk & Anomaly Alerts</h3>
          {hasAlerts ? (
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
          ) : (
            <EmptyState message="No alerts at this time" />
          )}
        </div>



        {/* Executive Summary */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">

          <h3 className="text-lg font-semibold text-theme-primary mb-4">Executive Summary</h3>
          <div className="text-sm text-theme-secondary space-y-2">
            <p>â€¢ Revenue growth trajectory remains strong with 7.9% monthly increase</p>
            <p>â€¢ AI forecasting models predict 18.2% Q4 revenue growth</p>
            <p>â€¢ User acquisition rate improved by 8.3% this quarter</p>
            <p>â€¢ Market share expansion continues with 35% current position</p>
            <p>â€¢ Risk mitigation protocols active - no critical alerts</p>
          </div>
        </div>

      </div>
    </div>
  );
}



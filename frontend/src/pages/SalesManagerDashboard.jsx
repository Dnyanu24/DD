import { createElement, useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import { Bell, CalendarClock, CheckCircle2, DollarSign, LineChart as LineChartIcon, MapPinned, Megaphone, PieChart as PieChartIcon, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import KPICard from "../components/KPICard";
import { getRoleInsights } from "../services/api";
import RoleDashboardHero from "../components/RoleDashboardKit";

// Default data - can be overridden by props or API
const defaultSalesData = [
  { day: "Mon", sales: 12500, target: 12000 },
  { day: "Tue", sales: 15200, target: 13000 },
  { day: "Wed", sales: 11800, target: 12500 },
  { day: "Thu", sales: 16800, target: 14000 },
  { day: "Fri", sales: 14200, target: 13500 },
];

const defaultRegionalData = [
  { region: "North America", sales: 45000, color: "#14B8A6" },
  { region: "Europe", sales: 32000, color: "#0D9488" },
  { region: "Asia Pacific", sales: 28000, color: "#2DD4BF" },
  { region: "Latin America", sales: 18000, color: "#5EEAD4" },
];

const defaultCustomerSegments = [
  { name: "Enterprise", value: 45, color: "#14B8A6" },
  { name: "SMB", value: 30, color: "#0D9488" },
  { name: "Startup", value: 15, color: "#2DD4BF" },
  { name: "Individual", value: 10, color: "#5EEAD4" },
];

const defaultDemandForecast = [
  { month: "Jul", actual: 125000, forecast: 132000 },
  { month: "Aug", actual: null, forecast: 145000 },
  { month: "Sep", actual: null, forecast: 158000 },
  { month: "Oct", actual: null, forecast: 172000 },
  { month: "Nov", actual: null, forecast: 189000 },
  { month: "Dec", actual: null, forecast: 205000 },
];

// Modern chart colors
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
      <div className="text-4xl mb-2">📊</div>
      <p>{message}</p>
    </div>
  </div>
);

function SalesFocusCard({ title, value, hint, icon: Icon }) {
  return (
    <div className="rounded-lg border border-theme-light bg-theme-card p-4 shadow-theme">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-theme-muted">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-theme-primary">{value}</p>
          <p className="mt-1 text-xs text-theme-muted">{hint}</p>
        </div>
        <div className="rounded-lg bg-teal-50 p-2 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200">
          {createElement(Icon, { className: "h-5 w-5" })}
        </div>
      </div>
    </div>
  );
}

function SalesPanel({ title, subtitle, icon: Icon, children }) {
  return (
    <section className="rounded-lg border border-theme-light bg-theme-card p-5 shadow-theme">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-teal-50 p-2 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200">
          {createElement(Icon, { className: "h-5 w-5" })}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-theme-primary">{title}</h3>
          <p className="mt-1 text-xs text-theme-muted">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function SalesManagerDashboard({ 
  salesData = defaultSalesData,
  regionalData = defaultRegionalData,
  customerSegments = defaultCustomerSegments,
  demandForecast = defaultDemandForecast,
  alerts: propAlerts,
  recommendations: propRecommendations
}) {
  const [insights, setInsights] = useState(null);
  const [insightsError, setInsightsError] = useState("");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [defaultAlerts] = useState([
    { id: 1, type: "warning", message: "Q4 target at 78% - acceleration needed", time: "1 hour ago" },
    { id: 2, type: "info", message: "New lead from Fortune 500 company", time: "3 hours ago" },
    { id: 3, type: "success", message: "Europe region exceeded monthly target", time: "5 hours ago" },
  ]);

  const [defaultRecommendations] = useState([
    "Focus outbound efforts on North America enterprise segment",
    "Launch targeted campaign for Asia Pacific SMB market",
    "Schedule follow-ups for 15 high-value leads",
    "Optimize pricing strategy for startup segment",
  ]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setInsightsLoading(true);
      setInsightsError("");
      try {
        const data = await getRoleInsights();
        if (!alive) return;
        setInsights(data);
      } catch (e) {
        if (!alive) return;
        setInsightsError(e?.message || "Failed to load personalized insights");
      } finally {
        if (alive) setInsightsLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  const personalizedRecommendations = Array.isArray(insights?.recommendations)
    ? insights.recommendations.map((r) => r.text).filter(Boolean)
    : null;

  // Use prop data if provided, otherwise use personalized or defaults
  const alerts = propAlerts || defaultAlerts;
  const recommendations = propRecommendations || personalizedRecommendations || defaultRecommendations;
  const actions = Array.isArray(insights?.actions) ? insights.actions : [];

  // Check if data is empty
  const hasSalesData = salesData && salesData.length > 0;
  const hasRegionalData = regionalData && regionalData.length > 0;
  const hasCustomerSegments = customerSegments && customerSegments.length > 0;
  const hasDemandForecast = demandForecast && demandForecast.length > 0;
  const hasAlerts = alerts && alerts.length > 0;
  const hasRecommendations = recommendations && recommendations.length > 0;

  return (
    <div className="space-y-6">
      <RoleDashboardHero role="Sales Manager" />

      <section className="rounded-lg border border-theme-light bg-theme-card p-6 shadow-theme">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
              <Target className="h-3.5 w-3.5" />
              Sales Command Center
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-theme-primary">Revenue, pipeline, and forecast performance</h1>
            <p className="mt-2 max-w-3xl text-sm text-theme-muted">
              Track daily sales, customer mix, regional momentum, demand forecasts, and AI-recommended actions.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[520px]">
            <SalesFocusCard title="Best Day" value={salesData.reduce((best, row) => row.sales > best.sales ? row : best, salesData[0] || { sales: 0, day: "-" }).day} hint="Top actual sales" icon={TrendingUp} />
            <SalesFocusCard title="Target" value="78%" hint="Monthly progress" icon={Target} />
            <SalesFocusCard title="Segments" value={customerSegments.length} hint="Customer groups" icon={Users} />
            <SalesFocusCard title="Forecast" value="$205k" hint="Next high point" icon={CalendarClock} />
          </div>
        </div>
      </section>

      {insightsError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {insightsError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <SalesPanel title="Sales Playbook" subtitle="Role-specific next moves from current signals" icon={Megaphone}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { title: "Protect target gap", detail: "Prioritize high-value opportunities before month close.", icon: Target },
              { title: "Expand strong regions", detail: "Use regional performance to guide follow-up campaigns.", icon: MapPinned },
              { title: "Review forecast risk", detail: "Compare actual vs forecast weekly and adjust plan.", icon: LineChartIcon },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-lg border border-theme-light bg-theme-secondary p-4">
                  <Icon className="h-5 w-5 text-teal-600" />
                  <p className="mt-3 text-sm font-semibold text-theme-primary">{item.title}</p>
                  <p className="mt-1 text-xs text-theme-muted">{item.detail}</p>
                </div>
              );
            })}
          </div>
        </SalesPanel>

        <SalesPanel title="Priority Signals" subtitle="Alerts and recommendations" icon={Bell}>
          <div className="space-y-3">
            {alerts.slice(0, 3).map((alert) => (
              <div key={alert.id} className="rounded-lg bg-theme-secondary p-3">
                <p className="text-sm font-semibold text-theme-primary">{alert.message}</p>
                <p className="mt-1 text-xs text-theme-muted">{alert.time}</p>
              </div>
            ))}
          </div>
        </SalesPanel>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.isArray(insights?.kpis) && insights.kpis.length ? (
          insights.kpis.slice(0, 4).map((kpi) => (
            <KPICard
              key={kpi.title}
              title={kpi.title}
              value={kpi.unit ? `${kpi.value}${kpi.unit}` : String(kpi.value ?? "-")}
              change=""
              changeType="positive"
            />
          ))
        ) : (
          <>
            <KPICard title="Daily Sales" value={insightsLoading ? "..." : "$16,800"} change="+12.5%" changeType="positive" />
            <KPICard title="Weekly Performance" value={insightsLoading ? "..." : "$70,500"} change="+8.7%" changeType="positive" />
            <KPICard title="Conversion Rate" value={insightsLoading ? "..." : "24.3%"} change="+3.2%" changeType="positive" />
            <KPICard title="Monthly Target Progress" value={insightsLoading ? "..." : "78%"} change="-2.1%" changeType="negative" />
          </>
        )}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Sales vs Target */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Daily Sales vs Target</h3>
          {hasSalesData ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesData}>
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="none" vertical={false} />
              <XAxis 
                dataKey="day" 
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
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Bar dataKey="sales" fill={chartColors.primary} name="Actual Sales" radius={[6, 6, 0, 0]} />
              <Bar dataKey="target" fill={chartColors.secondary} name="Target" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          ) : (
            <EmptyState message="No sales data available" />
          )}
        </div>

        {/* Customer Segmentation */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Customer Segmentation</h3>
          {hasCustomerSegments ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={customerSegments}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelStyle={{ fill: "var(--text-secondary)", fontSize: 12 }}
              >
                {customerSegments.map((entry, index) => (
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
            <EmptyState message="No customer segmentation data available" />
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demand Forecast */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Demand Forecast</h3>
          {hasDemandForecast ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={demandForecast}>
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
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              <Line 
                type="monotone" 
                dataKey="actual" 
                stroke={chartColors.primary} 
                strokeWidth={3}
                dot={{ fill: chartColors.primary, strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: chartColors.primary, stroke: "#fff", strokeWidth: 2 }}
                name="Actual" 
              />
              <Line 
                type="monotone" 
                dataKey="forecast" 
                stroke={chartColors.tertiary} 
                strokeWidth={3} 
                strokeDasharray="8 4"
                dot={{ fill: chartColors.tertiary, strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: chartColors.tertiary, stroke: "#fff", strokeWidth: 2 }}
                name="Forecast" 
              />
            </LineChart>
          </ResponsiveContainer>
          ) : (
            <EmptyState message="No forecast data available" />
          )}
        </div>

        {/* Regional Performance */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Regional Performance</h3>
          {hasRegionalData ? (
          <>
          <div className="space-y-4">
            {regionalData.map((region) => (
              <div key={region.region} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-4 h-4 rounded-full`} style={{ backgroundColor: region.color }}></div>
                  <span className="text-theme-primary">{region.region}</span>
                </div>
                <span className="text-theme-primary font-semibold">${region.sales.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <div className="w-full bg-theme-secondary rounded-full h-3">
              <div 
                className="h-3 rounded-full accent-primary" 
                style={{ width: "75%" }}
              ></div>
            </div>
            <p className="text-sm text-theme-muted mt-2">Overall Target Progress: 75%</p>
          </div>
          </>
          ) : (
            <EmptyState message="No regional data available" />
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Operational Alerts */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Operational Alerts</h3>
          {hasAlerts ? (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id} className="flex items-start space-x-3 p-3 bg-theme-secondary rounded-xl transition-colors duration-300">
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

        {/* Task Recommendations */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">AI Task Recommendations</h3>
          {hasRecommendations ? (
          <div className="space-y-3">
            {recommendations.map((rec, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-theme-secondary rounded-xl transition-colors duration-300">
                <div className="w-2 h-2 rounded-full mt-2 accent-primary"></div>
                <p className="text-sm text-theme-secondary">{rec}</p>
              </div>
            ))}
          </div>
          ) : (
            <EmptyState message="No recommendations at this time" />
          )}
        </div>

        {/* Suggested Actions (Role Insights) */}
        <div className="bg-theme-card p-6 rounded-2xl shadow-lg transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-4">Suggested Actions</h3>
          {actions.length ? (
            <div className="space-y-3">
              {actions.slice(0, 8).map((action, index) => (
                <div key={index} className="rounded-xl border border-theme-light bg-theme-secondary p-4">
                  <p className="text-sm text-theme-secondary">{action}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-theme-muted">
              {insightsLoading ? "Loading actions..." : "No personalized actions available yet."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

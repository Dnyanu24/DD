import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { 
  LayoutDashboard, 
  Upload, 
  Sparkles, 
  Bot, 
  BarChart3, 
  FileText, 
  Users, 
  Settings,
  Sun,
  Moon,
  LogOut
} from "lucide-react";

export default function Sidebar() {
  const location = useLocation();
  const { user, logout, getNavigationItems } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const currentRole = user?.role || "CEO";

  const iconMap = {
    Dashboard: LayoutDashboard,
    "Data Upload": Upload,
    "Data Cleaning": Sparkles,
    "AI Models": Bot,
    Visualizations: BarChart3,
    Reports: FileText,
    "Role Management": Users,
    Settings,
  };

  const menuItems = getNavigationItems().map((item) => ({
    ...item,
    icon: iconMap[item.label] || LayoutDashboard,
  }));

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-clay-100 dark:bg-slate-950 border-r border-clay-200 dark:border-teal-900/40 flex flex-col transition-colors duration-300">
      {/* Logo Section */}
      <div className="p-6 border-b border-clay-200 dark:border-teal-900/40">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-clay-500 dark:bg-gradient-to-br dark:from-teal-500 dark:to-cyan-500 flex items-center justify-center shadow-md">
            <span className="text-xl font-bold text-white">S</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-clay-900 dark:text-slate-100">SDAS</h1>
            <p className="text-xs text-clay-600 dark:text-slate-400">Smart Data Analytics</p>
          </div>
        </div>
      </div>


      {/* Role Badge */}
      <div className="px-6 py-3">
        <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300">
          {currentRole}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive
                  ? "bg-clay-500 dark:bg-gradient-to-r dark:from-teal-600 dark:to-cyan-600 text-white shadow-md"
                  : "text-clay-700 dark:text-slate-300 hover:bg-clay-200 dark:hover:bg-slate-900 hover:text-clay-900 dark:hover:text-teal-300"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-clay-500 dark:text-slate-400 group-hover:text-clay-900 dark:group-hover:text-teal-300"}`} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>


      {/* Bottom Section */}
      <div className="p-4 border-t border-clay-200 dark:border-teal-900/40 space-y-2">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-clay-700 dark:text-slate-300 hover:bg-clay-200 dark:hover:bg-slate-900 transition-all duration-200"
        >

          {theme === 'dark' ? (
            <>
              <Sun className="w-5 h-5 text-amber-500" />
              <span className="font-medium">Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-5 h-5 text-slate-600" />
              <span className="font-medium">Dark Mode</span>
            </>
          )}
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
}

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
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  const currentRole = user?.role || "CEO";

  const getMenuItems = (role) => {
    const baseItems = [
      { path: "/", label: "Dashboard", icon: LayoutDashboard },
    ];

    const roleSpecificItems = {
      CEO: [
        { path: "/upload", label: "Data Upload", icon: Upload },
        { path: "/cleaning", label: "Data Cleaning", icon: Sparkles },
        { path: "/models", label: "AI Models", icon: Bot },
        { path: "/visualizations", label: "Visualizations", icon: BarChart3 },
        { path: "/reports", label: "Reports", icon: FileText },
        { path: "/roles", label: "Role Management", icon: Users },
        { path: "/settings", label: "Settings", icon: Settings },
      ],
      "Data Analyst": [
        { path: "/upload", label: "Data Upload", icon: Upload },
        { path: "/cleaning", label: "Data Cleaning", icon: Sparkles },
        { path: "/models", label: "AI Models", icon: Bot },
        { path: "/visualizations", label: "Visualizations", icon: BarChart3 },
        { path: "/reports", label: "Reports", icon: FileText },
        { path: "/settings", label: "Settings", icon: Settings },
      ],
      "Sales Manager": [
        { path: "/upload", label: "Data Upload", icon: Upload },
        { path: "/visualizations", label: "Visualizations", icon: BarChart3 },
        { path: "/reports", label: "Reports", icon: FileText },
        { path: "/settings", label: "Settings", icon: Settings },
      ],
      "Sector Head": [
        { path: "/upload", label: "Data Upload", icon: Upload },
        { path: "/cleaning", label: "Data Cleaning", icon: Sparkles },
        { path: "/visualizations", label: "Visualizations", icon: BarChart3 },
        { path: "/reports", label: "Reports", icon: FileText },
        { path: "/settings", label: "Settings", icon: Settings },
      ],
    };

    return [...baseItems, ...(roleSpecificItems[role] || roleSpecificItems.CEO)];
  };

  const menuItems = getMenuItems(currentRole);

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-theme-sidebar border-r border-theme flex flex-col transition-colors duration-300">
      {/* Logo Section */}
      <div className="p-6 border-b border-theme">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl accent-primary flex items-center justify-center shadow-md">
            <span className="text-xl font-bold text-theme-inverse">S</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-theme-primary">SDAS</h1>
            <p className="text-xs text-theme-muted">Smart Data Analytics</p>
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
                  ? "accent-primary text-theme-inverse shadow-md"
                  : "text-theme-secondary hover:bg-theme-secondary hover:text-theme-primary"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-theme-inverse" : "text-theme-muted group-hover:text-theme-primary"}`} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-4 border-t border-theme space-y-2">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-theme-secondary hover:bg-theme-secondary transition-all duration-200"
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

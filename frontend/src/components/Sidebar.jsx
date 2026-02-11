import { Link, useLocation } from "react-router-dom";
import { BarChart3, Upload, Zap, Brain, PieChart, FileText, Users, Settings, LogOut, Home } from "lucide-react";

const menuItems = [
  { name: "Dashboard", icon: Home, path: "/" },
  { name: "Data Upload", icon: Upload, path: "/upload" },
  { name: "Data Cleaning", icon: Zap, path: "/cleaning" },
  { name: "AI Models", icon: Brain, path: "/models" },
  { name: "Visualizations", icon: PieChart, path: "/visualizations" },
  { name: "Reports", icon: FileText, path: "/reports" },
  { name: "Role Management", icon: Users, path: "/roles" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <div className="w-64 bg-gray-900 text-white h-screen fixed left-0 top-0 overflow-y-auto">
      <div className="p-6">
        <h2 className="text-2xl font-bold text-blue-400">SDAS</h2>
        <p className="text-sm text-gray-400">Smart Data Analytics System</p>
      </div>
      <nav className="mt-6">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-800 text-white border-r-4 border-blue-400"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5 mr-3" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="absolute bottom-0 w-full p-4">
        <button className="flex items-center w-full px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </button>
      </div>
    </div>
  );
}

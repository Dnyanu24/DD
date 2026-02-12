import { Link, useLocation } from "react-router-dom";

export default function Sidebar({ currentRole }) {
  const location = useLocation();

  const getMenuItems = (role) => {
    const baseItems = [
      { path: "/", label: "Dashboard", icon: "📊" },
    ];

    const roleSpecificItems = {
      CEO: [
        { path: "/upload", label: "Data Upload", icon: "📤" },
        { path: "/cleaning", label: "Data Cleaning", icon: "🧹" },
        { path: "/models", label: "AI Models", icon: "🤖" },
        { path: "/visualizations", label: "Visualizations", icon: "📈" },
        { path: "/reports", label: "Reports", icon: "📋" },
        { path: "/roles", label: "Role Management", icon: "👥" },
        { path: "/settings", label: "Settings", icon: "⚙️" },
      ],
      "Data Analyst": [
        { path: "/upload", label: "Data Upload", icon: "📤" },
        { path: "/cleaning", label: "Data Cleaning", icon: "🧹" },
        { path: "/models", label: "AI Models", icon: "🤖" },
        { path: "/visualizations", label: "Visualizations", icon: "📈" },
        { path: "/reports", label: "Reports", icon: "📋" },
        { path: "/settings", label: "Settings", icon: "⚙️" },
      ],
      "Sales Manager": [
        { path: "/upload", label: "Data Upload", icon: "📤" },
        { path: "/visualizations", label: "Visualizations", icon: "📈" },
        { path: "/reports", label: "Reports", icon: "📋" },
        { path: "/settings", label: "Settings", icon: "⚙️" },
      ],
      "Sector Head": [
        { path: "/upload", label: "Data Upload", icon: "📤" },
        { path: "/cleaning", label: "Data Cleaning", icon: "🧹" },
        { path: "/visualizations", label: "Visualizations", icon: "📈" },
        { path: "/reports", label: "Reports", icon: "📋" },
        { path: "/settings", label: "Settings", icon: "⚙️" },
      ],
    };

    return [...baseItems, ...(roleSpecificItems[role] || roleSpecificItems.CEO)];
  };

  const menuItems = getMenuItems(currentRole);

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-gray-800 border-r border-gray-700 p-4">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white">SDAS</h1>
        <p className="text-gray-400 text-sm">Smart Data Analytics System</p>
        <div className="mt-2 px-3 py-1 bg-blue-600 rounded text-xs text-white">
          Role: {currentRole}
        </div>
      </div>

      <nav className="space-y-2">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              location.pathname === item.path
                ? "bg-blue-600 text-white"
                : "text-gray-300 hover:bg-gray-700 hover:text-white"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

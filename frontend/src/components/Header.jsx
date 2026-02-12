import { Bell, User, ChevronDown } from "lucide-react";
import { useState } from "react";

  const roles = ["CEO", "Data Analyst", "Sales Manager", "Sector Head"];

export default function Header({ currentRole, onRoleChange }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const notifications = [
    { id: 1, message: "Data processing completed", time: "2 min ago", unread: true },
    { id: 2, message: "New AI insights available", time: "15 min ago", unread: true },
    { id: 3, message: "System maintenance scheduled", time: "1 hour ago", unread: false },
  ];

  return (
    <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
      <div className="flex items-center space-x-4">
        <h1 className="text-xl font-bold text-blue-400">SDAS Dashboard</h1>
        <div className="text-sm text-gray-400">• {currentRole} View</div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Role Selector */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center space-x-2 bg-gray-700 px-3 py-2 rounded-lg hover:bg-gray-600 transition-colors"
          >
            <User className="w-4 h-4" />
            <span className="text-sm">{currentRole}</span>
            <ChevronDown className="w-4 h-4" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-gray-700 rounded-lg shadow-lg border border-gray-600 z-50">
              {roles.map((role) => (
                <button
                  key={role}
                  onClick={() => {
                    onRoleChange(role);
                    setShowDropdown(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-600 transition-colors ${
                    role === currentRole ? "bg-blue-600 text-white" : "text-gray-300"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
          >
            <Bell className="w-5 h-5" />
            {notifications.filter(n => n.unread).length > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-gray-700 rounded-lg shadow-lg border border-gray-600 z-50">
              <div className="p-4 border-b border-gray-600">
                <h3 className="text-sm font-semibold text-white">Notifications</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.map((notification) => (
                  <div key={notification.id} className="p-4 border-b border-gray-600 hover:bg-gray-600 transition-colors">
                    <div className="flex items-start space-x-3">
                      {notification.unread && <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>}
                      <div className="flex-1">
                        <p className="text-sm text-gray-300">{notification.message}</p>
                        <p className="text-xs text-gray-500 mt-1">{notification.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-white" />
        </div>
      </div>
    </header>
  );
}

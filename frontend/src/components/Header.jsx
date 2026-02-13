import { Bell, User, ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { user, logout } = useAuth();

  const notifications = [
    { id: 1, message: "Data processing completed", time: "2 min ago", unread: true },
    { id: 2, message: "New AI insights available", time: "15 min ago", unread: true },
    { id: 3, message: "System maintenance scheduled", time: "1 hour ago", unread: false },
  ];

  const currentRole = user?.role || "CEO";
  const username = user?.username || "User";

  return (
    <header className="bg-theme-header border-b border-theme px-6 py-4 flex justify-between items-center transition-colors duration-300">
      {/* Left Section - Search */}
      <div className="flex items-center space-x-4 flex-1">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-theme-muted" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-10 pr-4 py-2 bg-theme-secondary border border-theme-light rounded-lg text-theme-primary placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center space-x-4">
        {/* Role Display */}
        <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
          <span className="text-sm font-medium text-teal-700 dark:text-teal-300">{currentRole}</span>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 bg-theme-secondary rounded-lg hover:bg-theme-tertiary transition-colors"
          >
            <Bell className="w-5 h-5 text-theme-secondary" />
            {notifications.filter(n => n.unread).length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {notifications.filter(n => n.unread).length}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-theme-card rounded-xl shadow-theme border border-theme z-50">
              <div className="p-4 border-b border-theme">
                <h3 className="text-sm font-semibold text-theme-primary">Notifications</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.map((notification) => (
                  <div key={notification.id} className="p-4 border-b border-theme hover:bg-theme-secondary transition-colors">
                    <div className="flex items-start space-x-3">
                      {notification.unread && <div className="w-2 h-2 bg-accent-primary rounded-full mt-2"></div>}
                      <div className="flex-1">
                        <p className="text-sm text-theme-secondary">{notification.message}</p>
                        <p className="text-xs text-theme-muted mt-1">{notification.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center space-x-3 bg-theme-secondary px-3 py-2 rounded-lg hover:bg-theme-tertiary transition-colors"
          >
            <div className="w-8 h-8 rounded-full accent-primary flex items-center justify-center">
              <User className="w-4 h-4 text-theme-inverse" />
            </div>
            <span className="text-sm font-medium text-theme-primary hidden sm:block">{username}</span>
            <ChevronDown className="w-4 h-4 text-theme-muted" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-theme-card rounded-xl shadow-theme border border-theme z-50">
              <div className="p-4 border-b border-theme">
                <p className="text-sm font-medium text-theme-primary">{username}</p>
                <p className="text-xs text-theme-muted">{currentRole}</p>
              </div>
              <div className="p-2">
                <button
                  onClick={() => {
                    logout();
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

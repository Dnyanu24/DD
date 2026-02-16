import { Bell, User, ChevronDown, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getAnnouncements } from "../services/api";

export default function Header() {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { user, logout } = useAuth();

  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await getAnnouncements();
        setNotifications(
          (Array.isArray(rows) ? rows : []).map((item, index) => ({
            id: item.id || index + 1,
            message: `${item.title}: ${item.message}`,
            time: item.created_at ? new Date(item.created_at).toLocaleString() : "-",
            unread: index < 5,
          }))
        );
      } catch {
        setNotifications([]);
      }
    };
    load();
  }, []);

  const currentRole = user?.role || "CEO";
  const username = user?.username || "User";

  return (
    <header className="bg-clay-50 dark:bg-slate-950 border-b border-clay-200 dark:border-teal-900/40 px-6 py-4 flex justify-between items-center transition-colors duration-300">
      {/* Left Section - Search */}
      <div className="flex items-center space-x-4 flex-1">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-clay-500 dark:text-clay-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-10 pr-4 py-2 bg-clay-100 dark:bg-slate-950 border border-clay-200 dark:border-teal-900/40 rounded-lg text-clay-900 dark:text-slate-100 placeholder-clay-500 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-clay-500 focus:border-transparent transition-all"
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
            className="relative p-2 bg-clay-100 dark:bg-slate-950 rounded-lg hover:bg-clay-200 dark:hover:bg-slate-900 transition-colors border border-transparent dark:border-teal-900/30"
          >
            <Bell className="w-5 h-5 text-clay-700 dark:text-teal-300" />

            {notifications.filter(n => n.unread).length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {notifications.filter(n => n.unread).length}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-950 rounded-xl shadow-lg border border-clay-200 dark:border-teal-900/40 z-50">
              <div className="p-4 border-b border-clay-200 dark:border-teal-900/40">
                <h3 className="text-sm font-semibold text-clay-900 dark:text-slate-100">Notifications</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.map((notification) => (
                  <div key={notification.id} className="p-4 border-b border-clay-200 dark:border-teal-900/40 hover:bg-clay-100 dark:hover:bg-slate-900 transition-colors">
                    <div className="flex items-start space-x-3">
                      {notification.unread && <div className="w-2 h-2 bg-clay-500 dark:bg-teal-400 rounded-full mt-2"></div>}
                      <div className="flex-1">
                        <p className="text-sm text-clay-700 dark:text-slate-300">{notification.message}</p>
                        <p className="text-xs text-clay-500 dark:text-slate-500 mt-1">{notification.time}</p>
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
            className="flex items-center space-x-3 bg-clay-100 dark:bg-slate-950 px-3 py-2 rounded-lg hover:bg-clay-200 dark:hover:bg-slate-900 transition-colors border border-transparent dark:border-teal-900/30"
          >
            <div className="w-8 h-8 rounded-full bg-clay-500 dark:bg-clay-600 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-clay-900 dark:text-slate-100 hidden sm:block">{username}</span>
            <ChevronDown className="w-4 h-4 text-clay-500 dark:text-slate-400" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-950 rounded-xl shadow-lg border border-clay-200 dark:border-teal-900/40 z-50">
              <div className="p-4 border-b border-clay-200 dark:border-teal-900/40">
                <p className="text-sm font-medium text-clay-900 dark:text-slate-100">{username}</p>
                <p className="text-xs text-clay-500 dark:text-slate-500">{currentRole}</p>
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

import { Bell, User, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAnnouncements } from "../services/api";

const SEARCH_ALIASES = {
  dashboard: "/",
  home: "/",
  upload: "/upload",
  "data upload": "/upload",
  cleaning: "/cleaning",
  "data cleaning": "/cleaning",
  ai: "/models",
  "ai model": "/models",
  "ai models": "/models",
  predictions: "/models",
  visualizations: "/visualizations",
  visualization: "/visualizations",
  charts: "/visualizations",
  reports: "/reports",
  report: "/reports",
  roles: "/roles",
  "role management": "/roles",
  settings: "/settings",
  setting: "/settings",
};

function getReadNotificationIds() {
  try {
    const stored = JSON.parse(localStorage.getItem("read_notification_ids") || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export default function Header() {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const { user, logout, getNavigationItems } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);

  const menuItems = useMemo(() => getNavigationItems(), [getNavigationItems]);

  useEffect(() => {
    const load = async () => {
      try {
        const readIds = getReadNotificationIds();
        const rows = await getAnnouncements();
        setNotifications(
          (Array.isArray(rows) ? rows : []).map((item, index) => {
            const id = item.id || index + 1;
            return {
              id,
              message: `${item.title}: ${item.message}`,
              time: item.created_at ? new Date(item.created_at).toLocaleString() : "-",
              unread: !readIds.includes(id),
            };
          })
        );
      } catch {
        setNotifications([]);
      }
    };
    load();
  }, []);

  const currentRole = user?.role || "CEO";
  const username = user?.username || "User";

  const searchTargets = useMemo(() => {
    const navTargets = menuItems.map((item) => ({
      path: item.path,
      label: item.label,
      terms: [item.label, item.path],
    }));
    const aliasTargets = Object.entries(SEARCH_ALIASES).map(([term, path]) => ({
      path,
      label: navTargets.find((item) => item.path === path)?.label || term,
      terms: [term],
    }));
    return [...navTargets, ...aliasTargets];
  }, [menuItems]);

  const searchSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    const seenPaths = new Set();
    return searchTargets
      .filter((target) => target.terms.some((term) => term.toLowerCase().includes(query)))
      .filter((target) => {
        if (seenPaths.has(target.path)) return false;
        seenPaths.add(target.path);
        return true;
      })
      .slice(0, 5);
  }, [searchQuery, searchTargets]);

  const unreadCount = notifications.filter((notification) => notification.unread).length;

  const markNotificationsAsRead = () => {
    setNotifications((prev) => {
      const next = prev.map((notification) => ({ ...notification, unread: false }));
      localStorage.setItem("read_notification_ids", JSON.stringify(next.map((notification) => notification.id)));
      return next;
    });
  };

  const handleNotificationToggle = () => {
    const nextVisible = !showNotifications;
    setShowNotifications(nextVisible);
    if (nextVisible) {
      markNotificationsAsRead();
    }
  };

  const navigateFromSearch = (targetPath) => {
    navigate(targetPath);
    setSearchQuery("");
    setSearchError("");
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    const exactAlias = SEARCH_ALIASES[query];
    if (exactAlias) {
      navigateFromSearch(exactAlias);
      return;
    }

    const exactMenuItem = menuItems.find((item) => item.label.toLowerCase() === query);
    if (exactMenuItem) {
      navigateFromSearch(exactMenuItem.path);
      return;
    }

    if (searchSuggestions.length > 0) {
      navigateFromSearch(searchSuggestions[0].path);
      return;
    }

    setSearchError("No matching page found");
  };

  return (
    <header className="flex items-center justify-between border-b border-clay-200 bg-clay-50 px-6 py-4 transition-colors duration-300 dark:border-teal-900/40 dark:bg-slate-950">
      <div className="flex flex-1 items-center space-x-4">
        <div className="relative max-w-md w-full">
          <form onSubmit={handleSearchSubmit}>
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-clay-500 dark:text-clay-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchError("");
              }}
              placeholder="Search pages like AI Models, Reports, Upload..."
              className="w-full rounded-lg border border-clay-200 bg-clay-100 py-2 pl-10 pr-4 text-clay-900 placeholder-clay-500 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-clay-500 dark:border-teal-900/40 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500"
            />
          </form>

          {searchSuggestions.length > 0 && searchQuery.trim() ? (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 rounded-xl border border-clay-200 bg-white shadow-lg dark:border-teal-900/40 dark:bg-slate-950">
              {searchSuggestions.map((item) => (
                <button
                  key={`${item.path}-${item.label}`}
                  type="button"
                  onClick={() => navigateFromSearch(item.path)}
                  className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                    location.pathname === item.path
                      ? "bg-clay-100 text-clay-900 dark:bg-slate-900 dark:text-slate-100"
                      : "text-clay-700 hover:bg-clay-100 dark:text-slate-300 dark:hover:bg-slate-900"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="text-xs text-clay-500 dark:text-slate-500">{item.path}</span>
                </button>
              ))}
            </div>
          ) : null}

          {searchError ? (
            <p className="mt-2 text-xs text-red-600">{searchError}</p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <div className="hidden items-center space-x-2 rounded-lg bg-teal-50 px-3 py-1.5 md:flex dark:bg-teal-900/20">
          <span className="text-sm font-medium text-teal-700 dark:text-teal-300">{currentRole}</span>
        </div>

        <div className="relative">
          <button
            onClick={handleNotificationToggle}
            className="relative rounded-lg border border-transparent bg-clay-100 p-2 transition-colors hover:bg-clay-200 dark:border-teal-900/30 dark:bg-slate-950 dark:hover:bg-slate-900"
          >
            <Bell className="h-5 w-5 text-clay-700 dark:text-teal-300" />

            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {unreadCount}
              </span>
            ) : null}
          </button>

          {showNotifications ? (
            <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-clay-200 bg-white shadow-lg dark:border-teal-900/40 dark:bg-slate-950">
              <div className="border-b border-clay-200 p-4 dark:border-teal-900/40">
                <h3 className="text-sm font-semibold text-clay-900 dark:text-slate-100">Notifications</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 text-sm text-clay-500 dark:text-slate-400">No notifications.</div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="border-b border-clay-200 p-4 transition-colors hover:bg-clay-100 dark:border-teal-900/40 dark:hover:bg-slate-900"
                    >
                      <div className="flex items-start space-x-3">
                        {notification.unread ? <div className="mt-2 h-2 w-2 rounded-full bg-clay-500 dark:bg-teal-400" /> : null}
                        <div className="flex-1">
                          <p className="text-sm text-clay-700 dark:text-slate-300">{notification.message}</p>
                          <p className="mt-1 text-xs text-clay-500 dark:text-slate-500">{notification.time}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center space-x-3 rounded-lg border border-transparent bg-clay-100 px-3 py-2 transition-colors hover:bg-clay-200 dark:border-teal-900/30 dark:bg-slate-950 dark:hover:bg-slate-900"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-clay-500 dark:bg-clay-600">
              <User className="h-4 w-4 text-white" />
            </div>
            <span className="hidden text-sm font-medium text-clay-900 dark:text-slate-100 sm:block">{username}</span>
            <ChevronDown className="h-4 w-4 text-clay-500 dark:text-slate-400" />
          </button>

          {showDropdown ? (
            <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-clay-200 bg-white shadow-lg dark:border-teal-900/40 dark:bg-slate-950">
              <div className="border-b border-clay-200 p-4 dark:border-teal-900/40">
                <p className="text-sm font-medium text-clay-900 dark:text-slate-100">{username}</p>
                <p className="text-xs text-clay-500 dark:text-slate-500">{currentRole}</p>
              </div>
              <div className="p-2">
                <button
                  onClick={() => {
                    logout();
                    setShowDropdown(false);
                  }}
                  className="w-full rounded-lg px-4 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Logout
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

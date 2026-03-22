import { Bell, ChevronDown, Search, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAnnouncements, getApiBaseUrl } from "../services/api";

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
  profile: "/profile",
  settings: "/settings",
  setting: "/settings",
};

function getStoredIdList(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function setStoredIdList(key, ids) {
  localStorage.setItem(key, JSON.stringify(Array.from(new Set(ids || []))));
}

export default function Header() {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [notifications, setNotifications] = useState([]);

  const { user, logout, getNavigationItems } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = useMemo(() => getNavigationItems(), [getNavigationItems]);
  const currentRole = user?.role || "CEO";
  const displayName = user?.display_name || user?.username || "User";

  const avatarUrl = useMemo(() => {
    if (!user?.avatar_filename) return null;
    const base = getApiBaseUrl();
    return `${base}/api/auth/profile/avatar/${encodeURIComponent(user.avatar_filename)}`;
  }, [user?.avatar_filename]);

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

  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => !notification.dismissed),
    [notifications]
  );
  const unreadCount = useMemo(
    () => visibleNotifications.filter((notification) => notification.unread).length,
    [visibleNotifications]
  );

  const loadNotifications = async () => {
    try {
      const readIds = getStoredIdList("read_notification_ids");
      const dismissedIds = getStoredIdList("dismissed_notification_ids");
      const rows = await getAnnouncements();
      const mapped = (Array.isArray(rows) ? rows : []).map((item, index) => {
        const id = item.id || index + 1;
        const dismissed = dismissedIds.includes(id);
        return {
          id,
          message: `${item.title}: ${item.message}`,
          time: item.created_at ? new Date(item.created_at).toLocaleString() : "-",
          dismissed,
          unread: !dismissed && !readIds.includes(id),
        };
      });
      setNotifications(mapped);
      return mapped;
    } catch {
      setNotifications([]);
      return [];
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    // Close popovers on navigation.
    setShowDropdown(false);
    setShowNotifications(false);
    setSearchError("");
  }, [location.pathname]);

  const markNotificationsAsRead = (items) => {
    const ids = (Array.isArray(items) ? items : notifications).map((notification) => notification.id);
    setStoredIdList("read_notification_ids", [...getStoredIdList("read_notification_ids"), ...ids]);
    setNotifications((prev) => prev.map((notification) => ({ ...notification, unread: false })));
  };

  const clearNotifications = () => {
    setNotifications((prev) => {
      const ids = prev.map((notification) => notification.id);
      setStoredIdList("dismissed_notification_ids", [...getStoredIdList("dismissed_notification_ids"), ...ids]);
      setStoredIdList("read_notification_ids", [...getStoredIdList("read_notification_ids"), ...ids]);
      return prev.map((notification) => ({ ...notification, dismissed: true, unread: false }));
    });
  };

  const handleNotificationToggle = async () => {
    const nextVisible = !showNotifications;
    setShowNotifications(nextVisible);
    if (nextVisible) {
      const mapped = await loadNotifications();
      markNotificationsAsRead(mapped);
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
      <div className="flex flex-1 items-center gap-4">
        <div className="relative w-full max-w-md">
          <form onSubmit={handleSearchSubmit}>
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-clay-500 dark:text-slate-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search pages (upload, cleaning, reports...)"
              className="w-full rounded-xl border border-clay-200 bg-white py-2 pl-10 pr-4 text-sm text-clay-900 placeholder:text-clay-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-300 dark:border-teal-900/40 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-teal-800"
            />
          </form>

          {searchSuggestions.length > 0 ? (
            <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-clay-200 bg-white shadow-lg dark:border-teal-900/40 dark:bg-slate-950">
              {searchSuggestions.map((item) => (
                <button
                  key={`${item.path}_${item.label}`}
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

          {searchError ? <p className="mt-2 text-xs text-red-600">{searchError}</p> : null}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 rounded-lg bg-teal-50 px-3 py-1.5 md:flex dark:bg-teal-900/20">
          <span className="text-sm font-medium text-teal-700 dark:text-teal-300">{currentRole}</span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={handleNotificationToggle}
            className="relative rounded-xl border border-transparent bg-clay-100 p-2 transition-colors hover:bg-clay-200 dark:border-teal-900/30 dark:bg-slate-950 dark:hover:bg-slate-900"
          >
            <Bell className="h-5 w-5 text-clay-700 dark:text-teal-300" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {unreadCount}
              </span>
            ) : null}
          </button>

          {showNotifications ? (
            <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-clay-200 bg-white shadow-lg dark:border-teal-900/40 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-3 border-b border-clay-200 p-4 dark:border-teal-900/40">
                <h3 className="text-sm font-semibold text-clay-900 dark:text-slate-100">Notifications</h3>
                <button
                  type="button"
                  onClick={clearNotifications}
                  className="rounded-lg border border-clay-200 bg-clay-50 px-2.5 py-1 text-xs font-semibold text-clay-700 hover:bg-clay-100 dark:border-teal-900/40 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  Clear
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {visibleNotifications.length === 0 ? (
                  <div className="p-4 text-sm text-clay-500 dark:text-slate-400">No notifications.</div>
                ) : (
                  visibleNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="border-b border-clay-200 p-4 transition-colors hover:bg-clay-100 dark:border-teal-900/40 dark:hover:bg-slate-900"
                    >
                      <div className="flex items-start gap-3">
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
            type="button"
            onClick={() => setShowDropdown((prev) => !prev)}
            className="flex items-center gap-3 rounded-xl border border-transparent bg-clay-100 px-3 py-2 transition-colors hover:bg-clay-200 dark:border-teal-900/30 dark:bg-slate-950 dark:hover:bg-slate-900"
          >
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-clay-500 dark:bg-clay-600">
              {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" /> : <User className="h-4 w-4 text-white" />}
            </div>
            <span className="hidden text-sm font-medium text-clay-900 dark:text-slate-100 sm:block">{displayName}</span>
            <ChevronDown className="h-4 w-4 text-clay-500 dark:text-slate-400" />
          </button>

          {showDropdown ? (
            <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-clay-200 bg-white shadow-lg dark:border-teal-900/40 dark:bg-slate-950">
              <div className="border-b border-clay-200 p-4 dark:border-teal-900/40">
                <p className="text-sm font-medium text-clay-900 dark:text-slate-100">{displayName}</p>
                <p className="text-xs text-clay-500 dark:text-slate-500">{currentRole}</p>
              </div>
              <div className="p-2">
                <button
                  type="button"
                  onClick={() => {
                    navigate("/profile");
                    setShowDropdown(false);
                  }}
                  className="w-full rounded-lg px-4 py-2 text-left text-sm text-clay-700 transition-colors hover:bg-clay-100 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    setShowDropdown(false);
                  }}
                  className="mt-1 w-full rounded-lg px-4 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
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

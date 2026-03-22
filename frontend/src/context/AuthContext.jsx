import { createContext, useContext, useEffect, useState } from "react";
import { login as apiLogin, logout as apiLogout, getAuthToken, getCurrentUser } from "../services/api";

const AuthContext = createContext(null);

// Role-based navigation configuration
// Note: the Sidebar component maps labels -> Lucide icons, so `icon` here is informational only.
const ROLE_NAVIGATION = {
  Admin: [
    { path: "/", label: "Dashboard", icon: "dashboard" },
    { path: "/upload", label: "Data Upload", icon: "upload" },
    { path: "/cleaning", label: "Data Cleaning", icon: "cleaning" },
    { path: "/models", label: "AI Models", icon: "ai" },
    { path: "/visualizations", label: "Visualizations", icon: "charts" },
    { path: "/reports", label: "Reports", icon: "reports" },
    { path: "/roles", label: "Role Management", icon: "roles" },
    { path: "/profile", label: "Profile", icon: "profile" },
    { path: "/settings", label: "Settings", icon: "settings" },
  ],
  CEO: [
    { path: "/", label: "Dashboard", icon: "dashboard" },
    { path: "/upload", label: "Data Upload", icon: "upload" },
    { path: "/cleaning", label: "Data Cleaning", icon: "cleaning" },
    { path: "/models", label: "AI Models", icon: "ai" },
    { path: "/visualizations", label: "Visualizations", icon: "charts" },
    { path: "/reports", label: "Reports", icon: "reports" },
    { path: "/roles", label: "Role Management", icon: "roles" },
    { path: "/profile", label: "Profile", icon: "profile" },
    { path: "/settings", label: "Settings", icon: "settings" },
  ],
  "Data Analyst": [
    { path: "/", label: "Dashboard", icon: "dashboard" },
    { path: "/upload", label: "Data Upload", icon: "upload" },
    { path: "/cleaning", label: "Data Cleaning", icon: "cleaning" },
    { path: "/models", label: "AI Models", icon: "ai" },
    { path: "/visualizations", label: "Visualizations", icon: "charts" },
    { path: "/reports", label: "Reports", icon: "reports" },
    { path: "/profile", label: "Profile", icon: "profile" },
    { path: "/settings", label: "Settings", icon: "settings" },
  ],
  "Sales Manager": [
    { path: "/", label: "Dashboard", icon: "dashboard" },
    { path: "/upload", label: "Data Upload", icon: "upload" },
    { path: "/visualizations", label: "Visualizations", icon: "charts" },
    { path: "/reports", label: "Reports", icon: "reports" },
    { path: "/profile", label: "Profile", icon: "profile" },
    { path: "/settings", label: "Settings", icon: "settings" },
  ],
  "Sector Head": [
    { path: "/", label: "Dashboard", icon: "dashboard" },
    { path: "/upload", label: "Data Upload", icon: "upload" },
    { path: "/cleaning", label: "Data Cleaning", icon: "cleaning" },
    { path: "/visualizations", label: "Visualizations", icon: "charts" },
    { path: "/reports", label: "Reports", icon: "reports" },
    { path: "/profile", label: "Profile", icon: "profile" },
    { path: "/settings", label: "Settings", icon: "settings" },
  ],
  Student: [
    { path: "/", label: "Dashboard", icon: "dashboard" },
    { path: "/upload", label: "Data Upload", icon: "upload" },
    { path: "/cleaning", label: "Data Cleaning", icon: "cleaning" },
    { path: "/visualizations", label: "Visualizations", icon: "charts" },
    { path: "/profile", label: "Profile", icon: "profile" },
  ],
  Individual: [
    { path: "/", label: "Dashboard", icon: "dashboard" },
    { path: "/upload", label: "Data Upload", icon: "upload" },
    { path: "/cleaning", label: "Data Cleaning", icon: "cleaning" },
    { path: "/visualizations", label: "Visualizations", icon: "charts" },
    { path: "/reports", label: "Reports", icon: "reports" },
    { path: "/profile", label: "Profile", icon: "profile" },
    { path: "/settings", label: "Settings", icon: "settings" },
  ],
};

// Role-based permissions
const ROLE_PERMISSIONS = {
  Admin: ["view_all", "manage_users", "manage_roles", "upload_data", "clean_data", "ai_models", "view_reports", "settings"],
  CEO: ["view_all", "manage_users", "manage_roles", "upload_data", "clean_data", "ai_models", "view_reports", "settings"],
  "Data Analyst": ["view_analytics", "upload_data", "clean_data", "ai_models", "view_reports", "settings"],
  "Sales Manager": ["view_sales", "upload_data", "view_visualizations", "view_reports", "settings"],
  "Sector Head": ["view_sector", "upload_data", "clean_data", "view_visualizations", "view_reports", "settings"],
  Student: ["upload_data", "clean_data", "view_visualizations"],
  Individual: ["upload_data", "clean_data", "view_visualizations", "view_reports", "settings"],
};

function AuthProviderComponent({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = getAuthToken();
      const storedUser = localStorage.getItem("user");

      if (token && storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);

          try {
            const currentUser = await getCurrentUser();
            if (currentUser) {
              setUser(currentUser);
              localStorage.setItem("user", JSON.stringify(currentUser));
            }
          } catch {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            setUser(null);
          }
        } catch {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (username, password) => {
    const result = await apiLogin(username, password);
    if (result.user) {
      setUser(result.user);
    }
    return result;
  };

  const refreshUser = async () => {
    const currentUser = await getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      localStorage.setItem("user", JSON.stringify(currentUser));
    }
    return currentUser;
  };

  const patchUser = (patch) => {
    if (!patch || typeof patch !== "object") return;
    setUser((prev) => {
      const next = { ...(prev || {}), ...patch };
      localStorage.setItem("user", JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    apiLogout();
    setUser(null);
  };

  const getNavigationItems = () => {
    if (!user?.role) return ROLE_NAVIGATION.CEO;
    return ROLE_NAVIGATION[user.role] || ROLE_NAVIGATION.CEO;
  };

  const hasPermission = (permission) => {
    if (!user?.role) return false;
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    return permissions.includes(permission);
  };

  const canAccessRoute = (route) => {
    if (!user?.role) return false;
    const navItems = ROLE_NAVIGATION[user.role] || [];
    return navItems.some((item) => item.path === route) || route === "/";
  };

  const value = {
    user,
    loading,
    login,
    refreshUser,
    patchUser,
    logout,
    isAuthenticated: !!user,
    role: user?.role || null,
    getNavigationItems,
    hasPermission,
    canAccessRoute,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export const AuthProvider = AuthProviderComponent;
export default AuthProviderComponent;

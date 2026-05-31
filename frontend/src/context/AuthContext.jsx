import { createContext, useContext, useState, useEffect } from "react";
import { login as apiLogin, logout as apiLogout, getAuthToken, getCurrentUser } from "../services/api";

const AuthContext = createContext(null);

// Role-based navigation configuration
const ROLE_NAVIGATION = {
  CEO: [
    { path: "/", label: "Dashboard", icon: "📊" },
    { path: "/upload", label: "Data Upload", icon: "📤" },
    { path: "/cleaning", label: "Data Cleaning", icon: "🧹" },
    { path: "/models", label: "AI Models", icon: "🤖" },
    { path: "/visualizations", label: "Visualizations", icon: "📈" },
    { path: "/dashboard-builder", label: "Dashboard Builder", icon: "BI" },
    { path: "/reports", label: "Reports", icon: "📋" },
    { path: "/roles", label: "Role Management", icon: "👥" },
    { path: "/settings", label: "Settings", icon: "⚙️" },
  ],
  "Data Analyst": [
    { path: "/", label: "Dashboard", icon: "📊" },
    { path: "/upload", label: "Data Upload", icon: "📤" },
    { path: "/cleaning", label: "Data Cleaning", icon: "🧹" },
    { path: "/models", label: "AI Models", icon: "🤖" },
    { path: "/visualizations", label: "Visualizations", icon: "📈" },
    { path: "/dashboard-builder", label: "Dashboard Builder", icon: "BI" },
    { path: "/reports", label: "Reports", icon: "📋" },
    { path: "/settings", label: "Settings", icon: "⚙️" },
  ],
  "Sales Manager": [
    { path: "/", label: "Dashboard", icon: "📊" },
    { path: "/upload", label: "Data Upload", icon: "📤" },
    { path: "/visualizations", label: "Visualizations", icon: "📈" },
    { path: "/dashboard-builder", label: "Dashboard Builder", icon: "BI" },
    { path: "/reports", label: "Reports", icon: "📋" },
    { path: "/settings", label: "Settings", icon: "⚙️" },
  ],
  "Sector Head": [
    { path: "/", label: "Dashboard", icon: "📊" },
    { path: "/upload", label: "Data Upload", icon: "📤" },
    { path: "/cleaning", label: "Data Cleaning", icon: "🧹" },
    { path: "/visualizations", label: "Visualizations", icon: "📈" },
    { path: "/dashboard-builder", label: "Dashboard Builder", icon: "BI" },
    { path: "/reports", label: "Reports", icon: "📋" },
    { path: "/settings", label: "Settings", icon: "⚙️" },
  ],
};

// Role-based permissions
const ROLE_PERMISSIONS = {
  CEO: ["view_all", "manage_users", "manage_roles", "upload_data", "clean_data", "ai_models", "view_reports", "settings"],
  "Data Analyst": ["view_analytics", "upload_data", "clean_data", "ai_models", "view_reports", "settings"],
  "Sales Manager": ["view_sales", "upload_data", "view_visualizations", "view_reports", "settings"],
  "Sector Head": ["view_sector", "upload_data", "clean_data", "view_visualizations", "view_reports", "settings"],
};

function AuthProviderComponent({ children }) {

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing auth on mount
    const initAuth = async () => {
      const token = getAuthToken();
      const storedUser = localStorage.getItem("user");
      
      if (token && storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          
          // Optionally verify token is still valid
          try {
            const currentUser = await getCurrentUser();
            if (currentUser) {
              setUser(currentUser);
              localStorage.setItem("user", JSON.stringify(currentUser));
            }
          } catch {
            // Token invalid, clear it
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            setUser(null);
          }
        } catch {
          // Invalid stored user, clear it
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

  const logout = () => {
    apiLogout();
    setUser(null);
  };

  // Get navigation items based on user role
  const getNavigationItems = () => {
    if (!user?.role) return ROLE_NAVIGATION.CEO;
    return ROLE_NAVIGATION[user.role] || ROLE_NAVIGATION.CEO;
  };

  // Check if user has specific permission
  const hasPermission = (permission) => {
    if (!user?.role) return false;
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    return permissions.includes(permission);
  };

  // Check if user can access specific route
  const canAccessRoute = (route) => {
    if (!user?.role) return false;
    const navItems = ROLE_NAVIGATION[user.role] || [];
    return navItems.some(item => item.path === route) || route === "/";
  };

  const value = {
    user,
    loading,
    login,
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

// Export AuthProvider as both named and default for Fast Refresh compatibility
export const AuthProvider = AuthProviderComponent;
export default AuthProviderComponent;

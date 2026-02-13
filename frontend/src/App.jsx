import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CEODashboard from "./pages/CEODashboard";
import DataAnalystDashboard from "./pages/DataAnalystDashboard";
import SalesManagerDashboard from "./pages/SalesManagerDashboard";
import DataUpload from "./pages/DataUpload";
import DataCleaning from "./pages/DataCleaning";
import AIModels from "./pages/AIModels";
import Visualizations from "./pages/Visualizations";
import Reports from "./pages/Reports";
import RoleManagement from "./pages/RoleManagement";
import Settings from "./pages/Settings";

// Protected Route Component
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-primary">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Dashboard Router based on role
function DashboardRouter() {
  const { user } = useAuth();
  const role = user?.role || "CEO";

  switch (role) {
    case "CEO":
      return <CEODashboard />;
    case "Data Analyst":
      return <DataAnalystDashboard />;
    case "Sales Manager":
      return <SalesManagerDashboard />;
    case "Sector Head":
      return <CEODashboard />; // Sector Head sees CEO dashboard
    default:
      return <CEODashboard />;
  }
}

// Main App Layout
function AppLayout() {
  return (
    <div className="min-h-screen bg-theme-primary text-theme-primary transition-colors duration-300">
      <Sidebar />
      <div className="ml-64 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 overflow-y-auto bg-theme-secondary p-6">
          <Routes>
            <Route path="/" element={<DashboardRouter />} />
            <Route path="/upload" element={<DataUpload />} />
            <Route path="/cleaning" element={<DataCleaning />} />
            <Route path="/models" element={<AIModels />} />
            <Route path="/visualizations" element={<Visualizations />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/roles" element={<RoleManagement />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

// Public Routes
function PublicRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

// App Content with Auth Check
function AppContent() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-primary">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary"></div>
      </div>
    );
  }

  return isAuthenticated ? (
    <ProtectedRoute>
      <AppLayout />
    </ProtectedRoute>
  ) : (
    <PublicRoutes />
  );
}

// Main App
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
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

export default function App() {
  const [currentRole, setCurrentRole] = useState("CEO");

  const renderDashboard = () => {
    switch (currentRole) {
      case "CEO":
        return <CEODashboard />;
      case "Data Analyst":
        return <DataAnalystDashboard />;
      case "Sales Manager":
        return <SalesManagerDashboard />;
      default:
        return <CEODashboard />;
    }
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-900 text-white">
        <Sidebar />
        <div className="ml-64 flex flex-col min-h-screen">
          <Header currentRole={currentRole} onRoleChange={setCurrentRole} />
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={renderDashboard()} />
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
    </Router>
  );
}

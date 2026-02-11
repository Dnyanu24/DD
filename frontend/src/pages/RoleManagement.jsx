import { useState } from "react";
import KPICard from "../components/KPICard";

export default function RoleManagement() {
  const [selectedRole, setSelectedRole] = useState("ceo");

  const roles = [
    {
      id: "ceo",
      name: "CEO / Owner",
      description: "Full access to company-wide dashboards and AI recommendations",
      permissions: ["View all sectors", "Access AI insights", "Monitor company performance", "Approve decisions"],
      users: 2,
      status: "Active"
    },
    {
      id: "sector_head",
      name: "Sector Head",
      description: "Manage sector-specific data and view sector-level predictions",
      permissions: ["Upload sector data", "View sector analytics", "Provide feedback", "Access sector predictions"],
      users: 8,
      status: "Active"
    },
    {
      id: "data_analyst",
      name: "Data Analyst",
      description: "Access data cleaning tools and detailed analytics",
      permissions: ["Run data cleaning", "View detailed reports", "Configure AI models", "Access visualizations"],
      users: 5,
      status: "Active"
    },
    {
      id: "admin",
      name: "Admin",
      description: "System administration and user management",
      permissions: ["Manage users", "Configure system", "Monitor health", "Access all logs"],
      users: 1,
      status: "Active"
    }
  ];

  const userMetrics = [
    { title: "Total Users", value: "16", change: "+2" },
    { title: "Active Sessions", value: "12", change: "+3" },
    { title: "Role Changes", value: "5", change: "+1" },
    { title: "Permission Updates", value: "8", change: "+2" },
  ];

  const recentUsers = [
    { name: "John Smith", role: "Sector Head", sector: "Technology", status: "Active", lastLogin: "2 hours ago" },
    { name: "Sarah Johnson", role: "Data Analyst", sector: "Finance", status: "Active", lastLogin: "1 day ago" },
    { name: "Mike Davis", role: "CEO", sector: "Executive", status: "Active", lastLogin: "30 min ago" },
    { name: "Lisa Chen", role: "Sector Head", sector: "Healthcare", status: "Inactive", lastLogin: "1 week ago" },
  ];

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Role Management</h1>
      <p className="text-gray-400 mb-6">Manage user roles, permissions, and access control</p>

      {/* User Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {userMetrics.map((metric, index) => (
          <KPICard
            key={index}
            title={metric.title}
            value={metric.value}
            change={metric.change}
            changeType="positive"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roles List */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">User Roles</h3>
          <div className="space-y-3">
            {roles.map((role) => (
              <div
                key={role.id}
                onClick={() => setSelectedRole(role.id)}
                className={`p-4 rounded-lg cursor-pointer transition-colors ${
                  selectedRole === role.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium">{role.name}</h4>
                  <span className="px-2 py-1 rounded text-xs bg-green-600">
                    {role.users} users
                  </span>
                </div>
                <p className="text-sm opacity-80 mb-2">{role.description}</p>
                <div className="text-xs opacity-60">
                  Status: {role.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Role Details */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Role Details</h3>
          {selectedRole && (
            <div className="space-y-4">
              {(() => {
                const role = roles.find(r => r.id === selectedRole);
                return (
                  <>
                    <div>
                      <h4 className="font-medium text-white mb-2">{role.name}</h4>
                      <p className="text-gray-300 text-sm mb-4">{role.description}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-700 p-3 rounded">
                        <div className="text-xs text-gray-400">Users</div>
                        <div className="text-lg font-bold text-white">{role.users}</div>
                      </div>
                      <div className="bg-gray-700 p-3 rounded">
                        <div className="text-xs text-gray-400">Status</div>
                        <div className="text-lg font-bold text-green-400">{role.status}</div>
                      </div>
                    </div>

                    <div className="bg-gray-700 p-4 rounded">
                      <h5 className="text-white font-medium mb-2">Permissions</h5>
                      <div className="space-y-2">
                        {role.permissions.map((permission, index) => (
                          <div key={index} className="flex items-center text-sm">
                            <div className="w-2 h-2 bg-blue-400 rounded-full mr-3"></div>
                            <span className="text-gray-300">{permission}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <button className="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors">
                        Edit Permissions
                      </button>
                      <button className="flex-1 bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-lg transition-colors">
                        Manage Users
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Recent Users */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Users</h3>
          <div className="space-y-3 mb-6">
            {recentUsers.map((user, index) => (
              <div key={index} className="bg-gray-700 p-3 rounded">
                <div className="flex justify-between items-start mb-1">
                  <div className="text-sm text-white font-medium">{user.name}</div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    user.status === "Active" ? "bg-green-600" : "bg-gray-600"
                  }`}>
                    {user.status}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mb-1">{user.role} • {user.sector}</div>
                <div className="text-xs text-gray-500">Last login: {user.lastLogin}</div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-gray-600">
            <h4 className="text-white font-medium mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                Add New User
              </button>
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                Bulk Role Update
              </button>
              <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                Export User List
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

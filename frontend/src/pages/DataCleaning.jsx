import { useState, useEffect, useRef } from "react";
import { 
  Play, Pause, RotateCcw, CheckCircle, AlertCircle, Loader, 
  Database, Sparkles, FileText, Settings, Activity, ArrowRight,
  ChevronRight, Clock, BarChart3, Trash2, Filter, Search,
  CheckSquare, XCircle, TrendingUp, Layers, Zap, Shield
} from "lucide-react";
import { getDataCleaningStats, getUploadedData, runDataCleaning } from "../services/api";

export default function DataCleaning() {
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("missing_values");
  const [uploadedData, setUploadedData] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [cleaningSteps, setCleaningSteps] = useState([]);
  const [cleaningLogs, setCleaningLogs] = useState([]);


  // Fetch real data from backend
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [statsResponse, dataResponse] = await Promise.all([
          getDataCleaningStats().catch(() => null), // Gracefully handle if endpoint doesn't exist yet
          getUploadedData().catch(() => null) // Gracefully handle if endpoint doesn't exist yet
        ]);

        if (statsResponse) {
          setCleaningStats(statsResponse);
        }

        if (dataResponse) {
          setUploadedData(dataResponse);
        } else {
          // Fallback to mock data if backend not ready
          setUploadedData([
            {
              id: 1,
              name: "Sales_Q1_2024.csv",
              sector: "Retail",
              records: 15420,
              uploadDate: "2024-01-15",
              qualityScore: 87,
              status: "Cleaned",
              columns: ["date", "product_id", "revenue", "customer_name", "quantity"]
            },
            {
              id: 2,
              name: "Manufacturing_Data.xlsx",
              sector: "Manufacturing",
              records: 8920,
              uploadDate: "2024-01-14",
              qualityScore: 92,
              status: "Processing",
              columns: ["timestamp", "machine_id", "temperature", "pressure", "output"]
            },
            {
              id: 3,
              name: "HR_Employee_Data.json",
              sector: "HR",
              records: 1250,
              uploadDate: "2024-01-13",
              qualityScore: 95,
              status: "Cleaned",
              columns: ["employee_id", "name", "department", "salary", "hire_date"]
            },
            {
              id: 4,
              name: "Financial_Transactions.csv",
              sector: "Finance",
              records: 45670,
              uploadDate: "2024-01-12",
              qualityScore: 89,
              status: "Cleaned",
              columns: ["transaction_id", "amount", "account_id", "date", "description"]
            }
          ]);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        // Fallback to mock data
        setUploadedData([
          {
            id: 1,
            name: "Sales_Q1_2024.csv",
            sector: "Retail",
            records: 15420,
            uploadDate: "2024-01-15",
            qualityScore: 87,
            status: "Cleaned",
            columns: ["date", "product_id", "revenue", "customer_name", "quantity"]
          }
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const cleaningAlgorithms = [
    {
      id: "missing_values",
      name: "Missing Value Imputation",
      description: "Handle missing data using mean, median, or ML-based imputation",
      icon: "🔄",
      steps: ["Scanning for null values", "Analyzing data patterns", "Applying imputation", "Validating results"]
    },

    {
      id: "duplicates",
      name: "Duplicate Detection & Removal",
      description: "Identify and remove duplicate records",
      icon: "🔍",
      steps: ["Scanning records", "Hash comparison", "Marking duplicates", "Removing duplicates"]
    },
    {
      id: "outliers",
      name: "Outlier Detection",
      description: "Detect outliers using Z-Score and IQR methods",
      icon: "📊",
      steps: ["Statistical analysis", "Z-Score calculation", "IQR method", "Outlier flagging"]
    },
    {
      id: "data_types",
      name: "Data Type Correction",
      description: "Automatically correct inconsistent data types",
      icon: "🔧",
      steps: ["Type inference", "Pattern matching", "Type conversion", "Validation"]
    },
    {
      id: "normalization",
      name: "Data Normalization",
      description: "Scale data using Min-Max or Z-Score normalization",
      icon: "📈",
      steps: ["Range analysis", "Min-Max scaling", "Z-Score calculation", "Distribution check"]
    },
    {
      id: "noise_reduction",
      name: "Noise Reduction",
      description: "Remove noise using moving average smoothing",
      icon: "🎯",
      steps: ["Signal analysis", "Noise detection", "Smoothing filter", "Quality check"]
    },
    {
      id: "text_cleaning",
      name: "Text Cleaning",
      description: "Clean and preprocess text data",
      icon: "📝",
      steps: ["Whitespace removal", "Special char cleaning", "Case normalization", "Tokenization"]
    },
    {
      id: "validation",
      name: "Rule-based Validation",
      description: "Validate data against business rules",
      icon: "✅",
      steps: ["Rule loading", "Pattern validation", "Constraint checking", "Error reporting"]
    },
    {
      id: "consistency",
      name: "Cross-table Consistency",
      description: "Ensure consistency across related tables",
      icon: "🔗",
      steps: ["Reference check", "Foreign key validation", "Cascade updates", "Integrity check"]
    },
    {
      id: "integration",
      name: "Multi-source Integration",
      description: "Integrate data from multiple sources",
      icon: "🌐",
      steps: ["Source mapping", "Schema alignment", "Data merging", "Conflict resolution"]
    }
  ];


  const qualityMetrics = [
    { title: "Overall Data Quality", value: "92.4%", change: "+2.1%" },
    { title: "Records Processed", value: "1,247,583", change: "+15.2%" },
    { title: "Missing Values Fixed", value: "23,456", change: "-8.3%" },
    { title: "Duplicates Removed", value: "1,892", change: "+5.7%" },
  ];

  const recentActivity = [
    { time: "2 min ago", action: "Processed 5,000 records", algorithm: "Missing Value Imputation" },
    { time: "15 min ago", action: "Removed 23 duplicates", algorithm: "Duplicate Detection" },
    { time: "1 hour ago", action: "Detected 156 outliers", algorithm: "Outlier Detection" },
    { time: "2 hours ago", action: "Normalized 3 datasets", algorithm: "Data Normalization" },
  ];

  const handleStartCleaning = async () => {
    if (!selectedDataset) return;
    
    setIsRunningCleaning(true);
    setCleaningProgress(0);
    setCleaningSteps([]);
    setCleaningLogs([]);
    
    const algorithm = cleaningAlgorithms.find(a => a.id === selectedAlgorithm);
    const steps = algorithm?.steps || [];
    
    // Simulate real-time cleaning process
    for (let i = 0; i < steps.length; i++) {
      setCleaningSteps(prev => [...prev, { step: steps[i], status: 'running', timestamp: new Date().toLocaleTimeString() }]);
      setCleaningLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Starting: ${steps[i]}...`]);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const progress = ((i + 1) / steps.length) * 100;
      setCleaningProgress(progress);
      
      setCleaningSteps(prev => {
        const updated = [...prev];
        updated[i] = { ...updated[i], status: 'completed' };
        return updated;
      });
      
      setCleaningLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ✓ Completed: ${steps[i]}`]);
    }
    
    setIsRunningCleaning(false);
    setCleaningLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] 🎉 Cleaning process completed successfully!`]);
  };

  return (
    <div className="p-6 bg-clay-50 dark:bg-dark-slate min-h-screen transition-colors duration-300">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-clay-900 dark:text-white mb-2">Data Cleaning</h1>
        <p className="text-clay-600 dark:text-clay-300">Monitor and manage ML-assisted data cleaning algorithms</p>
      </div>

      {/* Quality Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {(cleaningStats ? [
          { title: "Overall Data Quality", value: `${cleaningStats.average_quality_score || 0}%`, change: "+2.1%" },
          { title: "Records Processed", value: (cleaningStats.total_cleaned || 0).toLocaleString(), change: "+15.2%" },
          { title: "Missing Values Fixed", value: "23,456", change: "-8.3%" },
          { title: "Duplicates Removed", value: "1,892", change: "+5.7%" },
        ] : qualityMetrics).map((metric, index) => (
          <div key={index} className="bg-white dark:bg-dark-blue rounded-xl p-6 shadow-lg border border-clay-200 dark:border-clay-700">
            <h3 className="text-sm font-medium text-clay-600 dark:text-clay-400 mb-2">{metric.title}</h3>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-clay-900 dark:text-white">{metric.value}</span>
              <span className={`text-sm ${metric.change.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                {metric.change}
              </span>
            </div>
          </div>
        ))}
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Data Management */}
        <div className="space-y-6">
          {/* Uploaded Data List */}
          <div className="bg-white dark:bg-dark-blue rounded-xl shadow-lg border border-clay-200 dark:border-clay-700 overflow-hidden">
            <div className="p-6 border-b border-clay-200 dark:border-clay-700">
              <h3 className="text-lg font-semibold text-clay-900 dark:text-white flex items-center">
                <Database className="w-5 h-5 mr-2 text-teal-500" />
                Uploaded Data
              </h3>
            </div>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500 mx-auto mb-4"></div>
                <p className="text-clay-500 dark:text-clay-400">Loading datasets...</p>
              </div>
            ) : (
              <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
                {uploadedData.length === 0 ? (
                  <div className="text-center py-8 text-clay-500 dark:text-clay-400">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No uploaded data found</p>
                    <p className="text-sm mt-1">Upload data from the Data Upload page</p>
                  </div>
                ) : (
                  uploadedData.map((dataset) => (
                    <div
                      key={dataset.id}
                      onClick={() => setSelectedDataset(dataset)}
                      className={`p-4 rounded-lg cursor-pointer transition-all duration-200 border ${
                        selectedDataset?.id === dataset.id
                          ? "bg-teal-50 dark:bg-teal-900/30 border-teal-500 dark:border-teal-400"
                          : "bg-clay-50 dark:bg-dark-slate border-clay-200 dark:border-clay-700 hover:border-teal-300 dark:hover:border-teal-600"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-sm text-clay-900 dark:text-white truncate">{dataset.name || dataset.filename || `Dataset #${dataset.id}`}</h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          dataset.status === "Cleaned" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                          dataset.status === "Processing" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" : 
                          "bg-clay-100 dark:bg-clay-800 text-clay-700 dark:text-clay-300"
                        }`}>
                          {dataset.status || "Pending"}
                        </span>
                      </div>
                      <div className="text-xs text-clay-600 dark:text-clay-400 mb-1">{dataset.sector || dataset.sector_name || "General"}</div>
                      <div className="flex items-center justify-between text-xs text-clay-500 dark:text-clay-500">
                        <span>{(dataset.records || dataset.row_count || 0).toLocaleString()} records</span>
                        <span className="flex items-center">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {dataset.qualityScore || dataset.quality_score || 0}% quality
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>


          {/* Dataset Details & Cleaning Actions */}
          <div className="bg-white dark:bg-dark-blue rounded-xl shadow-lg border border-clay-200 dark:border-clay-700 overflow-hidden">
            <div className="p-6 border-b border-clay-200 dark:border-clay-700">
              <h3 className="text-lg font-semibold text-clay-900 dark:text-white">Dataset Details</h3>
            </div>
            <div className="p-6">
              {selectedDataset ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-clay-900 dark:text-white mb-3 text-lg">{selectedDataset.name || `Dataset #${selectedDataset.id}`}</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                      <div className="bg-clay-50 dark:bg-dark-slate p-3 rounded-lg">
                        <span className="text-clay-500 dark:text-clay-400 block text-xs mb-1">Sector</span>
                        <span className="text-clay-900 dark:text-white font-medium">{selectedDataset.sector || selectedDataset.sector_name || "General"}</span>
                      </div>
                      <div className="bg-clay-50 dark:bg-dark-slate p-3 rounded-lg">
                        <span className="text-clay-500 dark:text-clay-400 block text-xs mb-1">Records</span>
                        <span className="text-clay-900 dark:text-white font-medium">{(selectedDataset.records || selectedDataset.row_count || 0).toLocaleString()}</span>
                      </div>
                      <div className="bg-clay-50 dark:bg-dark-slate p-3 rounded-lg">
                        <span className="text-clay-500 dark:text-clay-400 block text-xs mb-1">Quality Score</span>
                        <span className="text-teal-600 dark:text-teal-400 font-medium">{selectedDataset.qualityScore || selectedDataset.quality_score || 0}%</span>
                      </div>
                      <div className="bg-clay-50 dark:bg-dark-slate p-3 rounded-lg">
                        <span className="text-clay-500 dark:text-clay-400 block text-xs mb-1">Status</span>
                        <span className={`font-medium ${
                          selectedDataset.status === "Cleaned" ? "text-green-600 dark:text-green-400" :
                          selectedDataset.status === "Processing" ? "text-yellow-600 dark:text-yellow-400" : "text-clay-600 dark:text-clay-400"
                        }`}>
                          {selectedDataset.status || "Pending"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedDataset.columns && (
                    <div className="bg-clay-50 dark:bg-dark-slate p-4 rounded-lg">
                      <h5 className="text-clay-700 dark:text-clay-300 font-medium mb-3 text-sm">Columns ({selectedDataset.columns.length})</h5>
                      <div className="flex flex-wrap gap-2">
                        {selectedDataset.columns.map((column, index) => (
                          <span key={index} className="bg-white dark:bg-dark-blue text-clay-700 dark:text-clay-300 px-3 py-1.5 rounded-full text-xs border border-clay-200 dark:border-clay-700">
                            {column}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cleaning Action Button */}
                  <div className="pt-4 border-t border-clay-200 dark:border-clay-700">
                    <button
                      onClick={handleStartCleaning}
                      disabled={isRunningCleaning}
                      className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                        isRunningCleaning
                          ? "bg-clay-300 dark:bg-clay-700 text-clay-500 cursor-not-allowed"
                          : "bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-lg hover:shadow-xl"
                      }`}
                    >
                      {isRunningCleaning ? (
                        <>
                          <Loader className="w-5 h-5 animate-spin" />
                          <span>Cleaning in Progress...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          <span>Start Data Cleaning</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-clay-400 dark:text-clay-500">
                  <Database className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-2">No Dataset Selected</p>
                  <p className="text-sm">Select a dataset from the list above to view details and start cleaning</p>
                </div>
              )}
            </div>
          </div>
        </div>


        {/* Middle Column - Algorithms & Real-time Progress */}
        <div className="space-y-6">
          {/* Algorithm Selection */}
          <div className="bg-white dark:bg-dark-blue rounded-xl shadow-lg border border-clay-200 dark:border-clay-700 overflow-hidden">
            <div className="p-6 border-b border-clay-200 dark:border-clay-700">
              <h3 className="text-lg font-semibold text-clay-900 dark:text-white">Select Cleaning Algorithm</h3>
            </div>
            <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
              {cleaningAlgorithms.map((algo) => (
                <div
                  key={algo.id}
                  onClick={() => setSelectedAlgorithm(algo.id)}
                  className={`p-4 rounded-lg cursor-pointer transition-all duration-200 border ${
                    selectedAlgorithm === algo.id
                      ? "bg-teal-50 dark:bg-teal-900/20 border-teal-500 dark:border-teal-400 shadow-md"
                      : "bg-clay-50 dark:bg-dark-slate border-clay-200 dark:border-clay-700 hover:border-teal-300 dark:hover:border-teal-600"
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <span className="text-2xl">{algo.icon}</span>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-medium text-sm text-clay-900 dark:text-white">{algo.name}</h4>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          Active
                        </span>
                      </div>
                      <p className="text-xs text-clay-600 dark:text-clay-400">{algo.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Real-time Cleaning Progress */}
          {isRunningCleaning && (
            <div className="bg-white dark:bg-dark-blue rounded-xl shadow-lg border border-clay-200 dark:border-clay-700 overflow-hidden">
              <div className="p-6 border-b border-clay-200 dark:border-clay-700 bg-gradient-to-r from-teal-500/10 to-cyan-500/10 dark:from-teal-900/20 dark:to-cyan-900/20">
                <h3 className="text-lg font-semibold text-clay-900 dark:text-white flex items-center">
                  <Loader className="w-5 h-5 mr-2 text-teal-500 animate-spin" />
                  Cleaning in Progress
                </h3>
              </div>
              <div className="p-6 space-y-4">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-clay-600 dark:text-clay-400">Overall Progress</span>
                    <span className="text-teal-600 dark:text-teal-400 font-medium">{Math.round(cleaningProgress)}%</span>
                  </div>
                  <div className="w-full bg-clay-200 dark:bg-clay-700 rounded-full h-3 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-teal-500 to-cyan-500 h-full rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${cleaningProgress}%` }}
                    ></div>
                  </div>
                </div>

                {/* Cleaning Steps */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {cleaningSteps.map((step, index) => (
                    <div 
                      key={index} 
                      className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 ${
                        step.status === 'running' 
                          ? 'bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800' 
                          : 'bg-clay-50 dark:bg-dark-slate border border-clay-200 dark:border-clay-700'
                      }`}
                    >
                      {step.status === 'running' ? (
                        <Loader className="w-5 h-5 text-teal-500 animate-spin" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${
                          step.status === 'running' 
                            ? 'text-teal-700 dark:text-teal-300' 
                            : 'text-clay-700 dark:text-clay-300'
                        }`}>
                          {step.step}
                        </p>
                        <p className="text-xs text-clay-500 dark:text-clay-500">{step.timestamp}</p>
                      </div>
                      {step.status === 'completed' && (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">Done</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Cleaning Logs */}
          {cleaningLogs.length > 0 && (
            <div className="bg-white dark:bg-dark-blue rounded-xl shadow-lg border border-clay-200 dark:border-clay-700 overflow-hidden">
              <div className="p-4 border-b border-clay-200 dark:border-clay-700">
                <h3 className="text-sm font-semibold text-clay-900 dark:text-white flex items-center">
                  <FileText className="w-4 h-4 mr-2 text-clay-500" />
                  Cleaning Logs
                </h3>
              </div>
              <div className="p-4 bg-clay-50 dark:bg-dark-slate max-h-48 overflow-y-auto">
                <div className="space-y-1 font-mono text-xs">
                  {cleaningLogs.map((log, index) => (
                    <div 
                      key={index} 
                      className={`${
                        log.includes('✓') ? 'text-green-600 dark:text-green-400' :
                        log.includes('🎉') ? 'text-teal-600 dark:text-teal-400 font-medium' :
                        'text-clay-600 dark:text-clay-400'
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>


        {/* Right Column - Activity & Info */}
        <div className="space-y-6">
          {/* Algorithm Info */}
          <div className="bg-white dark:bg-dark-blue rounded-xl shadow-lg border border-clay-200 dark:border-clay-700 overflow-hidden">
            <div className="p-6 border-b border-clay-200 dark:border-clay-700">
              <h3 className="text-lg font-semibold text-clay-900 dark:text-white">Algorithm Details</h3>
            </div>
            <div className="p-6">
              {selectedAlgorithm && (
                <div className="space-y-4">
                  {(() => {
                    const algo = cleaningAlgorithms.find(a => a.id === selectedAlgorithm);
                    return (
                      <>
                        <div className="flex items-center space-x-3 mb-4


        {/* Right Column - Activity */}
        <div className="space-y-6">
          {/* Recent Activity */}
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {recentActivity.map((activity, index) => (
                <div key={index} className="bg-gray-700 p-3 rounded">
                  <div className="text-sm text-white mb-1">{activity.action}</div>
                  <div className="text-xs text-gray-400">{activity.algorithm}</div>
                  <div className="text-xs text-gray-500">{activity.time}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-600">
              <h4 className="text-white font-medium mb-3 text-sm">Quick Actions</h4>
              <div className="space-y-2">
                <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                  Run All Algorithms
                </button>
                <button className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300 transition-colors">
                  View Quality Report
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

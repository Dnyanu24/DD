import { useState } from "react";
import UploadBox from "../components/UploadBox";
import SummaryCard from "../components/SummaryCard";

export default function DataUpload() {
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedData, setUploadedData] = useState(null);
  const [dataInsights, setDataInsights] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const steps = [
    { id: 1, name: "Upload Data", icon: "📤", description: "Upload your data file" },
    { id: 2, name: "Data Insights", icon: "📊", description: "Review errors & cleaning needs" },
    { id: 3, name: "Save to Database", icon: "💾", description: "Store processed data" },
  ];

  const handleUploadResult = (result) => {
    setUploadedData(result);
  };

  const startAnalysis = () => {
    setIsProcessing(true);
    // Simulate data analysis
    setTimeout(() => {
      setDataInsights({
        totalRows: uploadedData.preview?.length || 0,
        errors: [
        { type: "Missing Values", count: 15, percentage: 3.2, color: "#B8956A" },
          { type: "Duplicate Rows", count: 8, percentage: 1.7, color: "#A67C52" },
          { type: "Invalid Formats", count: 5, percentage: 1.1, color: "#C9A66B" },
          { type: "Outliers", count: 3, percentage: 0.6, color: "#8B6340" },

        ],
        columnStats: [
          { column: "revenue", missing: 12, duplicates: 0, valid: 465 },
          { column: "customer_name", missing: 3, duplicates: 8, valid: 474 },
          { column: "created_at", missing: 0, duplicates: 0, valid: 477 },
          { column: "product_id", missing: 0, duplicates: 0, valid: 477 },
        ],
        cleaningNeeds: [
          "Fill missing values in 'revenue' column",
          "Remove duplicate entries based on 'transaction_id'",
          "Standardize date formats in 'created_at' column",
          "Normalize text case in 'customer_name' column",
        ],
        qualityScore: 87,
      });
      setIsProcessing(false);
      setCurrentStep(2);
    }, 3000);
  };

  const handleSaveToDatabase = async () => {
    setIsProcessing(true);
    // Simulate saving process
    setTimeout(() => {
      setIsProcessing(false);
      alert("Data successfully saved to database!");
      setCurrentStep(1);
      setUploadedData(null);
      setDataInsights(null);
    }, 3000);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-white mb-4">Upload Data File</h3>
              <p className="text-gray-400 mb-6">
                Upload CSV, Excel, or JSON files. Supports multi-sector data with automatic metadata tagging.
              </p>
              <UploadBox onResult={handleUploadResult} />
            </div>

            {uploadedData && (
              <div className="bg-gray-800 p-6 rounded-lg">
                <h4 className="text-lg font-semibold text-white mb-4">Upload Summary</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SummaryCard title="Status" value={uploadedData.message} />
                  <SummaryCard title="Rows Detected" value={uploadedData.preview?.length || 0} />
                  <SummaryCard title="File Type" value="CSV" />
                </div>
                <div className="mt-6 flex flex-wrap gap-4">
                  <button
                    onClick={() => {
                      startAnalysis();
                      setTimeout(() => setCurrentStep(2), 3000);
                    }}
                    disabled={isProcessing}
                    className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    {isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <span>📤</span>
                        <span>Upload & Analyze</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={startAnalysis}
                    disabled={isProcessing}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    {isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Analyzing...</span>
                      </>
                    ) : (
                      <>
                        <span>🔍</span>
                        <span>Start Analysis</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setCurrentStep(2)}
                    disabled={!dataInsights}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors"
                  >
                    View Insights →
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-white mb-4">Data Quality Insights</h3>
              <p className="text-gray-400 mb-6">
                Review data quality issues and recommended cleaning actions.
              </p>

              {dataInsights ? (
                <div className="space-y-6">
                  {/* Quality Score */}
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">Overall Quality Score</span>
                      <span className={`text-lg font-bold ${dataInsights.qualityScore >= 85 ? 'text-green-400' : dataInsights.qualityScore >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {dataInsights.qualityScore}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-600 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${dataInsights.qualityScore >= 85 ? 'bg-green-500' : dataInsights.qualityScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${dataInsights.qualityScore}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Error Distribution Chart */}
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="text-white font-medium mb-4">Error Distribution</h4>
                    <div className="space-y-4">
                      <div className="h-64 bg-gray-600 rounded-lg p-4">
                        <div className="flex items-end justify-between h-full space-x-2">
                          {dataInsights.errors.map((error, index) => (
                            <div key={index} className="flex-1 flex flex-col items-center">
                              <div
                                className="w-full rounded-t"
                                style={{
                                  height: `${(error.count / Math.max(...dataInsights.errors.map(e => e.count))) * 180}px`,
                                  backgroundColor: error.color,
                                }}
                              ></div>
                              <span className="text-xs text-gray-300 mt-2 transform -rotate-45 origin-top">
                                {error.type}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {dataInsights.errors.map((error, index) => (
                          <div key={index} className="flex items-center justify-between bg-gray-600 p-3 rounded">
                            <div className="flex items-center space-x-2">
                              <div
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: error.color }}
                              ></div>
                              <span className="text-white font-medium">{error.type}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-white font-bold">{error.count}</span>
                              <span className="text-gray-400 text-xs ml-1">({error.percentage}%)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Column Statistics */}
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="text-white font-medium mb-4">Column Statistics</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-600">
                            <th className="text-left text-gray-300 py-2">Column</th>
                            <th className="text-center text-gray-300 py-2">Valid</th>
                            <th className="text-center text-gray-300 py-2">Missing</th>
                            <th className="text-center text-gray-300 py-2">Duplicates</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dataInsights.columnStats.map((stat, index) => (
                            <tr key={index} className="border-b border-gray-600">
                              <td className="text-white py-2">{stat.column}</td>
                              <td className="text-center text-green-400 py-2">{stat.valid}</td>
                              <td className="text-center text-red-400 py-2">{stat.missing}</td>
                              <td className="text-center text-yellow-400 py-2">{stat.duplicates}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Cleaning Recommendations */}
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="text-white font-medium mb-4">Recommended Cleaning Actions</h4>
                    <div className="space-y-2">
                      {dataInsights.cleaningNeeds.map((need, index) => (
                        <div key={index} className="flex items-start space-x-3 bg-gray-600 p-3 rounded">
                          <span className="text-blue-400 mt-1">•</span>
                          <span className="text-gray-300">{need}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Navigation */}
                  <div className="flex space-x-4">
                    <button
                      onClick={() => setCurrentStep(1)}
                      className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-2 rounded-lg transition-colors"
                    >
                      ← Back to Upload
                    </button>
                    <button
                      onClick={() => setCurrentStep(3)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
                    >
                      Proceed to Save →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-400">Analyzing uploaded data...</p>
                </div>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-white mb-4">Save to Database</h3>
              <p className="text-gray-400 mb-6">
                Review final data and save to the SDAS database with proper indexing and partitioning.
              </p>

              <div className="space-y-4">
                <div className="bg-gray-700 p-4 rounded-lg">
                  <h4 className="text-white font-medium mb-3">Data Summary</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Total Records:</span>
                      <span className="text-white ml-2">{dataInsights?.totalRows || 0}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Quality Score:</span>
                      <span className="text-white ml-2">{dataInsights?.qualityScore || 0}%</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Issues Resolved:</span>
                      <span className="text-green-400 ml-2">{dataInsights?.errors?.length || 0}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Storage Location:</span>
                      <span className="text-white ml-2">PostgreSQL</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-700 p-4 rounded-lg">
                  <h4 className="text-white font-medium mb-3">Database Configuration</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Partitioning:</span>
                      <span className="text-white">By sector & time</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Indexing:</span>
                      <span className="text-white">Optimized for queries</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Backup:</span>
                      <span className="text-white">Automatic daily</span>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-4">
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-2 rounded-lg transition-colors"
                  >
                    ← Back to Insights
                  </button>
                  <button
                    onClick={handleSaveToDatabase}
                    disabled={isProcessing}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    {isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <span>💾</span>
                        <span>Save to Database</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-theme-primary">Data Upload</h1>
        <p className="text-theme-muted">Upload, analyze, and store multi-sector data with intelligent processing</p>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Side Navigation */}
        <div className="bg-theme-card p-6 rounded-lg shadow-lg border border-theme-medium transition-colors duration-300">
          <h3 className="text-lg font-semibold text-theme-primary mb-6">Upload Process</h3>
          <div className="space-y-4">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`p-4 rounded-lg border transition-all cursor-pointer ${
                  currentStep === step.id
                    ? "bg-accent-primary border-accent-secondary text-theme-inverse"
                    : step.id < currentStep
                    ? "bg-green-600 border-green-500 text-white"
                    : "bg-theme-secondary border-theme-medium text-theme-secondary hover:bg-theme-tertiary"
                }`}
                onClick={() => step.id <= Math.max(currentStep, uploadedData ? 2 : 1) && setCurrentStep(step.id)}
              >
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-xl">{step.icon}</span>
                  <div>
                    <h4 className="font-medium">{step.name}</h4>
                    <p className="text-xs opacity-75">{step.description}</p>
                  </div>
                </div>
                {step.id < currentStep && (
                  <div className="text-xs text-green-300">✓ Completed</div>
                )}
              </div>
            ))}
          </div>
        </div>


        {/* Main Content */}
        <div className="lg:col-span-3">
          {renderStepContent()}
        </div>
      </div>
    </div>
  );
}

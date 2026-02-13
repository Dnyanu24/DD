// Use environment variable for production, fallback to localhost for development
const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export async function analyzeFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/analysis/analyze`, {
    method: "POST",
    body: formData,
  });

  return res.json();
}

export async function getDashboardData() {
  const res = await fetch(`${BASE_URL}/dashboard/`);
  return res.json();
}

export async function getAIInsights() {
  const res = await fetch(`${BASE_URL}/ai/insights`);
  return res.json();
}

export async function uploadData(formData) {
  const res = await fetch(`${BASE_URL}/upload/data`, {
    method: "POST",
    body: formData,
  });
  return res.json();
}

export async function getReports() {
  const res = await fetch(`${BASE_URL}/reports/`);
  return res.json();
}

export async function getDataCleaningStats() {
  const res = await fetch(`${BASE_URL}/analysis/cleaning-stats`);
  return res.json();
}

export async function getUploadedData() {
  const res = await fetch(`${BASE_URL}/upload/uploaded-data`);
  return res.json();
}

export async function runDataCleaning(dataId, algorithm) {
  const res = await fetch(`${BASE_URL}/analysis/clean/${dataId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ algorithm }),
  });
  return res.json();
}

export async function getAIPredictions(sectorId) {
  const res = await fetch(`${BASE_URL}/analysis/insights/${sectorId}`);
  return res.json();
}

export async function getAIModels() {
  const res = await fetch(`${BASE_URL}/ai/models`);
  return res.json();
}

export async function trainAIModel(modelConfig) {
  const res = await fetch(`${BASE_URL}/ai/train`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(modelConfig),
  });
  return res.json();
}
  
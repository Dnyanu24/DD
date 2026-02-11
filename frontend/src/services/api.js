const BASE_URL = "http://127.0.0.1:8000";

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
  
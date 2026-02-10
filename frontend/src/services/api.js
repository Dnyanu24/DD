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

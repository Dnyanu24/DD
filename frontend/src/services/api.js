// Use env base URL, normalize 0.0.0.0, and keep last-working backend URL.
const RAW_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const NORMALIZED_DEFAULT_BASE_URL = RAW_BASE_URL.replace("0.0.0.0", "127.0.0.1");
const STORED_BASE_URL = localStorage.getItem("api_base_url");
let BASE_URL = (STORED_BASE_URL || NORMALIZED_DEFAULT_BASE_URL).replace("0.0.0.0", "127.0.0.1");

const FALLBACK_BASE_URLS = Array.from(
  new Set([
    NORMALIZED_DEFAULT_BASE_URL,
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:8001",
    "http://localhost:8001",
  ])
);

function setActiveBaseUrl(nextBaseUrl) {
  BASE_URL = nextBaseUrl.replace("0.0.0.0", "127.0.0.1");
  localStorage.setItem("api_base_url", BASE_URL);
}

export function getApiBaseUrl() {
  return BASE_URL;
}

async function requestWithBaseFallback(path, options = {}, policy = {}) {
  const { fallbackOnStatus = [404, 502, 503, 504] } = policy;
  let lastNetworkError = null;
  let lastResponse = null;
  const candidateUrls = Array.from(new Set([BASE_URL, ...FALLBACK_BASE_URLS]));

  for (const candidateBaseUrl of candidateUrls) {
    try {
      const res = await fetch(`${candidateBaseUrl}${path}`, options);
      if (res.ok) {
        setActiveBaseUrl(candidateBaseUrl);
        return res;
      }
      if (!fallbackOnStatus.includes(res.status)) {
        // Valid backend responded; do not keep hopping for auth/business errors.
        setActiveBaseUrl(candidateBaseUrl);
        return res;
      }
      lastResponse = res;
    } catch (error) {
      lastNetworkError = error;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }
  if (lastNetworkError) {
    throw lastNetworkError;
  }
  throw new Error("No reachable backend URL found.");
}

// Helper function to get auth token
export function getAuthToken() {
  return localStorage.getItem("token");
}

// Helper function to get auth header
function getAuthHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Auth API functions
export async function login(username, password) {
  try {
    const requestBody = { username, password };
    console.log("Login request to:", `${BASE_URL}/api/auth/login`);
    console.log("Request body:", JSON.stringify(requestBody));

    const res = await requestWithBaseFallback(`/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(requestBody),
    });

    console.log("Response status:", res.status);
    
    // Check if response is JSON
    const contentType = res.headers.get("content-type");
    let data;
    if (contentType && contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      data = { detail: text };
    }
    
    console.log("Response data:", data);

    if (!res.ok) {
      throw new Error(data.detail || data.message || `Login failed: ${res.status}`);
    }
    
    // Store token and user info
    if (data.access_token) {
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
    }
    
    return data;
  } catch (err) {
    console.error("Login error:", err);
    if (err.message) {
      throw err;
    }
    throw new Error("Network error. Please check your connection.");
  }
}

export async function register(userData) {
  try {
    // Only send fields that backend expects (no email)
    const requestBody = {
      username: userData.username,
      password: userData.password,
      role: userData.role.toLowerCase().replace(" ", "_"),
      company_id: String(userData.company_id || "").trim(),
      sector_id: userData.sector_id ? Number(userData.sector_id) : null,
    };
    
    console.log("Register request to:", `${BASE_URL}/api/auth/register`);
    console.log("Request body:", JSON.stringify(requestBody));

    const res = await requestWithBaseFallback(`/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(requestBody),
    });

    console.log("Response status:", res.status);
    
    // Check if response is JSON
    const contentType = res.headers.get("content-type");
    let data;
    if (contentType && contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      data = { detail: text };
    }
    
    console.log("Response data:", data);

    if (!res.ok) {
      throw new Error(data.detail || data.message || `Registration failed: ${res.status}`);
    }

    return data;
  } catch (err) {
    console.error("Register error:", err);
    if (err.message) {
      throw err;
    }
    throw new Error("Network error. Please check your connection.");
  }
}

export async function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export async function getCurrentUser() {
  const res = await requestWithBaseFallback(`/api/auth/me`, {
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error("Failed to get current user");
  }

  return res.json();
}

export async function getJoinRequests() {
  const res = await requestWithBaseFallback(`/api/auth/join-requests`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Failed to fetch join requests");
  }
  return data;
}

export async function reviewJoinRequest(requestId, action, sectorId = null) {
  const res = await requestWithBaseFallback(`/api/auth/join-requests/${requestId}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ action, sector_id: sectorId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Failed to review join request");
  }
  return data;
}

export async function getAvailableRoles() {
  const res = await fetch(`${BASE_URL}/api/auth/roles`);
  return res.json();
}

// API functions with authentication
export async function analyzeFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/api/analysis/analyze`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
    body: formData,
  });

  return res.json();
}

export async function getDashboardData() {
  const res = await fetch(`${BASE_URL}/api/dashboard/`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
}

export async function getAIInsights() {
  const res = await fetch(`${BASE_URL}/api/ai/insights`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
}

export async function uploadData(formData) {
  const res = await requestWithBaseFallback(`/api/upload/upload`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Upload failed");
  }
  return data;
}

export async function getAnnouncements() {
  const res = await requestWithBaseFallback(`/api/dashboard/announcements`, {
    headers: { ...getAuthHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Failed to load announcements");
  return data;
}

export async function createAnnouncement(payload) {
  const res = await requestWithBaseFallback(`/api/dashboard/announcements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Failed to create announcement");
  return data;
}

export async function getUserSettings() {
  const res = await requestWithBaseFallback(`/api/dashboard/settings`, {
    headers: { ...getAuthHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Failed to load settings");
  return data;
}

export async function updateUserSettings(settings) {
  const res = await requestWithBaseFallback(`/api/dashboard/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ settings }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Failed to save settings");
  return data;
}

export async function getSectors() {
  const res = await requestWithBaseFallback(`/api/upload/sectors`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Failed to load sectors");
  }
  return data;
}

export async function getProducts(sectorId) {
  const res = await requestWithBaseFallback(`/api/upload/products/${sectorId}`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Failed to load products");
  }
  return data;
}

export async function getReports() {
  const res = await requestWithBaseFallback(`/api/reports/`, {
    headers: { ...getAuthHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Failed to load reports");
  return data;
}

export async function generateReport(payload) {
  const res = await requestWithBaseFallback(`/api/reports/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Failed to generate report");
  return data;
}

export async function deleteReport(reportId) {
  const res = await requestWithBaseFallback(`/api/reports/${reportId}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Failed to delete report");
  return data;
}

export async function getDataCleaningStats() {
  const res = await fetch(`${BASE_URL}/api/analysis/cleaning-stats`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
}

export async function getCleanedDatasets() {
  const res = await fetch(`${BASE_URL}/api/analysis/cleaned-datasets`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Failed to load cleaned datasets");
  }
  return data;
}

export async function downloadCleanedDataset(cleanedDataId, format = "csv") {
  const res = await fetch(`${BASE_URL}/api/analysis/cleaned-datasets/${cleanedDataId}/download?format=${encodeURIComponent(format)}`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  if (!res.ok) {
    let message = "Download failed";
    try {
      const data = await res.json();
      message = data?.detail || data?.message || message;
    } catch {
      const text = await res.text();
      if (text) message = text;
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return {
    blob,
    filename: match?.[1] || `cleaned_${cleanedDataId}.${format}`,
  };
}

export async function downloadAllCleanedDatasets(format = "csv") {
  const res = await requestWithBaseFallback(`/api/analysis/cleaned-datasets/download-all?format=${encodeURIComponent(format)}`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  if (!res.ok) {
    let message = "Download failed";
    try {
      const data = await res.json();
      message = data?.detail || data?.message || message;
    } catch {
      const text = await res.text();
      if (text) message = text;
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
  return {
    blob,
    filename: match?.[1] || `cleaned_datasets_${format}.zip`,
  };
}

export async function deleteCleanedHistory() {
  const res = await requestWithBaseFallback(`/api/analysis/cleaned-datasets/history`, {
    method: "DELETE",
    headers: {
      ...getAuthHeaders(),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Failed to delete cleaned history");
  }
  return data;
}

export async function getUploadedData() {
  const res = await requestWithBaseFallback(`/api/upload/uploaded-data`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Failed to load uploaded datasets");
  }
  return data;
}

export async function deleteUploadedDataset(dataId) {
  const res = await requestWithBaseFallback(`/api/upload/uploaded-data/${dataId}`, {
    method: "DELETE",
    headers: {
      ...getAuthHeaders(),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Failed to delete dataset");
  }
  return data;
}

export async function runDataCleaning(dataId, algorithm) {
  const res = await fetch(`${BASE_URL}/api/analysis/clean/${dataId}?algorithm=${encodeURIComponent(algorithm)}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Cleaning failed");
  }
  return data;
}

export async function streamDataCleaning(dataId, algorithm, handlers = {}) {
  const { onEvent, signal } = handlers;
  const url = `${BASE_URL}/api/analysis/clean-stream/${dataId}?algorithm=${encodeURIComponent(algorithm)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "text/event-stream",
      ...getAuthHeaders(),
    },
    signal,
  });

  if (!res.ok) {
    let message = `Streaming request failed: ${res.status}`;
    try {
      const errorData = await res.json();
      message = errorData?.detail || errorData?.message || message;
    } catch {
      const text = await res.text();
      if (text) message = text;
    }
    throw new Error(message);
  }

  if (!res.body) {
    throw new Error("Streaming response body is not available.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emit = (eventName, payload) => {
    if (typeof onEvent === "function") {
      onEvent({ event: eventName, data: payload });
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split("\n\n");
      buffer = messages.pop() || "";

      for (const rawMessage of messages) {
        const lines = rawMessage.split("\n").map((line) => line.trim());
        const eventLine = lines.find((line) => line.startsWith("event:"));
        const dataLines = lines.filter((line) => line.startsWith("data:"));

        const eventName = eventLine ? eventLine.replace("event:", "").trim() : "message";
        const dataText = dataLines.map((line) => line.replace("data:", "").trim()).join("\n");

        if (!dataText) {
          emit(eventName, {});
          continue;
        }

        try {
          emit(eventName, JSON.parse(dataText));
        } catch {
          emit(eventName, { message: dataText });
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function getAIPredictions(sectorId) {
  const res = await fetch(`${BASE_URL}/api/analysis/insights/${sectorId}`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
}

export async function analyzeDataErrors(formData) {
  const res = await requestWithBaseFallback(`/api/analysis/error-profile`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
    body: formData,
  });
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : { detail: await res.text() };
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Error analysis failed");
  }
  return data;
}

export async function getAIModels() {
  const res = await fetch(`${BASE_URL}/api/ai/models`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
}

export async function trainAIModel(modelConfig) {
  const res = await fetch(`${BASE_URL}/api/ai/train`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(modelConfig),
  });
  return res.json();
}

export async function getRolePredictions() {
  const res = await requestWithBaseFallback(`/api/ai/role-predictions`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Failed to load role predictions");
  }
  return data;
}

export async function getCleaningComparison(dataId) {
  const res = await requestWithBaseFallback(`/api/analysis/clean-compare/${dataId}`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Failed to load cleaning comparison");
  }
  return data;
}

export async function chatWithAssistant(payload) {
  const res = await requestWithBaseFallback(`/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || data?.message || "Chat request failed");
  }
  return data;
}

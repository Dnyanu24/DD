// Use env base URL, but normalize 0.0.0.0 for browser usage on Windows.
const RAW_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const BASE_URL = RAW_BASE_URL.replace("0.0.0.0", "127.0.0.1");

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

    const res = await fetch(`${BASE_URL}/api/auth/login`, {
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
      company_id: 1,
    };
    
    console.log("Register request to:", `${BASE_URL}/api/auth/register`);
    console.log("Request body:", JSON.stringify(requestBody));

    const res = await fetch(`${BASE_URL}/api/auth/register`, {
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
  const res = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error("Failed to get current user");
  }

  return res.json();
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
  const res = await fetch(`${BASE_URL}/api/upload/data`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
    body: formData,
  });
  return res.json();
}

export async function getReports() {
  const res = await fetch(`${BASE_URL}/api/reports/`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
}

export async function getDataCleaningStats() {
  const res = await fetch(`${BASE_URL}/api/analysis/cleaning-stats`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
}

export async function getUploadedData() {
  const res = await fetch(`${BASE_URL}/api/upload/uploaded-data`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
}

export async function runDataCleaning(dataId, algorithm) {
  const res = await fetch(`${BASE_URL}/api/analysis/clean/${dataId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ algorithm }),
  });
  return res.json();
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

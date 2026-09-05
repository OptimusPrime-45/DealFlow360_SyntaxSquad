const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const TOKEN_KEY = "dealflow_access_token";
const REFRESH_TOKEN_KEY = "dealflow_refresh_token";

/**
 * Custom API Error class
 */
export class ApiClientError extends Error {
  constructor(message, status, code, errors) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

/**
 * Storage helpers
 */
export const getStoredAccessToken = () => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const getStoredRefreshToken = () => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};

export const setStoredTokens = (accessToken, refreshToken) => {
  if (typeof window === "undefined") return;
  if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

export const clearStoredTokens = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem("dealflow_user");
};

/**
 * Refresh access token using stored refresh token
 */
async function refreshAuthTokens() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    clearStoredTokens();
    return null;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearStoredTokens();
      return null;
    }

    const payload = await res.json();
    const data = payload.data || payload;
    if (data.accessToken) {
      setStoredTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    }

    return null;
  } catch (err) {
    clearStoredTokens();
    return null;
  }
}

/**
 * Core request function
 */
async function request(endpoint, options = {}) {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const token = getStoredAccessToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized with token refresh (avoid infinite loop on auth endpoints)
  if (
    response.status === 401 &&
    !endpoint.includes("/auth/login") &&
    !endpoint.includes("/auth/refresh") &&
    !options._isRetry
  ) {
    const newAccessToken = await refreshAuthTokens();
    if (newAccessToken) {
      headers.Authorization = `Bearer ${newAccessToken}`;
      response = await fetch(url, {
        ...options,
        headers,
        _isRetry: true,
      });
    } else {
      clearStoredTokens();
      if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
  }

  // Parse JSON response
  let json;
  try {
    json = await response.json();
  } catch (err) {
    if (!response.ok) {
      throw new ApiClientError(
        response.statusText || "Request failed",
        response.status,
        "HTTP_ERROR"
      );
    }
    return null;
  }

  if (!response.ok) {
    const errorInfo = json.error || {};
    throw new ApiClientError(
      errorInfo.message || json.message || "An unexpected error occurred",
      response.status,
      errorInfo.code || "UNKNOWN_ERROR",
      errorInfo.errors || []
    );
  }

  // Return data envelope if present, or raw json
  return json.data !== undefined ? json.data : json;
}

export const apiClient = {
  get: (endpoint, options) => request(endpoint, { ...options, method: "GET" }),
  post: (endpoint, body, options) =>
    request(endpoint, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: (endpoint, body, options) =>
    request(endpoint, {
      ...options,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: (endpoint, body, options) =>
    request(endpoint, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: (endpoint, options) =>
    request(endpoint, { ...options, method: "DELETE" }),
};

export default apiClient;

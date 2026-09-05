import apiClient, {
  setStoredTokens,
  clearStoredTokens,
  getStoredAccessToken,
} from "./apiClient.js";

const USER_KEY = "dealflow_user";

export const getStoredUser = () => {
  if (typeof window === "undefined") return null;
  const userJson = localStorage.getItem(USER_KEY);
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
};

export const setStoredUser = (user) => {
  if (typeof window === "undefined") return;
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
};

export const isAuthenticated = () => {
  return !!getStoredAccessToken();
};

export const hasRole = (user, allowedRoles = []) => {
  if (!user || !user.role) return false;
  if (!allowedRoles || allowedRoles.length === 0) return true;
  return allowedRoles.includes(user.role);
};

export const login = async (email, password) => {
  const result = await apiClient.post("/auth/login", { email, password });
  if (result && result.accessToken) {
    setStoredTokens(result.accessToken, result.refreshToken);
    setStoredUser(result.user);
  }
  return result;
};

export const register = async ({ email, password, fullName, roleCode }) => {
  const result = await apiClient.post("/auth/register", {
    email,
    password,
    fullName,
    roleCode,
  });
  if (result && result.accessToken) {
    setStoredTokens(result.accessToken, result.refreshToken);
    setStoredUser(result.user);
  }
  return result;
};

export const logout = () => {
  clearStoredTokens();
  setStoredUser(null);
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
};

export const fetchCurrentUser = async () => {
  const res = await apiClient.get("/auth/me");
  const user = res.user || res;
  setStoredUser(user);
  return user;
};

export const fetchRoles = async () => {
  const res = await apiClient.get("/auth/roles");
  return res.roles || res;
};

export default {
  getStoredUser,
  setStoredUser,
  isAuthenticated,
  hasRole,
  login,
  register,
  logout,
  fetchCurrentUser,
  fetchRoles,
};

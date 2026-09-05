"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  getStoredUser,
  setStoredUser,
  isAuthenticated as checkIsAuthenticated,
  login as authLogin,
  register as authRegister,
  logout as authLogout,
  fetchCurrentUser,
} from "../lib/auth.js";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (checkIsAuthenticated()) {
        const cachedUser = getStoredUser();
        if (cachedUser) {
          setUser(cachedUser);
        }
        try {
          const freshUser = await fetchCurrentUser();
          setUser(freshUser);
        } catch (error) {
          console.warn("Failed to refresh user session:", error.message);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const result = await authLogin(email, password);
      setUser(result.user);
      return result;
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    setLoading(true);
    try {
      const result = await authRegister(userData);
      setUser(result.user);
      return result;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    authLogout();
  };

  const hasRole = (allowedRoles = []) => {
    if (!user || !user.role) return false;
    if (!allowedRoles || allowedRoles.length === 0) return true;
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export default AuthContext;

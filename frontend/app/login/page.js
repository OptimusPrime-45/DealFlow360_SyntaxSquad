"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext.js";
import { Button, Input, Card } from "../../components/ui/index.js";

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();

  const [mode, setMode] = useState("login"); // 'login' | 'register'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleCode, setRoleCode] = useState("SALES_REP");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register({ email, password, fullName, roleCode });
      }
      router.push("/");
    } catch (err) {
      setError(err.message || "Authentication failed. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-[#F8F9FA]">
      {/* Brand Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-[10px] bg-[#714B67] text-white font-bold text-xl mb-3 shadow-sm">
          DF
        </div>
        <h1 className="text-2xl font-bold text-[#212529] tracking-tight">
          DealFlow360
        </h1>
        <p className="text-sm text-[#6C757D] mt-1">
          Self-Governing Deal & Margin Engine
        </p>
      </div>

      {/* Main Auth Card */}
      <Card className="w-full max-w-md shadow-[0_4px_16px_rgba(0,0,0,0.06)] border-[#DEE2E6]">
        {/* Toggle Mode */}
        <div className="flex border-b border-[#E9ECEF] mb-6">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
            }}
            className={`flex-1 pb-3 text-sm font-semibold text-center transition-colors border-b-2 cursor-pointer ${
              mode === "login"
                ? "border-[#714B67] text-[#714B67]"
                : "border-transparent text-[#6C757D] hover:text-[#212529]"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError("");
            }}
            className={`flex-1 pb-3 text-sm font-semibold text-center transition-colors border-b-2 cursor-pointer ${
              mode === "register"
                ? "border-[#714B67] text-[#714B67]"
                : "border-transparent text-[#6C757D] hover:text-[#212529]"
            }`}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 text-xs bg-[#DC3545]/10 border border-[#DC3545]/30 text-[#DC3545] rounded-[6px] flex items-center gap-2">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <>
              <Input
                label="Full Name"
                placeholder="e.g. Rahul Sharma"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#495057] uppercase tracking-wider">
                  Select Role <span className="text-[#DC3545]">*</span>
                </label>
                <select
                  value={roleCode}
                  onChange={(e) => setRoleCode(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white text-[#212529] border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67] focus:ring-2 focus:ring-[#F3EEF2] transition-all cursor-pointer"
                >
                  <option value="SALES_REP">Sales Representative</option>
                  <option value="SALES_MANAGER">Sales Manager</option>
                  <option value="FINANCE">Finance / Ops</option>
                  {/*
                    ADMIN is deliberately absent. Self-service signup as ADMIN
                    would let anyone reaching this page grant themselves every
                    discount ceiling, the approval ladder and the whole config
                    surface. The API refuses it too (403) — this only keeps the
                    UI honest about what it will accept.
                  */}
                </select>
              </div>
            </>
          )}

          <Input
            label="Email Address"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={loading}
            className="w-full mt-2 text-sm font-medium"
          >
            {mode === "login" ? "Sign In to Workspace" : "Complete Registration"}
          </Button>
        </form>

        <p className="text-[11px] text-[#6C757D] text-center mt-4">
          Are you a customer? <a href="/portal/login" className="text-[#714B67] font-medium underline">Sign in to the customer portal</a> — this page is for internal staff.
        </p>
      </Card>
    </div>
  );
}

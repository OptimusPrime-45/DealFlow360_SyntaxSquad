"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext.js";
import { Button, Card, Badge } from "../components/ui/index.js";


export default function HomePage() {
  const router = useRouter();
  const { user, loading, logout, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login");
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-[#6C757D]">
            Authenticating workspace...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const roleColors = {
    ADMIN: "danger",
    SALES_MANAGER: "warning",
    FINANCE: "info",
    SALES_REP: "neutral",
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* Top Navbar */}
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-10 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[8px] bg-[#714B67] text-white flex items-center justify-center font-bold text-sm">
            DF
          </div>
          <div>
            <div className="font-bold text-base text-[#212529] tracking-tight">
              DealFlow360
            </div>
            <div className="text-[11px] text-[#6C757D]">
              Self-Governing Deal Engine
            </div>
          </div>
        </div>

        {/* User profile & action */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 text-right">
            <div>
              <div className="text-sm font-semibold text-[#212529]">
                {user.fullName}
              </div>
              <div className="text-xs text-[#6C757D]">{user.email}</div>
            </div>
            <Badge variant={roleColors[user.role] || "neutral"} size="sm">
              {user.role}
            </Badge>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={logout}
            className="text-xs"
          >
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Workspace Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 space-y-6">
        {/* Welcome Banner */}
        <div className="bg-white border border-[#DEE2E6] rounded-[8px] p-6 shadow-xs flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#212529]">
              Welcome back, {user.fullName}
            </h1>
            <p className="text-sm text-[#6C757D] mt-1">
              Active Role:{" "}
              <span className="font-semibold text-[#714B67]">{user.roleName || user.role}</span>{" "}
              · Internal Bearer Token Active
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success" size="md">
              System Online
            </Badge>
          </div>
        </div>

        {/* Track Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            title="Track P4: Identity & Quotation Engine"
            subtitle="Catalog, Customers, Tiers, and Line Math"
          >
            <p className="text-xs text-[#6C757D] mb-4">
              Catalog and Customer data active with live line math, ceiling resolution, and margin calculation.
            </p>
            <div className="flex items-center gap-2 mb-4">
              <Link href="/admin">
                <Button variant="secondary" size="sm" className="text-xs font-semibold mr-2">
                  Go to Back-end
                </Button>
              </Link>
              <Link href="/approvals">
                <Button variant="secondary" size="sm" className="text-xs font-semibold mr-2">
                  Approvals
                </Button>
              </Link>
              <Link href="/quotations">
                <Button variant="primary" size="sm" className="text-xs font-semibold">
                  Quotations Pipeline
                </Button>
              </Link>
              <Link href="/quotations/new">
                <Button variant="secondary" size="sm" className="text-xs font-medium">
                  + New Quote
                </Button>
              </Link>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="success" size="sm">Catalog Ready</Badge>
              <Badge variant="success" size="sm">Quote Builder</Badge>
              <Badge variant="neutral" size="sm">Margin Engine</Badge>
            </div>
          </Card>

          <Card
            title="Track P1: Governance & Risk Engine"
            subtitle="Pure rule functions & Approval policy ladder"
          >
            <p className="text-xs text-[#6C757D] mb-4">
              Config-driven discount ceilings (CustomerTier, Category overrides),
              blended score calculation, and multi-step approval routing.
            </p>
            <div className="flex gap-2">
              <Badge variant="gray" size="sm">P1 Parallel Track</Badge>
            </div>
          </Card>

          <Card
            title="Track P2: Fulfillment & Hybrid Billing"
            subtitle="Multi-warehouse greedy split & Subscriptions"
          >
            <p className="text-xs text-[#6C757D] mb-4">
              Stock allocation across warehouses with backorder support, order
              confirmation freeze, and dual one-time/recurring billing streams.
            </p>
            <div className="flex gap-2">
              <Badge variant="gray" size="sm">P2 Parallel Track</Badge>
            </div>
          </Card>

          <Card
            title="Track P3: Customer Portal & Revenue"
            subtitle="Magic links, Negotiation & Invoicing"
          >
            <p className="text-xs text-[#6C757D] mb-4">
              Cryptographically isolated portal token, counter-discount triggers,
              and invoice payment status tracking.
            </p>
            <div className="flex gap-2">
              <Badge variant="gray" size="sm">P3 Parallel Track</Badge>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

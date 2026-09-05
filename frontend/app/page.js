"use client";

/**
 * Workspace — role-aware landing.
 *
 * Every role used to see the identical four links, so a Sales Rep was invited
 * into the admin configuration area (readable, every write 403s) and a Finance
 * user was invited to author quotations they are not permitted to create.
 *
 * Navigation now follows PDF §3, and matches what the API actually allows:
 *
 *   Sales Rep        builds quotations, applies discounts, adds upsell items;
 *                    tracks approval status and fulfillment progress
 *   Sales Manager    approves or rejects quotations over threshold; configures
 *                    discount tiers and approval chains; watches deal health
 *   Finance / Ops    second-level approvals; warehouse splits and backorders;
 *                    reconciles recurring billing
 *   Admin            backend setup and platform-wide reporting
 */

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext.js";
import { Button, Card, Badge } from "../components/ui/index.js";

const ROLE_SUMMARY = {
  ADMIN: "You configure the rules the deal engine runs on, and can see everything.",
  SALES_REP: "You build quotations and follow them through approval and fulfillment.",
  SALES_MANAGER: "You review deals that exceed policy, and own the ceilings that decide which ones do.",
  FINANCE: "You handle second-level approvals, fulfillment decisions, and billing.",
};

const roleColors = {
  ADMIN: "danger",
  SALES_MANAGER: "warning",
  FINANCE: "info",
  SALES_REP: "neutral",
};

/**
 * One entry per destination, listing the roles it belongs to.
 * `primary` marks the action that role starts their day with.
 */
const DESTINATIONS = [
  {
    href: "/quotations",
    label: "Quotations Pipeline",
    blurb: "Active and draft deals, with their blended score and worst line.",
    roles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"],
    primaryFor: ["SALES_REP"],
  },
  {
    href: "/quotations/new",
    label: "New Quotation",
    blurb: "Start a deal — ceilings resolve per line as you go.",
    roles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
  },
  {
    href: "/approvals",
    label: "Approvals",
    blurb: "Deals routed to you, with the per-line reason they were routed.",
    roles: ["ADMIN", "SALES_MANAGER", "FINANCE"],
    primaryFor: ["SALES_MANAGER", "FINANCE"],
  },
  {
    href: "/invoicing",
    label: "Invoicing & Payments",
    blurb: "Generate invoices, post for collection, and record payments against orders.",
    roles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"],
  },
  {
    href: "/orders",
    label: "Orders & Fulfillment",
    blurb: "Track confirmed orders, warehouse inventory allocations, and deal execution.",
    roles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"],
  },
  {
    href: "/admin",
    label: "Backend Configuration",
    blurb: "Ceilings, approval ladder, catalogue, warehouses, plans.",
    roles: ["ADMIN", "SALES_MANAGER"],
    primaryFor: ["ADMIN"],
    // §3 gives the Sales Manager tiers and approval chains; everything else in
    // here is Admin-only and the API enforces that on every write.
    note: { SALES_MANAGER: "You can change discount tiers and the approval ladder." },
  },
];

export default function HomePage() {
  const router = useRouter();
  const { user, loading, logout, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.push("/login");
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-[#6C757D]">Authenticating workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // The API returns the role either as a code string or as a related object.
  const roleCode = typeof user.role === "string" ? user.role : user.role?.code;
  const roleName = user.roleName || user.role?.name || roleCode;

  const available = DESTINATIONS.filter((d) => d.roles.includes(roleCode));
  const primary = available.filter((d) => (d.primaryFor || []).includes(roleCode));
  const secondary = available.filter((d) => !(d.primaryFor || []).includes(roleCode));

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-10 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[8px] bg-[#714B67] text-white flex items-center justify-center font-bold text-sm">
            DF
          </div>
          <div>
            <div className="font-bold text-base text-[#212529] tracking-tight">DealFlow360</div>
            <div className="text-[11px] text-[#6C757D]">Self-Governing Deal Engine</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 text-right">
            <div>
              <div className="text-sm font-semibold text-[#212529]">{user.fullName}</div>
              <div className="text-xs text-[#6C757D]">{user.email}</div>
            </div>
            <Badge variant={roleColors[roleCode] || "neutral"} size="sm">
              {roleCode}
            </Badge>
          </div>

          <Button variant="secondary" size="sm" onClick={logout} className="text-xs">
            Sign Out
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-6">
        <div className="bg-white border border-[#DEE2E6] rounded-[8px] p-6 shadow-xs">
          <h1 className="text-2xl font-bold text-[#212529]">
            Welcome back, {user.fullName}
          </h1>
          <p className="text-sm text-[#6C757D] mt-1">
            <span className="font-semibold text-[#714B67]">{roleName}</span>
            {" · "}
            {ROLE_SUMMARY[roleCode] || "Your workspace."}
          </p>
        </div>

        {primary.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#ADB5BD] font-semibold mb-2">
              Start here
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {primary.map((d) => (
                <Link key={d.href} href={d.href}>
                  <Card className="hover:border-[#714B67] transition cursor-pointer h-full">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-bold text-[#714B67]">{d.label}</div>
                        <p className="text-xs text-[#6C757D] mt-1">{d.blurb}</p>
                        {d.note?.[roleCode] && (
                          <p className="text-[11px] text-[#FD7E14] mt-2">{d.note[roleCode]}</p>
                        )}
                      </div>
                      <span className="text-[#714B67] text-lg">→</span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {secondary.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#ADB5BD] font-semibold mb-2">
              Also available to you
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {secondary.map((d) => (
                <Link key={d.href} href={d.href}>
                  <Card className="hover:border-[#ADB5BD] transition cursor-pointer h-full">
                    <div className="text-sm font-semibold text-[#212529]">{d.label}</div>
                    <p className="text-xs text-[#6C757D] mt-1">{d.blurb}</p>
                    {d.note?.[roleCode] && (
                      <p className="text-[11px] text-[#FD7E14] mt-2">{d.note[roleCode]}</p>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-[#6C757D]">
          Only what your role owns is shown here, and the API enforces the same boundaries —
          hiding a link is convenience, the server is the control.
        </p>
      </main>
    </div>
  );
}

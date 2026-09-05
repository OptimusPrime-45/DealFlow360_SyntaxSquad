"use client";

/**
 * Admin configuration area — PDF §4-A (Sales Backend).
 *
 * This is the "rules live in data" claim made visible: everything the deal
 * engine reads at runtime — ceilings, the approval ladder, stock, plans,
 * upsell pairings, the scoring strategy itself — is edited here, and takes
 * effect on the next quotation with no restart and no deploy.
 */

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext.js";
import { Badge } from "../../components/ui/index.js";

const SECTIONS = [
  {
    group: "Governance",
    items: [
      { href: "/admin/settings", label: "Engine Settings", hint: "Scoring strategy & fallbacks" },
      { href: "/admin/tiers", label: "Customer Tiers", hint: "Tier-level ceilings" },
      { href: "/admin/discount-rules", label: "Discount Rules", hint: "Per-category ceilings" },
      { href: "/admin/approval-ladder", label: "Approval Ladder", hint: "Who reviews, and when" },
    ],
  },
  {
    group: "Catalogue",
    items: [
      { href: "/admin/products", label: "Products", hint: "Physical and standard products" },
      { href: "/admin/subscription-products", label: "Subscription Products", hint: "Recurring software and SaaS" },
      { href: "/admin/services", label: "Services", hint: "Recurring and professional services" },
      { href: "/admin/price-lists", label: "Price Lists", hint: "Tier and currency pricing" },
      { href: "/admin/upsell", label: "Upsell Rules", hint: "Co-purchase pairings" },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "/admin/warehouses", label: "Warehouses & Stock", hint: "Fulfillment sources" },
    ],
  },
];

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();

  React.useEffect(() => {
    if (!loading && !isAuthenticated) router.push("/login");
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const isAdmin = user.role === "ADMIN" || user.role?.code === "ADMIN";

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      <header className="h-16 bg-[#714B67] text-white px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-white/80 hover:text-white">← Workspace</Link>
          <div>
            <div className="font-bold text-base">Backend Configuration</div>
            <div className="text-[11px] text-white/70">
              Rules the deal engine reads at runtime
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/80">{user.fullName}</span>
          <Badge variant={isAdmin ? "success" : "warning"} size="sm">
            {user.roleName || user.role?.name || user.role}
          </Badge>
        </div>
      </header>

      {!isAdmin && (
        <div className="bg-[#FFF4E5] border-b border-[#FD7E14]/30 px-6 py-2.5 text-xs text-[#7A4100]">
          You are signed in as <strong>{user.roleName || user.role}</strong>. Configuration is
          readable, but saving requires the ADMIN role — the API will reject writes.
        </div>
      )}

      <div className="flex-1 flex">
        {/* Sidebar */}
        <nav className="w-60 shrink-0 bg-white border-r border-[#E9ECEF] p-4">
          {SECTIONS.map((section) => (
            <div key={section.group} className="mb-5">
              <div className="text-[10px] uppercase tracking-wider text-[#ADB5BD] font-semibold px-2 mb-2">
                {section.group}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block px-2 py-2 rounded-[6px] transition ${
                        active ? "bg-[#F3EEF2] border-l-2 border-l-[#714B67]" : "hover:bg-[#F8F9FA]"
                      }`}
                    >
                      <div
                        className={`text-sm ${
                          active ? "font-semibold text-[#714B67]" : "text-[#212529]"
                        }`}
                      >
                        {item.label}
                      </div>
                      <div className="text-[10px] text-[#6C757D]">{item.hint}</div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <main className="flex-1 p-6 max-w-6xl">{children}</main>
      </div>
    </div>
  );
}

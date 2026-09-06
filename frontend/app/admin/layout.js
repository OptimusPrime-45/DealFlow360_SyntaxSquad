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
import { useSidebar } from "../../context/SidebarContext.js";
import { Badge, SidebarToggleButton } from "../../components/ui/index.js";

const SECTIONS = [
  {
    group: "Governance",
    items: [
      { href: "/admin/settings", label: "Engine Settings", icon: "⚙️", hint: "Scoring strategy & fallbacks" },
      { href: "/admin/tiers", label: "Customer Tiers", icon: "🏷️", hint: "Tier-level ceilings" },
      { href: "/admin/discount-rules", label: "Discount Rules", icon: "📋", hint: "Per-category ceilings" },
      { href: "/admin/approval-ladder", label: "Approval Ladder", icon: "⛓️", hint: "Who reviews, and when" },
    ],
  },
  {
    group: "Catalogue",
    items: [
      { href: "/admin/products", label: "Products", icon: "📦", hint: "Physical and standard products" },
      { href: "/admin/subscription-products", label: "Subscription Products", icon: "🔄", hint: "Recurring software and SaaS" },
      { href: "/admin/services", label: "Services", icon: "🛠️", hint: "Recurring and professional services" },
      { href: "/admin/price-lists", label: "Price Lists", icon: "💵", hint: "Tier and currency pricing" },
      { href: "/admin/upsell", label: "Upsell Rules", icon: "⚡", hint: "Co-purchase pairings" },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "/admin/warehouses", label: "Warehouses & Stock", icon: "🏬", hint: "Fulfillment sources" },
      { href: "/admin/subscriptions", label: "Subscriptions", icon: "📑", hint: "Active contracts & billing" },
    ],
  },
];

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const { collapsed } = useSidebar();

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

  const roleCode = typeof user.role === "string" ? user.role : user.role?.code;
  const isAdmin = roleCode === "ADMIN";
  const isManager = roleCode === "SALES_MANAGER";

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans">
      {/* Top Header per DESIGN.md §17 & §18: White background, dark text, clean borders */}
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <SidebarToggleButton />
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[6px] bg-[#714B67] text-white flex items-center justify-center font-bold text-xs shadow-xs">
              DF
            </div>
            <span className="font-bold text-base text-[#212529]">
              DealFlow360
            </span>
          </Link>
          <span className="text-[#CED4DA]">/</span>
          <span className="text-sm font-semibold text-[#714B67]">
            Backend Configuration
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-[#212529]">{user.fullName}</div>
            <div className="text-[10px] text-[#6C757D]">{user.email}</div>
          </div>
          <Badge variant={isAdmin ? "success" : isManager ? "warning" : "neutral"} size="sm">
            {user.roleName || user.role?.name || user.role}
          </Badge>
          <Link href="/" className="text-xs font-medium text-[#6C757D] hover:text-[#714B67] transition-colors ml-2">
            ← Workspace
          </Link>
        </div>
      </header>

      {isManager ? (
        <div className="bg-[#EBF3FC] border-b border-[#0D6EFD]/20 px-6 py-2.5 text-xs text-[#084298] flex items-center justify-between">
          <span>
            Signed in as <strong>Sales Manager</strong>. You have permissions to configure <strong>Customer Tiers</strong>, <strong>Discount Rules</strong>, and the <strong>Approval Ladder</strong>.
          </span>
          <Badge variant="info" size="sm">Manager Governance</Badge>
        </div>
      ) : !isAdmin && (
        <div className="bg-[#FFF4E5] border-b border-[#FD7E14]/30 px-6 py-2.5 text-xs text-[#7A4100]">
          You are signed in as <strong>{user.roleName || user.role}</strong>. Configuration is
          readable, but saving requires ADMIN or SALES_MANAGER permissions.
        </div>
      )}

      <div className="flex-1 flex">
        {/* Sidebar with collapse toggle transition per DESIGN.md §19 & §20 */}
        <nav
          className={`shrink-0 bg-white border-r border-[#E9ECEF] transition-[width,padding] duration-300 ease-in-out ${
            collapsed ? "w-[68px] p-2" : "w-60 p-4"
          }`}
        >
          {SECTIONS.map((section, sIdx) => (
            <div key={section.group} className="mb-5">
              {collapsed ? (
                sIdx > 0 && <div className="border-t border-[#E9ECEF] my-2 mx-1" title={section.group} />
              ) : (
                <div className="text-[11px] uppercase tracking-wider text-[#868E96] font-semibold px-3 mb-2">
                  {section.group}
                </div>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = pathname === item.href;

                  if (collapsed) {
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={`${item.label}\n${item.hint}`}
                        className={`flex items-center justify-center w-10 h-10 mx-auto rounded-[6px] text-base transition-all my-1 ${
                          active
                            ? "bg-[#F3EEF2] text-[#714B67] font-semibold border border-[#714B67]/20 shadow-xs"
                            : "text-[#495057] hover:bg-[#F8F9FA] hover:text-[#212529]"
                        }`}
                      >
                        <span>{item.icon}</span>
                      </Link>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block px-3 py-2 rounded-[6px] transition-colors ${
                        active
                          ? "bg-[#F3EEF2] text-[#714B67] font-semibold border-l-[3px] border-[#714B67]"
                          : "text-[#495057] hover:bg-[#F8F9FA] hover:text-[#212529]"
                      }`}
                    >
                      <div className="text-sm flex items-center gap-2">
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                      <div className="text-[11px] text-[#6C757D] mt-0.5 pl-6">{item.hint}</div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <main className="flex-1 p-6 md:p-8 max-w-7xl transition-all duration-300">{children}</main>
      </div>
    </div>
  );
}


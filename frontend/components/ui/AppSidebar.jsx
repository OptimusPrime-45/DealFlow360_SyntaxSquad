"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext.js";
import { useSidebar } from "../../context/SidebarContext.js";
import apiClient from "../../lib/apiClient.js";

/**
 * DealFlow360 — Application Sidebar with Role-Aware Nav & Toggle Support
 *
 * Fully compliant with DESIGN.md (§19 Application Sidebar & §20 Sidebar Active State):
 * - Expanded: 240px width (w-60)
 * - Collapsed: 68px width (w-[68px])
 * - Background: #FFFFFF
 * - Border: 1px solid #E9ECEF
 * - Active State: background #F3EEF2, text #714B67, font-weight 600
 * - Inactive State: text #495057, hover background #F8F9FA, hover text #212529
 * - Toggle control: Header icon button + Ctrl+B / Cmd+B shortcut
 * - Role-scoped links for Sales Rep, Sales Manager, Finance, and Admin
 */

const ROLE_BADGES = {
  ADMIN: { label: "System Admin", color: "bg-[#DC3545]/10 text-[#DC3545] border-[#DC3545]/20" },
  SALES_MANAGER: { label: "Sales Manager", color: "bg-[#F3EEF2] text-[#714B67] border-[#714B67]/20" },
  FINANCE: { label: "Finance / Ops", color: "bg-[#17A2B8]/10 text-[#17A2B8] border-[#17A2B8]/20" },
  SALES_REP: { label: "Sales Rep", color: "bg-[#F8F9FA] text-[#495057] border-[#DEE2E6]" },
};

export function AppSidebar({ className = "" }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { collapsed, toggleSidebar, mobileOpen, setMobileOpen } = useSidebar();

  const [pendingCount, setPendingCount] = useState(0);
  const [stalledCount, setStalledCount] = useState(0);

  const roleCode = typeof user?.role === "string" ? user.role : user?.role?.code || "SALES_REP";
  const roleMeta = ROLE_BADGES[roleCode] || {
    label: roleCode,
    color: "bg-[#F8F9FA] text-[#495057] border-[#DEE2E6]",
  };

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar across all roles
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  useEffect(() => {
    let isMounted = true;
    const loadBadges = async () => {
      try {
        if (["ADMIN", "SALES_MANAGER", "FINANCE"].includes(roleCode)) {
          const res = await apiClient.get("/quotations?status=PENDING_APPROVAL");
          if (isMounted && res?.quotations) {
            setPendingCount(res.quotations.length);
          }
        }
        if (["ADMIN", "SALES_MANAGER"].includes(roleCode)) {
          const health = await apiClient.get("/quotations/deal-health?days=7").catch(() => null);
          if (isMounted && health?.summary) {
            setStalledCount(health.summary.stalledCount || 0);
          }
        }
      } catch {
        // Non-critical badge counter fetch
      }
    };
    if (user) loadBadges();
    return () => {
      isMounted = false;
    };
  }, [user, roleCode]);

  const navGroups = [
    {
      title: "Main Workspace",
      items: [
        {
          label: "Dashboard",
          href: "/",
          icon: "📊",
          roles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"],
        },
        {
          label: "Quotations Pipeline",
          href: "/quotations",
          icon: "📑",
          roles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"],
        },
        {
          label: "New Quotation",
          href: "/quotations/new",
          icon: "➕",
          roles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
        },
      ],
    },
    {
      title: "Governance & Approvals",
      roles: ["ADMIN", "SALES_MANAGER", "FINANCE"],
      items: [
        {
          label: "Approvals Queue",
          href: "/approvals",
          icon: "🛡️",
          badge: pendingCount > 0 ? pendingCount : null,
          badgeColor: "bg-[#F3EEF2] text-[#714B67] border border-[#714B67]/30",
          roles: ["ADMIN", "SALES_MANAGER", "FINANCE"],
        },
        {
          label: "Stalled Deals",
          href: "/approvals?tab=stalled",
          icon: "⚠️",
          badge: stalledCount > 0 ? stalledCount : null,
          badgeColor: "bg-[#DC3545]/10 text-[#DC3545] border border-[#DC3545]/30",
          roles: ["ADMIN", "SALES_MANAGER"],
        },
        {
          label: "Deal Health Dashboard",
          href: "/approvals?tab=health",
          icon: "📈",
          roles: ["ADMIN", "SALES_MANAGER"],
        },
      ],
    },
    {
      title: "Commercial Execution",
      items: [
        {
          label: "Orders & Fulfillment",
          href: "/orders",
          icon: "📦",
          roles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"],
        },
        {
          label: "Invoicing & Payments",
          href: "/invoicing",
          icon: "💳",
          roles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"],
        },
      ],
    },
    {
      title: "Configuration",
      roles: ["ADMIN", "SALES_MANAGER"],
      items: [
        {
          label: "Backend Setup",
          href: "/admin",
          icon: "⚙️",
          roles: ["ADMIN", "SALES_MANAGER"],
        },
        {
          label: "Discount Tiers",
          href: "/admin/tiers",
          icon: "🏷️",
          roles: ["ADMIN", "SALES_MANAGER"],
        },
        {
          label: "Approval Chains",
          href: "/admin/ladder",
          icon: "⛓️",
          roles: ["ADMIN", "SALES_MANAGER"],
        },
        {
          label: "Warehouse Network",
          href: "/admin/warehouses",
          icon: "🏬",
          roles: ["ADMIN"],
        },
      ],
    },
  ];

  const userInitials = (user?.fullName || "DF")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const isActive = (href) => {
    if (href === "/") return pathname === "/";
    if (href.includes("?")) {
      const basePath = href.split("?")[0];
      return pathname === basePath;
    }
    return pathname.startsWith(href);
  };

  /**
   * Render sidebar content for desktop (respecting collapsed prop) or mobile (always expanded)
   */
  const renderSidebarContent = (isMobile = false) => {
    const isCollapsed = !isMobile && collapsed;

    return (
      <div className="flex flex-col h-full bg-white text-[#212529] border-r border-[#E9ECEF] select-none">
        {/* Brand Header */}
        <div className="h-16 px-3 border-b border-[#E9ECEF] flex items-center justify-between">
          {isCollapsed ? (
            <div className="w-full flex flex-col items-center justify-center gap-1">
              <Link href="/" title="DealFlow360 Home" className="group">
                <div className="w-8 h-8 rounded-[6px] bg-[#714B67] text-white flex items-center justify-center font-bold text-xs shadow-xs group-hover:bg-[#5F3D56] transition-colors">
                  DF
                </div>
              </Link>
              <button
                type="button"
                onClick={toggleSidebar}
                className="p-1 text-[#6C757D] hover:text-[#714B67] hover:bg-[#F3EEF2] rounded-[5px] transition-colors cursor-pointer"
                title="Expand sidebar (Ctrl+B)"
                aria-label="Expand sidebar"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <Link href="/" className="flex items-center gap-2.5 group min-w-0">
                <div className="w-8 h-8 rounded-[6px] bg-[#714B67] text-white flex items-center justify-center font-bold text-xs shadow-xs group-hover:bg-[#5F3D56] transition-colors shrink-0">
                  DF
                </div>
                <div className="truncate">
                  <div className="font-bold text-sm text-[#212529] tracking-tight leading-none group-hover:text-[#714B67] transition-colors truncate">
                    DealFlow360
                  </div>
                  <div className="text-[10px] text-[#6C757D] mt-0.5 font-normal truncate">
                    Self-Governing Deal Engine
                  </div>
                </div>
              </Link>

              <div className="flex items-center gap-1 shrink-0">
                {/* Desktop Toggle Button */}
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="hidden md:flex p-1.5 text-[#6C757D] hover:text-[#714B67] hover:bg-[#F8F9FA] rounded-[6px] border border-transparent hover:border-[#DEE2E6] transition-all cursor-pointer"
                  title="Collapse sidebar (Ctrl+B)"
                  aria-label="Collapse sidebar"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>

                {/* Mobile Close Button */}
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="text-[#6C757D] hover:text-[#212529] text-base p-1"
                    aria-label="Close Navigation Menu"
                  >
                    ✕
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* User Profile Card */}
        {isCollapsed ? (
          <div className="py-2.5 px-2 border-b border-[#E9ECEF] flex justify-center">
            <div
              className="w-9 h-9 rounded-[8px] bg-[#F3EEF2] border border-[#714B67]/20 text-[#714B67] font-bold flex items-center justify-center text-xs cursor-pointer shadow-xs"
              title={`${user?.fullName || "User"} (${roleMeta.label})\n${user?.email || ""}`}
            >
              {userInitials}
            </div>
          </div>
        ) : (
          <div className="p-3 mx-3 mt-3 bg-[#F8F9FA] border border-[#E9ECEF] rounded-[8px]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[6px] bg-[#F3EEF2] border border-[#714B67]/20 text-[#714B67] font-bold flex items-center justify-center text-xs shrink-0">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-[#212529] truncate leading-tight">
                  {user?.fullName || "Active User"}
                </div>
                <div className="text-[10px] text-[#6C757D] truncate mt-0.5">{user?.email}</div>
                <div className="mt-1">
                  <span className={`inline-block text-[9px] font-semibold px-2 py-0.5 rounded-[4px] border ${roleMeta.color}`}>
                    {roleMeta.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <div className={`flex-1 overflow-y-auto px-2 py-3 space-y-3 ${isCollapsed ? "scrollbar-none" : ""}`}>
          {navGroups
            .filter((group) => !group.roles || group.roles.includes(roleCode))
            .map((group, idx) => {
              const visibleItems = group.items.filter((item) => item.roles.includes(roleCode));
              if (visibleItems.length === 0) return null;

              return (
                <div key={idx}>
                  {isCollapsed ? (
                    idx > 0 && <div className="border-t border-[#E9ECEF] my-2 mx-1" title={group.title} />
                  ) : (
                    <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#868E96]">
                      {group.title}
                    </div>
                  )}

                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const active = isActive(item.href);

                      if (isCollapsed) {
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            title={`${item.label}${item.badge ? ` (${item.badge})` : ""}`}
                            className={`relative flex items-center justify-center w-10 h-10 mx-auto rounded-[6px] text-xs transition-all my-1 ${
                              active
                                ? "bg-[#F3EEF2] text-[#714B67] font-semibold border border-[#714B67]/20 shadow-xs"
                                : "text-[#495057] hover:bg-[#F8F9FA] hover:text-[#212529]"
                            }`}
                          >
                            <span className="text-base">{item.icon}</span>
                            {item.badge !== null && item.badge !== undefined && (
                              <span className="absolute -top-1 -right-1 text-[9px] font-bold w-4 h-4 rounded-full bg-[#714B67] text-white flex items-center justify-center shadow-xs leading-none">
                                {item.badge > 9 ? "9+" : item.badge}
                              </span>
                            )}
                          </Link>
                        );
                      }

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center justify-between px-2.5 py-2 rounded-[6px] text-xs transition-all ${
                            active
                              ? "bg-[#F3EEF2] text-[#714B67] font-semibold border border-[#714B67]/15"
                              : "text-[#495057] hover:bg-[#F8F9FA] hover:text-[#212529]"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-sm shrink-0">{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                          </div>
                          {item.badge !== null && item.badge !== undefined && (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${item.badgeColor}`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Footer / Logout */}
        <div className={`border-t border-[#E9ECEF] bg-[#F8F9FA] ${isCollapsed ? "p-2 flex justify-center" : "p-3"}`}>
          {isCollapsed ? (
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className="w-10 h-10 flex items-center justify-center text-xs font-medium text-[#6C757D] hover:text-[#DC3545] hover:bg-white rounded-[6px] border border-[#DEE2E6] hover:border-[#DC3545]/30 transition-all cursor-pointer shadow-xs"
            >
              <span>🚪</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-[#6C757D] hover:text-[#DC3545] hover:bg-white rounded-[6px] border border-[#DEE2E6] hover:border-[#DC3545]/30 transition-all cursor-pointer shadow-xs"
            >
              <span>🚪</span>
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Toggle Button */}
      <div className="md:hidden fixed bottom-4 left-4 z-50">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="w-11 h-11 rounded-full bg-[#714B67] text-white shadow-md flex items-center justify-center text-lg font-bold hover:bg-[#5F3D56] transition-colors"
          aria-label="Open Navigation Menu"
        >
          ☰
        </button>
      </div>

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 bg-black/40 z-40 backdrop-blur-xs"
        />
      )}

      {/* Mobile Drawer (always expanded for clear touch navigation) */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 w-64 z-50 transform transition-transform duration-200 ease-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {renderSidebarContent(true)}
      </div>

      {/* Desktop Persistent Sidebar with smooth collapse/expand width transition */}
      <aside
        className={`hidden md:block shrink-0 h-screen sticky top-0 z-20 transition-[width] duration-300 ease-in-out ${
          collapsed ? "w-[68px]" : "w-60"
        } ${className}`}
      >
        {renderSidebarContent(false)}
      </aside>
    </>
  );
}

export default AppSidebar;

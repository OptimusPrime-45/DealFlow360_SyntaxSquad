"use client";

import React from "react";
import { AppSidebar } from "./AppSidebar.jsx";
import { useSidebar } from "../../context/SidebarContext.js";

/**
 * DealFlow360 — Universal App Shell
 * Renders persistent role-aware sidebar with collapsible state across all roles.
 */
export function AppShell({ children, className = "" }) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen flex bg-[#F8F9FA] text-[#212529] font-sans antialiased">
      {/* Universal persistent navigation sidebar for all roles */}
      <AppSidebar />

      {/* Main content body with smooth flex transition */}
      <div
        className={`flex-1 flex flex-col min-w-0 overflow-x-hidden transition-[margin,width] duration-300 ease-in-out ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

export default AppShell;

"use client";

import React from "react";
import { useSidebar } from "../../context/SidebarContext.js";

/**
 * DealFlow360 — Sidebar Toggle Button
 * Can be placed in topbars, headers, or action bars to toggle sidebar state.
 */
export function SidebarToggleButton({ className = "", showLabel = false }) {
  const { collapsed, toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className={`p-1.5 rounded-[6px] text-[#6C757D] hover:text-[#714B67] hover:bg-[#F3EEF2] border border-[#DEE2E6] hover:border-[#714B67]/30 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-medium shadow-xs ${className}`}
      title={collapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
      aria-label={collapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar"}
    >
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {collapsed ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        )}
      </svg>
      {showLabel && (
        <span className="hidden sm:inline">{collapsed ? "Expand" : "Collapse"}</span>
      )}
    </button>
  );
}

export default SidebarToggleButton;

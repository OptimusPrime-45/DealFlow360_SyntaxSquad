"use client";

import React from "react";
import { Button } from "./Button.jsx";

/**
 * Enterprise Batch Action Bar for multi-select operations
 * Appears when one or more table rows are selected via checkbox.
 */
export function BatchActionBar({
  selectedCount = 0,
  totalCount = 0,
  onSelectAll,
  onClearSelection,
  actions = [],
  className = "",
}) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={`sticky top-16 z-20 bg-[#212529] text-white px-4 py-2.5 rounded-[8px] shadow-lg border border-[#343A40] flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-150 ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 rounded bg-[#714B67] flex items-center justify-center text-white text-xs font-bold">
          ✓
        </div>
        <div className="text-xs font-semibold">
          <span className="text-[#FFC107] font-bold text-sm">{selectedCount}</span> of {totalCount} selected
        </div>
        {onSelectAll && selectedCount < totalCount && (
          <button
            type="button"
            onClick={onSelectAll}
            className="text-xs text-[#17A2B8] hover:text-white underline cursor-pointer transition-colors"
          >
            Select all {totalCount} items
          </button>
        )}
        <button
          type="button"
          onClick={onClearSelection}
          className="text-xs text-[#ADB5BD] hover:text-white ml-2 cursor-pointer transition-colors"
        >
          Deselect all
        </button>
      </div>

      <div className="flex items-center gap-2">
        {actions.map((act, idx) => (
          <Button
            key={idx}
            variant={act.variant || "secondary"}
            size="sm"
            onClick={act.onClick}
            disabled={act.disabled}
            className={`text-xs py-1 px-3 transition-colors ${
              act.variant === "danger"
                ? "bg-[#DC3545] hover:bg-[#BB2D3B] text-white border-none"
                : act.variant === "primary"
                ? "bg-[#28A745] hover:bg-[#218838] text-white border-none font-semibold"
                : act.variant === "warning"
                ? "bg-[#E67E22] hover:bg-[#D35400] text-white border-none"
                : "bg-white/10 hover:bg-white/20 text-white border-white/20"
            }`}
          >
            {act.icon && <span className="mr-1.5">{act.icon}</span>}
            {act.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default BatchActionBar;

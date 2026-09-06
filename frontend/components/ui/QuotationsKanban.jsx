"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * DealFlow360 — Quotations Kanban Board
 *
 * Fully compliant with DESIGN.md:
 * - Odoo purple (#714B67) primary accent
 * - Soft gray (#F8F9FA) column containers, clean white (#FFFFFF) cards
 * - Crisp borders (#DEE2E6 / #E9ECEF) with standard 6px/8px radii
 * - Inter typography (#212529 primary text, #6C757D muted subtext)
 * - Status indicators (#28A745 success, #F0AD00 warning, #DC3545 danger)
 */

const KANBAN_COLUMNS = [
  {
    id: "DRAFT",
    title: "Draft",
    matcher: (q) => q.status === "DRAFT",
    dot: "bg-[#6C757D]",
  },
  {
    id: "PENDING_APPROVAL",
    title: "Pending Approval",
    matcher: (q) => q.status === "PENDING_APPROVAL",
    dot: "bg-[#F0AD00]",
  },
  {
    id: "APPROVED",
    title: "Approved",
    matcher: (q) => q.status === "APPROVED",
    dot: "bg-[#28A745]",
  },
  {
    id: "NEGOTIATION",
    title: "Negotiation",
    matcher: (q) => q.status === "UNDER_NEGOTIATION" || q.status === "SENT",
    dot: "bg-[#17A2B8]",
  },
  {
    id: "CONFIRMED",
    title: "Confirmed",
    matcher: (q) => q.status === "CONFIRMED",
    dot: "bg-[#714B67]",
  },
];

export function QuotationsKanban({
  quotations = [],
  onSwitchToTable,
  currencySymbol = "₹",
}) {
  const router = useRouter();

  const formatAmount = (val) => {
    const num = Number(val || 0);
    return `${currencySymbol}${num.toLocaleString("en-IN", {
      maximumFractionDigits: 0,
    })}`;
  };

  return (
    <div className="bg-white border border-[#DEE2E6] rounded-[8px] p-6 shadow-xs space-y-6">
      {/* Header matching Image 1 & DESIGN.md §21 */}
      <div>
        <h2 className="text-xl font-bold text-[#212529] tracking-tight">
          Quotations (List)
        </h2>
        <p className="text-xs text-[#6C757D] mt-0.5">
          Every quotation in the system, one row per quotation, click a row to open it
        </p>
      </div>

      {/* 5 Kanban Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {KANBAN_COLUMNS.map((col) => {
          const columnQuotes = quotations.filter(col.matcher);
          return (
            <div
              key={col.id}
              className="bg-[#F8F9FA] border border-[#E9ECEF] rounded-[8px] p-3 flex flex-col min-h-[480px]"
            >
              {/* Column Title */}
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#E9ECEF]">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <span className="font-semibold text-xs text-[#212529] uppercase tracking-wider">
                    {col.title}
                  </span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-[4px] bg-white text-[#495057] border border-[#CED4DA]">
                  {columnQuotes.length}
                </span>
              </div>

              {/* Cards List */}
              <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[640px] pr-0.5">
                {columnQuotes.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center border border-dashed border-[#DEE2E6] rounded-[6px] text-center p-3 text-[#ADB5BD] bg-white/50">
                    <span className="text-xs font-medium">No quotations</span>
                    <span className="text-[10px] mt-0.5">in {col.title}</span>
                  </div>
                ) : (
                  columnQuotes.map((q) => {
                    const custName = q.customer?.name || "Customer";
                    const amountStr = formatAmount(q.grandTotal);
                    const overage = Number(q.worstLineOverage || 0);

                    return (
                      <div
                        key={q.id}
                        onClick={() => router.push(`/quotations/${q.id}`)}
                        className="group bg-white hover:bg-[#FAF9FB] border border-[#DEE2E6] hover:border-[#714B67] rounded-[6px] p-3 cursor-pointer transition-all duration-150 shadow-xs hover:shadow-sm"
                      >
                        {/* Title matching Image 1: Acme Corp - $12,400 */}
                        <div className="text-xs font-bold text-[#212529] group-hover:text-[#714B67] transition-colors flex items-center justify-between gap-1">
                          <span className="truncate">{custName}</span>
                          <span className="shrink-0 text-[#212529]">{amountStr}</span>
                        </div>

                        {/* Extra metadata */}
                        <div className="flex items-center justify-between text-[11px] text-[#6C757D] mt-1.5">
                          <span className="font-semibold text-[#714B67]">
                            {q.quotationNumber}
                          </span>
                          {q.customerTier && (
                            <span className="px-1.5 py-0.2 rounded-[4px] bg-[#F8F9FA] text-[#495057] text-[10px] border border-[#E9ECEF]">
                              {q.customerTier.name || q.customerTier.code}
                            </span>
                          )}
                        </div>

                        {/* Margin & Overage indicators */}
                        <div className="flex items-center justify-between gap-1 mt-2 pt-2 border-t border-[#F1F2F3] text-[10px]">
                          <span
                            className={`font-semibold ${
                              Number(q.marginPercent) < 15
                                ? "text-[#DC3545]"
                                : "text-[#28A745]"
                            }`}
                          >
                            {Number(q.marginPercent).toFixed(1)}% margin
                          </span>
                          {overage > 0 ? (
                            <span className="px-1.5 py-0.2 rounded-[4px] bg-[#FDECEA] text-[#DC3545] text-[9px] font-bold border border-[#DC3545]/20">
                              +{overage.toFixed(1)}pt over
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#6C757D]">
                              {q.salesRep?.fullName?.split(" ")[0] || "Rep"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Buttons matching Image 1 & DESIGN.md §22 & §23 */}
      <div className="flex items-center gap-3 pt-2">
        <Link href="/quotations/new">
          <button
            type="button"
            className="px-4 py-2 rounded-[6px] bg-[#714B67] hover:bg-[#5F3D56] text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>+</span>
            <span>New Quotation</span>
          </button>
        </Link>

        {onSwitchToTable && (
          <button
            type="button"
            onClick={onSwitchToTable}
            className="px-4 py-2 rounded-[6px] bg-white hover:bg-[#F8F9FA] text-[#212529] border border-[#DEE2E6] hover:border-[#CED4DA] text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            Switch to Table View
          </button>
        )}
      </div>
    </div>
  );
}

export default QuotationsKanban;

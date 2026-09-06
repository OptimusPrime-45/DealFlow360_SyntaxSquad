"use client";

/**
 * Reports & Analytics — PDF §4-A7 "Reporting & Dashboard Configuration".
 *
 * Implements the four reporting filters the spec names by purpose:
 *   Period · Sales Team/Rep · Approval Status · Product/Category
 * and the export options it requires (PDF / XLS, plus CSV).
 *
 * Every number on this page comes from /api/reports/sales with the active
 * filters applied server-side, so what you see is what exports.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext.js";
import apiClient from "../../lib/apiClient.js";
import { AppShell, Button, Card, Badge } from "../../components/ui/index.js";
import { exportToCSV } from "../../lib/exportCsv.js";
import { exportToPDF, exportToXLS } from "../../lib/exportReport.js";

const money = (v) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => `${Number(v ?? 0).toFixed(1)}%`;
const shortDate = (v) => (v ? new Date(v).toLocaleDateString() : "—");

const PERIODS = [
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "week" },
  { label: "Last 30 days", value: "month" },
  { label: "Last 90 days", value: "quarter" },
  { label: "Last 12 months", value: "year" },
  { label: "All time", value: "all" },
];

const APPROVAL_STATUSES = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
];

const STATUS_VARIANT = {
  DRAFT: "gray",
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  SENT: "info",
  UNDER_NEGOTIATION: "warning",
  CONFIRMED: "neutral",
  REJECTED: "danger",
  CANCELLED: "danger",
  EXPIRED: "gray",
};

// Column contract shared by the CSV, XLS and PDF exporters.
const ROW_COLUMNS = [
  { key: "quotationNumber", label: "Quotation #" },
  { key: "status", label: "Status" },
  { key: "customer", label: "Customer" },
  { key: "tier", label: "Tier" },
  { key: "salesRep", label: "Sales Rep" },
  { key: "createdAt", label: "Created", formatter: (v) => shortDate(v) },
  { key: "lineCount", label: "Lines" },
  { key: "grandTotal", label: "Grand Total", formatter: (v) => Number(v).toFixed(2) },
  { key: "marginPercent", label: "Margin %", formatter: (v) => Number(v).toFixed(1) },
  { key: "blendedScore", label: "Blended Score", formatter: (v) => Number(v).toFixed(2) },
  { key: "orderNumber", label: "Order #" },
  { key: "orderStatus", label: "Order Status" },
  { key: "invoicedTotal", label: "Invoiced", formatter: (v) => Number(v).toFixed(2) },
  { key: "amountPaid", label: "Paid", formatter: (v) => Number(v).toFixed(2) },
];

const REP_COLUMNS = [
  { key: "name", label: "Sales Rep" },
  { key: "count", label: "Quotes" },
  { key: "value", label: "Pipeline Value", formatter: (v) => Number(v).toFixed(2) },
  { key: "confirmed", label: "Won" },
  { key: "confirmedValue", label: "Won Value", formatter: (v) => Number(v).toFixed(2) },
  { key: "conversionRate", label: "Conversion %", formatter: (v) => Number(v).toFixed(1) },
  { key: "avgMarginPercent", label: "Avg Margin %", formatter: (v) => Number(v).toFixed(1) },
];

const PRODUCT_COLUMNS = [
  { key: "name", label: "Product" },
  { key: "sku", label: "SKU" },
  { key: "category", label: "Category" },
  { key: "quantity", label: "Qty Sold" },
  { key: "revenue", label: "Revenue", formatter: (v) => Number(v).toFixed(2) },
  { key: "avgDiscountPercent", label: "Avg Discount %", formatter: (v) => Number(v).toFixed(1) },
];

export default function ReportsPage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [report, setReport] = useState(null);
  const [options, setOptions] = useState({ salesReps: [], categories: [], products: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // ── Filter state (the four the spec names) ──
  const [period, setPeriod] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [approvalStatus, setApprovalStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [productId, setProductId] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (customFrom || customTo) {
      if (customFrom) params.append("from", customFrom);
      if (customTo) params.append("to", customTo);
    } else if (period && period !== "all") {
      params.append("period", period);
    }
    if (salesRepId) params.append("salesRepId", salesRepId);
    if (approvalStatus) params.append("approvalStatus", approvalStatus);
    if (categoryId) params.append("categoryId", categoryId);
    if (productId) params.append("productId", productId);
    return params.toString();
  }, [period, customFrom, customTo, salesRepId, approvalStatus, categoryId, productId]);

  const loadReport = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const res = await apiClient.get(`/reports/sales${queryString ? `?${queryString}` : ""}`);
      setReport(res);
    } catch (err) {
      setError(err.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    if (!isAuthenticated) return;
    apiClient
      .get("/reports/filters")
      .then(setOptions)
      .catch((err) => setError(err.message || "Failed to load filter options"));
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) loadReport();
  }, [isAuthenticated, loadReport]);

  const resetFilters = () => {
    setPeriod("all");
    setCustomFrom("");
    setCustomTo("");
    setSalesRepId("");
    setApprovalStatus("");
    setCategoryId("");
    setProductId("");
  };

  // Products narrow to the chosen category so the two filters cannot contradict.
  const productChoices = useMemo(() => {
    if (!categoryId) return options.products || [];
    return (options.products || []).filter((p) => p.categoryId === categoryId);
  }, [options.products, categoryId]);

  const summary = report?.summary;
  const filters = report?.appliedFilters;

  /** Filter/KPI lines reused by both the PDF header and the XLS summary block. */
  const exportMeta = useMemo(() => {
    if (!summary || !filters) return [];
    const repName =
      (options.salesReps || []).find((r) => r.id === filters.salesRepId)?.fullName || "All reps";
    const catName =
      (options.categories || []).find((c) => c.id === filters.categoryId)?.name || "All categories";
    const prodName =
      (options.products || []).find((p) => p.id === filters.productId)?.name || "All products";
    return [
      ["Period", filters.periodLabel],
      ["Sales Rep", repName],
      ["Approval Status", filters.approvalStatus || "All"],
      ["Category", catName],
      ["Product", prodName],
      ["Quotations", String(summary.quotationCount)],
      ["Total Value", money(summary.totalValue)],
      ["Conversion Rate", pct(summary.conversionRate)],
      ["Avg Margin", pct(summary.avgMarginPercent)],
      ["Avg Discount", pct(summary.avgDiscountPercent)],
    ];
  }, [summary, filters, options]);

  const stamp = new Date().toISOString().split("T")[0];

  const handleExportCSV = () => {
    exportToCSV(report?.rows || [], ROW_COLUMNS, `dealflow_report_${stamp}.csv`);
  };

  const handleExportXLS = async () => {
    setBusy(true);
    try {
      await exportToXLS(report?.rows || [], ROW_COLUMNS, `dealflow_report_${stamp}.xlsx`, {
        sheetName: "Quotations",
        summaryRows: [["DealFlow360 — Sales Report"], ...exportMeta],
        extraSheets: [
          { name: "By Sales Rep", columns: REP_COLUMNS, rows: report?.bySalesRep || [] },
          { name: "Top Selling", columns: PRODUCT_COLUMNS, rows: report?.topSelling || [] },
          { name: "Most Discounted", columns: PRODUCT_COLUMNS, rows: report?.mostDiscounted || [] },
        ],
      });
    } catch (err) {
      setError(err.message || "XLS export failed");
    } finally {
      setBusy(false);
    }
  };

  const handleExportPDF = async () => {
    setBusy(true);
    try {
      await exportToPDF(report?.rows || [], ROW_COLUMNS, `dealflow_report_${stamp}.pdf`, {
        title: "DealFlow360 — Sales Report",
        subtitle: `${filters?.periodLabel || "All time"} · ${summary?.quotationCount || 0} quotations · ${money(summary?.totalValue)}`,
        meta: exportMeta,
        extraTables: [
          { name: "Performance by Sales Rep", columns: REP_COLUMNS, rows: report?.bySalesRep || [] },
          { name: "Best Selling Products", columns: PRODUCT_COLUMNS, rows: report?.topSelling || [] },
          { name: "Most Discounted Products", columns: PRODUCT_COLUMNS, rows: report?.mostDiscounted || [] },
        ],
      });
    } catch (err) {
      setError(err.message || "PDF export failed");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || (loading && !report)) {
    return (
      <AppShell>
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  const selectClass =
    "h-9 px-3 text-xs bg-white text-[#212529] border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67] transition-all cursor-pointer";

  return (
    <AppShell>
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-[#6C757D] hover:text-[#714B67] transition-colors">
            ← Workspace
          </Link>
          <div className="h-4 w-px bg-[#CED4DA]" />
          <div>
            <h1 className="font-bold text-base text-[#212529]">Reports &amp; Analytics</h1>
            <p className="text-[11px] text-[#6C757D]">
              Sales performance, approval throughput, and product discounting
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={loadReport} disabled={busy || loading}>
            ↻ Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCSV} disabled={busy || !report}>
            📄 CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportXLS} disabled={busy || !report}>
            📊 XLS
          </Button>
          <Button variant="primary" size="sm" onClick={handleExportPDF} disabled={busy || !report}>
            📕 PDF
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-5">
        {error && (
          <div className="bg-[#FDECEA] border border-[#DC3545]/30 text-[#842029] text-sm rounded-[8px] px-4 py-3 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="text-xs font-bold ml-4">✕</button>
          </div>
        )}

        {/* ── Reporting Filters (PDF §4-A7) ── */}
        <Card title="Reporting Filters" subtitle="Period · Sales Team/Rep · Approval Status · Product/Category">
          <div className="p-4 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#6C757D] uppercase tracking-wider">Period</label>
              <select
                value={customFrom || customTo ? "" : period}
                onChange={(e) => {
                  setPeriod(e.target.value);
                  setCustomFrom("");
                  setCustomTo("");
                }}
                className={selectClass}
              >
                {(customFrom || customTo) && <option value="">Custom range</option>}
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#6C757D] uppercase tracking-wider">Custom From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className={selectClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#6C757D] uppercase tracking-wider">Custom To</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className={selectClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#6C757D] uppercase tracking-wider">Sales Team / Rep</label>
              <select value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)} className={selectClass}>
                <option value="">All Sales Reps</option>
                {(options.salesReps || []).map((r) => (
                  <option key={r.id} value={r.id}>{r.fullName || r.email}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#6C757D] uppercase tracking-wider">Approval Status</label>
              <select value={approvalStatus} onChange={(e) => setApprovalStatus(e.target.value)} className={selectClass}>
                {APPROVAL_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#6C757D] uppercase tracking-wider">Category</label>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setProductId("");
                }}
                className={selectClass}
              >
                <option value="">All Categories</option>
                {(options.categories || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#6C757D] uppercase tracking-wider">Product</label>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} className={selectClass}>
                <option value="">All Products</option>
                {productChoices.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <Button variant="secondary" size="sm" onClick={resetFilters} disabled={loading}>
              Reset
            </Button>

            {loading && (
              <span className="text-[11px] text-[#6C757D] flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-[#714B67] border-t-transparent rounded-full animate-spin inline-block" />
                Recalculating…
              </span>
            )}
          </div>
        </Card>

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Quotations", value: summary?.quotationCount ?? 0, color: "#212529", hint: filters?.periodLabel },
            { label: "Pipeline Value", value: money(summary?.totalValue), color: "#714B67", hint: `Avg ${money(summary?.avgDealSize)}` },
            { label: "Conversion", value: pct(summary?.conversionRate), color: "#28A745", hint: `${summary?.confirmedCount ?? 0} confirmed` },
            { label: "Avg Margin", value: pct(summary?.avgMarginPercent), color: "#17A2B8", hint: `Avg disc ${pct(summary?.avgDiscountPercent)}` },
            { label: "Awaiting Approval", value: summary?.pendingApprovalCount ?? 0, color: "#FD7E14", hint: `${summary?.rejectedCount ?? 0} rejected` },
            { label: "Outstanding", value: money(summary?.outstandingTotal), color: "#DC3545", hint: `Collected ${money(summary?.collectedTotal)}` },
          ].map((kpi) => (
            <Card key={kpi.label} padding="p-4">
              <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">{kpi.label}</div>
              <div className="text-xl font-bold mt-1" style={{ color: kpi.color }}>{kpi.value}</div>
              <div className="text-[11px] text-[#6C757D] mt-0.5">{kpi.hint}</div>
            </Card>
          ))}
        </div>

        {/* ── Status mix + Rep performance ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="Approval Status Mix" subtitle="Quotation count and value by status">
            <div className="p-4 space-y-2.5">
              {(report?.byStatus || []).length === 0 && (
                <p className="text-xs text-[#6C757D] text-center py-6">No quotations in this slice.</p>
              )}
              {(report?.byStatus || []).map((s) => {
                const share = summary?.totalValue > 0 ? (s.value / summary.totalValue) * 100 : 0;
                return (
                  <div key={s.status}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_VARIANT[s.status] || "neutral"} size="sm">
                          {s.status.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-[11px] text-[#6C757D]">{s.count} quote(s)</span>
                      </div>
                      <span className="text-xs font-bold text-[#212529]">{money(s.value)}</span>
                    </div>
                    <div className="h-1.5 bg-[#F1F3F5] rounded-full overflow-hidden">
                      <div className="h-full bg-[#714B67] rounded-full" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Performance by Sales Rep" subtitle="Pipeline, win rate, and margin discipline">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F8F9FA] border-b border-[#E9ECEF]">
                  <tr>
                    {["Rep", "Quotes", "Pipeline", "Won", "Conv.", "Margin"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#6C757D]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(report?.bySalesRep || []).length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-[#6C757D]">No data.</td></tr>
                  )}
                  {(report?.bySalesRep || []).map((r) => (
                    <tr key={r.salesRepId} className="border-b border-[#E9ECEF] hover:bg-[#F8F9FA]">
                      <td className="px-3 py-2 font-medium text-[#212529]">{r.name}</td>
                      <td className="px-3 py-2 text-[#6C757D]">{r.count}</td>
                      <td className="px-3 py-2 font-semibold text-[#212529]">{money(r.value)}</td>
                      <td className="px-3 py-2 text-[#28A745] font-semibold">{r.confirmed}</td>
                      <td className="px-3 py-2">
                        <Badge variant={r.conversionRate >= 50 ? "success" : r.conversionRate >= 25 ? "warning" : "danger"} size="sm">
                          {pct(r.conversionRate)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-[#6C757D]">{pct(r.avgMarginPercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* ── Best selling / most discounted (spec's Product-Category purpose) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="Best Selling Products" subtitle="Ranked by revenue in the current slice">
            <ProductTable rows={report?.topSelling} valueLabel="Revenue" highlight="revenue" />
          </Card>
          <Card title="Most Discounted Products" subtitle="Where margin is being given away">
            <ProductTable rows={report?.mostDiscounted} valueLabel="Avg Disc." highlight="discount" />
          </Card>
        </div>

        {/* ── Detail rows ── */}
        <Card
          title="Quotation Detail"
          subtitle={`${report?.rows?.length || 0} row(s) — this is exactly what exports`}
        >
          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-sm">
              <thead className="bg-[#F8F9FA] border-b border-[#E9ECEF] sticky top-0">
                <tr>
                  {["Quotation #", "Status", "Customer", "Rep", "Created", "Total", "Margin", "Order", "Paid"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#6C757D]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(report?.rows || []).length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-xs text-[#6C757D]">
                    No quotations match these filters.
                  </td></tr>
                )}
                {(report?.rows || []).map((r) => (
                  <tr key={r.quotationNumber} className="border-b border-[#E9ECEF] hover:bg-[#F8F9FA]">
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-[#714B67]">{r.quotationNumber}</td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[r.status] || "neutral"} size="sm">
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-[#212529]">{r.customer}</td>
                    <td className="px-3 py-2 text-[#6C757D] text-xs">{r.salesRep}</td>
                    <td className="px-3 py-2 text-[#6C757D] text-xs">{shortDate(r.createdAt)}</td>
                    <td className="px-3 py-2 font-semibold text-[#212529]">{money(r.grandTotal)}</td>
                    <td className="px-3 py-2 text-xs text-[#6C757D]">{pct(r.marginPercent)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[#6C757D]">{r.orderNumber || "—"}</td>
                    <td className="px-3 py-2 text-xs font-semibold text-[#28A745]">
                      {r.amountPaid > 0 ? money(r.amountPaid) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </AppShell>
  );
}

/** Shared renderer for the two product league tables. */
function ProductTable({ rows, valueLabel, highlight }) {
  const list = rows || [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[#F8F9FA] border-b border-[#E9ECEF]">
          <tr>
            {["Product", "Category", "Qty", valueLabel].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#6C757D]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-[#6C757D]">No product lines in this slice.</td></tr>
          )}
          {list.map((p) => (
            <tr key={p.productId} className="border-b border-[#E9ECEF] hover:bg-[#F8F9FA]">
              <td className="px-3 py-2">
                <div className="font-medium text-[#212529] text-xs">{p.name}</div>
                <div className="text-[10px] text-[#6C757D] font-mono">{p.sku}</div>
              </td>
              <td className="px-3 py-2 text-xs text-[#6C757D]">{p.category}</td>
              <td className="px-3 py-2 text-xs text-[#6C757D]">{p.quantity}</td>
              <td className="px-3 py-2">
                {highlight === "revenue" ? (
                  <span className="text-xs font-bold text-[#212529]">{money(p.revenue)}</span>
                ) : (
                  <Badge variant={p.avgDiscountPercent >= 15 ? "danger" : p.avgDiscountPercent >= 8 ? "warning" : "gray"} size="sm">
                    {pct(p.avgDiscountPercent)}
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

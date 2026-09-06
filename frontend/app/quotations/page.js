"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext.js";
import apiClient from "../../lib/apiClient.js";
import { Button, Badge, AppShell, QuotationsKanban, SidebarToggleButton } from "../../components/ui/index.js";
import { OdooControlPanel } from "../../components/ui/OdooControlPanel.jsx";
import { GroupedTable } from "../../components/ui/GroupedTable.jsx";
import { BatchActionBar } from "../../components/ui/BatchActionBar.jsx";
import { BTreeSearchIndex } from "../../lib/btree.js";
import { exportToCSV } from "../../lib/exportCsv.js";

// Stalled-deal threshold; mirrors GovernanceSetting.stalledAfterDays default on the backend.
const STALLED_AFTER_DAYS = 7;
const OPEN_STATUSES = new Set([
  "DRAFT",
  "PENDING_APPROVAL",
  "SENT",
  "UNDER_NEGOTIATION",
  "APPROVED",
]);

// Single source of truth for "stalled", so the row badge and the Stalled filter
// can never disagree. Mirrors backend getQuotations(stalled=true): inactive beyond
// the threshold AND still in an open (non-terminal) status.
const inactiveDays = (q, nowTs) =>
  Math.floor(
    (nowTs - new Date(q.lastActivityAt || q.createdAt).getTime()) / (24 * 60 * 60 * 1000)
  );
const isStalledQuotation = (q, nowTs) =>
  OPEN_STATUSES.has(q.status) && inactiveDays(q, nowTs) >= STALLED_AFTER_DAYS;

export default function QuotationsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [quotations, setQuotations] = useState([]);
  // Timestamp of the last successful fetch; anchors the stalled-deal cutoff
  // so filtering stays pure across re-renders.
  const [loadedAt, setLoadedAt] = useState(null);
  const [salesReps, setSalesReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Search, Filter & Group By State
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState({
    status: [],
    salesRepId: "",
    tier: [],
    anomaly: "",
  });
  const [activeGroupBy, setActiveGroupBy] = useState("");
  const [viewMode, setViewMode] = useState("kanban"); // 'kanban' | 'table'

  // Selection state
  const [selectedIds, setSelectedIds] = useState(new Set());

  const isManagerOrAdmin =
    user?.role === "SALES_MANAGER" || user?.role === "ADMIN" || user?.role === "FINANCE";

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const fetchQuotations = async () => {
    setLoading(true);
    setError("");
    try {
      // Backend automatically applies role scoping (sales rep sees only their own quotes)
      const res = await apiClient.get("/quotations");
      const data = res.quotations || [];
      setQuotations(data);
      setLoadedAt(Date.now());

      if (isManagerOrAdmin) {
        const repMap = new Map();
        data.forEach((q) => {
          if (q.salesRep?.id) {
            repMap.set(q.salesRep.id, q.salesRep);
          }
        });
        setSalesReps(Array.from(repMap.values()));
      }
    } catch (err) {
      setError(err.message || "Failed to load quotations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchQuotations();
    }
  }, [isAuthenticated]);

  // Build client-side B-Tree Search Index
  const btreeIndex = useMemo(() => {
    const index = new BTreeSearchIndex({ degree: 3 });
    quotations.forEach((q) => {
      index.insertRecord(q.id, {
        quotationNumber: q.quotationNumber,
        customerName: q.customer?.name || "",
        customerEmail: q.customer?.contactEmail || "",
        salesRepName: q.salesRep?.fullName || "",
        salesRepEmail: q.salesRep?.email || "",
        status: q.status || "",
        tier: q.customerTier?.name || q.customerTier?.code || "",
      });
    });
    return index;
  }, [quotations]);

  // Filter and Search Pipeline
  const filteredQuotations = useMemo(() => {
    let result = quotations;

    // 1. Fast B-Tree Search Index Query
    if (searchTerm.trim()) {
      const matchIds = btreeIndex.query(searchTerm.trim());
      result = result.filter((q) => matchIds.has(q.id));
    }

    // 2. Status Filter
    if (activeFilters.status && activeFilters.status.length > 0) {
      const statusSet = new Set(activeFilters.status);
      result = result.filter((q) => statusSet.has(q.status));
    }

    // 3. Sales Rep Filter
    if (activeFilters.salesRepId) {
      result = result.filter((q) => q.salesRep?.id === activeFilters.salesRepId);
    }

    // 4. Tier Filter
    if (activeFilters.tier && activeFilters.tier.length > 0) {
      const tierSet = new Set(activeFilters.tier);
      result = result.filter(
        (q) => tierSet.has(q.customerTier?.code) || tierSet.has(q.customerTier?.name)
      );
    }

    // 5. Anomaly / Violation Filter
    if (activeFilters.anomaly === "LOW_MARGIN") {
      result = result.filter((q) => Number(q.marginPercent) < 15);
    } else if (activeFilters.anomaly === "CEILING_BREACH") {
      result = result.filter((q) => Number(q.worstLineOverage) > 0);
    } else if (activeFilters.anomaly === "STALLED") {
      result = result.filter((q) => isStalledQuotation(q, loadedAt ?? 0));
    }

    return result;
  }, [quotations, searchTerm, activeFilters, btreeIndex, loadedAt]);

  // Selection scoped to the current view. Filters must never leave hidden rows
  // selected: batch actions and counts would then act on records the user cannot see.
  const visibleSelectedIds = useMemo(
    () => new Set(filteredQuotations.filter((q) => selectedIds.has(q.id)).map((q) => q.id)),
    [filteredQuotations, selectedIds]
  );

  // Multi-select helpers
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = (visibleIds) => {
    setSelectedIds((prev) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleSelectAllVisible = () => {
    const all = new Set(filteredQuotations.map((q) => q.id));
    setSelectedIds(all);
  };

  // CSV Export Action
  const handleExportSelected = () => {
    const selectedRows = filteredQuotations.filter((q) => visibleSelectedIds.has(q.id));
    if (selectedRows.length === 0) return;

    exportToCSV(
      selectedRows,
      [
        { key: "quotationNumber", label: "Quotation #" },
        { key: "customer", label: "Customer Name", formatter: (_, r) => r.customer?.name || "" },
        { key: "email", label: "Customer Email", formatter: (_, r) => r.customer?.contactEmail || "" },
        { key: "salesRep", label: "Sales Rep", formatter: (_, r) => r.salesRep?.fullName || "Unassigned" },
        { key: "tier", label: "Tier", formatter: (_, r) => r.customerTier?.code || "" },
        { key: "status", label: "Status" },
        { key: "grandTotal", label: "Grand Total (₹)", formatter: (v) => Number(v).toFixed(2) },
        { key: "marginPercent", label: "Margin %", formatter: (v) => `${Number(v).toFixed(1)}%` },
        { key: "worstLineOverage", label: "Worst Overage", formatter: (v) => Number(v).toFixed(1) },
        { key: "createdAt", label: "Date", formatter: (v) => new Date(v).toISOString().split("T")[0] },
      ],
      `quotations_export_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  // Filtered selections
  const selectedRows = useMemo(
    () => filteredQuotations.filter((q) => visibleSelectedIds.has(q.id)),
    [filteredQuotations, visibleSelectedIds]
  );
  const selectedDrafts = useMemo(
    () => selectedRows.filter((q) => q.status === "DRAFT"),
    [selectedRows]
  );
  const selectedPending = useMemo(
    () => selectedRows.filter((q) => q.status === "PENDING_APPROVAL"),
    [selectedRows]
  );
  const selectedDeletables = useMemo(
    () => selectedRows.filter((q) => ["DRAFT", "REJECTED", "CANCELLED"].includes(q.status)),
    [selectedRows]
  );

  // Batch Submit Drafts
  const handleBatchSubmit = async () => {
    if (!confirm(`Submit ${selectedDrafts.length} draft quotation(s) for governance evaluation?`)) return;
    setLoading(true);
    setError("");
    try {
      for (const q of selectedDrafts) {
        await apiClient.post(`/quotations/${q.id}/submit`);
      }
      setSelectedIds(new Set());
      await fetchQuotations();
    } catch (err) {
      setError(err.message || "Failed during batch submit");
    } finally {
      setLoading(false);
    }
  };

  // Batch Approve Pending (Manager / Admin)
  const handleBatchApprove = async () => {
    if (!confirm(`Approve ${selectedPending.length} pending quotation(s)?`)) return;
    setLoading(true);
    setError("");
    try {
      for (const q of selectedPending) {
        const full = await apiClient.get(`/quotations/${q.id}`);
        const cycles = full.quotation?.approvals || [];
        const activeCycle = cycles.find((c) => c.status === "PENDING") || cycles[0];
        const activeStep = activeCycle?.steps?.find((s) => s.status === "PENDING");
        if (activeStep?.id) {
          await apiClient.post(`/approvals/steps/${activeStep.id}/approve`, {
            reason: "Batch approved from Quotations Pipeline",
          });
        }
      }
      setSelectedIds(new Set());
      await fetchQuotations();
    } catch (err) {
      setError(err.message || "Failed during batch approval");
    } finally {
      setLoading(false);
    }
  };

  // Batch Reject Pending (Manager / Admin)
  const handleBatchReject = async () => {
    const reason = prompt(
      `Enter reason for rejecting ${selectedPending.length} pending quotation(s):`,
      "Discount rejected in batch pipeline review"
    );
    if (reason === null) return;
    setLoading(true);
    setError("");
    try {
      for (const q of selectedPending) {
        const full = await apiClient.get(`/quotations/${q.id}`);
        const cycles = full.quotation?.approvals || [];
        const activeCycle = cycles.find((c) => c.status === "PENDING") || cycles[0];
        const activeStep = activeCycle?.steps?.find((s) => s.status === "PENDING");
        if (activeStep?.id) {
          await apiClient.post(`/approvals/steps/${activeStep.id}/reject`, {
            reason: reason.trim() || "Discount rejected in batch pipeline review",
          });
        }
      }
      setSelectedIds(new Set());
      await fetchQuotations();
    } catch (err) {
      setError(err.message || "Failed during batch rejection");
    } finally {
      setLoading(false);
    }
  };

  // Batch Delete Quotes
  const handleBatchDelete = async () => {
    if (!confirm(`Delete ${selectedDeletables.length} selected quotation(s)? This action cannot be undone.`)) return;
    setLoading(true);
    setError("");
    try {
      for (const q of selectedDeletables) {
        await apiClient.delete(`/quotations/${q.id}`);
      }
      setSelectedIds(new Set());
      await fetchQuotations();
    } catch (err) {
      setError(err.message || "Failed during batch delete");
    } finally {
      setLoading(false);
    }
  };

  const statusColors = {
    DRAFT: "gray",
    PENDING_APPROVAL: "warning",
    APPROVED: "success",
    SENT: "info",
    UNDER_NEGOTIATION: "warning",
    REJECTED: "danger",
    CONFIRMED: "neutral",
    CANCELLED: "danger",
    EXPIRED: "gray",
  };

  const tierColors = {
    GOLD: "warning",
    SILVER: "neutral",
    BRONZE: "gray",
  };

  // Control Panel Filter Groups
  const filterGroups = [
    {
      label: "Status",
      key: "status",
      options: [
        { label: "Draft", value: "DRAFT" },
        { label: "Pending Approval", value: "PENDING_APPROVAL" },
        { label: "Approved", value: "APPROVED" },
        { label: "Sent to Customer", value: "SENT" },
        { label: "Under Negotiation", value: "UNDER_NEGOTIATION" },
        { label: "Confirmed", value: "CONFIRMED" },
        { label: "Rejected", value: "REJECTED" },
        { label: "Cancelled", value: "CANCELLED" },
        { label: "Expired", value: "EXPIRED" },
      ],
    },
    {
      label: "Customer Tier",
      key: "tier",
      options: [
        { label: "Gold", value: "GOLD" },
        { label: "Silver", value: "SILVER" },
        { label: "Bronze", value: "BRONZE" },
      ],
    },
    {
      label: "Governance Health",
      key: "anomaly",
      options: [
        { label: "Low Margin (< 15%)", value: "LOW_MARGIN" },
        { label: "Ceiling Breached (> 0 pts)", value: "CEILING_BREACH" },
        { label: "⚠️ Stalled Deals (7d+ inactive)", value: "STALLED" },
      ],
    },
  ];

  if (isManagerOrAdmin && salesReps.length > 0) {
    filterGroups.push({
      label: "Sales Rep",
      key: "salesRepId",
      options: salesReps.map((rep) => ({
        label: rep.fullName || rep.email,
        value: rep.id,
      })),
    });
  }

  const groupByOptions = [
    { label: "Status", value: "status" },
    { label: "Customer", value: "customer.name" },
    { label: "Sales Rep", value: "salesRep.fullName" },
    { label: "Customer Tier", value: "customerTier.code" },
  ];

  return (
    <AppShell>
      {/* Top Navigation */}
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-30 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3">
          <SidebarToggleButton />
          <span className="font-bold text-base text-[#212529]">
            Quotations Pipeline
          </span>
          <span className="text-[#CED4DA]">/</span>
          <span className="text-xs text-[#6C757D] font-medium">
            {viewMode === "kanban" ? "Kanban Board" : "Detailed List"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Kanban / Table Toggle */}
          <div className="flex items-center bg-[#F1F3F5] p-1 rounded-lg border border-[#DEE2E6]">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                viewMode === "kanban"
                  ? "bg-[#714B67] text-white shadow-xs"
                  : "text-[#495057] hover:text-[#212529]"
              }`}
            >
              <span>▦</span>
              <span>Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                viewMode === "table"
                  ? "bg-[#714B67] text-white shadow-xs"
                  : "text-[#495057] hover:text-[#212529]"
              }`}
            >
              <span>☰</span>
              <span>Table</span>
            </button>
          </div>

          <span className="text-xs px-2.5 py-1 rounded bg-[#F3EEF2] text-[#714B67] font-semibold border border-[#714B67]/20">
            {user?.role || "User"}
          </span>

          <Link href="/quotations/new">
            <Button variant="primary" size="sm" className="font-semibold shadow-xs">
              + New Quotation
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-4">
        {/* Header Title & Refresh */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#212529]">
              Quotations Pipeline
            </h1>
            <p className="text-xs text-[#6C757D] mt-0.5">
              {user?.role === "SALES_REP"
                ? "Your authored quotations, live discount discipline, and margin health"
                : "All team quotations across sales reps, policy compliance, and approval status"}
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={fetchQuotations}
            className="text-xs self-start sm:self-auto"
          >
            ↻ Refresh Data
          </Button>
        </div>

        {/* Odoo Enterprise Control Panel (Search, Filters, Group By) */}
        <OdooControlPanel
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          placeholder="Search by quote #, customer, sales rep, or status."
          filterGroups={filterGroups}
          activeFilters={activeFilters}
          onFilterChange={(key, val) =>
            setActiveFilters((prev) => ({ ...prev, [key]: val }))
          }
          groupByOptions={groupByOptions}
          activeGroupBy={activeGroupBy}
          onGroupByChange={setActiveGroupBy}
          totalCount={quotations.length}
          filteredCount={filteredQuotations.length}
          onResetAll={() => {
            setSearchTerm("");
            setActiveFilters({
              status: [],
              salesRepId: "",
              tier: [],
              anomaly: "",
            });
            setActiveGroupBy("");
          }}
        />

        {/* Batch Action Bar (Appears when 1+ checkboxes selected) */}
        {(() => {
          const batchActions = [];
          if (selectedDrafts.length > 0) {
            batchActions.push({
              label: `Submit Drafts (${selectedDrafts.length})`,
              icon: "🚀",
              onClick: handleBatchSubmit,
              variant: "primary",
            });
          }
          if (isManagerOrAdmin && selectedPending.length > 0) {
            batchActions.push({
              label: `Approve (${selectedPending.length})`,
              icon: "✓",
              onClick: handleBatchApprove,
              variant: "primary",
            });
            batchActions.push({
              label: `Reject (${selectedPending.length})`,
              icon: "✕",
              onClick: handleBatchReject,
              variant: "danger",
            });
          }
          if (selectedDeletables.length > 0) {
            batchActions.push({
              label: `Delete (${selectedDeletables.length})`,
              icon: "🗑️",
              onClick: handleBatchDelete,
              variant: "danger",
            });
          }
          batchActions.push({
            label: "Export Selected (CSV)",
            icon: "📥",
            onClick: handleExportSelected,
            variant: "secondary",
          });

          return (
            <BatchActionBar
              selectedCount={visibleSelectedIds.size}
              totalCount={filteredQuotations.length}
              onSelectAll={handleSelectAllVisible}
              onClearSelection={handleClearSelection}
              actions={batchActions}
            />
          );
        })()}

        {error && (
          <div className="p-3 text-xs bg-[#DC3545]/10 border border-[#DC3545]/30 text-[#DC3545] rounded-[6px]">
            {error}
          </div>
        )}

        {/* Content View: Kanban or Table */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-[#6C757D]">Loading quotations...</p>
          </div>
        ) : viewMode === "kanban" ? (
          <QuotationsKanban
            quotations={filteredQuotations}
            onSwitchToTable={() => setViewMode("table")}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setViewMode("kanban")}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#714B67]/10 text-[#714B67] hover:bg-[#714B67]/20 border border-[#714B67]/30 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>▦</span>
                <span>Switch to Kanban View</span>
              </button>
            </div>
            <GroupedTable
              headers={[
                { label: "Quote Number", key: "quotationNumber", className: "w-36" },
                { label: "Customer", key: "customer.name" },
                { label: "Sales Rep", key: "salesRep.fullName" },
                { label: "Customer Tier", key: "customerTier.code", className: "w-28" },
                { label: "Status", key: "status", className: "w-36" },
                { label: "Lines", key: "_count.lines", className: "w-20 text-center" },
                { label: "Grand Total", key: "grandTotal", className: "w-32" },
                { label: "Margin", key: "marginPercent", className: "w-24" },
                { label: "Worst Overage", key: "worstLineOverage", className: "w-28" },
                { label: "Last Activity", key: "lastActivityAt", className: "w-28" },
              ]}
              data={filteredQuotations}
              getId={(q) => q.id}
              selectedIds={visibleSelectedIds}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
              groupBy={activeGroupBy}
              aggregateCols={[
                {
                  key: "grandTotal",
                  label: "Sum",
                  type: "sum",
                  formatter: (val) => `₹${Number(val).toLocaleString()}`,
                },
                {
                  key: "marginPercent",
                  label: "Avg Margin",
                  type: "avg",
                  formatter: (val) => `${Number(val).toFixed(1)}%`,
                },
              ]}
              emptyMessage="No quotations found matching your search and filter criteria."
              renderRow={(q, isSelected, toggleSelect) => (
                <tr
                  key={q.id}
                  onClick={() => router.push(`/quotations/${q.id}`)}
                  className={`hover:bg-[#F8F9FA] transition-colors cursor-pointer ${
                    isSelected ? "bg-[#714B67]/5" : ""
                  }`}
                >
                  <td
                    className="py-3 px-3 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={toggleSelect}
                      className="w-4 h-4 accent-[#714B67] rounded cursor-pointer"
                    />
                  </td>
                  <td className="py-3 px-4 font-bold text-[#714B67]">
                    {q.quotationNumber}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-[#212529]">
                      {q.customer?.name}
                    </div>
                    <div className="text-[11px] text-[#6C757D]">
                      {q.customer?.contactEmail}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-xs text-[#212529]">
                      {q.salesRep?.fullName || "Unassigned"}
                    </div>
                    <div className="text-[11px] text-[#6C757D]">
                      {q.salesRep?.email}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge
                      variant={tierColors[q.customerTier?.code] || "neutral"}
                      size="sm"
                    >
                      {q.customerTier?.name || q.customerTier?.code}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge
                        variant={statusColors[q.status] || "neutral"}
                        size="sm"
                      >
                        {q.status}
                      </Badge>
                      {(() => {
                        const daysInactive = inactiveDays(q, loadedAt ?? 0);
                        return isStalledQuotation(q, loadedAt ?? 0) ? (
                          <Badge variant="danger" size="sm" title={`Inactive for ${daysInactive} days`}>
                            Stalled ({daysInactive}d)
                          </Badge>
                        ) : null;
                      })()}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-[#6C757D] text-center font-medium">
                    {q._count?.lines || q.lines?.length || 0}
                  </td>
                  <td className="py-3 px-4 font-bold text-[#212529]">
                    ₹{Number(q.grandTotal).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`font-bold text-xs ${
                        Number(q.marginPercent) < 15
                          ? "text-[#DC3545]"
                          : "text-[#28A745]"
                      }`}
                    >
                      {Number(q.marginPercent).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {Number(q.worstLineOverage) > 0 ? (
                      <Badge variant="danger" size="sm">
                        +{Number(q.worstLineOverage).toFixed(1)} pts
                      </Badge>
                    ) : (
                      <Badge variant="success" size="sm">
                        Compliant
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-[#6C757D]">
                    {new Date(q.lastActivityAt || q.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              )}
            />
          </div>
        )}
      </main>
    </AppShell>
  );
}


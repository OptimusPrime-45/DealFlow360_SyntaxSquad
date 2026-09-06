"use client";

/**
 * Manager Command Center & Deal Health Hub — §9 steps 3 and 5 + Hero Feature 1 & 2.
 *
 * Sales Manager / Approver responsibilities:
 * 1. Reviews and approves or rejects quotations exceeding discount thresholds (Pending Approvals).
 * 2. Monitors deal health dashboard for at-risk and stalled deals (Stalled Quotations & Deal Health).
 * 3. Configures discount tiers and approval chains (accessible via Backend Configuration).
 *
 * Approvals queue is enhanced with B-Tree instant search, OdooControlPanel filters
 * (Risk Level, Sales Rep, Customer Tier), Group By dimensions, multi-select checkboxes,
 * and batch actions (Batch Approve & Export CSV).
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext.js";
import apiClient from "../../lib/apiClient.js";
import { Button, Card, Badge, Table, AppShell, ApprovalProcessLineView, SidebarToggleButton } from "../../components/ui/index.js";
import { OdooControlPanel } from "../../components/ui/OdooControlPanel.jsx";
import { BatchActionBar } from "../../components/ui/BatchActionBar.jsx";
import { BTreeSearchIndex } from "../../lib/btree.js";
import { exportToCSV } from "../../lib/exportCsv.js";

const money = (v) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => `${Number(v ?? 0).toFixed(2)}%`;

export default function ApprovalsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  // Tab navigation
  const [activeTab, setActiveTab] = useState("approvals"); // 'approvals' | 'stalled' | 'health'

  // Approvals queue state
  const [quotations, setQuotations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Deal health state
  const [dealHealth, setDealHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [daysThreshold, setDaysThreshold] = useState(7);
  const [signalFilter, setSignalFilter] = useState("ALL");

  // Search, Filter & Group By State (approvals queue)
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState({
    risk: [],
    salesRepId: "",
    tier: [],
  });
  const [activeGroupBy, setActiveGroupBy] = useState("");

  // Multi-Select Checkboxes State
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  // Load approval queue
  const loadQueue = useCallback(async () => {
    try {
      const data = await apiClient.get("/quotations?status=PENDING_APPROVAL");
      setQuotations(data.quotations || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load deal health & stalled quotations
  const loadDealHealth = useCallback(async (threshold) => {
    setHealthLoading(true);
    try {
      const d = threshold || daysThreshold;
      const res = await apiClient.get(`/quotations/deal-health?days=${d}`);
      setDealHealth(res || null);
    } catch (err) {
      console.error("Deal health fetch error:", err);
    } finally {
      setHealthLoading(false);
    }
  }, [daysThreshold]);

  useEffect(() => {
    if (isAuthenticated) {
      loadQueue();
      loadDealHealth(daysThreshold);
    }
  }, [isAuthenticated, loadQueue, loadDealHealth, daysThreshold]);

  const handleThresholdChange = (days) => {
    setDaysThreshold(days);
    loadDealHealth(days);
  };

  const openQuotation = async (q) => {
    setSelected(q);
    setDetail(null);
    setReason("");
    setNotice("");
    try {
      const [full, history] = await Promise.all([
        apiClient.get(`/quotations/${q.id}`),
        apiClient.get(`/approvals/quotation/${q.id}/history`).catch(() => null),
      ]);
      setDetail({ quotation: full.quotation, history });
    } catch (err) {
      setError(err.message);
    }
  };

  const act = async (stepId, action, customReason) => {
    const finalReason = (customReason !== undefined ? customReason : reason).trim();
    if (action !== "approve" && !finalReason) {
      setError("A reason is required when rejecting or returning a quotation.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await apiClient.post(`/approvals/steps/${stepId}/${action}`, {
        reason: finalReason || "Approved after review",
      });
      if (action === "approve") {
        setNotice(
          res.cycleCompleted
            ? "Final approval granted! Quotation is now APPROVED and ready for customer acceptance."
            : "Step approved! Quotation has been escalated to Finance for secondary authorization."
        );
      } else if (action === "reject") {
        setNotice("Quotation rejected. Status changed to REJECTED (open for changes and negotiation).");
      } else {
        setNotice("Quotation returned to sales rep for revision.");
      }
      setReason("");
      await loadQueue();
      await loadDealHealth(daysThreshold);
      if (selected) await openQuotation(selected);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const nudgeRep = (quotation) => {
    setNotice(
      `Nudge alert dispatched to ${quotation.salesRep?.fullName || "the sales rep"} for deal ${quotation.quotationNumber}! Requested activity update within 24 hours.`
    );
  };

  // Active approval cycle calculation
  const cycles =
    detail?.history?.cycles ||
    detail?.history?.approvals ||
    detail?.history?.history ||
    detail?.quotation?.approvals ||
    [];
  const activeCycle =
    Array.isArray(cycles) ? cycles.find((c) => c.status === "PENDING") || cycles[0] : null;
  const findings = activeCycle?.findings;
  const findingRows = Array.isArray(findings) ? findings : findings?.lines || [];

  const stalledQuotations = dealHealth?.stalledQuotations || [];
  const atRiskQuotations = dealHealth?.atRiskQuotations || [];
  const summary = dealHealth?.summary || {
    stalledCount: 0,
    stalledTotalValue: 0,
    atRiskCount: 0,
    atRiskTotalValue: 0,
    criticalRiskCount: 0,
    stalledThresholdDays: daysThreshold,
  };

  // Filter at-risk deals by signal
  const filteredAtRisk = atRiskQuotations.filter((q) => {
    if (signalFilter === "ALL") return true;
    if (signalFilter === "CRITICAL") return q.healthStatus === "CRITICAL";
    return q.signals.some((s) => s.signalType === signalFilter);
  });

  const btreeIndex = useMemo(() => {
    const index = new BTreeSearchIndex({ degree: 3 });
    quotations.forEach((q) => {
      index.insertRecord(q.id, {
        quoteNo: q.quotationNumber || "",
        customer: q.customer?.name || "",
        email: q.customer?.contactEmail || "",
        rep: q.salesRep?.fullName || "",
        tier: q.customerTier?.name || q.customerTier?.code || "",
      });
    });
    return index;
  }, [quotations]);

  // Unique sales reps in the pending queue
  const queueSalesReps = useMemo(() => {
    const map = new Map();
    quotations.forEach((q) => {
      if (q.salesRep?.id) {
        map.set(q.salesRep.id, q.salesRep);
      }
    });
    return Array.from(map.values());
  }, [quotations]);

  // Filtered & Searched Quotations
  const filteredQuotations = useMemo(() => {
    let result = quotations;

    // 1. B-Tree Text Query
    if (searchTerm.trim()) {
      const matchIds = btreeIndex.query(searchTerm.trim());
      result = result.filter((q) => matchIds.has(q.id));
    }

    // 2. Risk Level Filter
    if (activeFilters.risk && activeFilters.risk.length > 0) {
      const riskSet = new Set(activeFilters.risk);
      result = result.filter((q) => {
        const overage = Number(q.worstLineOverage || 0);
        if (riskSet.has("LOW") && overage <= 0) return true;
        if (riskSet.has("MODERATE") && overage > 0 && overage <= 5) return true;
        if (riskSet.has("HIGH") && overage > 5) return true;
        return false;
      });
    }

    // 3. Sales Rep Filter
    if (activeFilters.salesRepId) {
      result = result.filter((q) => q.salesRep?.id === activeFilters.salesRepId);
    }

    // 4. Customer Tier Filter
    if (activeFilters.tier && activeFilters.tier.length > 0) {
      const tierSet = new Set(activeFilters.tier);
      result = result.filter(
        (q) => tierSet.has(q.customerTier?.code) || tierSet.has(q.customerTier?.name)
      );
    }

    return result;
  }, [quotations, searchTerm, activeFilters, btreeIndex]);

  // Selection scoped to the current view. Filters must never leave hidden rows
  // selected: batch actions and counts would then act on records the user cannot see.
  const visibleSelectedIds = useMemo(
    () => new Set(filteredQuotations.filter((q) => selectedIds.has(q.id)).map((q) => q.id)),
    [filteredQuotations, selectedIds]
  );

  // Grouping computation for Queue
  const groupedQuotations = useMemo(() => {
    if (!activeGroupBy) return null;

    const groups = new Map();
    filteredQuotations.forEach((q) => {
      let key = "Unspecified";
      if (activeGroupBy === "rep") key = q.salesRep?.fullName || "Unassigned";
      else if (activeGroupBy === "tier") key = q.customerTier?.name || q.customerTier?.code || "Standard";
      else if (activeGroupBy === "risk") {
        const overage = Number(q.worstLineOverage || 0);
        key = overage > 5 ? "High Risk (> 5 pts)" : overage > 0 ? "Moderate Risk (≤ 5 pts)" : "Low Risk";
      }

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(q);
    });

    return Array.from(groups.entries()).map(([groupKey, items]) => ({
      groupKey,
      items,
      totalValue: items.reduce((sum, item) => sum + Number(item.grandTotal || 0), 0),
    }));
  }, [filteredQuotations, activeGroupBy]);

  // Multi-Select Handlers
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedIds(new Set(filteredQuotations.map((q) => q.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Batch Approve Action
  const handleBatchApprove = async () => {
    if (!confirm(`Are you sure you want to approve ${visibleSelectedIds.size} selected quotations?`)) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const targetIds = Array.from(visibleSelectedIds);
      let successCount = 0;

      for (const quoteId of targetIds) {
        // Fetch details to find active step
        const full = await apiClient.get(`/quotations/${quoteId}`);
        const q = full.quotation;
        const cycles = q?.approvals || [];
        const activeCycle = cycles.find((c) => c.status === "PENDING") || cycles[0];
        const activeStep = activeCycle?.steps?.find((s) => s.status === "PENDING");

        if (activeStep?.id) {
          await apiClient.post(`/approvals/steps/${activeStep.id}/approve`, {
            reason: "Batch approved by Manager",
          });
          successCount++;
        }
      }

      setNotice(`Batch approval complete: ${successCount} quotation(s) successfully approved!`);
      setSelectedIds(new Set());
      await loadQueue();
      if (selected && targetIds.includes(selected.id)) {
        await openQuotation(selected);
      }
    } catch (err) {
      setError(err.message || "Failed during batch approval");
    } finally {
      setBusy(false);
    }
  };

  // Export Selected to CSV
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
        { key: "tier", label: "Tier", formatter: (_, r) => r.customerTier?.name || "" },
        { key: "grandTotal", label: "Grand Total (₹)", formatter: (v) => Number(v).toFixed(2) },
        { key: "blendedScore", label: "Blended Score", formatter: (v) => Number(v).toFixed(2) },
        { key: "worstLineOverage", label: "Worst Line Overage", formatter: (v) => Number(v).toFixed(2) },
      ],
      `pending_approvals_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const toggleGroupCollapse = (key) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Control Panel Definitions
  const filterGroups = [
    {
      label: "Risk / Overage Level",
      key: "risk",
      options: [
        { label: "High Risk (> 5 pts)", value: "HIGH" },
        { label: "Moderate Risk (≤ 5 pts)", value: "MODERATE" },
        { label: "Low Risk (Compliant)", value: "LOW" },
      ],
    },
    {
      label: "Customer Tier",
      key: "tier",
      options: [
        { label: "Gold", value: "Gold" },
        { label: "Silver", value: "Silver" },
        { label: "Bronze", value: "Bronze" },
      ],
    },
  ];

  if (queueSalesReps.length > 0) {
    filterGroups.push({
      label: "Sales Rep",
      key: "salesRepId",
      options: queueSalesReps.map((rep) => ({
        label: rep.fullName || rep.email,
        value: rep.id,
      })),
    });
  }

  const groupByOptions = [
    { label: "Sales Rep", value: "rep" },
    { label: "Customer Tier", value: "tier" },
    { label: "Risk Level", value: "risk" },
    { label: "None", value: "" },
  ];

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderQueueItem = (q) => {
    const isSelected = selected?.id === q.id;
    const isChecked = visibleSelectedIds.has(q.id);

    return (
      <div
        key={q.id}
        className={`w-full flex items-start gap-3 p-3.5 hover:bg-[#F8F9FA] transition border-b border-[#E9ECEF] ${
          isSelected ? "bg-[#F3EEF2] border-l-3 border-l-[#714B67]" : ""
        }`}
      >
        <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => handleToggleSelect(q.id)}
            className="w-4 h-4 accent-[#714B67] rounded cursor-pointer"
          />
        </div>
        <button
          type="button"
          onClick={() => openQuotation(q)}
          className="flex-1 text-left cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[#714B67]">{q.quotationNumber}</span>
            <span className="text-sm font-bold text-[#212529]">{money(q.grandTotal)}</span>
          </div>
          <div className="text-[11px] text-[#6C757D] mt-1 flex items-center justify-between">
            <span className="font-medium text-[#212529]">{q.customer?.name}</span>
            {q.salesRep?.fullName && (
              <span className="text-[#714B67] font-semibold">Rep: {q.salesRep.fullName}</span>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <Badge variant="warning" size="sm">
              blended {Number(q.blendedScore).toFixed(2)}
            </Badge>
            <Badge variant={Number(q.worstLineOverage) > 5 ? "danger" : "warning"} size="sm">
              worst +{Number(q.worstLineOverage).toFixed(1)} pts
            </Badge>
          </div>
        </button>
      </div>
    );
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const roleCode = typeof user?.role === "string" ? user.role : user?.role?.code;

  return (
    <AppShell>
      {/* Top Header */}
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-20 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-4">
          <SidebarToggleButton />
          <Link href="/" className="text-sm font-medium text-[#6C757D] hover:text-[#714B67] transition-colors">
            ← Workspace
          </Link>
          <div className="h-4 w-px bg-[#CED4DA]" />
          <div>
            <div className="font-bold text-base text-[#212529] tracking-tight">Manager Command Center</div>
            <div className="text-[11px] text-[#6C757D]">
              Approvals, Stalled Quotations & Deal Health Dashboard
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-[#212529]">{user?.fullName}</div>
            <div className="text-[10px] text-[#6C757D]">{user?.email}</div>
          </div>
          <Badge variant={roleCode === "SALES_MANAGER" ? "warning" : roleCode === "FINANCE" ? "info" : "danger"} size="sm">
            {roleCode}
          </Badge>
          <Button variant="secondary" size="sm" onClick={loadQueue} disabled={busy}>
            ↻ Refresh
          </Button>
          {(roleCode === "ADMIN" || roleCode === "SALES_MANAGER") && (
            <Link href="/admin/tiers" className="text-xs font-medium text-[#714B67] hover:underline ml-2 hidden md:inline">
              ⚙ Configure Tiers & Chains
            </Link>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DEE2E6] pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("approvals")}
              className={`px-4 py-2 text-xs font-semibold rounded-[6px] transition-all flex items-center gap-2 ${
                activeTab === "approvals"
                  ? "bg-[#714B67] text-white shadow-xs"
                  : "bg-white text-[#495057] hover:bg-[#E9ECEF] border border-[#CED4DA]"
              }`}
            >
              <span>Pending Approvals</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeTab === "approvals" ? "bg-white/20 text-white" : "bg-[#F8F9FA] text-[#212529] border border-[#CED4DA]"
                }`}
              >
                {filteredQuotations.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("stalled")}
              className={`px-4 py-2 text-xs font-semibold rounded-[6px] transition-all flex items-center gap-2 ${
                activeTab === "stalled"
                  ? "bg-[#E03131] text-white shadow-xs"
                  : "bg-white text-[#495057] hover:bg-[#E9ECEF] border border-[#CED4DA]"
              }`}
            >
              <span>⚠️ Stalled Quotations</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeTab === "stalled" ? "bg-white/20 text-white" : "bg-[#F8F9FA] text-[#E03131] font-bold border border-[#E03131]/30"
                }`}
              >
                {stalledQuotations.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("health")}
              className={`px-4 py-2 text-xs font-semibold rounded-[6px] transition-all flex items-center gap-2 ${
                activeTab === "health"
                  ? "bg-[#FD7E14] text-white shadow-xs"
                  : "bg-white text-[#495057] hover:bg-[#E9ECEF] border border-[#CED4DA]"
              }`}
            >
              <span>Deal Health Dashboard</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeTab === "health" ? "bg-white/20 text-white" : "bg-[#F8F9FA] text-[#FD7E14] font-bold border border-[#FD7E14]/30"
                }`}
              >
                {atRiskQuotations.length} At Risk
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#6C757D]">
            <span>Inactivity Threshold:</span>
            <div className="flex items-center border border-[#CED4DA] rounded-[6px] bg-white overflow-hidden">
              {[3, 7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => handleThresholdChange(d)}
                  className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    daysThreshold === d
                      ? "bg-[#714B67] text-white"
                      : "text-[#495057] hover:bg-[#F8F9FA]"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Global Notifications */}
        {error && (
          <div className="bg-[#FDECEA] border border-[#DC3545]/30 text-[#842029] text-sm rounded-[8px] px-4 py-3 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="text-xs font-bold text-[#842029]">✕</button>
          </div>
        )}
        {notice && (
          <div className="bg-[#E7F5EC] border border-[#28A745]/30 text-[#155724] text-sm rounded-[8px] px-4 py-3 flex items-center justify-between">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} className="text-xs font-bold text-[#155724]">✕</button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: PENDING APPROVALS QUEUE                                     */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "approvals" && (
          <>
          {/* Odoo Control Panel for Approvals */}
          <OdooControlPanel
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            placeholder="Search pending approvals by quote #, customer, or sales rep (B-Tree indexed)..."
            filterGroups={filterGroups}
            activeFilters={activeFilters}
            onFilterChange={(key, val) => setActiveFilters((prev) => ({ ...prev, [key]: val }))}
            groupByOptions={groupByOptions}
            activeGroupBy={activeGroupBy}
            onGroupByChange={setActiveGroupBy}
            totalCount={quotations.length}
            filteredCount={filteredQuotations.length}
            onResetAll={() => {
              setSearchTerm("");
              setActiveFilters({ risk: [], salesRepId: "", tier: [] });
              setActiveGroupBy("");
            }}
          />

          {/* Batch Action Bar */}
          <BatchActionBar
            selectedCount={visibleSelectedIds.size}
            totalCount={filteredQuotations.length}
            onSelectAll={handleSelectAllVisible}
            onClearSelection={handleClearSelection}
            actions={[
              {
                label: `Batch Approve Selected (${visibleSelectedIds.size})`,
                icon: "✓",
                onClick: handleBatchApprove,
                variant: "primary",
              },
              {
                label: "Export Selected (CSV)",
                icon: "📥",
                onClick: handleExportSelected,
                variant: "secondary",
              },
            ]}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* ── Queue Column (1 col) ── */}
            <Card
              title="Awaiting Approval"
              subtitle={`${filteredQuotations.length} quotes pending`}
              padding="p-0"
              action={
                filteredQuotations.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    className="text-xs text-[#714B67] hover:underline font-semibold"
                  >
                    {visibleSelectedIds.size === filteredQuotations.length ? "Deselect All" : "Select All"}
                  </button>
                )
              }
            >
              <div>
                {filteredQuotations.length === 0 ? (
                  <p className="text-xs text-[#6C757D] p-4 text-center">
                    No quotations match the active search and filter criteria.
                  </p>
                ) : !groupedQuotations ? (
                  // Flat list
                  filteredQuotations.map(renderQueueItem)
                ) : (
                  // Grouped list
                  groupedQuotations.map((group) => {
                    const isCollapsed = collapsedGroups.has(group.groupKey);
                    return (
                      <div key={group.groupKey} className="border-b border-[#CED4DA]">
                        <div
                          onClick={() => toggleGroupCollapse(group.groupKey)}
                          className="bg-[#F8F9FA] px-3 py-2 flex items-center justify-between cursor-pointer select-none hover:bg-[#EDF2F7] transition-colors border-t"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#714B67] font-bold">
                              {isCollapsed ? "▶" : "▼"}
                            </span>
                            <span className="font-bold text-xs text-[#212529]">{group.groupKey}</span>
                            <Badge variant="neutral" size="sm">{group.items.length}</Badge>
                          </div>
                          <span className="text-xs font-bold text-[#212529]">
                            {money(group.totalValue)}
                          </span>
                        </div>
                        {!isCollapsed && group.items.map(renderQueueItem)}
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* Right Column: Approval Process Line View matching Image 2 */}
            <div className="lg:col-span-2 space-y-5">
              {!detail ? (
                <Card>
                  <div className="p-12 text-center text-sm text-[#6C757D]">
                    <div className="text-3xl mb-3">🛡️</div>
                    <div className="font-semibold text-base text-[#212529] mb-1">
                      Select a quotation to open Approval Detail
                    </div>
                    <p className="text-xs text-[#6C757D] max-w-sm mx-auto">
                      Click any quotation from the list on the left to inspect line-level ceiling breaches, stage stepper flow, and record decision actions.
                    </p>
                  </div>
                </Card>
              ) : (
                <ApprovalProcessLineView
                  quotation={detail.quotation}
                  history={detail.history}
                  currentUserRole={roleCode}
                  busy={busy}
                  onApprove={(stepId, note) => act(stepId, "approve", note)}
                  onReject={(stepId, note) => act(stepId, "reject", note)}
                  onReturn={(stepId, note) => act(stepId, "return", note)}
                />
              )}
            </div>
          </div>
          </>


        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: STALLED QUOTATIONS MONITOR                                   */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "stalled" && (
          <div className="space-y-5">
            <div className="bg-[#FFF5F5] border border-[#FF8787]/40 rounded-[8px] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-[#C92A2A] flex items-center gap-2">
                  <span>⚠️ Deals Stalled Beyond Inactivity Threshold ({daysThreshold} Days)</span>
                </div>
                <div className="text-xs text-[#495057] mt-0.5">
                  Quotations with zero commercial progress for over {daysThreshold} days. Stalled quotations lose win-rate momentum and require manager intervention or rep re-engagement.
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div className="text-[10px] uppercase font-semibold text-[#868E96]">Stalled Value</div>
                  <div className="text-base font-bold text-[#C92A2A]">{money(summary.stalledTotalValue)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-semibold text-[#868E96]">Stalled Count</div>
                  <div className="text-base font-bold text-[#212529]">{summary.stalledCount}</div>
                </div>
              </div>
            </div>

            <Card padding="p-0">
              <Table headers={["Quotation #", "Customer", "Assigned Sales Rep", "Deal Stage", "Total Value", "Margin", "Inactivity Duration", "Actions"]}>
                {stalledQuotations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-xs text-[#6C757D]">
                      ✓ No stalled quotations detected! All active quotations have had activity within the past {daysThreshold} days.
                    </td>
                  </tr>
                )}
                {stalledQuotations.map((q) => (
                  <tr key={q.id} className="border-t border-[#E9ECEF] hover:bg-[#FFF9F9] transition-colors">
                    <td className="px-4 py-3 text-xs font-bold text-[#714B67]">
                      <Link href={`/quotations/${q.id}`} className="hover:underline">
                        {q.quotationNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#212529]">
                      <div className="font-semibold">{q.customer?.name}</div>
                      <div className="text-[10px] text-[#6C757D]">{q.customerTier?.name || "Standard Tier"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#495057]">
                      {q.salesRep?.fullName || "Unassigned"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          q.status === "PENDING_APPROVAL"
                            ? "warning"
                            : q.status === "UNDER_NEGOTIATION"
                            ? "danger"
                            : "neutral"
                        }
                        size="sm"
                      >
                        {q.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-[#212529]">
                      {money(q.grandTotal)}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#212529]">
                      {pct(q.marginPercent)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-[#DC3545]">
                          {q.daysInactive} days inactive
                        </span>
                        <span className="text-[10px] text-[#868E96]">
                          Threshold: &gt; {daysThreshold}d
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-[11px] py-1 px-2"
                          onClick={() => nudgeRep(q)}
                        >
                          Nudge Rep
                        </Button>
                        <Link href={`/quotations/${q.id}`}>
                          <Button variant="primary" size="sm" className="text-[11px] py-1 px-2.5">
                            Open Deal
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: DEAL HEALTH DASHBOARD                                        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "health" && (
          <div className="space-y-6">
            {/* KPI Summary Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card padding="p-4" className="border-l-[4px] border-l-[#E03131]">
                <div className="text-[11px] font-semibold text-[#6C757D] uppercase tracking-wider">
                  Stalled Deals Pipeline
                </div>
                <div className="text-2xl font-bold text-[#E03131] mt-1">
                  {money(summary.stalledTotalValue)}
                </div>
                <div className="text-xs text-[#868E96] mt-0.5">
                  {summary.stalledCount} deal(s) inactive &gt; {daysThreshold} days
                </div>
              </Card>

              <Card padding="p-4" className="border-l-[4px] border-l-[#FD7E14]">
                <div className="text-[11px] font-semibold text-[#6C757D] uppercase tracking-wider">
                  Total At-Risk Pipeline
                </div>
                <div className="text-2xl font-bold text-[#FD7E14] mt-1">
                  {money(summary.atRiskTotalValue)}
                </div>
                <div className="text-xs text-[#868E96] mt-0.5">
                  {summary.atRiskCount} quotation(s) with risk signals
                </div>
              </Card>

              <Card padding="p-4" className="border-l-[4px] border-l-[#DC3545]">
                <div className="text-[11px] font-semibold text-[#6C757D] uppercase tracking-wider">
                  Critical Severity Deals
                </div>
                <div className="text-2xl font-bold text-[#DC3545] mt-1">
                  {summary.criticalRiskCount}
                </div>
                <div className="text-xs text-[#868E96] mt-0.5">
                  Margin floor breaches &amp; severe stall
                </div>
              </Card>

              <Card padding="p-4" className="border-l-[4px] border-l-[#714B67]">
                <div className="text-[11px] font-semibold text-[#6C757D] uppercase tracking-wider">
                  Approval Queue Load
                </div>
                <div className="text-2xl font-bold text-[#714B67] mt-1">
                  {summary.pendingApprovalsCount}
                </div>
                <div className="text-xs text-[#868E96] mt-0.5">
                  Awaiting review decision
                </div>
              </Card>
            </div>

            {/* Signal Filter Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#495057] uppercase tracking-wider mr-1">
                Filter Signals:
              </span>
              {[
                { id: "ALL", label: `All At-Risk (${atRiskQuotations.length})` },
                { id: "CRITICAL", label: `Critical Only (${summary.criticalRiskCount})` },
                { id: "STALLED_DEAL", label: `Stalled Deals (${summary.stalledCount})` },
                { id: "MARGIN_FLOOR_BREACH", label: "Margin Floor Breaches" },
                { id: "DISCOUNT_ANOMALY", label: "Discount Anomalies" },
                { id: "APPROVAL_OVERDUE", label: "Approval Overdue" },
                { id: "DELIVERY_SLIPPAGE", label: "Delivery Slippage" },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setSignalFilter(filter.id)}
                  className={`px-3 py-1.5 text-xs rounded-[6px] transition-all font-medium ${
                    signalFilter === filter.id
                      ? "bg-[#212529] text-white shadow-xs"
                      : "bg-white text-[#495057] hover:bg-[#E9ECEF] border border-[#CED4DA]"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Deal Health Table */}
            <Card padding="p-0">
              <Table headers={["Quotation #", "Customer", "Rep", "Risk Severity", "Active Health Signals", "Total Value", "Margin", "Recommended Intervention", "Action"]}>
                {filteredAtRisk.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-xs text-[#6C757D]">
                      ✓ No at-risk quotations found matching the selected signal filter.
                    </td>
                  </tr>
                )}
                {filteredAtRisk.map((q) => (
                  <tr key={q.id} className="border-t border-[#E9ECEF] hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-4 py-3 text-xs font-bold text-[#714B67]">
                      <Link href={`/quotations/${q.id}`} className="hover:underline">
                        {q.quotationNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#212529]">
                      <div className="font-semibold">{q.customer?.name}</div>
                      <div className="text-[10px] text-[#6C757D]">{q.customerTier?.name || "Standard Tier"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#495057]">
                      {q.salesRep?.fullName || "Unassigned"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          q.healthStatus === "CRITICAL"
                            ? "danger"
                            : q.healthStatus === "HIGH_RISK"
                            ? "warning"
                            : "info"
                        }
                        size="sm"
                      >
                        {q.healthStatus.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 max-w-xs">
                        {q.signals.map((s, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-[11px] text-[#495057]">
                            <span
                              className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                                s.severity === "CRITICAL"
                                  ? "bg-[#DC3545]"
                                  : s.severity === "HIGH"
                                  ? "bg-[#FD7E14]"
                                  : "bg-[#FFC107]"
                              }`}
                            />
                            <span>{s.message}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-[#212529]">
                      {money(q.grandTotal)}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold">
                      <span className={Number(q.marginPercent) < 15 ? "text-[#DC3545]" : "text-[#212529]"}>
                        {pct(q.marginPercent)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#495057] max-w-xs">
                      {q.isStalled ? (
                        <span className="text-[#C92A2A] font-medium">Re-engage customer with updated commercial proposal</span>
                      ) : q.status === "PENDING_APPROVAL" ? (
                        <span className="text-[#FD7E14] font-medium">Prioritize manager review decision</span>
                      ) : Number(q.marginPercent) < 15 ? (
                        <span className="text-[#DC3545] font-medium">Adjust discounts to recover commercial margin floor</span>
                      ) : (
                        <span>Monitor negotiation velocity</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/quotations/${q.id}`}>
                        <Button variant="primary" size="sm" className="text-[11px] py-1 px-2.5">
                          Review
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        )}
      </main>
    </AppShell>
  );
}


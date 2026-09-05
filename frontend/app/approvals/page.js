"use client";

/**
 * Approval queue — §9 steps 3 and 5.
 * Enhanced with B-Tree instant search, OdooControlPanel filters (Risk Level, Sales Rep, Customer Tier),
 * Group By dimensions, Multi-Select Checkboxes, and Batch Actions (Batch Approve & Export CSV).
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext.js";
import apiClient from "../../lib/apiClient.js";
import { Button, Card, Badge, Table } from "../../components/ui/index.js";
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

  const [quotations, setQuotations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Search, Filter & Group By State
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

  useEffect(() => {
    if (isAuthenticated) loadQueue();
  }, [isAuthenticated, loadQueue]);

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

  const act = async (stepId, action) => {
    if (action !== "approve" && !reason.trim()) {
      setError("A reason is required when rejecting or returning a quotation.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await apiClient.post(`/approvals/steps/${stepId}/${action}`, {
        reason: reason.trim() || "Approved after review",
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
      if (selected) await openQuotation(selected);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Build client B-Tree Search Index
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
    if (!confirm(`Are you sure you want to approve ${selectedIds.size} selected quotations?`)) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const targetIds = Array.from(selectedIds);
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
    const selectedRows = filteredQuotations.filter((q) => selectedIds.has(q.id));
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

  // The cycle currently awaiting a decision
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

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderQueueItem = (q) => {
    const isSelected = selected?.id === q.id;
    const isChecked = selectedIds.has(q.id);

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

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-[#6C757D] hover:text-[#714B67] transition-colors">
            ← Workspace
          </Link>
          <div>
            <div className="font-bold text-base text-[#212529]">Approvals Queue</div>
            <div className="text-[11px] text-[#6C757D]">
              {quotations.length} quotation{quotations.length === 1 ? "" : "s"} awaiting a decision
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info" size="md">{user?.role}</Badge>
          <Button variant="secondary" size="sm" onClick={loadQueue}>
            ↻ Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-4">
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
          selectedCount={selectedIds.size}
          totalCount={filteredQuotations.length}
          onSelectAll={handleSelectAllVisible}
          onClearSelection={handleClearSelection}
          actions={[
            {
              label: `Batch Approve Selected (${selectedIds.size})`,
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

        {error && (
          <div className="bg-[#FDECEA] border border-[#DC3545]/30 text-[#842029] text-sm rounded-[8px] px-4 py-3">
            {error}
          </div>
        )}
        {notice && (
          <div className="bg-[#E7F5EC] border border-[#28A745]/30 text-[#155724] text-sm rounded-[8px] px-4 py-3">
            {notice}
          </div>
        )}

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
                  {selectedIds.size === filteredQuotations.length ? "Deselect All" : "Select All"}
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

          {/* ── Detail Column (2 cols) ── */}
          <div className="lg:col-span-2 space-y-5">
            {!detail && (
              <Card>
                <div className="py-12 text-center text-sm text-[#6C757D]">
                  <div className="text-2xl mb-2">📋</div>
                  Select a quotation from the queue to inspect line findings, overage triggers, and take approval action.
                </div>
              </Card>
            )}

            {detail && (
              <>
                <Card
                  title={`${detail.quotation.quotationNumber} — why this is on your desk`}
                  subtitle={`${detail.quotation.customer?.name} · ${detail.quotation.customerTier?.name || "Standard Tier"}${
                    detail.quotation.salesRep
                      ? ` · Assigned Rep: ${detail.quotation.salesRep.fullName} (${detail.quotation.salesRep.email})`
                      : ""
                  }`}
                >
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="text-[11px] uppercase text-[#6C757D]">Blended Score</div>
                      <div className="text-lg font-bold">
                        {Number(detail.quotation.blendedScore).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-[#6C757D]">Worst Line</div>
                      <div className="text-lg font-bold text-[#DC3545]">
                        +{Number(detail.quotation.worstLineOverage).toFixed(2)} pts
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-[#6C757D]">Order Total</div>
                      <div className="text-lg font-bold">{money(detail.quotation.grandTotal)}</div>
                    </div>
                  </div>

                  {activeCycle && (
                    <p className="text-xs text-[#6C757D] mb-3">
                      Approval cycle {activeCycle.approvalCycle} · triggered by{" "}
                      <strong>{String(activeCycle.triggeredBy).replace(/_/g, " ").toLowerCase()}</strong>
                    </p>
                  )}

                  <Table headers={["Line", "Discount", "Ceiling", "Over by"]}>
                    {(findingRows.length > 0 ? findingRows : detail.quotation.lines).map((f, i) => (
                      <tr key={f.lineId || f.id || i} className="border-t border-[#E9ECEF]">
                        <td className="py-2 px-3 font-medium text-xs">
                          {f.productName || f.product?.name || `Line #${i + 1}`}
                        </td>
                        <td className="py-2 px-3 text-xs">{pct(f.discountPercent)}</td>
                        <td className="py-2 px-3 text-xs text-[#6C757D]">
                          {pct(f.ceilingPercent ?? f.effectiveCeilingPercent)}
                        </td>
                        <td className="py-2 px-3 text-xs">
                          {Number(f.overagePts ?? f.overage ?? 0) > 0 ? (
                            <span className="text-[#DC3545] font-semibold">
                              +{Number(f.overagePts ?? f.overage ?? 0).toFixed(2)} pts
                            </span>
                          ) : (
                            <span className="text-[#28A745]">within ceiling</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                </Card>

                {/* ── Steps and Actions ── */}
                <Card title="Review Ladder &amp; Decisions">
                  {(!activeCycle || !activeCycle.steps || activeCycle.steps.length === 0) && (
                    <p className="text-xs text-[#6C757D]">No review steps are recorded for this cycle.</p>
                  )}

                  {activeCycle?.steps?.map((step) => {
                    const isPending = step.status === "PENDING";
                    const isActor =
                      user?.role === "ADMIN" ||
                      user?.role === step.role?.code ||
                      user?.roleId === step.roleId;

                    return (
                      <div
                        key={step.id}
                        className="border border-[#E9ECEF] rounded-[8px] p-4 mb-3 last:mb-0"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">
                              Step {step.stepOrder}: {step.role?.name || step.role?.code}
                            </span>
                            <Badge
                              variant={
                                step.status === "APPROVED"
                                  ? "success"
                                  : step.status === "REJECTED"
                                  ? "danger"
                                  : step.status === "RETURNED"
                                  ? "warning"
                                  : "neutral"
                              }
                              size="sm"
                            >
                              {step.status}
                            </Badge>
                          </div>
                          {step.actedAt && (
                            <span className="text-[11px] text-[#6C757D]">
                              {new Date(step.actedAt).toLocaleString()}
                            </span>
                          )}
                        </div>

                        {step.reviewer && (
                          <p className="text-xs text-[#6C757D] mb-2">
                            Reviewer: {step.reviewer.fullName} ({step.reviewer.email})
                          </p>
                        )}
                        {step.reason && (
                          <div className="text-xs bg-[#F8F9FA] rounded p-2 text-[#495057] mb-2">
                            <strong>Reason:</strong> {step.reason}
                          </div>
                        )}

                        {isPending && isActor && (
                          <div className="mt-3 pt-3 border-t border-[#E9ECEF] space-y-2">
                            <input
                              type="text"
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Reason / feedback (required for reject or return)..."
                              className="w-full text-xs px-3 py-2 border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67]"
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={busy}
                                onClick={() => act(step.id, "approve")}
                              >
                                Approve Step
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={busy}
                                onClick={() => act(step.id, "return")}
                              >
                                Return to Rep
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={busy}
                                onClick={() => act(step.id, "reject")}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Card>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

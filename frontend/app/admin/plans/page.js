"use client";

/**
 * Subscription Plans — Configured Recurring Plans & Pricing.
 * Features B-Tree search index, OdooControlPanel with interval/proration filters,
 * GroupedTable with multi-select checkboxes, BatchActionBar with CSV export,
 * and direct Start Date and End Date calendar selection for any plan duration (Monthly, Quarterly, Yearly).
 */

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import apiClient from "../../../lib/apiClient.js";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners } from "../../../components/admin/AdminUI.jsx";
import { OdooControlPanel } from "../../../components/ui/OdooControlPanel.jsx";
import { GroupedTable } from "../../../components/ui/GroupedTable.jsx";
import { BatchActionBar } from "../../../components/ui/BatchActionBar.jsx";
import { BTreeSearchIndex } from "../../../lib/btree.js";
import { exportToCSV } from "../../../lib/exportCsv.js";

const DURATION_OPTIONS = [
  { value: "MONTHLY", label: "Monthly (Billed Every Month)" },
  { value: "QUARTERLY", label: "Quarterly (Billed Every 3 Months)" },
  { value: "YEARLY", label: "Yearly (Billed Annually)" },
];

const EMPTY_PLAN_FORM = {
  productId: "",
  name: "",
  billingInterval: "MONTHLY",
  price: "",
  startDate: "",
  endDate: "",
  prorationEnabled: true,
  cancellationRefundPercent: 0,
};

export default function PlansPage() {
  const plans = useResource("/subscription-plans", "plans");
  const [products, setProducts] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState(EMPTY_PLAN_FORM);
  const [savingDateId, setSavingDateId] = useState(null);

  // Search, Filter & Group By
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState({
    interval: [],
  });
  const [activeGroupBy, setActiveGroupBy] = useState("billingInterval");

  // Multi-Select Checkboxes State
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Load subscription products for plan creation
  useEffect(() => {
    apiClient
      .get("/subscription-products")
      .then((res) => {
        const prods = res.data?.subscriptionProducts || res.data || [];
        setProducts(Array.isArray(prods) ? prods : []);
      })
      .catch(() => {
        // Fallback to standard product catalog
        apiClient
          .get("/products")
          .then((res) => {
            const list = (res.data?.products || res.products || []).filter(
              (p) => p.productType === "SUBSCRIPTION"
            );
            setProducts(list);
          })
          .catch(() => {});
      });
  }, []);

  // Build client B-Tree Search Index
  const btreeIndex = useMemo(() => {
    const index = new BTreeSearchIndex({ degree: 3 });
    plans.items.forEach((p) => {
      index.insertRecord(p.id, {
        name: p.name || "",
        sku: p.product?.sku || "",
        product: p.product?.name || "",
        interval: p.billingInterval || "",
        startDate: p.startDate ? new Date(p.startDate).toLocaleDateString() : "",
        endDate: p.endDate ? new Date(p.endDate).toLocaleDateString() : "",
      });
    });
    return index;
  }, [plans.items]);

  // Filtered Plans
  const filteredPlans = useMemo(() => {
    let result = plans.items;

    // 1. Fast B-Tree Query
    if (searchTerm.trim()) {
      const matchIds = btreeIndex.query(searchTerm.trim());
      result = result.filter((p) => matchIds.has(p.id));
    }

    // 2. Billing Interval Filter
    if (activeFilters.interval && activeFilters.interval.length > 0) {
      const intSet = new Set(activeFilters.interval);
      result = result.filter((p) => intSet.has(p.billingInterval));
    }

    return result;
  }, [plans.items, searchTerm, activeFilters, btreeIndex]);

  // Selection Handlers
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

  // Direct Date Update from Table Input
  const handleDateUpdate = async (planId, field, dateValue) => {
    setSavingDateId(planId);
    try {
      const isoDate = dateValue && dateValue.trim() ? new Date(dateValue).toISOString() : null;
      await plans.update(
        planId,
        { [field]: isoDate },
        `Plan ${field === "startDate" ? "start date" : "end date"} updated successfully`
      );
    } catch (err) {
      plans.setError(err.message || "Failed to update date");
    } finally {
      setSavingDateId(null);
    }
  };

  // Quick Preset Helper: calculate suggested end date from start date
  const setQuickEndDate = async (planId, startDateStr, interval) => {
    if (!startDateStr) return;
    const start = new Date(startDateStr);
    const end = new Date(start);
    if (interval === "MONTHLY") {
      end.setMonth(end.getMonth() + 1);
    } else if (interval === "QUARTERLY") {
      end.setMonth(end.getMonth() + 3);
    } else if (interval === "YEARLY") {
      end.setFullYear(end.getFullYear() + 1);
    }
    const endStr = end.toISOString().split("T")[0];
    await handleDateUpdate(planId, "endDate", endStr);
  };

  // Create Plan Submission
  const handleCreatePlan = async (e) => {
    e.preventDefault();
    if (!planForm.productId || !planForm.name || !planForm.price) return;

    const payload = {
      productId: planForm.productId,
      name: planForm.name.trim(),
      billingInterval: planForm.billingInterval,
      price: Number(planForm.price) || 0,
      prorationEnabled: !!planForm.prorationEnabled,
      cancellationRefundPercent: Number(planForm.cancellationRefundPercent) || 0,
      startDate: planForm.startDate ? new Date(planForm.startDate).toISOString() : null,
      endDate: planForm.endDate ? new Date(planForm.endDate).toISOString() : null,
      isActive: true,
    };

    const ok = await plans.create(payload, `Subscription plan "${planForm.name}" created`);
    if (ok) {
      setPlanForm(EMPTY_PLAN_FORM);
      setShowCreateModal(false);
    }
  };

  // Edit Plan Details Modal Submission
  const handleEditPlanSubmit = async (e) => {
    e.preventDefault();
    if (!editingPlan) return;

    const payload = {
      name: editingPlan.name.trim(),
      billingInterval: editingPlan.billingInterval,
      price: Number(editingPlan.price) || 0,
      prorationEnabled: !!editingPlan.prorationEnabled,
      cancellationRefundPercent: Number(editingPlan.cancellationRefundPercent) || 0,
      startDate: editingPlan.startDate ? new Date(editingPlan.startDate).toISOString() : null,
      endDate: editingPlan.endDate ? new Date(editingPlan.endDate).toISOString() : null,
    };

    const ok = await plans.update(editingPlan.id, payload, `Plan "${editingPlan.name}" updated`);
    if (ok) {
      setEditingPlan(null);
    }
  };

  // Batch CSV Export
  const handleExportSelected = () => {
    const selectedRows = filteredPlans.filter((p) => selectedIds.has(p.id));
    if (selectedRows.length === 0) return;

    exportToCSV(
      selectedRows,
      [
        { key: "name", label: "Plan Name" },
        { key: "sku", label: "Product SKU", formatter: (_, r) => r.product?.sku || "—" },
        { key: "interval", label: "Billing Interval", formatter: (_, r) => r.billingInterval || "" },
        { key: "price", label: "Price (₹)", formatter: (v) => Number(v).toFixed(2) },
        {
          key: "startDate",
          label: "Start Date",
          formatter: (v) => (v ? new Date(v).toISOString().split("T")[0] : "None"),
        },
        {
          key: "endDate",
          label: "End Date",
          formatter: (v) => (v ? new Date(v).toISOString().split("T")[0] : "None"),
        },
        { key: "proration", label: "Proration", formatter: (_, r) => (r.prorationEnabled ? "Yes" : "No") },
        { key: "refund", label: "Refund %", formatter: (_, r) => `${r.cancellationRefundPercent}%` },
        { key: "inUse", label: "Active Subscriptions", formatter: (_, r) => r._count?.subscriptions || 0 },
      ],
      `subscription_plans_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const filterGroups = [
    {
      label: "Billing Duration",
      key: "interval",
      options: [
        { label: "Monthly", value: "MONTHLY" },
        { label: "Quarterly", value: "QUARTERLY" },
        { label: "Yearly", value: "YEARLY" },
      ],
    },
  ];

  const groupByOptions = [
    { label: "Billing Duration", value: "billingInterval" },
    { label: "Product SKU", value: "product.sku" },
    { label: "None", value: "" },
  ];

  return (
    <>
      <AdminHeader
        section="Catalogue"
        title="Subscription Plans"
        description="Configure subscription plans, recurring intervals, and custom start and end dates. Admin can select validity start and end dates directly on any monthly, quarterly, or yearly plan."
      >
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            + Add Subscription Plan
          </Button>
          <Link href="/admin/subscription-products">
            <Button variant="secondary" size="sm">
              Subscription Products →
            </Button>
          </Link>
        </div>
      </AdminHeader>

      <Banners
        notice={plans.notice}
        error={plans.error}
        onClose={() => {
          plans.setNotice("");
          plans.setError("");
        }}
      />

      <div className="bg-[#EBF5FB] border border-[#2980B9]/30 rounded-[8px] p-4 mb-4 text-sm text-[#1B4F72] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <strong>📅 Date Selection Active:</strong> You can select or change the <strong>Start Date</strong> and{" "}
          <strong>End Date</strong> directly in the table columns for any plan duration (Monthly, Quarterly, Yearly).
          Changes save automatically to PostgreSQL.
        </div>
        <Link href="/admin/subscription-products" className="shrink-0">
          <Button variant="secondary" size="sm">
            Open Subscription Products
          </Button>
        </Link>
      </div>

      {/* Control Panel: Search, Filter, Group By */}
      <OdooControlPanel
        className="mb-3"
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="Search plans by name, SKU, or duration."
        filterGroups={filterGroups}
        activeFilters={activeFilters}
        onFilterChange={(key, val) => setActiveFilters((prev) => ({ ...prev, [key]: val }))}
        groupByOptions={groupByOptions}
        activeGroupBy={activeGroupBy}
        onGroupByChange={setActiveGroupBy}
        totalCount={plans.items.length}
        filteredCount={filteredPlans.length}
        onResetAll={() => {
          setSearchTerm("");
          setActiveFilters({ interval: [] });
          setActiveGroupBy("billingInterval");
        }}
      />

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedIds.size}
        totalCount={filteredPlans.length}
        onSelectAll={() => setSelectedIds(new Set(filteredPlans.map((p) => p.id)))}
        onClearSelection={() => setSelectedIds(new Set())}
        actions={[
          {
            label: "Export Selected (CSV)",
            icon: "📥",
            onClick: handleExportSelected,
            variant: "secondary",
          },
        ]}
      />

      {/* Grouped & Selectable Table with Start & End Date Columns */}
      <GroupedTable
        headers={[
          { label: "Plan Name", key: "name" },
          { label: "Product SKU", key: "product.sku", className: "w-32 font-mono" },
          { label: "Interval", key: "billingInterval", className: "w-28" },
          { label: "Price", key: "price", className: "w-28" },
          { label: "Start Date", key: "startDate", className: "w-44" },
          { label: "End Date", key: "endDate", className: "w-44" },
          { label: "Proration", key: "prorationEnabled", className: "w-24 text-center" },
          { label: "Refund %", key: "cancellationRefundPercent", className: "w-20 text-center" },
          { label: "In Use", key: "_count.subscriptions", className: "w-20 text-center" },
          { label: "Actions", key: "actions", className: "w-24 text-right" },
        ]}
        data={filteredPlans}
        getId={(p) => p.id}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={(ids) => handleToggleSelectAll(ids)}
        groupBy={activeGroupBy}
        aggregateCols={[
          {
            key: "price",
            label: "Avg Rate",
            type: "avg",
            formatter: (val) => `₹${val.toFixed(2)}`,
          },
        ]}
        emptyMessage="No subscription plans found matching your criteria."
        renderRow={(p, isSelected, toggleSelect) => {
          const startDateVal = p.startDate ? new Date(p.startDate).toISOString().split("T")[0] : "";
          const endDateVal = p.endDate ? new Date(p.endDate).toISOString().split("T")[0] : "";
          const isSaving = savingDateId === p.id;

          return (
            <tr
              key={p.id}
              className={`border-b border-[#E9ECEF] hover:bg-[#F8F9FA] transition-colors ${
                isSelected ? "bg-[#714B67]/5" : ""
              }`}
            >
              <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={toggleSelect}
                  className="w-4 h-4 accent-[#714B67] rounded cursor-pointer"
                />
              </td>
              <td className="px-4 py-3 font-semibold text-sm text-[#212529]">
                <div>{p.name}</div>
                {p.product?.name && (
                  <div className="text-[11px] text-[#6C757D] font-normal">{p.product.name}</div>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs font-bold text-[#714B67]">
                {p.product?.sku || "—"}
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant={
                    p.billingInterval === "YEARLY"
                      ? "success"
                      : p.billingInterval === "QUARTERLY"
                      ? "warning"
                      : "info"
                  }
                  size="sm"
                >
                  {p.billingInterval}
                </Badge>
              </td>
              <td className="px-4 py-3 font-bold text-sm text-[#212529]">
                ₹{Number(p.price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </td>

              {/* Start Date Column with Calendar Picker */}
              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={startDateVal}
                    onChange={(e) => handleDateUpdate(p.id, "startDate", e.target.value)}
                    className="w-32 px-2 py-1 text-xs border border-[#CED4DA] rounded-[4px] bg-white text-[#212529] focus:border-[#714B67] focus:ring-1 focus:ring-[#714B67] outline-none transition-all"
                    title="Select Start Date for this plan"
                  />
                  {startDateVal && (
                    <button
                      type="button"
                      onClick={() => handleDateUpdate(p.id, "startDate", "")}
                      title="Clear Start Date"
                      className="text-[#ADB5BD] hover:text-[#DC3545] p-1 text-xs font-bold transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {startDateVal ? (
                  <div className="text-[10px] text-[#28A745] font-medium mt-0.5 flex items-center gap-1">
                    <span>Active from:</span>
                    <span>
                      {new Date(p.startDate).toLocaleDateString("en-IN", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                ) : (
                  <div className="text-[10px] text-[#ADB5BD] italic mt-0.5">No start date set</div>
                )}
              </td>

              {/* End Date Column with Calendar Picker */}
              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={endDateVal}
                    min={startDateVal || undefined}
                    onChange={(e) => handleDateUpdate(p.id, "endDate", e.target.value)}
                    className="w-32 px-2 py-1 text-xs border border-[#CED4DA] rounded-[4px] bg-white text-[#212529] focus:border-[#714B67] focus:ring-1 focus:ring-[#714B67] outline-none transition-all"
                    title="Select End Date for this plan"
                  />
                  {endDateVal ? (
                    <button
                      type="button"
                      onClick={() => handleDateUpdate(p.id, "endDate", "")}
                      title="Clear End Date"
                      className="text-[#ADB5BD] hover:text-[#DC3545] p-1 text-xs font-bold transition-colors"
                    >
                      ✕
                    </button>
                  ) : startDateVal ? (
                    <button
                      type="button"
                      onClick={() => setQuickEndDate(p.id, startDateVal, p.billingInterval)}
                      title={`Add +1 ${p.billingInterval.toLowerCase()} cycle`}
                      className="text-[10px] text-[#714B67] hover:underline whitespace-nowrap bg-[#F3EEF2] px-1.5 py-0.5 rounded"
                    >
                      +1 {p.billingInterval === "YEARLY" ? "Yr" : p.billingInterval === "QUARTERLY" ? "Qtr" : "Mo"}
                    </button>
                  ) : null}
                </div>
                {endDateVal ? (
                  <div className="text-[10px] text-[#E67E22] font-medium mt-0.5 flex items-center gap-1">
                    <span>Valid until:</span>
                    <span>
                      {new Date(p.endDate).toLocaleDateString("en-IN", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                ) : (
                  <div className="text-[10px] text-[#ADB5BD] italic mt-0.5">Open-ended</div>
                )}
                {isSaving && (
                  <div className="text-[9px] text-[#714B67] animate-pulse font-semibold">Saving...</div>
                )}
              </td>

              <td className="px-4 py-3 text-xs text-center text-[#495057]">
                {p.prorationEnabled ? (
                  <span className="text-[#28A745] font-semibold">✓ Yes</span>
                ) : (
                  <span className="text-[#6C757D]">No</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-center text-[#495057]">
                {p.cancellationRefundPercent}%
              </td>
              <td className="px-4 py-3 text-xs text-center font-medium text-[#6C757D]">
                {p._count?.subscriptions || 0} active
              </td>
              <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() =>
                    setEditingPlan({
                      id: p.id,
                      name: p.name,
                      billingInterval: p.billingInterval,
                      price: p.price,
                      startDate: startDateVal,
                      endDate: endDateVal,
                      prorationEnabled: p.prorationEnabled,
                      cancellationRefundPercent: p.cancellationRefundPercent,
                    })
                  }
                >
                  Edit
                </Button>
              </td>
            </tr>
          );
        }}
      />

      {/* Modal: Create Subscription Plan */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <Card className="max-w-xl w-full p-6 bg-white shadow-xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#E9ECEF] mb-4">
              <h2 className="text-lg font-bold text-[#212529]">New Subscription Plan</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  label="Target SaaS Product"
                  required
                  options={products.map((p) => ({
                    value: p.id,
                    label: `${p.name} (${p.sku})`,
                  }))}
                  value={planForm.productId}
                  onChange={(v) => setPlanForm((f) => ({ ...f, productId: v }))}
                />
                <Field
                  label="Plan Name"
                  required
                  placeholder="e.g. Enterprise Annual Pro"
                  value={planForm.name}
                  onChange={(v) => setPlanForm((f) => ({ ...f, name: v }))}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  label="Billing Interval"
                  required
                  options={DURATION_OPTIONS}
                  value={planForm.billingInterval}
                  onChange={(v) => setPlanForm((f) => ({ ...f, billingInterval: v }))}
                />
                <Field
                  label="Recurring Price (₹)"
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  placeholder="2400.00"
                  value={planForm.price}
                  onChange={(v) => setPlanForm((f) => ({ ...f, price: v }))}
                />
              </div>

              {/* Start Date and End Date Pickers in Plan Creation */}
              <div className="p-3 bg-[#F8F9FA] rounded-[6px] border border-[#E9ECEF]">
                <div className="text-xs font-semibold text-[#495057] mb-2 uppercase tracking-wider">
                  Plan Validity & Scheduling Window (Optional)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#495057] mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={planForm.startDate}
                      onChange={(e) => setPlanForm((f) => ({ ...f, startDate: e.target.value }))}
                      className="w-full h-10 px-3 text-sm border border-[#CED4DA] rounded-[6px] bg-white text-[#212529] outline-none focus:border-[#714B67]"
                    />
                    <span className="text-[11px] text-[#6C757D] mt-1 block">
                      When this recurring plan becomes active.
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#495057] mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      min={planForm.startDate || undefined}
                      value={planForm.endDate}
                      onChange={(e) => setPlanForm((f) => ({ ...f, endDate: e.target.value }))}
                      className="w-full h-10 px-3 text-sm border border-[#CED4DA] rounded-[6px] bg-white text-[#212529] outline-none focus:border-[#714B67]"
                    />
                    <span className="text-[11px] text-[#6C757D] mt-1 block">
                      Contract expiration or promo cutoff.
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  label="Cancellation Refund %"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0"
                  value={planForm.cancellationRefundPercent}
                  onChange={(v) => setPlanForm((f) => ({ ...f, cancellationRefundPercent: v }))}
                />
                <div className="pt-6">
                  <Field
                    label="Proration Enabled"
                    type="checkbox"
                    value={planForm.prorationEnabled}
                    onChange={(v) => setPlanForm((f) => ({ ...f, prorationEnabled: v }))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E9ECEF]">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={plans.busy}>
                  Create Plan
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Modal: Edit Subscription Plan Dates & Details */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <Card className="max-w-lg w-full p-6 bg-white shadow-xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#E9ECEF] mb-4">
              <h2 className="text-lg font-bold text-[#212529]">Edit Subscription Plan</h2>
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditPlanSubmit} className="space-y-4">
              <Field
                label="Plan Name"
                required
                value={editingPlan.name}
                onChange={(v) => setEditingPlan((ep) => ({ ...ep, name: v }))}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  label="Billing Interval"
                  required
                  options={DURATION_OPTIONS}
                  value={editingPlan.billingInterval}
                  onChange={(v) => setEditingPlan((ep) => ({ ...ep, billingInterval: v }))}
                />
                <Field
                  label="Price (₹)"
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  value={editingPlan.price}
                  onChange={(v) => setEditingPlan((ep) => ({ ...ep, price: v }))}
                />
              </div>

              {/* Start & End Date Selection */}
              <div className="p-3 bg-[#F8F9FA] rounded-[6px] border border-[#E9ECEF]">
                <div className="text-xs font-semibold text-[#495057] mb-2 uppercase tracking-wider">
                  Plan Dates
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#495057] mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={editingPlan.startDate || ""}
                      onChange={(e) =>
                        setEditingPlan((ep) => ({ ...ep, startDate: e.target.value }))
                      }
                      className="w-full h-10 px-3 text-sm border border-[#CED4DA] rounded-[6px] bg-white text-[#212529] outline-none focus:border-[#714B67]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#495057] mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      min={editingPlan.startDate || undefined}
                      value={editingPlan.endDate || ""}
                      onChange={(e) =>
                        setEditingPlan((ep) => ({ ...ep, endDate: e.target.value }))
                      }
                      className="w-full h-10 px-3 text-sm border border-[#CED4DA] rounded-[6px] bg-white text-[#212529] outline-none focus:border-[#714B67]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  label="Refund %"
                  type="number"
                  min={0}
                  max={100}
                  value={editingPlan.cancellationRefundPercent}
                  onChange={(v) =>
                    setEditingPlan((ep) => ({ ...ep, cancellationRefundPercent: v }))
                  }
                />
                <div className="pt-6">
                  <Field
                    label="Proration"
                    type="checkbox"
                    value={editingPlan.prorationEnabled}
                    onChange={(v) => setEditingPlan((ep) => ({ ...ep, prorationEnabled: v }))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E9ECEF]">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditingPlan(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={plans.busy}>
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}

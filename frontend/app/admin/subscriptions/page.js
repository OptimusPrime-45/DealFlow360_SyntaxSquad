"use client";

/**
 * Subscriptions Management — Active Recurring Contracts & Billing Schedules.
 * Features B-Tree search index, OdooControlPanel with filter/group by,
 * GroupedTable with multi-select checkboxes, and BatchActionBar with CSV export and cancellation.
 */

import React, { useState, useEffect, useMemo } from "react";
import apiClient from "../../../lib/apiClient.js";
import { Button, Card, Badge } from "../../../components/ui/index.js";
import { AdminHeader, Banners } from "../../../components/admin/AdminUI.jsx";
import { OdooControlPanel } from "../../../components/ui/OdooControlPanel.jsx";
import { GroupedTable } from "../../../components/ui/GroupedTable.jsx";
import { BatchActionBar } from "../../../components/ui/BatchActionBar.jsx";
import { BTreeSearchIndex } from "../../../lib/btree.js";
import { exportToCSV } from "../../../lib/exportCsv.js";

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Search, Filter & Group By
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState({
    status: [],
    interval: [],
  });
  const [activeGroupBy, setActiveGroupBy] = useState("status");

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  const fetchSubscriptions = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.get("/subscriptions");
      setSubscriptions(res.data || []);
    } catch (err) {
      setError(err.message || "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  // Build client B-Tree Search Index
  const btreeIndex = useMemo(() => {
    const index = new BTreeSearchIndex({ degree: 3 });
    subscriptions.forEach((sub) => {
      index.insertRecord(sub.id, {
        customer: sub.customer?.name || "",
        email: sub.customer?.contactEmail || "",
        orderNumber: sub.order?.orderNumber || "",
        plan: sub.subscriptionPlan?.name || "",
        product: sub.subscriptionPlan?.product?.name || sub.orderLine?.product?.name || "",
        status: sub.status || "",
        interval: sub.subscriptionPlan?.billingInterval || "",
      });
    });
    return index;
  }, [subscriptions]);

  // Filtering & Search
  const filteredSubscriptions = useMemo(() => {
    let result = subscriptions;

    // 1. Fast B-Tree Query
    if (searchTerm.trim()) {
      const matchIds = btreeIndex.query(searchTerm.trim());
      result = result.filter((s) => matchIds.has(s.id));
    }

    // 2. Status Filter
    if (activeFilters.status && activeFilters.status.length > 0) {
      const statusSet = new Set(activeFilters.status);
      result = result.filter((s) => statusSet.has(s.status));
    }

    // 3. Billing Interval Filter
    if (activeFilters.interval && activeFilters.interval.length > 0) {
      const intSet = new Set(activeFilters.interval);
      result = result.filter((s) => intSet.has(s.subscriptionPlan?.billingInterval));
    }

    return result;
  }, [subscriptions, searchTerm, activeFilters, btreeIndex]);

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

  // Batch Actions
  const handleExportSelected = () => {
    const selectedRows = filteredSubscriptions.filter((s) => selectedIds.has(s.id));
    if (selectedRows.length === 0) return;

    exportToCSV(
      selectedRows,
      [
        { key: "order", label: "Order #", formatter: (_, r) => r.order?.orderNumber || "" },
        { key: "customer", label: "Customer Name", formatter: (_, r) => r.customer?.name || "" },
        { key: "email", label: "Customer Email", formatter: (_, r) => r.customer?.contactEmail || "" },
        { key: "plan", label: "Subscription Plan", formatter: (_, r) => r.subscriptionPlan?.name || "" },
        { key: "interval", label: "Billing Interval", formatter: (_, r) => r.subscriptionPlan?.billingInterval || "" },
        { key: "quantity", label: "Seats / Qty" },
        { key: "unitPrice", label: "Unit Price (₹)", formatter: (v) => Number(v).toFixed(2) },
        { key: "status", label: "Contract Status" },
        { key: "startDate", label: "Start Date", formatter: (v) => new Date(v).toISOString().split("T")[0] },
        { key: "currentPeriodEnd", label: "Next Renewal", formatter: (v) => new Date(v).toISOString().split("T")[0] },
      ],
      `subscriptions_export_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const cancellableSubs = useMemo(() => {
    return filteredSubscriptions.filter(
      (s) => selectedIds.has(s.id) && s.status !== "CANCELLED" && s.status !== "EXPIRED"
    );
  }, [filteredSubscriptions, selectedIds]);

  const handleBatchCancel = async () => {
    if (cancellableSubs.length === 0) return;
    if (!window.confirm(`Are you sure you want to cancel ${cancellableSubs.length} selected subscription(s)?`)) return;
    try {
      for (const s of cancellableSubs) {
        await apiClient.post(`/subscriptions/${s.id}/cancel`);
      }
      setNotice(`Successfully cancelled ${cancellableSubs.length} subscription(s).`);
      setSelectedIds(new Set());
      fetchSubscriptions();
    } catch (err) {
      setError(err.message || "Failed to cancel selected subscriptions");
    }
  };

  const filterGroups = [
    {
      label: "Contract Status",
      key: "status",
      options: [
        { label: "Active", value: "ACTIVE" },
        { label: "Paused", value: "PAUSED" },
        { label: "Cancelled", value: "CANCELLED" },
        { label: "Expired", value: "EXPIRED" },
      ],
    },
    {
      label: "Billing Interval",
      key: "interval",
      options: [
        { label: "Monthly", value: "MONTHLY" },
        { label: "Quarterly", value: "QUARTERLY" },
        { label: "Yearly", value: "YEARLY" },
      ],
    },
  ];

  const groupByOptions = [
    { label: "Status", value: "status" },
    { label: "Customer", value: "customer.name" },
    { label: "Billing Interval", value: "subscriptionPlan.billingInterval" },
    { label: "None", value: "" },
  ];

  const statusVariant = {
    ACTIVE: "success",
    PAUSED: "warning",
    CANCELLED: "danger",
    EXPIRED: "gray",
  };

  return (
    <>
      <AdminHeader
        section="Operations"
        title="Subscriptions"
        description="Active recurring contracts, customer subscription status, and automated billing streams."
      >
        <Button variant="secondary" size="sm" onClick={fetchSubscriptions}>
          ↻ Refresh
        </Button>
      </AdminHeader>

      <Banners error={error} notice={notice} />

      {/* Control Panel: Search, Filter, Group By */}
      <OdooControlPanel
        className="mb-3"
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="Search subscriptions by customer, order #, plan, or status."
        filterGroups={filterGroups}
        activeFilters={activeFilters}
        onFilterChange={(key, val) => setActiveFilters((prev) => ({ ...prev, [key]: val }))}
        groupByOptions={groupByOptions}
        activeGroupBy={activeGroupBy}
        onGroupByChange={setActiveGroupBy}
        totalCount={subscriptions.length}
        filteredCount={filteredSubscriptions.length}
        onResetAll={() => {
          setSearchTerm("");
          setActiveFilters({ status: [], interval: [] });
          setActiveGroupBy("status");
        }}
      />

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedIds.size}
        totalCount={filteredSubscriptions.length}
        onSelectAll={() => setSelectedIds(new Set(filteredSubscriptions.map((s) => s.id)))}
        onClearSelection={() => setSelectedIds(new Set())}
        actions={[
          ...(cancellableSubs.length > 0
            ? [
                {
                  label: `Cancel Selected (${cancellableSubs.length})`,
                  icon: "✕",
                  onClick: handleBatchCancel,
                  variant: "danger",
                },
              ]
            : []),
          {
            label: "Export Selected (CSV)",
            icon: "📥",
            onClick: handleExportSelected,
            variant: "secondary",
          },
        ]}
      />

      {/* Grouped & Selectable Table */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-[#6C757D]">Loading subscriptions...</p>
        </div>
      ) : (
        <GroupedTable
          headers={[
            { label: "Order #", key: "order.orderNumber", className: "w-28 font-mono" },
            { label: "Customer", key: "customer.name" },
            { label: "Plan / Product", key: "subscriptionPlan.name" },
            { label: "Interval", key: "subscriptionPlan.billingInterval", className: "w-24" },
            { label: "Qty", key: "quantity", className: "w-16 text-center" },
            { label: "Rate", key: "unitPrice", className: "w-24" },
            { label: "Status", key: "status", className: "w-24" },
            { label: "Start Date", key: "startDate", className: "w-28" },
            { label: "End Date", key: "endDate", className: "w-28" },
            { label: "Renewal Date", key: "currentPeriodEnd", className: "w-28" },
            { label: "Actions", key: "actions", className: "w-20 text-right" },
          ]}
          data={filteredSubscriptions}
          getId={(s) => s.id}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={(ids) => handleToggleSelectAll(ids)}
          groupBy={activeGroupBy}
          aggregateCols={[
            {
              key: "unitPrice",
              label: "Total Value",
              type: "sum",
              formatter: (val) => `₹${Number(val).toLocaleString()}`,
            },
          ]}
          emptyMessage="No subscriptions match your search or filter."
          renderRow={(s, isSelected, toggleSelect) => (
            <tr
              key={s.id}
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
              <td className="px-4 py-3 font-mono text-xs font-bold text-[#714B67]">
                {s.order?.orderNumber || "—"}
              </td>
              <td className="px-4 py-3">
                <div className="font-semibold text-sm text-[#212529]">{s.customer?.name}</div>
                <div className="text-[11px] text-[#6C757D]">{s.customer?.contactEmail}</div>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-xs text-[#212529]">{s.subscriptionPlan?.name}</div>
                <div className="text-[11px] text-[#6C757D]">
                  {s.subscriptionPlan?.product?.name || s.orderLine?.product?.name || ""}
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant={s.subscriptionPlan?.billingInterval === "YEARLY" ? "success" : "info"} size="sm">
                  {s.subscriptionPlan?.billingInterval}
                </Badge>
              </td>
              <td className="px-4 py-3 text-xs text-center font-semibold text-[#495057]">
                {s.quantity}
              </td>
              <td className="px-4 py-3 font-bold text-sm text-[#212529]">
                ₹{Number(s.unitPrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-3">
                <Badge variant={statusVariant[s.status] || "neutral"} size="sm">
                  {s.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-xs text-[#28A745] font-medium">
                {s.startDate ? new Date(s.startDate).toLocaleDateString() : "—"}
              </td>
              <td className="px-4 py-3 text-xs text-[#E67E22] font-medium">
                {s.endDate ? new Date(s.endDate).toLocaleDateString() : "Open"}
              </td>
              <td className="px-4 py-3 text-xs text-[#6C757D]">
                {new Date(s.currentPeriodEnd).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                {s.status === "ACTIVE" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (!window.confirm("Cancel this subscription?")) return;
                      await apiClient.post(`/subscriptions/${s.id}/cancel`);
                      fetchSubscriptions();
                    }}
                    className="text-xs text-[#DC3545] hover:bg-[#FDECEA]"
                  >
                    Cancel
                  </Button>
                )}
              </td>
            </tr>
          )}
        />
      )}
    </>
  );
}

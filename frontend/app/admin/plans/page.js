"use client";

/**
 * Subscription Plans — Configured Recurring Plans & Pricing.
 * Features B-Tree search index, OdooControlPanel with interval/proration filters,
 * GroupedTable with multi-select checkboxes, and BatchActionBar with CSV export.
 */

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Badge } from "../../../components/ui/index.js";
import { AdminHeader } from "../../../components/admin/AdminUI.jsx";
import { OdooControlPanel } from "../../../components/ui/OdooControlPanel.jsx";
import { GroupedTable } from "../../../components/ui/GroupedTable.jsx";
import { BatchActionBar } from "../../../components/ui/BatchActionBar.jsx";
import { BTreeSearchIndex } from "../../../lib/btree.js";
import { exportToCSV } from "../../../lib/exportCsv.js";

export default function PlansPage() {
  const plans = useResource("/subscription-plans", "plans");

  // Search, Filter & Group By
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState({
    interval: [],
  });
  const [activeGroupBy, setActiveGroupBy] = useState("billingInterval");

  // Multi-Select Checkboxes State
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Build client B-Tree Search Index
  const btreeIndex = useMemo(() => {
    const index = new BTreeSearchIndex({ degree: 3 });
    plans.items.forEach((p) => {
      index.insertRecord(p.id, {
        name: p.name || "",
        sku: p.product?.sku || "",
        product: p.product?.name || "",
        interval: p.billingInterval || "",
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
        description="Subscription plans and recurring pricing. Filter by billing interval, search plans, and group by interval."
      >
        <Link href="/admin/subscription-products">
          <Button variant="primary" size="sm">
            Go to Subscription Products →
          </Button>
        </Link>
      </AdminHeader>

      <div className="bg-[#EBF5FB] border border-[#2980B9]/30 rounded-[8px] p-4 mb-4 text-sm text-[#1B4F72] flex items-center justify-between">
        <div>
          <strong>Unified Catalogue Tip:</strong> You can configure new subscription plans and multi-interval
          pricing directly inside each product in <strong>Subscription Products</strong>.
        </div>
        <Link href="/admin/subscription-products" className="shrink-0 ml-4">
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

      {/* Grouped & Selectable Table */}
      <GroupedTable
        headers={[
          { label: "Plan Name", key: "name" },
          { label: "Product SKU", key: "product.sku", className: "w-36 font-mono" },
          { label: "Interval", key: "billingInterval", className: "w-32" },
          { label: "Recurring Price", key: "price", className: "w-36" },
          { label: "Proration", key: "prorationEnabled", className: "w-28" },
          { label: "Refund %", key: "cancellationRefundPercent", className: "w-24" },
          { label: "In Use", key: "_count.subscriptions", className: "w-28 text-center" },
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
        renderRow={(p, isSelected, toggleSelect) => (
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
            <td className="px-4 py-3 font-semibold text-sm text-[#212529]">{p.name}</td>
            <td className="px-4 py-3 font-mono text-xs font-bold text-[#714B67]">
              {p.product?.sku || "—"}
            </td>
            <td className="px-4 py-3">
              <Badge variant={p.billingInterval === "YEARLY" ? "success" : "info"} size="sm">
                {p.billingInterval}
              </Badge>
            </td>
            <td className="px-4 py-3 font-bold text-sm text-[#212529]">
              ₹{Number(p.price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </td>
            <td className="px-4 py-3 text-xs text-[#495057]">
              {p.prorationEnabled ? "Yes" : "No"}
            </td>
            <td className="px-4 py-3 text-xs text-[#495057]">
              {p.cancellationRefundPercent}%
            </td>
            <td className="px-4 py-3 text-xs text-center font-medium text-[#6C757D]">
              {p._count?.subscriptions || 0} active
            </td>
          </tr>
        )}
      />
    </>
  );
}

"use client";

/**
 * Orders & Deal Execution — Track confirmed orders, warehouse fulfillment, billing, and close deals.
 * Enhanced with B-Tree instant search index, OdooControlPanel, GroupedTable with multi-select checkboxes,
 * and BatchActionBar with CSV export and batch deal closure.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext.js";
import apiClient from "../../lib/apiClient.js";
import { Button, Card, Badge } from "../../components/ui/index.js";
import { OdooControlPanel } from "../../components/ui/OdooControlPanel.jsx";
import { GroupedTable } from "../../components/ui/GroupedTable.jsx";
import { BatchActionBar } from "../../components/ui/BatchActionBar.jsx";
import { BTreeSearchIndex } from "../../lib/btree.js";
import { exportToCSV } from "../../lib/exportCsv.js";

const money = (v) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ORDER_STATUS_VARIANT = {
  PENDING_FULFILLMENT: "warning",
  ALLOCATED: "info",
  PARTIALLY_SHIPPED: "warning",
  SHIPPED: "info",
  COMPLETED: "success",
  CANCELLED: "danger",
  BACKORDERED: "danger",
};

export default function OrdersListPage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Search, Filter & Group By State
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState({
    status: [],
  });
  const [activeGroupBy, setActiveGroupBy] = useState("status");

  // Multi-Select Checkboxes State
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const loadOrders = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const res = await apiClient.get("/orders");
      setOrders(res.orders || []);
    } catch (err) {
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadOrders();
  }, [isAuthenticated, loadOrders]);

  const handleCloseDeal = async (orderId, orderNumber) => {
    if (!confirm(`Are you sure you want to close deal ${orderNumber} and mark this order as COMPLETED?`)) {
      return;
    }
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await apiClient.post(`/orders/${orderId}/close`, {});
      setNotice(`Deal closed! Order ${orderNumber} marked as COMPLETED.`);
      await loadOrders();
    } catch (err) {
      setError(err.message || "Failed to close order");
    } finally {
      setBusy(false);
    }
  };

  // Build client B-Tree Search Index
  const btreeIndex = useMemo(() => {
    const index = new BTreeSearchIndex({ degree: 3 });
    orders.forEach((o) => {
      index.insertRecord(o.id, {
        orderNumber: o.orderNumber || "",
        customer: o.customer?.name || "",
        email: o.customer?.contactEmail || "",
        quotation: o.quotation?.quotationNumber || "",
        status: o.status || "",
      });
    });
    return index;
  }, [orders]);

  // Filtered & Searched Orders
  const filteredOrders = useMemo(() => {
    let result = orders;

    // 1. Fast B-Tree Query
    if (searchTerm.trim()) {
      const matchIds = btreeIndex.query(searchTerm.trim());
      result = result.filter((o) => matchIds.has(o.id));
    }

    // 2. Status Filter
    if (activeFilters.status && activeFilters.status.length > 0) {
      const statusSet = new Set(activeFilters.status);
      result = result.filter((o) => statusSet.has(o.status));
    }

    return result;
  }, [orders, searchTerm, activeFilters, btreeIndex]);

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
    const selectedRows = filteredOrders.filter((o) => selectedIds.has(o.id));
    if (selectedRows.length === 0) return;

    exportToCSV(
      selectedRows,
      [
        { key: "orderNumber", label: "Order #" },
        { key: "customer", label: "Customer Name", formatter: (_, r) => r.customer?.name || "" },
        { key: "email", label: "Customer Email", formatter: (_, r) => r.customer?.contactEmail || "" },
        { key: "quotation", label: "Quotation #", formatter: (_, r) => r.quotation?.quotationNumber || "" },
        { key: "totalAmount", label: "Total Amount (₹)", formatter: (v) => Number(v).toFixed(2) },
        { key: "status", label: "Status" },
        { key: "confirmedAt", label: "Confirmed Date", formatter: (v) => v ? new Date(v).toISOString().split("T")[0] : "" },
      ],
      `orders_export_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const handleBatchCloseDeals = async () => {
    if (!confirm(`Close deals and mark ${selectedIds.size} selected orders as COMPLETED?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await apiClient.post(`/orders/${id}/close`, {});
      }
      setNotice(`Successfully marked ${ids.length} orders as COMPLETED!`);
      setSelectedIds(new Set());
      await loadOrders();
    } catch (err) {
      setError(err.message || "Failed to close selected orders");
    } finally {
      setBusy(false);
    }
  };

  const totalRevenue = filteredOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const completedCount = filteredOrders.filter((o) => o.status === "COMPLETED").length;
  const pendingCount = filteredOrders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED").length;

  const filterGroups = [
    {
      label: "Order Status",
      key: "status",
      options: [
        { label: "Pending Fulfillment", value: "PENDING_FULFILLMENT" },
        { label: "Allocated", value: "ALLOCATED" },
        { label: "Partially Shipped", value: "PARTIALLY_SHIPPED" },
        { label: "Shipped", value: "SHIPPED" },
        { label: "Completed", value: "COMPLETED" },
        { label: "Backordered", value: "BACKORDERED" },
        { label: "Cancelled", value: "CANCELLED" },
      ],
    },
  ];

  const groupByOptions = [
    { label: "Order Status", value: "status" },
    { label: "Customer", value: "customer.name" },
    { label: "None", value: "" },
  ];

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-[#6C757D] hover:text-[#714B67] transition-colors">
            ← Workspace
          </Link>
          <div>
            <h1 className="font-bold text-base text-[#212529]">Orders &amp; Deal Execution</h1>
            <p className="text-[11px] text-[#6C757D]">
              Track confirmed orders, warehouse allocations, billing, and close deals
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/quotations">
            <Button variant="secondary" size="sm">Quotations Pipeline</Button>
          </Link>
          <Link href="/invoicing">
            <Button variant="secondary" size="sm">Invoicing &amp; Payments</Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={loadOrders} disabled={busy}>
            ↻ Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-4">
        {notice && (
          <div className="bg-[#E7F5EC] border border-[#28A745]/30 text-[#155724] text-sm rounded-[8px] px-4 py-3 flex items-center justify-between">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} className="text-xs font-bold ml-4">✕</button>
          </div>
        )}
        {error && (
          <div className="bg-[#FDECEA] border border-[#DC3545]/30 text-[#842029] text-sm rounded-[8px] px-4 py-3 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="text-xs font-bold ml-4">✕</button>
          </div>
        )}

        {/* Top KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card padding="p-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">Matching Orders</div>
            <div className="text-2xl font-bold text-[#212529] mt-1">{filteredOrders.length}</div>
            <div className="text-[11px] text-[#6C757D]">of {orders.length} total deals</div>
          </Card>
          <Card padding="p-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">Active In Fulfillment</div>
            <div className="text-2xl font-bold text-[#FD7E14] mt-1">{pendingCount}</div>
            <div className="text-[11px] text-[#6C757D]">Awaiting full fulfillment/billing</div>
          </Card>
          <Card padding="p-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">Closed / Completed Deals</div>
            <div className="text-2xl font-bold text-[#28A745] mt-1">{completedCount}</div>
            <div className="text-[11px] text-[#6C757D]">Fully closed deals</div>
          </Card>
          <Card padding="p-4">
            <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">Booked Value</div>
            <div className="text-2xl font-bold text-[#714B67] mt-1">{money(totalRevenue)}</div>
            <div className="text-[11px] text-[#6C757D]">Current view revenue</div>
          </Card>
        </div>

        {/* Odoo Control Panel */}
        <OdooControlPanel
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          placeholder="Search orders by order #, customer, or quotation # (B-Tree indexed)..."
          filterGroups={filterGroups}
          activeFilters={activeFilters}
          onFilterChange={(key, val) => setActiveFilters((prev) => ({ ...prev, [key]: val }))}
          groupByOptions={groupByOptions}
          activeGroupBy={activeGroupBy}
          onGroupByChange={setActiveGroupBy}
          totalCount={orders.length}
          filteredCount={filteredOrders.length}
          onResetAll={() => {
            setSearchTerm("");
            setActiveFilters({ status: [] });
            setActiveGroupBy("status");
          }}
        />

        {/* Batch Action Bar */}
        <BatchActionBar
          selectedCount={selectedIds.size}
          totalCount={filteredOrders.length}
          onSelectAll={() => setSelectedIds(new Set(filteredOrders.map((o) => o.id)))}
          onClearSelection={() => setSelectedIds(new Set())}
          actions={[
            {
              label: "Export Selected (CSV)",
              icon: "📥",
              onClick: handleExportSelected,
              variant: "secondary",
            },
            {
              label: `Batch Close Deals (${selectedIds.size})`,
              icon: "✓",
              onClick: handleBatchCloseDeals,
              variant: "primary",
            },
          ]}
        />

        {/* Grouped & Selectable Table */}
        <GroupedTable
          headers={[
            { label: "Order #", key: "orderNumber", className: "w-32 font-mono" },
            { label: "Customer", key: "customer.name" },
            { label: "Quotation #", key: "quotation.quotationNumber", className: "w-32" },
            { label: "Confirmed Date", key: "confirmedAt", className: "w-32" },
            { label: "Total Value", key: "totalAmount", className: "w-32" },
            { label: "Invoices", key: "invoices", className: "w-32" },
            { label: "Status", key: "status", className: "w-36" },
            { label: "Actions", key: "actions", className: "w-36 text-right" },
          ]}
          data={filteredOrders}
          getId={(o) => o.id}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={(ids) => handleToggleSelectAll(ids)}
          groupBy={activeGroupBy}
          aggregateCols={[
            {
              key: "totalAmount",
              label: "Total Value",
              type: "sum",
              formatter: (val) => money(val),
            },
          ]}
          emptyMessage="No orders found matching the filter."
          renderRow={(order, isSelected, toggleSelect) => {
            const invoices = order.invoices || [];
            const allPaid = invoices.length > 0 && invoices.every((i) => i.status === "PAID");
            const anyInvoiced = invoices.length > 0;

            return (
              <tr
                key={order.id}
                className={`border-t border-[#E9ECEF] hover:bg-[#F8F9FA] transition-colors ${
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
                  <Link href={`/orders/${order.id}`} className="hover:text-[#714B67] hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="font-semibold text-[#212529]">{order.customer?.name}</div>
                  <div className="text-[11px] text-[#6C757D]">{order.customer?.contactEmail}</div>
                </td>
                <td className="px-4 py-3 text-sm">
                  <Link
                    href={`/quotations/${order.quotation?.id}`}
                    className="text-[#714B67] hover:underline font-mono text-xs font-semibold"
                  >
                    {order.quotation?.quotationNumber || "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-[#6C757D]">
                  {order.confirmedAt ? new Date(order.confirmedAt).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-sm font-bold text-[#212529]">
                  {money(order.totalAmount)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {anyInvoiced ? (
                    <div className="flex items-center gap-1.5">
                      <Badge variant={allPaid ? "success" : "info"} size="sm">
                        {invoices.length} Inv ({allPaid ? "Paid" : "Pending"})
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-xs text-[#6C757D]">No invoices</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={ORDER_STATUS_VARIANT[order.status] || "neutral"} size="sm">
                    {order.status.replace(/_/g, " ")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/orders/${order.id}`}>
                      <Button
                        variant={order.status === "PENDING_FULFILLMENT" || order.status === "BACKORDERED" ? "primary" : "secondary"}
                        size="sm"
                        className="text-xs"
                      >
                        📦 Fulfillment &amp; Split
                      </Button>
                    </Link>
                    {order.status !== "COMPLETED" && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="text-xs"
                        disabled={busy}
                        onClick={() => handleCloseDeal(order.id, order.orderNumber)}
                      >
                        Close Deal
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          }}
        />
      </main>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext.js";
import apiClient from "../../lib/apiClient.js";
import { Button, Card, Badge, Table } from "../../components/ui/index.js";

const money = (v) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ORDER_STATUS_VARIANT = {
  PENDING_FULFILLMENT: "warning",
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
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const loadOrders = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const query = statusFilter !== "ALL" ? `?status=${statusFilter}` : "";
      const res = await apiClient.get(`/orders${query}`);
      setOrders(res.orders || []);
    } catch (err) {
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

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

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const completedCount = orders.filter((o) => o.status === "COMPLETED").length;
  const pendingCount = orders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED").length;

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
          <Link href="/" className="text-sm text-[#6C757D] hover:text-[#714B67]">
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
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-5">
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
            <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">Total Orders</div>
            <div className="text-2xl font-bold text-[#212529] mt-1">{orders.length}</div>
            <div className="text-[11px] text-[#6C757D]">All confirmed deals</div>
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
            <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">Total Booked Value</div>
            <div className="text-2xl font-bold text-[#714B67] mt-1">{money(totalRevenue)}</div>
            <div className="text-[11px] text-[#6C757D]">Order pipeline revenue</div>
          </Card>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-[8px] border border-[#E9ECEF]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#6C757D] uppercase">Filter Status:</span>
            {["ALL", "PENDING_FULFILLMENT", "PARTIALLY_SHIPPED", "SHIPPED", "COMPLETED"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition ${
                  statusFilter === st
                    ? "bg-[#714B67] text-white"
                    : "bg-[#F8F9FA] text-[#6C757D] hover:bg-[#E9ECEF]"
                }`}
              >
                {st.replace(/_/g, " ")}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={loadOrders} disabled={busy}>
            Refresh
          </Button>
        </div>

        {/* Orders Table */}
        <Card title="Confirmed Deals & Orders" subtitle="Orders generated from accepted or approved quotations">
          {orders.length === 0 ? (
            <div className="p-8 text-center text-[#6C757D]">
              <p className="text-sm">No orders found matching the filter.</p>
              <p className="text-xs mt-1">Accept a quotation from the customer portal or confirm an approved quotation to create an order.</p>
            </div>
          ) : (
            <Table headers={["Order #", "Customer", "Quotation", "Confirmed Date", "Total Value", "Invoices", "Status", "Actions"]}>
              {orders.map((order) => {
                const invoices = order.invoices || [];
                const allPaid = invoices.length > 0 && invoices.every((i) => i.status === "PAID");
                const anyInvoiced = invoices.length > 0;

                return (
                  <tr key={order.id} className="border-t border-[#E9ECEF] hover:bg-[#F8F9FA]/50 transition">
                    <td className="px-4 py-3 font-semibold text-sm text-[#212529]">
                      <Link href={`/orders/${order.id}`} className="hover:text-[#714B67] hover:underline">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-[#212529]">{order.customer?.name}</div>
                      <div className="text-[11px] text-[#6C757D]">{order.customer?.contactEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/quotations/${order.quotation?.id}`} className="text-[#714B67] hover:underline font-mono text-xs">
                        {order.quotation?.quotationNumber || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#6C757D]">
                      {order.confirmedAt ? new Date(order.confirmedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#212529]">
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
              })}
            </Table>
          )}
        </Card>
      </main>
    </div>
  );
}

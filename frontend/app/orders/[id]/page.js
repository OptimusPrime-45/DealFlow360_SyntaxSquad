"use client";

/**
 * DealFlow360 — Order Fulfillment & Warehouse Split Hub
 *
 * Implements:
 * 1. Live recommended warehouse split (Warehouse name, quantity fulfilled, estimated shipment count & cost)
 * 2. "Accept Suggested Split" and "Manual Override" (with live sellable stock limits)
 * 3. Automated "Consolidate Remaining Backorder" prompt when stock arrives mid-fulfillment
 * 4. Detailed Commercial Tax Invoice viewer with line-level warehouse provenance & payments
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext.js";
import apiClient from "../../../lib/apiClient.js";
import { Button, Card, Badge, Table } from "../../../components/ui/index.js";

const money = (v) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const INVOICE_VARIANT = {
  DRAFT: "neutral",
  POSTED: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CANCELLED: "danger",
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [order, setOrder] = useState(null);
  const [plan, setPlan] = useState(null);
  const [saved, setSaved] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [payAmount, setPayAmount] = useState({});

  // Manual Override State
  const [manualOverrideMode, setManualOverrideMode] = useState(false);
  const [overrideAllocations, setOverrideAllocations] = useState({}); // { [orderLineId]: { [warehouseId]: qty, backorder: qty } }

  // Detailed Invoice Modal State
  const [activeInvoiceDetail, setActiveInvoiceDetail] = useState(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [ordRes, p, a, whRes, inv] = await Promise.all([
        apiClient.get(`/orders/${id}`).catch(() => null),
        apiClient.get(`/fulfillment/orders/${id}/plan`).catch(() => null),
        apiClient.get(`/fulfillment/orders/${id}/allocations`).catch(() => null),
        apiClient.get(`/warehouses`).catch(() => ({ warehouses: [] })),
        apiClient.get(`/invoices?orderId=${id}`).catch(() => null),
      ]);

      const fetchedOrder = ordRes?.order || ordRes?.data?.order || ordRes || null;
      setOrder(fetchedOrder);
      setPlan(p?.data || p);
      setSaved(a?.data || a);
      setWarehouses(whRes?.warehouses || whRes?.data?.warehouses || []);
      setInvoices(inv?.invoices || inv || []);

      // Initialize manual override form if order exists
      const lines = fetchedOrder?.lines || p?.lines || [];
      const initOverride = {};
      lines.forEach((l) => {
        initOverride[l.id] = { backorder: 0 };
        (whRes?.warehouses || []).forEach((w) => {
          initOverride[l.id][w.id] = 0;
        });
      });
      setOverrideAllocations(initOverride);
    } catch (err) {
      console.error("Failed to load order data:", err);
      setError(err.message || "Failed to load order fulfillment data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isAuthenticated && id) load();
  }, [isAuthenticated, id, load]);

  const run = async (label, fn) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(label);
      await load();
    } catch (err) {
      setError(err.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  // --- Actions ---
  const handleAcceptSuggestedSplit = () => {
    run("Suggested warehouse split accepted and stock allocated!", () =>
      apiClient.post(`/fulfillment/orders/${id}/allocate`, {})
    );
  };

  const handleConsolidateBackorders = () => {
    run("Remaining backorders consolidated from newly arrived warehouse stock!", () =>
      apiClient.post(`/fulfillment/orders/${id}/consolidate-backorder`, {})
    );
  };

  const handleManualOverrideChange = (orderLineId, targetKey, value) => {
    const num = value === "" ? 0 : Math.max(0, parseInt(value, 10) || 0);
    setOverrideAllocations((prev) => ({
      ...prev,
      [orderLineId]: {
        ...prev[orderLineId],
        [targetKey]: num,
      },
    }));
  };

  const handleSaveManualOverride = () => {
    const orderLines = order?.lines || [];
    const flatAllocations = [];

    for (const line of orderLines) {
      const lineConfig = overrideAllocations[line.id] || {};
      let lineTotal = 0;

      warehouses.forEach((w) => {
        const qty = Number(lineConfig[w.id] || 0);
        if (qty > 0) {
          flatAllocations.push({
            orderLineId: line.id,
            warehouseId: w.id,
            quantity: qty,
          });
          lineTotal += qty;
        }
      });

      const boQty = Number(lineConfig.backorder || 0);
      if (boQty > 0) {
        flatAllocations.push({
          orderLineId: line.id,
          warehouseId: null,
          quantity: boQty,
          isBackorder: true,
        });
        lineTotal += boQty;
      }

      if (lineTotal !== line.quantity) {
        setError(
          `Allocations for ${line.product?.name || line.id} sum to ${lineTotal}, but required quantity is ${line.quantity}.`
        );
        return;
      }
    }

    run("Manual warehouse split override applied successfully!", async () => {
      await apiClient.post(`/fulfillment/orders/${id}/override`, {
        allocations: flatAllocations,
      });
      setManualOverrideMode(false);
    });
  };

  const handleGenerateInvoices = () => {
    run("Detailed commercial invoice generated successfully!", () =>
      apiClient.post(`/invoices/generate/${id}`, {})
    );
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isSaved = (saved?.allocations || []).length > 0;
  const isManualOverride = saved?.isManualOverride || false;
  const activeSplits = isSaved ? saved?.warehouseSplits || [] : plan?.warehouseSplits || [];
  const currentOrderStatus = saved?.status || plan?.currentStatus || order?.status;
  const canConsolidate = saved?.canConsolidate && saved?.hasBackorder;
  const backorderTotal = isSaved
    ? saved?.totalBackordered || 0
    : plan?.totalBackorderQuantity || 0;

  const oneTimeInvoices = invoices.filter((i) => i.invoiceType === "ONE_TIME");
  const recurringInvoices = invoices.filter((i) => i.invoiceType === "RECURRING");

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-16">
      {/* Top Navigation Bar */}
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-20 shadow-xs">
        <div className="flex items-center gap-4">
          <Link href="/orders" className="text-sm font-medium text-[#6C757D] hover:text-[#714B67]">
            ← Orders
          </Link>
          <span className="text-[#CED4DA]">|</span>
          <div>
            <div className="font-bold text-base text-[#212529] flex items-center gap-2">
              <span>{order?.orderNumber || saved?.orderNumber || "Sales Order"}</span>
              {currentOrderStatus && (
                <Badge
                  variant={
                    currentOrderStatus === "BACKORDERED"
                      ? "danger"
                      : currentOrderStatus === "COMPLETED" || currentOrderStatus === "SHIPPED"
                      ? "success"
                      : currentOrderStatus === "PARTIALLY_SHIPPED" || currentOrderStatus === "PENDING_FULFILLMENT"
                      ? "warning"
                      : "info"
                  }
                  size="md"
                >
                  {currentOrderStatus.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-[#6C757D]">
              Customer: <strong>{order?.customer?.name || "Client"}</strong> • Confirmed Deal Execution
            </div>
          </div>
        </div>

        {/* Global Action Header Buttons */}
        <div className="flex items-center gap-2">
          {invoices.length === 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="text-xs"
              disabled={busy}
              onClick={handleGenerateInvoices}
            >
              Generate Detailed Invoice
            </Button>
          )}

          {currentOrderStatus !== "COMPLETED" && (
            <Button
              variant="primary"
              size="sm"
              className="text-xs"
              disabled={busy}
              onClick={() =>
                run("Deal completed and order closed!", () => apiClient.post(`/orders/${id}/close`, {}))
              }
            >
              Close Deal
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Notifications & Error Alerts */}
        {notice && (
          <div className="bg-[#E7F5EC] border border-[#28A745]/30 text-[#155724] text-sm rounded-[8px] px-4 py-3 flex items-center justify-between">
            <span>✔ {notice}</span>
            <button onClick={() => setNotice("")} className="text-xs text-[#155724]/60 hover:text-[#155724]">✕</button>
          </div>
        )}
        {error && (
          <div className="bg-[#FDECEA] border border-[#DC3545]/30 text-[#842029] text-sm rounded-[8px] px-4 py-3 flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="text-xs text-[#842029]/60 hover:text-[#842029]">✕</button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* AUTOMATIC PROMPT: STOCK ARRIVED MID-FULFILLMENT (BACKORDER CONSOLIDATION)   */}
        {/* ========================================================================= */}
        {canConsolidate && (
          <div className="p-4 bg-[#FFF4E5] border-2 border-[#FD7E14] rounded-[8px] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div>
              <div className="text-sm font-bold text-[#7A4100] flex items-center gap-2">
                <span>⚡ Stock Arrived Mid-Fulfillment!</span>
                <Badge variant="warning" size="sm">Consolidation Ready</Badge>
              </div>
              <p className="text-xs text-[#7A4100]/90 mt-1">
                New inventory has arrived in the network to resolve <strong>{saved.consolidationDetails?.totalConsolidatableQty}</strong> backordered unit(s)!
              </p>
              <div className="text-[11px] text-[#7A4100]/80 mt-1 space-y-0.5">
                {saved.consolidationDetails?.items?.map((it) => (
                  <div key={it.orderLineId}>
                    • <strong>{it.productName}</strong>: {it.consolidatableQty} unit(s) available from{" "}
                    {it.sources?.map((s) => `${s.warehouseName} (${s.quantityToConsolidate})`).join(", ")}
                  </div>
                ))}
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={handleConsolidateBackorders}
              className="bg-[#FD7E14] hover:bg-[#E86D00] text-white font-bold whitespace-nowrap"
            >
              Consolidate Remaining Backorder
            </Button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* FULFILLMENT AND WAREHOUSE SPLIT SCREEN                                     */}
        {/* ========================================================================= */}
        <Card
          title="Fulfillment &amp; Warehouse Split Screen"
          subtitle="Shows recommended warehouse split for the order based on live stock, shipments, and transit costs."
        >
          {/* Header Action Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#E9ECEF] gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#495057] uppercase tracking-wider">
                Split Status:
              </span>
              {isManualOverride ? (
                <Badge variant="warning" size="md">Manual Override Active</Badge>
              ) : isSaved ? (
                <Badge variant="success" size="md">Confirmed Allocation</Badge>
              ) : (
                <Badge variant="info" size="md">Recommended Split (Live Stock)</Badge>
              )}
              {backorderTotal > 0 && (
                <Badge variant="danger" size="md">{backorderTotal} Backordered</Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Button: Accept Suggested Split */}
              <Button
                variant="primary"
                size="sm"
                className="text-xs font-semibold"
                disabled={busy}
                onClick={handleAcceptSuggestedSplit}
              >
                Accept Suggested Split
              </Button>

              {/* Button: Manual Override */}
              <Button
                variant={manualOverrideMode ? "danger" : "secondary"}
                size="sm"
                className="text-xs"
                disabled={busy}
                onClick={() => {
                  setManualOverrideMode(!manualOverrideMode);
                  setError("");
                }}
              >
                {manualOverrideMode ? "Cancel Override" : "Manual Override"}
              </Button>
            </div>
          </div>

          {/* ── Mode 1: Display Recommended / Confirmed Warehouse Split ── */}
          {!manualOverrideMode && (
            <div className="pt-4 space-y-5">
              {activeSplits.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#6C757D] bg-[#F8F9FA] rounded-[6px]">
                  No active warehouse allocations. Click &quot;Accept Suggested Split&quot; to allocate live stock.
                </div>
              ) : (
                <>
                  {/* Warehouse Split Shipment Cards */}
                  <div>
                    <h3 className="text-xs font-bold text-[#495057] uppercase tracking-wider mb-3">
                      📦 Fulfilling Warehouses &amp; Dispatched Shipments
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeSplits.map((ws) => (
                        <div
                          key={ws.warehouseId}
                          className="bg-white border-2 border-[#E9ECEF] hover:border-[#714B67]/40 transition rounded-[8px] p-4 shadow-xs flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-sm text-[#212529]">{ws.warehouseName}</span>
                              <Badge variant="primary" size="sm">{ws.packageLabel}</Badge>
                            </div>
                            <div className="text-[11px] font-mono text-[#6C757D] mb-3">
                              Code: <strong>{ws.warehouseCode}</strong> • Transit Weight: {Number(ws.shippingWeight).toFixed(2)}
                            </div>

                            <div className="grid grid-cols-2 gap-2 bg-[#F8F9FA] p-2.5 rounded-[6px] border border-[#DEE2E6] text-xs mb-3">
                              <div>
                                <span className="text-[#6C757D] text-[10px] block">Fulfilled Qty:</span>
                                <span className="font-bold text-sm text-[#212529]">{ws.totalQuantity} units</span>
                              </div>
                              <div>
                                <span className="text-[#6C757D] text-[10px] block">Est. Shipment Cost:</span>
                                <span className="font-bold text-sm text-[#714B67]">{money(ws.estimatedCost)}</span>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <span className="text-[10px] uppercase font-semibold text-[#6C757D]">
                                Items in this Package:
                              </span>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {ws.items?.map((it, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between text-xs p-1.5 rounded bg-white border border-[#E9ECEF]"
                                  >
                                    <span className="truncate max-w-[140px] text-[#212529]">{it.productName}</span>
                                    <span className="font-bold text-[#714B67] font-mono">{it.quantity} units</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-2 border-t border-[#E9ECEF] flex items-center justify-between text-[11px] text-[#6C757D]">
                            <span>Shipment #{ws.shipmentNumber} of {ws.totalShipments}</span>
                            <span className="text-[#198754] font-medium">Ready for Dispatch</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary Metric Strip */}
                  <div className="p-3.5 bg-[#F8F9FA] border border-[#DEE2E6] rounded-[6px] flex flex-wrap items-center justify-between text-xs text-[#495057]">
                    <div className="flex items-center gap-6">
                      <div>
                        <span className="text-[#6C757D]">Total Shipments:</span>{" "}
                        <strong className="text-[#212529] font-mono">{activeSplits.length} Packages</strong>
                      </div>
                      <div>
                        <span className="text-[#6C757D]">Total Est. Freight:</span>{" "}
                        <strong className="text-[#714B67] font-mono">
                          {money(activeSplits.reduce((s, w) => s + w.estimatedCost, 0))}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#6C757D]">Total Units Fulfilled:</span>{" "}
                        <strong className="text-[#198754] font-mono">
                          {activeSplits.reduce((s, w) => s + w.totalQuantity, 0)} units
                        </strong>
                      </div>
                    </div>

                    {backorderTotal > 0 && (
                      <span className="text-[#DC3545] font-semibold">
                        ⚠️ {backorderTotal} units remaining on backorder
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Mode 2: Manual Override Interface ── */}
          {manualOverrideMode && (
            <div className="pt-4 space-y-4">
              <div className="p-3 bg-[#F3EEF2] border border-[#714B67]/30 rounded-[6px] text-xs text-[#714B67]">
                <strong>Manual Override Mode:</strong> You can assign custom fulfillment quantities to each warehouse or specify backorders. Total per line must equal required quantity.
              </div>

              {(order?.lines || []).map((line) => {
                const lineConfig = overrideAllocations[line.id] || {};
                const totalAssigned =
                  warehouses.reduce((sum, w) => sum + Number(lineConfig[w.id] || 0), 0) +
                  Number(lineConfig.backorder || 0);
                const isMatched = totalAssigned === line.quantity;

                return (
                  <div key={line.id} className="p-4 bg-white border border-[#CED4DA] rounded-[8px] space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-sm text-[#212529]">{line.product?.name}</span>
                        <span className="text-xs text-[#6C757D] font-mono ml-2">[{line.product?.sku}]</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#6C757D]">Required: <strong>{line.quantity}</strong></span>
                        <Badge variant={isMatched ? "success" : "danger"} size="sm">
                          Assigned: {totalAssigned} / {line.quantity}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {warehouses.map((w) => (
                        <div key={w.id} className="p-2.5 bg-[#F8F9FA] rounded-[6px] border border-[#DEE2E6] text-xs">
                          <div className="font-semibold text-[#212529] truncate">{w.name} ({w.code})</div>
                          <div className="text-[10px] text-[#6C757D] mb-1.5">
                            Weight: {Number(w.shippingWeight).toFixed(2)}
                          </div>
                          <input
                            type="number"
                            min="0"
                            placeholder="Qty"
                            value={lineConfig[w.id] ?? 0}
                            onChange={(e) => handleManualOverrideChange(line.id, w.id, e.target.value)}
                            className="w-full h-8 px-2 text-xs border border-[#CED4DA] rounded bg-white text-right font-semibold focus:border-[#714B67] focus:outline-none"
                          />
                        </div>
                      ))}

                      {/* Backorder input */}
                      <div className="p-2.5 bg-[#FFF4E5] rounded-[6px] border border-[#FD7E14]/30 text-xs">
                        <div className="font-semibold text-[#7A4100]">Mark Backorder</div>
                        <div className="text-[10px] text-[#7A4100]/80 mb-1.5">Unfulfilled pending stock</div>
                        <input
                          type="number"
                          min="0"
                          placeholder="Backorder Qty"
                          value={lineConfig.backorder ?? 0}
                          onChange={(e) => handleManualOverrideChange(line.id, "backorder", e.target.value)}
                          className="w-full h-8 px-2 text-xs border border-[#FD7E14] rounded bg-white text-right font-semibold text-[#7A4100] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setManualOverrideMode(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={handleSaveManualOverride}
                >
                  Save Manual Allocation Override
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* ========================================================================= */}
        {/* DETAILED INVOICING STAGE                                                  */}
        {/* ========================================================================= */}
        <Card
          title="Invoices &amp; Billing Streams"
          subtitle="Detailed commercial tax invoices generated from confirmed warehouse fulfillment allocations"
        >
          {invoices.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#6C757D] bg-[#F8F9FA] rounded-[6px]">
              No invoices generated yet. After confirming the fulfillment split, click &quot;Generate Detailed Invoice&quot;.
            </div>
          ) : (
            <div className="space-y-4">
              <Table headers={["Invoice #", "Type", "Status", "Issue Date", "Subtotal", "Tax (18%)", "Total Amount", "Paid", "Balance Due", "Actions"]}>
                {invoices.map((inv) => {
                  const balance = Math.max(0, Number(inv.totalAmount) - Number(inv.amountPaid || 0));
                  return (
                    <tr key={inv.id} className="border-t border-[#E9ECEF] hover:bg-[#F8F9FA]/60 transition">
                      <td className="px-4 py-3 font-mono font-bold text-sm text-[#714B67]">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-xs">{inv.invoiceType}</td>
                      <td className="px-4 py-3">
                        <Badge variant={INVOICE_VARIANT[inv.status] || "neutral"} size="sm">
                          {inv.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#6C757D]">
                        {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{money(inv.subtotal)}</td>
                      <td className="px-4 py-3 text-xs font-mono">{money(inv.taxAmount)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-[#212529] font-mono">{money(inv.totalAmount)}</td>
                      <td className="px-4 py-3 text-xs font-mono text-[#198754]">{money(inv.amountPaid || 0)}</td>
                      <td className="px-4 py-3 text-xs font-mono font-semibold text-[#DC3545]">{money(balance)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-xs"
                            onClick={() => setActiveInvoiceDetail(inv)}
                          >
                            View Tax Invoice
                          </Button>

                          {inv.status === "DRAFT" && (
                            <Button
                              variant="primary"
                              size="sm"
                              className="text-xs"
                              disabled={busy}
                              onClick={() =>
                                run("Invoice posted for collection!", () =>
                                  apiClient.post(`/invoices/${inv.id}/post`, {})
                                )
                              }
                            >
                              Post
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          )}
        </Card>
      </main>

      {/* ========================================================================= */}
      {/* DETAILED COMMERCIAL TAX INVOICE MODAL                                     */}
      {/* ========================================================================= */}
      {activeInvoiceDetail && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[12px] shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-[#CED4DA]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E9ECEF] flex items-center justify-between bg-[#F8F9FA] rounded-t-[12px]">
              <div>
                <h3 className="font-bold text-base text-[#212529]">Commercial Tax Invoice</h3>
                <p className="text-xs text-[#6C757D]">Official invoice with line-level fulfillment dispatch provenance</p>
              </div>
              <button
                onClick={() => setActiveInvoiceDetail(null)}
                className="text-sm font-semibold text-[#6C757D] hover:text-[#212529] px-2 py-1 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Body: Printable Invoice View */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-[#212529]">
              {/* Header Box */}
              <div className="flex justify-between items-start border-b border-[#DEE2E6] pb-4">
                <div>
                  <h2 className="text-lg font-extrabold text-[#714B67]">DealFlow360 Technologies Pvt Ltd</h2>
                  <p className="text-[#6C757D] text-[11px] mt-0.5">Industrial Layout, Whitefield, Bengaluru, Karnataka 560066</p>
                  <p className="text-[#6C757D] text-[11px]">GSTIN: 29AABCU9603R1ZM • support@dealflow360.internal</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-[#212529]">{activeInvoiceDetail.invoiceNumber}</div>
                  <div className="mt-1">
                    <Badge variant={INVOICE_VARIANT[activeInvoiceDetail.status] || "neutral"} size="sm">
                      {activeInvoiceDetail.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[#6C757D] mt-1">
                    Issue Date: {activeInvoiceDetail.issueDate ? new Date(activeInvoiceDetail.issueDate).toLocaleDateString() : "Today"}
                  </p>
                  <p className="text-[11px] text-[#6C757D]">Terms: Net 30 Days</p>
                </div>
              </div>

              {/* Billed To & Order Details */}
              <div className="grid grid-cols-2 gap-6 bg-[#F8F9FA] p-4 rounded-[6px] border border-[#E9ECEF]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#6C757D] tracking-wider block mb-1">
                    Billed To (Customer):
                  </span>
                  <div className="font-bold text-sm text-[#212529]">{order?.customer?.name || "Corporate Customer"}</div>
                  <div className="text-[#6C757D]">{order?.customer?.contactEmail || "billing@client.corp"}</div>
                  <div className="text-[#6C757D] mt-1">{order?.customer?.billingAddress || "Standard Commercial Address"}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#6C757D] tracking-wider block mb-1">
                    Commercial Order Reference:
                  </span>
                  <div>Order Reference: <strong className="font-mono">{order?.orderNumber}</strong></div>
                  <div>Quotation Reference: <strong className="font-mono">{order?.quotation?.quotationNumber || "QTN-ORIGIN"}</strong></div>
                  <div>Fulfillment State: <strong className="text-[#198754]">{currentOrderStatus}</strong></div>
                </div>
              </div>

              {/* Invoice Itemized Lines */}
              <div>
                <h4 className="text-xs font-bold text-[#495057] uppercase tracking-wider mb-2">Itemized Goods &amp; Fulfillment Provenance</h4>
                <div className="border border-[#E9ECEF] rounded-[6px] overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#F8F9FA] text-[#495057] border-b border-[#DEE2E6]">
                      <tr>
                        <th className="p-2.5 font-semibold">Description &amp; Fulfillment Dispatch Origin</th>
                        <th className="p-2.5 font-semibold text-right">Qty</th>
                        <th className="p-2.5 font-semibold text-right">Unit Price</th>
                        <th className="p-2.5 font-semibold text-right">Tax (GST 18%)</th>
                        <th className="p-2.5 font-semibold text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9ECEF]">
                      {(activeInvoiceDetail.lines || []).map((l, idx) => (
                        <tr key={idx} className="hover:bg-[#F8F9FA]/40">
                          <td className="p-2.5">
                            <div className="font-medium text-[#212529]">{l.description}</div>
                          </td>
                          <td className="p-2.5 text-right font-mono">{l.quantity}</td>
                          <td className="p-2.5 text-right font-mono">{money(l.unitPrice)}</td>
                          <td className="p-2.5 text-right font-mono text-[#6C757D]">{money(l.taxAmount)}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-[#212529]">{money(l.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Total Calculation Strip */}
              <div className="flex justify-end pt-2">
                <div className="w-72 space-y-2 bg-[#F8F9FA] p-4 rounded-[6px] border border-[#DEE2E6]">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6C757D]">Goods Subtotal:</span>
                    <span className="font-mono">{money(activeInvoiceDetail.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6C757D]">Estimated Freight / Transit:</span>
                    <span className="font-mono text-[#198754]">Included in Commercial Terms</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6C757D]">Total GST (18%):</span>
                    <span className="font-mono">{money(activeInvoiceDetail.taxAmount)}</span>
                  </div>
                  <div className="pt-2 border-t border-[#DEE2E6] flex justify-between text-sm font-bold text-[#212529]">
                    <span>Grand Total:</span>
                    <span className="text-[#714B67] font-mono">{money(activeInvoiceDetail.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-[#198754]">
                    <span>Amount Paid:</span>
                    <span className="font-mono">{money(activeInvoiceDetail.amountPaid || 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-[#DC3545] font-bold pt-1 border-t border-[#DEE2E6]">
                    <span>Balance Due:</span>
                    <span className="font-mono">
                      {money(Math.max(0, Number(activeInvoiceDetail.totalAmount) - Number(activeInvoiceDetail.amountPaid || 0)))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-[#E9ECEF] flex items-center justify-between bg-[#F8F9FA] rounded-b-[12px]">
              <span className="text-[11px] text-[#6C757D]">DealFlow360 Enterprise Billing Engine</span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.print()}
                >
                  🖨 Print / PDF
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setActiveInvoiceDetail(null)}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * Order — fulfillment, subscriptions and billing. §9 steps 5, 6 and 8.
 *
 * Shows the recommended warehouse split with its shipment count and cost, the
 * one-time and recurring billing streams kept visibly separate, and payment
 * recording that moves the invoice through DRAFT → POSTED → PARTIALLY_PAID → PAID.
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

  const [plan, setPlan] = useState(null);
  const [subs, setSubs] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [payAmount, setPayAmount] = useState({});

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    setError("");
    // Each of these can legitimately be absent until the matching action has
    // been run, so a failure on one must not blank the whole page.
    const [p, s, inv] = await Promise.all([
      apiClient.get(`/fulfillment/orders/${id}/plan`).catch(() => null),
      apiClient.get(`/subscriptions/orders/${id}`).catch(() => null),
      apiClient.get(`/invoices?orderId=${id}`).catch(() => null),
    ]);
    setPlan(p);
    setSubs(s);
    setInvoices(inv?.invoices || inv || []);
    setLoading(false);
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
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const allocations = plan?.allocations || plan?.plan || plan?.lines || [];
  const subscriptions = subs?.subscriptions || [];
  const oneTime = invoices.filter((i) => i.invoiceType === "ONE_TIME");
  const recurring = invoices.filter((i) => i.invoiceType === "RECURRING");

  const warehouseCount = new Set(
    allocations.filter((a) => a.warehouseId || a.warehouse).map((a) => a.warehouseId || a.warehouse?.id)
  ).size;

  const renderInvoices = (list, title, hint) => (
    <Card title={title} subtitle={hint} padding="p-0">
      {list.length === 0 ? (
        <p className="text-xs text-[#6C757D] p-4">None yet.</p>
      ) : (
        <div className="divide-y divide-[#E9ECEF]">
          {list.map((inv) => {
            const outstanding = Number(inv.totalAmount) - Number(inv.amountPaid || 0);
            return (
              <div key={inv.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[#212529]">{inv.invoiceNumber}</div>
                    <div className="text-[11px] text-[#6C757D]">
                      {money(inv.amountPaid || 0)} paid of {money(inv.totalAmount)}
                    </div>
                  </div>
                  <Badge variant={INVOICE_VARIANT[inv.status] || "neutral"} size="sm">
                    {inv.status.replace(/_/g, " ")}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  {inv.status === "DRAFT" && (
                    <Button
                      variant="secondary" size="sm" className="text-xs" disabled={busy}
                      onClick={() => run("Invoice posted for collection", () =>
                        apiClient.post(`/invoices/${inv.id}/post`, {}))}
                    >
                      Post Invoice
                    </Button>
                  )}

                  {["POSTED", "PARTIALLY_PAID"].includes(inv.status) && (
                    <>
                      <input
                        type="number" min="0" step="0.01"
                        value={payAmount[inv.id] ?? ""}
                        placeholder={outstanding.toFixed(2)}
                        onChange={(e) => setPayAmount((p) => ({ ...p, [inv.id]: e.target.value }))}
                        className="w-28 px-2 py-1 text-sm border border-[#DEE2E6] rounded-[4px]"
                      />
                      <Button
                        variant="primary" size="sm" className="text-xs" disabled={busy}
                        onClick={() => run("Payment recorded", () =>
                          apiClient.post(`/invoices/${inv.id}/payments`, {
                            amount: Number(payAmount[inv.id] || outstanding),
                            paymentMethod: "BANK_TRANSFER",
                          }))}
                      >
                        Record Payment
                      </Button>
                      <span className="text-[11px] text-[#6C757D]">
                        outstanding {money(outstanding)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/quotations" className="text-sm text-[#6C757D] hover:text-[#714B67]">← Pipeline</Link>
          <div>
            <div className="font-bold text-base text-[#212529]">Order Fulfillment & Billing</div>
            <div className="text-[11px] text-[#6C757D]">{id}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="text-xs" disabled={busy}
            onClick={() => run("Allocation accepted", () =>
              apiClient.post(`/fulfillment/orders/${id}/allocate`, {}))}>
            Accept Suggested Split
          </Button>
          <Button variant="secondary" size="sm" className="text-xs" disabled={busy}
            onClick={() => run("Subscriptions and billing schedules created", () =>
              apiClient.post(`/subscriptions/orders/${id}/create`, {}))}>
            Generate Schedules
          </Button>
          <Button variant="primary" size="sm" className="text-xs" disabled={busy}
            onClick={() => run("Invoices generated", () =>
              apiClient.post(`/invoices/generate/${id}`, {}))}>
            Generate Invoices
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-5">
        {notice && (
          <div className="bg-[#E7F5EC] border border-[#28A745]/30 text-[#155724] text-sm rounded-[8px] px-4 py-3">
            {notice}
          </div>
        )}
        {error && (
          <div className="bg-[#FDECEA] border border-[#DC3545]/30 text-[#842029] text-sm rounded-[8px] px-4 py-3">
            {error}
          </div>
        )}

        {/* ── §9 step 5: warehouse split ── */}
        <Card
          title="Warehouse Fulfillment"
          subtitle={
            warehouseCount > 1
              ? `Split across ${warehouseCount} warehouses — no single warehouse could cover this order`
              : "Recommended split based on live stock and shipping weight"
          }
        >
          {allocations.length === 0 ? (
            <p className="text-xs text-[#6C757D]">
              No fulfillment plan yet. Confirm the order first.
            </p>
          ) : (
            <Table headers={["Product", "Warehouse", "Allocated", "Backorder", "Ship cost", "Status"]}>
              {allocations.map((a, i) => (
                <tr key={a.id || i} className="border-t border-[#E9ECEF]">
                  <td className="px-4 py-3 text-sm">
                    {a.product?.name || a.orderLine?.product?.name || a.productName || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {a.warehouse?.name || a.warehouseName || (
                      <Badge variant="warning" size="sm">Backorder</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold">{a.allocatedQty ?? a.quantity ?? 0}</td>
                  <td className="px-4 py-3 text-sm">
                    {Number(a.backorderQty) > 0 ? (
                      <Badge variant="danger" size="sm">{a.backorderQty}</Badge>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">{money(a.shippingCost)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="neutral" size="sm">{a.status || "PLANNED"}</Badge>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* ── §9 step 6: recurring schedule ── */}
        <Card
          title="Subscriptions & Billing Schedule"
          subtitle="Recurring lines bill on their own schedule, separately from the one-time invoice"
        >
          {subscriptions.length === 0 ? (
            <p className="text-xs text-[#6C757D]">
              No recurring lines on this order, or schedules not generated yet.
            </p>
          ) : (
            subscriptions.map((sub) => (
              <div key={sub.id} className="mb-4 last:mb-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-[#212529]">
                    {sub.subscriptionPlan?.name || "Subscription"}
                  </div>
                  <Badge variant="info" size="sm">
                    {sub.subscriptionPlan?.billingInterval || "MONTHLY"}
                  </Badge>
                </div>
                <Table headers={["Period", "Quantity", "Proration", "Amount", "Status"]}>
                  {(sub.billingSchedules || []).slice(0, 6).map((b) => (
                    <tr key={b.id} className="border-t border-[#E9ECEF]">
                      <td className="px-4 py-2 text-sm">
                        {new Date(b.periodStart).toLocaleDateString()} →{" "}
                        {new Date(b.periodEnd).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-sm">{b.quantity}</td>
                      <td className="px-4 py-2 text-sm">
                        {Number(b.prorationFactor) === 1 ? "full period" : `×${Number(b.prorationFactor).toFixed(4)}`}
                      </td>
                      <td className="px-4 py-2 text-sm font-semibold">{money(b.amount)}</td>
                      <td className="px-4 py-2">
                        <Badge variant={b.status === "INVOICED" ? "success" : "neutral"} size="sm">
                          {b.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </Table>
                {(sub.billingSchedules || []).length > 6 && (
                  <p className="text-[11px] text-[#6C757D] mt-1">
                    …and {sub.billingSchedules.length - 6} more scheduled periods
                  </p>
                )}
              </div>
            ))
          )}
        </Card>

        {/* ── §9 step 8: the two invoice streams ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {renderInvoices(oneTime, "One-time Invoices", "Hardware and services billed once")}
          {renderInvoices(recurring, "Recurring Invoices", "One invoice per billing period")}
        </div>
      </main>
    </div>
  );
}

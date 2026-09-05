"use client";

/**
 * Subscription plans — PDF §4-A5, and §9 steps 1 and 6.
 * "Define recurring plans (monthly, quarterly, yearly) that can be attached to
 *  specific products · Configure proration rules · Configure cancellation and
 *  partial refund rules."
 *
 * A plan attaches to exactly one SUBSCRIPTION product, so the price on the plan
 * is unambiguous.
 */

import React, { useState, useEffect } from "react";
import apiClient from "../../../lib/apiClient.js";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Table, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners, EmptyRow } from "../../../components/admin/AdminUI.jsx";

const EMPTY = {
  productId: "",
  name: "",
  billingInterval: "MONTHLY",
  price: "",
  prorationEnabled: true,
  cancellationRefundPercent: 0,
};

export default function PlansPage() {
  const plans = useResource("/subscription-plans", "plans");
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    apiClient
      .get("/products")
      .then((d) => setProducts((d.products || []).filter((p) => p.productType === "SUBSCRIPTION")))
      .catch(() => setProducts([]));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const ok = await plans.create(
      {
        productId: form.productId,
        name: form.name,
        billingInterval: form.billingInterval,
        price: Number(form.price),
        prorationEnabled: !!form.prorationEnabled,
        cancellationRefundPercent: Number(form.cancellationRefundPercent) || 0,
      },
      `Plan "${form.name}" created`
    );
    if (ok) setForm(EMPTY);
  };

  return (
    <>
      <AdminHeader
        title="Subscription Plans"
        description="Recurring plans attached to subscription products. A quotation line using a plan generates its own billing schedule, billed separately from one-time lines on the same order."
      />
      <Banners error={plans.error} notice={plans.notice} />

      <Card title="Add a Plan" className="mb-5">
        {products.length === 0 ? (
          <p className="text-xs text-[#FD7E14]">
            No SUBSCRIPTION products exist yet. Create one in Products first — plans can only attach
            to a product of type SUBSCRIPTION.
          </p>
        ) : (
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <Field label="Product" required
              options={products.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` }))}
              value={form.productId} onChange={(v) => setForm((f) => ({ ...f, productId: v }))} />
            <Field label="Plan name" required placeholder="Cloud — Monthly"
              value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Field label="Interval" required
              options={[
                { value: "MONTHLY", label: "Monthly" },
                { value: "QUARTERLY", label: "Quarterly" },
                { value: "YEARLY", label: "Yearly" },
              ]}
              value={form.billingInterval}
              onChange={(v) => setForm((f) => ({ ...f, billingInterval: v }))} />
            <Field label="Price" type="number" required min={0} step="0.01"
              value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} />
            <Field label="Refund on cancel %" type="number" min={0} max={100} step="1"
              value={form.cancellationRefundPercent}
              onChange={(v) => setForm((f) => ({ ...f, cancellationRefundPercent: v }))} />
            <Button type="submit" variant="primary" size="sm" disabled={plans.busy}>
              Create Plan
            </Button>
          </form>
        )}
      </Card>

      <Table headers={["Plan", "Product", "Interval", "Price", "Proration", "Refund", "In use", ""]}>
        {plans.items.length === 0 && !plans.loading && (
          <EmptyRow colSpan={8}>
            No plans configured. Recurring lines cannot be quoted.
          </EmptyRow>
        )}
        {plans.items.map((p) => (
          <tr key={p.id} className="border-t border-[#E9ECEF]">
            <td className="px-4 py-3 text-sm font-medium">{p.name}</td>
            <td className="px-4 py-3 text-sm text-[#6C757D]">{p.product?.sku}</td>
            <td className="px-4 py-3"><Badge variant="info" size="sm">{p.billingInterval}</Badge></td>
            <td className="px-4 py-3 text-sm font-semibold">
              ₹{Number(p.price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </td>
            <td className="px-4 py-3 text-sm">{p.prorationEnabled ? "enabled" : "off"}</td>
            <td className="px-4 py-3 text-sm text-[#6C757D]">
              {Number(p.cancellationRefundPercent).toFixed(0)}%
            </td>
            <td className="px-4 py-3 text-sm">{p._count?.subscriptions ?? 0}</td>
            <td className="px-4 py-3">
              <Button variant="danger" size="sm" className="text-xs" disabled={plans.busy}
                onClick={() => plans.remove(p.id, "Plan deleted")}>
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </Table>

      <p className="text-[11px] text-[#6C757D] mt-3">
        A plan with active subscriptions cannot be deleted — deactivate it instead.
      </p>
    </>
  );
}

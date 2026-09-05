"use client";

/**
 * Subscription plans legacy redirect / information page.
 * Subscription plans are now managed directly within each Subscription Product
 * at /admin/subscription-products.
 */

import React from "react";
import Link from "next/link";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Table, Badge } from "../../../components/ui/index.js";
import { AdminHeader, EmptyRow } from "../../../components/admin/AdminUI.jsx";

export default function PlansPage() {
  const plans = useResource("/subscription-plans", "plans");

  return (
    <>
      <AdminHeader
        section="Catalogue"
        title="Subscription Plans"
        description="Subscription plans and recurring pricing are now configured directly within each SaaS product under Catalogue → Subscription Products."
      >
        <Link href="/admin/subscription-products">
          <Button variant="primary" size="sm">
            Go to Subscription Products →
          </Button>
        </Link>
      </AdminHeader>

      <div className="bg-[#EBF5FB] border border-[#2980B9]/30 rounded-[8px] p-4 mb-6 text-sm text-[#1B4F72] flex items-center justify-between">
        <div>
          <strong>Catalogue Redesign Notice:</strong> Subscription Products and recurring billing plans
          are now managed together in the new <strong>Subscription Products</strong> section. You no
          longer need to create products in one tab and plans in another.
        </div>
        <Link href="/admin/subscription-products" className="shrink-0 ml-4">
          <Button variant="secondary" size="sm">
            Open Subscription Products
          </Button>
        </Link>
      </div>

      <Card title="Existing Configured Plans (Read-Only Overview)">
        <Table headers={["Plan", "Product SKU", "Interval", "Price", "Proration", "Refund %", "In Use"]}>
          {plans.items.length === 0 && !plans.loading && (
            <EmptyRow colSpan={7}>No recurring plans currently configured.</EmptyRow>
          )}
          {plans.items.map((p) => (
            <tr key={p.id} className="border-b border-[#E9ECEF] hover:bg-[#F8F9FA]">
              <td className="px-4 py-3 font-medium text-[#212529]">{p.name}</td>
              <td className="px-4 py-3 font-mono text-xs text-[#714B67]">{p.product?.sku || "—"}</td>
              <td className="px-4 py-3">
                <Badge variant={p.billingInterval === "YEARLY" ? "success" : "info"} size="sm">
                  {p.billingInterval}
                </Badge>
              </td>
              <td className="px-4 py-3 font-semibold text-[#212529]">
                ₹{Number(p.price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-3 text-xs text-[#495057]">
                {p.prorationEnabled ? "Yes" : "No"}
              </td>
              <td className="px-4 py-3 text-xs text-[#495057]">{p.cancellationRefundPercent}%</td>
              <td className="px-4 py-3 text-xs text-[#6C757D]">{p._count?.subscriptions || 0} active</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

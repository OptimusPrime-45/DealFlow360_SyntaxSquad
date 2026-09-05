"use client";

/**
 * Configuration overview — a readiness check for the §9 walkthrough.
 *
 * Reads the actual configuration and reports whether each part of the pipeline
 * has what it needs. Under a DENY unconfigured-ceiling policy a half-configured
 * system routes EVERY quotation, which looks like a broken demo rather than a
 * missing rule — so it is worth seeing at a glance.
 */

import React, { useState, useEffect } from "react";
import Link from "next/link";
import apiClient from "../../lib/apiClient.js";
import { Card, Badge } from "../../components/ui/index.js";

// Most endpoints wrap their payload in a named key, but a few
// (/governance/discount-rules, /approvals/policies) return a bare array.
// Accept either rather than silently reporting "nothing configured".
const get = (p, pick, fallback = []) =>
  apiClient
    .get(p)
    .then((d) => (Array.isArray(d) ? d : (d?.[pick] ?? fallback)))
    .catch(() => fallback);

export default function AdminOverviewPage() {
  const [state, setState] = useState(null);

  useEffect(() => {
    (async () => {
      const [settings, tiers, rules, policies, products, plans, warehouses, stock, upsell] =
        await Promise.all([
          apiClient.get("/governance/settings").then((d) => d.settings || d).catch(() => null),
          get("/customer-tiers", "tiers"),
          get("/governance/discount-rules", "discountRules"),
          get("/approvals/policies", "policies"),
          get("/products", "products"),
          get("/subscription-plans", "plans"),
          get("/warehouses", "warehouses"),
          get("/warehouses/stock/overview", "stock"),
          get("/upsell-rules", "rules"),
        ]);
      setState({ settings, tiers, rules, policies, products, plans, warehouses, stock, upsell });
    })();
  }, []);

  if (!state) return <p className="text-sm text-[#6C757D]">Loading configuration…</p>;

  const activePolicy = state.policies.find((p) => p.isActive);
  const ladder = activePolicy?.steps || [];
  const inertRungs = ladder.filter(
    (s) =>
      s.minBlendedScore !== null &&
      s.minWorstLineOverage !== null &&
      Number(s.minBlendedScore) === Number(s.minWorstLineOverage)
  );
  const splitCapable = state.stock.filter(
    (s) => (s.warehouses || []).filter((w) => w.sellableQty > 0).length >= 2
  );

  const checks = [
    {
      step: "Step 1",
      label: "Discount tiers",
      ok: state.tiers.length > 0,
      detail: `${state.tiers.length} tier(s); ${state.tiers.filter((t) => t.maxDiscountPercent !== null).length} with a ceiling`,
      href: "/admin/tiers",
    },
    {
      step: "Step 1",
      label: "Warehouses",
      ok: state.warehouses.length > 0,
      detail: `${state.warehouses.length} warehouse(s)`,
      href: "/admin/warehouses",
    },
    {
      step: "Step 1",
      label: "Subscription products & plans",
      ok: state.plans.length > 0 && state.products.some((p) => p.productType === "SUBSCRIPTION"),
      detail: `${state.products.filter((p) => p.productType === "SUBSCRIPTION").length} SaaS product(s), ${state.plans.length} recurring plan(s)`,
      href: "/admin/subscription-products",
    },
    {
      step: "Step 2",
      label: "Category ceilings",
      ok: state.rules.length > 0,
      detail:
        state.rules.length > 0
          ? `${state.rules.length} rule(s)`
          : `none — under ${state.settings?.unconfiguredCeilingPolicy} every discount is overage`,
      href: "/admin/discount-rules",
    },
    {
      step: "Step 3",
      label: "Approval ladder",
      ok: ladder.length > 0 && inertRungs.length === 0,
      detail:
        ladder.length === 0
          ? "no rungs — nothing will ever route"
          : inertRungs.length > 0
            ? `${inertRungs.length} rung(s) have equal thresholds — blended trigger inert`
            : `${ladder.length} rung(s) configured`,
      href: "/admin/approval-ladder",
    },
    {
      step: "Step 4",
      label: "Upsell pairings",
      ok: state.upsell.length > 0,
      detail: `${state.upsell.length} pairing(s)`,
      href: "/admin/upsell",
    },
    {
      step: "Step 5",
      label: "Stock across 2+ warehouses",
      ok: splitCapable.length > 0,
      detail:
        splitCapable.length > 0
          ? `${splitCapable.map((s) => s.sku).join(", ")} can split`
          : "no product is stocked in two warehouses — the split cannot be demonstrated",
      href: "/admin/warehouses",
    },
    {
      step: "Catalogue",
      label: "Standard products & services",
      ok:
        state.products.some((p) => p.productType === "ONE_TIME") &&
        state.products.some((p) => p.productType === "SERVICE"),
      detail: `${state.products.filter((p) => p.productType === "ONE_TIME").length} physical product(s), ${state.products.filter((p) => p.productType === "SERVICE").length} service(s)`,
      href: "/admin/services",
    },
  ];

  const failing = checks.filter((c) => !c.ok);

  return (
    <>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#212529]">Configuration Overview</h1>
        <p className="text-sm text-[#6C757D] mt-1 max-w-2xl">
          Everything the deal engine reads at runtime. Changes take effect on the next quotation —
          no restart, no deploy.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <Card padding="p-4">
          <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">Scoring strategy</div>
          <div className="text-base font-bold text-[#212529] mt-1">
            {state.settings?.scoreStrategy?.replace(/_/g, " ").toLowerCase() || "—"}
          </div>
        </Card>
        <Card padding="p-4">
          <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">Unconfigured pairs</div>
          <div className="text-base font-bold text-[#212529] mt-1">
            {state.settings?.unconfiguredCeilingPolicy || "—"}
          </div>
        </Card>
        <Card padding="p-4">
          <div className="text-[11px] uppercase tracking-wide text-[#6C757D]">Readiness</div>
          <div
            className={`text-base font-bold mt-1 ${
              failing.length === 0 ? "text-[#28A745]" : "text-[#FD7E14]"
            }`}
          >
            {checks.length - failing.length} of {checks.length} ready
          </div>
        </Card>
      </div>

      <Card title="Walkthrough readiness" subtitle="What each step of the pipeline needs" padding="p-0">
        <div className="divide-y divide-[#E9ECEF]">
          {checks.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[#F8F9FA] transition"
            >
              <div className="flex items-center gap-3">
                <span className={c.ok ? "text-[#28A745]" : "text-[#FD7E14]"}>
                  {c.ok ? "✔" : "!"}
                </span>
                <div>
                  <div className="text-sm font-medium text-[#212529]">{c.label}</div>
                  <div className="text-[11px] text-[#6C757D]">{c.detail}</div>
                </div>
              </div>
              <Badge variant="neutral" size="sm">{c.step}</Badge>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}

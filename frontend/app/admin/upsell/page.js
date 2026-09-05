"use client";

/**
 * Upsell rules — PDF §4-A6, and §9 step 4.
 * "Define product pairings based on historical co purchase data · Mark products
 *  as currently promoted so they rank higher · Set minimum margin thresholds so
 *  only healthy margin suggestions surface."
 *
 * Ranking is coPurchaseCount × weight, boosted 1.25× when the suggested product
 * is promoted. A suggestion whose own margin falls below the rule's floor is
 * hidden from the rep entirely.
 */

import React, { useState, useEffect } from "react";
import apiClient from "../../../lib/apiClient.js";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Table, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners, EmptyRow } from "../../../components/admin/AdminUI.jsx";

const EMPTY = {
  sourceProductId: "",
  suggestedProductId: "",
  coPurchaseCount: 0,
  weight: 1,
  minMarginPercent: 0,
};

const marginOf = (p) => {
  const price = Number(p?.basePrice ?? 0);
  const cost = Number(p?.costPrice ?? 0);
  return price > 0 ? ((price - cost) / price) * 100 : 0;
};

export default function UpsellRulesPage() {
  const rules = useResource("/upsell-rules", "rules");
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    apiClient
      .get("/products")
      .then((d) => setProducts(d.products || []))
      .catch(() => setProducts([]));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const ok = await rules.create(
      {
        sourceProductId: form.sourceProductId,
        suggestedProductId: form.suggestedProductId,
        coPurchaseCount: Number(form.coPurchaseCount) || 0,
        weight: Number(form.weight) || 1,
        minMarginPercent: Number(form.minMarginPercent) || 0,
      },
      "Pairing created — it will appear in the rep's upsell panel immediately"
    );
    if (ok) setForm(EMPTY);
  };

  const options = products.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` }));

  return (
    <>
      <AdminHeader
        title="Upsell Rules"
        description="Co-purchase pairings shown to the rep while building a quote. When a source product is on the quotation, its paired products are suggested."
      />
      <Banners error={rules.error} notice={rules.notice} />

      <Card title="Add a Pairing" className="mb-5">
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <Field label="When quote contains" required options={options}
            value={form.sourceProductId}
            onChange={(v) => setForm((f) => ({ ...f, sourceProductId: v }))}
            className="md:col-span-2" />
          <Field label="Suggest" required options={options}
            value={form.suggestedProductId}
            onChange={(v) => setForm((f) => ({ ...f, suggestedProductId: v }))}
            className="md:col-span-2" />
          <Field label="Co-purchase count" type="number" min={0}
            value={form.coPurchaseCount}
            onChange={(v) => setForm((f) => ({ ...f, coPurchaseCount: v }))}
            hint="Observed frequency" />
          <Button type="submit" variant="primary" size="sm" disabled={rules.busy}>
            Add Pairing
          </Button>

          <Field label="Weight" type="number" min={0} step="0.1"
            value={form.weight}
            onChange={(v) => setForm((f) => ({ ...f, weight: v }))}
            hint="Multiplier on the count" />
          <Field label="Min margin %" type="number" min={0} max={100} step="0.5"
            value={form.minMarginPercent}
            onChange={(v) => setForm((f) => ({ ...f, minMarginPercent: v }))}
            hint="Hide suggestions below this margin" />
        </form>
      </Card>

      <Table headers={["When quote has", "Suggest", "Count", "Weight", "Score", "Min margin", "Its margin", ""]}>
        {rules.items.length === 0 && !rules.loading && (
          <EmptyRow colSpan={8}>
            No pairings. The rep&apos;s upsell panel will be empty.
          </EmptyRow>
        )}

        {rules.items.map((r) => {
          const suggestedMargin = marginOf(r.suggestedProduct);
          const hidden = suggestedMargin < Number(r.minMarginPercent);
          const score = (r.coPurchaseCount * Number(r.weight) * (r.suggestedProduct?.isPromoted ? 1.25 : 1)).toFixed(1);

          return (
            <tr key={r.id} className="border-t border-[#E9ECEF]">
              <td className="px-4 py-3 text-sm">{r.sourceProduct?.sku}</td>
              <td className="px-4 py-3">
                <div className="text-sm">{r.suggestedProduct?.sku}</div>
                {r.suggestedProduct?.isPromoted && (
                  <Badge variant="warning" size="sm">promoted ×1.25</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-sm">{r.coPurchaseCount}</td>
              <td className="px-4 py-3 text-sm">{Number(r.weight).toFixed(2)}</td>
              <td className="px-4 py-3 text-sm font-semibold">{score}</td>
              <td className="px-4 py-3 text-sm text-[#6C757D]">
                {Number(r.minMarginPercent).toFixed(1)}%
              </td>
              <td className="px-4 py-3">
                <span className={`text-sm ${hidden ? "text-[#DC3545] font-semibold" : "text-[#28A745]"}`}>
                  {suggestedMargin.toFixed(1)}%
                </span>
                {hidden && (
                  <div className="text-[10px] text-[#DC3545]">below floor — hidden</div>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" className="text-xs" disabled={rules.busy}
                    onClick={() => rules.update(r.id, { isActive: !r.isActive },
                      r.isActive ? "Pairing deactivated" : "Pairing reactivated")}>
                    {r.isActive ? "Off" : "On"}
                  </Button>
                  <Button variant="danger" size="sm" className="text-xs" disabled={rules.busy}
                    onClick={() => rules.remove(r.id, "Pairing deleted")}>
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          );
        })}
      </Table>

      <p className="text-[11px] text-[#6C757D] mt-3">
        PDF §4-A6 assumes pairings come from historical co-purchase data. On a fresh database there
        is no history, so the count is entered by hand and stands in for observed frequency.
      </p>
    </>
  );
}

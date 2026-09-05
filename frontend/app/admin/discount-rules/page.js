"use client";

/**
 * Discount rules — PDF §4-A3 bullet 2.
 * "Define category specific discount ceilings (some product categories allow
 *  higher discretion than others)."
 *
 * This is the table behind the PDF §10 worked example: a Gold customer allowed
 * 15% overall still cannot discount a thin-margin service past its own 10%.
 */

import React, { useState, useEffect } from "react";
import apiClient from "../../../lib/apiClient.js";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Table, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners, EmptyRow } from "../../../components/admin/AdminUI.jsx";

const ANY = "__ANY__";
const EMPTY = {
  customerTierId: ANY,
  categoryId: ANY,
  maxDiscountPercent: "",
  minMarginPercent: 0,
  priority: 0,
};

export default function DiscountRulesPage() {
  const rules = useResource("/governance/discount-rules", "discountRules");
  const [tiers, setTiers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    Promise.all([
      apiClient.get("/customer-tiers").catch(() => ({ tiers: [] })),
      apiClient.get("/categories").catch(() => ({ categories: [] })),
    ]).then(([t, c]) => {
      setTiers(t.tiers || []);
      setCategories(c.categories || []);
    });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const ok = await rules.run(
      () =>
        apiClient.post("/governance/discount-rules", {
          // "__ANY__" means the rule is not scoped on that dimension, so it is
          // sent as null — a category rule that applies to every tier, or a
          // tier rule that applies to every category.
          customerTierId: form.customerTierId === ANY ? null : form.customerTierId,
          categoryId: form.categoryId === ANY ? null : form.categoryId,
          maxDiscountPercent: Number(form.maxDiscountPercent),
          minMarginPercent: Number(form.minMarginPercent) || 0,
          priority: Number(form.priority) || 0,
        }),
      "Discount rule created — effective on the next quotation"
    );
    if (ok) setForm(EMPTY);
  };

  const toggle = (rule) =>
    rules.run(
      () =>
        apiClient.put(`/governance/discount-rules/${rule.id}`, { isActive: !rule.isActive }),
      rule.isActive ? "Rule deactivated" : "Rule reactivated"
    );

  const del = (rule) =>
    rules.run(
      () => apiClient.delete(`/governance/discount-rules/${rule.id}`),
      "Rule deleted"
    );

  const tierOptions = [
    { value: ANY, label: "Any tier" },
    ...tiers.map((t) => ({ value: t.id, label: t.name })),
  ];
  const categoryOptions = [
    { value: ANY, label: "Any category" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <>
      <AdminHeader
        title="Discount Rules"
        description="Per-category ceilings layered on top of the tier ceiling. Where several rules match a line, the strictest one wins."
      />
      <Banners error={rules.error} notice={rules.notice} />

      <Card title="Add a Rule" className="mb-5">
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <Field
            label="Tier" options={tierOptions}
            value={form.customerTierId}
            onChange={(v) => setForm((f) => ({ ...f, customerTierId: v || ANY }))}
          />
          <Field
            label="Category" options={categoryOptions}
            value={form.categoryId}
            onChange={(v) => setForm((f) => ({ ...f, categoryId: v || ANY }))}
          />
          <Field
            label="Max discount %" type="number" required min={0} max={100} step="0.5"
            value={form.maxDiscountPercent}
            onChange={(v) => setForm((f) => ({ ...f, maxDiscountPercent: v }))}
          />
          <Field
            label="Min margin %" type="number" min={0} max={100} step="0.5"
            value={form.minMarginPercent}
            onChange={(v) => setForm((f) => ({ ...f, minMarginPercent: v }))}
            hint="Floor for suggestions"
          />
          <Field
            label="Priority" type="number"
            value={form.priority}
            onChange={(v) => setForm((f) => ({ ...f, priority: v }))}
            hint="Tie-break for margin floor"
          />
          <Button type="submit" variant="primary" size="sm" disabled={rules.busy}>
            Create Rule
          </Button>
        </form>
      </Card>

      <Table headers={["Tier", "Category", "Max discount", "Min margin", "Priority", "Status", ""]}>
        {rules.items.length === 0 && !rules.loading && (
          <EmptyRow colSpan={7}>
            No category rules. Lines fall back to the tier ceiling, then to the engine&apos;s
            unconfigured-ceiling policy.
          </EmptyRow>
        )}

        {rules.items.map((r) => (
          <tr key={r.id} className="border-t border-[#E9ECEF]">
            <td className="px-4 py-3 text-sm">
              {r.customerTier?.name || <span className="text-[#6C757D] italic">any tier</span>}
            </td>
            <td className="px-4 py-3 text-sm">
              {r.category?.name || <span className="text-[#6C757D] italic">any category</span>}
            </td>
            <td className="px-4 py-3 text-sm font-semibold">
              {Number(r.maxDiscountPercent).toFixed(2)}%
            </td>
            <td className="px-4 py-3 text-sm text-[#6C757D]">
              {Number(r.minMarginPercent).toFixed(2)}%
            </td>
            <td className="px-4 py-3 text-sm text-[#6C757D]">{r.priority}</td>
            <td className="px-4 py-3">
              <Badge variant={r.isActive ? "success" : "neutral"} size="sm">
                {r.isActive ? "active" : "inactive"}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="text-xs"
                  disabled={rules.busy} onClick={() => toggle(r)}>
                  {r.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="danger" size="sm" className="text-xs"
                  disabled={rules.busy} onClick={() => del(r)}>
                  Delete
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <div className="mt-4 bg-[#F8F9FA] border border-[#E9ECEF] rounded-[8px] p-4">
        <div className="text-xs font-semibold text-[#495057] mb-1">Worked example (PDF §10)</div>
        <p className="text-xs text-[#6C757D]">
          Gold is allowed 15%. Hardware also allows 15%, but Professional Services only 10%. A quote
          with a laptop at 12% and a setup service at 18% is fine on the laptop and{" "}
          <strong>8 points over on the service</strong> — so the whole quotation is flagged, because
          of that one line.
        </p>
      </div>
    </>
  );
}

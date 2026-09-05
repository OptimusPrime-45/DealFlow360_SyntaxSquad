"use client";

/**
 * Customer tiers — PDF §4-A3 bullet 1.
 * "Define discount ceilings per customer tier (Bronze up to 5%, Silver up to
 *  10%, Gold up to 15%)."
 *
 * This is the tier-level ceiling. Category rules layer on top of it, and the
 * stricter of the two always wins.
 */

import React, { useState } from "react";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Table, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners, EmptyRow } from "../../../components/admin/AdminUI.jsx";

const EMPTY = { code: "", name: "", rank: 0, maxDiscountPercent: "" };

export default function TiersPage() {
  const tiers = useResource("/customer-tiers", "tiers");
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    const ok = await tiers.create(
      {
        code: form.code,
        name: form.name,
        rank: Number(form.rank) || 0,
        // Empty means "no tier-level discretion" — sent as null, never as 0,
        // so the engine's unconfigured-ceiling policy decides instead.
        maxDiscountPercent: form.maxDiscountPercent === "" ? null : Number(form.maxDiscountPercent),
      },
      `Tier ${form.code.toUpperCase()} created`
    );
    if (ok) setForm(EMPTY);
  };

  const saveCeiling = (tier) => {
    const value = editing[tier.id];
    if (value === undefined || value === "") return;
    tiers.update(
      tier.id,
      { maxDiscountPercent: Number(value) },
      `${tier.name} ceiling is now ${value}% — effective on the next quotation`
    );
    setEditing((e) => ({ ...e, [tier.id]: undefined }));
  };

  return (
    <>
      <AdminHeader
        title="Customer Tiers"
        description="The tier ceiling is the baseline discretion a customer's tier allows. Category rules can only make it stricter, never looser."
      />
      <Banners error={tiers.error} notice={tiers.notice} />

      <Card title="Add a Tier" className="mb-5">
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <Field
            label="Code" required placeholder="PLATINUM"
            value={form.code}
            onChange={(v) => setForm((f) => ({ ...f, code: v }))}
          />
          <Field
            label="Name" required placeholder="Platinum Tier"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          />
          <Field
            label="Rank" type="number" min={0}
            value={form.rank}
            onChange={(v) => setForm((f) => ({ ...f, rank: v }))}
            hint="Higher = better tier"
          />
          <Field
            label="Ceiling %" type="number" min={0} max={100} step="0.5"
            value={form.maxDiscountPercent}
            onChange={(v) => setForm((f) => ({ ...f, maxDiscountPercent: v }))}
            hint="Blank = no tier discretion"
          />
          <Button type="submit" variant="primary" size="sm" disabled={tiers.busy}>
            Create Tier
          </Button>
        </form>
      </Card>

      <Table headers={["Code", "Name", "Rank", "Ceiling", "", ""]}>
        {tiers.items.length === 0 && !tiers.loading && (
          <EmptyRow colSpan={6}>
            No tiers configured. Every quotation will fall through to the engine&apos;s
            unconfigured-ceiling policy.
          </EmptyRow>
        )}

        {tiers.items.map((t) => (
          <tr key={t.id} className="border-t border-[#E9ECEF]">
            <td className="px-4 py-3">
              <Badge variant="info" size="sm">{t.code}</Badge>
            </td>
            <td className="px-4 py-3 text-sm font-medium text-[#212529]">{t.name}</td>
            <td className="px-4 py-3 text-sm text-[#6C757D]">{t.rank}</td>
            <td className="px-4 py-3">
              {t.maxDiscountPercent === null ? (
                <span className="text-xs text-[#FD7E14]">not set</span>
              ) : (
                <span className="text-sm font-semibold">{Number(t.maxDiscountPercent).toFixed(2)}%</span>
              )}
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" max="100" step="0.5"
                  placeholder="new %"
                  value={editing[t.id] ?? ""}
                  onChange={(e) => setEditing((s) => ({ ...s, [t.id]: e.target.value }))}
                  className="w-24 px-2 py-1 text-sm border border-[#DEE2E6] rounded-[4px]"
                />
                <Button
                  variant="secondary" size="sm" className="text-xs"
                  disabled={tiers.busy || !editing[t.id]}
                  onClick={() => saveCeiling(t)}
                >
                  Update
                </Button>
              </div>
            </td>
            <td className="px-4 py-3">
              <Button
                variant="danger" size="sm" className="text-xs"
                disabled={tiers.busy}
                onClick={() => tiers.remove(t.id, `Tier ${t.code} deleted`)}
              >
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </Table>

      <p className="text-[11px] text-[#6C757D] mt-3">
        A tier in use by customers cannot be deleted — their quotations would have no ceiling to
        resolve against.
      </p>
    </>
  );
}

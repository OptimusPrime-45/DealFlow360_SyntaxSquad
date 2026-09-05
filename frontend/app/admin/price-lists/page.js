"use client";

/**
 * Price lists — PDF §4-A2.
 * "Price Lists: Customer tier based pricing, currency specific rules."
 *
 * Honest boundary: quotation lines currently snapshot from Product.basePrice,
 * so a price list is catalogue configuration that the quoting path does not
 * consume yet. The page says so rather than implying otherwise.
 */

import React, { useState, useEffect } from "react";
import apiClient from "../../../lib/apiClient.js";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Table, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners, EmptyRow } from "../../../components/admin/AdminUI.jsx";

export default function PriceListsPage() {
  const lists = useResource("/price-lists", "priceLists");
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: "", currency: "INR" });
  const [entry, setEntry] = useState({ priceListId: "", productId: "", price: "" });

  useEffect(() => {
    apiClient.get("/products").then((d) => setProducts(d.products || [])).catch(() => {});
  }, []);

  const createList = async (e) => {
    e.preventDefault();
    const ok = await lists.create(form, `Price list "${form.name}" created`);
    if (ok) setForm({ name: "", currency: "INR" });
  };

  const setPrice = async (e) => {
    e.preventDefault();
    const ok = await lists.run(
      () =>
        apiClient.put(`/price-lists/${entry.priceListId}/items`, {
          productId: entry.productId,
          price: Number(entry.price),
        }),
      "Price set"
    );
    if (ok) setEntry((s) => ({ ...s, productId: "", price: "" }));
  };

  return (
    <>
      <AdminHeader
        section="Catalogue"
        title="Price Lists"
        description="Per-product price overrides, scoped by currency. Useful for tier-based or regional pricing."
      />
      <Banners error={lists.error} notice={lists.notice} />

      <div className="mb-4 bg-[#FFF4E5] border border-[#FD7E14]/30 rounded-[8px] px-4 py-3">
        <div className="text-sm font-semibold text-[#7A4100]">Not yet wired into quoting</div>
        <div className="text-xs text-[#7A4100]/80 mt-1">
          Quotation lines currently snapshot their unit price from the product&apos;s list price, so
          entries here are stored but do not change what a rep is quoted. The configuration is real;
          the pricing path that consumes it is not built yet.
        </div>
      </div>

      <Card title="Add a Price List" className="mb-5">
        <form onSubmit={createList} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <Field label="Name" required placeholder="Enterprise INR"
            value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            className="md:col-span-2" />
          <Field label="Currency" required placeholder="INR"
            value={form.currency} onChange={(v) => setForm((f) => ({ ...f, currency: v }))} />
          <Button type="submit" variant="primary" size="sm" disabled={lists.busy}>
            Create List
          </Button>
        </form>
      </Card>

      {lists.items.length > 0 && (
        <Card title="Set a Price" className="mb-5">
          <form onSubmit={setPrice} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <Field label="Price list" required
              options={lists.items.map((l) => ({ value: l.id, label: `${l.name} (${l.currency})` }))}
              value={entry.priceListId}
              onChange={(v) => setEntry((s) => ({ ...s, priceListId: v }))} />
            <Field label="Product" required
              options={products.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` }))}
              value={entry.productId}
              onChange={(v) => setEntry((s) => ({ ...s, productId: v }))} />
            <Field label="Price" type="number" required min={0} step="0.01"
              value={entry.price} onChange={(v) => setEntry((s) => ({ ...s, price: v }))} />
            <Button type="submit" variant="primary" size="sm" disabled={lists.busy}>
              Set Price
            </Button>
          </form>
        </Card>
      )}

      {lists.items.length === 0 && !lists.loading && (
        <Card><p className="text-xs text-[#6C757D]">No price lists configured.</p></Card>
      )}

      <div className="space-y-5">
        {lists.items.map((l) => (
          <Card
            key={l.id}
            title={l.name}
            subtitle={`${l.currency} · ${l._count?.items ?? l.items?.length ?? 0} product price(s)`}
            action={
              <div className="flex gap-2">
                <Badge variant={l.isActive ? "success" : "neutral"} size="sm">
                  {l.isActive ? "active" : "inactive"}
                </Badge>
                <Button variant="danger" size="sm" className="text-xs" disabled={lists.busy}
                  onClick={() => lists.remove(l.id, `Price list "${l.name}" deleted`)}>
                  Delete
                </Button>
              </div>
            }
            padding="p-0"
          >
            <Table headers={["SKU", "Product", "List price", "This list", "Difference", ""]}>
              {(l.items || []).length === 0 && (
                <EmptyRow colSpan={6}>No product prices on this list yet.</EmptyRow>
              )}
              {(l.items || []).map((it) => {
                const base = Number(it.product?.basePrice ?? 0);
                const price = Number(it.price);
                const diff = price - base;
                return (
                  <tr key={it.id} className="border-t border-[#E9ECEF]">
                    <td className="px-4 py-3 text-sm font-medium">{it.product?.sku}</td>
                    <td className="px-4 py-3 text-sm text-[#6C757D]">{it.product?.name}</td>
                    <td className="px-4 py-3 text-sm text-[#6C757D]">
                      ₹{base.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold">
                      ₹{price.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm ${diff < 0 ? "text-[#28A745]" : diff > 0 ? "text-[#DC3545]" : "text-[#6C757D]"}`}>
                        {diff === 0 ? "—" : `${diff > 0 ? "+" : ""}₹${diff.toLocaleString("en-IN")}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="danger" size="sm" className="text-xs" disabled={lists.busy}
                        onClick={() =>
                          lists.run(
                            () => apiClient.delete(`/price-lists/${l.id}/items/${it.id}`),
                            "Entry removed"
                          )
                        }>
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        ))}
      </div>
    </>
  );
}

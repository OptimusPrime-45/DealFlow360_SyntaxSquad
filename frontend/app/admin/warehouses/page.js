"use client";

/**
 * Warehouses & stock — PDF §4-A4, and §9 steps 1 and 5.
 * "Create and manage warehouses · Configure stock levels per warehouse ·
 *  Define shipping cost weighting used by the auto split logic."
 *
 * The split minimises the NUMBER of warehouses first and breaks ties on
 * shipping weight, so a lower weight is preferred when either could serve.
 */

import React, { useState, useEffect } from "react";
import apiClient from "../../../lib/apiClient.js";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Table, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners, EmptyRow } from "../../../components/admin/AdminUI.jsx";

const EMPTY_WH = { code: "", name: "", address: "", shippingWeight: 1, priority: 0 };

export default function WarehousesPage() {
  const warehouses = useResource("/warehouses", "warehouses");
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState([]);
  const [form, setForm] = useState(EMPTY_WH);
  const [stockForm, setStockForm] = useState({ warehouseId: "", productId: "", availableQty: "", reorderLevel: 0 });

  const loadStock = async () => {
    const [p, s] = await Promise.all([
      apiClient.get("/products").catch(() => ({ products: [] })),
      apiClient.get("/warehouses/stock/overview").catch(() => ({ stock: [] })),
    ]);
    setProducts(p.products || []);
    setStock(s.stock || []);
  };

  useEffect(() => {
    loadStock();
  }, []);

  const createWarehouse = async (e) => {
    e.preventDefault();
    const ok = await warehouses.create(
      {
        code: form.code,
        name: form.name,
        address: form.address || null,
        shippingWeight: Number(form.shippingWeight) || 1,
        priority: Number(form.priority) || 0,
      },
      `Warehouse ${form.code} created`
    );
    if (ok) {
      setForm(EMPTY_WH);
      loadStock();
    }
  };

  const setStockLevel = async (e) => {
    e.preventDefault();
    const ok = await warehouses.run(
      () =>
        apiClient.put(`/warehouses/${stockForm.warehouseId}/inventory`, {
          productId: stockForm.productId,
          availableQty: Number(stockForm.availableQty),
          reorderLevel: Number(stockForm.reorderLevel) || 0,
        }),
      "Stock level set"
    );
    if (ok) {
      setStockForm((s) => ({ ...s, productId: "", availableQty: "" }));
      loadStock();
    }
  };

  return (
    <>
      <AdminHeader
        section="Operations"
        title="Warehouses & Stock"
        description="Fulfillment sources for the auto-split. Shipping weight is the tie-breaker when more than one warehouse could serve a line."
      />
      <Banners error={warehouses.error} notice={warehouses.notice} />

      <Card title="Add a Warehouse" className="mb-5">
        <form onSubmit={createWarehouse} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <Field label="Code" required placeholder="WH-WEST"
            value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v }))} />
          <Field label="Name" required placeholder="West Depot"
            value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <Field label="Address" placeholder="City"
            value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))}
            className="md:col-span-2" />
          <Field label="Shipping weight" type="number" min={0} step="0.1"
            value={form.shippingWeight}
            onChange={(v) => setForm((f) => ({ ...f, shippingWeight: v }))}
            hint="Lower is preferred" />
          <Button type="submit" variant="primary" size="sm" disabled={warehouses.busy}>
            Create
          </Button>
        </form>
      </Card>

      <Table headers={["Code", "Name", "Address", "Ship weight", "Priority", "SKUs", ""]}>
        {warehouses.items.length === 0 && !warehouses.loading && (
          <EmptyRow colSpan={7}>No warehouses. Orders cannot be allocated.</EmptyRow>
        )}
        {warehouses.items.map((w) => (
          <tr key={w.id} className="border-t border-[#E9ECEF]">
            <td className="px-4 py-3"><Badge variant="info" size="sm">{w.code}</Badge></td>
            <td className="px-4 py-3 text-sm font-medium">{w.name}</td>
            <td className="px-4 py-3 text-sm text-[#6C757D]">{w.address || "—"}</td>
            <td className="px-4 py-3 text-sm">{Number(w.shippingWeight).toFixed(2)}</td>
            <td className="px-4 py-3 text-sm text-[#6C757D]">{w.priority}</td>
            <td className="px-4 py-3 text-sm">{w._count?.inventory ?? w.inventory?.length ?? 0}</td>
            <td className="px-4 py-3">
              <Button variant="danger" size="sm" className="text-xs" disabled={warehouses.busy}
                onClick={() => warehouses.remove(w.id, `Warehouse ${w.code} deleted`).then(loadStock)}>
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </Table>

      <Card title="Set Stock Level" subtitle="Per product, per warehouse" className="mt-6 mb-5">
        <form onSubmit={setStockLevel} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <Field label="Warehouse" required
            options={warehouses.items.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
            value={stockForm.warehouseId}
            onChange={(v) => setStockForm((s) => ({ ...s, warehouseId: v }))} />
          <Field label="Product" required
            options={products.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` }))}
            value={stockForm.productId}
            onChange={(v) => setStockForm((s) => ({ ...s, productId: v }))} />
          <Field label="Available qty" type="number" required min={0}
            value={stockForm.availableQty}
            onChange={(v) => setStockForm((s) => ({ ...s, availableQty: v }))} />
          <Field label="Reorder level" type="number" min={0}
            value={stockForm.reorderLevel}
            onChange={(v) => setStockForm((s) => ({ ...s, reorderLevel: v }))} />
          <Button type="submit" variant="primary" size="sm" disabled={warehouses.busy}>
            Set Stock
          </Button>
        </form>
      </Card>

      <Card title="Stock Overview" subtitle="Sellable = available − reserved" padding="p-0">
        <div className="divide-y divide-[#E9ECEF]">
          {stock.length === 0 && (
            <p className="text-xs text-[#6C757D] p-4">No stock recorded yet.</p>
          )}
          {stock.map((s) => (
            <div key={s.sku} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-sm font-semibold text-[#212529]">{s.sku}</span>
                  <span className="text-xs text-[#6C757D] ml-2">{s.name}</span>
                </div>
                <span className="text-sm font-semibold">{s.totalAvailable} sellable</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.warehouses.map((w) => (
                  <span key={w.warehouseId}
                    className="text-[11px] px-2 py-1 rounded-[4px] bg-[#F8F9FA] border border-[#E9ECEF]">
                    {w.code}: <strong>{w.sellableQty}</strong>
                    {w.reservedQty > 0 && (
                      <span className="text-[#FD7E14]"> ({w.reservedQty} reserved)</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <p className="text-[11px] text-[#6C757D] mt-3">
        To demonstrate the two-warehouse split, give a product stock in two warehouses where neither
        alone covers the order quantity — the seed ships 5 and 9 for the enterprise laptop.
      </p>
    </>
  );
}

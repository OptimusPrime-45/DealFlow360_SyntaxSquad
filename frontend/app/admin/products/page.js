"use client";

/**
 * Products, categories and variants — PDF §4-A2.
 * "General Info: Name, Category, Price, Unit, Tax, Description ·
 *  Variants: Attribute (Size or Pack), Values, Extra prices."
 *
 * Cost price matters more than it looks: it is the ONLY source of margin in the
 * system. Every margin figure on the quotation, the upsell panel and the
 * approval screen derives from it.
 */

import React, { useState, useEffect } from "react";
import apiClient from "../../../lib/apiClient.js";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Table, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners, EmptyRow } from "../../../components/admin/AdminUI.jsx";

const EMPTY_PRODUCT = {
  sku: "", name: "", description: "", categoryId: "",
  productType: "ONE_TIME", basePrice: "", costPrice: "",
  unit: "unit", taxRate: 0, isPromoted: false,
};

export default function ProductsPage() {
  const products = useResource("/products", "products");
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [categoryName, setCategoryName] = useState("");
  const [variantFor, setVariantFor] = useState(null);
  const [variant, setVariant] = useState({ attribute: "", value: "", extraPrice: 0 });

  const loadCategories = () =>
    apiClient.get("/categories").then((d) => setCategories(d.categories || [])).catch(() => {});

  useEffect(() => {
    loadCategories();
  }, []);

  const createCategory = async (e) => {
    e.preventDefault();
    const ok = await products.run(
      () => apiClient.post("/categories", { name: categoryName }),
      `Category "${categoryName}" created`
    );
    if (ok) {
      setCategoryName("");
      loadCategories();
    }
  };

  const createProduct = async (e) => {
    e.preventDefault();
    const ok = await products.create(
      {
        sku: form.sku,
        name: form.name,
        description: form.description || null,
        categoryId: form.categoryId,
        productType: form.productType,
        basePrice: Number(form.basePrice),
        costPrice: Number(form.costPrice),
        unit: form.unit || "unit",
        taxRate: Number(form.taxRate) || 0,
        isPromoted: !!form.isPromoted,
      },
      `Product ${form.sku} created`
    );
    if (ok) setForm(EMPTY_PRODUCT);
  };

  const addVariant = async (e) => {
    e.preventDefault();
    const ok = await products.run(
      () =>
        apiClient.post(`/products/${variantFor}/variants`, {
          attribute: variant.attribute,
          value: variant.value,
          extraPrice: Number(variant.extraPrice) || 0,
        }),
      "Variant added"
    );
    if (ok) {
      setVariant({ attribute: "", value: "", extraPrice: 0 });
      setVariantFor(null);
    }
  };

  const margin = (p) => {
    const price = Number(p.basePrice);
    return price > 0 ? (((price - Number(p.costPrice)) / price) * 100).toFixed(1) : "0.0";
  };

  return (
    <>
      <AdminHeader
        section="Catalogue"
        title="Products"
        description="Cost price is the only source of margin in the system — every margin figure the rep and the approver see derives from it."
      />
      <Banners error={products.error} notice={products.notice} />

      <Card title="Add a Category" className="mb-5">
        <form onSubmit={createCategory} className="flex items-end gap-3">
          <Field label="Category name" required placeholder="Professional Services"
            value={categoryName} onChange={setCategoryName} className="max-w-sm" />
          <Button type="submit" variant="secondary" size="sm" disabled={products.busy}>
            Create Category
          </Button>
          <span className="text-[11px] text-[#6C757D] pb-2">
            Categories carry their own discount ceilings.
          </span>
        </form>
      </Card>

      <Card title="Add a Product" className="mb-5">
        <form onSubmit={createProduct} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="SKU" required placeholder="HW-LAPTOP-15"
            value={form.sku} onChange={(v) => setForm((f) => ({ ...f, sku: v }))} />
          <Field label="Name" required placeholder="Enterprise Laptop"
            value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <Field label="Category" required
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            value={form.categoryId} onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))} />
          <Field label="Type" required
            options={[
              { value: "ONE_TIME", label: "One-time" },
              { value: "SERVICE", label: "Service" },
              { value: "SUBSCRIPTION", label: "Subscription" },
            ]}
            value={form.productType}
            onChange={(v) => setForm((f) => ({ ...f, productType: v }))} />

          <Field label="List price" type="number" required min={0} step="0.01"
            value={form.basePrice} onChange={(v) => setForm((f) => ({ ...f, basePrice: v }))} />
          <Field label="Cost price" type="number" required min={0} step="0.01"
            value={form.costPrice} onChange={(v) => setForm((f) => ({ ...f, costPrice: v }))}
            hint="Drives every margin figure" />
          <Field label="Unit" value={form.unit}
            onChange={(v) => setForm((f) => ({ ...f, unit: v }))} />
          <Field label="Tax rate %" type="number" min={0} step="0.5"
            value={form.taxRate} onChange={(v) => setForm((f) => ({ ...f, taxRate: v }))} />

          <div className="md:col-span-3">
            <Field label="Description" value={form.description}
              onChange={(v) => setForm((f) => ({ ...f, description: v }))} />
          </div>
          <div className="flex items-end gap-4">
            <Field label="Promoted" type="checkbox" value={form.isPromoted}
              onChange={(v) => setForm((f) => ({ ...f, isPromoted: v }))} />
            <Button type="submit" variant="primary" size="sm" disabled={products.busy}>
              Create Product
            </Button>
          </div>
        </form>
      </Card>

      <Table headers={["SKU", "Name", "Category", "Type", "List", "Cost", "Margin", "Tax", ""]}>
        {products.items.length === 0 && !products.loading && (
          <EmptyRow colSpan={9}>No products yet.</EmptyRow>
        )}
        {products.items.map((p) => (
          <tr key={p.id} className="border-t border-[#E9ECEF]">
            <td className="px-4 py-3">
              <div className="text-sm font-medium">{p.sku}</div>
              {p.isPromoted && <Badge variant="warning" size="sm">promoted</Badge>}
            </td>
            <td className="px-4 py-3 text-sm">{p.name}</td>
            <td className="px-4 py-3 text-sm text-[#6C757D]">{p.category?.name}</td>
            <td className="px-4 py-3"><Badge variant="info" size="sm">{p.productType}</Badge></td>
            <td className="px-4 py-3 text-sm">₹{Number(p.basePrice).toLocaleString("en-IN")}</td>
            <td className="px-4 py-3 text-sm text-[#6C757D]">
              ₹{Number(p.costPrice).toLocaleString("en-IN")}
            </td>
            <td className="px-4 py-3">
              <span className={`text-sm font-semibold ${
                Number(margin(p)) < 15 ? "text-[#DC3545]" : "text-[#28A745]"
              }`}>
                {margin(p)}%
              </span>
            </td>
            <td className="px-4 py-3 text-sm text-[#6C757D]">{Number(p.taxRate).toFixed(1)}%</td>
            <td className="px-4 py-3">
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="text-xs"
                  onClick={() => setVariantFor(variantFor === p.id ? null : p.id)}>
                  Variant
                </Button>
                <Button variant="danger" size="sm" className="text-xs" disabled={products.busy}
                  onClick={() => products.remove(p.id, `${p.sku} deleted`)}>
                  Delete
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      {variantFor && (
        <Card title="Add Variant" subtitle="Attribute, value and the extra price it adds" className="mt-5">
          <form onSubmit={addVariant} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <Field label="Attribute" required placeholder="Size"
              value={variant.attribute}
              onChange={(v) => setVariant((s) => ({ ...s, attribute: v }))} />
            <Field label="Value" required placeholder="Large"
              value={variant.value} onChange={(v) => setVariant((s) => ({ ...s, value: v }))} />
            <Field label="Extra price" type="number" min={0} step="0.01"
              value={variant.extraPrice}
              onChange={(v) => setVariant((s) => ({ ...s, extraPrice: v }))} />
            <Button type="submit" variant="primary" size="sm" disabled={products.busy}>
              Add Variant
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}

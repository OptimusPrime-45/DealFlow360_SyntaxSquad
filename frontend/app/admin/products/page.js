"use client";

/**
 * Products — Physical & Standard Product Catalogue.
 * Simplified management of physical products (Laptops, Monitors, Routers, Office Equipment).
 */

import React, { useState, useEffect } from "react";
import apiClient from "../../../lib/apiClient.js";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Table, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners, EmptyRow } from "../../../components/admin/AdminUI.jsx";

const EMPTY_PRODUCT = {
  sku: "",
  name: "",
  description: "",
  categoryId: "",
  basePrice: "",
  costPrice: "",
};

export default function ProductsPage() {
  const products = useResource("/products?productType=ONE_TIME", "products");
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [categoryName, setCategoryName] = useState("");

  const loadCategories = () =>
    apiClient
      .get("/categories?type=ONE_TIME")
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});

  useEffect(() => {
    loadCategories();
  }, []);

  const createCategory = async (e) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    const ok = await products.run(
      () => apiClient.post("/categories", { name: categoryName.trim(), type: "ONE_TIME" }),
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
        sku: form.sku.trim(),
        name: form.name.trim(),
        description: form.description?.trim() || null,
        categoryId: form.categoryId,
        productType: "ONE_TIME",
        basePrice: Number(form.basePrice) || 0,
        costPrice: Number(form.costPrice) || 0,
        unit: "unit",
        taxRate: 18,
      },
      `Product ${form.sku} created`
    );
    if (ok) setForm(EMPTY_PRODUCT);
  };

  const margin = (p) => {
    const price = Number(p.basePrice);
    return price > 0 ? (((price - Number(p.costPrice)) / price) * 100).toFixed(1) : "0.0";
  };

  return (
    <>
      <AdminHeader
        title="Products"
        description="Physical and standard products catalogue (laptops, workstations, network hardware, equipment)."
      />
      <Banners error={products.error} notice={products.notice} />

      {/* Quick Category Add */}
      <Card title="Add a Product Category" className="mb-4">
        <form onSubmit={createCategory} className="flex items-end gap-3">
          <Field
            label="New Category"
            required
            placeholder="e.g. Hardware, Workstations, Peripherals"
            value={categoryName}
            onChange={setCategoryName}
            className="max-w-sm"
          />
          <Button type="submit" variant="secondary" size="sm" disabled={products.busy}>
            Create Category
          </Button>
        </form>
      </Card>

      {/* Simple Add Product Form */}
      <Card title="Add Product" className="mb-5">
        <form onSubmit={createProduct} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <Field
            label="SKU"
            required
            placeholder="HW-LAPTOP-15"
            value={form.sku}
            onChange={(v) => setForm((f) => ({ ...f, sku: v }))}
          />
          <Field
            label="Product Name"
            required
            placeholder="Enterprise Laptop Pro 15"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          />
          <Field
            label="Category"
            required
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            value={form.categoryId}
            onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
          />
          <Field
            label="Price (₹)"
            type="number"
            required
            min={0}
            step="0.01"
            placeholder="1000.00"
            value={form.basePrice}
            onChange={(v) => setForm((f) => ({ ...f, basePrice: v }))}
          />
          <Field
            label="Cost (₹)"
            type="number"
            required
            min={0}
            step="0.01"
            placeholder="700.00"
            value={form.costPrice}
            onChange={(v) => setForm((f) => ({ ...f, costPrice: v }))}
          />
          <div className="md:col-span-4">
            <Field
              label="Description (Optional)"
              placeholder="Brief description or specifications..."
              value={form.description}
              onChange={(v) => setForm((f) => ({ ...f, description: v }))}
            />
          </div>
          <div>
            <Button type="submit" variant="primary" size="sm" disabled={products.busy} className="w-full">
              Add Product
            </Button>
          </div>
        </form>
      </Card>

      {/* Simplified Products Table */}
      <Table headers={["SKU", "Product Name", "Category", "Price", "Cost", "Margin", "Actions"]}>
        {products.items.length === 0 && !products.loading && (
          <EmptyRow colSpan={7}>No physical products configured.</EmptyRow>
        )}
        {products.items.map((p) => (
          <tr key={p.id} className="border-b border-[#E9ECEF] hover:bg-[#F8F9FA]">
            <td className="px-4 py-3 font-mono text-xs font-semibold text-[#212529]">{p.sku}</td>
            <td className="px-4 py-3 font-medium text-sm text-[#212529]">{p.name}</td>
            <td className="px-4 py-3 text-xs text-[#495057]">{p.category?.name || "—"}</td>
            <td className="px-4 py-3 text-sm font-semibold text-[#212529]">
              ₹{Number(p.basePrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </td>
            <td className="px-4 py-3 text-xs text-[#6C757D]">
              ₹{Number(p.costPrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </td>
            <td className="px-4 py-3">
              <Badge variant={Number(margin(p)) < 15 ? "danger" : "success"} size="sm">
                {margin(p)}%
              </Badge>
            </td>
            <td className="px-4 py-3 text-right">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => products.remove(p.id, `Product ${p.sku} removed`)}
                className="text-xs text-[#DC3545] hover:bg-[#FDECEA]"
              >
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

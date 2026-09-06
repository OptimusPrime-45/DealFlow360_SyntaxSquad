"use client";

/**
 * Products — Physical & Standard Product Catalogue.
 * Features B-Tree fast indexing, Odoo-style search/filter/group by, and batch actions.
 */

import React, { useState, useEffect, useMemo } from "react";
import apiClient from "../../../lib/apiClient.js";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners } from "../../../components/admin/AdminUI.jsx";
import { OdooControlPanel } from "../../../components/ui/OdooControlPanel.jsx";
import { GroupedTable } from "../../../components/ui/GroupedTable.jsx";
import { BatchActionBar } from "../../../components/ui/BatchActionBar.jsx";
import { BTreeSearchIndex } from "../../../lib/btree.js";
import { exportToCSV } from "../../../lib/exportCsv.js";

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
  const [showAddModal, setShowAddModal] = useState(false);

  // Search, Filter & Group By State
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState({
    categoryId: [],
    margin: "",
  });
  const [activeGroupBy, setActiveGroupBy] = useState("category.name");

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState(new Set());

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
    if (ok) {
      setForm(EMPTY_PRODUCT);
      setShowAddModal(false);
    }
  };

  const margin = (p) => {
    const price = Number(p.basePrice);
    return price > 0 ? (((price - Number(p.costPrice)) / price) * 100).toFixed(1) : "0.0";
  };

  // Build client B-Tree Search Index
  const btreeIndex = useMemo(() => {
    const index = new BTreeSearchIndex({ degree: 3 });
    products.items.forEach((p) => {
      index.insertRecord(p.id, {
        sku: p.sku || "",
        name: p.name || "",
        category: p.category?.name || "",
        description: p.description || "",
      });
    });
    return index;
  }, [products.items]);

  // Filtered and Searched items
  const filteredProducts = useMemo(() => {
    let result = products.items;

    // 1. Fast B-Tree Search Query
    if (searchTerm.trim()) {
      const matchIds = btreeIndex.query(searchTerm.trim());
      result = result.filter((p) => matchIds.has(p.id));
    }

    // 2. Category Filter
    if (activeFilters.categoryId && activeFilters.categoryId.length > 0) {
      const catSet = new Set(activeFilters.categoryId);
      result = result.filter((p) => catSet.has(p.categoryId));
    }

    // 3. Margin Filter
    if (activeFilters.margin === "LOW_MARGIN") {
      result = result.filter((p) => Number(margin(p)) < 15);
    } else if (activeFilters.margin === "HEALTHY_MARGIN") {
      result = result.filter((p) => Number(margin(p)) >= 15);
    }

    return result;
  }, [products.items, searchTerm, activeFilters, btreeIndex]);

  // Selection handlers
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = (visibleIds) => {
    setSelectedIds((prev) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleExportSelected = () => {
    const selectedRows = filteredProducts.filter((p) => selectedIds.has(p.id));
    if (selectedRows.length === 0) return;

    exportToCSV(
      selectedRows,
      [
        { key: "sku", label: "SKU" },
        { key: "name", label: "Product Name" },
        { key: "category", label: "Category", formatter: (_, r) => r.category?.name || "—" },
        { key: "basePrice", label: "Base Price (₹)", formatter: (v) => Number(v).toFixed(2) },
        { key: "costPrice", label: "Cost Price (₹)", formatter: (v) => Number(v).toFixed(2) },
        { key: "margin", label: "Margin %", formatter: (_, r) => `${margin(r)}%` },
        { key: "description", label: "Description", formatter: (v) => v || "" },
      ],
      `products_export_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} selected products?`)) return;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await products.remove(id);
    }
    setSelectedIds(new Set());
  };

  const filterGroups = [
    {
      label: "Category",
      key: "categoryId",
      options: categories.map((c) => ({ label: c.name, value: c.id })),
    },
    {
      label: "Margin Health",
      key: "margin",
      options: [
        { label: "Low Margin (< 15%)", value: "LOW_MARGIN" },
        { label: "Healthy Margin (≥ 15%)", value: "HEALTHY_MARGIN" },
      ],
    },
  ];

  const groupByOptions = [
    { label: "Category", value: "category.name" },
    { label: "None", value: "" },
  ];

  return (
    <>
      <AdminHeader
        section="Catalogue"
        title="Products"
        description="Physical and standard products catalogue (laptops, workstations, network hardware, equipment)."
      />
      <Banners error={products.error} notice={products.notice} />

      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAddModal(!showAddModal)}
          >
            {showAddModal ? "✕ Close Form" : "+ Add New Product"}
          </Button>
        </div>

        {/* Quick Category Add inline */}
        <form onSubmit={createCategory} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="New Category..."
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            className="h-8 px-2.5 text-xs bg-white text-[#212529] border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67]"
          />
          <Button type="submit" variant="secondary" size="sm" disabled={products.busy}>
            + Category
          </Button>
        </form>
      </div>

      {/* Expandable Add Product Form */}
      {showAddModal && (
        <Card title="Add Product" className="mb-5 animate-in fade-in duration-150">
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
                Save Product
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Control Panel: Search, Filter, Group By */}
      <OdooControlPanel
        className="mb-3"
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="Search products by SKU, name, or category."
        filterGroups={filterGroups}
        activeFilters={activeFilters}
        onFilterChange={(key, val) => setActiveFilters((prev) => ({ ...prev, [key]: val }))}
        groupByOptions={groupByOptions}
        activeGroupBy={activeGroupBy}
        onGroupByChange={setActiveGroupBy}
        totalCount={products.items.length}
        filteredCount={filteredProducts.length}
        onResetAll={() => {
          setSearchTerm("");
          setActiveFilters({ categoryId: [], margin: "" });
          setActiveGroupBy("category.name");
        }}
      />

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedIds.size}
        totalCount={filteredProducts.length}
        onSelectAll={() => setSelectedIds(new Set(filteredProducts.map((p) => p.id)))}
        onClearSelection={() => setSelectedIds(new Set())}
        actions={[
          {
            label: "Export Selected (CSV)",
            icon: "📥",
            onClick: handleExportSelected,
            variant: "secondary",
          },
          {
            label: `Delete Selected (${selectedIds.size})`,
            icon: "🗑️",
            onClick: handleBulkDelete,
            variant: "danger",
          },
        ]}
      />

      {/* Grouped & Selectable Table */}
      <GroupedTable
        headers={[
          { label: "SKU", key: "sku", className: "w-36 font-mono" },
          { label: "Product Name", key: "name" },
          { label: "Category", key: "category.name", className: "w-36" },
          { label: "Price", key: "basePrice", className: "w-32" },
          { label: "Cost", key: "costPrice", className: "w-28" },
          { label: "Margin", key: "margin", className: "w-24" },
          { label: "Actions", key: "actions", className: "w-24 text-right" },
        ]}
        data={filteredProducts}
        getId={(p) => p.id}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={(ids) => handleToggleSelectAll(ids)}
        groupBy={activeGroupBy}
        aggregateCols={[
          {
            key: "basePrice",
            label: "Avg Price",
            type: "avg",
            formatter: (val) => `₹${val.toFixed(2)}`,
          },
        ]}
        emptyMessage="No products match your search or filter."
        renderRow={(p, isSelected, toggleSelect) => (
          <tr
            key={p.id}
            className={`border-b border-[#E9ECEF] hover:bg-[#F8F9FA] transition-colors ${
              isSelected ? "bg-[#714B67]/5" : ""
            }`}
          >
            <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={toggleSelect}
                className="w-4 h-4 accent-[#714B67] rounded cursor-pointer"
              />
            </td>
            <td className="px-4 py-3 font-mono text-xs font-bold text-[#714B67]">{p.sku}</td>
            <td className="px-4 py-3 font-semibold text-sm text-[#212529]">{p.name}</td>
            <td className="px-4 py-3 text-xs text-[#495057]">{p.category?.name || "—"}</td>
            <td className="px-4 py-3 text-sm font-bold text-[#212529]">
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
        )}
      />
    </>
  );
}

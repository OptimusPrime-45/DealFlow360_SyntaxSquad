"use client";

/**
 * Subscription Products — Recurring Software & SaaS Catalogue.
 * Enhanced with B-Tree search index, OdooControlPanel, GroupedTable with checkboxes, and BatchActionBar.
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

const DURATION_OPTIONS = [
  { value: "MONTHLY", label: "Monthly (Billed Every Month)" },
  { value: "QUARTERLY", label: "Quarterly (Billed Every 3 Months)" },
  { value: "YEARLY", label: "Yearly (Billed Annually)" },
  { value: "MULTI", label: "Multi-Duration Plans (Monthly, Quarterly, Yearly)" },
];

const DURATION_LABELS = {
  MONTHLY: { unit: "mo", priceLabel: "Price per Month (₹)", costLabel: "Cost per Month (₹)", helper: "/month" },
  QUARTERLY: { unit: "qtr", priceLabel: "Price per Quarter (₹)", costLabel: "Cost per Quarter (₹)", helper: "/quarter" },
  YEARLY: { unit: "yr", priceLabel: "Price per Year (₹)", costLabel: "Cost per Year (₹)", helper: "/year" },
};

const EMPTY_SUBSCRIPTION = {
  sku: "",
  name: "",
  description: "",
  categoryId: "",
  billingInterval: "MONTHLY",
  price: "",
  costPrice: "",
  monthlyPrice: "",
  quarterlyPrice: "",
  yearlyPrice: "",
  startDate: "",
  endDate: "",
};

export default function SubscriptionProductsPage() {
  const products = useResource("/subscription-products", "subscriptionProducts");
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_SUBSCRIPTION);
  const [categoryName, setCategoryName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Search, Filter & Group By State
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState({
    categoryId: [],
    interval: [],
  });
  const [activeGroupBy, setActiveGroupBy] = useState("category.name");

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState(new Set());

  const loadCategories = () =>
    apiClient
      .get("/categories?type=SUBSCRIPTION")
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});

  useEffect(() => {
    loadCategories();
  }, []);

  const createCategory = async (e) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    const ok = await products.run(
      () => apiClient.post("/categories", { name: categoryName.trim(), type: "SUBSCRIPTION" }),
      `Category "${categoryName}" created`
    );
    if (ok) {
      setCategoryName("");
      loadCategories();
    }
  };

  const createProduct = async (e) => {
    e.preventDefault();

    let payload = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      description: form.description?.trim() || null,
      categoryId: form.categoryId,
      billingInterval: form.billingInterval,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
      endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
    };

    if (form.billingInterval === "MULTI") {
      payload = {
        ...payload,
        costPrice: Number(form.costPrice) || 0,
        monthlyPrice: Number(form.monthlyPrice) || 0,
        quarterlyPrice: form.quarterlyPrice ? Number(form.quarterlyPrice) : undefined,
        yearlyPrice: form.yearlyPrice ? Number(form.yearlyPrice) : undefined,
        unit: "multi",
      };
    } else {
      payload = {
        ...payload,
        price: Number(form.price) || 0,
        costPrice: Number(form.costPrice) || 0,
        unit: form.billingInterval.toLowerCase(),
      };
    }

    const ok = await products.create(payload, `Subscription product ${form.sku} created`);
    if (ok) {
      setForm(EMPTY_SUBSCRIPTION);
      setShowAddForm(false);
    }
  };

  const currentDurationMeta = DURATION_LABELS[form.billingInterval] || DURATION_LABELS.MONTHLY;

  // Build client B-Tree Search Index
  const btreeIndex = useMemo(() => {
    const index = new BTreeSearchIndex({ degree: 3 });
    products.items.forEach((p) => {
      const plans = p.subscriptionPlans || [];
      const intervals = plans.map((pl) => pl.billingInterval).join(" ");
      index.insertRecord(p.id, {
        sku: p.sku || "",
        name: p.name || "",
        category: p.category?.name || "",
        interval: intervals,
        description: p.description || "",
      });
    });
    return index;
  }, [products.items]);

  // Filtered & Searched items
  const filteredProducts = useMemo(() => {
    let result = products.items;

    // 1. B-Tree Query
    if (searchTerm.trim()) {
      const matchIds = btreeIndex.query(searchTerm.trim());
      result = result.filter((p) => matchIds.has(p.id));
    }

    // 2. Category Filter
    if (activeFilters.categoryId && activeFilters.categoryId.length > 0) {
      const catSet = new Set(activeFilters.categoryId);
      result = result.filter((p) => catSet.has(p.categoryId));
    }

    // 3. Billing Interval Filter
    if (activeFilters.interval && activeFilters.interval.length > 0) {
      const intSet = new Set(activeFilters.interval);
      result = result.filter((p) => {
        const plans = p.subscriptionPlans || [];
        return plans.some((pl) => intSet.has(pl.billingInterval));
      });
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
        { key: "name", label: "Software Product" },
        { key: "category", label: "Category", formatter: (_, r) => r.category?.name || "—" },
        {
          key: "plans",
          label: "Plans / Intervals",
          formatter: (_, r) => (r.subscriptionPlans || []).map((pl) => `${pl.billingInterval}: ₹${pl.price}`).join(" | "),
        },
        { key: "costPrice", label: "Cost Price (₹)", formatter: (v) => Number(v).toFixed(2) },
      ],
      `subscription_products_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} selected items?`)) return;
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
      label: "Billing Duration",
      key: "interval",
      options: [
        { label: "Monthly", value: "MONTHLY" },
        { label: "Quarterly", value: "QUARTERLY" },
        { label: "Yearly", value: "YEARLY" },
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
        title="Subscription Products"
        description="Software and SaaS products sold through recurring billing. Select a billing duration with matched price and cost."
      />
      <Banners error={products.error} notice={products.notice} />

      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? "✕ Close Form" : "+ Add Subscription Product"}
        </Button>

        {/* Quick Category Add */}
        <form onSubmit={createCategory} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="New SaaS Category..."
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            className="h-8 px-2.5 text-xs bg-white text-[#212529] border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67]"
          />
          <Button type="submit" variant="secondary" size="sm" disabled={products.busy}>
            + Category
          </Button>
        </form>
      </div>

      {/* Subscription Product Add Form */}
      {showAddForm && (
        <Card title="Add Subscription Product" className="mb-5 animate-in fade-in duration-150">
          <form onSubmit={createProduct} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field
                label="SKU"
                required
                placeholder="SUB-CRM-PRO"
                value={form.sku}
                onChange={(v) => setForm((f) => ({ ...f, sku: v }))}
              />
              <Field
                label="Software / Product Name"
                required
                placeholder="DealFlow CRM Pro Suite"
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
                label="Billing Duration"
                required
                options={DURATION_OPTIONS}
                value={form.billingInterval}
                onChange={(v) => setForm((f) => ({ ...f, billingInterval: v }))}
              />
            </div>

            {/* Dynamic Pricing & Costing based on duration dropdown */}
            {form.billingInterval === "MULTI" ? (
              <div className="p-3 bg-[#F8F9FA] rounded-[6px] border border-[#E9ECEF]">
                <div className="text-xs font-semibold text-[#495057] mb-2">
                  Multi-Duration Pricing Plans (Per Seat)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Field
                    label="Monthly Price (₹/mo)"
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    placeholder="60.00"
                    value={form.monthlyPrice}
                    onChange={(v) => setForm((f) => ({ ...f, monthlyPrice: v }))}
                  />
                  <Field
                    label="Quarterly Price (₹/qtr)"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="170.00"
                    value={form.quarterlyPrice}
                    onChange={(v) => setForm((f) => ({ ...f, quarterlyPrice: v }))}
                  />
                  <Field
                    label="Yearly Price (₹/yr)"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="640.00"
                    value={form.yearlyPrice}
                    onChange={(v) => setForm((f) => ({ ...f, yearlyPrice: v }))}
                  />
                  <Field
                    label="Cost (₹/mo base)"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="15.00"
                    value={form.costPrice}
                    onChange={(v) => setForm((f) => ({ ...f, costPrice: v }))}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-[#F8F9FA] rounded-[6px] border border-[#E9ECEF]">
                <Field
                  label={currentDurationMeta.priceLabel}
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  placeholder={form.billingInterval === "YEARLY" ? "720.00" : form.billingInterval === "QUARTERLY" ? "180.00" : "60.00"}
                  value={form.price}
                  onChange={(v) => setForm((f) => ({ ...f, price: v }))}
                />
                <Field
                  label={currentDurationMeta.costLabel}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={form.billingInterval === "YEARLY" ? "180.00" : form.billingInterval === "QUARTERLY" ? "45.00" : "15.00"}
                  value={form.costPrice}
                  onChange={(v) => setForm((f) => ({ ...f, costPrice: v }))}
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-[#F8F9FA] rounded-[6px] border border-[#E9ECEF]">
              <Field
                label="Plan Start Date (Optional)"
                type="date"
                value={form.startDate}
                onChange={(v) => setForm((f) => ({ ...f, startDate: v }))}
                hint="When this subscription plan becomes active"
              />
              <Field
                label="Plan End Date (Optional)"
                type="date"
                min={form.startDate || undefined}
                value={form.endDate}
                onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
                hint="Validity expiration or promotional cutoff date"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <Field
                label="Description (Optional)"
                placeholder="Included seats, cloud tier, SLA..."
                value={form.description}
                onChange={(v) => setForm((f) => ({ ...f, description: v }))}
                className="flex-1"
              />
              <div className="pt-5">
                <Button type="submit" variant="primary" size="sm" disabled={products.busy}>
                  Save Subscription Product
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}

      {/* Control Panel */}
      <OdooControlPanel
        className="mb-3"
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="Search SaaS products by SKU, name, or plan."
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
          setActiveFilters({ categoryId: [], interval: [] });
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
          { label: "Software Product", key: "name" },
          { label: "Category", key: "category.name", className: "w-36" },
          { label: "Billing Duration", key: "plans", className: "w-48" },
          { label: "Selling Price", key: "price", className: "w-44" },
          { label: "Cost", key: "costPrice", className: "w-32" },
          { label: "Actions", key: "actions", className: "w-24 text-right" },
        ]}
        data={filteredProducts}
        getId={(p) => p.id}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={(ids) => handleToggleSelectAll(ids)}
        groupBy={activeGroupBy}
        emptyMessage="No subscription products match your search or filter."
        renderRow={(p, isSelected, toggleSelect) => {
          const plans = p.subscriptionPlans || [];
          const isMulti = plans.length > 1;
          const singlePlan = plans[0];
          const interval = singlePlan?.billingInterval || (p.unit?.toUpperCase().includes("YEAR") ? "YEARLY" : p.unit?.toUpperCase().includes("QUART") ? "QUARTERLY" : "MONTHLY");
          const intervalSuffix = interval === "YEARLY" ? "/yr" : interval === "QUARTERLY" ? "/qtr" : "/mo";

          return (
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
              <td className="px-4 py-3">
                {isMulti ? (
                  <div className="flex flex-wrap gap-1">
                    {plans.map((pl) => (
                      <span
                        key={pl.id}
                        className="bg-[#F3EEF2] text-[#714B67] text-[10px] font-bold px-1.5 py-0.5 rounded"
                      >
                        {pl.billingInterval}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="bg-[#EBF5FB] text-[#2980B9] font-medium text-xs px-2 py-0.5 rounded capitalize">
                    {interval.toLowerCase()}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-sm font-bold text-[#212529]">
                {isMulti ? (
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {plans.map((pl) => (
                      <span key={pl.id} className="text-[#212529] font-semibold">
                        ₹{Number(pl.price).toLocaleString("en-IN")}
                        <span className="text-[10px] text-[#6C757D] font-normal">
                          {pl.billingInterval === "YEARLY" ? "/yr" : pl.billingInterval === "QUARTERLY" ? "/qtr" : "/mo"}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <>
                    ₹{Number(singlePlan?.price || p.basePrice).toLocaleString("en-IN")}
                    <span className="text-xs text-[#6C757D] font-normal"> {intervalSuffix}</span>
                  </>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-[#6C757D]">
                ₹{Number(p.costPrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                <span className="text-[10px] text-[#868E96]"> {intervalSuffix}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => products.remove(p.id, `Subscription product ${p.sku} removed`)}
                  className="text-xs text-[#DC3545] hover:bg-[#FDECEA]"
                >
                  Delete
                </Button>
              </td>
            </tr>
          );
        }}
      />
    </>
  );
}

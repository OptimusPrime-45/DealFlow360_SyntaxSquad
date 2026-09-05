"use client";

/**
 * Subscription Products — Recurring Software & SaaS Catalogue.
 * Features an intuitive duration dropdown (Monthly, Quarterly, Yearly, Multi-Duration)
 * with duration-matched pricing and costing (cost per month, cost per quarter, cost per year).
 */

import React, { useState, useEffect } from "react";
import apiClient from "../../../lib/apiClient.js";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Table, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners, EmptyRow } from "../../../components/admin/AdminUI.jsx";

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
};

export default function SubscriptionProductsPage() {
  const products = useResource("/subscription-products", "subscriptionProducts");
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_SUBSCRIPTION);
  const [categoryName, setCategoryName] = useState("");

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
    if (ok) setForm(EMPTY_SUBSCRIPTION);
  };

  const currentDurationMeta = DURATION_LABELS[form.billingInterval] || DURATION_LABELS.MONTHLY;

  return (
    <>
      <AdminHeader
        title="Subscription Products"
        description="Software and SaaS products sold through recurring billing. Select a billing duration with matched price and cost."
      />
      <Banners error={products.error} notice={products.notice} />

      {/* Quick Category Add */}
      <Card title="Add a SaaS Category" className="mb-4">
        <form onSubmit={createCategory} className="flex items-end gap-3">
          <Field
            label="New Category"
            required
            placeholder="e.g. Cloud SaaS, Business Tools, Security"
            value={categoryName}
            onChange={setCategoryName}
            className="max-w-sm"
          />
          <Button type="submit" variant="secondary" size="sm" disabled={products.busy}>
            Create Category
          </Button>
        </form>
      </Card>

      {/* Subscription Product Add Form */}
      <Card title="Add Subscription Product" className="mb-5">
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
                Add Subscription Product
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Simple Table */}
      <Table headers={["SKU", "Software Product", "Category", "Billing Duration", "Selling Price", "Cost", "Actions"]}>
        {products.items.length === 0 && !products.loading && (
          <EmptyRow colSpan={7}>No software or SaaS products configured.</EmptyRow>
        )}
        {products.items.map((p) => {
          const plans = p.subscriptionPlans || [];
          const isMulti = plans.length > 1;
          const singlePlan = plans[0];
          const interval = singlePlan?.billingInterval || (p.unit?.toUpperCase().includes("YEAR") ? "YEARLY" : p.unit?.toUpperCase().includes("QUART") ? "QUARTERLY" : "MONTHLY");
          const intervalSuffix = interval === "YEARLY" ? "/yr" : interval === "QUARTERLY" ? "/qtr" : "/mo";

          return (
            <tr key={p.id} className="border-b border-[#E9ECEF] hover:bg-[#F8F9FA]">
              <td className="px-4 py-3 font-mono text-xs font-semibold text-[#212529]">{p.sku}</td>
              <td className="px-4 py-3 font-medium text-sm text-[#212529]">{p.name}</td>
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
              <td className="px-4 py-3 text-sm font-semibold text-[#212529]">
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
                  onClick={() =>
                    products.remove(p.id, `Subscription product ${p.sku} removed`)
                  }
                  className="text-xs text-[#DC3545] hover:bg-[#FDECEA]"
                >
                  Delete
                </Button>
              </td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}

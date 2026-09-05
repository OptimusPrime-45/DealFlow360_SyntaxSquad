"use client";

/**
 * Services — Professional & Recurring Services Catalogue.
 * Simple, clean interface for service offerings with support for flexible billing
 * durations (Hourly, One-time, Monthly, Quarterly, Yearly).
 */

import React, { useState, useEffect } from "react";
import apiClient from "../../../lib/apiClient.js";
import { useResource } from "../../../lib/useResource.js";
import { Button, Card, Table, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners, EmptyRow } from "../../../components/admin/AdminUI.jsx";

const DURATION_OPTIONS = [
  { value: "hour", label: "Per Hour (Time & Material)" },
  { value: "day", label: "Per Day (Consulting)" },
  { value: "visit", label: "Per Visit / Onsite" },
  { value: "project", label: "One-Time / Fixed Price" },
  { value: "month", label: "Monthly Retainer / SLA" },
  { value: "quarter", label: "Quarterly Service" },
  { value: "year", label: "Yearly Contract" },
  { value: "multi", label: "Multi-Duration Plans (Monthly, Quarterly, Yearly)" },
];

const EMPTY_SERVICE = {
  sku: "",
  name: "",
  description: "",
  categoryId: "",
  duration: "hour",
  basePrice: "",
  costPrice: "",
  monthlyPrice: "",
  quarterlyPrice: "",
  yearlyPrice: "",
};

export default function ServicesPage() {
  const services = useResource("/services", "services");
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_SERVICE);
  const [categoryName, setCategoryName] = useState("");

  const loadCategories = () =>
    apiClient
      .get("/categories?type=SERVICE")
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});

  useEffect(() => {
    loadCategories();
  }, []);

  const createCategory = async (e) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    const ok = await services.run(
      () => apiClient.post("/categories", { name: categoryName.trim(), type: "SERVICE" }),
      `Category "${categoryName}" created`
    );
    if (ok) {
      setCategoryName("");
      loadCategories();
    }
  };

  const createService = async (e) => {
    e.preventDefault();

    let rate = Number(form.basePrice) || 0;
    let unitLabel = form.duration;

    if (form.duration === "multi") {
      rate = Number(form.monthlyPrice) || 0;
      const parts = [];
      if (form.monthlyPrice) parts.push(`Monthly: ₹${form.monthlyPrice}`);
      if (form.quarterlyPrice) parts.push(`Quarterly: ₹${form.quarterlyPrice}`);
      if (form.yearlyPrice) parts.push(`Yearly: ₹${form.yearlyPrice}`);
      unitLabel = parts.join(" | ");
    }

    const ok = await services.create(
      {
        sku: form.sku.trim(),
        name: form.name.trim(),
        description: form.description?.trim() || null,
        categoryId: form.categoryId,
        basePrice: rate,
        costPrice: Number(form.costPrice) || 0,
        unit: unitLabel,
        taxRate: 18,
      },
      `Service ${form.sku} created`
    );
    if (ok) setForm(EMPTY_SERVICE);
  };

  return (
    <>
      <AdminHeader
        title="Services"
        description="Professional and recurring service offerings. Configure hourly, one-time, or recurring (monthly, quarterly, yearly) services."
      />
      <Banners error={services.error} notice={services.notice} />

      {/* Quick Category Add */}
      <Card title="Add a Service Category" className="mb-4">
        <form onSubmit={createCategory} className="flex items-end gap-3">
          <Field
            label="New Category"
            required
            placeholder="e.g. Professional Services, IT Support, Cleaning"
            value={categoryName}
            onChange={setCategoryName}
            className="max-w-sm"
          />
          <Button type="submit" variant="secondary" size="sm" disabled={services.busy}>
            Create Category
          </Button>
        </form>
      </Card>

      {/* Simple Service Add Form */}
      <Card title="Add Service" className="mb-5">
        <form onSubmit={createService} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field
              label="SKU"
              required
              placeholder="SRV-SUPPORT-247"
              value={form.sku}
              onChange={(v) => setForm((f) => ({ ...f, sku: v }))}
            />
            <Field
              label="Service Name"
              required
              placeholder="24/7 Dedicated IT Support"
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
              label="Billing Duration / Type"
              required
              options={DURATION_OPTIONS}
              value={form.duration}
              onChange={(v) => setForm((f) => ({ ...f, duration: v }))}
            />
          </div>

          {/* Pricing input depends on duration mode */}
          {form.duration === "multi" ? (
            <div className="p-3 bg-[#F8F9FA] rounded-[6px] border border-[#E9ECEF]">
              <div className="text-xs font-semibold text-[#495057] mb-2">
                Multi-Duration Pricing Plans
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field
                  label="Monthly Rate (₹)"
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  placeholder="800.00"
                  value={form.monthlyPrice}
                  onChange={(v) => setForm((f) => ({ ...f, monthlyPrice: v }))}
                />
                <Field
                  label="Quarterly Rate (₹, Optional)"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="2200.00"
                  value={form.quarterlyPrice}
                  onChange={(v) => setForm((f) => ({ ...f, quarterlyPrice: v }))}
                />
                <Field
                  label="Yearly Rate (₹, Optional)"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="8000.00"
                  value={form.yearlyPrice}
                  onChange={(v) => setForm((f) => ({ ...f, yearlyPrice: v }))}
                />
                <Field
                  label="Cost (₹)"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="500.00"
                  value={form.costPrice}
                  onChange={(v) => setForm((f) => ({ ...f, costPrice: v }))}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field
                label="Service Rate / Price (₹)"
                type="number"
                required
                min={0}
                step="0.01"
                placeholder="200.00"
                value={form.basePrice}
                onChange={(v) => setForm((f) => ({ ...f, basePrice: v }))}
              />
              <Field
                label="Cost (₹)"
                type="number"
                min={0}
                step="0.01"
                placeholder="160.00"
                value={form.costPrice}
                onChange={(v) => setForm((f) => ({ ...f, costPrice: v }))}
              />
              <Field
                label="Description (Optional)"
                placeholder="Service scope or SLA details..."
                value={form.description}
                onChange={(v) => setForm((f) => ({ ...f, description: v }))}
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="sm" disabled={services.busy}>
              Add Service
            </Button>
          </div>
        </form>
      </Card>

      {/* Simplified Services Table */}
      <Table headers={["SKU", "Service Name", "Category", "Duration / Unit", "Rate", "Cost", "Actions"]}>
        {services.items.length === 0 && !services.loading && (
          <EmptyRow colSpan={7}>No services configured.</EmptyRow>
        )}
        {services.items.map((s) => (
          <tr key={s.id} className="border-b border-[#E9ECEF] hover:bg-[#F8F9FA]">
            <td className="px-4 py-3 font-mono text-xs font-semibold text-[#212529]">{s.sku}</td>
            <td className="px-4 py-3 font-medium text-sm text-[#212529]">{s.name}</td>
            <td className="px-4 py-3 text-xs text-[#495057]">{s.category?.name || "—"}</td>
            <td className="px-4 py-3">
              <span className="bg-[#EBF5FB] text-[#2980B9] font-medium text-xs px-2 py-0.5 rounded capitalize">
                {s.unit || "hour"}
              </span>
            </td>
            <td className="px-4 py-3 text-sm font-semibold text-[#212529]">
              ₹{Number(s.basePrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </td>
            <td className="px-4 py-3 text-xs text-[#6C757D]">
              ₹{Number(s.costPrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </td>
            <td className="px-4 py-3 text-right">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => services.remove(s.id, `Service ${s.sku} removed`)}
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

"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext.js";
import apiClient from "../../../lib/apiClient.js";
import { Button, Input, Card, Badge, Table } from "../../../components/ui/index.js";

export default function NewQuotationPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [discountRules, setDiscountRules] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [lines, setLines] = useState([]);
  const [revisionData, setRevisionData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Load Customers, Products, and Discount Rules on mount
  useEffect(() => {
    const loadCatalogData = async () => {
      try {
        const [custRes, prodRes, rulesRes] = await Promise.all([
          apiClient.get("/customers"),
          apiClient.get("/products"),
          apiClient.get("/governance/discount-rules").catch(() => []),
        ]);
        const custList = custRes.customers || [];
        setCustomers(custList);
        setProducts(prodRes.products || []);
        const rules = Array.isArray(rulesRes) ? rulesRes : (rulesRes?.rules || rulesRes?.data || []);
        setDiscountRules(rules);

        // Check if revising an existing quotation
        const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const revisionOfId = params?.get("revisionOf") || params?.get("fromQuotationId");

        if (revisionOfId) {
          try {
            const quoteRes = await apiClient.get(`/quotations/${revisionOfId}`);
            const q = quoteRes?.quotation;
            if (q) {
              setSelectedCustomerId(q.customerId);
              if (Array.isArray(q.lines) && q.lines.length > 0) {
                setLines(
                  q.lines.map((l) => ({
                    productId: l.productId,
                    quantity: l.quantity,
                    discountPercent: Number(l.discountPercent) || 0,
                  }))
                );
              }
              const rejectedStep = q.approvals?.[0]?.steps?.find((s) => s.status === "REJECTED");
              setRevisionData({
                id: q.id,
                quotationNumber: q.quotationNumber,
                customerName: q.customer?.name,
                rejectionReason: rejectedStep?.reason,
                status: q.status,
              });
            }
          } catch (revErr) {
            console.error("Failed to load revision quotation:", revErr);
          }
        } else if (custList.length > 0) {
          setSelectedCustomerId(custList[0].id);
        }
      } catch (err) {
        setError("Failed to load customer and product catalog");
      } finally {
        setLoadingInitial(false);
      }
    };

    if (isAuthenticated) {
      loadCatalogData();
    }
  }, [isAuthenticated]);

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  // Add a blank line item
  const handleAddLine = () => {
    if (products.length === 0) return;
    const defaultProduct = products[0];
    setLines((prev) => [
      ...prev,
      {
        productId: defaultProduct.id,
        quantity: 1,
        discountPercent: 0,
      },
    ]);
  };

  // Add initial line when products load if not in revision mode
  useEffect(() => {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const isRevision = params?.get("revisionOf") || params?.get("fromQuotationId");
    if (products.length > 0 && lines.length === 0 && !isRevision) {
      handleAddLine();
    }
  }, [products]);

  const handleUpdateLine = (index, field, value) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
      return updated;
    });
  };

  const handleRemoveLine = (index) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Live client-side calculation of line math and order totals using Strictest Limit Algorithm (PDF §2.4)
  const calculatedData = useMemo(() => {
    const tierCeiling = selectedCustomer?.customerTier?.maxDiscountPercent
      ? Number(selectedCustomer.customerTier.maxDiscountPercent)
      : null;
    const tierId = selectedCustomer?.customerTierId || selectedCustomer?.customerTier?.id;

    let grossTotal = 0;
    let totalDiscounts = 0;
    let netTotal = 0;
    let totalCost = 0;
    let worstOverage = 0;

    const computedLines = lines.map((line) => {
      const product = products.find((p) => p.id === line.productId) || {};
      const unitPrice = Number(product.basePrice) || 0;
      const unitCost = Number(product.costPrice) || 0;
      const qty = Math.max(1, parseInt(line.quantity, 10) || 1);
      const discount = Math.max(0, Math.min(100, Number(line.discountPercent) || 0));

      const lineGross = qty * unitPrice;
      const discountAmount = (lineGross * discount) / 100;
      const lineNet = lineGross - discountAmount;
      const lineCost = qty * unitCost;
      const marginAmount = lineNet - lineCost;
      const marginPercent = lineNet > 0 ? (marginAmount / lineNet) * 100 : 0;

      // Strictest Limit Algorithm: MIN(tierCeiling, categoryRules)
      const candidateLimits = [];
      if (tierCeiling !== null && tierCeiling !== undefined) {
        candidateLimits.push(tierCeiling);
      }

      const productCategoryId = product.categoryId;
      if (productCategoryId && Array.isArray(discountRules)) {
        discountRules.forEach((r) => {
          if (r.isActive === false) return;
          const matchesTier = !r.customerTierId || r.customerTierId === tierId;
          const matchesCategory = !r.categoryId || r.categoryId === productCategoryId;
          if (matchesTier && matchesCategory && (r.customerTierId || r.categoryId)) {
            if (r.maxDiscountPercent !== null && r.maxDiscountPercent !== undefined) {
              candidateLimits.push(Number(r.maxDiscountPercent));
            }
          }
        });
      }

      const effectiveCeiling = candidateLimits.length > 0 ? Math.min(...candidateLimits) : (tierCeiling ?? 0);
      const overage = Math.max(0, Number((discount - effectiveCeiling).toFixed(2)));
      if (overage > worstOverage) {
        worstOverage = overage;
      }

      grossTotal += lineGross;
      totalDiscounts += discountAmount;
      netTotal += lineNet;
      totalCost += lineCost;

      return {
        ...line,
        product,
        unitPrice,
        unitCost,
        qty,
        discount,
        effectiveCeiling,
        lineGross,
        discountAmount,
        lineNet,
        marginPercent,
        overage,
      };
    });

    const dealMarginAmount = netTotal - totalCost;
    const dealMarginPercent = netTotal > 0 ? (dealMarginAmount / netTotal) * 100 : 0;

    return {
      computedLines,
      grossTotal,
      totalDiscounts,
      netTotal,
      dealMarginAmount,
      dealMarginPercent,
      worstOverage,
      tierCeiling: tierCeiling ?? 0,
    };
  }, [lines, products, selectedCustomer, discountRules]);

  const handleSubmit = async (e, autoSubmit = true) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!selectedCustomerId) {
      setError("Please select a customer");
      return;
    }
    if (lines.length === 0) {
      setError("Please add at least one line item");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        customerId: selectedCustomerId,
        notes: revisionData ? `Revision of ${revisionData.quotationNumber}` : undefined,
        autoSubmit,
        lines: lines.map((l, idx) => ({
          productId: l.productId,
          quantity: parseInt(l.quantity, 10) || 1,
          discountPercent: parseFloat(l.discountPercent) || 0,
          position: idx,
        })),
      };

      const res = await apiClient.post("/quotations", payload);
      const newQuotationId = res?.quotation?.id;

      if (autoSubmit && newQuotationId) {
        try {
          await apiClient.post(`/quotations/${newQuotationId}/submit`, {});
        } catch (submitErr) {
          console.error("Auto submit failed:", submitErr);
        }
      }

      router.push("/quotations");
    } catch (err) {
      setError(err.message || "Failed to create quotation");
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-[#714B67] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-[#6C757D]">Loading quote workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* Top Header */}
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/quotations" className="text-sm font-semibold text-[#6C757D] hover:text-[#212529]">
            ← Quotations
          </Link>
          <span className="text-[#CED4DA]">/</span>
          <span className="text-sm font-bold text-[#714B67]">
            {revisionData ? `Revise Quotation (${revisionData.quotationNumber})` : "New Multi-Line Quotation"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/quotations">
            <Button variant="secondary" size="sm">
              Cancel
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => handleSubmit(e, false)}
            loading={submitting}
            className="font-medium text-xs"
          >
            Save as Draft
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={(e) => handleSubmit(e, true)}
            loading={submitting}
            className="font-semibold"
          >
            {revisionData ? "Submit Revised Quotation" : "Confirm & Submit Quotation"}
          </Button>
        </div>
      </header>

      {/* Main Content Form */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {revisionData && (
          <div className="bg-[#FFF5F5] border border-[#DC3545]/30 rounded-[8px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-[#DC3545] flex items-center gap-2">
                <span>⚠ Revising Quotation {revisionData.quotationNumber}</span>
                <Badge variant="danger" size="sm">REVISION MODE</Badge>
              </div>
              {revisionData.rejectionReason && (
                <div className="mt-2 text-xs bg-white border border-[#DC3545]/20 rounded p-2.5 text-[#212529]">
                  <strong className="text-[#DC3545]">Manager Feedback:</strong> "{revisionData.rejectionReason}"
                </div>
              )}
              <p className="text-xs text-[#6C757D] mt-1.5">
                Adjust the line discounts, quantities, or products below to address manager concerns. When submitted, this creates a revised quotation in the pipeline.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 text-xs bg-[#DC3545]/10 border border-[#DC3545]/30 text-[#DC3545] rounded-[6px]">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Customer & Line Items */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Customer Selection Card */}
            <Card title="1. Customer & Tier Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-[#495057] uppercase tracking-wider block mb-1">
                    Select Customer
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full h-10 px-3 text-sm bg-white text-[#212529] border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67] transition-all cursor-pointer"
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.customerTier?.name})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCustomer && (
                  <div className="bg-[#F8F9FA] border border-[#E9ECEF] rounded-[6px] p-3 flex flex-col justify-center">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#6C757D]">Active Tier:</span>
                      <Badge variant="warning" size="sm">
                        {selectedCustomer.customerTier?.name}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs text-[#6C757D]">Tier Ceiling:</span>
                      <span className="text-xs font-bold text-[#714B67]">
                        {selectedCustomer.customerTier?.maxDiscountPercent}% Max Discount
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Step 2: Line Items Builder Card */}
            <Card
              title="2. Quotation Line Items"
              subtitle="Mix hardware, services, and subscriptions with line-level discount discipline"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleAddLine}
                  className="text-xs"
                >
                  + Add Line Item
                </Button>
              }
            >
              <div className="space-y-4">
                {calculatedData.computedLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-[#F8F9FA] border border-[#DEE2E6] rounded-[6px] space-y-3 relative group"
                  >
                    <div className="flex items-center justify-between border-b border-[#E9ECEF] pb-2">
                      <span className="text-xs font-bold text-[#714B67] uppercase tracking-wider">
                        Line #{idx + 1} · {line.product.productType || "ONE_TIME"}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="text-xs text-[#DC3545] hover:underline cursor-pointer font-medium"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      {/* Product Selector */}
                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-semibold text-[#6C757D] uppercase block mb-1">
                          Product / Service
                        </label>
                        <select
                          value={line.productId}
                          onChange={(e) =>
                            handleUpdateLine(idx, "productId", e.target.value)
                          }
                          className="w-full h-9 px-2.5 text-xs bg-white text-[#212529] border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67] transition-all cursor-pointer"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (₹{Number(p.basePrice)}) - {p.category?.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity */}
                      <div>
                        <label className="text-[11px] font-semibold text-[#6C757D] uppercase block mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) =>
                            handleUpdateLine(idx, "quantity", e.target.value)
                          }
                          className="w-full h-9 px-2.5 text-xs bg-white text-[#212529] border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67]"
                        />
                      </div>

                      {/* Discount % */}
                      <div>
                        <label className="text-[11px] font-semibold text-[#6C757D] uppercase block mb-1">
                          Discount %
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={line.discountPercent}
                          onChange={(e) =>
                            handleUpdateLine(idx, "discountPercent", e.target.value)
                          }
                          className="w-full h-9 px-2.5 text-xs bg-white text-[#212529] border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67]"
                        />
                      </div>
                    </div>

                    {/* Calculated Line Snapshot Bar */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs border-t border-[#E9ECEF]">
                      <div className="flex items-center gap-3">
                        <span className="text-[#6C757D]">
                          Unit: <strong className="text-[#212529]">₹{line.unitPrice}</strong>
                        </span>
                        <span className="text-[#6C757D]">
                          Gross: <strong className="text-[#212529]">₹{line.lineGross}</strong>
                        </span>
                        <span className="text-[#6C757D]">
                          Net Total:{" "}
                          <strong className="text-[#714B67] font-semibold">
                            ₹{line.lineNet.toLocaleString()}
                          </strong>
                        </span>
                        <span className="text-[#6C757D]">
                          Margin:{" "}
                          <strong
                            className={
                              line.marginPercent < 15
                                ? "text-[#DC3545]"
                                : "text-[#28A745]"
                            }
                          >
                            {line.marginPercent.toFixed(1)}%
                          </strong>
                        </span>
                      </div>

                      {/* Governance Status Indicator */}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#6C757D]">
                          Ceiling: <strong className="text-[#495057]">{line.effectiveCeiling ? `${line.effectiveCeiling.toFixed(1)}%` : "0%"}</strong>
                        </span>
                        {line.overage > 0 ? (
                          <Badge variant="danger" size="sm">
                            +{line.overage.toFixed(1)} pts Over Ceiling
                          </Badge>
                        ) : (
                          <Badge variant="success" size="sm">
                            Compliant
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right Col: Live Governance & Margin Summary */}
          <div className="space-y-6">
            <Card title="Deal Summary & Margin">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[#6C757D]">
                  <span>Subtotal (Gross):</span>
                  <span className="font-medium text-[#212529]">
                    ₹{calculatedData.grossTotal.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-[#6C757D]">
                  <span>Total Discounts:</span>
                  <span className="font-medium text-[#DC3545]">
                    -₹{calculatedData.totalDiscounts.toLocaleString()}
                  </span>
                </div>

                <div className="pt-2 border-t border-[#E9ECEF] flex items-center justify-between text-sm">
                  <span className="font-bold text-[#212529]">Grand Total (Net):</span>
                  <span className="font-bold text-[#714B67] text-base">
                    ₹{calculatedData.netTotal.toLocaleString()}
                  </span>
                </div>

                <div className="pt-3 border-t border-[#E9ECEF] flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#495057]">Overall Deal Margin:</span>
                  <span
                    className={`font-bold text-sm ${
                      calculatedData.dealMarginPercent < 15
                        ? "text-[#DC3545]"
                        : "text-[#28A745]"
                    }`}
                  >
                    {calculatedData.dealMarginPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </Card>

            {/* Governance Routing Prediction Card */}
            <Card
              title="Governance Evaluation"
              subtitle="Self-governing engine prediction"
            >
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#6C757D]">Worst Line Overage:</span>
                  {calculatedData.worstOverage > 0 ? (
                    <Badge variant="danger" size="sm">
                      +{calculatedData.worstOverage.toFixed(1)} pts
                    </Badge>
                  ) : (
                    <Badge variant="success" size="sm">
                      0.0 pts (Clean)
                    </Badge>
                  )}
                </div>

                {calculatedData.worstOverage > 0 ? (
                  <div className="p-3 bg-[#F0AD00]/10 border border-[#F0AD00]/30 rounded-[6px] text-[#B78100] text-[11px] leading-relaxed">
                    <strong>Approval Required:</strong> This quotation contains one or more lines that exceed configured discount ceilings. It will automatically route for Manager approval upon submission.
                  </div>
                ) : (
                  <div className="p-3 bg-[#28A745]/10 border border-[#28A745]/30 rounded-[6px] text-[#28A745] text-[11px] leading-relaxed">
                    <strong>Auto-Approving:</strong> All line discounts sit safely within allowed category and tier ceilings. This deal requires no managerial intervention.
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-[#E9ECEF] flex flex-col gap-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={(e) => handleSubmit(e, true)}
                  loading={submitting}
                  className="w-full font-semibold"
                >
                  Confirm &amp; Submit Quotation
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => handleSubmit(e, false)}
                  loading={submitting}
                  className="w-full text-xs"
                >
                  Save as Draft
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

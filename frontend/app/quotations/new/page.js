"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext.js";
import apiClient from "../../../lib/apiClient.js";
import { Button, Input, Card, Badge, Table, AppShell, SidebarToggleButton } from "../../../components/ui/index.js";
import { BTreeSearchIndex } from "../../../lib/btree.js";
import { getUpsellSuggestionsForProducts } from "../../../lib/upsellCatalog.js";

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

  // Upsell state & live feedback
  const [upsellNotice, setUpsellNotice] = useState(null);
  const [recentlyAddedIndex, setRecentlyAddedIndex] = useState(null);

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

  // Multi-Product Checkbox Modal State
  const [showProductModal, setShowProductModal] = useState(false);
  const [modalSearchTerm, setModalSearchTerm] = useState("");
  const [modalCategoryFilter, setModalCategoryFilter] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());

  // B-Tree search index on catalog products
  const productBTreeIndex = useMemo(() => {
    const index = new BTreeSearchIndex({ degree: 3 });
    products.forEach((p) => {
      index.insertRecord(p.id, {
        sku: p.sku || "",
        name: p.name || "",
        category: p.category?.name || "",
        type: p.productType || "",
        description: p.description || "",
      });
    });
    return index;
  }, [products]);

  const modalProducts = useMemo(() => {
    let list = products;
    if (modalSearchTerm.trim()) {
      const matchIds = productBTreeIndex.query(modalSearchTerm.trim());
      list = list.filter((p) => matchIds.has(p.id));
    }
    if (modalCategoryFilter) {
      list = list.filter(
        (p) => p.categoryId === modalCategoryFilter || p.category?.name === modalCategoryFilter
      );
    }
    return list;
  }, [products, modalSearchTerm, modalCategoryFilter, productBTreeIndex]);

  const handleToggleProductSelection = (id) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllModal = () => {
    if (selectedProductIds.size === modalProducts.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(modalProducts.map((p) => p.id)));
    }
  };

  const handleAddSelectedProductsToQuote = () => {
    if (selectedProductIds.size === 0) return;
    const newItems = Array.from(selectedProductIds).map((pId) => ({
      productId: pId,
      quantity: 1,
      discountPercent: 0,
    }));

    setLines((prev) => {
      const isPristineDefault =
        prev.length === 1 &&
        prev[0].quantity === 1 &&
        prev[0].discountPercent === 0 &&
        products[0] &&
        prev[0].productId === products[0].id;

      if (isPristineDefault) {
        return newItems;
      }
      return [...prev, ...newItems];
    });

    setSelectedProductIds(new Set());
    setShowProductModal(false);
    setModalSearchTerm("");
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

  // Compute 1-to-2 deterministic upsell suggestions based on products on this quote
  const upsellSuggestions = useMemo(() => {
    return getUpsellSuggestionsForProducts(lines, products);
  }, [lines, products]);

  // Accept an upsell suggestion: immediately appends line and confirms total & margin update right away
  const handleAcceptUpsell = (suggestion) => {
    if (!suggestion || !suggestion.productId) return;

    const oldTotal = calculatedData.netTotal;
    const oldMargin = calculatedData.dealMarginPercent;

    const newLine = {
      productId: suggestion.productId,
      quantity: 1,
      discountPercent: 0,
      addedViaUpsell: true,
      upsellReason: suggestion.reason,
    };

    setLines((prev) => [...prev, newLine]);
    setRecentlyAddedIndex(lines.length);

    // Compute expected numbers immediately for instantaneous visual feedback
    const unitPrice = Number(suggestion.unitPrice) || 0;
    const unitCost = Number(suggestion.costPrice) || 0;
    const newNetTotal = oldTotal + unitPrice;
    const newMarginAmount = (calculatedData.dealMarginAmount || 0) + (unitPrice - unitCost);
    const newMarginPercent = newNetTotal > 0 ? (newMarginAmount / newNetTotal) * 100 : 0;

    setUpsellNotice({
      name: suggestion.name,
      sku: suggestion.sku,
      price: unitPrice,
      oldTotal,
      newTotal: newNetTotal,
      oldMargin,
      newMargin: newMarginPercent,
      timestamp: Date.now(),
    });

    setTimeout(() => {
      setRecentlyAddedIndex(null);
    }, 3500);
  };

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
          addedViaUpsell: Boolean(l.addedViaUpsell),
        })),
      };

      await apiClient.post("/quotations", payload);
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
    <AppShell>
      {/* Top Header */}
      <header className="h-16 bg-white border-b border-[#E9ECEF] px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <SidebarToggleButton />
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

        {/* Upsell Accepted Confirmation Banner */}
        {upsellNotice && (
          <div className="bg-[#E7F5EC] border-2 border-[#28A745] text-[#155724] rounded-[8px] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <div className="text-sm font-bold text-[#155724] flex items-center gap-2">
                  <span>Upsell Accepted: Added {upsellNotice.name}</span>
                  <Badge variant="success" size="sm">CONFIRMED</Badge>
                </div>
                <div className="text-xs text-[#155724]/90 mt-0.5">
                  Order Total updated immediately: <strong>₹{upsellNotice.oldTotal.toLocaleString()}</strong> → <strong className="text-[#0f5132] font-mono text-sm underline decoration-2">₹{upsellNotice.newTotal.toLocaleString()}</strong> (+₹{upsellNotice.price.toLocaleString()}) &nbsp;•&nbsp;
                  Overall Margin updated: <strong>{upsellNotice.oldMargin.toFixed(1)}%</strong> → <strong className="text-[#0f5132] font-mono text-sm underline decoration-2">{upsellNotice.newMargin.toFixed(1)}%</strong>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setUpsellNotice(null)}
              className="text-xs font-bold text-[#155724] hover:text-[#0f5132] self-end sm:self-center px-2.5 py-1 rounded hover:bg-[#28A745]/15 cursor-pointer transition"
            >
              ✕ Dismiss
            </button>
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
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => setShowProductModal(true)}
                    className="text-xs font-semibold shadow-xs"
                  >
                    🔍 + Select Multiple Products
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddLine}
                    className="text-xs"
                  >
                    + Add Single Line
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
                {calculatedData.computedLines.map((line, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-[6px] space-y-3 relative group transition-all duration-300 ${
                      idx === recentlyAddedIndex
                        ? "bg-[#E7F5EC] border-2 border-[#28A745] shadow-sm ring-2 ring-[#28A745]/30"
                        : line.addedViaUpsell
                        ? "bg-[#F0F4F8] border-2 border-[#714B67]/30"
                        : "bg-[#F8F9FA] border border-[#DEE2E6]"
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-[#E9ECEF] pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#714B67] uppercase tracking-wider">
                          Line #{idx + 1} · {line.product.productType || "ONE_TIME"}
                        </span>
                        {line.addedViaUpsell && (
                          <Badge variant="info" size="sm">
                            ⚡ UPSELL ITEM
                          </Badge>
                        )}
                        {idx === recentlyAddedIndex && (
                          <span className="text-[10px] bg-[#28A745] text-white font-bold px-2 py-0.5 rounded-full animate-pulse">
                            JUST ADDED
                          </span>
                        )}
                      </div>
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

            {/* Step 3: Upsell & Cross-Sell Recommendations */}
            <Card
              title="3. ⚡ Recommended Upsell & Cross-Sell Add-ons"
              subtitle="Tailored 1-to-2 recommendations based on products selected above. Accept an upsell to immediately boost quote value and gross margin."
            >
              {upsellSuggestions.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#6C757D] bg-[#F8F9FA] rounded-[6px]">
                  Select products above to unlock tailored upsell recommendations.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {upsellSuggestions.map((s) => {
                    const isAdded = lines.some((l) => l.productId === s.productId);
                    return (
                      <div
                        key={s.productId}
                        className={`p-3.5 rounded-[8px] border transition-all flex flex-col justify-between ${
                          isAdded
                            ? "bg-[#E7F5EC]/50 border-[#28A745]/40"
                            : "bg-white border-[#DEE2E6] hover:border-[#714B67]/50 hover:shadow-xs"
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div>
                              <div className="font-bold text-xs text-[#212529] leading-tight">
                                {s.name}
                              </div>
                              <div className="text-[10px] font-mono text-[#6C757D]">
                                SKU: {s.sku} · {s.category}
                              </div>
                            </div>
                            <Badge variant={isAdded ? "success" : "warning"} size="sm">
                              {isAdded ? "✓ Added" : s.promotionTag}
                            </Badge>
                          </div>

                          <p className="text-[11px] text-[#495057] italic bg-[#F8F9FA] p-1.5 rounded border border-[#E9ECEF] mb-2.5">
                            &quot;{s.reason}&quot;
                          </p>

                          <div className="grid grid-cols-2 gap-2 bg-[#F8F9FA] p-2 rounded text-xs mb-3">
                            <div>
                              <span className="text-[10px] text-[#6C757D] block">Unit Price</span>
                              <span className="font-bold text-[#212529]">₹{s.unitPrice.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-[#6C757D] block">Margin Impact</span>
                              <span className="font-bold text-[#28A745]">
                                +₹{s.marginDelta.toLocaleString()} ({s.marginPercent.toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[#E9ECEF] flex items-center justify-between">
                          <span className="text-[10px] text-[#6C757D] truncate max-w-[140px]">
                            For: <strong>{s.parentProductName}</strong>
                          </span>
                          {isAdded ? (
                            <span className="text-xs font-semibold text-[#28A745] flex items-center gap-1">
                              ✓ In Quote
                            </span>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleAcceptUpsell(s)}
                              className="text-xs font-bold bg-[#714B67] hover:bg-[#593952] whitespace-nowrap cursor-pointer"
                            >
                              ⚡ Accept Upsell (+ Add)
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
                  <div className="text-right">
                    <span
                      className={`font-bold text-base transition-colors ${
                        upsellNotice ? "text-[#28A745]" : "text-[#714B67]"
                      }`}
                    >
                      ₹{calculatedData.netTotal.toLocaleString()}
                    </span>
                    {upsellNotice && (
                      <span className="block text-[10px] text-[#28A745] font-semibold animate-pulse">
                        +₹{upsellNotice.price.toLocaleString()} from upsell
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#E9ECEF] flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#495057]">Overall Deal Margin:</span>
                  <div className="text-right">
                    <span
                      className={`font-bold text-sm transition-colors ${
                        calculatedData.dealMarginPercent < 15
                          ? "text-[#DC3545]"
                          : "text-[#28A745]"
                      }`}
                    >
                      {calculatedData.dealMarginPercent.toFixed(1)}%
                    </span>
                    {upsellNotice && (
                      <span className="block text-[10px] text-[#28A745] font-semibold">
                        Margin updated immediately
                      </span>
                    )}
                  </div>
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

        {/* B-Tree Multi-Product Selection Modal */}
        {showProductModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-[10px] shadow-2xl border border-[#CED4DA] w-full max-w-4xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-[#E9ECEF] flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#212529] flex items-center gap-2">
                    <span>Select Products for Quotation</span>
                    <span className="text-xs bg-[#714B67]/10 text-[#714B67] px-2 py-0.5 rounded font-mono font-medium">
                      B-Tree Fast Search
                    </span>
                  </h2>
                  <p className="text-xs text-[#6C757D] mt-0.5">
                    Select multiple products with checkboxes to add them in batch to this quotation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="text-[#6C757D] hover:text-[#212529] text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F8F9FA] transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Modal Search & Filter Bar */}
              <div className="px-6 py-3 bg-[#F8F9FA] border-b border-[#E9ECEF] flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <input
                    type="text"
                    value={modalSearchTerm}
                    onChange={(e) => setModalSearchTerm(e.target.value)}
                    placeholder="Search by SKU, product name, type, or specs..."
                    className="w-full h-9 pl-8 pr-3 text-xs bg-white text-[#212529] border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67]"
                  />
                  <span className="absolute left-2.5 top-2.5 text-xs text-[#6C757D]">🔍</span>
                </div>
                <select
                  value={modalCategoryFilter}
                  onChange={(e) => setModalCategoryFilter(e.target.value)}
                  className="h-9 px-3 text-xs bg-white text-[#212529] border border-[#CED4DA] rounded-[6px] outline-none focus:border-[#714B67] cursor-pointer"
                >
                  <option value="">All Categories</option>
                  {Array.from(new Set(products.map((p) => p.category?.name).filter(Boolean))).map((catName) => (
                    <option key={catName} value={catName}>
                      {catName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleToggleSelectAllModal}
                  className="text-xs text-[#714B67] hover:underline font-semibold whitespace-nowrap cursor-pointer"
                >
                  {selectedProductIds.size === modalProducts.length && modalProducts.length > 0
                    ? "Deselect All"
                    : `Select All (${modalProducts.length})`}
                </button>
              </div>

              {/* Products Table */}
              <div className="flex-1 overflow-y-auto p-4">
                {modalProducts.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#6C757D]">
                    No products matching "{modalSearchTerm}".
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F8F9FA] border-b border-[#E9ECEF] text-[#495057] font-semibold uppercase">
                        <th className="py-2 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              modalProducts.length > 0 &&
                              modalProducts.every((p) => selectedProductIds.has(p.id))
                            }
                            onChange={handleToggleSelectAllModal}
                            className="w-4 h-4 accent-[#714B67] rounded cursor-pointer"
                          />
                        </th>
                        <th className="py-2 px-3 w-32">SKU</th>
                        <th className="py-2 px-3">Product Name</th>
                        <th className="py-2 px-3 w-28">Category</th>
                        <th className="py-2 px-3 w-28">Type</th>
                        <th className="py-2 px-3 w-28 text-right">Base Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9ECEF]">
                      {modalProducts.map((p) => {
                        const isSelected = selectedProductIds.has(p.id);
                        return (
                          <tr
                            key={p.id}
                            onClick={() => handleToggleProductSelection(p.id)}
                            className={`hover:bg-[#F8F9FA] transition-colors cursor-pointer ${
                              isSelected ? "bg-[#714B67]/5" : ""
                            }`}
                          >
                            <td
                              className="py-2.5 px-3 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleProductSelection(p.id)}
                                className="w-4 h-4 accent-[#714B67] rounded cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-[#714B67]">{p.sku}</td>
                            <td className="py-2.5 px-3 font-semibold text-[#212529]">{p.name}</td>
                            <td className="py-2.5 px-3 text-[#6C757D]">{p.category?.name || "—"}</td>
                            <td className="py-2.5 px-3">
                              <Badge variant="neutral" size="sm">
                                {p.productType}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-[#212529]">
                              ₹{Number(p.basePrice).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3 bg-[#F8F9FA] border-t border-[#E9ECEF] flex items-center justify-between">
                <div className="text-xs font-semibold text-[#495057]">
                  <span className="text-[#714B67] font-bold text-sm">{selectedProductIds.size}</span>{" "}
                  product(s) selected
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowProductModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={selectedProductIds.size === 0}
                    onClick={handleAddSelectedProductsToQuote}
                    className="font-semibold shadow-xs"
                  >
                    + Add Selected ({selectedProductIds.size}) to Quotation
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}

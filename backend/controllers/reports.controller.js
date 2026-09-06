import prisma from "../lib/prisma.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

/**
 * Reports Controller — PDF §4-A7 "Reporting & Dashboard Configuration".
 *
 * Implements the four reporting filters the spec names by purpose:
 *   Period          → from / to (or period=today|week|month|quarter|year)
 *   Sales Team/Rep  → salesRepId
 *   Approval Status → approvalStatus (PENDING | APPROVED | REJECTED)
 *   Product/Category→ productId / categoryId
 *
 * Every filter is applied in the query, not in the response shaping, so the
 * KPIs, the breakdowns and the exported rows always describe the same slice.
 */

const num = (v) => Number(v ?? 0);

/**
 * Approval Status is a reporting concept, not a column: the spec asks for
 * "pending, approved, or rejected quotations", which spans several
 * QuotationStatus values (an approved quote that the customer then confirmed
 * is still an approved quote for reporting purposes).
 */
const APPROVAL_STATUS_MAP = {
  PENDING: ["PENDING_APPROVAL"],
  APPROVED: ["APPROVED", "CONFIRMED"],
  REJECTED: ["REJECTED"],
};

/** Resolve `period` shorthand into an explicit [from, to] window. */
function resolvePeriod({ period, from, to }) {
  if (from || to) {
    return {
      from: from ? new Date(from) : null,
      to: to ? new Date(to) : null,
      label: "Custom range",
    };
  }
  if (!period || period === "all") return { from: null, to: null, label: "All time" };

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (period) {
    case "today":
      return { from: start, to: null, label: "Today" };
    case "week":
      start.setDate(start.getDate() - 7);
      return { from: start, to: null, label: "Last 7 days" };
    case "month":
      start.setDate(start.getDate() - 30);
      return { from: start, to: null, label: "Last 30 days" };
    case "quarter":
      start.setDate(start.getDate() - 90);
      return { from: start, to: null, label: "Last 90 days" };
    case "year":
      start.setFullYear(start.getFullYear() - 1);
      return { from: start, to: null, label: "Last 12 months" };
    default:
      return { from: null, to: null, label: "All time" };
  }
}

/**
 * Build the shared Prisma `where` for a report request. Role scoping is applied
 * here so a SALES_REP can never widen their slice by passing salesRepId.
 */
function buildQuotationWhere(req) {
  const { period, from, to, salesRepId, approvalStatus, productId, categoryId } = req.query;

  const window = resolvePeriod({ period, from, to });
  const userRole = req.user?.role?.code;
  const isSalesRep = userRole === "SALES_REP";

  const createdAt = {};
  if (window.from) createdAt.gte = window.from;
  if (window.to) {
    // `to` is an inclusive day: push to end-of-day so the last day is counted.
    const end = new Date(window.to);
    end.setHours(23, 59, 59, 999);
    createdAt.lte = end;
  }

  const statuses = approvalStatus ? APPROVAL_STATUS_MAP[String(approvalStatus)] : null;

  const lineFilter = {};
  if (productId) lineFilter.productId = String(productId);
  if (categoryId) lineFilter.product = { categoryId: String(categoryId) };

  const where = {
    ...(Object.keys(createdAt).length > 0 && { createdAt }),
    ...(isSalesRep
      ? { salesRepId: req.user.id }
      : salesRepId && { salesRepId: String(salesRepId) }),
    ...(statuses && { status: { in: statuses } }),
    ...(Object.keys(lineFilter).length > 0 && { lines: { some: lineFilter } }),
  };

  return { where, window, isSalesRep };
}

/**
 * GET /api/reports/filters
 * Options for the filter bar. Sales reps only ever see themselves.
 */
export const getReportFilters = asyncHandler(async (req, res) => {
  const userRole = req.user?.role?.code;
  const isSalesRep = userRole === "SALES_REP";

  const [reps, categories, products] = await Promise.all([
    isSalesRep
      ? prisma.user.findMany({
          where: { id: req.user.id },
          select: { id: true, fullName: true, email: true },
        })
      : prisma.user.findMany({
          where: { isActive: true, quotations: { some: {} } },
          select: { id: true, fullName: true, email: true },
          orderBy: { fullName: "asc" },
        }),
    prisma.productCategory.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, sku: true, categoryId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        salesReps: reps,
        categories,
        products,
        approvalStatuses: Object.keys(APPROVAL_STATUS_MAP),
        periods: ["today", "week", "month", "quarter", "year", "all"],
      },
      "Report filter options retrieved"
    )
  );
});

/**
 * GET /api/reports/sales
 * The reporting dataset: KPIs, breakdowns, and the row set used for export.
 */
export const getSalesReport = asyncHandler(async (req, res) => {
  const { where, window } = buildQuotationWhere(req);
  const { productId, categoryId } = req.query;

  const quotations = await prisma.quotation.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, contactEmail: true } },
      customerTier: { select: { id: true, code: true, name: true } },
      salesRep: { select: { id: true, fullName: true, email: true } },
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          invoices: { select: { id: true, status: true, totalAmount: true, amountPaid: true } },
        },
      },
      lines: {
        select: {
          id: true,
          quantity: true,
          discountPercent: true,
          lineTotal: true,
          lineMarginPercent: true,
          overagePts: true,
          addedViaUpsell: true,
          productId: true,
          product: {
            select: { id: true, name: true, sku: true, categoryId: true, category: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // ── Summary KPIs ────────────────────────────────────────────────────────
  const totalValue = quotations.reduce((s, q) => s + num(q.grandTotal), 0);
  const confirmed = quotations.filter((q) => q.status === "CONFIRMED");
  const pendingApproval = quotations.filter((q) => q.status === "PENDING_APPROVAL");
  const rejected = quotations.filter((q) => q.status === "REJECTED");

  const marginValues = quotations.map((q) => num(q.marginPercent)).filter((m) => m > 0);
  const avgMargin =
    marginValues.length > 0 ? marginValues.reduce((s, m) => s + m, 0) / marginValues.length : 0;

  const allLines = quotations.flatMap((q) => q.lines);
  const avgDiscount =
    allLines.length > 0
      ? allLines.reduce((s, l) => s + num(l.discountPercent), 0) / allLines.length
      : 0;

  const orders = quotations.map((q) => q.order).filter(Boolean);
  const invoices = orders.flatMap((o) => o.invoices || []);
  const invoicedTotal = invoices.reduce((s, i) => s + num(i.totalAmount), 0);
  const collectedTotal = invoices.reduce((s, i) => s + num(i.amountPaid), 0);

  const summary = {
    quotationCount: quotations.length,
    totalValue,
    avgDealSize: quotations.length > 0 ? totalValue / quotations.length : 0,
    avgMarginPercent: avgMargin,
    avgDiscountPercent: avgDiscount,
    pendingApprovalCount: pendingApproval.length,
    approvedCount: quotations.filter((q) => q.status === "APPROVED").length,
    rejectedCount: rejected.length,
    confirmedCount: confirmed.length,
    conversionRate: quotations.length > 0 ? (confirmed.length / quotations.length) * 100 : 0,
    confirmedValue: confirmed.reduce((s, q) => s + num(q.grandTotal), 0),
    orderCount: orders.length,
    orderValue: orders.reduce((s, o) => s + num(o.totalAmount), 0),
    invoicedTotal,
    collectedTotal,
    outstandingTotal: invoicedTotal - collectedTotal,
    upsellLineCount: allLines.filter((l) => l.addedViaUpsell).length,
    upsellValue: allLines
      .filter((l) => l.addedViaUpsell)
      .reduce((s, l) => s + num(l.lineTotal), 0),
  };

  // ── Breakdown: by status ────────────────────────────────────────────────
  const byStatus = Object.values(
    quotations.reduce((acc, q) => {
      acc[q.status] = acc[q.status] || { status: q.status, count: 0, value: 0 };
      acc[q.status].count += 1;
      acc[q.status].value += num(q.grandTotal);
      return acc;
    }, {})
  ).sort((a, b) => b.count - a.count);

  // ── Breakdown: by sales rep (team performance) ──────────────────────────
  const bySalesRep = Object.values(
    quotations.reduce((acc, q) => {
      const id = q.salesRep?.id || "unassigned";
      acc[id] = acc[id] || {
        salesRepId: id,
        name: q.salesRep?.fullName || q.salesRep?.email || "Unassigned",
        count: 0,
        value: 0,
        confirmed: 0,
        confirmedValue: 0,
        marginSum: 0,
        marginCount: 0,
      };
      const row = acc[id];
      row.count += 1;
      row.value += num(q.grandTotal);
      if (q.status === "CONFIRMED") {
        row.confirmed += 1;
        row.confirmedValue += num(q.grandTotal);
      }
      if (num(q.marginPercent) > 0) {
        row.marginSum += num(q.marginPercent);
        row.marginCount += 1;
      }
      return acc;
    }, {})
  )
    .map((r) => ({
      salesRepId: r.salesRepId,
      name: r.name,
      count: r.count,
      value: r.value,
      confirmed: r.confirmed,
      confirmedValue: r.confirmedValue,
      conversionRate: r.count > 0 ? (r.confirmed / r.count) * 100 : 0,
      avgMarginPercent: r.marginCount > 0 ? r.marginSum / r.marginCount : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // ── Breakdown: products (best selling + most discounted) ────────────────
  // When the request is scoped to a product/category, the line rollup is scoped
  // too — otherwise a category filter would still report sibling lines that
  // merely happened to sit on the same quotation.
  const scopedLines = allLines.filter((l) => {
    if (productId && l.productId !== String(productId)) return false;
    if (categoryId && l.product?.categoryId !== String(categoryId)) return false;
    return true;
  });

  const productAgg = scopedLines.reduce((acc, l) => {
    const id = l.productId;
    acc[id] = acc[id] || {
      productId: id,
      name: l.product?.name || "—",
      sku: l.product?.sku || "",
      category: l.product?.category?.name || "—",
      quantity: 0,
      revenue: 0,
      discountSum: 0,
      lineCount: 0,
      overageSum: 0,
    };
    const row = acc[id];
    row.quantity += Number(l.quantity || 0);
    row.revenue += num(l.lineTotal);
    row.discountSum += num(l.discountPercent);
    row.overageSum += num(l.overagePts);
    row.lineCount += 1;
    return acc;
  }, {});

  const products = Object.values(productAgg).map((p) => ({
    ...p,
    avgDiscountPercent: p.lineCount > 0 ? p.discountSum / p.lineCount : 0,
    avgOveragePts: p.lineCount > 0 ? p.overageSum / p.lineCount : 0,
  }));

  const topSelling = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const mostDiscounted = [...products]
    .sort((a, b) => b.avgDiscountPercent - a.avgDiscountPercent)
    .slice(0, 10);

  // ── Breakdown: by category ──────────────────────────────────────────────
  const byCategory = Object.values(
    scopedLines.reduce((acc, l) => {
      const name = l.product?.category?.name || "Uncategorised";
      acc[name] = acc[name] || { category: name, quantity: 0, revenue: 0, lineCount: 0, discountSum: 0 };
      acc[name].quantity += Number(l.quantity || 0);
      acc[name].revenue += num(l.lineTotal);
      acc[name].discountSum += num(l.discountPercent);
      acc[name].lineCount += 1;
      return acc;
    }, {})
  )
    .map((c) => ({
      ...c,
      avgDiscountPercent: c.lineCount > 0 ? c.discountSum / c.lineCount : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Flat rows for CSV / XLS / PDF export ────────────────────────────────
  const rows = quotations.map((q) => ({
    quotationNumber: q.quotationNumber,
    status: q.status,
    customer: q.customer?.name || "",
    customerEmail: q.customer?.contactEmail || "",
    tier: q.customerTier?.code || q.customerTier?.name || "",
    salesRep: q.salesRep?.fullName || q.salesRep?.email || "Unassigned",
    createdAt: q.createdAt,
    confirmedAt: q.confirmedAt,
    lineCount: q.lines.length,
    subtotal: num(q.subtotal),
    discountTotal: num(q.discountTotal),
    taxTotal: num(q.taxTotal),
    grandTotal: num(q.grandTotal),
    marginPercent: num(q.marginPercent),
    blendedScore: num(q.blendedScore),
    worstLineOverage: num(q.worstLineOverage),
    orderNumber: q.order?.orderNumber || "",
    orderStatus: q.order?.status || "",
    invoicedTotal: (q.order?.invoices || []).reduce((s, i) => s + num(i.totalAmount), 0),
    amountPaid: (q.order?.invoices || []).reduce((s, i) => s + num(i.amountPaid), 0),
  }));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        appliedFilters: {
          period: req.query.period || (req.query.from || req.query.to ? "custom" : "all"),
          periodLabel: window.label,
          from: window.from,
          to: window.to,
          salesRepId: req.query.salesRepId || null,
          approvalStatus: req.query.approvalStatus || null,
          productId: productId || null,
          categoryId: categoryId || null,
        },
        summary,
        byStatus,
        bySalesRep,
        byCategory,
        topSelling,
        mostDiscounted,
        rows,
      },
      "Sales report generated"
    )
  );
});

export default { getReportFilters, getSalesReport };

import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { calculateLineMath, round2, add, toNum } from "../lib/money.js";
// Single source of truth for ceiling resolution. This controller WRITES
// effectiveCeilingPercent onto each line and governance.controller.js SCORES
// those same lines — before the merge each side used a different resolver
// (lib/resolveCeiling.js vs rules/resolveCeiling.js), so the two halves of one
// decision could disagree. Both now call this one.
import { resolveCeiling } from "../rules/resolveCeiling.js";
import { scoreQuotation } from "../rules/scoreQuotation.js";
import { routeQuotationForApproval } from "../services/approvalRouting.service.js";
import { recordAuditLog } from "../lib/audit.js";

// Input validation schema
const lineInputSchema = z.object({
  productId: z.string().min(1, "Product ID required"),
  productVariantId: z.string().optional().nullable(),
  subscriptionPlanId: z.string().optional().nullable(),
  quantity: z.number().int().min(1, "Quantity must be at least 1").default(1),
  discountPercent: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).default(0),
  position: z.number().int().optional().default(0),
  addedViaUpsell: z.boolean().optional().default(false),
});

const createQuotationSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  validUntil: z.string().datetime().optional().nullable(),
  promisedDeliveryAt: z.string().datetime().optional().nullable(),
  lines: z.array(lineInputSchema).min(1, "Quotation must contain at least one line"),
  autoSubmit: z.boolean().optional().default(false),
});

const updateQuotationSchema = z.object({
  validUntil: z.string().datetime().optional().nullable(),
  promisedDeliveryAt: z.string().datetime().optional().nullable(),
  lines: z.array(lineInputSchema).optional(),
});

/**
 * Helper: Generate unique human-readable quotation number
 */
const generateQuotationNumber = async () => {
  const count = await prisma.quotation.count();
  const year = new Date().getFullYear();
  const sequence = String(count + 1).padStart(4, "0");
  return `QT-${year}-${sequence}`;
};

/**
 * Get all quotations
 * GET /api/quotations
 */
export const getQuotations = asyncHandler(async (req, res) => {
  const { status, customerId, salesRepId, search, stalled, days } = req.query;

  const userRole = req.user?.role?.code;
  const isSalesRep = userRole === "SALES_REP";

  let stalledCutoff = null;
  if (stalled === "true" || stalled === true) {
    const govSetting = await prisma.governanceSetting.findUnique({
      where: { id: "singleton" },
    });
    const stalledDays = days ? Number(days) : (govSetting?.stalledAfterDays ?? 7);
    stalledCutoff = new Date(Date.now() - stalledDays * 24 * 60 * 60 * 1000);
  }

  const where = {
    ...(status && { status: String(status) }),
    ...(customerId && { customerId: String(customerId) }),
    // Sales rep must ONLY see quotations given by them.
    // Sales manager / Admin sees all quotations, or can filter by salesRepId if provided.
    ...(isSalesRep
      ? { salesRepId: req.user.id }
      : salesRepId && { salesRepId: String(salesRepId) }),
    ...(search && {
      OR: [
        { quotationNumber: { contains: String(search), mode: "insensitive" } },
        { customer: { name: { contains: String(search), mode: "insensitive" } } },
      ],
    }),
    ...(stalledCutoff && {
      lastActivityAt: { lte: stalledCutoff },
      status: { in: ["DRAFT", "PENDING_APPROVAL", "SENT", "UNDER_NEGOTIATION", "APPROVED"] },
    }),
  };

  const quotations = await prisma.quotation.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, contactEmail: true } },
      customerTier: { select: { id: true, code: true, name: true, maxDiscountPercent: true } },
      salesRep: { select: { id: true, fullName: true, email: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { lastActivityAt: "desc" },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { quotations }, "Quotations retrieved successfully"));
});

/// Statuses that count as "history": the deal is settled, so the discount on it
/// is a finished decision and safe to use as a baseline. In-flight quotations are
/// excluded so a rep cannot move their own baseline just by drafting more quotes.
const SETTLED_STATUSES = ["CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED"];

/// Below this many settled quotations a rep has no meaningful personal baseline,
/// and we fall back to the team's. Calling two quotes an "average" is how you
/// generate false anomalies.
const MIN_BASELINE_SAMPLE = 3;

/**
 * Effective, value-weighted discount on one quotation, in percentage points.
 * subtotal is gross (pre-discount) and discountTotal is the money given away,
 * so this is the share of list price discounted across the whole quote - the
 * single number a rep's behaviour can be averaged over.
 */
function effectiveDiscountPercent(q) {
  const gross = Number(q.subtotal ?? 0);
  if (gross <= 0) return 0;
  return (Number(q.discountTotal ?? 0) / gross) * 100;
}

/**
 * Per-rep and team-wide historical discount baselines.
 *
 * PDF section 4-B9 defines a discount anomaly as "a discount well above a rep's
 * historical average" - so the comparison has to be against that rep's own
 * settled deals, not against a policy ceiling (the ceiling is already enforced
 * by approval routing; re-reporting it here says nothing new).
 */
function buildDiscountBaselines(settledQuotations) {
  const byRep = new Map();
  const all = [];

  for (const q of settledQuotations) {
    const value = effectiveDiscountPercent(q);
    all.push(value);
    const bucket = byRep.get(q.salesRepId) || [];
    bucket.push(value);
    byRep.set(q.salesRepId, bucket);
  }

  const mean = (xs) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const repBaselines = new Map();
  for (const [repId, values] of byRep.entries()) {
    repBaselines.set(repId, { average: mean(values), sampleSize: values.length });
  }

  return {
    forRep(repId) {
      const own = repBaselines.get(repId);
      if (own && own.sampleSize >= MIN_BASELINE_SAMPLE) {
        return { ...own, source: "REP" };
      }
      if (all.length >= MIN_BASELINE_SAMPLE) {
        return { average: mean(all), sampleSize: all.length, source: "TEAM" };
      }
      // No defensible baseline yet - better to raise no signal than a fake one.
      return null;
    },
  };
}

/**
 * Deal Health & At-Risk Quotations Dashboard
 * GET /api/quotations/deal-health
 */
export const getDealHealth = asyncHandler(async (req, res) => {
  const { days } = req.query;
  const userRole = req.user?.role?.code;
  const isSalesRep = userRole === "SALES_REP";

  const govSetting = await prisma.governanceSetting.findUnique({
    where: { id: "singleton" },
  });
  const stalledThresholdDays = days ? Number(days) : (govSetting?.stalledAfterDays ?? 7);
  const now = new Date();
  const stalledCutoff = new Date(now.getTime() - stalledThresholdDays * 24 * 60 * 60 * 1000);
  const overdueApprovalCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // Active open statuses
  const activeStatuses = ["DRAFT", "PENDING_APPROVAL", "SENT", "UNDER_NEGOTIATION", "APPROVED"];

  const quotations = await prisma.quotation.findMany({
    where: {
      status: { in: activeStatuses },
      ...(isSalesRep ? { salesRepId: req.user.id } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, contactEmail: true } },
      customerTier: { select: { id: true, code: true, name: true, maxDiscountPercent: true } },
      salesRep: { select: { id: true, fullName: true, email: true } },
      lines: {
        select: {
          id: true,
          discountPercent: true,
          effectiveCeilingPercent: true,
          overagePts: true,
          lineMarginPercent: true,
          product: { select: { name: true, sku: true } },
        },
      },
      approvals: {
        where: { status: "PENDING" },
        include: {
          steps: {
            where: { status: "PENDING" },
            include: { role: { select: { id: true, code: true, name: true } } },
          },
        },
      },
    },
    orderBy: { lastActivityAt: "asc" },
  });

  // Historical baseline for DISCOUNT_ANOMALY. Scoped to the reps who actually
  // appear in this view, so the query stays proportional to the dashboard.
  const repIds = [...new Set(quotations.map((q) => q.salesRepId).filter(Boolean))];
  const settledQuotations =
    repIds.length > 0
      ? await prisma.quotation.findMany({
          where: { salesRepId: { in: repIds }, status: { in: SETTLED_STATUSES } },
          select: { salesRepId: true, subtotal: true, discountTotal: true },
        })
      : [];
  const baselines = buildDiscountBaselines(settledQuotations);
  const anomalyDeviationPoints = Number(govSetting?.anomalyDeviationPoints ?? 5);

  // Follow-up history, so the dashboard can show "already nudged 3h ago" rather
  // than inviting a manager to chase the same rep twice.
  const nudgeHistory = await loadNudgeHistory(quotations.map((q) => q.id));

  const evaluatedQuotations = quotations.map((q) => {
    const lastActivity = q.lastActivityAt ? new Date(q.lastActivityAt) : new Date(q.createdAt);
    const msInactive = now.getTime() - lastActivity.getTime();
    const daysInactive = Math.floor(msInactive / (24 * 60 * 60 * 1000));
    const hoursInactive = Math.floor(msInactive / (60 * 60 * 1000));

    const signals = [];
    let discountProfile = null;

    // 1. Stalled Deal Signal
    const isStalled = daysInactive >= stalledThresholdDays;
    if (isStalled) {
      signals.push({
        signalType: "STALLED_DEAL",
        severity: daysInactive >= 14 ? "CRITICAL" : daysInactive >= 7 ? "HIGH" : "MEDIUM",
        message: `Deal stalled: no activity for ${daysInactive} days (threshold: ${stalledThresholdDays}d)`,
        detectedAt: now,
      });
    }

    // 2. Margin Floor Breach Signal
    const margin = Number(q.marginPercent ?? 0);
    const floorBreached = q.marginFloorBreached || (margin > 0 && margin < 15.0);
    if (floorBreached) {
      signals.push({
        signalType: "MARGIN_FLOOR_BREACH",
        severity: "CRITICAL",
        message: `Margin floor breach: overall margin ${margin.toFixed(1)}% is below 15% threshold`,
        detectedAt: now,
      });
    }

    // 3. Discount Anomaly Signal (PDF section 4-B9)
    //
    // Primary test: this quotation's effective discount measured against the
    // rep's OWN historical average, with the gap configured by the Admin as
    // GovernanceSetting.anomalyDeviationPoints.
    //
    // Secondary test: an outright ceiling breach still raises the signal. A rep
    // who over-discounts on every single deal has a high personal baseline, so
    // the deviation test alone would quietly clear their worst quotes.
    const worstOverage = Number(q.worstLineOverage ?? 0);
    const effectiveDiscount = effectiveDiscountPercent(q);
    const baseline = baselines.forRep(q.salesRepId);
    const deviation = baseline ? effectiveDiscount - baseline.average : null;
    const deviatesFromHistory = deviation !== null && deviation >= anomalyDeviationPoints;
    const breachesCeiling = worstOverage >= 8.0;

    discountProfile = {
      effectiveDiscountPercent: effectiveDiscount,
      baselineAverage: baseline ? baseline.average : null,
      baselineSource: baseline ? baseline.source : null,
      baselineSampleSize: baseline ? baseline.sampleSize : 0,
      deviationPoints: deviation,
      thresholdPoints: anomalyDeviationPoints,
      isAnomalous: deviatesFromHistory,
    };

    if (deviatesFromHistory || breachesCeiling) {
      const repLabel = q.salesRep?.fullName || q.salesRep?.email || "this rep";
      const severity =
        (deviation !== null && deviation >= anomalyDeviationPoints * 2) || worstOverage >= 15.0
          ? "CRITICAL"
          : "HIGH";

      const baselineLabel =
        baseline && baseline.source === "REP"
          ? `${repLabel}'s historical average`
          : "the team's historical average";

      const message = deviatesFromHistory
        ? `Discount anomaly: ${effectiveDiscount.toFixed(1)}% is ${deviation.toFixed(1)} pts above ` +
          `${baselineLabel} of ${baseline.average.toFixed(1)}% ` +
          `(threshold +${anomalyDeviationPoints.toFixed(1)} pts, based on ${baseline.sampleSize} settled deals)`
        : `Discount anomaly: line exceeds its policy ceiling by ${worstOverage.toFixed(1)} pts`;

      signals.push({
        signalType: "DISCOUNT_ANOMALY",
        severity,
        score: deviation !== null ? Number(deviation.toFixed(2)) : worstOverage,
        message,
        detectedAt: now,
      });
    }

    // 4. Approval Overdue Signal
    if (q.status === "PENDING_APPROVAL" && lastActivity <= overdueApprovalCutoff) {
      signals.push({
        signalType: "APPROVAL_OVERDUE",
        severity: "HIGH",
        message: `Approval overdue: pending review for ${hoursInactive} hours`,
        detectedAt: now,
      });
    }

    // 5. Delivery Slippage Signal
    if (q.promisedDeliveryAt) {
      const deliveryDate = new Date(q.promisedDeliveryAt);
      const daysUntilDelivery = Math.ceil(
        (deliveryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (daysUntilDelivery <= 3 && q.status !== "CONFIRMED") {
        signals.push({
          signalType: "DELIVERY_SLIPPAGE",
          severity: daysUntilDelivery < 0 ? "CRITICAL" : "MEDIUM",
          message:
            daysUntilDelivery < 0
              ? `Delivery slippage: promised delivery date passed without confirmation`
              : `Delivery date imminent (${daysUntilDelivery}d remaining) while quotation unconfirmed`,
          detectedAt: now,
        });
      }
    }

    // Composite health status
    let healthStatus = "HEALTHY";
    if (signals.some((s) => s.severity === "CRITICAL")) {
      healthStatus = "CRITICAL";
    } else if (signals.some((s) => s.severity === "HIGH")) {
      healthStatus = "HIGH_RISK";
    } else if (signals.length > 0) {
      healthStatus = "MODERATE_RISK";
    }

    return {
      ...q,
      daysInactive,
      hoursInactive,
      isStalled,
      signals,
      discountProfile,
      nudges: nudgeHistory.get(q.id) || [],
      healthStatus,
    };
  });

  const stalledQuotations = evaluatedQuotations.filter((q) => q.isStalled);
  const atRiskQuotations = evaluatedQuotations.filter((q) => q.signals.length > 0);

  const summary = {
    totalActiveQuotations: quotations.length,
    stalledThresholdDays,
    stalledCount: stalledQuotations.length,
    stalledTotalValue: stalledQuotations.reduce(
      (sum, q) => sum + Number(q.grandTotal ?? 0),
      0
    ),
    atRiskCount: atRiskQuotations.length,
    atRiskTotalValue: atRiskQuotations.reduce(
      (sum, q) => sum + Number(q.grandTotal ?? 0),
      0
    ),
    criticalRiskCount: atRiskQuotations.filter((q) => q.healthStatus === "CRITICAL").length,
    pendingApprovalsCount: quotations.filter((q) => q.status === "PENDING_APPROVAL").length,
  };

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        summary,
        stalledQuotations,
        atRiskQuotations,
      },
      "Deal health evaluated successfully"
    )
  );
});

/**
 * Get single quotation with line details
 * GET /api/quotations/:id
 */
export const getQuotationById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      customer: true,
      customerTier: true,
      salesRep: { select: { id: true, fullName: true, email: true } },
      lines: {
        include: {
          product: {
            include: { category: true },
          },
          productVariant: true,
          subscriptionPlan: true,
        },
        orderBy: { position: "asc" },
      },
      approvals: {
        include: {
          steps: {
            include: {
              role: true,
              reviewer: { select: { id: true, fullName: true, email: true } },
            },
            orderBy: { stepOrder: "asc" },
          },
        },
        orderBy: { approvalCycle: "desc" },
      },
      // So the UI can offer a link straight to fulfillment once confirmed.
      order: { select: { id: true, orderNumber: true, status: true } },
    },
  });

  if (!quotation) {
    throw new ApiError(404, "Quotation not found");
  }

  // Sales rep cannot view quotations authored by other reps
  if (req.user?.role?.code === "SALES_REP" && quotation.salesRepId !== req.user.id) {
    throw new ApiError(403, "Forbidden: You only have access to your own quotations");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { quotation }, "Quotation details retrieved"));
});

/**
 * Create a new Quotation with calculated line math, ceilings, and margin
 * POST /api/quotations
 */
export const createQuotation = asyncHandler(async (req, res) => {
  const validated = createQuotationSchema.parse(req.body);
  const salesRepId = req.user.id;

  // 1. Fetch Customer & CustomerTier
  const customer = await prisma.customer.findUnique({
    where: { id: validated.customerId },
    include: { customerTier: true },
  });

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  // 2. Fetch Governance Config (for ceiling resolution)
  const govSettings = await prisma.governanceSetting.findUnique({
    where: { id: "singleton" },
  });
  const unconfiguredPolicy = govSettings?.unconfiguredCeilingPolicy || "DENY";

  const discountRules = await prisma.discountRule.findMany({
    where: { isActive: true },
  });

  // 3. Process Lines and calculate math
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  let grandTotal = 0;
  let totalCost = 0;

  // Lines shaped for persistence (Prisma) …
  const preparedLines = [];
  // … and the same lines shaped for the shared scoring engine. Kept separate
  // because scoreQuotation() needs fields (referencePrice, effectiveDiscountPercent)
  // that are not columns on QuotationLine.
  const scoringLines = [];

  for (let i = 0; i < validated.lines.length; i++) {
    const item = validated.lines[i];

    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      include: { category: true },
    });

    if (!product) {
      throw new ApiError(400, `Product not found for ID: ${item.productId}`);
    }

    let extraPrice = 0;
    if (item.productVariantId) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: item.productVariantId },
      });
      if (variant) extraPrice = toNum(variant.extraPrice);
    }

    // Determine line type
    const lineType =
      product.productType === "SUBSCRIPTION" ? "RECURRING" : "ONE_TIME";

    // Unit Price & Cost
    const unitPrice = round2(toNum(product.basePrice) + extraPrice);
    const unitCost = round2(toNum(product.costPrice));

    // Resolve Ceiling using the shared rule engine.
    // referencePrice is the list price; unitPrice is what is actually being
    // charged. They are equal today because the input schema has no price
    // override — but passing both means the PDF §2.5 anti-bypass check is
    // already wired for when one is added.
    const ceiling = resolveCeiling(
      {
        categoryId: product.categoryId,
        referencePrice: unitPrice,
        unitPrice,
        discountPercent: item.discountPercent,
      },
      customer.customerTier,
      discountRules,
      govSettings || { unconfiguredCeilingPolicy: unconfiguredPolicy }
    );

    if (ceiling.validationError) {
      throw new ApiError(400, ceiling.validationError);
    }

    const { effectiveCeilingPercent, minMarginPercent } = ceiling;

    // Compute Line Math
    const math = calculateLineMath({
      quantity: item.quantity,
      unitPrice,
      unitCost,
      discountPercent: item.discountPercent,
    });

    // Overage is measured against the EFFECTIVE discount (the greater of the
    // entered percentage and any discount hidden in a reduced unit price), so
    // a rep cannot bypass the ceiling by discounting the price directly.
    const overagePts = Math.max(
      0,
      round2(ceiling.effectiveDiscountPercent - effectiveCeilingPercent)
    );

    // Accumulate order totals
    subtotal = add(subtotal, math.grossTotal);
    discountTotal = add(discountTotal, math.discountAmount);
    grandTotal = add(grandTotal, math.lineTotal);
    totalCost = add(totalCost, math.totalCost);

    scoringLines.push({
      productId: product.id,
      productName: product.name,
      quantity: math.quantity,
      unitPrice: math.unitPrice,
      unitCost: math.unitCost,
      referencePrice: unitPrice,
      discountPercent: math.discountPercent,
      effectiveDiscountPercent: ceiling.effectiveDiscountPercent,
      effectiveCeilingPercent,
      minMarginPercent,
    });

    preparedLines.push({
      productId: product.id,
      productVariantId: item.productVariantId || null,
      subscriptionPlanId: item.subscriptionPlanId || null,
      lineType,
      quantity: math.quantity,
      unitPrice: math.unitPrice,
      unitCost: math.unitCost,
      effectiveCeilingPercent,
      minMarginPercent,
      discountPercent: math.discountPercent,
      taxRate: round2(item.taxRate || 0),
      overagePts,
      lineTotal: math.lineTotal,
      lineMarginPercent: math.marginPercent,
      addedViaUpsell: Boolean(item.addedViaUpsell),
      position: item.position !== undefined ? item.position : i,
    });
  }

  // Final Order Margin
  const marginAmount = round2(grandTotal - totalCost);
  const marginPercent = grandTotal > 0 ? round2((marginAmount / grandTotal) * 100) : 0;

  // Score via the SHARED engine rather than recomputing it here. This controller
  // used to derive the blended score inline, weighting by net (post-discount)
  // line value and hardcoding VALUE_WEIGHTED — so it disagreed with
  // governance.controller.js (which weights by gross list value) and silently
  // ignored GovernanceSetting.scoreStrategy. The number a quotation STORES and
  // the number that ROUTES it must come from the same function.
  const verdict = scoreQuotation(scoringLines, {
    scoreStrategy: govSettings?.scoreStrategy || "VALUE_WEIGHTED",
  });
  const blendedScore = verdict.blendedScore;
  const worstLineOverage = verdict.worstLineOverage;
  const marginFloorBreached = verdict.marginFloorBreached;

  const quotationNumber = await generateQuotationNumber();

  // Create Quotation and lines in transaction
  const quotation = await prisma.$transaction(async (tx) => {
    return await tx.quotation.create({
      data: {
        quotationNumber,
        customerId: customer.id,
        salesRepId,
        customerTierId: customer.customerTierId,
        status: "DRAFT",
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        marginAmount,
        marginPercent,
        blendedScore,
        worstLineOverage,
        marginFloorBreached,
        validUntil: validated.validUntil ? new Date(validated.validUntil) : null,
        promisedDeliveryAt: validated.promisedDeliveryAt
          ? new Date(validated.promisedDeliveryAt)
          : null,
        lastActivityAt: new Date(),
        lines: {
          create: preparedLines,
        },
      },
      include: {
        customer: true,
        customerTier: true,
        salesRep: { select: { id: true, fullName: true, email: true } },
        lines: {
          include: {
            product: { include: { category: true } },
          },
        },
      },
    });
  });

  let finalQuotation = quotation;
  let routing = null;

  if (validated.autoSubmit) {
    routing = await routeQuotationForApproval({
      quotationId: quotation.id,
      actorUserId: salesRepId,
      triggerSource: "REP_SUBMIT",
    });

    finalQuotation = await prisma.quotation.findUnique({
      where: { id: quotation.id },
      include: {
        customer: true,
        customerTier: true,
        salesRep: { select: { id: true, fullName: true, email: true } },
        lines: {
          include: {
            product: { include: { category: true } },
          },
        },
      },
    });
  }

  const message = routing
    ? routing.autoApproved
      ? "Quotation created and auto-approved"
      : `Quotation created and routed to ${routing.evaluation?.requiredApprovalSteps?.map((s) => s.roleCode).join(" then ")}`
    : "Quotation created successfully";

  return res
    .status(201)
    .json(new ApiResponse(201, { quotation: finalQuotation, routing }, message));
});

/**
 * Delete a draft quotation
 * DELETE /api/quotations/:id
 */
export const deleteQuotation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const quotation = await prisma.quotation.findUnique({ where: { id } });
  if (!quotation) {
    throw new ApiError(404, "Quotation not found");
  }

  if (req.user?.role?.code === "SALES_REP" && quotation.salesRepId !== req.user.id) {
    throw new ApiError(403, "Forbidden: You can only delete your own quotations");
  }

  if (quotation.status !== "DRAFT" && quotation.status !== "CANCELLED") {
    throw new ApiError(400, "Only draft or cancelled quotations can be deleted");
  }

  await prisma.quotation.delete({ where: { id } });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Quotation deleted successfully"));
});

export default {
  getQuotations,
  getQuotationById,
  createQuotation,
  deleteQuotation,
};


/**
 * Submit a quotation — §9 step 3.
 * POST /api/quotations/:id/submit
 *
 * The rep presses "Confirm". They do NOT press "request approval": the system
 * scores the quotation against current configuration and decides for itself
 * whether a human is needed, and which ones. A compliant quote goes straight
 * to APPROVED; anything over a ceiling opens the approval ladder.
 */
export const submitQuotation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: { id: true, status: true, quotationNumber: true, salesRepId: true },
  });

  if (!quotation) {
    throw new ApiError(404, "Quotation not found");
  }

  if (req.user?.role?.code === "SALES_REP" && quotation.salesRepId !== req.user.id) {
    throw new ApiError(403, "Forbidden: You can only submit your own quotations");
  }

  // Only a draft, rejected, or renegotiated quote can be submitted.
  const SUBMITTABLE = ["DRAFT", "REJECTED", "UNDER_NEGOTIATION"];
  if (!SUBMITTABLE.includes(quotation.status)) {
    if (quotation.status === "PENDING_APPROVAL" || quotation.status === "APPROVED") {
      return res.status(200).json(
        new ApiResponse(
          200,
          {
            autoApproved: quotation.status === "APPROVED",
            status: quotation.status,
            alreadySubmitted: true,
          },
          `Quotation ${quotation.quotationNumber} is already submitted (status: ${quotation.status})`
        )
      );
    }
    throw new ApiError(
      400,
      `Quotation ${quotation.quotationNumber} cannot be submitted from status ${quotation.status}`
    );
  }

  const result = await routeQuotationForApproval({
    quotationId: id,
    actorUserId: req.user?.id || null,
    triggerSource: "REP_SUBMIT",
  });

  const message = result.autoApproved
    ? "Quotation is within every configured ceiling and was approved automatically"
    : `Quotation exceeds policy limits and was routed automatically to: ${result.evaluation.requiredApprovalSteps
        .map((s) => s.roleName || s.roleCode)
        .join(" then ")}`;

  return res.status(result.autoApproved ? 200 : 201).json(
    new ApiResponse(
      result.autoApproved ? 200 : 201,
      {
        autoApproved: result.autoApproved,
        status: result.status,
        routedTo: (result.evaluation.requiredApprovalSteps || []).map((s) => s.roleCode),
        approval: result.approval,
        evaluation: result.evaluation,
      },
      message
    )
  );
});


// ============================================================================
//  DEAL NUDGE & ESCALATION                                    (PDF section 4-B9)
//  "An automated nudge or escalation action can be triggered from an alert."
// ============================================================================

/// A manager should not be able to spam the same rep about the same deal. Two
/// nudges inside this window is noise, not follow-up, so the second is refused
/// unless the caller explicitly overrides.
const NUDGE_COOLDOWN_HOURS = 12;

const NUDGE_ACTIONS = {
  NUDGE: "DEAL_NUDGE_SENT",
  ESCALATE: "DEAL_ESCALATED",
};

/**
 * Recent nudge/escalation history for a set of quotations, newest first.
 * Reads straight off the append-only audit ledger — the nudge IS the audit
 * entry, so there is no second source of truth to drift.
 */
async function loadNudgeHistory(quotationIds) {
  if (!quotationIds || quotationIds.length === 0) return new Map();

  const logs = await prisma.auditLog.findMany({
    where: {
      quotationId: { in: quotationIds },
      action: { in: Object.values(NUDGE_ACTIONS) },
    },
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const byQuotation = new Map();
  for (const log of logs) {
    const bucket = byQuotation.get(log.quotationId) || [];
    bucket.push({
      id: log.id,
      action: log.action,
      type: log.action === NUDGE_ACTIONS.ESCALATE ? "ESCALATE" : "NUDGE",
      message: log.reason,
      sentBy: log.user?.fullName || log.user?.email || "System",
      sentAt: log.createdAt,
      target: log.newValue?.targetRep ?? null,
    });
    byQuotation.set(log.quotationId, bucket);
  }
  return byQuotation;
}

/**
 * POST /api/quotations/:id/nudge
 * Body: { type?: "NUDGE" | "ESCALATE", message?: string, force?: boolean }
 *
 * Records a real, auditable follow-up against the deal.
 *
 * Deliberately does NOT touch lastActivityAt: a nudge is the manager acting,
 * not the rep. Bumping it would clear the STALLED_DEAL signal and let a deal
 * look healthy precisely because nobody worked it.
 */
export const nudgeQuotation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type = "NUDGE", message, force = false } = req.body || {};

  const nudgeType = String(type).toUpperCase();
  if (!NUDGE_ACTIONS[nudgeType]) {
    throw new ApiError(400, 'type must be either "NUDGE" or "ESCALATE"');
  }

  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      salesRep: { select: { id: true, fullName: true, email: true } },
      customer: { select: { id: true, name: true } },
    },
  });

  if (!quotation) {
    throw new ApiError(404, "Quotation not found");
  }

  // Nudging a settled deal is meaningless - there is nothing left to chase.
  if (SETTLED_STATUSES.includes(quotation.status)) {
    throw new ApiError(
      400,
      `Cannot nudge a ${quotation.status} quotation - the deal is already settled`
    );
  }

  const existing = (await loadNudgeHistory([id])).get(id) || [];

  if (!force && existing.length > 0) {
    const lastSent = new Date(existing[0].sentAt);
    const hoursSince = (Date.now() - lastSent.getTime()) / (60 * 60 * 1000);
    if (hoursSince < NUDGE_COOLDOWN_HOURS) {
      throw new ApiError(
        429,
        `${existing[0].sentBy} already nudged this deal ${Math.round(hoursSince)}h ago. ` +
          `Wait ${Math.ceil(NUDGE_COOLDOWN_HOURS - hoursSince)}h or re-send with force.`
      );
    }
  }

  const lastActivity = quotation.lastActivityAt
    ? new Date(quotation.lastActivityAt)
    : new Date(quotation.createdAt);
  const daysInactive = Math.floor((Date.now() - lastActivity.getTime()) / (24 * 60 * 60 * 1000));

  const defaultMessage =
    nudgeType === "ESCALATE"
      ? `Escalated: ${quotation.quotationNumber} (${quotation.customer?.name || "customer"}) has had no activity for ${daysInactive} day(s).`
      : `Follow-up requested on ${quotation.quotationNumber} (${quotation.customer?.name || "customer"}) - inactive for ${daysInactive} day(s).`;

  const record = await recordAuditLog({
    userId: req.user?.id || null,
    quotationId: quotation.id,
    actorType: "USER",
    entityType: "Quotation",
    entityId: quotation.id,
    action: NUDGE_ACTIONS[nudgeType],
    reason: (message && String(message).trim()) || defaultMessage,
    newValue: {
      targetRep: quotation.salesRep
        ? {
            id: quotation.salesRep.id,
            name: quotation.salesRep.fullName,
            email: quotation.salesRep.email,
          }
        : null,
      quotationNumber: quotation.quotationNumber,
      quotationStatus: quotation.status,
      daysInactive,
    },
  });

  if (!record) {
    // recordAuditLog swallows its own errors and returns null. A nudge whose
    // only effect is a toast is exactly the fake this endpoint replaces, so
    // surface the failure instead of reporting success.
    throw new ApiError(500, "Failed to record the nudge - nothing was sent");
  }

  const history = (await loadNudgeHistory([id])).get(id) || [];

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        nudge: {
          id: record.id,
          type: nudgeType,
          message: record.reason,
          sentAt: record.createdAt,
          targetRep: quotation.salesRep,
          daysInactive,
        },
        history,
      },
      nudgeType === "ESCALATE"
        ? `Escalation recorded for ${quotation.quotationNumber}`
        : `Nudge sent to ${quotation.salesRep?.fullName || "the sales rep"} for ${quotation.quotationNumber}`
    )
  );
});

/**
 * GET /api/quotations/:id/nudges
 * Follow-up history for one deal, newest first.
 */
export const getQuotationNudges = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const history = (await loadNudgeHistory([id])).get(id) || [];
  return res
    .status(200)
    .json(new ApiResponse(200, { history }, "Nudge history retrieved"));
});

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

// Input validation schema
const lineInputSchema = z.object({
  productId: z.string().min(1, "Product ID required"),
  productVariantId: z.string().optional().nullable(),
  subscriptionPlanId: z.string().optional().nullable(),
  quantity: z.number().int().min(1, "Quantity must be at least 1").default(1),
  discountPercent: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).default(0),
  position: z.number().int().optional().default(0),
});

const createQuotationSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  validUntil: z.string().datetime().optional().nullable(),
  promisedDeliveryAt: z.string().datetime().optional().nullable(),
  lines: z.array(lineInputSchema).min(1, "Quotation must contain at least one line"),
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
  const { status, customerId, salesRepId, search } = req.query;

  const where = {
    ...(status && { status: String(status) }),
    ...(customerId && { customerId: String(customerId) }),
    ...(salesRepId && { salesRepId: String(salesRepId) }),
    ...(search && {
      OR: [
        { quotationNumber: { contains: String(search), mode: "insensitive" } },
        { customer: { name: { contains: String(search), mode: "insensitive" } } },
      ],
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
        orderBy: { approvalCycle: "desc" },
      },
    },
  });

  if (!quotation) {
    throw new ApiError(404, "Quotation not found");
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

  return res
    .status(201)
    .json(new ApiResponse(201, { quotation }, "Quotation created successfully"));
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
    select: { id: true, status: true, quotationNumber: true },
  });

  if (!quotation) {
    throw new ApiError(404, "Quotation not found");
  }

  // Only a draft (or a quote sent back for revision) can be submitted.
  const SUBMITTABLE = ["DRAFT", "REJECTED"];
  if (!SUBMITTABLE.includes(quotation.status)) {
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

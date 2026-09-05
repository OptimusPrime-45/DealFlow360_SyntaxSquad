import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { calculateLineMath, round2, add, toNum } from "../lib/money.js";
import { resolveEffectiveCeiling } from "../lib/resolveCeiling.js";

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
  let worstLineOverage = 0;
  let weightedOverageSum = 0;

  const preparedLines = [];

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

    // Resolve Ceiling
    const { effectiveCeilingPercent, minMarginPercent } = resolveEffectiveCeiling({
      customerTier: customer.customerTier,
      categoryId: product.categoryId,
      discountRules,
      unconfiguredPolicy,
    });

    // Compute Line Math
    const math = calculateLineMath({
      quantity: item.quantity,
      unitPrice,
      unitCost,
      discountPercent: item.discountPercent,
    });

    // Overage
    const overagePts = Math.max(
      0,
      round2(item.discountPercent - effectiveCeilingPercent)
    );
    if (overagePts > worstLineOverage) {
      worstLineOverage = overagePts;
    }

    // Accumulate order totals
    subtotal = add(subtotal, math.grossTotal);
    discountTotal = add(discountTotal, math.discountAmount);
    grandTotal = add(grandTotal, math.lineTotal);
    totalCost = add(totalCost, math.totalCost);

    // Value-weighted overage contribution: overage × lineValue
    weightedOverageSum += overagePts * math.lineTotal;

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

  // Blended Score under VALUE_WEIGHTED strategy: Σ(overage × lineValue) / Σ lineValue
  const blendedScore = grandTotal > 0 ? round2(weightedOverageSum / grandTotal) : 0;

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


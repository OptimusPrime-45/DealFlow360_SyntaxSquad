// ============================================================================
//  DealFlow360 — Subscription Products Controller
//  Dedicated domain controller for recurring Software / SaaS catalogue items.
//  Manages SaaS product metadata and attached recurring billing plans directly.
// ============================================================================

import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAuditLog } from "../lib/audit.js";

const planInputSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  billingInterval: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  price: z.number().min(0, "Price must be zero or positive"),
  prorationEnabled: z.boolean().optional().default(true),
  cancellationRefundPercent: z.number().min(0).max(100).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

const subscriptionProductSchema = z.object({
  name: z.string().min(2, "Product name is required"),
  sku: z.string().min(2, "SKU is required"),
  description: z.string().optional().nullable(),
  categoryId: z.string().min(1, "Category ID is required"),
  billingInterval: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "MULTI"]).optional().default("MONTHLY"),
  price: z.number().min(0, "Price cannot be negative").optional(),
  basePrice: z.number().min(0, "Base price cannot be negative").optional().default(0),
  costPrice: z.number().min(0, "Cost price cannot be negative").optional().default(0),
  unit: z.string().optional(),
  taxRate: z.number().min(0).default(18),
  isPromoted: z.boolean().default(false),
  monthlyPrice: z.number().min(0).optional(),
  quarterlyPrice: z.number().min(0).optional(),
  yearlyPrice: z.number().min(0).optional(),
  plans: z.array(planInputSchema).optional(),
});

const updateSubscriptionProductSchema = subscriptionProductSchema.partial();

/**
 * GET /api/subscription-products
 * Lists all SaaS/software products with their attached subscription plans.
 */
export const getSubscriptionProducts = asyncHandler(async (req, res) => {
  const { search, categoryId } = req.query;

  const where = {
    productType: "SUBSCRIPTION",
    isActive: true,
    ...(categoryId && { categoryId: String(categoryId) }),
    ...(search && {
      OR: [
        { name: { contains: String(search), mode: "insensitive" } },
        { sku: { contains: String(search), mode: "insensitive" } },
      ],
    }),
  };

  const products = await prisma.product.findMany({
    where,
    include: {
      category: true,
      subscriptionPlans: {
        where: { isActive: true },
        orderBy: { price: "asc" },
      },
      _count: {
        select: {
          subscriptionPlans: true,
          quotationLines: true,
          orderLines: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { subscriptionProducts: products },
      "Subscription products retrieved successfully"
    )
  );
});

/**
 * GET /api/subscription-products/:id
 */
export const getSubscriptionProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const product = await prisma.product.findFirst({
    where: { id, productType: "SUBSCRIPTION" },
    include: {
      category: true,
      subscriptionPlans: {
        orderBy: { price: "asc" },
      },
      _count: {
        select: {
          subscriptionPlans: true,
          quotationLines: true,
          orderLines: true,
        },
      },
    },
  });

  if (!product) {
    throw new ApiError(404, "Subscription product not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { product }, "Subscription product retrieved"));
});

/**
 * POST /api/subscription-products
 * Creates a SaaS product and its duration pricing plans (Monthly, Quarterly, Yearly).
 */
export const createSubscriptionProduct = asyncHandler(async (req, res) => {
  const input = subscriptionProductSchema.parse(req.body);

  const existingSku = await prisma.product.findUnique({
    where: { sku: input.sku.toUpperCase().trim() },
  });
  if (existingSku) {
    throw new ApiError(409, `Product with SKU '${input.sku}' already exists`);
  }

  const category = await prisma.productCategory.findUnique({
    where: { id: input.categoryId },
  });
  if (!category) {
    throw new ApiError(400, "Selected category does not exist");
  }

  const interval = input.billingInterval || "MONTHLY";

  let basePrice = 0;
  if (input.price !== undefined) {
    basePrice = input.price;
  } else if (input.monthlyPrice !== undefined) {
    basePrice = input.monthlyPrice;
  } else if (input.quarterlyPrice !== undefined) {
    basePrice = input.quarterlyPrice;
  } else if (input.yearlyPrice !== undefined) {
    basePrice = input.yearlyPrice;
  } else {
    basePrice = input.basePrice ?? 0;
  }

  let unit = input.unit;
  if (!unit) {
    if (interval === "MONTHLY") unit = "month";
    else if (interval === "QUARTERLY") unit = "quarter";
    else if (interval === "YEARLY") unit = "year";
    else unit = "seat/month";
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        sku: input.sku.toUpperCase().trim(),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        categoryId: category.id,
        productType: "SUBSCRIPTION",
        basePrice,
        costPrice: input.costPrice ?? 0,
        unit,
        taxRate: input.taxRate ?? 18,
        isPromoted: !!input.isPromoted,
        isActive: true,
      },
    });

    // Construct duration plans based on interval selection
    const plansToCreate = [];
    if (interval === "MONTHLY") {
      plansToCreate.push({
        productId: created.id,
        name: `${created.name} — Monthly`,
        billingInterval: "MONTHLY",
        price: basePrice,
        prorationEnabled: true,
        cancellationRefundPercent: 0,
        isActive: true,
      });
    } else if (interval === "QUARTERLY") {
      plansToCreate.push({
        productId: created.id,
        name: `${created.name} — Quarterly`,
        billingInterval: "QUARTERLY",
        price: basePrice,
        prorationEnabled: true,
        cancellationRefundPercent: 50,
        isActive: true,
      });
    } else if (interval === "YEARLY") {
      plansToCreate.push({
        productId: created.id,
        name: `${created.name} — Yearly`,
        billingInterval: "YEARLY",
        price: basePrice,
        prorationEnabled: true,
        cancellationRefundPercent: 75,
        isActive: true,
      });
    } else if (interval === "MULTI") {
      if (input.monthlyPrice !== undefined && input.monthlyPrice >= 0) {
        plansToCreate.push({
          productId: created.id,
          name: `${created.name} — Monthly`,
          billingInterval: "MONTHLY",
          price: input.monthlyPrice,
          prorationEnabled: true,
          cancellationRefundPercent: 0,
          isActive: true,
        });
      }
      if (input.quarterlyPrice !== undefined && input.quarterlyPrice > 0) {
        plansToCreate.push({
          productId: created.id,
          name: `${created.name} — Quarterly`,
          billingInterval: "QUARTERLY",
          price: input.quarterlyPrice,
          prorationEnabled: true,
          cancellationRefundPercent: 50,
          isActive: true,
        });
      }
      if (input.yearlyPrice !== undefined && input.yearlyPrice > 0) {
        plansToCreate.push({
          productId: created.id,
          name: `${created.name} — Yearly`,
          billingInterval: "YEARLY",
          price: input.yearlyPrice,
          prorationEnabled: true,
          cancellationRefundPercent: 75,
          isActive: true,
        });
      }
    }

    if (Array.isArray(input.plans)) {
      for (const p of input.plans) {
        plansToCreate.push({
          productId: created.id,
          name: p.name.trim(),
          billingInterval: p.billingInterval,
          price: p.price,
          prorationEnabled: p.prorationEnabled ?? true,
          cancellationRefundPercent: p.cancellationRefundPercent ?? 0,
          isActive: true,
        });
      }
    }

    if (plansToCreate.length > 0) {
      await tx.subscriptionPlan.createMany({
        data: plansToCreate,
      });
    }

    return tx.product.findUnique({
      where: { id: created.id },
      include: {
        category: true,
        subscriptionPlans: true,
      },
    });
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "Product",
    entityId: product.id,
    action: "SUBSCRIPTION_PRODUCT_CREATED",
    newValue: { sku: product.sku, name: product.name, productType: "SUBSCRIPTION" },
    reason: "Created new Subscription Product with recurring billing",
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { product },
        "Subscription product created successfully"
      )
    );
});

/**
 * PATCH /api/subscription-products/:id
 */
export const updateSubscriptionProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const input = updateSubscriptionProductSchema.parse(req.body);

  const existing = await prisma.product.findFirst({
    where: { id, productType: "SUBSCRIPTION" },
  });
  if (!existing) {
    throw new ApiError(404, "Subscription product not found");
  }

  if (input.sku && input.sku.toUpperCase().trim() !== existing.sku) {
    const dup = await prisma.product.findUnique({
      where: { sku: input.sku.toUpperCase().trim() },
    });
    if (dup) throw new ApiError(409, `SKU '${input.sku}' is already in use`);
  }

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(input.name && { name: input.name.trim() }),
      ...(input.sku && { sku: input.sku.toUpperCase().trim() }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.categoryId && { categoryId: input.categoryId }),
      ...(input.basePrice !== undefined && { basePrice: input.basePrice }),
      ...(input.costPrice !== undefined && { costPrice: input.costPrice }),
      ...(input.unit && { unit: input.unit }),
      ...(input.taxRate !== undefined && { taxRate: input.taxRate }),
      ...(input.isPromoted !== undefined && { isPromoted: input.isPromoted }),
    },
    include: {
      category: true,
      subscriptionPlans: true,
    },
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { product: updated },
        "Subscription product updated successfully"
      )
    );
});

/**
 * DELETE /api/subscription-products/:id
 */
export const deleteSubscriptionProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.product.findFirst({
    where: { id, productType: "SUBSCRIPTION" },
    include: {
      _count: { select: { quotationLines: true, orderLines: true } },
    },
  });
  if (!existing) {
    throw new ApiError(404, "Subscription product not found");
  }

  // Soft-delete if referenced in deals, else hard delete
  if (existing._count.quotationLines > 0 || existing._count.orderLines > 0) {
    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  } else {
    await prisma.subscriptionPlan.deleteMany({ where: { productId: id } });
    await prisma.product.delete({ where: { id } });
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      { id },
      "Subscription product removed from catalogue"
    )
  );
});

/**
 * POST /api/subscription-products/:id/plans
 * Adds a new recurring billing plan directly to this SaaS product.
 */
export const addPlanToProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const input = planInputSchema.parse(req.body);

  const product = await prisma.product.findFirst({
    where: { id, productType: "SUBSCRIPTION" },
  });
  if (!product) {
    throw new ApiError(404, "Subscription product not found");
  }

  const plan = await prisma.subscriptionPlan.create({
    data: {
      productId: id,
      name: input.name.trim(),
      billingInterval: input.billingInterval,
      price: input.price,
      prorationEnabled: input.prorationEnabled ?? true,
      cancellationRefundPercent: input.cancellationRefundPercent ?? 0,
      isActive: true,
    },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "SubscriptionPlan",
    entityId: plan.id,
    action: "SUBSCRIPTION_PLAN_CREATED",
    newValue: { productId: id, ...input },
    reason: `Added plan "${plan.name}" to subscription product ${product.sku}`,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { plan }, "Plan added to subscription product"));
});

/**
 * DELETE /api/subscription-products/:id/plans/:planId
 * Deactivates or removes a recurring plan from this SaaS product.
 */
export const deletePlanFromProduct = asyncHandler(async (req, res) => {
  const { id, planId } = req.params;

  const plan = await prisma.subscriptionPlan.findFirst({
    where: { id: planId, productId: id },
    include: {
      _count: { select: { subscriptions: true, quotationLines: true } },
    },
  });
  if (!plan) {
    throw new ApiError(404, "Subscription plan not found on this product");
  }

  if (plan._count.subscriptions > 0 || plan._count.quotationLines > 0) {
    await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: { isActive: false },
    });
  } else {
    await prisma.subscriptionPlan.delete({ where: { id: planId } });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { planId }, "Subscription plan removed"));
});

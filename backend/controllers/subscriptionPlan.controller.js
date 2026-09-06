// ============================================================================
//  DealFlow360 — Subscription plan configuration  (§9 steps 1 and 6, PDF §4-A5)
//
//  §9 step 1 requires an admin to CREATE a subscription plan as a real user
//  action; step 6 needs the plan so a recurring line can bill separately from
//  the one-time lines on the same order.
// ============================================================================

import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAuditLog } from "../lib/audit.js";

const planSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  name: z.string().min(1, "Plan name is required"),
  billingInterval: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  price: z.number().min(0, "Price must be zero or positive"),
  prorationEnabled: z.boolean().optional().default(true),
  cancellationRefundPercent: z.number().min(0).max(100).optional().default(0),
  startDate: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v && v.trim() ? new Date(v) : null)),
  endDate: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v && v.trim() ? new Date(v) : null)),
  isActive: z.boolean().optional().default(true),
});

/** GET /api/subscription-plans */
export const getSubscriptionPlans = asyncHandler(async (req, res) => {
  const { productId } = req.query;

  const plans = await prisma.subscriptionPlan.findMany({
    where: { ...(productId && { productId: String(productId) }) },
    include: {
      product: { select: { id: true, sku: true, name: true, productType: true } },
      _count: { select: { subscriptions: true } },
    },
    orderBy: [{ product: { sku: "asc" } }, { price: "asc" }],
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { plans }, "Subscription plans retrieved"));
});

/** GET /api/subscription-plans/:id */
export const getSubscriptionPlanById = asyncHandler(async (req, res) => {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: req.params.id },
    include: { product: true },
  });

  if (!plan) throw new ApiError(404, "Subscription plan not found");

  return res
    .status(200)
    .json(new ApiResponse(200, { plan }, "Subscription plan retrieved"));
});

/** POST /api/subscription-plans */
export const createSubscriptionPlan = asyncHandler(async (req, res) => {
  const input = planSchema.parse(req.body);

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new ApiError(400, `Product not found: ${input.productId}`);

  // Guard the schema invariant: a plan is attached to one product, and a
  // quotation line's plan must belong to that line's product. Attaching a plan
  // to a non-subscription product would let that invariant be violated later.
  if (product.productType !== "SUBSCRIPTION") {
    throw new ApiError(
      400,
      `Product ${product.sku} is ${product.productType}; subscription plans can only be attached to SUBSCRIPTION products`
    );
  }

  const plan = await prisma.subscriptionPlan.create({
    data: input,
    include: { product: { select: { sku: true, name: true } } },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "SubscriptionPlan",
    entityId: plan.id,
    action: "SUBSCRIPTION_PLAN_CREATED",
    newValue: input,
    reason: "Subscription plan created via backend configuration",
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { plan }, "Subscription plan created"));
});

/** PATCH /api/subscription-plans/:id */
export const updateSubscriptionPlan = asyncHandler(async (req, res) => {
  const input = planSchema.partial().parse(req.body);

  const existing = await prisma.subscriptionPlan.findUnique({
    where: { id: req.params.id },
  });
  if (!existing) throw new ApiError(404, "Subscription plan not found");

  const plan = await prisma.subscriptionPlan.update({
    where: { id: req.params.id },
    data: input,
    include: { product: { select: { sku: true, name: true } } },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: "USER",
    entityType: "SubscriptionPlan",
    entityId: plan.id,
    action: "SUBSCRIPTION_PLAN_UPDATED",
    oldValue: { name: existing.name, price: existing.price, billingInterval: existing.billingInterval },
    newValue: input,
    reason: "Subscription plan updated",
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { plan }, "Subscription plan updated"));
});

/** DELETE /api/subscription-plans/:id */
export const deleteSubscriptionPlan = asyncHandler(async (req, res) => {
  const inUse = await prisma.subscription.count({
    where: { subscriptionPlanId: req.params.id },
  });

  if (inUse > 0) {
    throw new ApiError(
      409,
      "Plan has active subscriptions and cannot be deleted; deactivate it instead"
    );
  }

  await prisma.subscriptionPlan.delete({ where: { id: req.params.id } });

  return res.status(200).json(new ApiResponse(200, {}, "Subscription plan deleted"));
});

export default {
  getSubscriptionPlans,
  getSubscriptionPlanById,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
};

// ============================================================================
// DealFlow360 — Governance Controller
// Handles Governance Settings, Discount Rules CRUD, and Quotation Evaluation.
// ============================================================================

import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { recordAuditLog } from '../lib/audit.js';
import { toNumber, round } from '../lib/money.js';
import { ApiError } from '../utils/api-error.js';
import { ApiResponse } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

import { resolveCeiling } from '../rules/resolveCeiling.js';
import { scoreQuotation } from '../rules/scoreQuotation.js';
import { calculateRiskScore } from '../rules/riskEngine.js';
import { selectApprovalPolicySteps } from '../rules/selectApprovalPolicySteps.js';

// ============================================================================
// Input Validation Schemas
// ============================================================================

const updateSettingsSchema = z.object({
  scoreStrategy: z.enum(['VALUE_WEIGHTED', 'SUM_OF_POINTS', 'ABSOLUTE_MARGIN']).optional(),
  unconfiguredCeilingPolicy: z.enum(['DENY', 'TIER_ONLY', 'PERMISSIVE']).optional(),
  stalledAfterDays: z.number().int().min(1).max(365).optional(),
  anomalyDeviationPoints: z.number().min(0).max(100).optional(),
});

const createDiscountRuleSchema = z.object({
  customerTierId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  maxDiscountPercent: z.number().min(0).max(100),
  minMarginPercent: z.number().min(0).max(100).default(0),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

const updateDiscountRuleSchema = z.object({
  customerTierId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  maxDiscountPercent: z.number().min(0).max(100).optional(),
  minMarginPercent: z.number().min(0).max(100).optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// 1. Governance Settings Handlers
// ============================================================================

/**
 * GET /api/governance/settings
 * Retrieves the singleton governance setting row.
 */
export const getSettings = asyncHandler(async (req, res) => {
  let setting = await prisma.governanceSetting.findUnique({
    where: { id: 'singleton' },
  });

  if (!setting) {
    setting = await prisma.governanceSetting.create({
      data: {
        id: 'singleton',
        scoreStrategy: 'VALUE_WEIGHTED',
        unconfiguredCeilingPolicy: 'DENY',
        stalledAfterDays: 7,
        anomalyDeviationPoints: 5.0,
      },
    });
  }

  return res.status(200).json(
    new ApiResponse(200, setting, 'Governance settings retrieved successfully')
  );
});

/**
 * PUT /api/governance/settings
 * Updates the singleton governance settings and records audit log.
 */
export const updateSettings = asyncHandler(async (req, res) => {
  const validated = updateSettingsSchema.parse(req.body);

  const previousSetting = await prisma.governanceSetting.findUnique({
    where: { id: 'singleton' },
  });

  const updatedSetting = await prisma.governanceSetting.upsert({
    where: { id: 'singleton' },
    update: validated,
    create: {
      id: 'singleton',
      scoreStrategy: validated.scoreStrategy || 'VALUE_WEIGHTED',
      unconfiguredCeilingPolicy: validated.unconfiguredCeilingPolicy || 'DENY',
      stalledAfterDays: validated.stalledAfterDays ?? 7,
      anomalyDeviationPoints: validated.anomalyDeviationPoints ?? 5.0,
    },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: 'USER',
    entityType: 'GovernanceSetting',
    entityId: 'singleton',
    action: 'GOVERNANCE_SETTINGS_UPDATED',
    oldValue: previousSetting,
    newValue: updatedSetting,
    reason: req.body.reason || 'Admin updated governance settings',
  });

  return res.status(200).json(
    new ApiResponse(200, updatedSetting, 'Governance settings updated successfully')
  );
});

// ============================================================================
// 2. Discount Rules CRUD Handlers
// ============================================================================

/**
 * GET /api/governance/discount-rules
 * Lists discount rules with optional customerTierId, categoryId, isActive filters.
 */
export const listDiscountRules = asyncHandler(async (req, res) => {
  const { customerTierId, categoryId, isActive } = req.query;

  const where = {};
  if (customerTierId !== undefined) {
    where.customerTierId = customerTierId === 'null' ? null : String(customerTierId);
  }
  if (categoryId !== undefined) {
    where.categoryId = categoryId === 'null' ? null : String(categoryId);
  }
  if (isActive !== undefined) {
    where.isActive = isActive === 'true';
  }

  const rules = await prisma.discountRule.findMany({
    where,
    include: {
      customerTier: true,
      category: true,
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });

  return res.status(200).json(
    new ApiResponse(200, rules, 'Discount rules retrieved successfully')
  );
});

/**
 * POST /api/governance/discount-rules
 * Creates a new discount rule with Invariant 4 validation (Postgres NULL trap).
 */
export const createDiscountRule = asyncHandler(async (req, res) => {
  const validated = createDiscountRuleSchema.parse(req.body);

  // Invariant 4: Check if rule already exists for this (tier, category) pairing
  const existing = await prisma.discountRule.findFirst({
    where: {
      customerTierId: validated.customerTierId || null,
      categoryId: validated.categoryId || null,
    },
  });

  if (existing) {
    throw new ApiError(
      409,
      'A discount rule already exists for this Customer Tier and Category combination'
    );
  }

  const rule = await prisma.discountRule.create({
    data: {
      customerTierId: validated.customerTierId || null,
      categoryId: validated.categoryId || null,
      maxDiscountPercent: validated.maxDiscountPercent,
      minMarginPercent: validated.minMarginPercent ?? 0,
      priority: validated.priority ?? 0,
      isActive: validated.isActive ?? true,
    },
    include: {
      customerTier: true,
      category: true,
    },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: 'USER',
    entityType: 'DiscountRule',
    entityId: rule.id,
    action: 'DISCOUNT_RULE_CREATED',
    newValue: rule,
    reason: req.body.reason || 'Admin created discount rule',
  });

  return res.status(201).json(
    new ApiResponse(201, rule, 'Discount rule created successfully')
  );
});

/**
 * PUT /api/governance/discount-rules/:id
 * Updates an existing discount rule.
 */
export const updateDiscountRule = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const validated = updateDiscountRuleSchema.parse(req.body);

  const existingRule = await prisma.discountRule.findUnique({
    where: { id },
  });

  if (!existingRule) {
    throw new ApiError(404, `Discount rule with id '${id}' not found`);
  }

  const updatedRule = await prisma.discountRule.update({
    where: { id },
    data: validated,
    include: {
      customerTier: true,
      category: true,
    },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: 'USER',
    entityType: 'DiscountRule',
    entityId: id,
    action: 'DISCOUNT_RULE_UPDATED',
    oldValue: existingRule,
    newValue: updatedRule,
    reason: req.body.reason || 'Admin updated discount rule',
  });

  return res.status(200).json(
    new ApiResponse(200, updatedRule, 'Discount rule updated successfully')
  );
});

/**
 * DELETE /api/governance/discount-rules/:id
 * Deletes a discount rule.
 */
export const deleteDiscountRule = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existingRule = await prisma.discountRule.findUnique({
    where: { id },
  });

  if (!existingRule) {
    throw new ApiError(404, `Discount rule with id '${id}' not found`);
  }

  await prisma.discountRule.delete({
    where: { id },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: 'USER',
    entityType: 'DiscountRule',
    entityId: id,
    action: 'DISCOUNT_RULE_DELETED',
    oldValue: existingRule,
    reason: req.body.reason || 'Admin deleted discount rule',
  });

  return res.status(200).json(
    new ApiResponse(200, null, 'Discount rule deleted successfully')
  );
});

// ============================================================================
// 3. Quotation Governance & Risk Evaluation
// ============================================================================

/**
 * Helper: Evaluates a quotation against live database config.
 * Reusable by both governance.controller and approval.controller.
 *
 * @param {string} quotationId
 * @returns {Promise<Object>}
 */
export async function runQuotationEvaluation(quotationId) {
  // 1. Fetch quotation and all related lines, product catalog, customer tier
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      customer: { include: { customerTier: true } },
      customerTier: true,
      lines: {
        include: {
          product: { include: { category: true } },
          productVariant: true,
        },
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!quotation) {
    throw new ApiError(404, `Quotation with id '${quotationId}' not found`);
  }

  // 2. Fetch fresh configuration from DB (no caching, M2 verification)
  const setting =
    (await prisma.governanceSetting.findUnique({ where: { id: 'singleton' } })) || {
      scoreStrategy: 'VALUE_WEIGHTED',
      unconfiguredCeilingPolicy: 'DENY',
    };

  const discountRules = await prisma.discountRule.findMany({
    where: { isActive: true },
  });

  const activePolicy = await prisma.approvalPolicy.findFirst({
    where: { isActive: true },
    include: {
      steps: {
        include: { role: true },
        orderBy: { stepOrder: 'asc' },
      },
    },
  });

  // 3. Evaluate each line with pure resolveCeiling()
  const resolvedLines = quotation.lines.map((line) => {
    const categoryId = line.product?.categoryId || null;
    const referencePrice = toNumber(line.product?.basePrice, toNumber(line.unitPrice, 0));
    const unitPrice = toNumber(line.unitPrice, referencePrice);
    const unitCost = toNumber(line.unitCost ?? line.product?.costPrice, 0);
    const discountPercent = toNumber(line.discountPercent, 0);

    const ceilingResult = resolveCeiling(
      {
        categoryId,
        referencePrice,
        unitPrice,
        discountPercent,
      },
      quotation.customerTier,
      discountRules,
      setting
    );

    return {
      ...line,
      productId: line.productId,
      productName: line.product?.name || 'Line Item',
      quantity: line.quantity,
      unitPrice,
      unitCost,
      referencePrice,
      discountPercent: ceilingResult.effectiveDiscountPercent,
      effectiveCeilingPercent: ceilingResult.effectiveCeilingPercent,
      minMarginPercent: ceilingResult.minMarginPercent,
      isBypassed: ceilingResult.isBypassed,
    };
  });

  // 4. Score quotation with pure scoreQuotation()
  const scoreVerdict = scoreQuotation(resolvedLines, {
    scoreStrategy: setting.scoreStrategy,
  });

  // 5. Calculate explainable risk score (0–100) with pure riskEngine
  const riskVerdict = calculateRiskScore(quotation, scoreVerdict);

  // 6. Select approval ladder steps with pure selectApprovalPolicySteps()
  const routingVerdict = selectApprovalPolicySteps(activePolicy, scoreVerdict);

  // 7. Persist evaluation verdict onto Quotation and QuotationLine in DB
  await prisma.$transaction(async (tx) => {
    // Update lines
    for (const finding of scoreVerdict.findings) {
      await tx.quotationLine.update({
        where: { id: finding.lineId },
        data: {
          effectiveCeilingPercent: finding.effectiveCeilingPercent,
          overagePts: finding.overagePts,
          minMarginPercent: finding.minMarginPercent,
          lineMarginPercent: finding.lineMarginPercent,
          lineTotal: round(finding.unitPrice * finding.quantity, 2),
        },
      });
    }

    // Update quote totals & governance metrics
    await tx.quotation.update({
      where: { id: quotationId },
      data: {
        blendedScore: scoreVerdict.blendedScore,
        worstLineOverage: scoreVerdict.worstLineOverage,
        marginFloorBreached: scoreVerdict.marginFloorBreached,
        lastActivityAt: new Date(),
      },
    });
  });

  return {
    quotationId,
    quotationNumber: quotation.quotationNumber,
    customerTier: quotation.customerTier?.name,
    blendedScore: scoreVerdict.blendedScore,
    worstLineOverage: scoreVerdict.worstLineOverage,
    marginFloorBreached: scoreVerdict.marginFloorBreached,
    totalValue: scoreVerdict.totalValue,
    riskScore: riskVerdict.riskScore,
    riskBand: riskVerdict.riskBand,
    recommendedRoute: riskVerdict.recommendedRoute,
    riskFactors: riskVerdict.factors,
    riskExplanation: riskVerdict.explanation,
    requiresApproval: routingVerdict.requiresApproval,
    requiredApprovalSteps: routingVerdict.matchedSteps,
    activePolicyName: activePolicy?.name || 'Default Ladder',
    findings: scoreVerdict.findings,
  };
}

/**
 * POST /api/governance/evaluate/:quotationId
 * Runs quotation evaluation against live DB rules and returns explainable findings.
 */
export const evaluateQuotation = asyncHandler(async (req, res) => {
  const { quotationId } = req.params;
  const result = await runQuotationEvaluation(quotationId);

  return res.status(200).json(
    new ApiResponse(200, result, 'Quotation evaluated successfully')
  );
});

export default {
  getSettings,
  updateSettings,
  listDiscountRules,
  createDiscountRule,
  updateDiscountRule,
  deleteDiscountRule,
  evaluateQuotation,
  runQuotationEvaluation,
};

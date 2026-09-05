// ============================================================================
// DealFlow360 — Approval Controller
// Handles Approval Policies, Steps CRUD, and the Complete Approval Lifecycle:
// Request Approval (or Auto-Approve), Approve, Reject, Return, and History.
// ============================================================================

import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { recordAuditLog } from '../lib/audit.js';
import { ApiError } from '../utils/api-error.js';
import { ApiResponse } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import { runQuotationEvaluation } from './governance.controller.js';

// ============================================================================
// Input Validation Schemas
// ============================================================================

const createPolicySchema = z.object({
  name: z.string().min(2, 'Policy name must be at least 2 characters'),
  isActive: z.boolean().default(true),
});

const createPolicyStepSchema = z.object({
  roleId: z.string().min(1, 'Role ID is required'),
  stepOrder: z.number().int().min(1, 'Step order must be a positive integer'),
  minBlendedScore: z.number().min(0).nullable().optional(),
  minWorstLineOverage: z.number().min(0).nullable().optional(),
});

const updatePolicyStepSchema = z.object({
  roleId: z.string().min(1).optional(),
  stepOrder: z.number().int().min(1).optional(),
  minBlendedScore: z.number().min(0).nullable().optional(),
  minWorstLineOverage: z.number().min(0).nullable().optional(),
});

const approveStepSchema = z.object({
  reason: z.string().optional(),
});

const rejectStepSchema = z.object({
  reason: z.string().min(3, 'A clear reason for rejection is required (min 3 chars)'),
});

const returnStepSchema = z.object({
  reason: z.string().min(3, 'Feedback instructions for revision are required (min 3 chars)'),
});

// ============================================================================
// 1. Approval Policy & Ladder Step Handlers
// ============================================================================

/**
 * GET /api/approval-policies
 * Fetches all approval policies with their steps and assigned roles.
 */
export const getPolicies = asyncHandler(async (req, res) => {
  const policies = await prisma.approvalPolicy.findMany({
    include: {
      steps: {
        include: { role: true },
        orderBy: { stepOrder: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.status(200).json(
    new ApiResponse(200, policies, 'Approval policies retrieved successfully')
  );
});

/**
 * GET /api/approval-policies/:id
 * Fetches a single policy by ID.
 */
export const getPolicyById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const policy = await prisma.approvalPolicy.findUnique({
    where: { id },
    include: {
      steps: {
        include: { role: true },
        orderBy: { stepOrder: 'asc' },
      },
    },
  });

  if (!policy) {
    throw new ApiError(404, `Approval policy with id '${id}' not found`);
  }

  return res.status(200).json(
    new ApiResponse(200, policy, 'Approval policy retrieved successfully')
  );
});

/**
 * POST /api/approval-policies
 * Creates a new approval policy (Admin).
 */
export const createPolicy = asyncHandler(async (req, res) => {
  const validated = createPolicySchema.parse(req.body);

  // Invariant 1: If new policy is active, deactivate others
  if (validated.isActive) {
    await prisma.approvalPolicy.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
  }

  const policy = await prisma.approvalPolicy.create({
    data: validated,
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: 'USER',
    entityType: 'ApprovalPolicy',
    entityId: policy.id,
    action: 'APPROVAL_POLICY_CREATED',
    newValue: policy,
    reason: req.body.reason || 'Admin created approval policy',
  });

  return res.status(201).json(
    new ApiResponse(201, policy, 'Approval policy created successfully')
  );
});

/**
 * POST /api/approval-policies/:id/steps
 * Adds a rung/step to an approval policy ladder.
 */
export const createPolicyStep = asyncHandler(async (req, res) => {
  const { id: approvalPolicyId } = req.params;
  const validated = createPolicyStepSchema.parse(req.body);

  const policy = await prisma.approvalPolicy.findUnique({
    where: { id: approvalPolicyId },
  });

  if (!policy) {
    throw new ApiError(404, `Approval policy with id '${approvalPolicyId}' not found`);
  }

  const role = await prisma.role.findUnique({
    where: { id: validated.roleId },
  });

  if (!role) {
    throw new ApiError(404, `Role with id '${validated.roleId}' not found`);
  }

  const step = await prisma.approvalPolicyStep.create({
    data: {
      approvalPolicyId,
      roleId: validated.roleId,
      stepOrder: validated.stepOrder,
      minBlendedScore: validated.minBlendedScore ?? null,
      minWorstLineOverage: validated.minWorstLineOverage ?? null,
    },
    include: { role: true },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: 'USER',
    entityType: 'ApprovalPolicyStep',
    entityId: step.id,
    action: 'APPROVAL_POLICY_STEP_CREATED',
    newValue: step,
    reason: req.body.reason || 'Admin added step to approval policy ladder',
  });

  return res.status(201).json(
    new ApiResponse(201, step, 'Approval policy step created successfully')
  );
});

/**
 * PUT /api/approval-policies/steps/:stepId
 * Updates an approval policy step.
 */
export const updatePolicyStep = asyncHandler(async (req, res) => {
  const { stepId } = req.params;
  const validated = updatePolicyStepSchema.parse(req.body);

  const existingStep = await prisma.approvalPolicyStep.findUnique({
    where: { id: stepId },
  });

  if (!existingStep) {
    throw new ApiError(404, `Approval policy step with id '${stepId}' not found`);
  }

  const updatedStep = await prisma.approvalPolicyStep.update({
    where: { id: stepId },
    data: validated,
    include: { role: true },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: 'USER',
    entityType: 'ApprovalPolicyStep',
    entityId: stepId,
    action: 'APPROVAL_POLICY_STEP_UPDATED',
    oldValue: existingStep,
    newValue: updatedStep,
    reason: req.body.reason || 'Admin updated approval policy step',
  });

  return res.status(200).json(
    new ApiResponse(200, updatedStep, 'Approval policy step updated successfully')
  );
});

/**
 * DELETE /api/approval-policies/steps/:stepId
 * Removes an approval policy step from a ladder.
 */
export const deletePolicyStep = asyncHandler(async (req, res) => {
  const { stepId } = req.params;

  const existingStep = await prisma.approvalPolicyStep.findUnique({
    where: { id: stepId },
  });

  if (!existingStep) {
    throw new ApiError(404, `Approval policy step with id '${stepId}' not found`);
  }

  await prisma.approvalPolicyStep.delete({
    where: { id: stepId },
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    actorType: 'USER',
    entityType: 'ApprovalPolicyStep',
    entityId: stepId,
    action: 'APPROVAL_POLICY_STEP_DELETED',
    oldValue: existingStep,
    reason: req.body.reason || 'Admin deleted approval policy step',
  });

  return res.status(200).json(
    new ApiResponse(200, null, 'Approval policy step deleted successfully')
  );
});

// ============================================================================
// 2. Approval Lifecycle Handlers
// ============================================================================

/**
 * POST /api/approvals/request/:quotationId
 * Submits a quotation for approval.
 * - If quotation is clean (0 violations) -> Auto-approves cleanly (PRD M4).
 * - If violations detected -> Opens a new cycle and creates required approval steps.
 */
export const requestApproval = asyncHandler(async (req, res) => {
  const { quotationId } = req.params;
  const triggerSource = req.body.triggerSource || 'REP_SUBMIT';

  // 1. Run live quotation evaluation
  const evalResult = await runQuotationEvaluation(quotationId);

  // 2. Branch A: Auto-Approve if compliant
  if (!evalResult.requiresApproval || evalResult.requiredApprovalSteps.length === 0) {
    const updatedQuotation = await prisma.quotation.update({
      where: { id: quotationId },
      data: {
        status: 'APPROVED',
        lastActivityAt: new Date(),
      },
    });

    await recordAuditLog({
      userId: req.user?.id || null,
      quotationId,
      actorType: req.user ? 'USER' : 'SYSTEM',
      entityType: 'Quotation',
      entityId: quotationId,
      action: 'APPROVAL_AUTO_GRANTED',
      newValue: { status: 'APPROVED', blendedScore: evalResult.blendedScore },
      reason: 'Quotation complies with all discount ceilings and margins (Auto-approved)',
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          autoApproved: true,
          status: 'APPROVED',
          quotation: updatedQuotation,
          evaluation: evalResult,
        },
        'Quotation within policy limits: auto-approved successfully'
      )
    );
  }

  // 3. Branch B: Requires Human Approval Ladder
  const activePolicy = await prisma.approvalPolicy.findFirst({
    where: { isActive: true },
  });

  if (!activePolicy) {
    throw new ApiError(500, 'No active approval policy configured in the system');
  }

  // Get next approval cycle counter
  const lastApproval = await prisma.quotationApproval.findFirst({
    where: { quotationId },
    orderBy: { approvalCycle: 'desc' },
  });
  const nextCycle = (lastApproval?.approvalCycle || 0) + 1;

  // Create approval cycle record and step rows in a single transaction
  const approval = await prisma.$transaction(async (tx) => {
    const newApproval = await tx.quotationApproval.create({
      data: {
        quotationId,
        approvalPolicyId: activePolicy.id,
        approvalCycle: nextCycle,
        status: 'PENDING',
        blendedScore: evalResult.blendedScore,
        worstLineOverage: evalResult.worstLineOverage,
        findings: evalResult.findings,
        triggeredBy: triggerSource,
        steps: {
          create: evalResult.requiredApprovalSteps.map((step) => ({
            roleId: step.roleId,
            stepOrder: step.stepOrder,
            status: 'PENDING',
          })),
        },
      },
      include: {
        steps: {
          include: { role: true },
          orderBy: { stepOrder: 'asc' },
        },
      },
    });

    await tx.quotation.update({
      where: { id: quotationId },
      data: {
        status: 'PENDING_APPROVAL',
        lastActivityAt: new Date(),
      },
    });

    return newApproval;
  });

  await recordAuditLog({
    userId: req.user?.id || null,
    quotationId,
    actorType: req.user ? 'USER' : 'SYSTEM',
    entityType: 'QuotationApproval',
    entityId: approval.id,
    action: 'APPROVAL_REQUESTED',
    newValue: {
      approvalCycle: nextCycle,
      triggeredSteps: evalResult.requiredApprovalSteps.map((s) => s.roleCode),
      blendedScore: evalResult.blendedScore,
      worstLineOverage: evalResult.worstLineOverage,
    },
    reason: `Approval requested via ${triggerSource}`,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        autoApproved: false,
        status: 'PENDING_APPROVAL',
        approval,
        evaluation: evalResult,
      },
      'Quotation requires authorization: approval cycle created'
    )
  );
});

/**
 * POST /api/approvals/steps/:stepId/approve
 * Approves a specific step in the ladder.
 * - Checks reviewer role.
 * - Blocks self-approval (sales rep !== reviewer).
 * - If last step -> marks Quotation as APPROVED.
 */
export const approveStep = asyncHandler(async (req, res) => {
  const { stepId } = req.params;
  const validated = approveStepSchema.parse(req.body);
  const currentUser = req.user;

  // 1. Fetch step with approval and quotation
  const step = await prisma.quotationApprovalStep.findUnique({
    where: { id: stepId },
    include: {
      role: true,
      quotationApproval: {
        include: { quotation: true },
      },
    },
  });

  if (!step) {
    throw new ApiError(404, `Approval step with id '${stepId}' not found`);
  }

  if (step.status !== 'PENDING') {
    throw new ApiError(400, `Step is already in '${step.status}' state`);
  }

  const quotation = step.quotationApproval.quotation;

  // 2. Anti-Self-Approval Guard (PDF §2.8 / Architecture)
  // "The requester must never approve their own request. Block self-approval and route upward."
  if (quotation.salesRepId === currentUser.id) {
    throw new ApiError(
      403,
      'Anti-self-approval violation: The requester is not permitted to approve their own request (PDF §2.8)'
    );
  }

  // 3. Verify Reviewer Role
  const hasRole =
    currentUser.roleId === step.roleId || currentUser.role?.code === 'ADMIN';
  if (!hasRole) {
    throw new ApiError(
      403,
      `Access denied: only users with role '${step.role.name}' can approve this step`
    );
  }

  // 4. Update step and check remaining ladder
  const result = await prisma.$transaction(async (tx) => {
    const updatedStep = await tx.quotationApprovalStep.update({
      where: { id: stepId },
      data: {
        status: 'APPROVED',
        reviewerId: currentUser.id,
        actedAt: new Date(),
        reason: validated.reason || 'Approved by reviewer',
      },
      include: { role: true, reviewer: true },
    });

    // Check if any other pending steps remain in this cycle
    const pendingStepsCount = await tx.quotationApprovalStep.count({
      where: {
        quotationApprovalId: step.quotationApprovalId,
        status: 'PENDING',
      },
    });

    let cycleCompleted = false;

    if (pendingStepsCount === 0) {
      // All rungs of ladder are approved!
      cycleCompleted = true;

      await tx.quotationApproval.update({
        where: { id: step.quotationApprovalId },
        data: {
          status: 'APPROVED',
          completedAt: new Date(),
        },
      });

      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          status: 'APPROVED',
          lastActivityAt: new Date(),
        },
      });
    }

    return { updatedStep, cycleCompleted };
  });

  // 5. Record Audit Trail
  await recordAuditLog({
    userId: currentUser.id,
    quotationId: quotation.id,
    actorType: 'USER',
    entityType: 'QuotationApprovalStep',
    entityId: stepId,
    action: 'APPROVAL_STEP_APPROVED',
    newValue: {
      stepOrder: step.stepOrder,
      role: step.role.code,
      cycleCompleted: result.cycleCompleted,
    },
    reason: validated.reason || 'Step approved',
  });

  if (result.cycleCompleted) {
    await recordAuditLog({
      userId: currentUser.id,
      quotationId: quotation.id,
      actorType: 'USER',
      entityType: 'Quotation',
      entityId: quotation.id,
      action: 'APPROVAL_CYCLE_APPROVED',
      newValue: { status: 'APPROVED' },
      reason: 'All approval ladder steps satisfied',
    });
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        step: result.updatedStep,
        cycleCompleted: result.cycleCompleted,
        quotationStatus: result.cycleCompleted ? 'APPROVED' : 'PENDING_APPROVAL',
      },
      result.cycleCompleted
        ? 'Final approval granted: quotation is now APPROVED'
        : 'Step approved successfully: awaiting remaining ladder steps'
    )
  );
});

/**
 * POST /api/approvals/steps/:stepId/reject
 * Rejects a quotation with mandatory reason.
 */
export const rejectStep = asyncHandler(async (req, res) => {
  const { stepId } = req.params;
  const validated = rejectStepSchema.parse(req.body);
  const currentUser = req.user;

  const step = await prisma.quotationApprovalStep.findUnique({
    where: { id: stepId },
    include: {
      role: true,
      quotationApproval: {
        include: { quotation: true },
      },
    },
  });

  if (!step) {
    throw new ApiError(404, `Approval step with id '${stepId}' not found`);
  }

  if (step.status !== 'PENDING') {
    throw new ApiError(400, `Step is already in '${step.status}' state`);
  }

  // Role check
  const hasRole =
    currentUser.roleId === step.roleId || currentUser.role?.code === 'ADMIN';
  if (!hasRole) {
    throw new ApiError(
      403,
      `Access denied: only users with role '${step.role.name}' can reject this step`
    );
  }

  const quotation = step.quotationApproval.quotation;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedStep = await tx.quotationApprovalStep.update({
      where: { id: stepId },
      data: {
        status: 'REJECTED',
        reviewerId: currentUser.id,
        actedAt: new Date(),
        reason: validated.reason,
      },
      include: { role: true, reviewer: true },
    });

    await tx.quotationApproval.update({
      where: { id: step.quotationApprovalId },
      data: {
        status: 'REJECTED',
        completedAt: new Date(),
      },
    });

    await tx.quotation.update({
      where: { id: quotation.id },
      data: {
        status: 'REJECTED',
        lastActivityAt: new Date(),
      },
    });

    return updatedStep;
  });

  await recordAuditLog({
    userId: currentUser.id,
    quotationId: quotation.id,
    actorType: 'USER',
    entityType: 'QuotationApprovalStep',
    entityId: stepId,
    action: 'APPROVAL_STEP_REJECTED',
    newValue: { status: 'REJECTED', quotationStatus: 'REJECTED' },
    reason: validated.reason,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { step: updated, quotationStatus: 'REJECTED' },
      'Quotation rejected successfully'
    )
  );
});

/**
 * POST /api/approvals/steps/:stepId/return
 * Sends quotation back to the sales rep for revision (status resets to DRAFT).
 */
export const returnStep = asyncHandler(async (req, res) => {
  const { stepId } = req.params;
  const validated = returnStepSchema.parse(req.body);
  const currentUser = req.user;

  const step = await prisma.quotationApprovalStep.findUnique({
    where: { id: stepId },
    include: {
      role: true,
      quotationApproval: {
        include: { quotation: true },
      },
    },
  });

  if (!step) {
    throw new ApiError(404, `Approval step with id '${stepId}' not found`);
  }

  if (step.status !== 'PENDING') {
    throw new ApiError(400, `Step is already in '${step.status}' state`);
  }

  const hasRole =
    currentUser.roleId === step.roleId || currentUser.role?.code === 'ADMIN';
  if (!hasRole) {
    throw new ApiError(
      403,
      `Access denied: only users with role '${step.role.name}' can return this step`
    );
  }

  const quotation = step.quotationApproval.quotation;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedStep = await tx.quotationApprovalStep.update({
      where: { id: stepId },
      data: {
        status: 'RETURNED',
        reviewerId: currentUser.id,
        actedAt: new Date(),
        reason: validated.reason,
      },
      include: { role: true, reviewer: true },
    });

    await tx.quotationApproval.update({
      where: { id: step.quotationApprovalId },
      data: {
        status: 'RETURNED',
        completedAt: new Date(),
      },
    });

    // Return to DRAFT so rep can edit lines and revise discount
    await tx.quotation.update({
      where: { id: quotation.id },
      data: {
        status: 'DRAFT',
        lastActivityAt: new Date(),
      },
    });

    return updatedStep;
  });

  await recordAuditLog({
    userId: currentUser.id,
    quotationId: quotation.id,
    actorType: 'USER',
    entityType: 'QuotationApprovalStep',
    entityId: stepId,
    action: 'APPROVAL_STEP_RETURNED',
    newValue: { status: 'RETURNED', quotationStatus: 'DRAFT' },
    reason: validated.reason,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { step: updated, quotationStatus: 'DRAFT' },
      'Quotation returned to sales rep for revision'
    )
  );
});

/**
 * GET /api/approvals/quotation/:quotationId/history
 * Returns full approval cycle history with stored findings snapshots and audit trails.
 */
export const getApprovalHistory = asyncHandler(async (req, res) => {
  const { quotationId } = req.params;

  const cycles = await prisma.quotationApproval.findMany({
    where: { quotationId },
    include: {
      approvalPolicy: true,
      steps: {
        include: {
          role: true,
          reviewer: {
            select: { id: true, fullName: true, email: true },
          },
        },
        orderBy: { stepOrder: 'asc' },
      },
    },
    orderBy: { approvalCycle: 'desc' },
  });

  const auditLogs = await prisma.auditLog.findMany({
    where: { quotationId },
    include: {
      user: {
        select: { id: true, fullName: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { quotationId, cycles, auditLogs },
      'Approval history retrieved successfully'
    )
  );
});

export default {
  getPolicies,
  getPolicyById,
  createPolicy,
  createPolicyStep,
  updatePolicyStep,
  deletePolicyStep,
  requestApproval,
  approveStep,
  rejectStep,
  returnStep,
  getApprovalHistory,
};

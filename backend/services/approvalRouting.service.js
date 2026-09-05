// ============================================================================
//  DealFlow360 — Approval routing service
//
//  This is the mechanism behind §9 step 3: "Confirm the quotation automatically
//  asks for manager approval, WITHOUT the rep having to request it manually."
//
//  The logic used to live inside the POST /api/approvals/request/:id HTTP
//  handler, which meant the only way to route a quotation was for the rep to
//  explicitly ask for approval — precisely what the walkthrough says must not
//  be necessary. It is extracted here so three callers can share it:
//
//    1. POST /api/quotations/:id/submit   — the rep confirms; the system routes
//    2. POST /api/approvals/request/:id   — the original explicit endpoint
//    3. the negotiation flow              — a customer counter-offer re-routes
//                                           the quote as a NEW approval cycle
//
//  Every caller gets identical behaviour because there is only one implementation.
// ============================================================================

import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/api-error.js";
import { recordAuditLog } from "../lib/audit.js";
import { runQuotationEvaluation } from "../controllers/governance.controller.js";

/**
 * Evaluate a quotation and route it: auto-approve when it is inside every
 * configured ceiling, otherwise open an approval cycle with exactly the rungs
 * the policy says are required.
 *
 * @param {Object}  params
 * @param {string}  params.quotationId
 * @param {string|null} [params.actorUserId] - null when the SYSTEM acts
 * @param {string}  [params.triggerSource='REP_SUBMIT'] - REP_SUBMIT |
 *        CUSTOMER_NEGOTIATION | CONFIG_CHANGE | SYSTEM_REEVALUATION
 * @returns {Promise<Object>} { autoApproved, status, approval, evaluation }
 */
export async function routeQuotationForApproval({
  quotationId,
  actorUserId = null,
  triggerSource = "REP_SUBMIT",
}) {
  // 1. Score the quotation against CURRENT configuration. Nothing is cached,
  //    so a ceiling an admin changed a second ago is already in force.
  const evaluation = await runQuotationEvaluation(quotationId);

  const actorType = actorUserId ? "USER" : "SYSTEM";

  // 2. Compliant quotation → approve it without troubling a human.
  //    This is the other half of the promise: managers should only see the
  //    deals that genuinely need them (PRD guardrail M4).
  if (!evaluation.requiresApproval || evaluation.requiredApprovalSteps.length === 0) {
    const quotation = await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: "APPROVED", lastActivityAt: new Date() },
    });

    await recordAuditLog({
      userId: actorUserId,
      quotationId,
      actorType,
      entityType: "Quotation",
      entityId: quotationId,
      action: "APPROVAL_AUTO_GRANTED",
      newValue: { status: "APPROVED", blendedScore: evaluation.blendedScore },
      reason:
        "Quotation complies with all discount ceilings and margins (Auto-approved)",
    });

    return { autoApproved: true, status: "APPROVED", quotation, approval: null, evaluation };
  }

  // 3. Needs humans. Open a new approval cycle.
  const activePolicy = await prisma.approvalPolicy.findFirst({
    where: { isActive: true },
  });

  if (!activePolicy) {
    throw new ApiError(500, "No active approval policy configured in the system");
  }

  // Cycles are numbered, never overwritten — so the review that happened before
  // a customer counter-offer stays readable afterwards (§9 step 7).
  const lastApproval = await prisma.quotationApproval.findFirst({
    where: { quotationId },
    orderBy: { approvalCycle: "desc" },
  });
  const nextCycle = (lastApproval?.approvalCycle || 0) + 1;

  const approval = await prisma.$transaction(async (tx) => {
    const created = await tx.quotationApproval.create({
      data: {
        quotationId,
        approvalPolicyId: activePolicy.id,
        approvalCycle: nextCycle,
        status: "PENDING",
        blendedScore: evaluation.blendedScore,
        worstLineOverage: evaluation.worstLineOverage,
        // The per-line explanation is STORED, not recomputed, so the approval
        // screen can answer "why is this on my desk?" from the record itself.
        findings: evaluation.findings,
        triggeredBy: triggerSource,
        steps: {
          create: evaluation.requiredApprovalSteps.map((step) => ({
            roleId: step.roleId,
            stepOrder: step.stepOrder,
            status: "PENDING",
          })),
        },
      },
      include: {
        steps: { include: { role: true }, orderBy: { stepOrder: "asc" } },
      },
    });

    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "PENDING_APPROVAL", lastActivityAt: new Date() },
    });

    return created;
  });

  await recordAuditLog({
    userId: actorUserId,
    quotationId,
    actorType,
    entityType: "QuotationApproval",
    entityId: approval.id,
    action: "APPROVAL_REQUESTED",
    newValue: {
      approvalCycle: nextCycle,
      triggeredSteps: evaluation.requiredApprovalSteps.map((s) => s.roleCode),
      blendedScore: evaluation.blendedScore,
      worstLineOverage: evaluation.worstLineOverage,
    },
    reason: `Approval requested via ${triggerSource}`,
  });

  return {
    autoApproved: false,
    status: "PENDING_APPROVAL",
    quotation: null,
    approval,
    evaluation,
  };
}

export default { routeQuotationForApproval };

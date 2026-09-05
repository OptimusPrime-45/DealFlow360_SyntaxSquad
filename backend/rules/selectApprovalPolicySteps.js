// ============================================================================
// DealFlow360 — Pure Rule Function: selectApprovalPolicySteps
// Determines which steps of the approval ladder fire based on triggers.
// PURE FUNCTION: Zero database or Prisma dependencies.
// ============================================================================

import { toNumber, round } from '../lib/money.js';

/**
 * Evaluates an approval policy against quotation score verdict.
 *
 * Trigger Rule:
 *   An ApprovalPolicyStep fires when:
 *       blendedScore     >= step.minBlendedScore
 *    OR worstLineOverage >= step.minWorstLineOverage
 *
 * @param {Object} policy - ApprovalPolicy row including steps array
 * @param {Array<Object>} policy.steps - Array of ApprovalPolicyStep
 * @param {Object} evaluation - Evaluation verdict
 *
 * @returns {Object} Result:
 *   {
 *     requiresApproval: boolean,
 *     matchedSteps: Array<Object>
 *   }
 */
export function selectApprovalPolicySteps(policy, evaluation) {
  if (!policy || !policy.steps || policy.steps.length === 0) {
    return {
      requiresApproval: false,
      matchedSteps: [],
    };
  }

  const blendedScore = toNumber(evaluation?.blendedScore, 0);
  const worstLineOverage = toNumber(evaluation?.worstLineOverage, 0);

  const sortedSteps = [...policy.steps].sort(
    (a, b) => toNumber(a.stepOrder, 0) - toNumber(b.stepOrder, 0)
  );

  const matchedSteps = [];

  for (const step of sortedSteps) {
    const minBlended =
      step.minBlendedScore !== null && step.minBlendedScore !== undefined
        ? toNumber(step.minBlendedScore)
        : null;

    const minWorstLine =
      step.minWorstLineOverage !== null && step.minWorstLineOverage !== undefined
        ? toNumber(step.minWorstLineOverage)
        : null;

    const reasons = [];

    if (minBlended !== null && blendedScore >= minBlended) {
      reasons.push(
        `Blended overage score ${blendedScore.toFixed(2)} meets or exceeds step threshold ${minBlended.toFixed(2)}`
      );
    }

    if (minWorstLine !== null && worstLineOverage >= minWorstLine) {
      reasons.push(
        `Worst single line overage ${worstLineOverage.toFixed(2)} pts meets or exceeds step threshold ${minWorstLine.toFixed(2)} pts`
      );
    }

    if (reasons.length > 0) {
      matchedSteps.push({
        stepId: step.id,
        stepOrder: step.stepOrder,
        roleId: step.roleId,
        roleCode: step.role?.code || 'APPROVER',
        roleName: step.role?.name || 'Authorized Approver',
        triggerReasons: reasons,
        minBlendedScore: minBlended,
        minWorstLineOverage: minWorstLine,
      });
    }
  }

  return {
    requiresApproval: matchedSteps.length > 0,
    matchedSteps,
  };
}

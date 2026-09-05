// ============================================================================
// DealFlow360 — Pure Rule Function: selectApprovalPolicySteps
// Determines which steps of the approval ladder fire based on triggers.
// PURE FUNCTION: Zero database or Prisma dependencies.
// ============================================================================

import { toNumber, round } from '../lib/money.js';

/**
 * Evaluates an approval policy against quotation score verdict and risk assessment.
 *
 * Trigger Rule:
 *   An ApprovalPolicyStep fires when:
 *       blendedScore     >= step.minBlendedScore
 *    OR worstLineOverage >= step.minWorstLineOverage
 *    OR riskBand is HIGH/CRITICAL (escalates to include Finance Manager)
 *    OR margin floor is breached
 *
 * @param {Object} policy - ApprovalPolicy row including steps array
 * @param {Array<Object>} policy.steps - Array of ApprovalPolicyStep
 * @param {Object} evaluation - Evaluation verdict (blendedScore, worstLineOverage, marginFloorBreached)
 * @param {Object|null} [riskVerdict=null] - Risk engine verdict (riskScore, riskBand, recommendedRoute)
 *
 * @returns {Object} Result:
 *   {
 *     requiresApproval: boolean,
 *     matchedSteps: Array<Object>
 *   }
 */
export function selectApprovalPolicySteps(policy, evaluation, riskVerdict = null) {
  if (!policy || !policy.steps || policy.steps.length === 0) {
    return {
      requiresApproval: false,
      matchedSteps: [],
    };
  }

  const blendedScore = toNumber(evaluation?.blendedScore, 0);
  const worstLineOverage = toNumber(evaluation?.worstLineOverage, 0);
  const marginFloorBreached = Boolean(evaluation?.marginFloorBreached);
  const riskBand = riskVerdict?.riskBand || null;
  const isHighRisk = riskBand === 'HIGH' || riskBand === 'CRITICAL' || marginFloorBreached;
  const isModerateRisk = riskBand === 'MEDIUM' || worstLineOverage > 0 || blendedScore > 0;

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

    const roleCode = step.role?.code || 'APPROVER';
    const reasons = [];

    // 1. Check score thresholds
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

    // 2. Risk Engine Escalation (PDF §2.6 & §2.8)
    // If quote is high risk, Step 2 (Finance) and Step 1 (Manager) must both fire
    if (isHighRisk) {
      if (roleCode === 'FINANCE' && reasons.length === 0) {
        reasons.push(
          `High risk deal exposure (${riskVerdict?.riskScore ?? 'breach'}/100 [${riskBand || 'HIGH'}]) requires secondary Finance authorization`
        );
      }
      if (roleCode === 'SALES_MANAGER' && reasons.length === 0) {
        reasons.push(
          `High risk deal exposure requires initial Sales Manager review before Finance escalation`
        );
      }
    } else if (isModerateRisk && roleCode === 'SALES_MANAGER' && reasons.length === 0) {
      reasons.push(
        `Moderate deal risk (${riskVerdict?.riskScore ?? 'overage'}/100 [${riskBand || 'MEDIUM'}]) requires Sales Manager authorization`
      );
    }

    if (reasons.length > 0) {
      matchedSteps.push({
        stepId: step.id,
        stepOrder: step.stepOrder,
        roleId: step.roleId,
        roleCode,
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

export default selectApprovalPolicySteps;

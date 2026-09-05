// ============================================================================
// DealFlow360 — Pure Rule Function: riskEngine
// Converts commercial deal exposure into an explainable 0–100 risk score.
// Reference: DealFlow360_Hero_Feature_1_and_2_Explained_Optimized.pdf §2.6
// PURE FUNCTION: Zero database or Prisma dependencies.
// ============================================================================

import { toNumber, round } from '../lib/money.js';

/**
 * Calculates an explainable 0–100 risk score across 5 weighted factors:
 *   1. Discount excess (Max 40 pts)
 *   2. Margin breach (Max 40 pts)
 *   3. Deal value exposure (Max 15 pts)
 *   4. Multiple violations (Max 10 pts)
 *   5. Historical / Tier behavior (Max 15 pts)
 *
 * Risk classification bands (PDF §2.6):
 *   0–20:   LOW      (Auto-approve / compliant)
 *   21–40:  MEDIUM   (Sales Manager)
 *   41–70:  HIGH     (Sales Manager + Finance)
 *   71–100: CRITICAL (Senior Manager / Director)
 *
 * @param {Object} quotation - Quotation data (grandTotal, subtotal, customerTier, etc.)
 * @param {Object} scoreVerdict - Output from scoreQuotation() (worstLineOverage, blendedScore, marginFloorBreached, findings)
 * @returns {Object} Explainable risk score and factor contributions:
 *   {
 *     riskScore: number,
 *     riskBand: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
 *     recommendedRoute: string,
 *     factors: {
 *       discountExcess: number,
 *       marginBreach: number,
 *       dealValue: number,
 *       multipleViolations: number,
 *       historicalBehavior: number
 *     },
 *     explanation: Array<string>
 *   }
 */
export function calculateRiskScore(quotation = {}, scoreVerdict = {}) {
  const worstLineOverage = toNumber(scoreVerdict?.worstLineOverage, 0);
  const blendedScore = toNumber(scoreVerdict?.blendedScore, 0);
  const marginFloorBreached = Boolean(scoreVerdict?.marginFloorBreached);
  const findings = scoreVerdict?.findings || [];
  const grandTotal = toNumber(
    quotation?.grandTotal ?? quotation?.subtotal ?? scoreVerdict?.totalValue,
    0
  );
  const tierRank = toNumber(quotation?.customerTier?.rank, 2);

  const explanation = [];

  // PDF §2.11 Edge Cases 1 & 2: Pre-calculation rejection check
  const invalidLine = findings.find((f) => f.validationError);
  if (invalidLine) {
    explanation.push(`REJECTED: ${invalidLine.validationError}`);
    return {
      riskScore: 100,
      riskBand: 'CRITICAL',
      recommendedRoute: 'Rejected (Validation Failure)',
      factors: {
        discountExcess: 40,
        marginBreach: 40,
        dealValue: 10,
        multipleViolations: 10,
        historicalBehavior: 0,
      },
      explanation,
    };
  }

  // Factor 1: Discount Excess (Max 40 pts)
  // Combines worst line overage (peak concession) and blended score (order-wide exposure)
  let discountExcess = 0;
  if (worstLineOverage > 0 || blendedScore > 0) {
    // 2.5 pts per worst line overage point + 1.5 pts per blended overage point
    discountExcess = Math.min(40, worstLineOverage * 2.5 + blendedScore * 1.5);
    discountExcess = round(discountExcess, 2);
    if (discountExcess > 0) {
      explanation.push(
        `Discount excess contributed ${discountExcess} pts (Worst Line: ${worstLineOverage} pts, Blended: ${blendedScore})`
      );
    }
  }

  // Factor 2: Margin Breach (Max 40 pts)
  // Penalizes deals that cut below minimum profit margin floor or have unknown product costs
  let marginBreach = 0;
  if (marginFloorBreached) {
    let maxMarginDeficit = 0;
    let hasMissingCostLine = false;

    for (const f of findings) {
      if (f.isMarginUnknown) {
        hasMissingCostLine = true;
      } else if (f.marginBreached && f.minMarginPercent > f.lineMarginPercent) {
        const deficit = f.minMarginPercent - f.lineMarginPercent;
        if (deficit > maxMarginDeficit) {
          maxMarginDeficit = deficit;
        }
      }
    }

    // PDF §2.11 Edge Case 3: Missing product cost requires review
    if (hasMissingCostLine) {
      marginBreach = Math.max(marginBreach, 30);
      explanation.push(
        'Missing product cost: margin marked unknown and requires review (PDF §2.11 Edge Case 3)'
      );
    }

    if (maxMarginDeficit > 0) {
      // Base 20 pts for breaching margin floor + 2 pts per % point of deficit
      marginBreach = Math.min(40, Math.max(marginBreach, 20 + maxMarginDeficit * 2));
      marginBreach = round(marginBreach, 2);
      explanation.push(
        `Margin floor breach detected contributing ${marginBreach} pts (Max deficit: ${maxMarginDeficit.toFixed(1)}%)`
      );
    }
  }

  // Factor 3: Deal Value Exposure (Max 15 pts)
  // High monetary value deals represent larger financial exposure
  let dealValue = 0;
  if (grandTotal >= 1000000) {
    dealValue = 15; // >= ₹10,00,000
    explanation.push(`High deal value (₹${grandTotal.toLocaleString()}) added 15 pts exposure`);
  } else if (grandTotal >= 500000) {
    dealValue = 10; // >= ₹5,00,000
    explanation.push(`Moderate-high deal value (₹${grandTotal.toLocaleString()}) added 10 pts exposure`);
  } else if (grandTotal >= 100000) {
    dealValue = 5;  // >= ₹1,00,000
    explanation.push(`Mid-sized deal value (₹${grandTotal.toLocaleString()}) added 5 pts exposure`);
  }

  // Factor 4: Multiple Violations (Max 10 pts)
  // Counts how many lines in the quote breach policy
  let multipleViolations = 0;
  const violatingLinesCount = findings.filter((f) => f.overagePts > 0).length;
  if (violatingLinesCount >= 3) {
    multipleViolations = 10;
    explanation.push(`Multiple line violations (${violatingLinesCount} lines over ceiling) added 10 pts`);
  } else if (violatingLinesCount === 2) {
    multipleViolations = 6;
    explanation.push(`Two line violations added 6 pts`);
  } else if (violatingLinesCount === 1) {
    multipleViolations = 3;
  }

  // Factor 5: Historical / Tier Behavior (Max 15 pts)
  // Lower tier clients or reps with high discount deviation carry higher baseline risk
  let historicalBehavior = 0;
  if (tierRank <= 1) {
    historicalBehavior = 12; // Bronze / unrated
    explanation.push(`Tier credit/governance risk (Bronze / Starter tier) added 12 pts`);
  } else if (tierRank === 2) {
    historicalBehavior = 6;  // Silver
    explanation.push(`Standard tier baseline added 6 pts`);
  } else {
    historicalBehavior = 2;  // Gold / Enterprise
  }

  // Total Risk Score (0–100)
  let totalScore =
    discountExcess +
    marginBreach +
    dealValue +
    multipleViolations +
    historicalBehavior;

  totalScore = round(Math.max(0, Math.min(100, totalScore)), 2);

  // Risk Band Classification (PDF §2.6 & §2.8)
  let riskBand = 'LOW';
  let recommendedRoute = 'Auto-approve';

  if (totalScore >= 71) {
    riskBand = 'CRITICAL';
    recommendedRoute = 'Senior Manager / Director';
  } else if (totalScore >= 41 || marginFloorBreached) {
    riskBand = 'HIGH';
    recommendedRoute = 'Sales Manager + Finance';
  } else if (totalScore >= 21 || worstLineOverage > 0 || blendedScore > 0) {
    riskBand = 'MEDIUM';
    recommendedRoute = 'Sales Manager';
  }

  return {
    riskScore: totalScore,
    riskBand,
    recommendedRoute,
    factors: {
      discountExcess,
      marginBreach,
      dealValue,
      multipleViolations,
      historicalBehavior,
    },
    explanation,
  };
}

// ============================================================================
// DealFlow360 — Money & Percentage Calculation Utility
// Prevents Prisma.Decimal silent string concatenation footguns (Spike 1).
// Pure, deterministic, zero external database dependencies.
// ============================================================================

/**
 * Coerces value to a safe JS number with decimal precision.
 * @param {number|string|object|null|undefined} val
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function toNumber(val, fallback = 0) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? fallback : parsed;
  }
  // If Prisma.Decimal or BigNumber-like object
  if (typeof val === 'object' && typeof val.toNumber === 'function') {
    return val.toNumber();
  }
  if (typeof val === 'object' && typeof val.toString === 'function') {
    const parsed = parseFloat(val.toString());
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

/**
 * Rounds a number to specified decimal places (defaults to 2).
 * @param {number|string|object} val
 * @param {number} [decimals=2]
 * @returns {number}
 */
export function round(val, decimals = 2) {
  const num = toNumber(val);
  const factor = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

/**
 * Multiplication: a * b
 */
export function mul(a, b, decimals = 2) {
  return round(toNumber(a) * toNumber(b), decimals);
}

/**
 * Safe division: a / b
 */
export function div(a, b, decimals = 4) {
  const denom = toNumber(b);
  if (denom === 0) return 0;
  return round(toNumber(a) / denom, decimals);
}

/**
 * Percentage calculation: (val * percent) / 100
 */
export function pct(val, percent) {
  return round((toNumber(val) * toNumber(percent)) / 100, 2);
}

/**
 * Margin percentage: ((price - cost) / price) * 100
 */
export function marginPct(price, cost) {
  const p = toNumber(price);
  const c = toNumber(cost);
  if (p <= 0) return 0;
  return round(((p - c) / p) * 100, 2);
}

/**
 * Addition: a + b
 */
export function add(a, b) {
  return round(toNumber(a) + toNumber(b), 2);
}

/**
 * Subtraction: a - b
 */
export function sub(a, b) {
  return round(toNumber(a) - toNumber(b), 2);
}

/**
 * Line item arithmetic
 */
export function calculateLineMath({
  quantity = 1,
  unitPrice = 0,
  unitCost = 0,
  discountPercent = 0,
}) {
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const price = round(unitPrice);
  const cost = round(unitCost);
  const discPct = Math.max(0, Math.min(100, round(discountPercent)));

  const grossTotal = mul(qty, price);
  const discountAmount = pct(grossTotal, discPct);
  const lineTotal = sub(grossTotal, discountAmount); // Net Total
  const totalCost = mul(qty, cost);
  const marginAmount = sub(lineTotal, totalCost);

  let marginPercent = 0;
  if (lineTotal > 0) {
    marginPercent = round((marginAmount / lineTotal) * 100);
  }

  return {
    quantity: qty,
    unitPrice: price,
    unitCost: cost,
    discountPercent: discPct,
    grossTotal,
    discountAmount,
    lineTotal,
    totalCost,
    marginAmount,
    marginPercent,
  };
}

// Aliases for compatibility across tracks
export const toNum = toNumber;
export const round2 = round;
export const round4 = (val) => round(val, 4);

export default {
  toNumber,
  toNum,
  round,
  round2,
  round4,
  mul,
  div,
  pct,
  marginPct,
  add,
  sub,
  calculateLineMath,
};
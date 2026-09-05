/**
 * Money and Decimal arithmetic helper module
 * Solves Spike 1 from architecture.md: Prisma.Decimal objects silently string-concatenate
 * when using `+`. This module guarantees safe numeric arithmetic rounded to 2 decimal places.
 */

export const toNum = (val) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (typeof val === "object" && typeof val.toNumber === "function") {
    return val.toNumber();
  }
  const parsed = parseFloat(String(val));
  return isNaN(parsed) ? 0 : parsed;
};

export const round2 = (val) => {
  const n = toNum(val);
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

export const round4 = (val) => {
  const n = toNum(val);
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
};

export const add = (a, b) => round2(toNum(a) + toNum(b));
export const sub = (a, b) => round2(toNum(a) - toNum(b));
export const mul = (a, b) => round2(toNum(a) * toNum(b));
export const div = (a, b) => {
  const divisor = toNum(b);
  if (divisor === 0) return 0;
  return round2(toNum(a) / divisor);
};

export const pct = (value, percent) => {
  return round2((toNum(value) * toNum(percent)) / 100);
};

/**
 * Line item arithmetic
 */
export const calculateLineMath = ({
  quantity = 1,
  unitPrice = 0,
  unitCost = 0,
  discountPercent = 0,
}) => {
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const price = round2(unitPrice);
  const cost = round2(unitCost);
  const discPct = Math.max(0, Math.min(100, round2(discountPercent)));

  const grossTotal = mul(qty, price);
  const discountAmount = pct(grossTotal, discPct);
  const lineTotal = sub(grossTotal, discountAmount); // Net Total
  const totalCost = mul(qty, cost);
  const marginAmount = sub(lineTotal, totalCost);

  let marginPercent = 0;
  if (lineTotal > 0) {
    marginPercent = round2((marginAmount / lineTotal) * 100);
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
};

export default {
  toNum,
  round2,
  round4,
  add,
  sub,
  mul,
  div,
  pct,
  calculateLineMath,
};

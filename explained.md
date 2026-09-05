# DealFlow360: Deep Dive & Code Explanation
## Risk Fixtures & Pure Rule Functions

---

## 1. The Business Problem: Why This Exists

In traditional B2B sales and ERP/CRM systems (like Salesforce or standard Odoo), quote approvals suffer from **three critical blind spots**:

### Blind Spot 1: The "Category Blindness" Trap
A high-tier customer (e.g. **Gold Tier**) is allowed an overall discount ceiling of **15%**.
* On a high-margin product like a **Laptop** (cost ₹70,000, selling price ₹1,00,000), giving a **12% discount** still leaves a healthy profit margin (~20.5%).
* On a low-margin **Setup & Deployment Service** (cost ₹12,000, price ₹20,000), the company policy sets a strict category limit of **10%**.
* **The Problem:** If a sales rep gives an **18% discount** on the setup service, standard CRM software only checks the customer's 15% Gold ceiling and lets it slide through, causing direct margin bleeding.

### Blind Spot 2: The "Many-Small Concessions" Leakage (PRD §10)
A rep closes a ₹30,000 deal across 3 items.
* On Item 1, they give 2% above ceiling.
* On Item 2, they give 3% above ceiling.
* On Item 3, they give 2% above ceiling.
* **The Problem:** If the approval system only looks for severe single-line violations (e.g., "Flag quotes with any line over 5% overage"), **none of these lines look alarming alone**. Yet added together, the company has quietly given away significant profit. 
* A simple worst-line check is blind to this. A pure arithmetic average is also flawed because discounting a ₹10 cable shouldn't carry the same weight as discounting a ₹10,00,000 server.

### Blind Spot 3: The Anti-Bypass Loophole
If the software strictly enforces discount fields, a clever sales rep avoids review by typing `0%` in the discount box and simply editing the unit price directly from ₹1,00,000 down to ₹80,000. Naive rule engines never realize a 20% discount was given.

### Blind Spot 4: Hardcoded Rules vs. "Rules Live in Data"
If limits and thresholds are written into backend code (`if (discount > 15) ...`), changing a discount ceiling requires engineering time, Git commits, and server restarts. When a manager asks "what happens if I lower services ceiling to 8% right now?", traditional systems fail.

---

## 2. What These Two Features Actually Do

### Feature A: Risk Fixtures (`riskFixtures.js`)
Test fixtures are **reproducible, deterministic test contracts** based on actual business edge cases defined in the project specification and PDF:
1. **Fixture 1 (§10 Worked Example):** One severe violation hidden in a large order (Laptop ₹1000 @ 12%, Setup Service ₹200 @ 18%).
2. **Fixture 2 (PRD M3 Many-Small Violations):** Three equal lines, each 2–3 points over ceiling. Proves the blended scoring mechanism.
3. **Fixture 3 (PRD M4 Clean Quote):** All discounts compliant. Proves that compliant deals **never** bother managers (zero false positives).
4. **Fixture 4 (PDF §2.5 Anti-Bypass):** Rep alters the unit price directly. Proves the anti-bypass calculator works.

### Feature B: Pure Rule Functions
A suite of mathematical and policy evaluation functions with **zero database/Prisma imports**:
1. **`resolveCeiling.js`**: Calculates the strictest applicable discount ceiling across Tier, Category, and Anti-bypass pricing.
2. **`scoreQuotation.js`**: Calculates line-level overages, profit margins, and value-weighted blended exposure.
3. **`selectApprovalPolicySteps.js`**: Evaluates two independent triggers (`blendedScore` and `worstLineOverage`) against the approval ladder.

---

## 3. Mathematical Formulas Used

| Metric | Formula | Purpose |
|---|---|---|
| **Effective Discount (Anti-Bypass)** | $\max\left(\text{enteredDiscount}, \left(1 - \frac{\text{sellingPrice}}{\text{referencePrice}}\right) \times 100\right)$ | Stops reps from circumventing discount limits by editing unit prices. |
| **Effective Ceiling** | $\min(\text{Rule}_{\text{tier, cat}}, \text{Rule}_{\text{cat}}, \text{Rule}_{\text{tier}}, \text{TierCeiling})$ | Hard-policy strictest ceiling resolution. |
| **Line Overage** | $\max(0, \text{EffectiveDiscount} - \text{EffectiveCeiling})$ | Points discounted beyond what policy allows. |
| **Line Margin %** | $\frac{\text{sellingPrice} - \text{unitCost}}{\text{sellingPrice}} \times 100$ | Margin health check against `minMarginPercent`. |
| **Value-Weighted Blended Score** | $\frac{\sum (\text{overage}_i \times \text{lineValue}_i)}{\sum \text{lineValue}_i}$ | Combines total concession exposure weighted by monetary value. |

---

## 4. Code Explanation: Step-by-Step

### 1. `resolveCeiling.js` — The Strictest Limit & Anti-Bypass Engine

```javascript
// Step 1: Anti-Bypass Check
const referencePrice = toNumber(line?.referencePrice ?? line?.basePrice, 0);
const unitPrice = toNumber(line?.unitPrice, referencePrice);

let calculatedPriceDiscount = 0;
if (referencePrice > 0 && unitPrice < referencePrice) {
  calculatedPriceDiscount = ((referencePrice - unitPrice) / referencePrice) * 100;
}
const effectiveDiscountPercent = round(
  Math.max(enteredDiscount, calculatedPriceDiscount),
  2
);
```
* **Explanation:** If reference price is ₹1,00,000 and the rep writes ₹80,000, `calculatedPriceDiscount` becomes 20%. `effectiveDiscountPercent` takes `Math.max(0%, 20%) = 20%`. The bypass is stopped.

```javascript
// Step 2 & 3: Strictest Applicable Ceiling (MIN algorithm)
const candidateLimits = [];

for (const rule of matchedRules) {
  if (rule.maxDiscountPercent != null) candidateLimits.push(toNumber(rule.maxDiscountPercent));
}
if (tier?.maxDiscountPercent != null) {
  candidateLimits.push(toNumber(tier.maxDiscountPercent));
}

let effectiveCeilingPercent;
if (candidateLimits.length > 0) {
  effectiveCeilingPercent = Math.min(...candidateLimits);
} else {
  // Unconfigured policy fallback: DENY => 0%
  effectiveCeilingPercent = governanceSetting?.unconfiguredCeilingPolicy === 'DENY' ? 0.0 : ...;
}
```
* **Explanation:** A Gold customer has a 15% tier ceiling, but Services category has a 10% ceiling. `candidateLimits` contains `[10, 15]`. `Math.min(10, 15) = 10%`. Setup Service is strictly constrained to 10%.

---

### 2. `scoreQuotation.js` — Blended Exposure & Findings Generator

```javascript
const overagePts = round(Math.max(0, discountPercent - effectiveCeilingPercent), 2);
worstLineOverage = Math.max(worstLineOverage, overagePts);

// Accumulators for Value-Weighted Score
weightedOverageSum += overagePts * lineValue;
totalValue += lineValue;
```
* **Explanation:** If a line discount is 18% and ceiling is 10%, `overagePts = 8.00`.
* `worstLineOverage` captures the single worst offending line (8.00 pts).
* `weightedOverageSum` scales this overage by the line's financial value.

```javascript
// Final Blended Score
blendedScore = totalValue > 0 ? weightedOverageSum / totalValue : 0;
```
* **Explanation:** On a quote with a ₹1000 laptop (0 overage) and a ₹200 setup service (8 overage):
  $$\text{blendedScore} = \frac{(0 \times 1000) + (8 \times 200)}{1000 + 200} = \frac{1600}{1200} = 1.33$$
* This gives a single, mathematically sound exposure score for the quotation.

---

### 3. `selectApprovalPolicySteps.js` — Dynamic Approval Ladder Routing

```javascript
// Two independent trigger conditions:
if (minBlended !== null && blendedScore >= minBlended) {
  reasons.push(`Blended overage score ${blendedScore} >= threshold ${minBlended}`);
}

if (minWorstLine !== null && worstLineOverage >= minWorstLine) {
  reasons.push(`Worst single line overage ${worstLineOverage} pts >= threshold ${minWorstLine} pts`);
}
```
* **Explanation:** 
  * Why two triggers? Because no single number can catch both failure modes!
  * If a quote has **one extreme violation** (8 pts over) inside a huge clean order, `worstLineOverage` catches it (8.00 >= 5.00).
  * If a quote has **three small violations** (2, 3, 2 pts over), `worstLineOverage` is only 3 (safe), but `blendedScore` is 2.33 (which crosses the 2.00 threshold) and routes it for review.
  * If all lines are clean, neither condition fires $\to$ **Auto-approved**!

---

## 5. How It Proves the Thesis

1. **"The Rules Live in Data, Not in Code":**
   These functions accept `tier`, `discountRules`, and `governanceSetting` as inputs. When an admin updates a ceiling or changes `unconfiguredCeilingPolicy` in PostgreSQL, the exact same pure functions immediately return the new verdicts with **0 lines of code changed and 0 restarts**.
2. **Deterministic and 100% Testable:**
   Because there are no database queries, network calls, or hidden side effects in these files, they run in milliseconds and can be thoroughly verified through automated scripts (`npm test`).

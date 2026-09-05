// ============================================================================
// DealFlow360 — Risk & Governance Test Fixtures
// Reference: DealFlow360_Hero_Feature_1_and_2_Explained_Optimized.pdf
//            self-governing-deal-engine.architecture.md (Spike 3)
// Zero database dependencies.
// ============================================================================

export const GOVERNANCE_SETTING_DEFAULT = {
  id: 'singleton',
  scoreStrategy: 'VALUE_WEIGHTED',
  unconfiguredCeilingPolicy: 'DENY', // 0% if no rule matches
  stalledAfterDays: 7,
  anomalyDeviationPoints: 5.0,
};

export const CUSTOMER_TIER_GOLD = {
  id: 'tier_gold',
  code: 'GOLD',
  name: 'Gold Tier',
  rank: 3,
  maxDiscountPercent: 15.0,
};

export const CUSTOMER_TIER_SILVER = {
  id: 'tier_silver',
  code: 'SILVER',
  name: 'Silver Tier',
  rank: 2,
  maxDiscountPercent: 10.0,
};

export const CUSTOMER_TIER_BRONZE = {
  id: 'tier_bronze',
  code: 'BRONZE',
  name: 'Bronze Tier',
  rank: 1,
  maxDiscountPercent: 5.0,
};

export const CATEGORIES = {
  HARDWARE: { id: 'cat_hardware', name: 'Hardware' },
  SERVICES: { id: 'cat_services', name: 'Professional Services' },
  SUPPORT: { id: 'cat_support', name: 'Support & Maintenance' },
};

export const STANDARD_APPROVAL_POLICY = {
  id: 'policy_standard',
  name: 'Standard Approval Ladder',
  isActive: true,
  steps: [
    {
      id: 'step_manager',
      approvalPolicyId: 'policy_standard',
      roleId: 'role_sales_manager',
      role: { id: 'role_sales_manager', code: 'SALES_MANAGER', name: 'Sales Manager' },
      stepOrder: 1,
      minBlendedScore: 2.0,       // Triggers when blendedScore >= 2.0
      minWorstLineOverage: 5.0,   // OR when single line overage >= 5.0
    },
    {
      id: 'step_finance',
      approvalPolicyId: 'policy_standard',
      roleId: 'role_finance',
      role: { id: 'role_finance', code: 'FINANCE', name: 'Finance' },
      stepOrder: 2,
      minBlendedScore: 10.0,      // Triggers when blendedScore >= 10.0
      minWorstLineOverage: 15.0,  // OR when single line overage >= 15.0
    },
  ],
};

// ----------------------------------------------------------------------------
// Fixture 1: §10 Worked Example from PDF & Architecture Doc
// Case: Laptop ₹1000 @ 12% (ceiling 15), Setup Service ₹200 @ 18% (ceiling 10)
// Expected: worstLineOverage = 8.00, blendedScore = 1.33
// Routed by: worstLineOverage (triggers Sales Manager because 8.00 >= 5.00)
// ----------------------------------------------------------------------------
export const FIXTURE_1_WORKED_EXAMPLE = {
  name: 'Fixture 1: PDF §10 Worked Example (Single Line Overage)',
  tier: CUSTOMER_TIER_GOLD,
  setting: GOVERNANCE_SETTING_DEFAULT,
  discountRules: [
    {
      id: 'rule_gold_hardware',
      customerTierId: CUSTOMER_TIER_GOLD.id,
      categoryId: CATEGORIES.HARDWARE.id,
      maxDiscountPercent: 15.0,
      minMarginPercent: 20.0,
      priority: 1,
      isActive: true,
    },
    {
      id: 'rule_services_all_tiers',
      customerTierId: null, // Category-wide ceiling
      categoryId: CATEGORIES.SERVICES.id,
      maxDiscountPercent: 10.0,
      minMarginPercent: 25.0,
      priority: 1,
      isActive: true,
    },
  ],
  lines: [
    {
      id: 'line_laptop',
      productId: 'prod_laptop',
      productName: 'Enterprise Laptop',
      categoryId: CATEGORIES.HARDWARE.id,
      quantity: 1,
      referencePrice: 1000.0,
      unitPrice: 880.0, // After 12% discount
      unitCost: 700.0,
      discountPercent: 12.0,
    },
    {
      id: 'line_setup',
      productId: 'prod_setup',
      productName: 'Setup & Deployment Service',
      categoryId: CATEGORIES.SERVICES.id,
      quantity: 1,
      referencePrice: 200.0,
      unitPrice: 164.0, // After 18% discount
      unitCost: 120.0,
      discountPercent: 18.0,
    },
  ],
  policy: STANDARD_APPROVAL_POLICY,
  expected: {
    worstLineOverage: 8.0,
    blendedScore: 1.33,
    requiresApproval: true,
    triggeredRoleCodes: ['SALES_MANAGER'],
  },
};

// ----------------------------------------------------------------------------
// Fixture 2: PRD Metric M3 — Many-Small Violations
// Case: Three equal lines (₹10,000 each) with 2, 3, 2 points over individual ceilings.
// Expected: worstLineOverage = 3.00, blendedScore = 2.33
// Routed by: blendedScore (triggers Sales Manager because 2.33 >= 2.00)
// ----------------------------------------------------------------------------
export const FIXTURE_2_MANY_SMALL_VIOLATIONS = {
  name: 'Fixture 2: PRD M3 Many-Small Violations (Blended Exposure)',
  tier: CUSTOMER_TIER_SILVER, // 10% ceiling
  setting: GOVERNANCE_SETTING_DEFAULT,
  discountRules: [
    {
      id: 'rule_silver_hw',
      customerTierId: CUSTOMER_TIER_SILVER.id,
      categoryId: CATEGORIES.HARDWARE.id,
      maxDiscountPercent: 10.0,
      minMarginPercent: 15.0,
      priority: 1,
      isActive: true,
    },
  ],
  lines: [
    {
      id: 'line_item_1',
      productId: 'prod_monitor',
      productName: 'Office Monitor 27"',
      categoryId: CATEGORIES.HARDWARE.id,
      quantity: 10,
      referencePrice: 1000.0,
      unitPrice: 880.0,
      unitCost: 700.0,
      discountPercent: 12.0,
    },
    {
      id: 'line_item_2',
      productId: 'prod_dock',
      productName: 'USB-C Docking Station',
      categoryId: CATEGORIES.HARDWARE.id,
      quantity: 10,
      referencePrice: 1000.0,
      unitPrice: 870.0,
      unitCost: 650.0,
      discountPercent: 13.0,
    },
    {
      id: 'line_item_3',
      productId: 'prod_peripherals',
      productName: 'Keyboard & Mouse Combo',
      categoryId: CATEGORIES.HARDWARE.id,
      quantity: 10,
      referencePrice: 1000.0,
      unitPrice: 880.0,
      unitCost: 600.0,
      discountPercent: 12.0,
    },
  ],
  policy: STANDARD_APPROVAL_POLICY,
  expected: {
    worstLineOverage: 3.0,
    blendedScore: 2.33,
    requiresApproval: true,
    triggeredRoleCodes: ['SALES_MANAGER'],
  },
};

// ----------------------------------------------------------------------------
// Fixture 3: PRD Metric M4 — Clean Compliant Quote (Guardrail)
// Case: All lines strictly within permitted discounts.
// Expected: worstLineOverage = 0.00, blendedScore = 0.00
// Routed by: None (Auto-approve / No human approval required)
// ----------------------------------------------------------------------------
export const FIXTURE_3_CLEAN_QUOTE = {
  name: 'Fixture 3: PRD M4 Clean Quote (Zero False Positives)',
  tier: CUSTOMER_TIER_GOLD, // 15% ceiling
  setting: GOVERNANCE_SETTING_DEFAULT,
  discountRules: [
    {
      id: 'rule_gold_hardware',
      customerTierId: CUSTOMER_TIER_GOLD.id,
      categoryId: CATEGORIES.HARDWARE.id,
      maxDiscountPercent: 15.0,
      minMarginPercent: 20.0,
      priority: 1,
      isActive: true,
    },
    {
      id: 'rule_services_all',
      customerTierId: null,
      categoryId: CATEGORIES.SERVICES.id,
      maxDiscountPercent: 10.0,
      minMarginPercent: 25.0,
      priority: 1,
      isActive: true,
    },
  ],
  lines: [
    {
      id: 'line_laptop_clean',
      productId: 'prod_laptop',
      productName: 'Enterprise Laptop',
      categoryId: CATEGORIES.HARDWARE.id,
      quantity: 2,
      referencePrice: 1000.0,
      unitPrice: 900.0,
      unitCost: 700.0,
      discountPercent: 10.0,
    },
    {
      id: 'line_setup_clean',
      productId: 'prod_setup',
      productName: 'Setup Service',
      categoryId: CATEGORIES.SERVICES.id,
      quantity: 1,
      referencePrice: 200.0,
      unitPrice: 184.0,
      unitCost: 120.0,
      discountPercent: 8.0,
    },
  ],
  policy: STANDARD_APPROVAL_POLICY,
  expected: {
    worstLineOverage: 0.0,
    blendedScore: 0.0,
    requiresApproval: false,
    triggeredRoleCodes: [],
  },
};

// ----------------------------------------------------------------------------
// Fixture 4: PDF §2.5 Anti-Bypass Check
// Case: Sales rep enters 0% discount but lowers unit price from ₹1,00,000 to ₹80,000
// Expected: Engine detects 20% effective discount against reference price.
// ----------------------------------------------------------------------------
export const FIXTURE_4_ANTI_BYPASS = {
  name: 'Fixture 4: PDF §2.5 Anti-Bypass Price Reduction',
  tier: CUSTOMER_TIER_GOLD, // 15% ceiling
  setting: GOVERNANCE_SETTING_DEFAULT,
  discountRules: [
    {
      id: 'rule_gold_hardware',
      customerTierId: CUSTOMER_TIER_GOLD.id,
      categoryId: CATEGORIES.HARDWARE.id,
      maxDiscountPercent: 15.0,
      minMarginPercent: 20.0,
      priority: 1,
      isActive: true,
    },
  ],
  lines: [
    {
      id: 'line_server',
      productId: 'prod_server',
      productName: 'High-Density Rack Server',
      categoryId: CATEGORIES.HARDWARE.id,
      quantity: 1,
      referencePrice: 100000.0,
      unitPrice: 80000.0,
      unitCost: 60000.0,
      discountPercent: 0.0,
    },
  ],
  policy: STANDARD_APPROVAL_POLICY,
  expected: {
    detectedEffectiveDiscount: 20.0,
    effectiveCeilingPercent: 15.0,
    overagePts: 5.0,
    requiresApproval: true,
    triggeredRoleCodes: ['SALES_MANAGER'],
  },
};

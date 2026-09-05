/**
 * DealFlow360 — Hardcoded Product-to-Upsell Catalog
 *
 * Provides deterministic 1 or 2 complementary, high-margin recommendations
 * for each product in the catalog to boost quote value and gross margin.
 */

export const HARDCODED_UPSELL_MAP = {
  // 1. Laptops
  "HW-LAPTOP-15": [
    { sku: "SUB-CRM-PRO", tag: "High Margin (+77.8%)", reason: "DealFlow CRM Pro Suite for Mobile Sales Teams" },
    { sku: "SUB-SECURITY-SHIELD", tag: "Essential Security", reason: "Zero-Trust Endpoint Security for Laptops" },
  ],
  "PRO-LAPTOP-01": [
    { sku: "SRV-SUPPORT-247", tag: "Executive Care", reason: "24/7 Dedicated IT Support SLA & Priority Dispatch" },
    { sku: "SUB-SECURITY-SHIELD", tag: "Essential Security", reason: "Zero-Trust Endpoint Security Shield" },
  ],
  "PROD-LAPTOP-01": [
    { sku: "SUB-SECURITY-SHIELD", tag: "Essential Security", reason: "Zero-Trust Endpoint Security Shield" },
    { sku: "SRV-SUPPORT-247", tag: "Executive Care", reason: "24/7 Dedicated IT Support SLA" },
  ],

  // 2. Workstations & Desktops
  "HW-DESKTOP-ULTRA": [
    { sku: "HW-MONITOR-27", tag: "Co-Purchase Pairing", reason: "UltraSharp 4K Monitor 27\" Dual Display Setup" },
    { sku: "SRV-MAINT-FLEET", tag: "Hardware Care", reason: "Preventive Hardware Maintenance & Fleet Care" },
  ],
  "PRO-WORKSTATION-01": [
    { sku: "HW-MONITOR-27", tag: "Co-Purchase Pairing", reason: "UltraSharp 4K Monitor 27\" Display" },
    { sku: "SRV-MAINT-FLEET", tag: "Hardware Care", reason: "Hardware Preventive Maintenance Package" },
  ],

  // 3. Servers & Infrastructure
  "HW-SERVER-2U": [
    { sku: "SUB-BACKUP-PRO", tag: "Disaster Recovery", reason: "Managed Cloud Backup Pro (80% Margin)" },
    { sku: "SRV-CONSULT-01", tag: "Professional Service", reason: "Enterprise Architecture Consulting & Migration" },
  ],
  "PRO-SERVER-RACK-01": [
    { sku: "SUB-BACKUP-PRO", tag: "Disaster Recovery", reason: "Managed Cloud Backup Pro Automated Snapshots" },
    { sku: "SRV-CONSULT-01", tag: "Professional Service", reason: "Enterprise Architecture Consulting & Clustering" },
  ],

  // 4. Networking & Peripherals
  "HW-ROUTER-MESH": [
    { sku: "SUB-SECURITY-SHIELD", tag: "Network Shield", reason: "Zero-Trust Endpoint & Perimeter Security" },
    { sku: "SRV-SETUP-01", tag: "White Glove", reason: "Onsite Setup & Configuration SLA" },
  ],
  "HW-MONITOR-27": [
    { sku: "SRV-MAINT-FLEET", tag: "Care Plan", reason: "Hardware Preventive Maintenance & Panel Care" },
    { sku: "SRV-SUPPORT-247", tag: "Support SLA", reason: "24/7 Dedicated IT Support SLA" },
  ],

  // 5. Software & Subscriptions
  "SUB-CRM-PRO": [
    { sku: "SUB-BACKUP-PRO", tag: "Cloud Add-on", reason: "Managed Cloud Backup Pro for CRM Data" },
    { sku: "SRV-SUPPORT-247", tag: "Support SLA", reason: "24/7 Dedicated IT Support SLA" },
  ],
  "SUB-CLOUD-ENT": [
    { sku: "SUB-SECURITY-SHIELD", tag: "Security Layer", reason: "Zero-Trust Endpoint Security for Cloud Users" },
    { sku: "SRV-CONSULT-01", tag: "Advisory", reason: "Enterprise Architecture Consulting" },
  ],
  "SB-SOFTWARE-79": [
    { sku: "SUB-BACKUP-PRO", tag: "Data Safety", reason: "Managed Cloud Backup Pro" },
    { sku: "SRV-SUPPORT-247", tag: "Support SLA", reason: "24/7 Dedicated IT Support SLA" },
  ],
  "SAAS-MONITORING-01": [
    { sku: "SUB-BACKUP-PRO", tag: "High Margin (+80%)", reason: "Managed Cloud Backup Pro Automated Protection" },
    { sku: "SRV-CONSULT-01", tag: "Expert Service", reason: "Enterprise Architecture Consulting" },
  ],

  // 6. Professional Services
  "SRV-SETUP-01": [
    { sku: "SUB-CLOUD-ENT", tag: "Cloud Bundle", reason: "DealFlow Cloud Enterprise Plan" },
    { sku: "SRV-SUPPORT-247", tag: "Support SLA", reason: "24/7 Dedicated IT Support SLA" },
  ],
  "PROD-SETUP-01": [
    { sku: "SUB-CLOUD-ENT", tag: "Cloud Bundle", reason: "DealFlow Cloud Enterprise Plan" },
    { sku: "SRV-SUPPORT-247", tag: "Support SLA", reason: "24/7 Dedicated IT Support SLA" },
  ],
  "SRV-CONSULT-01": [
    { sku: "SUB-CRM-PRO", tag: "High Margin (+77.8%)", reason: "DealFlow CRM Pro Suite Business Edition" },
    { sku: "SUB-CLOUD-ENT", tag: "Enterprise Cloud", reason: "DealFlow Cloud Enterprise Plan" },
  ],
  "SRV-MAINT-FLEET": [
    { sku: "SRV-SUPPORT-247", tag: "24/7 SLA", reason: "24/7 Dedicated IT Support SLA" },
    { sku: "SUB-BACKUP-PRO", tag: "Backup Shield", reason: "Managed Cloud Backup Pro" },
  ],
  "SRV-SUPPORT-247": [
    { sku: "SUB-BACKUP-PRO", tag: "Disaster Recovery", reason: "Managed Cloud Backup Pro" },
    { sku: "SUB-SECURITY-SHIELD", tag: "Endpoint Shield", reason: "Zero-Trust Endpoint Security" },
  ],
};

/**
 * Get hardcoded 1 or 2 upsell suggestions for the products currently on a quote.
 *
 * @param {Array} currentLines - Current quote lines [{ productId, ... }]
 * @param {Array} catalogProducts - All products in catalog [{ id, sku, name, basePrice, costPrice, ... }]
 * @returns {Array} List of formatted upsell suggestion objects
 */
export function getUpsellSuggestionsForProducts(currentLines = [], catalogProducts = []) {
  if (!catalogProducts || catalogProducts.length === 0) return [];

  const catalogBySku = new Map();
  const catalogById = new Map();
  catalogProducts.forEach((p) => {
    if (p.sku) catalogBySku.set(p.sku, p);
    if (p.id) catalogById.set(p.id, p);
  });

  const presentProductIds = new Set(currentLines.map((l) => l.productId).filter(Boolean));

  // Find products present on quote
  const quoteProducts = currentLines
    .map((l) => catalogById.get(l.productId))
    .filter(Boolean);

  if (quoteProducts.length === 0 && catalogProducts.length > 0) {
    // Default fallback if no lines yet: suggest top items
    const topSkus = ["SUB-CRM-PRO", "SUB-SECURITY-SHIELD"];
    return topSkus
      .map((sku) => {
        const p = catalogBySku.get(sku);
        if (!p) return null;
        const price = Number(p.basePrice) || 0;
        const cost = Number(p.costPrice) || 0;
        const marginDelta = price - cost;
        const marginPercent = price > 0 ? (marginDelta / price) * 100 : 0;
        return {
          productId: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category?.name || p.productType || "SaaS",
          unitPrice: price,
          costPrice: cost,
          marginDelta,
          marginPercent,
          promotionTag: "Recommended Upsell",
          reason: "High-Margin complementary add-on",
          parentProductName: "General Catalog",
          isAlreadyAdded: presentProductIds.has(p.id),
        };
      })
      .filter(Boolean);
  }

  const seenSuggestedProductIds = new Set();
  const suggestions = [];

  for (const parentProd of quoteProducts) {
    // 1. Look up exact SKU mappings
    let pairings = HARDCODED_UPSELL_MAP[parentProd.sku];

    // 2. If no exact SKU mapping, fallback based on product type
    if (!pairings || pairings.length === 0) {
      if (parentProd.productType === "ONE_TIME") {
        pairings = [
          { sku: "SUB-SECURITY-SHIELD", tag: "Hardware Shield", reason: "Zero-Trust Endpoint Security" },
          { sku: "SRV-SUPPORT-247", tag: "Support SLA", reason: "24/7 Dedicated IT Support SLA" },
        ];
      } else if (parentProd.productType === "SERVICE") {
        pairings = [
          { sku: "SUB-CRM-PRO", tag: "SaaS Add-on", reason: "DealFlow CRM Pro Suite" },
          { sku: "SUB-CLOUD-ENT", tag: "Cloud Plan", reason: "DealFlow Cloud Enterprise Plan" },
        ];
      } else {
        pairings = [
          { sku: "SUB-BACKUP-PRO", tag: "Cloud Protection", reason: "Managed Cloud Backup Pro" },
          { sku: "SRV-SUPPORT-247", tag: "24/7 SLA", reason: "24/7 Dedicated IT Support SLA" },
        ];
      }
    }

    // Process the 1 or 2 pairings for this parent product
    for (const item of pairings) {
      const suggestedProduct = catalogBySku.get(item.sku);
      if (!suggestedProduct) continue;

      if (seenSuggestedProductIds.has(suggestedProduct.id)) continue;
      seenSuggestedProductIds.add(suggestedProduct.id);

      const price = Number(suggestedProduct.basePrice) || 0;
      const cost = Number(suggestedProduct.costPrice) || 0;
      const marginDelta = price - cost;
      const marginPercent = price > 0 ? (marginDelta / price) * 100 : 0;

      suggestions.push({
        productId: suggestedProduct.id,
        sku: suggestedProduct.sku,
        name: suggestedProduct.name,
        category: suggestedProduct.category?.name || suggestedProduct.productType || "Add-on",
        unitPrice: price,
        costPrice: cost,
        marginDelta,
        marginPercent,
        promotionTag: item.tag || "Recommended Add-on",
        reason: item.reason || `Tailored add-on for ${parentProd.name}`,
        parentProductName: parentProd.name,
        isAlreadyAdded: presentProductIds.has(suggestedProduct.id),
      });
    }
  }

  return suggestions;
}

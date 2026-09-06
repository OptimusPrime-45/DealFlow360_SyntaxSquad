import { Router } from "express";
import {
  getQuotations,
  getQuotationById,
  getDealHealth,
  createQuotation,
  deleteQuotation,
  submitQuotation,
  nudgeQuotation,
  getQuotationNudges,
} from "../controllers/quotation.controller.js";
import {
  addQuotationLine,
  updateQuotationLine,
  deleteQuotationLine,
  getUpsellSuggestions,
} from "../controllers/quotationLine.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

// PDF §3 — Sales Rep "builds quotations, applies discounts, adds upsell items".
// Managers and Admin can act too (a manager may amend a deal they own);
// Finance is deliberately excluded from authoring quotations.
const canBuildQuotes = requireRole("ADMIN", "SALES_REP", "SALES_MANAGER");

router.get("/", getQuotations);
// Deal health dashboard & at-risk monitor (must be mounted before /:id)
router.get("/deal-health", getDealHealth);
router.get("/:id", getQuotationById);
router.post("/", canBuildQuotes, createQuotation);

// §9 step 3 — the rep confirms; the SYSTEM decides whether approval is needed.
router.post("/:id/submit", canBuildQuotes, submitQuotation);
// §9 step 4 — line management + upsell panel. Every mutation re-scores the
// quotation, so totals and margin move the moment a suggestion is accepted.
router.get("/:id/suggestions", getUpsellSuggestions);
router.post("/:id/lines", canBuildQuotes, addQuotationLine);
router.patch("/:id/lines/:lineId", canBuildQuotes, updateQuotationLine);
router.delete("/:id/lines/:lineId", canBuildQuotes, deleteQuotationLine);

// PDF section 4-B9 - "An automated nudge or escalation action can be triggered
// from an alert." Chasing a deal is a manager/oversight action, so a SALES_REP
// cannot nudge themselves; Finance can escalate on billing-blocked deals.
const canChaseDeals = requireRole("ADMIN", "SALES_MANAGER", "FINANCE");
router.get("/:id/nudges", getQuotationNudges);
router.post("/:id/nudge", canChaseDeals, nudgeQuotation);

router.delete("/:id", canBuildQuotes, deleteQuotation);

export default router;

import { Router } from "express";
import {
  getQuotations,
  getQuotationById,
  createQuotation,
  deleteQuotation,
  submitQuotation,
} from "../controllers/quotation.controller.js";
import {
  addQuotationLine,
  updateQuotationLine,
  deleteQuotationLine,
  getUpsellSuggestions,
} from "../controllers/quotationLine.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/", getQuotations);
router.get("/:id", getQuotationById);
router.post("/", createQuotation);

// §9 step 3 — the rep confirms; the SYSTEM decides whether approval is needed.
router.post("/:id/submit", submitQuotation);
// §9 step 4 — line management + upsell panel. Every mutation re-scores the
// quotation, so totals and margin move the moment a suggestion is accepted.
router.get("/:id/suggestions", getUpsellSuggestions);
router.post("/:id/lines", addQuotationLine);
router.patch("/:id/lines/:lineId", updateQuotationLine);
router.delete("/:id/lines/:lineId", deleteQuotationLine);

router.delete("/:id", deleteQuotation);

export default router;

import { Router } from "express";
import {
  getQuotations,
  getQuotationById,
  createQuotation,
  deleteQuotation,
} from "../controllers/quotation.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/", getQuotations);
router.get("/:id", getQuotationById);
router.post("/", createQuotation);
router.delete("/:id", deleteQuotation);

export default router;

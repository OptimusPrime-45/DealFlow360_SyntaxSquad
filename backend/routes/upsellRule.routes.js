import { Router } from "express";
import {
  getUpsellRules,
  createUpsellRule,
  updateUpsellRule,
  deleteUpsellRule,
} from "../controllers/upsellRule.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/", getUpsellRules);
router.post("/", requireRole("ADMIN"), createUpsellRule);
router.patch("/:id", requireRole("ADMIN"), updateUpsellRule);
router.delete("/:id", requireRole("ADMIN"), deleteUpsellRule);

export default router;

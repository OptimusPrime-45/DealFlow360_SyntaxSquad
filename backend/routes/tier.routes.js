import { Router } from "express";
import {
  getCustomerTiers,
  updateCustomerTier,
} from "../controllers/customer.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/", getCustomerTiers);
router.patch("/:id", requireRole("ADMIN"), updateCustomerTier);

export default router;

import { Router } from "express";
import {
  getCustomerTiers,
  createCustomerTier,
  updateCustomerTier,
  deleteCustomerTier,
} from "../controllers/customer.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/", getCustomerTiers);
router.post("/", requireRole("ADMIN", "SALES_MANAGER"), createCustomerTier);
router.patch("/:id", requireRole("ADMIN", "SALES_MANAGER"), updateCustomerTier);
router.delete("/:id", requireRole("ADMIN", "SALES_MANAGER"), deleteCustomerTier);

export default router;

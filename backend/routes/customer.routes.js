import { Router } from "express";
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "../controllers/customer.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { setCustomerPortalPassword } from "../controllers/portalAuth.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", getCustomers);
router.get("/:id", getCustomerById);
router.post("/", requireRole("ADMIN", "SALES_REP", "SALES_MANAGER"), createCustomer);
router.patch("/:id", requireRole("ADMIN", "SALES_REP", "SALES_MANAGER"), updateCustomer);
router.delete("/:id", requireRole("ADMIN"), deleteCustomer);

// Give a customer portal credentials so they can sign in without a magic link.
router.post(
  "/:id/portal-password",
  requireRole("ADMIN", "SALES_REP", "SALES_MANAGER"),
  setCustomerPortalPassword
);

export default router;

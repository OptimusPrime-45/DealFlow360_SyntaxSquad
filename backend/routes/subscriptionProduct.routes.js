import { Router } from "express";
import {
  getSubscriptionProducts,
  getSubscriptionProductById,
  createSubscriptionProduct,
  updateSubscriptionProduct,
  deleteSubscriptionProduct,
  addPlanToProduct,
  deletePlanFromProduct,
} from "../controllers/subscriptionProduct.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authenticate, getSubscriptionProducts);
router.get("/:id", authenticate, getSubscriptionProductById);
router.post("/", authenticate, requireRole("ADMIN"), createSubscriptionProduct);
router.patch("/:id", authenticate, requireRole("ADMIN"), updateSubscriptionProduct);
router.delete("/:id", authenticate, requireRole("ADMIN"), deleteSubscriptionProduct);

// Plan operations attached directly to a Subscription Product
router.post("/:id/plans", authenticate, requireRole("ADMIN"), addPlanToProduct);
router.delete("/:id/plans/:planId", authenticate, requireRole("ADMIN"), deletePlanFromProduct);

export default router;

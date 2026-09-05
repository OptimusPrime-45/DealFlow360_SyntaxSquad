import { Router } from "express";
import {
  getSubscriptionPlans,
  getSubscriptionPlanById,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
} from "../controllers/subscriptionPlan.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/", getSubscriptionPlans);
router.get("/:id", getSubscriptionPlanById);
router.post("/", requireRole("ADMIN"), createSubscriptionPlan);
router.patch("/:id", requireRole("ADMIN"), updateSubscriptionPlan);
router.delete("/:id", requireRole("ADMIN"), deleteSubscriptionPlan);

export default router;

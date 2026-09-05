import { Router } from "express";
import {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
} from "../controllers/service.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authenticate, getServices);
router.get("/:id", authenticate, getServiceById);
router.post("/", authenticate, requireRole("ADMIN"), createService);
router.patch("/:id", authenticate, requireRole("ADMIN"), updateService);
router.delete("/:id", authenticate, requireRole("ADMIN"), deleteService);

export default router;

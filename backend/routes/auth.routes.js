import { Router } from "express";
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  getCurrentUser,
  getRoles,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// Public routes
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/refresh", refreshAccessToken);

// Authenticated routes
router.get("/me", authenticate, getCurrentUser);
router.get("/roles", authenticate, getRoles);

export default router;

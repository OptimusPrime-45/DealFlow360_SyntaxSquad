import { Router } from "express";
import {
  getCategories,
  createCategory,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  createVariant,
} from "../controllers/catalog.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

// NOTE: this router is mounted at "/api" (so its paths read /api/products,
// /api/categories). It must therefore NOT use a blanket `router.use(authenticate)`
// — that would run on every /api/* request that reaches this mount, including
// the public customer portal and unknown routes, returning 401 where a 404 or
// a public response was correct. Auth is applied per route instead.

// Category routes
router.get("/categories", authenticate, getCategories);
router.post("/categories", authenticate, requireRole("ADMIN"), createCategory);

// Product routes
router.get("/products", authenticate, getProducts);
router.get("/products/:id", authenticate, getProductById);
router.post("/products", authenticate, requireRole("ADMIN"), createProduct);
router.patch("/products/:id", authenticate, requireRole("ADMIN"), updateProduct);
router.delete("/products/:id", authenticate, requireRole("ADMIN"), deleteProduct);

// Variant routes
router.post("/products/:id/variants", authenticate, requireRole("ADMIN"), createVariant);

export default router;

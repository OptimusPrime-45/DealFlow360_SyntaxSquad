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

router.use(authenticate);

// Category routes
router.get("/categories", getCategories);
router.post("/categories", requireRole("ADMIN"), createCategory);

// Product routes
router.get("/products", getProducts);
router.get("/products/:id", getProductById);
router.post("/products", requireRole("ADMIN"), createProduct);
router.patch("/products/:id", requireRole("ADMIN"), updateProduct);
router.delete("/products/:id", requireRole("ADMIN"), deleteProduct);

// Variant routes
router.post("/products/:id/variants", requireRole("ADMIN"), createVariant);

export default router;

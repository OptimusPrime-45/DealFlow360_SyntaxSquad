import { Router } from "express";
import {
  getWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  setInventory,
  getWarehouseInventory,
  batchSetInventory,
  getStockOverview,
  getShippingWeights,
  updateShippingWeight,
} from "../controllers/warehouse.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

// This router owns /api/warehouses entirely, so a blanket guard is safe here.
router.use(authenticate);

// Specific routes must be declared before /:id so keywords are not matched as parameters.
router.get("/stock/overview", getStockOverview);
router.get("/shipping-weights", getShippingWeights);
router.put("/shipping-weights", requireRole("ADMIN"), updateShippingWeight);

router.get("/", getWarehouses);
router.get("/:id", getWarehouseById);
router.post("/", requireRole("ADMIN"), createWarehouse);
router.patch("/:id", requireRole("ADMIN"), updateWarehouse);
router.delete("/:id", requireRole("ADMIN"), deleteWarehouse);

// Multi-SKU stock levels per warehouse
router.get("/:id/inventory", getWarehouseInventory);
router.put("/:id/inventory/batch", requireRole("ADMIN", "FINANCE"), batchSetInventory);
router.put("/:id/inventory", requireRole("ADMIN", "FINANCE"), setInventory);

export default router;

import { Router } from "express";
import {
  getWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  setInventory,
  getStockOverview,
} from "../controllers/warehouse.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

// This router owns /api/warehouses entirely, so a blanket guard is safe here.
router.use(authenticate);

// Stock overview must be declared before /:id so "stock" is not read as an id.
router.get("/stock/overview", getStockOverview);

router.get("/", getWarehouses);
router.get("/:id", getWarehouseById);
router.post("/", requireRole("ADMIN"), createWarehouse);
router.patch("/:id", requireRole("ADMIN"), updateWarehouse);
router.delete("/:id", requireRole("ADMIN"), deleteWarehouse);

// Stock levels per warehouse (§9 steps 1 and 5).
router.put("/:id/inventory", requireRole("ADMIN", "FINANCE"), setInventory);

export default router;

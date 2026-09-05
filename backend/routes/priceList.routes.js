import { Router } from "express";
import {
  getPriceLists,
  createPriceList,
  updatePriceList,
  deletePriceList,
  setPriceListItem,
  deletePriceListItem,
} from "../controllers/priceList.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/", getPriceLists);
router.post("/", requireRole("ADMIN"), createPriceList);
router.patch("/:id", requireRole("ADMIN"), updatePriceList);
router.delete("/:id", requireRole("ADMIN"), deletePriceList);

// Per-product prices on a list.
router.put("/:id/items", requireRole("ADMIN"), setPriceListItem);
router.delete("/:id/items/:itemId", requireRole("ADMIN"), deletePriceListItem);

export default router;

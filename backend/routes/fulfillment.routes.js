// backend/routes/fulfillment.routes.js

import express from "express";

import {
    getFulfillmentPlan,
    allocateOrder,
    getOrderAllocations,
    manualOverrideAllocation,
    getBackorderConsolidationStatus,
    consolidateBackorders
} from "../controllers/fulfillment.controller.js";

import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = express.Router();

// Blanket authentication
router.use(authenticate);

// Operations permissions
const canOperate = requireRole("ADMIN", "FINANCE", "SALES_MANAGER");

// Get the recommended fulfillment plan based on live warehouse stock
router.get("/orders/:orderId/plan", async (req, res) => {
    try {
        const result = await getFulfillmentPlan(req.params.orderId);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("Fulfillment plan error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
});

// Accept Suggested Split: Saves and reserves the recommended warehouse allocations
router.post("/orders/:orderId/allocate", canOperate, async (req, res) => {
    try {
        const result = await allocateOrder(req.params.orderId, req.user?.id);
        return res.status(200).json({
            success: true,
            message: "Suggested warehouse split accepted and stock allocated successfully",
            data: result
        });
    } catch (error) {
        console.error("Fulfillment allocation error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
});

// Manual Override: Custom warehouse allocation specified by operations
router.post("/orders/:orderId/override", canOperate, async (req, res) => {
    try {
        const { allocations } = req.body;
        if (!allocations || !Array.isArray(allocations)) {
            return res.status(400).json({
                success: false,
                message: "allocations array is required for manual override"
            });
        }
        const result = await manualOverrideAllocation(req.params.orderId, allocations, req.user?.id);
        return res.status(200).json({
            success: true,
            message: "Manual warehouse override applied and stock reserved successfully",
            data: result
        });
    } catch (error) {
        console.error("Manual override error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
});

// Check if new stock has arrived mid-fulfillment to consolidate backorders
router.get("/orders/:orderId/consolidation-status", async (req, res) => {
    try {
        const result = await getBackorderConsolidationStatus(req.params.orderId);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("Backorder consolidation status error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
});

// Consolidate Remaining Backorder: Automatically sources newly arrived stock
router.post("/orders/:orderId/consolidate-backorder", canOperate, async (req, res) => {
    try {
        const result = await consolidateBackorders(req.params.orderId, req.user?.id);
        return res.status(200).json({
            success: true,
            message: "Remaining backorders consolidated from live inventory successfully",
            data: result
        });
    } catch (error) {
        console.error("Consolidate backorder error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
});

// What was actually saved for this order (including warehouse splits and backorders)
router.get("/orders/:orderId/allocations", async (req, res) => {
    try {
        const result = await getOrderAllocations(req.params.orderId);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
});

export default router;
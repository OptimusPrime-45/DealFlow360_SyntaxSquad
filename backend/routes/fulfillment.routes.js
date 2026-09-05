// backend/routes/fulfillment.routes.js

import express from "express";

import {
    getFulfillmentPlan,
    allocateOrder,
    getOrderAllocations
} from "../controllers/fulfillment.controller.js";

import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = express.Router();

// This router owns its mount path, so a blanket guard is safe.
// These endpoints were previously reachable with no authentication at all.
router.use(authenticate);

// PDF §3 — Finance / Operations "manages warehouse fulfillment splits and
// backorder decisions". Reps may READ progress on their own deals; acting on
// fulfillment and billing is an operations decision.
const canOperate = requireRole("ADMIN", "FINANCE", "SALES_MANAGER");



// Get the recommended fulfillment plan.
router.get(
    "/orders/:orderId/plan",
    async (req, res) => {
        try {
            const result =
                await getFulfillmentPlan(
                    req.params.orderId
                );

            return res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error(
                "Fulfillment plan error:",
                error
            );

            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);


// Accept and save the recommended fulfillment plan.
router.post(
    "/orders/:orderId/allocate",
    canOperate,
    async (req, res) => {
        try {
            const result =
                await allocateOrder(
                    req.params.orderId
                );

            return res.status(200).json({
                success: true,
                message:
                    "Order allocated successfully",
                data: result
            });
        } catch (error) {
            console.error(
                "Fulfillment allocation error:",
                error
            );

            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);


// What was actually saved for this order (as opposed to a fresh suggestion).
router.get(
    "/orders/:orderId/allocations",
    async (req, res) => {
        try {
            const result = await getOrderAllocations(req.params.orderId);
            return res.status(200).json({ success: true, data: result });
        } catch (error) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }
);


export default router;
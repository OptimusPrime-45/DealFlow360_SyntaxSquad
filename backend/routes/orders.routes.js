// backend/routes/orders.routes.js

import express from "express";

import {
    confirmQuotationToOrder
} from "../controllers/orders.controller.js";

import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = express.Router();

// This router owns its mount path, so a blanket guard is safe.
// These endpoints were previously reachable with no authentication at all.
router.use(authenticate);


// Confirm a quotation and create an order.
router.post(
    "/:quotationId/confirm",
    requireRole("ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"),
    async (req, res) => {
        try {
            const result =
                await confirmQuotationToOrder(
                    req.params.quotationId
                );

            return res.status(201).json({
                success: true,
                message:
                    "Quotation confirmed and order created successfully",
                data: result
            });
        } catch (error) {
            console.error(
                "Order confirmation error:",
                error
            );

            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);


export default router;
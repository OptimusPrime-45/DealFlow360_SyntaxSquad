import express from "express";
import {
    confirmQuotationToOrder,
    listOrders,
    getOrderById,
    closeOrder
} from "../controllers/orders.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authenticate);

// List orders
router.get("/", async (req, res) => {
    try {
        const orders = await listOrders(req.query);
        return res.status(200).json({
            success: true,
            data: { orders }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Get single order
router.get("/:id", async (req, res) => {
    try {
        const order = await getOrderById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        return res.status(200).json({
            success: true,
            data: { order }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Confirm a quotation and create an order.
router.post(
    "/:quotationId/confirm",
    requireRole("ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"),
    async (req, res) => {
        try {
            const result = await confirmQuotationToOrder(req.params.quotationId);
            return res.status(201).json({
                success: true,
                message: "Quotation confirmed and order created successfully",
                data: result
            });
        } catch (error) {
            console.error("Order confirmation error:", error);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);

// Close deal / complete order
router.post(
    "/:id/close",
    requireRole("ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"),
    async (req, res) => {
        try {
            const order = await closeOrder(req.params.id, req.user?.id);
            return res.status(200).json({
                success: true,
                message: "Deal successfully closed and order marked as completed!",
                data: { order }
            });
        } catch (error) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }
);

export default router;
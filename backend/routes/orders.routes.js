// backend/routes/orders.routes.js

import express from "express";

import {
    confirmQuotationToOrder
} from "../controllers/orders.controller.js";

const router = express.Router();


// Confirm a quotation and create an order.
router.post(
    "/:quotationId/confirm",
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
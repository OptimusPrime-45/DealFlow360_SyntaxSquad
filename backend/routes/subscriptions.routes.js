// backend/routes/subscriptions.routes.js

import express from "express";

import {
    createSubscriptionsForOrder,
    getSubscriptionsForOrder,
    cancelSubscription
} from "../controllers/subscriptions.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// This router owns its mount path, so a blanket guard is safe.
// These endpoints were previously reachable with no authentication at all.
router.use(authenticate);


// Create subscriptions and billing schedules
// for recurring lines in an order.
router.post(
    "/orders/:orderId/create",
    async (req, res) => {
        try {
            const result =
                await createSubscriptionsForOrder(
                    req.params.orderId
                );

            return res.status(201).json({
                success: true,
                message:
                    "Subscriptions created successfully",
                data: result
            });
        } catch (error) {
            console.error(
                "Subscription creation error:",
                error
            );

            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);


// Get subscriptions and billing schedules
// for an order.
router.get(
    "/orders/:orderId",
    async (req, res) => {
        try {
            const result =
                await getSubscriptionsForOrder(
                    req.params.orderId
                );

            return res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error(
                "Subscription fetch error:",
                error
            );

            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);


// Cancel a subscription.
router.post(
    "/:subscriptionId/cancel",
    async (req, res) => {
        try {
            const result =
                await cancelSubscription(
                    req.params.subscriptionId
                );

            return res.status(200).json({
                success: true,
                message:
                    "Subscription cancelled successfully",
                data: result
            });
        } catch (error) {
            console.error(
                "Subscription cancellation error:",
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
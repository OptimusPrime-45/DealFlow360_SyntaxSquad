// backend/controllers/subscriptions.controller.js

import { prisma } from "../lib/prisma.js";

import {
    calculateBillingPeriod
} from "./rules/subscriptions/calculateBillingPeriod.js";

import {
    generateBillingSchedule
} from "./rules/subscriptions/generateBillingSchedule.js";


// Create subscriptions for all recurring lines in an order.
export async function createSubscriptionsForOrder(
    orderId,
    numberOfPeriods = 12
) {
    // Validate order ID.
    if (
        typeof orderId !== "string" ||
        orderId.trim().length === 0
    ) {
        throw new Error(
            "orderId is required"
        );
    }

    // Validate number of billing periods.
    if (
        !Number.isInteger(numberOfPeriods) ||
        numberOfPeriods <= 0
    ) {
        throw new Error(
            "numberOfPeriods must be a positive integer"
        );
    }

    // Read the order and its lines.
    const order =
        await prisma.order.findUnique({
            where: {
                id: orderId
            },

            include: {
                lines: {
                    include: {
                        subscriptionPlan: true
                    }
                }
            }
        });

    // Stop if the order does not exist.
    if (!order) {
        throw new Error(
            "Order not found"
        );
    }

    // Do not create subscriptions for a cancelled order.
    if (
        order.status === "CANCELLED"
    ) {
        throw new Error(
            "Cannot create subscriptions for a cancelled order"
        );
    }

    // Keep only recurring order lines.
    const recurringLines =
        order.lines.filter(
            (line) =>
                line.lineType ===
                "RECURRING"
        );

    // There is nothing to create when
    // the order contains no recurring lines.
    if (
        recurringLines.length === 0
    ) {
        return {
            orderId,
            subscriptions: []
        };
    }

    // Persist subscriptions and schedules atomically.
    const result =
        await prisma.$transaction(
            async (tx) => {
                const createdSubscriptions = [];

                for (
                    const line
                    of recurringLines
                ) {
                    // A recurring line must have a subscription plan.
                    if (
                        !line.subscriptionPlanId ||
                        !line.subscriptionPlan
                    ) {
                        throw new Error(
                            `Recurring order line ${line.id} requires a subscription plan`
                        );
                    }

                    const plan =
                        line.subscriptionPlan;

                    // The plan must belong to the same product.
                    if (
                        plan.productId !==
                        line.productId
                    ) {
                        throw new Error(
                            `Subscription plan ${plan.id} does not belong to product ${line.productId}`
                        );
                    }

                    // Do not use inactive plans.
                    if (
                        plan.isActive !== true
                    ) {
                        throw new Error(
                            `Subscription plan ${plan.id} is inactive`
                        );
                    }

                    // Do not create a second subscription
                    // for the same order line.
                    const existingSubscription =
                        await tx.subscription.findUnique({
                            where: {
                                orderLineId:
                                    line.id
                            }
                        });

                    if (
                        existingSubscription
                    ) {
                        throw new Error(
                            `Subscription already exists for order line ${line.id}`
                        );
                    }

                    // Use the order confirmation time
                    // as the subscription start.
                    const startDate =
                        new Date(
                            order.confirmedAt
                        );

                    // Calculate the first billing period.
                    const firstPeriod =
                        calculateBillingPeriod(
                            startDate,
                            plan.billingInterval
                        );

                    // Create the subscription.
                    const subscription =
                        await tx.subscription.create({
                            data: {
                                orderId,

                                orderLineId:
                                    line.id,

                                customerId:
                                    order.customerId,

                                subscriptionPlanId:
                                    plan.id,

                                status:
                                    "ACTIVE",

                                quantity:
                                    line.quantity,

                                unitPrice:
                                    plan.price,

                                startDate,

                                currentPeriodStart:
                                    firstPeriod
                                        .periodStart,

                                currentPeriodEnd:
                                    firstPeriod
                                        .periodEnd
                            }
                        });

                    // Generate the initial billing schedule.
                    const schedules =
                        generateBillingSchedule(
                            startDate,
                            plan.billingInterval,
                            line.quantity,
                            plan.price,
                            numberOfPeriods
                        );

                    // Attach the subscription ID
                    // and store the schedule rows.
                    await tx.billingSchedule.createMany({
                        data:
                            schedules.map(
                                (schedule) => ({
                                    subscriptionId:
                                        subscription.id,

                                    billingDate:
                                        schedule.billingDate,

                                    periodStart:
                                        schedule.periodStart,

                                    periodEnd:
                                        schedule.periodEnd,

                                    quantity:
                                        schedule.quantity,

                                    prorationFactor:
                                        schedule
                                            .prorationFactor,

                                    amount:
                                        schedule.amount,

                                    status:
                                        schedule.status
                                })
                            )
                    });

                    // Read the created schedules.
                    const billingSchedules =
                        await tx.billingSchedule.findMany({
                            where: {
                                subscriptionId:
                                    subscription.id
                            },

                            orderBy: {
                                periodStart:
                                    "asc"
                            }
                        });

                    createdSubscriptions.push({
                        subscription,
                        billingSchedules
                    });
                }

                return {
                    orderId,
                    subscriptions:
                        createdSubscriptions
                };
            }
        );

    return result;
}


// Get all subscriptions belonging to an order.
export async function getSubscriptionsForOrder(
    orderId
) {
    // Validate order ID.
    if (
        typeof orderId !== "string" ||
        orderId.trim().length === 0
    ) {
        throw new Error(
            "orderId is required"
        );
    }

    const subscriptions =
        await prisma.subscription.findMany({
            where: {
                orderId
            },

            include: {
                subscriptionPlan: true,
                orderLine: true,
                billingSchedules: {
                    orderBy: {
                        periodStart: "asc"
                    }
                }
            },

            orderBy: {
                createdAt: "asc"
            }
        });

    return {
        orderId,
        subscriptions
    };
}


// Cancel a subscription.
export async function cancelSubscription(
    subscriptionId
) {
    // Validate subscription ID.
    if (
        typeof subscriptionId !== "string" ||
        subscriptionId.trim().length === 0
    ) {
        throw new Error(
            "subscriptionId is required"
        );
    }

    const result =
        await prisma.$transaction(
            async (tx) => {
                // Read the subscription and plan.
                const subscription =
                    await tx.subscription.findUnique({
                        where: {
                            id:
                                subscriptionId
                        },

                        include: {
                            subscriptionPlan: true
                        }
                    });

                if (!subscription) {
                    throw new Error(
                        "Subscription not found"
                    );
                }

                // Prevent cancelling an already cancelled subscription.
                if (
                    subscription.status ===
                    "CANCELLED"
                ) {
                    throw new Error(
                        "Subscription is already cancelled"
                    );
                }

                const cancelledAt =
                    new Date();

                // Cancel future scheduled billing entries.
                await tx.billingSchedule.updateMany({
                    where: {
                        subscriptionId,

                        status:
                            "SCHEDULED",

                        billingDate: {
                            gt:
                                cancelledAt
                        }
                    },

                    data: {
                        status:
                            "CANCELLED"
                    }
                });

                // Cancel the subscription.
                const updatedSubscription =
                    await tx.subscription.update({
                        where: {
                            id:
                                subscriptionId
                        },

                        data: {
                            status:
                                "CANCELLED",

                            cancelledAt
                        }
                    });

                return {
                    subscription:
                        updatedSubscription
                };
            }
        );

    return result;
}
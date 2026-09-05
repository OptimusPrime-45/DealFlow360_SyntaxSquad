// backend/controllers/fulfillment.controller.js

import { prisma } from "../lib/prisma.js";

import {
    selectWarehouses
} from "../rules/fulfillment/selectWarehouses.js";

import {
    allocateStock
} from "../rules/fulfillment/allocateStock.js";

import {
    validateAllocation
} from "../rules/fulfillment/validateAllocation.js";

import {
    createShipmentPlan
} from "../rules/fulfillment/createShipments.js";

import {
    calculateOrderStatus
} from "../rules/fulfillment/calculateOrderStatus.js";


// Get the recommended fulfillment plan for an order.
export async function getFulfillmentPlan(
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

    // Read the order and its lines.
    const order =
        await prisma.order.findUnique({
            where: {
                id: orderId
            },

            include: {
                lines: true
            }
        });

    // Stop if the order does not exist.
    if (!order) {
        throw new Error(
            "Order not found"
        );
    }

    // Do not fulfill cancelled orders.
    if (
        order.status === "CANCELLED"
    ) {
        throw new Error(
            "Cannot fulfill a cancelled order"
        );
    }

    const linePlans = [];

    // Build a fulfillment plan for every order line.
    for (
        const line
        of order.lines
    ) {
        // Find inventory for this product.
        const inventory =
            await prisma.inventory.findMany({
                where: {
                    productId:
                        line.productId,

                    warehouse: {
                        isActive: true
                    }
                },

                include: {
                    warehouse: true
                }
            });

        // Convert inventory records into the
        // format expected by the rules.
        const warehouses =
            inventory.map(
                (item) => ({
                    id:
                        item.warehouse.id,

                    name:
                        item.warehouse.name,

                    availableQty:
                        item.availableQty,

                    reservedQty:
                        item.reservedQty,

                    shippingWeight:
                        item.warehouse
                            .shippingWeight,

                    isActive:
                        item.warehouse
                            .isActive
                })
            );

        // Select warehouses.
        const selectedWarehouses =
            selectWarehouses(
                warehouses,
                line.quantity
            );

        // Calculate allocation.
        const allocationResult =
            allocateStock(
                selectedWarehouses,
                line.quantity
            );

        // Validate allocation.
        const validation =
            validateAllocation(
                selectedWarehouses,
                allocationResult.allocations,
                line.quantity
            );

        // Create shipment grouping.
        const shipmentPlan =
            createShipmentPlan(
                allocationResult.allocations
            );

        linePlans.push({
            orderLineId:
                line.id,

            productId:
                line.productId,

            requiredQuantity:
                line.quantity,

            allocations:
                allocationResult.allocations,

            fulfilledQuantity:
                validation.allocatedQuantity,

            backorderQuantity:
                validation.backorderQuantity,

            isFullyAllocated:
                validation.isFullyAllocated,

            shipments:
                shipmentPlan.shipments,

            shipmentCount:
                shipmentPlan.shipmentCount
        });
    }

    return {
        orderId,

        currentStatus:
            order.status,

        lines:
            linePlans,

        totalShipmentCount:
            linePlans.reduce(
                (
                    total,
                    line
                ) =>
                    total +
                    line.shipmentCount,
                0
            )
    };
}


// Save the recommended fulfillment plan.
export async function allocateOrder(
    orderId
) {
    // Get the latest fulfillment plan.
    const plan =
        await getFulfillmentPlan(
            orderId
        );

    // Persist allocation and inventory changes
    // as one atomic transaction.
    const result =
        await prisma.$transaction(
            async (tx) => {
                // Make sure we are working with
                // the current database state.
                const order =
                    await tx.order.findUnique({
                        where: {
                            id: orderId
                        },

                        include: {
                            lines: true,
                            allocations: true
                        }
                    });

                // Order may have changed after
                // the preview was generated.
                if (!order) {
                    throw new Error(
                        "Order not found"
                    );
                }

                if (
                    order.status ===
                    "CANCELLED"
                ) {
                    throw new Error(
                        "Cannot allocate a cancelled order"
                    );
                }

                // Remove the existing allocation rows
                // so the order can be re-planned.
                await tx.fulfillmentAllocation.deleteMany({
                    where: {
                        orderId
                    }
                });

                // Create allocations line by line.
                for (
                    const linePlan
                    of plan.lines
                ) {
                    // Store warehouse allocations.
                    for (
                        const allocation
                        of linePlan.allocations
                    ) {
                        await tx.fulfillmentAllocation.create({
                            data: {
                                orderId,

                                orderLineId:
                                    linePlan.orderLineId,

                                warehouseId:
                                    allocation.warehouseId,

                                allocatedQty:
                                    allocation.quantity,

                                fulfilledQty:
                                    0,

                                backorderQty:
                                    0,

                                shippingCost:
                                    allocation.shippingWeight,

                                status:
                                    "RESERVED",

                                isManualOverride:
                                    false
                            }
                        });

                        // Reserve the allocated stock.
                        const updated =
                            await tx.inventory.updateMany({
                                where: {
                                    warehouseId:
                                        allocation.warehouseId,

                                    productId:
                                        linePlan.productId,

                                    // Prevent reserving more
                                    // stock than currently available.
                                    availableQty: {
                                        gte:
                                            allocation.quantity
                                    }
                                },

                                data: {
                                    reservedQty: {
                                        increment:
                                            allocation.quantity
                                    }
                                }
                            });

                        // updateMany returning zero means
                        // the stock was not sufficient.
                        if (
                            updated.count !== 1
                        ) {
                            throw new Error(
                                `Insufficient inventory for warehouse ${allocation.warehouseId}`
                            );
                        }
                    }

                    // Store the backorder in the same
                    // FulfillmentAllocation table.
                    if (
                        linePlan.backorderQuantity >
                        0
                    ) {
                        await tx.fulfillmentAllocation.create({
                            data: {
                                orderId,

                                orderLineId:
                                    linePlan.orderLineId,

                                warehouseId:
                                    null,

                                allocatedQty:
                                    0,

                                fulfilledQty:
                                    0,

                                backorderQty:
                                    linePlan.backorderQuantity,

                                shippingCost:
                                    0,

                                status:
                                    "BACKORDERED",

                                isManualOverride:
                                    false
                            }
                        });
                    }
                }

                // Read all saved allocations.
                const allocations =
                    await tx.fulfillmentAllocation.findMany({
                        where: {
                            orderId
                        }
                    });

                // Determine the order's new status.
                const newStatus =
                    calculateOrderStatus(
                        allocations,
                        order.lines.reduce(
                            (
                                total,
                                line
                            ) =>
                                total +
                                line.quantity,
                            0
                        )
                    );

                // Update the order status.
                const updatedOrder =
                    await tx.order.update({
                        where: {
                            id: orderId
                        },

                        data: {
                            status:
                                newStatus
                        }
                    });

                return {
                    order:
                        updatedOrder,

                    allocations
                };
            }
        );

    return result;
}

/**
 * Read the allocation that was actually SAVED for an order.
 *
 * Distinct from getFulfillmentPlan(), which recomputes a suggestion against
 * CURRENT stock. Once an order is allocated its stock is reserved, so replanning
 * finds nothing available and would report the whole order as backordered — the
 * opposite of the truth. The fulfillment screen must read this instead.
 */
export async function getOrderAllocations(orderId) {
    if (typeof orderId !== "string" || orderId.trim().length === 0) {
        throw new Error("orderId is required");
    }

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, orderNumber: true, status: true }
    });

    if (!order) {
        throw new Error("Order not found");
    }

    const allocations = await prisma.fulfillmentAllocation.findMany({
        where: { orderId },
        include: {
            warehouse: { select: { id: true, code: true, name: true, shippingWeight: true } },
            orderLine: {
                select: {
                    id: true,
                    quantity: true,
                    product: { select: { id: true, sku: true, name: true } }
                }
            }
        },
        orderBy: [{ createdAt: "asc" }]
    });

    // Shipment count is the number of DISTINCT warehouses involved; a backorder
    // row carries no warehouse and therefore is not a shipment.
    const shipmentWarehouses = new Set(
        allocations.filter((a) => a.warehouseId).map((a) => a.warehouseId)
    );

    const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedQty, 0);
    const totalBackordered = allocations.reduce((sum, a) => sum + a.backorderQty, 0);
    const totalShippingCost = allocations.reduce(
        (sum, a) => sum + Number(a.shippingCost || 0),
        0
    );

    return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        allocations,
        shipmentCount: shipmentWarehouses.size,
        totalAllocated,
        totalBackordered,
        totalShippingCost,
        hasBackorder: totalBackordered > 0
    };
}

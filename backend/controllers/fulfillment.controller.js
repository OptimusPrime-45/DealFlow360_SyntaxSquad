// backend/controllers/fulfillment.controller.js

import { prisma } from "../lib/prisma.js";
import { recordAuditLog } from "../lib/audit.js";

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


// Get the recommended fulfillment plan for an order based on live stock.
export async function getFulfillmentPlan(
    orderId
) {
    if (
        typeof orderId !== "string" ||
        orderId.trim().length === 0
    ) {
        throw new Error(
            "orderId is required"
        );
    }

    const order =
        await prisma.order.findUnique({
            where: {
                id: orderId
            },
            include: {
                lines: {
                    include: {
                        product: true
                    }
                }
            }
        });

    if (!order) {
        throw new Error(
            "Order not found"
        );
    }

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

        const warehouses =
            inventory.map(
                (item) => ({
                    id:
                        item.warehouse.id,

                    code:
                        item.warehouse.code,

                    name:
                        item.warehouse.name,

                    availableQty:
                        item.availableQty,

                    reservedQty:
                        item.reservedQty,

                    shippingWeight:
                        Number(item.warehouse.shippingWeight || 1.0),

                    isActive:
                        item.warehouse
                            .isActive
                })
            );

        const selectedWarehouses =
            selectWarehouses(
                warehouses,
                line.quantity
            );

        const allocationResult =
            allocateStock(
                selectedWarehouses,
                line.quantity
            );

        const validation =
            validateAllocation(
                selectedWarehouses,
                allocationResult.allocations,
                line.quantity
            );

        const shipmentPlan =
            createShipmentPlan(
                allocationResult.allocations
            );

        const mappedAllocations = allocationResult.allocations.map((a) => {
            const wh = warehouses.find((w) => w.id === a.warehouseId);
            const shippingCost = Number(
                (a.quantity * Number(a.shippingWeight || 1.0) * 45).toFixed(2)
            );
            return {
                ...a,
                warehouseCode: wh?.code || a.warehouseName,
                shippingCost
            };
        });

        linePlans.push({
            orderLineId:
                line.id,

            productId:
                line.productId,

            productSku:
                line.product?.sku || line.productId,

            productName:
                line.product?.name || "Product",

            requiredQuantity:
                line.quantity,

            allocations:
                mappedAllocations,

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

    // Group allocations by fulfilling warehouse to produce clean shipment splits
    const warehouseMap = new Map();
    let totalBackorderQty = 0;
    const backorderedItems = [];

    for (const lp of linePlans) {
        if (lp.backorderQuantity > 0) {
            totalBackorderQty += lp.backorderQuantity;
            backorderedItems.push({
                orderLineId: lp.orderLineId,
                productId: lp.productId,
                productSku: lp.productSku,
                productName: lp.productName,
                backorderQuantity: lp.backorderQuantity,
            });
        }

        for (const alloc of lp.allocations) {
            if (!alloc.warehouseId) continue;
            if (!warehouseMap.has(alloc.warehouseId)) {
                warehouseMap.set(alloc.warehouseId, {
                    warehouseId: alloc.warehouseId,
                    warehouseName: alloc.warehouseName,
                    warehouseCode: alloc.warehouseCode || alloc.warehouseName,
                    shippingWeight: Number(alloc.shippingWeight || 1.0),
                    totalQuantity: 0,
                    estimatedCost: 0,
                    items: [],
                });
            }
            const whGroup = warehouseMap.get(alloc.warehouseId);
            whGroup.totalQuantity += alloc.quantity;
            whGroup.estimatedCost += alloc.shippingCost;
            whGroup.items.push({
                orderLineId: lp.orderLineId,
                productId: lp.productId,
                productSku: lp.productSku,
                productName: lp.productName,
                quantity: alloc.quantity,
                shippingCost: alloc.shippingCost
            });
        }
    }

    const warehouseSplits = Array.from(warehouseMap.values()).map((wh, idx) => ({
        ...wh,
        shipmentNumber: idx + 1,
        totalShipments: warehouseMap.size,
        packageLabel: `Package ${idx + 1} of ${warehouseMap.size}`,
    }));

    return {
        orderId,
        orderNumber: order.orderNumber,
        currentStatus: order.status,
        lines: linePlans,
        warehouseSplits,
        totalShipmentCount: warehouseSplits.length,
        totalEstimatedCost: warehouseSplits.reduce((sum, w) => sum + w.estimatedCost, 0),
        totalBackorderQuantity: totalBackorderQty,
        backorderedItems,
        isFullyAllocated: totalBackorderQty === 0
    };
}


// Save the recommended fulfillment plan (Accept Suggested Split).
export async function allocateOrder(
    orderId,
    userId = null
) {
    const plan =
        await getFulfillmentPlan(
            orderId
        );

    const result =
        await prisma.$transaction(
            async (tx) => {
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

                // Release existing stock reservations if re-planning to guarantee idempotency
                const existingAllocations = await tx.fulfillmentAllocation.findMany({
                    where: { orderId, warehouseId: { not: null } },
                    include: { orderLine: true }
                });
                for (const ea of existingAllocations) {
                    await tx.inventory.updateMany({
                        where: { warehouseId: ea.warehouseId, productId: ea.orderLine.productId },
                        data: { reservedQty: { decrement: ea.allocatedQty } }
                    });
                }

                // Remove existing allocation rows
                await tx.fulfillmentAllocation.deleteMany({
                    where: {
                        orderId
                    }
                });

                // Create allocations line by line
                for (
                    const linePlan
                    of plan.lines
                ) {
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
                                    allocation.shippingCost || allocation.shippingWeight,

                                status:
                                    "RESERVED",

                                isManualOverride:
                                    false
                            }
                        });

                        const updated =
                            await tx.inventory.updateMany({
                                where: {
                                    warehouseId:
                                        allocation.warehouseId,

                                    productId:
                                        linePlan.productId,

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

                        if (
                            updated.count !== 1
                        ) {
                            throw new Error(
                                `Insufficient inventory for warehouse ${allocation.warehouseId}`
                            );
                        }
                    }

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

                const allocations =
                    await tx.fulfillmentAllocation.findMany({
                        where: {
                            orderId
                        }
                    });

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

    await recordAuditLog({
        userId: userId || null,
        actorType: "USER",
        entityType: "Order",
        entityId: orderId,
        action: "FULFILLMENT_ALLOCATED",
        newValue: { orderId, status: result.order.status, allocationCount: result.allocations.length },
        reason: "Accepted suggested warehouse fulfillment split",
    });

    return result;
}

/**
 * Manual Override: Custom warehouse allocation specified by operations.
 * Validates stock availability, sets isManualOverride = true, and reserves stock.
 */
export async function manualOverrideAllocation(orderId, allocationOverrides, userId = null) {
    if (!Array.isArray(allocationOverrides) || allocationOverrides.length === 0) {
        throw new Error("allocationOverrides must be a non-empty array");
    }

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            lines: {
                include: { product: true }
            }
        }
    });

    if (!order) throw new Error("Order not found");
    if (order.status === "CANCELLED") throw new Error("Cannot fulfill a cancelled order");

    // Validate that for every order line, total allocated + backorder equals line quantity
    for (const line of order.lines) {
        const lineAllocations = allocationOverrides.filter((a) => a.orderLineId === line.id);
        const totalQty = lineAllocations.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
        if (totalQty !== line.quantity) {
            throw new Error(
                `Total allocated quantity (${totalQty}) for ${line.product?.name || line.id} must equal required quantity (${line.quantity})`
            );
        }
    }

    // Validate available sellable stock for each warehouse allocation
    for (const alloc of allocationOverrides) {
        if (alloc.warehouseId && Number(alloc.quantity) > 0) {
            const line = order.lines.find((l) => l.id === alloc.orderLineId);
            if (!line) throw new Error(`Order line not found: ${alloc.orderLineId}`);

            const inv = await prisma.inventory.findUnique({
                where: {
                    warehouseId_productId: {
                        warehouseId: alloc.warehouseId,
                        productId: line.productId
                    }
                },
                include: { warehouse: true }
            });

            // Find how much was previously reserved for this specific order/warehouse line
            const prevAlloc = await prisma.fulfillmentAllocation.findUnique({
                where: {
                    orderLineId_warehouseId: {
                        orderLineId: alloc.orderLineId,
                        warehouseId: alloc.warehouseId
                    }
                }
            });
            const prevReserved = prevAlloc ? prevAlloc.allocatedQty : 0;
            const currentSellable = (inv ? inv.availableQty - inv.reservedQty : 0) + prevReserved;

            if (Number(alloc.quantity) > currentSellable) {
                throw new Error(
                    `Insufficient stock in ${inv?.warehouse?.name || alloc.warehouseId} for ${line.product?.name || "item"}. Sellable: ${currentSellable}, Requested: ${alloc.quantity}`
                );
            }
        }
    }

    const result = await prisma.$transaction(async (tx) => {
        // 1. Release previous reservations for this order
        const currentAllocations = await tx.fulfillmentAllocation.findMany({
            where: { orderId, warehouseId: { not: null } },
            include: { orderLine: true }
        });
        for (const ca of currentAllocations) {
            await tx.inventory.updateMany({
                where: { warehouseId: ca.warehouseId, productId: ca.orderLine.productId },
                data: { reservedQty: { decrement: ca.allocatedQty } }
            });
        }

        // 2. Remove all existing allocations for this order
        await tx.fulfillmentAllocation.deleteMany({ where: { orderId } });

        // 3. Create manual allocations
        for (const alloc of allocationOverrides) {
            const qty = Number(alloc.quantity);
            if (qty <= 0) continue;

            const line = order.lines.find((l) => l.id === alloc.orderLineId);

            if (alloc.warehouseId && !alloc.isBackorder) {
                const wh = await tx.warehouse.findUnique({
                    where: { id: alloc.warehouseId },
                    select: { shippingWeight: true }
                });
                const cost = Number((qty * Number(wh?.shippingWeight || 1.0) * 45).toFixed(2));

                await tx.fulfillmentAllocation.create({
                    data: {
                        orderId,
                        orderLineId: alloc.orderLineId,
                        warehouseId: alloc.warehouseId,
                        allocatedQty: qty,
                        fulfilledQty: 0,
                        backorderQty: 0,
                        shippingCost: cost,
                        status: "RESERVED",
                        isManualOverride: true
                    }
                });

                await tx.inventory.updateMany({
                    where: {
                        warehouseId: alloc.warehouseId,
                        productId: line.productId
                    },
                    data: {
                        reservedQty: { increment: qty }
                    }
                });
            } else {
                await tx.fulfillmentAllocation.create({
                    data: {
                        orderId,
                        orderLineId: alloc.orderLineId,
                        warehouseId: null,
                        allocatedQty: 0,
                        fulfilledQty: 0,
                        backorderQty: qty,
                        shippingCost: 0,
                        status: "BACKORDERED",
                        isManualOverride: true
                    }
                });
            }
        }

        // 4. Calculate new order status
        const allSaved = await tx.fulfillmentAllocation.findMany({ where: { orderId } });
        const totalOrdered = order.lines.reduce((s, l) => s + l.quantity, 0);
        const newStatus = calculateOrderStatus(allSaved, totalOrdered);

        const updatedOrder = await tx.order.update({
            where: { id: orderId },
            data: { status: newStatus }
        });

        return { order: updatedOrder, allocations: allSaved };
    });

    await recordAuditLog({
        userId: userId || null,
        actorType: "USER",
        entityType: "Order",
        entityId: orderId,
        action: "FULFILLMENT_MANUAL_OVERRIDE",
        newValue: { orderId, status: result.order.status, count: result.allocations.length },
        reason: "Applied manual warehouse fulfillment split override",
    });

    return result;
}

/**
 * Checks if an order has remaining backorders and whether newly arrived stock in any warehouse
 * can now consolidate them.
 */
export async function getBackorderConsolidationStatus(orderId) {
    if (typeof orderId !== "string" || orderId.trim().length === 0) {
        throw new Error("orderId is required");
    }

    const backorderRows = await prisma.fulfillmentAllocation.findMany({
        where: {
            orderId,
            backorderQty: { gt: 0 }
        },
        include: {
            orderLine: {
                include: { product: true }
            }
        }
    });

    if (backorderRows.length === 0) {
        return {
            orderId,
            hasBackorder: false,
            canConsolidate: false,
            totalBackorderedQty: 0,
            items: []
        };
    }

    const consolidatableItems = [];
    let totalConsolidatableQty = 0;

    for (const bo of backorderRows) {
        const productId = bo.orderLine.productId;
        const requiredBackorder = bo.backorderQty;

        // Query active warehouses holding stock for this product
        const inventories = await prisma.inventory.findMany({
            where: {
                productId,
                warehouse: { isActive: true }
            },
            include: { warehouse: true },
            orderBy: [{ warehouse: { shippingWeight: "asc" } }, { warehouse: { name: "asc" } }]
        });

        let remaining = requiredBackorder;
        const sources = [];

        for (const inv of inventories) {
            if (remaining <= 0) break;
            const sellable = Math.max(0, inv.availableQty - inv.reservedQty);
            if (sellable > 0) {
                const canTake = Math.min(sellable, remaining);
                sources.push({
                    warehouseId: inv.warehouse.id,
                    warehouseCode: inv.warehouse.code,
                    warehouseName: inv.warehouse.name,
                    shippingWeight: Number(inv.warehouse.shippingWeight || 1.0),
                    availableSellable: sellable,
                    quantityToConsolidate: canTake,
                    estimatedCost: Number((canTake * Number(inv.warehouse.shippingWeight || 1.0) * 45).toFixed(2))
                });
                remaining -= canTake;
            }
        }

        const consolidatedForLine = requiredBackorder - remaining;
        if (consolidatedForLine > 0) {
            totalConsolidatableQty += consolidatedForLine;
            consolidatableItems.push({
                allocationId: bo.id,
                orderLineId: bo.orderLineId,
                productId,
                productSku: bo.orderLine.product?.sku || "SKU",
                productName: bo.orderLine.product?.name || "Product",
                backorderQty: requiredBackorder,
                consolidatableQty: consolidatedForLine,
                remainingBackorderAfterConsolidation: remaining,
                sources
            });
        }
    }

    const totalBackorderedQty = backorderRows.reduce((sum, b) => sum + b.backorderQty, 0);

    return {
        orderId,
        hasBackorder: true,
        canConsolidate: totalConsolidatableQty > 0,
        totalBackorderedQty,
        totalConsolidatableQty,
        items: consolidatableItems
    };
}

/**
 * Consolidates remaining backorders using newly arrived inventory.
 */
export async function consolidateBackorders(orderId, userId = null) {
    const status = await getBackorderConsolidationStatus(orderId);

    if (!status.canConsolidate || status.items.length === 0) {
        throw new Error("No live warehouse stock is available to consolidate remaining backorders");
    }

    const result = await prisma.$transaction(async (tx) => {
        for (const item of status.items) {
            for (const src of item.sources) {
                // Check if warehouse allocation row already exists for this order line
                const existing = await tx.fulfillmentAllocation.findUnique({
                    where: {
                        orderLineId_warehouseId: {
                            orderLineId: item.orderLineId,
                            warehouseId: src.warehouseId
                        }
                    }
                });

                if (existing) {
                    await tx.fulfillmentAllocation.update({
                        where: { id: existing.id },
                        data: {
                            allocatedQty: { increment: src.quantityToConsolidate },
                            shippingCost: { increment: src.estimatedCost },
                            status: "RESERVED"
                        }
                    });
                } else {
                    await tx.fulfillmentAllocation.create({
                        data: {
                            orderId,
                            orderLineId: item.orderLineId,
                            warehouseId: src.warehouseId,
                            allocatedQty: src.quantityToConsolidate,
                            fulfilledQty: 0,
                            backorderQty: 0,
                            shippingCost: src.estimatedCost,
                            status: "RESERVED",
                            isManualOverride: false
                        }
                    });
                }

                // Reserve the newly arrived inventory
                const updateRes = await tx.inventory.updateMany({
                    where: {
                        warehouseId: src.warehouseId,
                        productId: item.productId,
                        availableQty: { gte: src.quantityToConsolidate }
                    },
                    data: {
                        reservedQty: { increment: src.quantityToConsolidate }
                    }
                });

                if (updateRes.count !== 1) {
                    throw new Error(`Failed to reserve stock in warehouse ${src.warehouseName}`);
                }
            }

            // Update or remove the backorder row
            if (item.remainingBackorderAfterConsolidation <= 0) {
                await tx.fulfillmentAllocation.delete({
                    where: { id: item.allocationId }
                });
            } else {
                await tx.fulfillmentAllocation.update({
                    where: { id: item.allocationId },
                    data: {
                        backorderQty: item.remainingBackorderAfterConsolidation
                    }
                });
            }
        }

        // Recalculate order status
        const allSaved = await tx.fulfillmentAllocation.findMany({ where: { orderId } });
        const order = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true } });
        const totalOrdered = order.lines.reduce((s, l) => s + l.quantity, 0);
        const newStatus = calculateOrderStatus(allSaved, totalOrdered);

        const updatedOrder = await tx.order.update({
            where: { id: orderId },
            data: { status: newStatus }
        });

        return { order: updatedOrder, allocations: allSaved };
    });

    await recordAuditLog({
        userId: userId || null,
        actorType: "USER",
        entityType: "Order",
        entityId: orderId,
        action: "BACKORDER_CONSOLIDATED",
        newValue: {
            orderId,
            status: result.order.status,
            consolidatedQuantity: status.totalConsolidatableQty
        },
        reason: "Consolidated remaining backorders as new warehouse stock arrived mid-fulfillment",
    });

    return {
        success: true,
        order: result.order,
        consolidatedQuantity: status.totalConsolidatableQty,
        remainingBackorder: status.totalBackorderedQty - status.totalConsolidatableQty
    };
}

/**
 * Read the allocation that was actually SAVED for an order.
 * Formats warehouse splits and checks for mid-fulfillment consolidatable backorders.
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

    const shipmentWarehouses = new Set(
        allocations.filter((a) => a.warehouseId).map((a) => a.warehouseId)
    );

    const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedQty, 0);
    const totalBackordered = allocations.reduce((sum, a) => sum + a.backorderQty, 0);
    const totalShippingCost = allocations.reduce(
        (sum, a) => sum + Number(a.shippingCost || 0),
        0
    );

    // Group allocations by warehouse for the Warehouse Split summary cards
    const warehouseMap = new Map();
    for (const a of allocations) {
        if (!a.warehouseId) continue;
        if (!warehouseMap.has(a.warehouseId)) {
            warehouseMap.set(a.warehouseId, {
                warehouseId: a.warehouseId,
                warehouseName: a.warehouse?.name || "Warehouse",
                warehouseCode: a.warehouse?.code || "WH",
                shippingWeight: Number(a.warehouse?.shippingWeight || 1.0),
                totalQuantity: 0,
                estimatedCost: 0,
                items: [],
            });
        }
        const whGroup = warehouseMap.get(a.warehouseId);
        whGroup.totalQuantity += a.allocatedQty;
        whGroup.estimatedCost += Number(a.shippingCost || 0);
        whGroup.items.push({
            orderLineId: a.orderLineId,
            productId: a.orderLine?.product?.id,
            productSku: a.orderLine?.product?.sku || "SKU",
            productName: a.orderLine?.product?.name || "Product",
            quantity: a.allocatedQty,
            shippingCost: Number(a.shippingCost || 0),
        });
    }

    const warehouseSplits = Array.from(warehouseMap.values()).map((wh, idx) => ({
        ...wh,
        shipmentNumber: idx + 1,
        totalShipments: warehouseMap.size,
        packageLabel: `Package ${idx + 1} of ${warehouseMap.size}`,
    }));

    // Check if new stock has arrived mid-fulfillment for any backordered lines
    let consolidationStatus = { canConsolidate: false, items: [] };
    if (totalBackordered > 0) {
        try {
            consolidationStatus = await getBackorderConsolidationStatus(orderId);
        } catch (e) {
            console.error("Consolidation check error:", e.message);
        }
    }

    return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        allocations,
        warehouseSplits,
        shipmentCount: shipmentWarehouses.size,
        totalAllocated,
        totalBackordered,
        totalShippingCost,
        hasBackorder: totalBackordered > 0,
        isManualOverride: allocations.some((a) => a.isManualOverride),
        canConsolidate: consolidationStatus.canConsolidate,
        consolidationDetails: consolidationStatus
    };
}

export default {
    getFulfillmentPlan,
    allocateOrder,
    manualOverrideAllocation,
    getBackorderConsolidationStatus,
    consolidateBackorders,
    getOrderAllocations
};

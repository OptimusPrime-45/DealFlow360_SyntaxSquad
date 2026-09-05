// backend/rules/fulfillment/calculateOrderStatus.js

// Calculate the order status from fulfillment allocations.
export function calculateOrderStatus(
    allocations,
    orderQuantity
) {
    // Validate allocation input.
    if (!Array.isArray(allocations)) {
        throw new Error(
            "allocations must be an array"
        );
    }

    // Validate order quantity.
    if (
        !Number.isInteger(orderQuantity) ||
        orderQuantity <= 0
    ) {
        throw new Error(
            "orderQuantity must be a positive integer"
        );
    }

    // No allocation means fulfillment has not started.
    if (allocations.length === 0) {
        return "PENDING_FULFILLMENT";
    }

    let allocatedQuantity = 0;
    let fulfilledQuantity = 0;
    let shippedQuantity = 0;
    let backorderQuantity = 0;

    let hasPlannedAllocation = false;
    let hasReservedAllocation = false;
    let hasBackorder = false;
    let hasUnshippedAllocation = false;

    // Read the fulfillment state from every allocation.
    for (const allocation of allocations) {
        const allocated =
            Number(
                allocation.allocatedQty || 0
            );

        const fulfilled =
            Number(
                allocation.fulfilledQty || 0
            );

        const backorder =
            Number(
                allocation.backorderQty || 0
            );

        allocatedQuantity +=
            allocated;

        fulfilledQuantity +=
            fulfilled;

        backorderQuantity +=
            backorder;

        // Count shipped quantity.
        if (
            allocation.status === "SHIPPED"
        ) {
            shippedQuantity +=
                fulfilled;
        }

        // Track allocation states.
        if (
            allocation.status === "PLANNED"
        ) {
            hasPlannedAllocation = true;
        }

        if (
            allocation.status === "RESERVED"
        ) {
            hasReservedAllocation = true;
        }

        if (
            allocation.status === "BACKORDERED" ||
            backorder > 0
        ) {
            hasBackorder = true;
        }

        if (
            allocation.status !== "SHIPPED" &&
            allocation.status !== "CANCELLED" &&
            allocated > 0
        ) {
            hasUnshippedAllocation = true;
        }
    }

    // No quantity has been allocated yet.
    if (
        allocatedQuantity === 0 &&
        backorderQuantity === 0
    ) {
        return "PENDING_FULFILLMENT";
    }

    // Some quantity is still waiting to be allocated.
    if (
        hasPlannedAllocation ||
        hasReservedAllocation
    ) {
        if (
            fulfilledQuantity > 0 &&
            fulfilledQuantity < orderQuantity
        ) {
            return "PARTIALLY_SHIPPED";
        }

        return "ALLOCATED";
    }

    // Some but not all of the order has been fulfilled.
    if (
        fulfilledQuantity > 0 &&
        fulfilledQuantity < orderQuantity
    ) {
        return "PARTIALLY_SHIPPED";
    }

    // The complete order quantity has been fulfilled
    // but at least one shipment has not been shipped.
    if (
        fulfilledQuantity >= orderQuantity &&
        hasUnshippedAllocation
    ) {
        return "ALLOCATED";
    }

    // Everything required has been shipped.
    if (
        shippedQuantity >= orderQuantity
    ) {
        return "SHIPPED";
    }

    // Full quantity fulfilled without enough
    // shipping information is still considered allocated.
    if (
        fulfilledQuantity >= orderQuantity
    ) {
        return "ALLOCATED";
    }

    // Fallback.
    return "PENDING_FULFILLMENT";
}

export default calculateOrderStatus;
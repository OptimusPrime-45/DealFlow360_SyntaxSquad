// backend/rules/fulfillment/allocateStock.js

// Calculate stock that can actually be used.
function getSellableQuantity(warehouse) {
    return Math.max(
        0,
        Number(warehouse.availableQty) -
        Number(warehouse.reservedQty)
    );
}

// Allocate the required quantity across selected warehouses.
export function allocateStock(
    selectedWarehouses,
    requiredQuantity
) {
    // Validate warehouse input.
    if (!Array.isArray(selectedWarehouses)) {
        throw new Error(
            "selectedWarehouses must be an array"
        );
    }

    // Validate requested quantity.
    if (
        !Number.isInteger(requiredQuantity) ||
        requiredQuantity <= 0
    ) {
        throw new Error(
            "requiredQuantity must be a positive integer"
        );
    }

    const allocations = [];

    // Track how much quantity is still required.
    let remainingQuantity =
        requiredQuantity;

    // Allocate stock warehouse by warehouse.
    for (
        const warehouse
        of selectedWarehouses
    ) {
        // Stop once the complete quantity is allocated.
        if (remainingQuantity <= 0) {
            break;
        }

        // Calculate usable stock.
        const sellableQuantity =
            getSellableQuantity(
                warehouse
            );

        // Ignore warehouses with no usable stock.
        if (sellableQuantity <= 0) {
            continue;
        }

        // Allocate only what is required.
        const allocatedQuantity =
            Math.min(
                sellableQuantity,
                remainingQuantity
            );

        allocations.push({
            warehouseId:
                warehouse.id,

            warehouseName:
                warehouse.name,

            quantity:
                allocatedQuantity,

            shippingWeight:
                Number(
                    warehouse.shippingWeight
                )
        });

        // Reduce the remaining requirement.
        remainingQuantity -=
            allocatedQuantity;
    }

    // Anything that could not be allocated becomes a backorder.
    const backorderQuantity =
        Math.max(
            0,
            remainingQuantity
        );

    // Calculate the quantity fulfilled now.
    const fulfilledQuantity =
        requiredQuantity -
        backorderQuantity;

    return {
        allocations,

        requiredQuantity,

        fulfilledQuantity,

        backorderQuantity,

        isFullyAllocated:
            backorderQuantity === 0
    };
}

export default allocateStock;
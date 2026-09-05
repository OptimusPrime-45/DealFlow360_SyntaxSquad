// backend/controllers/rules/fulfillment/validateAllocation.js

// Calculate stock that can actually be used.
function getSellableQuantity(warehouse) {
    return Math.max(
        0,
        Number(warehouse.availableQty) -
        Number(warehouse.reservedQty)
    );
}

// Validate a warehouse allocation.
export function validateAllocation(
    selectedWarehouses,
    allocations,
    requiredQuantity
) {
    // Validate warehouse input.
    if (!Array.isArray(selectedWarehouses)) {
        throw new Error(
            "selectedWarehouses must be an array"
        );
    }

    // Validate allocation input.
    if (!Array.isArray(allocations)) {
        throw new Error(
            "allocations must be an array"
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

    // Create a lookup for selected warehouses.
    const warehouseMap = new Map(
        selectedWarehouses.map(
            (warehouse) => [
                warehouse.id,
                warehouse
            ]
        )
    );

    const usedWarehouses = new Set();

    // Track total allocated quantity.
    let totalAllocatedQuantity = 0;

    // Validate each allocation.
    for (
        const allocation
        of allocations
    ) {
        // Validate warehouse ID.
        if (
            typeof allocation.warehouseId !==
            "string" ||
            allocation.warehouseId.trim()
                .length === 0
        ) {
            throw new Error(
                "allocation.warehouseId is required"
            );
        }

        // Find the selected warehouse.
        const warehouse =
            warehouseMap.get(
                allocation.warehouseId
            );

        // Allocation must use a selected warehouse.
        if (!warehouse) {
            throw new Error(
                `Warehouse ${allocation.warehouseId} was not selected`
            );
        }

        // Prevent duplicate allocation entries
        // for the same order line and warehouse.
        if (
            usedWarehouses.has(
                allocation.warehouseId
            )
        ) {
            throw new Error(
                `Warehouse ${allocation.warehouseId} appears more than once`
            );
        }

        usedWarehouses.add(
            allocation.warehouseId
        );

        // Quantity must be a positive integer.
        if (
            !Number.isInteger(
                allocation.quantity
            ) ||
            allocation.quantity <= 0
        ) {
            throw new Error(
                `Invalid allocation quantity for warehouse ${warehouse.name}`
            );
        }

        // Calculate usable stock.
        const sellableQuantity =
            getSellableQuantity(
                warehouse
            );

        // Allocation cannot exceed sellable stock.
        if (
            allocation.quantity >
            sellableQuantity
        ) {
            throw new Error(
                `Warehouse ${warehouse.name} does not have enough sellable stock`
            );
        }

        // Add allocation to the total.
        totalAllocatedQuantity +=
            allocation.quantity;
    }

    // The total allocation cannot exceed
    // the requested order quantity.
    if (
        totalAllocatedQuantity >
        requiredQuantity
    ) {
        throw new Error(
            "Total allocated quantity cannot exceed required quantity"
        );
    }

    // Calculate quantity that remains unfulfilled.
    const backorderQuantity =
        requiredQuantity -
        totalAllocatedQuantity;

    return {
        valid: true,

        requiredQuantity,

        allocatedQuantity:
            totalAllocatedQuantity,

        backorderQuantity,

        isFullyAllocated:
            backorderQuantity === 0
    };
}

export default validateAllocation;
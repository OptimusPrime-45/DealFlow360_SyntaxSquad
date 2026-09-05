// backend/controllers/rules/fulfillment/createShipments.js

// Group fulfillment allocations into shipment plans.
// Each non-null warehouse represents one shipment group.
export function createShipmentPlan(allocations) {
    // Validate allocation input.
    if (!Array.isArray(allocations)) {
        throw new Error(
            "allocations must be an array"
        );
    }

    const shipmentMap = new Map();

    // Process every warehouse allocation.
    for (const allocation of allocations) {
        // Backorders do not have a warehouse,
        // so they do not create a shipment.
        if (!allocation.warehouseId) {
            continue;
        }

        // Validate allocation quantity.
        if (
            !Number.isInteger(
                allocation.quantity
            ) ||
            allocation.quantity <= 0
        ) {
            throw new Error(
                `Invalid shipment quantity for warehouse ${allocation.warehouseId}`
            );
        }

        // Create a shipment group for this warehouse
        // when one does not already exist.
        if (
            !shipmentMap.has(
                allocation.warehouseId
            )
        ) {
            shipmentMap.set(
                allocation.warehouseId,
                {
                    warehouseId:
                        allocation.warehouseId,

                    warehouseName:
                        allocation.warehouseName || null,

                    allocations: [],

                    totalQuantity: 0,

                    shippingWeight:
                        Number(
                            allocation.shippingWeight || 0
                        )
                }
            );
        }

        // Get the existing shipment group.
        const shipment =
            shipmentMap.get(
                allocation.warehouseId
            );

        // Add the allocation to the shipment.
        shipment.allocations.push(
            allocation
        );

        // Add its quantity to the shipment total.
        shipment.totalQuantity +=
            allocation.quantity;
    }

    // Convert the Map into an array.
    const shipments =
        Array.from(
            shipmentMap.values()
        );

    return {
        shipments,

        shipmentCount:
            shipments.length
    };
}

export default createShipmentPlan;
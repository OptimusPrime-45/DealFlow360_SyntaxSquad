// backend/controllers/rules/fulfillment/selectWarehouses.js

export function selectWarehouses(
  warehouses,
  requiredQuantity
) {
  if (!Array.isArray(warehouses)) {
    throw new Error(
      "warehouses must be an array"
    );
  }

  if (
    !Number.isInteger(requiredQuantity) ||
    requiredQuantity <= 0
  ) {
    throw new Error(
      "requiredQuantity must be a positive integer"
    );
  }

  const normalizedWarehouses =
    warehouses
      .filter(
        (warehouse) =>
          warehouse &&
          warehouse.isActive !== false
      )
      .map(
        (warehouse) => ({
          ...warehouse,
          availableQty:
            Number(
              warehouse.availableQty || 0
            ),
          reservedQty:
            Number(
              warehouse.reservedQty || 0
            ),
          shippingWeight:
            Number(
              warehouse.shippingWeight || 0
            ),
          priority:
            Number(
              warehouse.priority || 0
            )
        })
      )
      .filter(
        (warehouse) =>
          Math.max(
            0,
            warehouse.availableQty -
            warehouse.reservedQty
          ) > 0
      );

  normalizedWarehouses.sort(
    (a, b) => {
      const aWeight =
        Math.max(
          0,
          a.availableQty -
          a.reservedQty
        );

      const bWeight =
        Math.max(
          0,
          b.availableQty -
          b.reservedQty
        );

      // Prefer warehouses with enough stock
      // to satisfy the requirement by themselves.
      const aCanFulfill =
        aWeight >= requiredQuantity;

      const bCanFulfill =
        bWeight >= requiredQuantity;

      if (
        aCanFulfill !==
        bCanFulfill
      ) {
        return aCanFulfill
          ? -1
          : 1;
      }

      // Fewer warehouses first is achieved
      // by preferring the strongest stock position.
      if (aWeight !== bWeight) {
        return bWeight - aWeight;
      }

      // Lower shipping weight is preferred.
      if (
        a.shippingWeight !==
        b.shippingWeight
      ) {
        return (
          a.shippingWeight -
          b.shippingWeight
        );
      }

      // Higher priority wins as final tie-breaker.
      return (
        b.priority -
        a.priority
      );
    }
  );

  return normalizedWarehouses;
}

export default selectWarehouses;
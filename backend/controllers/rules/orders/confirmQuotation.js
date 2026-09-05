// backend/controllers/rules/orders/confirmQuotation.js

// Statuses from which a quotation can be confirmed.
const CONFIRMABLE_STATUSES = [
  "APPROVED",
  "SENT",
  "UNDER_NEGOTIATION"
];

// Prepare a quotation for conversion into an order.
export function confirmQuotation(
  quotation,
  orderNumber
) {
  // Validate quotation input.
  if (
    !quotation ||
    typeof quotation !== "object"
  ) {
    throw new Error(
      "quotation is required"
    );
  }

  // Validate quotation ID.
  if (
    typeof quotation.id !== "string" ||
    quotation.id.trim().length === 0
  ) {
    throw new Error(
      "quotation.id is required"
    );
  }

  // Check whether the quotation is allowed to be confirmed.
  if (
    !CONFIRMABLE_STATUSES.includes(
      quotation.status
    )
  ) {
    throw new Error(
      `Quotation cannot be confirmed from status ${quotation.status}`
    );
  }

  // Validate customer.
  if (
    typeof quotation.customerId !== "string" ||
    quotation.customerId.trim().length === 0
  ) {
    throw new Error(
      "quotation.customerId is required"
    );
  }

  // Validate order number.
  if (
    typeof orderNumber !== "string" ||
    orderNumber.trim().length === 0
  ) {
    throw new Error(
      "orderNumber is required"
    );
  }

  // A quotation must contain at least one line.
  if (
    !Array.isArray(quotation.lines) ||
    quotation.lines.length === 0
  ) {
    throw new Error(
      "Quotation must contain at least one line"
    );
  }

  // Prepare copied order lines.
  const orderLines =
    quotation.lines.map(
      (line) => {
        // Validate quotation line ID.
        if (
          typeof line.id !== "string" ||
          line.id.trim().length === 0
        ) {
          throw new Error(
            "Quotation line ID is required"
          );
        }

        // Validate product ID.
        if (
          typeof line.productId !== "string" ||
          line.productId.trim().length === 0
        ) {
          throw new Error(
            `Product ID is required for quotation line ${line.id}`
          );
        }

        // Validate quantity.
        if (
          !Number.isInteger(line.quantity) ||
          line.quantity <= 0
        ) {
          throw new Error(
            `Invalid quantity for quotation line ${line.id}`
          );
        }

        // Return the frozen copy for OrderLine.
        return {
          quotationLineId:
            line.id,

          productId:
            line.productId,

          subscriptionPlanId:
            line.subscriptionPlanId ??
            null,

          lineType:
            line.lineType,

          quantity:
            line.quantity,

          unitPrice:
            line.unitPrice,

          unitCost:
            line.unitCost,

          discountPercent:
            line.discountPercent,

          taxRate:
            line.taxRate,

          lineTotal:
            line.lineTotal
        };
      }
    );

  // Return data for the controller to persist.
  return {
    order: {
      orderNumber:
        orderNumber.trim(),

      quotationId:
        quotation.id,

      customerId:
        quotation.customerId,

      status:
        "PENDING_FULFILLMENT",

      totalAmount:
        quotation.grandTotal
    },

    orderLines,

    quotationUpdate: {
      status:
        "CONFIRMED",

      confirmedAt:
        new Date(),

      lastActivityAt:
        new Date()
    }
  };
}

export default confirmQuotation;
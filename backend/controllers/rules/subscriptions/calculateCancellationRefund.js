// backend/controllers/rules/subscriptions/calculateCancellationRefund.js

// Calculate the refund or credit amount for cancellation.
export function calculateCancellationRefund(
    paidAmount,
    cancellationRefundPercent
) {
    // Convert values to numbers.
    const amount =
        Number(paidAmount);

    const refundPercent =
        Number(
            cancellationRefundPercent
        );

    // Validate paid amount.
    if (
        !Number.isFinite(amount) ||
        amount < 0
    ) {
        throw new Error(
            "paidAmount must be a valid non-negative number"
        );
    }

    // Validate refund percentage.
    if (
        !Number.isFinite(refundPercent) ||
        refundPercent < 0 ||
        refundPercent > 100
    ) {
        throw new Error(
            "cancellationRefundPercent must be between 0 and 100"
        );
    }

    // Calculate refund amount.
    const refundAmount =
        amount *
        (refundPercent / 100);

    // Round to two decimal places.
    const roundedRefundAmount =
        Number(
            refundAmount.toFixed(2)
        );

    return {
        paidAmount:
            amount,

        cancellationRefundPercent:
            refundPercent,

        refundAmount:
            roundedRefundAmount,

        hasRefund:
            roundedRefundAmount > 0
    };
}

export default calculateCancellationRefund;
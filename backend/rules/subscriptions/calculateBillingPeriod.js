// backend/rules/subscriptions/calculateBillingPeriod.js

// Calculate the end date for a billing interval.
function addBillingInterval(
    startDate,
    billingInterval
) {
    // Create a copy so the original date is not changed.
    const endDate =
        new Date(startDate);

    // Add the correct billing interval.
    switch (billingInterval) {
        case "MONTHLY":
            endDate.setMonth(
                endDate.getMonth() + 1
            );
            break;

        case "QUARTERLY":
            endDate.setMonth(
                endDate.getMonth() + 3
            );
            break;

        case "YEARLY":
            endDate.setFullYear(
                endDate.getFullYear() + 1
            );
            break;

        default:
            throw new Error(
                `Unsupported billing interval: ${billingInterval}`
            );
    }

    return endDate;
}


// Calculate a subscription billing period.
export function calculateBillingPeriod(
    startDate,
    billingInterval
) {
    // Validate the billing start date.
    const periodStart =
        new Date(startDate);

    if (
        Number.isNaN(
            periodStart.getTime()
        )
    ) {
        throw new Error(
            "Invalid startDate"
        );
    }

    // Validate the billing interval.
    const validIntervals = [
        "MONTHLY",
        "QUARTERLY",
        "YEARLY"
    ];

    if (
        !validIntervals.includes(
            billingInterval
        )
    ) {
        throw new Error(
            `Invalid billing interval: ${billingInterval}`
        );
    }

    // Calculate the end of the billing period.
    const periodEnd =
        addBillingInterval(
            periodStart,
            billingInterval
        );

    return {
        periodStart,
        periodEnd,
        billingInterval
    };
}


// Calculate the next billing period.
export function calculateNextBillingPeriod(
    currentPeriodEnd,
    billingInterval
) {
    // The next period starts when the current one ends.
    return calculateBillingPeriod(
        currentPeriodEnd,
        billingInterval
    );
}

export default calculateBillingPeriod;
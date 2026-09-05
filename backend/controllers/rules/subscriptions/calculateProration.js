// backend/controllers/rules/subscriptions/calculateProration.js

// Calculate the number of days between two dates.
function getDaysBetween(
    startDate,
    endDate
) {
    const millisecondsPerDay =
        24 * 60 * 60 * 1000;

    return (
        endDate.getTime() -
        startDate.getTime()
    ) / millisecondsPerDay;
}


// Calculate a proration factor.
export function calculateProration(
    periodStart,
    periodEnd,
    effectiveDate
) {
    // Convert all values to Date objects.
    const start =
        new Date(periodStart);

    const end =
        new Date(periodEnd);

    const effective =
        new Date(effectiveDate);

    // Validate dates.
    if (
        Number.isNaN(
            start.getTime()
        ) ||
        Number.isNaN(
            end.getTime()
        ) ||
        Number.isNaN(
            effective.getTime()
        )
    ) {
        throw new Error(
            "Invalid date supplied for proration"
        );
    }

    // The billing period must have a positive length.
    const totalDays =
        getDaysBetween(
            start,
            end
        );

    if (totalDays <= 0) {
        throw new Error(
            "periodEnd must be after periodStart"
        );
    }

    // Change before or exactly at the start
    // of the period receives a full-period factor.
    if (
        effective <= start
    ) {
        return {
            prorationFactor: 1,
            totalDays,
            billableDays: totalDays
        };
    }

    // Change at or after the end means
    // there is no remaining part of this period.
    if (
        effective >= end
    ) {
        return {
            prorationFactor: 0,
            totalDays,
            billableDays: 0
        };
    }

    // Calculate the remaining days in the period.
    const remainingDays =
        getDaysBetween(
            effective,
            end
        );

    // Calculate the fraction of the period
    // that remains billable.
    const prorationFactor =
        remainingDays /
        totalDays;

    return {
        prorationFactor:
            Number(
                prorationFactor.toFixed(4)
            ),

        totalDays,

        billableDays:
            remainingDays
    };
}


// Calculate the prorated amount.
export function calculateProratedAmount(
    unitPrice,
    quantity,
    prorationFactor
) {
    // Convert numeric inputs safely.
    const price =
        Number(unitPrice);

    const qty =
        Number(quantity);

    const factor =
        Number(prorationFactor);

    // Validate price.
    if (
        !Number.isFinite(price)
    ) {
        throw new Error(
            "Invalid unitPrice"
        );
    }

    // Validate quantity.
    if (
        !Number.isInteger(qty) ||
        qty <= 0
    ) {
        throw new Error(
            "quantity must be a positive integer"
        );
    }

    // Validate proration factor.
    if (
        !Number.isFinite(factor) ||
        factor < 0 ||
        factor > 1
    ) {
        throw new Error(
            "prorationFactor must be between 0 and 1"
        );
    }

    // Calculate the prorated amount.
    const amount =
        price *
        qty *
        factor;

    return Number(
        amount.toFixed(2)
    );
}

export default calculateProration;
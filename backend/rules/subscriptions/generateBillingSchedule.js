// backend/rules/subscriptions/generateBillingSchedule.js

import {
    calculateBillingPeriod
} from "./calculateBillingPeriod.js";


// Generate billing schedule entries.
export function generateBillingSchedule(
    startDate,
    billingInterval,
    quantity,
    unitPrice,
    numberOfPeriods = 12
) {
    // Validate quantity.
    if (
        !Number.isInteger(quantity) ||
        quantity <= 0
    ) {
        throw new Error(
            "quantity must be a positive integer"
        );
    }

    // Validate unit price.
    const price =
        Number(unitPrice);

    if (
        !Number.isFinite(price) ||
        price < 0
    ) {
        throw new Error(
            "unitPrice must be a valid non-negative number"
        );
    }

    // Validate number of periods.
    if (
        !Number.isInteger(numberOfPeriods) ||
        numberOfPeriods <= 0
    ) {
        throw new Error(
            "numberOfPeriods must be a positive integer"
        );
    }

    // Calculate the first billing period.
    let period =
        calculateBillingPeriod(
            startDate,
            billingInterval
        );

    const schedules = [];

    // Generate one schedule entry per billing period.
    for (
        let index = 0;
        index < numberOfPeriods;
        index++
    ) {
        const amount =
            Number(
                (
                    price *
                    quantity
                ).toFixed(2)
            );

        schedules.push({
            billingDate:
                new Date(
                    period.periodStart
                ),

            periodStart:
                new Date(
                    period.periodStart
                ),

            periodEnd:
                new Date(
                    period.periodEnd
                ),

            quantity,

            prorationFactor:
                1,

            amount,

            status:
                "SCHEDULED"
        });

        // Calculate the next billing period.
        period =
            calculateBillingPeriod(
                period.periodEnd,
                billingInterval
            );
    }

    return schedules;
}

export default generateBillingSchedule;
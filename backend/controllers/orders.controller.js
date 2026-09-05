import { prisma } from "../lib/prisma.js";

import {
    confirmQuotation
} from "./rules/orders/confirmQuotation.js";

function generateOrderNumber() {
    const timestamp =
        Date.now().toString();

    const random =
        Math.floor(
            Math.random() * 10000
        )
            .toString()
            .padStart(4, "0");

    return `ORD-${timestamp}-${random}`;
}

export async function confirmQuotationToOrder(
    quotationId
) {
    if (
        typeof quotationId !== "string" ||
        quotationId.trim().length === 0
    ) {
        throw new Error(
            "quotationId is required"
        );
    }

    const quotation =
        await prisma.quotation.findUnique({
            where: {
                id: quotationId
            },
            include: {
                lines: true
            }
        });

    if (!quotation) {
        throw new Error(
            "Quotation not found"
        );
    }

    const existingOrder =
        await prisma.order.findUnique({
            where: {
                quotationId
            }
        });

    if (existingOrder) {
        throw new Error(
            "An order already exists for this quotation"
        );
    }

    const orderNumber =
        generateOrderNumber();

    const preparedData =
        confirmQuotation(
            quotation,
            orderNumber
        );

    const result =
        await prisma.$transaction(
            async (tx) => {
                const order =
                    await tx.order.create({
                        data: {
                            orderNumber:
                                preparedData.order.orderNumber,
                            quotationId:
                                preparedData.order.quotationId,
                            customerId:
                                preparedData.order.customerId,
                            status:
                                preparedData.order.status,
                            totalAmount:
                                preparedData.order.totalAmount
                        }
                    });

                await tx.orderLine.createMany({
                    data:
                        preparedData.orderLines.map(
                            (line) => ({
                                orderId:
                                    order.id,
                                quotationLineId:
                                    line.quotationLineId,
                                productId:
                                    line.productId,
                                subscriptionPlanId:
                                    line.subscriptionPlanId,
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
                            })
                        )
                });

                const updatedQuotation =
                    await tx.quotation.update({
                        where: {
                            id: quotationId
                        },
                        data: {
                            status: "CONFIRMED",
                            confirmedAt:
                                preparedData
                                    .quotationUpdate
                                    .confirmedAt,
                            lastActivityAt:
                                preparedData
                                    .quotationUpdate
                                    .lastActivityAt
                        }
                    });

                const completeOrder =
                    await tx.order.findUnique({
                        where: {
                            id: order.id
                        },
                        include: {
                            lines: true
                        }
                    });

                return {
                    order:
                        completeOrder,
                    quotation:
                        updatedQuotation
                };
            }
        );

    return result;
}
import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { ApiResponse } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

/**
 * Negotiation Controller
 * Implements PRD Spine Step 7: Customer Counter-Offers & Automatic Re-Evaluation
 */

/**
 * POST /api/portal/negotiate
 * Customer Endpoint: Submits a counter-offer or revision request from the portal.
 * Protected by requirePortal middleware.
 */
export const submitCustomerNegotiation = asyncHandler(async (req, res) => {
  const { quotationId } = req.portalSession;
  const {
    quotationLineId,
    requestType = 'DISCOUNT',
    proposedDiscountPercent,
    proposedQuantity,
    message
  } = req.body;

  // 1. Validation: Message is mandatory
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new ApiError(400, 'Please provide a message explaining your revision request');
  }

  // 2. Validation: Numerical constraints
  if (requestType === 'DISCOUNT') {
    const discount = Number(proposedDiscountPercent);
    if (isNaN(discount) || discount < 0 || discount > 100) {
      throw new ApiError(400, 'Proposed discount must be a number between 0% and 100%');
    }
  }

  if (requestType === 'QUANTITY') {
    const qty = Number(proposedQuantity);
    if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
      throw new ApiError(400, 'Proposed quantity must be a positive integer greater than 0');
    }
  }

  // 3. Security: If quotationLineId is specified, ensure it belongs to THIS quotation!
  if (quotationLineId) {
    const lineBelongsToQuote = await prisma.quotationLine.findFirst({
      where: {
        id: quotationLineId,
        quotationId: quotationId
      }
    });

    if (!lineBelongsToQuote) {
      throw new ApiError(403, 'Forbidden: Line item does not belong to this quotation');
    }
  }

  // 4. Invariant 3: At most one OPEN Negotiation session per quotation
  // If an open session already exists, we reuse it. If not, we create a new one.
  let activeNegotiation = await prisma.negotiation.findFirst({
    where: {
      quotationId: quotationId,
      status: 'OPEN'
    }
  });

  if (!activeNegotiation) {
    activeNegotiation = await prisma.negotiation.create({
      data: {
        quotationId: quotationId,
        status: 'OPEN'
      }
    });
  }

  // 5. Create the individual NegotiationRequest row
  const negotiationRequest = await prisma.negotiationRequest.create({
    data: {
      negotiationId: activeNegotiation.id,
      quotationLineId: quotationLineId || null,
      actorType: 'CUSTOMER',
      requestType: requestType,
      proposedDiscountPercent: proposedDiscountPercent !== undefined ? Number(proposedDiscountPercent) : null,
      proposedQuantity: proposedQuantity !== undefined ? Number(proposedQuantity) : null,
      message: message.trim(),
      status: 'OPEN'
    }
  });

  // 6. Update Quotation Status to UNDER_NEGOTIATION and bump lastActivityAt
  await prisma.quotation.update({
    where: { id: quotationId },
    data: {
      status: 'UNDER_NEGOTIATION',
      lastActivityAt: new Date()
    }
  });

  // 7. Audit Log: Record customer action with actorType = CUSTOMER
  await prisma.auditLog.create({
    data: {
      quotationId: quotationId,
      actorType: 'CUSTOMER',
      entityType: 'NegotiationRequest',
      entityId: negotiationRequest.id,
      action: 'CUSTOMER_COUNTER_SUBMITTED',
      newValue: {
        requestType,
        proposedDiscountPercent,
        proposedQuantity,
        message: message.trim()
      },
      reason: 'Customer submitted terms counter-offer via portal'
    }
  });

  return res.status(201).json(
    new ApiResponse(201, {
      requestId: negotiationRequest.id,
      negotiationId: activeNegotiation.id,
      status: negotiationRequest.status,
      proposedDiscountPercent: negotiationRequest.proposedDiscountPercent ? Number(negotiationRequest.proposedDiscountPercent) : null,
      proposedQuantity: negotiationRequest.proposedQuantity,
      message: negotiationRequest.message,
      createdAt: negotiationRequest.createdAt
    }, 'Counter-offer submitted successfully. Your sales executive will review it shortly.')
  );
});

/**
 * GET /api/portal/negotiations
 * Customer Endpoint: Fetches active negotiation session and conversation history.
 * Protected by requirePortal middleware.
 */
export const getPortalNegotiations = asyncHandler(async (req, res) => {
  const { quotationId } = req.portalSession;

  const activeNegotiation = await prisma.negotiation.findFirst({
    where: {
      quotationId: quotationId,
      status: 'OPEN'
    },
    include: {
      requests: {
        include: {
          quotationLine: {
            include: {
              product: {
                select: { name: true, sku: true }
              }
            }
          },
          respondedBy: {
            select: { fullName: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!activeNegotiation) {
    return res.status(200).json(
      new ApiResponse(200, { hasActiveNegotiation: false, requests: [] }, 'No active negotiation')
    );
  }

  const formattedRequests = activeNegotiation.requests.map((r) => ({
    id: r.id,
    requestType: r.requestType,
    actorType: r.actorType,
    lineName: r.quotationLine ? r.quotationLine.product.name : 'Overall Proposal',
    proposedDiscountPercent: r.proposedDiscountPercent ? Number(r.proposedDiscountPercent) : null,
    proposedQuantity: r.proposedQuantity,
    message: r.message,
    status: r.status,
    responseMessage: r.responseMessage,
    respondedAt: r.respondedAt,
    respondedByName: r.respondedBy ? r.respondedBy.fullName : null,
    createdAt: r.createdAt
  }));

  return res.status(200).json(
    new ApiResponse(200, {
      hasActiveNegotiation: true,
      negotiationId: activeNegotiation.id,
      openedAt: activeNegotiation.openedAt,
      requests: formattedRequests
    }, 'Negotiation requests retrieved')
  );
});

/**
 * POST /api/negotiations/requests/:id/respond
 * Internal Staff Endpoint: Sales Rep accepts or declines a counter-offer.
 * Implements the automatic approval loop (§9 Step 7).
 */
export const respondToNegotiationRequest = asyncHandler(async (req, res) => {
  const { id: requestId } = req.params;
  const { action, responseMessage = '', userId } = req.body;

  // 1. Validation
  if (!action || !['ACCEPT', 'DECLINE'].includes(action)) {
    throw new ApiError(400, 'Action must be either ACCEPT or DECLINE');
  }

  // 2. Fetch the request with its negotiation, quotation, and quotation line
  const request = await prisma.negotiationRequest.findUnique({
    where: { id: requestId },
    include: {
      negotiation: {
        include: {
          quotation: {
            include: {
              customerTier: true,
              lines: true
            }
          }
        }
      },
      quotationLine: true
    }
  });

  if (!request) {
    throw new ApiError(404, 'Negotiation request not found');
  }

  if (request.status !== 'OPEN') {
    throw new ApiError(400, `Request is already ${request.status} and cannot be modified`);
  }

  const quotation = request.negotiation.quotation;

  // 3. Handle DECLINE
  if (action === 'DECLINE') {
    await prisma.negotiationRequest.update({
      where: { id: requestId },
      data: {
        status: 'DECLINED',
        responseMessage: responseMessage.trim() || 'Request declined by sales representative',
        respondedAt: new Date(),
        respondedById: userId || null
      }
    });

    // Check if there are remaining open requests in this negotiation
    const remainingOpen = await prisma.negotiationRequest.count({
      where: {
        negotiationId: request.negotiationId,
        status: 'OPEN',
        id: { not: requestId }
      }
    });

    // If no more open requests, restore status back to SENT
    if (remainingOpen === 0) {
      await prisma.quotation.update({
        where: { id: quotation.id },
        data: {
          status: 'SENT',
          lastActivityAt: new Date()
        }
      });
    }

    // Log to audit trail
    await prisma.auditLog.create({
      data: {
        quotationId: quotation.id,
        userId: userId || null,
        actorType: 'USER',
        entityType: 'NegotiationRequest',
        entityId: requestId,
        action: 'NEGOTIATION_DECLINED',
        newValue: { action: 'DECLINE', responseMessage: responseMessage.trim() },
        reason: responseMessage.trim() || 'Declined by sales representative'
      }
    });

    return res.status(200).json(
      new ApiResponse(200, { status: 'DECLINED' }, 'Negotiation request has been declined')
    );
  }

  // 4. Handle ACCEPT
  // A. Update the request status
  await prisma.negotiationRequest.update({
    where: { id: requestId },
    data: {
      status: 'ACCEPTED',
      responseMessage: responseMessage.trim() || 'Accepted by sales representative',
      respondedAt: new Date(),
      respondedById: userId || null
    }
  });

  // B. If a line item was negotiated, update its discount/quantity
  let reEvaluationTriggered = false;
  let reEvaluationReason = '';
  let calculatedOverage = 0;

  if (request.quotationLineId && request.quotationLine) {
    const line = request.quotationLine;
    let newDiscount = Number(line.discountPercent);
    let newQty = line.quantity;

    if (request.proposedDiscountPercent !== null) {
      newDiscount = Number(request.proposedDiscountPercent);
    }
    if (request.proposedQuantity !== null) {
      newQty = Number(request.proposedQuantity);
    }

    // Recalculate line pricing
    const unitPrice = Number(line.unitPrice);
    const unitCost = Number(line.unitCost);
    const grossTotal = unitPrice * newQty;
    const discountAmount = grossTotal * (newDiscount / 100);
    const newLineTotal = grossTotal - discountAmount;
    const totalCost = unitCost * newQty;
    const newLineMarginPercent = newLineTotal > 0 ? ((newLineTotal - totalCost) / newLineTotal) * 100 : 0;

    // Check against ceiling!
    const effectiveCeiling = Number(line.effectiveCeilingPercent || quotation.customerTier?.maxDiscountPercent || 0);
    calculatedOverage = Math.max(0, newDiscount - effectiveCeiling);

    // Update the line in the database
    await prisma.quotationLine.update({
      where: { id: line.id },
      data: {
        quantity: newQty,
        discountPercent: newDiscount,
        lineTotal: newLineTotal,
        lineMarginPercent: newLineMarginPercent,
        overagePts: calculatedOverage
      }
    });

    // C. Check if ceiling was breached -> AUTO RE-EVALUATION LOOP (§9 Step 7)!
    if (newDiscount > effectiveCeiling) {
      reEvaluationTriggered = true;
      reEvaluationReason = `Accepted discount (${newDiscount}%) exceeds effective ceiling (${effectiveCeiling}%) by ${calculatedOverage} points`;
    }
  }

  // D. Recalculate Quotation aggregate totals
  const allLines = await prisma.quotationLine.findMany({
    where: { quotationId: quotation.id }
  });

  const subtotal = allLines.reduce((acc, l) => acc + (Number(l.unitPrice) * l.quantity), 0);
  const grandTotal = allLines.reduce((acc, l) => acc + Number(l.lineTotal), 0);
  const discountTotal = subtotal - grandTotal;
  const taxTotal = grandTotal * 0.18; // Standard 18% tax
  const finalGrandTotal = grandTotal + taxTotal;

  // E. Determine new Quotation Status
  let nextQuotationStatus = 'SENT';

  if (reEvaluationTriggered) {
    // AUTOMATIC APPROVAL RE-ENTRY (§9 Step 7)
    nextQuotationStatus = 'PENDING_APPROVAL';

    // Find the active approval policy
    const activePolicy = await prisma.approvalPolicy.findFirst({
      where: { isActive: true }
    });

    if (activePolicy) {
      // Find latest approval cycle number
      const latestApproval = await prisma.quotationApproval.findFirst({
        where: { quotationId: quotation.id },
        orderBy: { approvalCycle: 'desc' }
      });

      const nextCycle = (latestApproval?.approvalCycle || 0) + 1;

      // Create new QuotationApproval cycle record
      await prisma.quotationApproval.create({
        data: {
          quotationId: quotation.id,
          approvalPolicyId: activePolicy.id,
          approvalCycle: nextCycle,
          status: 'PENDING',
          blendedScore: calculatedOverage,
          worstLineOverage: calculatedOverage,
          triggeredBy: 'CUSTOMER_NEGOTIATION', // Stamped with CUSTOMER_NEGOTIATION as per §9
          findings: {
            reason: reEvaluationReason,
            triggeredAt: new Date()
          }
        }
      });
    }
  }

  // Update Quotation row with totals and updated status
  await prisma.quotation.update({
    where: { id: quotation.id },
    data: {
      status: nextQuotationStatus,
      subtotal: subtotal,
      discountTotal: discountTotal,
      taxTotal: taxTotal,
      grandTotal: finalGrandTotal,
      blendedScore: reEvaluationTriggered ? calculatedOverage : 0,
      worstLineOverage: reEvaluationTriggered ? calculatedOverage : 0,
      lastActivityAt: new Date()
    }
  });

  // F. Log event in Audit Log
  await prisma.auditLog.create({
    data: {
      quotationId: quotation.id,
      userId: userId || null,
      actorType: 'USER',
      entityType: 'NegotiationRequest',
      entityId: requestId,
      action: reEvaluationTriggered ? 'APPROVAL_TRIGGERED_BY_NEGOTIATION' : 'NEGOTIATION_ACCEPTED',
      newValue: {
        action: 'ACCEPT',
        newStatus: nextQuotationStatus,
        reEvaluationTriggered
      },
      reason: reEvaluationTriggered ? reEvaluationReason : 'Accepted by sales representative'
    }
  });

  return res.status(200).json(
    new ApiResponse(200, {
      status: 'ACCEPTED',
      quotationStatus: nextQuotationStatus,
      reEvaluationTriggered,
      reEvaluationReason: reEvaluationTriggered ? reEvaluationReason : null
    }, reEvaluationTriggered
      ? 'Counter-offer accepted. Discount exceeds ceiling; quotation automatically submitted for approval.'
      : 'Counter-offer accepted and quotation updated successfully.'
    )
  );
});

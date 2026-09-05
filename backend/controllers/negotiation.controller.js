import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { ApiResponse } from '../utils/api-response.js';
import { recalculateQuotation } from '../services/quotationPricing.service.js';
import { routeQuotationForApproval } from '../services/approvalRouting.service.js';
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

  // B. Apply the accepted counter-offer to the quotation's lines.
  //
  // A customer may counter on ONE line ("this service is too expensive") or on
  // the DEAL as a whole ("give us a better price"). §9 step 7 describes the
  // second, so an order-level counter must apply too — this used to be gated on
  // request.quotationLineId, which meant a deal-level counter was marked
  // ACCEPTED and then applied to nothing at all.
  let appliedTo = [];

  if (request.proposedDiscountPercent !== null && request.proposedDiscountPercent !== undefined) {
    const newDiscount = Number(request.proposedDiscountPercent);

    if (request.quotationLineId) {
      await prisma.quotationLine.update({
        where: { id: request.quotationLineId },
        data: { discountPercent: newDiscount },
      });
      appliedTo = [request.quotationLineId];
    } else {
      // Deal-level counter: apply to every line on the quotation.
      const lines = await prisma.quotationLine.findMany({
        where: { quotationId: quotation.id },
        select: { id: true },
      });
      await prisma.quotationLine.updateMany({
        where: { quotationId: quotation.id },
        data: { discountPercent: newDiscount },
      });
      appliedTo = lines.map((l) => l.id);
    }
  }

  if (request.proposedQuantity !== null && request.proposedQuantity !== undefined && request.quotationLineId) {
    await prisma.quotationLine.update({
      where: { id: request.quotationLineId },
      data: { quantity: Number(request.proposedQuantity) },
    });
  }

  // C. Re-price and re-score through the SHARED engine.
  //
  // This block used to recompute everything by hand: it set blendedScore and
  // worstLineOverage to the same single number, hardcoded 18% tax regardless of
  // each line's taxRate, ignored the configured approval thresholds, and — worst
  // of all — created an approval cycle with NO STEPS, so nobody could ever act
  // on it and the quotation was stuck in PENDING_APPROVAL forever.
  const rescored = await recalculateQuotation(quotation.id);

  // D. Route it. Same service the rep's own submit uses, so a counter-offer and
  // a rep submission can never be judged by different rules.
  const routed = await routeQuotationForApproval({
    quotationId: quotation.id,
    actorUserId: userId || null,
    triggerSource: 'CUSTOMER_NEGOTIATION',
  });

  const reEvaluationTriggered = !routed.autoApproved;
  const reEvaluationReason = reEvaluationTriggered
    ? `Accepted terms score blended=${routed.evaluation.blendedScore}, worst line ${routed.evaluation.worstLineOverage} pts over ceiling; routed to ${routed.evaluation.requiredApprovalSteps
        .map((x) => x.roleCode)
        .join(' then ')}`
    : 'Accepted terms remain within every configured ceiling';

  const nextQuotationStatus = routed.status;

  // E. Log the outcome.
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
        reEvaluationTriggered,
        appliedToLines: appliedTo.length,
        blendedScore: routed.evaluation.blendedScore,
        worstLineOverage: routed.evaluation.worstLineOverage,
      },
      reason: reEvaluationReason,
    },
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
